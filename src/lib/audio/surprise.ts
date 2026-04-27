import * as Tone from "tone";
import type { SurpriseStyle } from "@/lib/claude/surprise-tool";

// Represents the audio resource for a surprise track. Volume + steps live on
// the Pattern.Track entry; this object owns only the Tone.js nodes needed to
// play the processed sample.
export type SurpriseTrackSource = {
  sampleId: string;
  phrase: string;
  style: SurpriseStyle;
  player: Tone.Player;
  effects: Tone.ToneAudioNode[];
  startOffset: number;
  makeupDb: number;
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

async function decodeBase64ToAudioBuffer(base64: string): Promise<AudioBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ctx = Tone.getContext().rawContext;
  return await ctx.decodeAudioData(bytes.buffer.slice(0));
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
      const reverb = new Tone.Freeverb({ roomSize: 0.6, dampening: 5000, wet: 0.3 });
      return {
        input: reverb,
        output: reverb,
        nodes: [reverb],
        playerOptions: { reverse: true },
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
  }
}

export async function createSurpriseSource(input: {
  sampleId: string;
  phrase: string;
  style: SurpriseStyle;
  audioBase64: string;
}): Promise<SurpriseTrackSource> {
  const rawBuffer = await decodeBase64ToAudioBuffer(input.audioBase64);
  const silenceOffset = detectSoundStart(rawBuffer);
  // For reverse playback, silence would end up at the end — not a timing issue,
  // but we still trim so the reversed audio starts on content from the first frame.
  // Trimming the buffer (vs using player offset) also lets reverse behave correctly.
  const useBuffer = silenceOffset > 0.01
    ? trimBufferLeading(rawBuffer, silenceOffset)
    : rawBuffer;
  const toneBuffer = new Tone.ToneAudioBuffer(useBuffer);
  await toneBuffer.loaded;

  const chain = buildEffectChain(input.style);
  const player = new Tone.Player({
    url: toneBuffer,
    reverse: chain.playerOptions?.reverse ?? false,
    playbackRate: chain.playerOptions?.playbackRate ?? 1,
    fadeIn: 0.005,
    fadeOut: 0.02,
  });
  // In offline rendering the Sequence callback can fire before the player's
  // internal buffer is marked loaded, which makes the engine's `player.loaded`
  // guard skip the very first step. Wait until loaded:true is set.
  await Tone.loaded();
  player.connect(chain.input);
  chain.output.toDestination();

  return {
    sampleId: input.sampleId,
    phrase: input.phrase,
    style: input.style,
    player,
    effects: chain.nodes,
    startOffset: silenceOffset,
    makeupDb: chain.makeupDb ?? 0,
    dispose: () => {
      try {
        player.stop();
      } catch {
        // already stopped
      }
      player.dispose();
      for (const n of chain.nodes) n.dispose();
    },
  };
}
