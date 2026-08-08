import type { SynthInstrument } from "./pattern";
import type { SynthPatch } from "./styles";

// Named instrument timbres Claude can pick per synth part ("toca a melodia
// numa flauta"), overriding the style's default patch. All synthesized with
// Tone.js — no samples. Ids are stable API (they live in track meta and in the
// Claude tool enum); labels are the human-facing PT names.

export const LEAD_TIMBRES = {
  flute: {
    label: "flauta/ocarina",
    patch: {
      kind: "basic",
      options: {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.06, decay: 0.1, sustain: 0.7, release: 0.25 },
      },
      noteDuration: "8n",
      fx: [{ type: "freeverb", roomSize: 0.5, dampening: 4500, wet: 0.25 }],
    } satisfies SynthPatch,
  },
  chiptune: {
    label: "videogame 8-bit",
    patch: {
      kind: "basic",
      options: {
        oscillator: { type: "square" },
        envelope: { attack: 0.002, decay: 0.08, sustain: 0.4, release: 0.08 },
      },
      noteDuration: "16n",
    } satisfies SynthPatch,
  },
  bell: {
    label: "sino/caixinha de música",
    patch: {
      kind: "fm",
      options: {
        harmonicity: 3,
        modulationIndex: 12,
        envelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.8 },
        modulationEnvelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.3 },
      },
      noteDuration: "8n",
      fx: [{ type: "freeverb", roomSize: 0.5, dampening: 5000, wet: 0.2 }],
    } satisfies SynthPatch,
  },
  pluck: {
    label: "harpa/cordas dedilhadas",
    patch: {
      kind: "basic",
      options: {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.3 },
      },
      noteDuration: "8n",
      fx: [{ type: "freeverb", roomSize: 0.4, dampening: 5000, wet: 0.15 }],
    } satisfies SynthPatch,
  },
  keys: {
    label: "teclas suaves",
    patch: {
      kind: "fm",
      options: {
        harmonicity: 2,
        modulationIndex: 4,
        envelope: { attack: 0.005, decay: 0.3, sustain: 0.3, release: 0.4 },
        modulationEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.1, release: 0.3 },
      },
      noteDuration: "8n",
      fx: [{ type: "chorus", wet: 0.25 }],
    } satisfies SynthPatch,
  },
  strings: {
    label: "cordas/pad",
    patch: {
      kind: "basic",
      options: {
        oscillator: { type: "fatsawtooth", count: 3, spread: 30 },
        envelope: { attack: 0.15, decay: 0.2, sustain: 0.8, release: 0.6 },
      },
      noteDuration: "4n",
      fx: [
        { type: "chorus", wet: 0.3 },
        { type: "freeverb", roomSize: 0.6, dampening: 4000, wet: 0.25 },
      ],
    } satisfies SynthPatch,
  },
} as const;

export const BASS_TIMBRES = {
  sub: {
    label: "grave profundo",
    patch: {
      kind: "mono",
      options: {
        oscillator: { type: "sine" },
        filter: { type: "lowpass", Q: 1 },
        filterEnvelope: {
          attack: 0.005, decay: 0.2, sustain: 0.8, release: 0.3,
          baseFrequency: 200, octaves: 1,
        },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.8, release: 0.2 },
      },
      noteDuration: "8n",
    } satisfies SynthPatch,
  },
  pluck: {
    label: "baixo dedilhado",
    patch: {
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
    } satisfies SynthPatch,
  },
  square: {
    label: "baixo de videogame",
    patch: {
      kind: "mono",
      options: {
        oscillator: { type: "square" },
        filter: { type: "lowpass", Q: 1 },
        filterEnvelope: {
          attack: 0.002, decay: 0.1, sustain: 0.3, release: 0.12,
          baseFrequency: 250, octaves: 2,
        },
        envelope: { attack: 0.002, decay: 0.12, sustain: 0.3, release: 0.12 },
      },
      noteDuration: "16n",
    } satisfies SynthPatch,
  },
  reese: {
    label: "growl elétrico",
    patch: {
      kind: "mono",
      options: {
        oscillator: { type: "fatsawtooth", count: 3, spread: 40 },
        filter: { type: "lowpass", Q: 1.2 },
        filterEnvelope: {
          attack: 0.005, decay: 0.2, sustain: 0.8, release: 0.3,
          baseFrequency: 180, octaves: 2.5,
        },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.3 },
      },
      noteDuration: "4n",
      fx: [{ type: "distortion", distortion: 0.3, wet: 0.5 }],
    } satisfies SynthPatch,
  },
} as const;

export type LeadTimbreId = keyof typeof LEAD_TIMBRES;
export type BassTimbreId = keyof typeof BASS_TIMBRES;
export type TimbreId = LeadTimbreId | BassTimbreId;

// Resolve a timbre for an instrument; unknown/ mismatched ids return null so
// callers can fall back to the style's default patch.
export function timbrePatch(
  instrument: SynthInstrument,
  timbre: string | undefined,
): SynthPatch | null {
  if (!timbre) return null;
  const table = instrument === "lead" ? LEAD_TIMBRES : BASS_TIMBRES;
  return (table as Record<string, { patch: SynthPatch }>)[timbre]?.patch ?? null;
}

export function isTimbreFor(
  instrument: SynthInstrument,
  timbre: string | undefined,
): boolean {
  return timbrePatch(instrument, timbre) != null;
}
