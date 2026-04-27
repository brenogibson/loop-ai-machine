import * as Tone from "tone";
import { Mp3Encoder } from "@breezystack/lamejs";
import { STEPS_PER_BAR, type Pattern } from "./pattern";
import type { Catalog } from "@/lib/samples/catalog";
import { surpriseAudioEntries } from "./surprise-registry";
import { createSurpriseSource } from "./surprise";
import type { SurpriseStyle } from "@/lib/claude/surprise-tool";

export type RenderOptions = {
  pattern: Pattern;
  catalog: Catalog;
  bars?: number; // default 2
};

// Offline-render the current loop into an AudioBuffer, then encode to MP3.
// All audio nodes (Players, PitchShift, reverb, etc.) must be recreated inside
// the Tone.Offline callback — the regular live-context nodes don't carry over.
export async function renderLoopToMp3(opts: RenderOptions): Promise<Blob> {
  const bars = opts.bars ?? 2;
  const secondsPerBeat = 60 / opts.pattern.bpm;
  const secondsPerStep = secondsPerBeat / 4;
  const totalSeconds = bars * STEPS_PER_BAR * secondsPerStep;

  // Snapshot surprise audio (base64) for every surprise track in the pattern.
  // The registry is mutable and we want the export to match what the user sees.
  const surpriseAudio = new Map<string, string>();
  for (const [sampleId, base64] of surpriseAudioEntries()) {
    const used = opts.pattern.tracks.some((t) => t.sampleId === sampleId);
    if (used) surpriseAudio.set(sampleId, base64);
  }

  const sampleMap = Object.fromEntries(
    opts.catalog.samples.map((s) => [s.id, s.url]),
  );

  const toneBuffer = await Tone.Offline(async ({ transport }) => {
    // Load plain samples.
    const players = new Tone.Players({ urls: sampleMap }).toDestination();
    await Tone.loaded();

    // Build surprise sources in this offline context.
    const surpriseSources = new Map<
      string,
      Awaited<ReturnType<typeof createSurpriseSource>>
    >();
    for (const track of opts.pattern.tracks) {
      if (track.meta?.kind !== "surprise") continue;
      const base64 = surpriseAudio.get(track.sampleId);
      if (!base64) continue;
      const source = await createSurpriseSource({
        sampleId: track.sampleId,
        phrase: track.meta.phrase,
        style: track.meta.style as SurpriseStyle,
        audioBase64: base64,
      });
      surpriseSources.set(track.sampleId, source);
    }

    // Make sure every player's buffer finished loading before the transport
    // starts — otherwise the Sequence callback can fire on an unloaded player
    // and drop the first hits.
    await Tone.loaded();

    transport.bpm.value = opts.pattern.bpm;
    transport.swing = opts.pattern.swing;

    const stepIndices = Array.from({ length: STEPS_PER_BAR }, (_, i) => i);
    const sequence = new Tone.Sequence<number>(
      (time, stepIndex) => {
        for (const track of opts.pattern.tracks) {
          if (!track.steps[stepIndex]) continue;
          if (track.meta?.kind === "surprise") {
            const src = surpriseSources.get(track.sampleId);
            if (!src || !src.player.loaded) continue;
            src.player.volume.value = track.volumeDb + (src.makeupDb ?? 0);
            try {
              src.player.start(time);
            } catch {
              // skip
            }
            continue;
          }
          const player = players.player(track.sampleId);
          if (!player) continue;
          player.volume.value = track.volumeDb;
          player.start(time);
        }
      },
      stepIndices,
      "16n",
    );
    sequence.start(0);
    transport.start();
  }, totalSeconds);

  return encodeMp3(toneBuffer.get() as AudioBuffer);
}

function encodeMp3(audio: AudioBuffer): Blob {
  const channels = Math.min(2, audio.numberOfChannels);
  const sampleRate = audio.sampleRate;
  const encoder = new Mp3Encoder(channels, sampleRate, 192);

  const left = floatTo16(audio.getChannelData(0));
  const right =
    channels > 1 ? floatTo16(audio.getChannelData(1)) : undefined;

  const blockSize = 1152; // MPEG-1 Layer III frame size
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += blockSize) {
    const leftChunk = left.subarray(i, i + blockSize);
    const rightChunk = right?.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(leftChunk, rightChunk);
    if (encoded.length > 0) chunks.push(new Uint8Array(encoded));
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(new Uint8Array(tail));

  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
}

function floatTo16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}
