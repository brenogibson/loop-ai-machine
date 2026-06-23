import * as Tone from "tone";
import type { SynthInstrument } from "./pattern";

// One playable synth voice for an instrument. PolySynth so multiple rows of the
// same instrument (e.g. a chord, or fast overlapping notes) can sound at once.
// Built the same way live and inside Tone.Offline, so export matches playback.
export type SynthVoice = {
  instrument: SynthInstrument;
  synth: Tone.PolySynth;
  output: Tone.ToneAudioNode;
  triggerNote: (note: string, time: number, volumeDb: number) => void;
  dispose: () => void;
};

// Note length per instrument — bass plays tight stabs, lead a touch longer.
const NOTE_DURATION: Record<SynthInstrument, string> = {
  bass: "16n",
  lead: "8n",
};

export function createSynthVoice(instrument: SynthInstrument): SynthVoice {
  let synth: Tone.PolySynth;
  let output: Tone.ToneAudioNode;
  const extra: Tone.ToneAudioNode[] = [];

  if (instrument === "bass") {
    // Round, punchy sub-ish bass: sawtooth into a lowpass with a quick envelope.
    synth = new Tone.PolySynth(Tone.MonoSynth, {
      oscillator: { type: "sawtooth" },
      filter: { type: "lowpass", Q: 1 },
      filterEnvelope: {
        attack: 0.005,
        decay: 0.12,
        sustain: 0.3,
        release: 0.2,
        baseFrequency: 120,
        octaves: 2.6,
      },
      envelope: { attack: 0.005, decay: 0.18, sustain: 0.4, release: 0.2 },
    });
    output = synth;
  } else {
    // Bright, slightly detuned lead with a little stereo space.
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.3 },
    });
    const chorus = new Tone.Chorus({ frequency: 1.2, depth: 0.4, wet: 0.3 }).start();
    const reverb = new Tone.Freeverb({ roomSize: 0.5, dampening: 4000, wet: 0.22 });
    synth.connect(chorus);
    chorus.connect(reverb);
    output = reverb;
    extra.push(chorus, reverb);
  }

  const dur = NOTE_DURATION[instrument];
  const triggerNote = (note: string, time: number, volumeDb: number) => {
    synth.volume.value = volumeDb;
    try {
      synth.triggerAttackRelease(note, dur, time);
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
