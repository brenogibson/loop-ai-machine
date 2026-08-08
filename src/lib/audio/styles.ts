import * as Tone from "tone";
import type { SynthInstrument } from "./pattern";
import type { ScaleName } from "./scale";

// Full sonic identity per style — the reason picking "Trap" sounds different
// from "Funk" beyond the step pattern. Four levers per style:
//   1. color   — a master tint chain every live source passes through
//   2. texture — a continuous synthesized background bed (no samples)
//   3. synth   — bass/lead patches (consumed by createSynthVoice)
//   4. identity — default key/scale/density for the riff generators
//
// createColor()/createTexture() are FACTORIES: they build Tone nodes at call
// time, so they bind to whichever context is active (live or Tone.Offline) —
// same trick createSynthVoice relies on for MP3 export.

export type StyleId = "funk" | "trap" | "samba" | "dnb";

export type StyleColor = {
  input: Tone.ToneAudioNode;
  output: Tone.ToneAudioNode;
  dispose: () => void;
};

export type StyleTexture = {
  output: Tone.ToneAudioNode;
  start: (time?: number) => void;
  stop: () => void;
  dispose: () => void;
};

// Declarative synth patch, resolved by createSynthVoice. `kind` picks the
// PolySynth voice class (mono = MonoSynth, basic = Synth, fm = FMSynth);
// fx describe the post chain.
export type SynthPatch = {
  kind: "mono" | "basic" | "fm";
  options: Record<string, unknown>;
  noteDuration: string;
  fx?: Array<
    | { type: "chorus"; wet: number }
    | { type: "freeverb"; roomSize: number; dampening: number; wet: number }
    | { type: "filter"; frequency: number }
    | { type: "distortion"; distortion: number; wet: number }
  >;
};

export type StyleConfig = {
  label: string;
  createColor: () => StyleColor;
  createTexture: () => StyleTexture;
  synth: Record<SynthInstrument, SynthPatch>;
  identity: {
    roots: string[];
    scales: ScaleName[];
    bassHits: [number, number]; // min/max onsets for generateBassline
    leadDensity: "sparse" | "normal" | "busy";
    // Octave shift applied to the bass register (and its transposition cap).
    // D&B needs +1: its dark reese patch at octave 1-2 is pure sub-rumble,
    // inaudible on small speakers.
    bassOctaveShift?: number;
  };
};

// Small helper: filtered-noise texture with a fixed output gain. All textures
// sit far below the mix (−26..−36 dB) — they're felt more than heard.
function noiseTexture(build: () => {
  nodes: Tone.ToneAudioNode[];
  noise: Tone.Noise;
  output: Tone.ToneAudioNode;
  extras?: Array<{ start: () => void }>;
}): StyleTexture {
  const { nodes, noise, output, extras } = build();
  return {
    output,
    start: (time?: number) => {
      try {
        noise.start(time);
        extras?.forEach((e) => e.start());
      } catch {
        // already started
      }
    },
    stop: () => {
      try {
        noise.stop();
      } catch {
        // already stopped
      }
    },
    dispose: () => {
      for (const n of nodes) n.dispose();
    },
  };
}

export const STYLES: Record<StyleId, StyleConfig> = {
  funk: {
    label: "Funk",
    createColor: () => {
      // Neutral but punchy: light EQ smile + glue compression.
      const eq = new Tone.EQ3({ low: 1.5, mid: 1, high: 0.5 });
      const comp = new Tone.Compressor({
        threshold: -18,
        ratio: 3,
        attack: 0.01,
        release: 0.15,
      });
      eq.connect(comp);
      return { input: eq, output: comp, dispose: () => { eq.dispose(); comp.dispose(); } };
    },
    createTexture: () =>
      noiseTexture(() => {
        // Tape hiss with a slow flutter.
        const noise = new Tone.Noise("pink");
        const hp = new Tone.Filter({ type: "highpass", frequency: 4000 });
        const gain = new Tone.Gain(0.018);
        const lfo = new Tone.LFO({ frequency: 0.3, min: 0.014, max: 0.022 });
        noise.connect(hp);
        hp.connect(gain);
        lfo.connect(gain.gain);
        return { nodes: [noise, hp, gain, lfo], noise, output: gain, extras: [lfo] };
      }),
    synth: {
      bass: {
        kind: "mono",
        options: {
          oscillator: { type: "square" },
          filter: { type: "lowpass", Q: 1 },
          filterEnvelope: {
            attack: 0.002, decay: 0.09, sustain: 0.2, release: 0.15,
            baseFrequency: 150, octaves: 3,
          },
          envelope: { attack: 0.003, decay: 0.15, sustain: 0.3, release: 0.15 },
        },
        noteDuration: "16n",
      },
      lead: {
        kind: "basic",
        options: {
          oscillator: { type: "square" },
          envelope: { attack: 0.005, decay: 0.15, sustain: 0.2, release: 0.2 },
        },
        noteDuration: "8n",
        fx: [{ type: "chorus", wet: 0.2 }],
      },
    },
    identity: {
      roots: ["C", "D", "E", "G"],
      scales: ["dorian"],
      bassHits: [7, 8],
      leadDensity: "normal",
    },
  },

  trap: {
    label: "Trap",
    createColor: () => {
      // Sub-boosted and dark; make-down gain guards the +4dB shelf over the
      // pattern's already-hot kick_808.
      const eq = new Tone.EQ3({ low: 4, lowFrequency: 200, mid: -1, high: -2 });
      const lp = new Tone.Filter({ type: "lowpass", frequency: 12000, Q: 0.5 });
      const trim = new Tone.Gain(0.85);
      eq.connect(lp);
      lp.connect(trim);
      return {
        input: eq, output: trim,
        dispose: () => { eq.dispose(); lp.dispose(); trim.dispose(); },
      };
    },
    createTexture: () =>
      noiseTexture(() => {
        // Dark rumble breathing very slowly.
        const noise = new Tone.Noise("brown");
        const lp = new Tone.Filter({ type: "lowpass", frequency: 120, Q: 0.5 });
        const gain = new Tone.Gain(0.05);
        const lfo = new Tone.LFO({ frequency: 0.05, min: 80, max: 160 });
        noise.connect(lp);
        lp.connect(gain);
        lfo.connect(lp.frequency);
        return { nodes: [noise, lp, gain, lfo], noise, output: gain, extras: [lfo] };
      }),
    synth: {
      bass: {
        kind: "mono",
        options: {
          oscillator: { type: "fatsawtooth", count: 3, spread: 20 },
          filter: { type: "lowpass", Q: 1 },
          filterEnvelope: {
            attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.3,
            baseFrequency: 60, octaves: 2,
          },
          envelope: { attack: 0.005, decay: 0.4, sustain: 0.5, release: 0.4 },
        },
        noteDuration: "8n",
      },
      lead: {
        kind: "basic",
        options: {
          oscillator: { type: "sawtooth" },
          envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.3 },
        },
        noteDuration: "8n",
        fx: [
          { type: "filter", frequency: 2000 },
          { type: "freeverb", roomSize: 0.5, dampening: 2000, wet: 0.2 },
        ],
      },
    },
    identity: {
      roots: ["C", "Db", "F", "G"],
      scales: ["minor", "minorPentatonic"],
      bassHits: [4, 5],
      leadDensity: "sparse",
    },
  },

  samba: {
    label: "Samba",
    createColor: () => {
      // Bright and organic: top-end lift into a small fixed room. This room is
      // a SEPARATE node from the drop's reverb — they stack, never fight.
      const eq = new Tone.EQ3({ low: 0, mid: 0.5, high: 2 });
      const room = new Tone.Freeverb({ roomSize: 0.35, dampening: 6000, wet: 0.12 });
      eq.connect(room);
      return { input: eq, output: room, dispose: () => { eq.dispose(); room.dispose(); } };
    },
    createTexture: () =>
      noiseTexture(() => {
        // Distant shaker: band-passed white noise gated in transport-synced 8ths.
        const noise = new Tone.Noise("white");
        const bp = new Tone.Filter({ type: "bandpass", frequency: 6000, Q: 1.5 });
        const trem = new Tone.Tremolo({ frequency: "8n", depth: 0.7, wet: 1 });
        const gain = new Tone.Gain(0.02);
        noise.connect(bp);
        bp.connect(trem);
        trem.connect(gain);
        return { nodes: [noise, bp, trem, gain], noise, output: gain, extras: [trem] };
      }),
    synth: {
      bass: {
        kind: "mono",
        options: {
          oscillator: { type: "triangle" },
          filter: { type: "lowpass", Q: 1 },
          filterEnvelope: {
            attack: 0.002, decay: 0.12, sustain: 0.15, release: 0.1,
            baseFrequency: 180, octaves: 2,
          },
          envelope: { attack: 0.003, decay: 0.15, sustain: 0.1, release: 0.1 },
        },
        noteDuration: "16n",
      },
      lead: {
        kind: "basic",
        options: {
          oscillator: { type: "triangle8" },
          envelope: { attack: 0.002, decay: 0.25, sustain: 0.05, release: 0.2 },
        },
        noteDuration: "8n",
        fx: [{ type: "freeverb", roomSize: 0.4, dampening: 5000, wet: 0.15 }],
      },
    },
    identity: {
      roots: ["C", "D", "F", "G"],
      scales: ["major"],
      bassHits: [5, 6],
      leadDensity: "busy",
    },
  },

  dnb: {
    label: "Drum & Bass",
    createColor: () => {
      // Dry, bright and aggressive: shelves up at both ends + fast compression.
      const eq = new Tone.EQ3({ low: 2, lowFrequency: 100, mid: 0, high: 2 });
      const comp = new Tone.Compressor({
        threshold: -20,
        ratio: 4,
        attack: 0.005,
        release: 0.1,
      });
      eq.connect(comp);
      return { input: eq, output: comp, dispose: () => { eq.dispose(); comp.dispose(); } };
    },
    createTexture: () =>
      noiseTexture(() => {
        // Cold airy floor above the dry mix.
        const noise = new Tone.Noise("white");
        const hp = new Tone.Filter({ type: "highpass", frequency: 8000 });
        const gain = new Tone.Gain(0.015);
        noise.connect(hp);
        hp.connect(gain);
        return { nodes: [noise, hp, gain], noise, output: gain };
      }),
    synth: {
      bass: {
        kind: "mono",
        options: {
          oscillator: { type: "fatsawtooth", count: 3, spread: 40 },
          filter: { type: "lowpass", Q: 1.2 },
          // Open filter + drive: a real reese speaks through its upper
          // harmonics — a nearly-closed lowpass left only the fundamental,
          // which small speakers (and ears) barely resolve.
          filterEnvelope: {
            attack: 0.005, decay: 0.2, sustain: 0.8, release: 0.3,
            baseFrequency: 180, octaves: 2.5,
          },
          envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.3 },
        },
        noteDuration: "4n",
        fx: [{ type: "distortion", distortion: 0.3, wet: 0.5 }],
      },
      lead: {
        kind: "basic",
        options: {
          oscillator: { type: "sawtooth" },
          envelope: { attack: 0.005, decay: 0.15, sustain: 0.15, release: 0.15 },
        },
        noteDuration: "16n",
        fx: [
          { type: "distortion", distortion: 0.15, wet: 0.4 },
          { type: "chorus", wet: 0.2 },
        ],
      },
    },
    identity: {
      roots: ["E", "F", "G", "A"],
      scales: ["minor", "minorPentatonic"],
      bassHits: [7, 8],
      leadDensity: "sparse",
      bassOctaveShift: 1,
    },
  },
};

export const DEFAULT_STYLE: StyleId = "funk";

export function isStyleId(id: string | null | undefined): id is StyleId {
  return id != null && id in STYLES;
}
