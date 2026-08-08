import * as Tone from "tone";
import type { SynthInstrument } from "./pattern";
import type { SynthPatch } from "./styles";

// One playable synth voice for an instrument, built from a declarative
// per-style patch (see styles.ts). PolySynth so multiple rows of the same
// instrument can sound at once. Built the same way live and inside
// Tone.Offline, so export matches playback.
export type SynthVoice = {
  instrument: SynthInstrument;
  synth: Tone.PolySynth;
  output: Tone.ToneAudioNode;
  triggerNote: (note: string, time: number, volumeDb: number) => void;
  dispose: () => void;
};

export function createSynthVoice(
  instrument: SynthInstrument,
  patch: SynthPatch,
): SynthVoice {
  const synth =
    patch.kind === "mono"
      ? new Tone.PolySynth(Tone.MonoSynth, patch.options)
      : patch.kind === "fm"
        ? new Tone.PolySynth(Tone.FMSynth, patch.options)
        : new Tone.PolySynth(Tone.Synth, patch.options);

  // Build the post-FX chain from the patch description.
  const extra: Tone.ToneAudioNode[] = [];
  let output: Tone.ToneAudioNode = synth;
  for (const fx of patch.fx ?? []) {
    let node: Tone.ToneAudioNode;
    switch (fx.type) {
      case "chorus":
        node = new Tone.Chorus({ frequency: 1.2, depth: 0.4, wet: fx.wet }).start();
        break;
      case "freeverb":
        node = new Tone.Freeverb({
          roomSize: fx.roomSize,
          dampening: fx.dampening,
          wet: fx.wet,
        });
        break;
      case "filter":
        node = new Tone.Filter({ type: "lowpass", frequency: fx.frequency });
        break;
      case "distortion":
        node = new Tone.Distortion({ distortion: fx.distortion, wet: fx.wet });
        break;
    }
    output.connect(node);
    output = node;
    extra.push(node);
  }

  const triggerNote = (note: string, time: number, volumeDb: number) => {
    synth.volume.value = volumeDb;
    try {
      synth.triggerAttackRelease(note, patch.noteDuration, time);
    } catch {
      // overlapping retrigger; skip
    }
  };

  return {
    instrument,
    synth,
    output,
    triggerNote,
    dispose: () => {
      synth.dispose();
      for (const n of extra) n.dispose();
    },
  };
}
