import { stepsFrom, type Pattern } from "./audio/pattern";

export type Vibe = {
  id: string;
  label: string;
  emoji: string;
  pattern: Pattern;
};

export const VIBES: Vibe[] = [
  {
    id: "funk",
    label: "Funk",
    emoji: "🕺",
    pattern: {
      bpm: 128,
      swing: 0.1,
      tracks: [
        { sampleId: "kick_808", steps: stepsFrom([0, 3, 6, 10, 14]), volumeDb: 0 },
        { sampleId: "snare_tight", steps: stepsFrom([4, 12]), volumeDb: -3 },
        { sampleId: "hat_closed", steps: stepsFrom([2, 6, 10, 14]), volumeDb: -10 },
        { sampleId: "clap_wide", steps: stepsFrom([4, 12]), volumeDb: -6 },
        { sampleId: "bass_pluck", steps: stepsFrom([0, 6, 10]), volumeDb: -5 },
        { sampleId: "perc_rim", steps: stepsFrom([3, 11]), volumeDb: -9 },
      ],
    },
  },
  {
    id: "lofi",
    label: "Lo-Fi",
    emoji: "🎧",
    pattern: {
      bpm: 82,
      swing: 0.25,
      tracks: [
        { sampleId: "kick_tight", steps: stepsFrom([0, 8]), volumeDb: -1 },
        { sampleId: "snare_fat", steps: stepsFrom([4, 12]), volumeDb: -6 },
        { sampleId: "hat_open", steps: stepsFrom([2, 6, 10, 14]), volumeDb: -14 },
        { sampleId: "perc_rim", steps: stepsFrom([5, 13]), volumeDb: -9 },
        { sampleId: "fx_swoosh", steps: stepsFrom([7]), volumeDb: -12 },
      ],
    },
  },
  {
    id: "trap",
    label: "Trap",
    emoji: "🔥",
    pattern: {
      bpm: 140,
      swing: 0.05,
      tracks: [
        { sampleId: "kick_808", steps: stepsFrom([0, 6, 10]), volumeDb: 2 },
        { sampleId: "snare_crack", steps: stepsFrom([4, 12]), volumeDb: -2 },
        {
          sampleId: "hat_tight",
          steps: stepsFrom([0, 2, 4, 6, 7, 8, 10, 12, 13, 14, 15]),
          volumeDb: -10,
        },
        { sampleId: "clap_sharp", steps: stepsFrom([4, 12]), volumeDb: -4 },
        { sampleId: "bass_sub", steps: stepsFrom([0, 10]), volumeDb: -4 },
        { sampleId: "fx_zap", steps: stepsFrom([15]), volumeDb: -7 },
      ],
    },
  },
  {
    id: "samba",
    label: "Samba",
    emoji: "🥁",
    pattern: {
      bpm: 104,
      swing: 0.15,
      tracks: [
        { sampleId: "kick_tight", steps: stepsFrom([0, 3, 8, 11]), volumeDb: 0 },
        { sampleId: "snare_tight", steps: stepsFrom([2, 6, 10, 14]), volumeDb: -4 },
        { sampleId: "hat_closed", steps: stepsFrom([0, 2, 4, 6, 8, 10, 12, 14]), volumeDb: -11 },
        { sampleId: "perc_tom", steps: stepsFrom([5, 13]), volumeDb: -5 },
        { sampleId: "perc_rim", steps: stepsFrom([1, 7, 9, 15]), volumeDb: -8 },
        { sampleId: "bass_pluck", steps: stepsFrom([0, 8]), volumeDb: -6 },
      ],
    },
  },
  {
    id: "dnb",
    label: "Drum & Bass",
    emoji: "⚡",
    pattern: {
      bpm: 174,
      swing: 0,
      tracks: [
        { sampleId: "kick_boom", steps: stepsFrom([0, 10]), volumeDb: 1 },
        { sampleId: "snare_crack", steps: stepsFrom([4, 12]), volumeDb: -1 },
        { sampleId: "hat_tight", steps: stepsFrom([2, 6, 8, 14]), volumeDb: -9 },
        { sampleId: "clap_sharp", steps: stepsFrom([4, 12]), volumeDb: -3 },
        { sampleId: "bass_saw", steps: stepsFrom([0, 6, 10]), volumeDb: -3 },
        { sampleId: "fx_riser", steps: stepsFrom([14]), volumeDb: -10 },
      ],
    },
  },
  {
    id: "ambient",
    label: "Ambient",
    emoji: "🌌",
    pattern: {
      bpm: 70,
      swing: 0.35,
      tracks: [
        { sampleId: "kick_boom", steps: stepsFrom([0]), volumeDb: -3 },
        { sampleId: "snare_fat", steps: stepsFrom([8]), volumeDb: -8 },
        { sampleId: "hat_open", steps: stepsFrom([4, 12]), volumeDb: -14 },
        { sampleId: "bass_sub", steps: stepsFrom([0]), volumeDb: -6 },
        { sampleId: "fx_swoosh", steps: stepsFrom([10]), volumeDb: -11 },
      ],
    },
  },
];

export function vibeById(id: string): Vibe | undefined {
  return VIBES.find((v) => v.id === id);
}
