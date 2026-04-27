import * as Tone from "tone";
import { STEPS_PER_BAR, type Pattern } from "./pattern";
import type { SurpriseTrackSource } from "./surprise";

export type SampleMap = Record<string, string>;

export type StepCallback = (step: number) => void;
export type PatternGetter = () => Pattern;

export class DrumEngine {
  private players: Tone.Players | null = null;
  private sequence: Tone.Sequence<number> | null = null;
  private getPattern: PatternGetter;
  private onStep: StepCallback | null = null;
  private loaded = false;
  private surpriseSources: Map<string, SurpriseTrackSource> = new Map();

  constructor(getPattern: PatternGetter) {
    this.getPattern = getPattern;
  }

  async load(samples: SampleMap): Promise<void> {
    if (this.loaded) return;
    this.players = new Tone.Players({ urls: samples }).toDestination();
    await Tone.loaded();
    this.loaded = true;
  }

  setOnStep(cb: StepCallback | null): void {
    this.onStep = cb;
  }

  private buildSequence(): void {
    if (this.sequence) {
      this.sequence.dispose();
      this.sequence = null;
    }
    const stepIndices = Array.from({ length: STEPS_PER_BAR }, (_, i) => i);
    this.sequence = new Tone.Sequence<number>(
      (time, stepIndex) => {
        const p = this.getPattern();
        for (const track of p.tracks) {
          if (!track.steps[stepIndex]) continue;
          if (track.meta?.kind === "surprise") {
            const src = this.surpriseSources.get(track.sampleId);
            if (!src || !src.player.loaded) continue;
            src.player.volume.value = track.volumeDb + (src.makeupDb ?? 0);
            try {
              src.player.start(time);
            } catch {
              // mid-playback; skip this step
            }
            continue;
          }
          const player = this.players?.player(track.sampleId);
          if (!player) continue;
          player.volume.value = track.volumeDb;
          player.start(time);
        }
        if (this.onStep) {
          Tone.Draw.schedule(() => this.onStep?.(stepIndex), time);
        }
      },
      stepIndices,
      "16n",
    );
    this.sequence.start(0);
  }

  async start(): Promise<void> {
    if (!this.loaded) throw new Error("DrumEngine: load() before start()");
    await Tone.start();
    const p = this.getPattern();
    Tone.getTransport().bpm.value = p.bpm;
    Tone.getTransport().swing = p.swing;
    this.buildSequence();
    Tone.getTransport().start();
  }

  stop(): void {
    Tone.getTransport().stop();
    this.sequence?.dispose();
    this.sequence = null;
    this.onStep?.(-1);
  }

  syncTransport(pattern: Pattern): void {
    Tone.getTransport().bpm.rampTo(pattern.bpm, 0.05);
    Tone.getTransport().swing = pattern.swing;
  }

  registerSurpriseSource(source: SurpriseTrackSource): void {
    const existing = this.surpriseSources.get(source.sampleId);
    if (existing) existing.dispose();
    this.surpriseSources.set(source.sampleId, source);
  }

  unregisterSurpriseSource(sampleId: string): void {
    const existing = this.surpriseSources.get(sampleId);
    if (!existing) return;
    existing.dispose();
    this.surpriseSources.delete(sampleId);
  }

  clearSurpriseSources(): void {
    for (const s of this.surpriseSources.values()) s.dispose();
    this.surpriseSources.clear();
  }

  dispose(): void {
    this.clearSurpriseSources();
    this.sequence?.dispose();
    this.sequence = null;
    this.players?.dispose();
    this.players = null;
    this.loaded = false;
  }
}
