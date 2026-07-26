export type Step = 0 | 1;

export type SurpriseTrackMeta = {
  kind: "surprise";
  phrase: string;
  style: string;
  voiceId: string;
  language: string;
};

export type SynthInstrument = "bass" | "lead";

// A synth row is one pitch of one instrument. Steps stay binary (note plays or
// not at each 1/16), so the whole grid edit/render logic is reused. A group of
// synth rows sharing an instrument forms a scale-locked mini piano-roll: only
// in-scale notes get rows, so a layperson can't play a wrong note.
export type SynthTrackMeta = {
  kind: "synth";
  instrument: SynthInstrument;
  note: string; // absolute pitch, e.g. "C2", "Eb4"
};

export type TrackMeta = SurpriseTrackMeta | SynthTrackMeta;

export type Track = {
  sampleId: string;
  steps: Step[];
  volumeDb: number;
  muted?: boolean;
  meta?: TrackMeta;
};

export type Pattern = {
  bpm: number;
  swing: number;
  tracks: Track[];
};

export const STEPS_PER_BAR = 16;

export function emptySteps(): Step[] {
  return Array<Step>(STEPS_PER_BAR).fill(0);
}

export function stepsFrom(active: number[]): Step[] {
  const s = emptySteps();
  for (const i of active) if (i >= 0 && i < STEPS_PER_BAR) s[i] = 1;
  return s;
}

export const DEMO_PATTERN: Pattern = {
  bpm: 100,
  swing: 0,
  tracks: [
    { sampleId: "kick_808", steps: stepsFrom([0, 4, 8, 12]), volumeDb: 0 },
    { sampleId: "snare_tight", steps: stepsFrom([4, 12]), volumeDb: -3 },
    { sampleId: "hat_closed", steps: stepsFrom([0, 2, 4, 6, 8, 10, 12, 14]), volumeDb: -11 },
    { sampleId: "clap_wide", steps: stepsFrom([10]), volumeDb: -6 },
  ],
};
