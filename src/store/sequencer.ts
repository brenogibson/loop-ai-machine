import { create } from "zustand";
import {
  DEMO_PATTERN,
  emptySteps,
  stepsFrom,
  type Pattern,
  type Step,
  type SynthInstrument,
  type Track,
} from "@/lib/audio/pattern";
import type { SurpriseStyle } from "@/lib/claude/surprise-tool";
import { transposeNote, type ScaleName } from "@/lib/audio/scale";

// The session's musical key. The first synth generated fixes it; every later
// synth (bass, lead, Claude) reuses it so they're always in the same key.
export type MusicalKey = { root: string; scale: ScaleName };

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

// Language preference for surprise phrases. "auto" lets Claude choose per vibe.
export type SurpriseLang = "auto" | "pt-BR" | "en-US";

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
  engineReady: boolean;
  vibeId: string | null;
  vibeLabel: string | null;
  chat: ChatMessage[];
  surpriseHistory: string[];
  surpriseLang: SurpriseLang;
  surpriseTheme: string;
  setSurpriseTheme: (theme: string) => void;
  musicalKey: MusicalKey | null;
  setMusicalKey: (key: MusicalKey) => void;
  setSurpriseLang: (lang: SurpriseLang) => void;
  setPattern: (pattern: Pattern, vibeId?: string | null) => void;
  applyClaudePattern: (pattern: Pattern, vibeLabel: string) => void;
  setBpm: (bpm: number) => void;
  toggleStep: (trackIndex: number, stepIndex: number) => void;
  setCurrentStep: (step: number) => void;
  setPlaying: (playing: boolean) => void;
  setEngineReady: (ready: boolean) => void;
  appendChat: (msg: ChatMessage) => void;
  pushSurpriseHistory: (phrase: string) => void;
  addSurpriseTrack: (input: AddSurpriseTrackInput) => void;
  setSynthTracks: (instrument: SynthInstrument, tracks: Track[]) => void;
  transposeSynthTo: (key: MusicalKey) => void;
  removeTrackBySampleId: (sampleId: string) => void;
  resetSession: () => void;
};

// A beat update from Claude only touches drum tracks; surprises and synth rows
// the user added are carried over so a chat tweak doesn't wipe them.
function preserveExtraTracks(oldTracks: Track[], newTracks: Track[]): Track[] {
  const extras = oldTracks.filter(
    (t) => t.meta?.kind === "surprise" || t.meta?.kind === "synth",
  );
  // Deduplicate by sampleId just in case Claude tried to reference one
  const existing = new Set(newTracks.map((t) => t.sampleId));
  return [
    ...newTracks,
    ...extras.filter((s) => !existing.has(s.sampleId)),
  ];
}

export const useSequencer = create<SequencerState>((set) => ({
  pattern: DEMO_PATTERN,
  currentStep: -1,
  playing: false,
  engineReady: false,
  vibeId: null,
  vibeLabel: null,
  chat: [],
  surpriseHistory: [],
  surpriseLang: "auto",
  surpriseTheme: "",
  setSurpriseTheme: (theme) => set({ surpriseTheme: theme }),
  musicalKey: null,
  setMusicalKey: (key) => set({ musicalKey: key }),
  setSurpriseLang: (lang) => set({ surpriseLang: lang }),
  setPattern: (pattern, vibeId = null) =>
    set({
      pattern,
      vibeId,
      vibeLabel: null,
      surpriseHistory: [],
      // A vibe button replaces the whole pattern (synth included), so the key
      // resets — the next synth picks a fresh one matching the new vibe.
      musicalKey: null,
    }),
  applyClaudePattern: (pattern, vibeLabel) =>
    set((state) => ({
      pattern: {
        ...pattern,
        tracks: preserveExtraTracks(state.pattern.tracks, pattern.tracks),
      },
      vibeId: null,
      vibeLabel,
    })),
  appendChat: (msg) => set((s) => ({ chat: [...s.chat, msg] })),
  pushSurpriseHistory: (phrase) =>
    set((s) => ({ surpriseHistory: [...s.surpriseHistory.slice(-11), phrase] })),
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
  setSynthTracks: (instrument, newTracks) =>
    set((state) => {
      // Replace any existing rows for this instrument (regenerating bass
      // shouldn't pile up) while leaving drums/surprises/other synths intact.
      const kept = state.pattern.tracks.filter(
        (t) => !(t.meta?.kind === "synth" && t.meta.instrument === instrument),
      );
      return {
        pattern: { ...state.pattern, tracks: [...kept, ...newTracks] },
      };
    }),
  transposeSynthTo: (key) =>
    set((state) => {
      const from = state.musicalKey;
      // Nothing to transpose from, or the key didn't change.
      if (!from) return { musicalKey: key };
      if (from.root === key.root && from.scale === key.scale) return state;
      const tracks = state.pattern.tracks.map((t) => {
        if (t.meta?.kind !== "synth") return t;
        const note = transposeNote(
          t.meta.note,
          from.root,
          from.scale,
          key.root,
          key.scale,
        );
        return { ...t, meta: { ...t.meta, note } };
      });
      return { pattern: { ...state.pattern, tracks }, musicalKey: key };
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
  setEngineReady: (ready) => set({ engineReady: ready }),
  resetSession: () =>
    set({
      pattern: DEMO_PATTERN,
      currentStep: -1,
      playing: false,
      vibeId: null,
      vibeLabel: null,
      chat: [],
      surpriseHistory: [],
      musicalKey: null,
    }),
}));
