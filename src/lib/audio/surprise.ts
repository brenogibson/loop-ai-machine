import * as Tone from "tone";
import type { SurpriseStyle } from "@/lib/claude/surprise-tool";

// Represents the audio resource for a surprise track. Volume + steps live on
// the Pattern.Track entry; this object owns only the Tone.js nodes needed to
// play the processed sample.
export type SurpriseTrackSource = {
  sampleId: string;
  phrase: string;
  style: SurpriseStyle;
  // GrainPlayer (not Player) so we can time-stretch the phrase to fit the bar
  // without altering pitch. Granular playback works live and in Tone.Offline.
  // For "chopped" this is the first slice; all slices live in `players`.
  player: Tone.GrainPlayer;
  players: Tone.GrainPlayer[];
  effects: Tone.ToneAudioNode[];
  // End of this source's effect chain. NOT connected anywhere by default — the
  // caller routes it (live → master bus; offline export → destination).
  output: Tone.ToneAudioNode;
  startOffset: number;
  makeupDb: number;
  // Fire the sound for a given step. Default sources play the whole phrase on
  // any active step; "chopped" plays the slice mapped to that step.
  trigger: (time: number, stepIndex: number, volumeDb: number) => void;
  dispose: () => void;
};

// Detect first sample above -40 dBFS (≈ 0.01 linear). Polly generative voices
// often start with 20-150ms of room tone before the phoneme attack, which
// makes the phrase feel late against a kick on the same step.
const SILENCE_THRESHOLD = 0.01;
const LOOKAHEAD_FRAMES = 32; // ignore stray single-sample clicks

function detectSoundStart(buffer: AudioBuffer): number {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  for (let i = 0; i < length; i++) {
    let max = 0;
    for (let c = 0; c < channels; c++) {
      const v = Math.abs(buffer.getChannelData(c)[i]);
      if (v > max) max = v;
    }
    if (max > SILENCE_THRESHOLD) {
      // confirm it's sustained, not a click
      let sustained = 0;
      for (let j = i; j < Math.min(i + LOOKAHEAD_FRAMES, length); j++) {
        for (let c = 0; c < channels; c++) {
          if (Math.abs(buffer.getChannelData(c)[j]) > SILENCE_THRESHOLD) {
            sustained++;
            break;
          }
        }
      }
      if (sustained >= LOOKAHEAD_FRAMES / 2) {
        return Math.max(0, i / sampleRate - 0.005); // 5ms pre-roll
      }
    }
  }
  return 0;
}

// Choose a playbackRate that stretches/compresses the phrase to land on a whole
// number of beats, so it "breathes" in time with the loop instead of drifting.
// Clamped to a musical range — beyond ~±30% granular stretch starts to smear,
// and we'd rather let a phrase be slightly loose than sound artificial.
const MIN_RATE = 0.8; // slowest we'll stretch (phrase shorter than its slot)
const MAX_RATE = 1.35; // fastest we'll compress (phrase longer than its slot)

function fitToBeatsRate(durationSec: number, bpm: number): number {
  if (!bpm || durationSec <= 0) return 1;
  const secPerBeat = 60 / bpm;
  // Candidate slots: 1, 2, 3, 4 beats. Pick the one needing the least stretch.
  let best = 1;
  let bestRate = Infinity;
  for (const beats of [1, 2, 3, 4]) {
    const slot = beats * secPerBeat;
    const rate = durationSec / slot; // >1 means we must speed up to fit
    if (Math.abs(Math.log(rate)) < Math.abs(Math.log(bestRate))) {
      bestRate = rate;
      best = beats;
    }
  }
  void best;
  return Math.max(MIN_RATE, Math.min(MAX_RATE, bestRate));
}

async function decodeBase64ToAudioBuffer(base64: string): Promise<AudioBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ctx = Tone.getContext().rawContext;
  return await ctx.decodeAudioData(bytes.buffer.slice(0));
}

// Build [forward | reverse] in a single buffer: the phrase plays normally and
// then immediately rewinds back into itself. The junction sample is shared
// (last frame of forward == first frame of reverse) so there's no click, and
// the tail lands on the phrase's onset (near silence). Creates a palindromic
// "echo" that reads as a deliberate effect rather than a backwards mess.
function mirrorForwardReverse(buffer: AudioBuffer): AudioBuffer {
  const ctx = Tone.getContext().rawContext;
  const n = buffer.length;
  const out = ctx.createBuffer(buffer.numberOfChannels, n * 2, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < n; i++) {
      dst[i] = src[i]; // forward
      dst[n + i] = src[n - 1 - i]; // reverse
    }
  }
  return out;
}

// Split a buffer into `count` equal slices, each with short fades so the chops
// don't click. Used by "chopped": each slice ≈ one word, fired on its own step.
function sliceBuffer(buffer: AudioBuffer, count: number): AudioBuffer[] {
  const ctx = Tone.getContext().rawContext;
  const sliceLen = Math.floor(buffer.length / count);
  if (sliceLen <= 0) return [buffer];
  const fadeFrames = Math.min(Math.floor(buffer.sampleRate * 0.006), sliceLen >> 1);
  const slices: AudioBuffer[] = [];
  for (let s = 0; s < count; s++) {
    const start = s * sliceLen;
    const len = s === count - 1 ? buffer.length - start : sliceLen;
    const slice = ctx.createBuffer(buffer.numberOfChannels, len, buffer.sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const src = buffer.getChannelData(c);
      const dst = slice.getChannelData(c);
      for (let i = 0; i < len; i++) {
        let g = 1;
        if (i < fadeFrames) g = i / fadeFrames;
        else if (i > len - fadeFrames) g = Math.max(0, (len - i) / fadeFrames);
        dst[i] = src[start + i] * g;
      }
    }
    slices.push(slice);
  }
  return slices;
}

function trimBufferLeading(buffer: AudioBuffer, offsetSec: number): AudioBuffer {
  if (offsetSec <= 0) return buffer;
  const ctx = Tone.getContext().rawContext;
  const startFrame = Math.floor(offsetSec * buffer.sampleRate);
  const newLength = buffer.length - startFrame;
  if (newLength <= 0) return buffer;
  const trimmed = ctx.createBuffer(
    buffer.numberOfChannels,
    newLength,
    buffer.sampleRate,
  );
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = trimmed.getChannelData(c);
    for (let i = 0; i < newLength; i++) dst[i] = src[startFrame + i];
  }
  return trimmed;
}

type ChainSpec = {
  input: Tone.ToneAudioNode;
  output: Tone.ToneAudioNode;
  nodes: Tone.ToneAudioNode[];
  playerOptions?: { playbackRate?: number; reverse?: boolean };
  // Optional pre-player buffer rewrite (e.g. forward+reverse mirror). Applied
  // before the Tone.Player is created, so it works live and in offline export.
  transformBuffer?: (buffer: AudioBuffer) => AudioBuffer;
  // When set, the phrase is cut into word-sized slices that fire on consecutive
  // grid steps instead of playing whole on one step ("chopped").
  chop?: boolean;
  makeupDb?: number; // compensate for quiet effects
};

function buildEffectChain(style: SurpriseStyle): ChainSpec {
  switch (style) {
    case "robotic": {
      const pitch = new Tone.PitchShift({ pitch: -4, windowSize: 0.1 });
      const crush = new Tone.BitCrusher({ bits: 4 });
      const dist = new Tone.Distortion({ distortion: 0.4, wet: 0.6 });
      pitch.connect(crush);
      crush.connect(dist);
      return { input: pitch, output: dist, nodes: [pitch, crush, dist] };
    }
    case "melodic": {
      // Use Freeverb (algorithmic) not Reverb (convolutional) — Freeverb works
      // both live and inside Tone.Offline without needing pre-generated IRs.
      const chorus = new Tone.Chorus({ frequency: 1.5, depth: 0.8, wet: 0.7 }).start();
      const reverb = new Tone.Freeverb({ roomSize: 0.8, dampening: 3000, wet: 0.6 });
      chorus.connect(reverb);
      return {
        input: chorus,
        output: reverb,
        nodes: [chorus, reverb],
        makeupDb: 3,
      };
    }
    case "reverse": {
      // Phrase plays forward, then immediately rewinds into itself — a
      // palindrome echo. Light reverb glues the two halves together.
      const reverb = new Tone.Freeverb({ roomSize: 0.6, dampening: 5000, wet: 0.25 });
      return {
        input: reverb,
        output: reverb,
        nodes: [reverb],
        transformBuffer: mirrorForwardReverse,
      };
    }
    case "stutter": {
      const delay = new Tone.FeedbackDelay({
        delayTime: "32n",
        feedback: 0.55,
        wet: 0.7,
      });
      return { input: delay, output: delay, nodes: [delay] };
    }
    case "pitched_up": {
      const pitch = new Tone.PitchShift({ pitch: 7 });
      return {
        input: pitch,
        output: pitch,
        nodes: [pitch],
        makeupDb: 4, // pitch-up loses body
      };
    }
    case "pitched_down": {
      const pitch = new Tone.PitchShift({ pitch: -7 });
      const reverb = new Tone.Freeverb({ roomSize: 0.7, dampening: 3000, wet: 0.3 });
      pitch.connect(reverb);
      return {
        input: pitch,
        output: reverb,
        nodes: [pitch, reverb],
        makeupDb: 7,
      };
    }
    case "telephone": {
      const hp = new Tone.Filter({ type: "highpass", frequency: 500, Q: 1 });
      const lp = new Tone.Filter({ type: "lowpass", frequency: 2500, Q: 1 });
      const dist = new Tone.Distortion({ distortion: 0.2, wet: 0.3 });
      hp.connect(lp);
      lp.connect(dist);
      return {
        input: hp,
        output: dist,
        nodes: [hp, lp, dist],
        makeupDb: 5, // narrow bandpass eats energy
      };
    }
    case "megaphone": {
      // Stadium-MC / hype: warm overdrive + compression for punch, but keep the
      // low-mids (unlike telephone) so it stays big and intelligible.
      const hp = new Tone.Filter({ type: "highpass", frequency: 180, Q: 0.7 });
      const dist = new Tone.Distortion({ distortion: 0.45, wet: 0.55 });
      const comp = new Tone.Compressor({ threshold: -22, ratio: 6, attack: 0.003, release: 0.12 });
      hp.connect(dist);
      dist.connect(comp);
      return {
        input: hp,
        output: comp,
        nodes: [hp, dist, comp],
        makeupDb: 2,
      };
    }
    case "slice": {
      // BPM-synced rhythmic repeat: "16n" locks every echo to the grid, so it
      // reads as a deliberate glitch instead of the old stutter's mushy blur.
      const delay = new Tone.FeedbackDelay({
        delayTime: "16n",
        feedback: 0.42,
        wet: 0.5,
      });
      return { input: delay, output: delay, nodes: [delay] };
    }
    case "dub": {
      // Dub/tape echo: longer dotted-eighth repeats, darkened by a lowpass so
      // the tail dissolves into a hypnotic haze without smearing the words.
      const delay = new Tone.FeedbackDelay({
        delayTime: "8n.",
        feedback: 0.62,
        wet: 0.45,
      });
      const lp = new Tone.Filter({ type: "lowpass", frequency: 2200, Q: 0.5 });
      delay.connect(lp);
      return { input: delay, output: lp, nodes: [delay, lp] };
    }
    case "harmony": {
      // Larger-than-life choir: dry voice + an octave up + a fifth up, summed in
      // parallel. PitchShift runs both live and offline.
      const inGain = new Tone.Gain(1);
      const outGain = new Tone.Gain(1);
      const octave = new Tone.PitchShift({ pitch: 12, wet: 1 });
      const fifth = new Tone.PitchShift({ pitch: 7, wet: 1 });
      inGain.connect(outGain); // dry
      inGain.connect(octave);
      inGain.connect(fifth);
      octave.connect(outGain);
      fifth.connect(outGain);
      return {
        input: inGain,
        output: outGain,
        nodes: [inGain, octave, fifth, outGain],
        makeupDb: 2,
      };
    }
    case "chopped": {
      // Phrase is cut into word-sized slices (see createSurpriseSource) that
      // fire on consecutive 1/16 steps — each word locked to the grid. A touch
      // of short reverb keeps the chops from sounding too dry/clinical.
      const reverb = new Tone.Freeverb({ roomSize: 0.3, dampening: 4000, wet: 0.18 });
      return { input: reverb, output: reverb, nodes: [reverb], chop: true };
    }
    case "radio_dj": {
      // FM-announcer: wider band than telephone, compressed hard for punch,
      // with a presence boost — crisp and dry, sits on top of the beat.
      const hp = new Tone.Filter({ type: "highpass", frequency: 120, Q: 0.7 });
      const presence = new Tone.Filter({ type: "peaking", frequency: 3200, Q: 1, gain: 6 });
      const comp = new Tone.Compressor({ threshold: -24, ratio: 8, attack: 0.002, release: 0.1 });
      hp.connect(presence);
      presence.connect(comp);
      return {
        input: hp,
        output: comp,
        nodes: [hp, presence, comp],
        makeupDb: 3,
      };
    }
    case "vinyl": {
      // Dusty record: gentle bit reduction + narrowed band + a slow ~0.5Hz
      // "wow" wobble. Dry and nostalgic, no tail to smear into the beat.
      const crush = new Tone.BitCrusher({ bits: 6 });
      const lp = new Tone.Filter({ type: "lowpass", frequency: 6500, Q: 0.5 });
      const hp = new Tone.Filter({ type: "highpass", frequency: 200, Q: 0.5 });
      const wow = new Tone.Tremolo({ frequency: 0.5, depth: 0.3, wet: 1 }).start();
      crush.connect(lp);
      lp.connect(hp);
      hp.connect(wow);
      return {
        input: crush,
        output: wow,
        nodes: [crush, lp, hp, wow],
        makeupDb: 3,
      };
    }
  }
}

// Estimate syllable count for "chopped" so each chop ≈ one syllable on the grid.
// Counts vowel groups (works well enough for PT/EN), clamped 2-8 (a bar is 16
// steps and beyond ~8 the chops get too short to be intelligible).
function syllableEstimate(phrase: string): number {
  const groups = phrase
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .match(/[aeiouy]+/g);
  const n = groups ? groups.length : phrase.trim().split(/\s+/).length;
  return Math.max(2, Math.min(8, n));
}

export async function createSurpriseSource(input: {
  sampleId: string;
  phrase: string;
  style: SurpriseStyle;
  audioBase64: string;
  bpm?: number;
}): Promise<SurpriseTrackSource> {
  const rawBuffer = await decodeBase64ToAudioBuffer(input.audioBase64);
  const silenceOffset = detectSoundStart(rawBuffer);
  // Trim leading room tone so the phrase attack lands exactly on its step.
  const trimmed = silenceOffset > 0.01
    ? trimBufferLeading(rawBuffer, silenceOffset)
    : rawBuffer;

  const chain = buildEffectChain(input.style);
  // Optional buffer rewrite (e.g. forward+reverse mirror) happens after trim so
  // the mirror operates on clean content, not on leading silence.
  const useBuffer = chain.transformBuffer
    ? chain.transformBuffer(trimmed)
    : trimmed;
  const toneBuffer = new Tone.ToneAudioBuffer(useBuffer);
  await toneBuffer.loaded;

  // Stretch the phrase to fit a whole number of beats (level-1 rhythmic fit).
  // GrainPlayer changes duration without shifting pitch. The effect's own rate
  // (e.g. none now that reverse mirrors the buffer) multiplies on top.
  const beatRate = input.bpm ? fitToBeatsRate(useBuffer.duration, input.bpm) : 1;
  const effectRate = chain.playerOptions?.playbackRate ?? 1;

  // Grain settings tuned for speech: small grains keep consonants crisp,
  // moderate overlap avoids the "fluttery" granular artifact on vowels and
  // crossfades grain boundaries (so no clicks — GrainPlayer has no fade opts).
  const makePlayer = (buf: Tone.ToneAudioBuffer | AudioBuffer) =>
    new Tone.GrainPlayer({
      url: buf instanceof Tone.ToneAudioBuffer ? buf : new Tone.ToneAudioBuffer(buf),
      reverse: chain.playerOptions?.reverse ?? false,
      playbackRate: beatRate * effectRate,
      grainSize: 0.12,
      overlap: 0.08,
    });

  // Build the player(s). Default: one player for the whole phrase. Chopped: one
  // player per word-sized slice, fired on consecutive steps by `trigger`.
  const sliceCount = chain.chop ? syllableEstimate(input.phrase) : 1;
  const players: Tone.GrainPlayer[] = chain.chop
    ? sliceBuffer(useBuffer, sliceCount).map(makePlayer)
    : [makePlayer(toneBuffer)];

  // In offline rendering the Sequence callback can fire before the player's
  // internal buffer is marked loaded, which makes the engine's `player.loaded`
  // guard skip the very first step. Wait until loaded:true is set.
  await Tone.loaded();
  for (const p of players) p.connect(chain.input);

  // Spacing between chopped slices. Each slice plays at its natural duration
  // (buffer length ÷ playbackRate); if we spaced them tighter than that, slices
  // would overlap and smear together. So we give each slice as many 1/16 steps
  // as it needs (snapped up to the grid). Falls back to 120bpm if unknown.
  const secPerStep = 60 / (input.bpm ?? 120) / 4;
  const sliceDuration =
    sliceCount > 1
      ? useBuffer.duration / (beatRate * effectRate) / sliceCount
      : 0;
  const stepsPerSlice = Math.max(1, Math.ceil(sliceDuration / secPerStep));
  const sliceSpacing = stepsPerSlice * secPerStep;
  const trigger = (time: number, _stepIndex: number, volumeDb: number) => {
    const gain = volumeDb + (chain.makeupDb ?? 0);
    if (!chain.chop) {
      const p = players[0];
      if (!p.loaded) return;
      p.volume.value = gain;
      try {
        p.start(time);
      } catch {
        // mid-playback; skip
      }
      return;
    }
    // Chopped: from this active step, lay each slice on its own grid slot and
    // gate it to stop right before the next slice starts — so the phrase is
    // spelled out one chop at a time with no two chops ever sounding at once.
    players.forEach((p, i) => {
      if (!p.loaded) return;
      p.volume.value = gain;
      const at = time + i * sliceSpacing;
      try {
        p.start(at).stop(at + sliceSpacing);
      } catch {
        // mid-playback; skip
      }
    });
  };

  return {
    sampleId: input.sampleId,
    phrase: input.phrase,
    style: input.style,
    player: players[0],
    players,
    effects: chain.nodes,
    output: chain.output,
    startOffset: silenceOffset,
    makeupDb: chain.makeupDb ?? 0,
    trigger,
    dispose: () => {
      for (const p of players) {
        try {
          p.stop();
        } catch {
          // already stopped
        }
        p.dispose();
      }
      for (const n of chain.nodes) n.dispose();
    },
  };
}
