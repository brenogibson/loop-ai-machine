import { create } from "zustand";
import {
  DEMO_PATTERN,
  emptySteps,
  stepsFrom,
  type Pattern,
  type Step,
  type Track,
} from "@/lib/audio/pattern";
import type { SurpriseStyle } from "@/lib/claude/surprise-tool";

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export type AddSurpriseTrackInput = {
  sampleId: string;
  phrase: string;
  style: SurpriseStyle;
  voiceId: string;
  language: string;
  steps: number[];
  volumeDb: number;
};

type SequencerState = {
  pattern: Pattern;
  currentStep: number;
  playing: boolean;
  vibeId: string | null;
  vibeLabel: string | null;
  chat: ChatMessage[];
  surpriseHistory: string[];
  setPattern: (pattern: Pattern, vibeId?: string | null) => void;
  applyClaudePattern: (pattern: Pattern, vibeLabel: string) => void;
  setBpm: (bpm: number) => void;
  toggleStep: (trackIndex: number, stepIndex: number) => void;
  setCurrentStep: (step: number) => void;
  setPlaying: (playing: boolean) => void;
  appendChat: (msg: ChatMessage) => void;
  pushSurpriseHistory: (phrase: string) => void;
  addSurpriseTrack: (input: AddSurpriseTrackInput) => void;
  removeTrackBySampleId: (sampleId: string) => void;
  resetSession: () => void;
};

function preserveSurpriseTracks(oldTracks: Track[], newTracks: Track[]): Track[] {
  const surprises = oldTracks.filter((t) => t.meta?.kind === "surprise");
  // Deduplicate by sampleId just in case Claude tried to reference one
  const existing = new Set(newTracks.map((t) => t.sampleId));
  return [
    ...newTracks,
    ...surprises.filter((s) => !existing.has(s.sampleId)),
  ];
}

export const useSequencer = create<SequencerState>((set) => ({
  pattern: DEMO_PATTERN,
  currentStep: -1,
  playing: false,
  vibeId: null,
  vibeLabel: null,
  chat: [],
  surpriseHistory: [],
  setPattern: (pattern, vibeId = null) =>
    set({
      pattern,
      vibeId,
      vibeLabel: null,
      surpriseHistory: [],
    }),
  applyClaudePattern: (pattern, vibeLabel) =>
    set((state) => ({
      pattern: {
        ...pattern,
        tracks: preserveSurpriseTracks(state.pattern.tracks, pattern.tracks),
      },
      vibeId: null,
      vibeLabel,
    })),
  appendChat: (msg) => set((s) => ({ chat: [...s.chat, msg] })),
  pushSurpriseHistory: (phrase) =>
    set((s) => ({ surpriseHistory: [...s.surpriseHistory.slice(-7), phrase] })),
  addSurpriseTrack: (input) =>
    set((state) => {
      const steps: Step[] =
        input.steps.length > 0 ? stepsFrom(input.steps) : emptySteps();
      const track: Track = {
        sampleId: input.sampleId,
        steps,
        volumeDb: input.volumeDb,
        meta: {
          kind: "surprise",
          phrase: input.phrase,
          style: input.style,
          voiceId: input.voiceId,
          language: input.language,
        },
      };
      return {
        pattern: { ...state.pattern, tracks: [...state.pattern.tracks, track] },
      };
    }),
  removeTrackBySampleId: (sampleId) =>
    set((state) => ({
      pattern: {
        ...state.pattern,
        tracks: state.pattern.tracks.filter((t) => t.sampleId !== sampleId),
      },
    })),
  setBpm: (bpm) => set((s) => ({ pattern: { ...s.pattern, bpm } })),
  toggleStep: (trackIndex, stepIndex) =>
    set((s) => {
      const track = s.pattern.tracks[trackIndex];
      if (!track) return s;
      const steps = [...track.steps];
      steps[stepIndex] = (steps[stepIndex] ? 0 : 1) as Step;
      const tracks = s.pattern.tracks.map((t, i) =>
        i === trackIndex ? { ...t, steps } : t,
      );
      // Editing a plain step clears the "current vibe preset" indicator but
      // keeps surprise tracks (they're editable as regular tracks now).
      const isPlainTrack = track.meta?.kind !== "surprise";
      return {
        pattern: { ...s.pattern, tracks },
        vibeId: isPlainTrack ? null : s.vibeId,
      };
    }),
  setCurrentStep: (step) => set({ currentStep: step }),
  setPlaying: (playing) => set({ playing }),
  resetSession: () =>
    set({
      pattern: DEMO_PATTERN,
      currentStep: -1,
      playing: false,
      vibeId: null,
      vibeLabel: null,
      chat: [],
      surpriseHistory: [],
    }),
}));
