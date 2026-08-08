import * as Tone from "tone";
import { STEPS_PER_BAR, type Pattern, type SynthInstrument } from "./pattern";
import type { SurpriseTrackSource } from "./surprise";
import { createSynthVoice, type SynthVoice } from "./synth";
import { getStyleStage } from "./style-stage";
import { DEFAULT_STYLE, STYLES, type StyleId } from "./styles";
import { timbrePatch } from "./timbres";

export type SampleMap = Record<string, string>;

export type StepCallback = (step: number) => void;
export type PatternGetter = () => Pattern;
export type StyleIdGetter = () => StyleId;

export class DrumEngine {
  private players: Tone.Players | null = null;
  private sequence: Tone.Sequence<number> | null = null;
  private getPattern: PatternGetter;
  private getStyleId: StyleIdGetter;
  private onStep: StepCallback | null = null;
  private loaded = false;
  private surpriseSources: Map<string, SurpriseTrackSource> = new Map();
  // One synth voice per instrument+timbre combo, created lazily and shared by
  // all rows using it ("lead:" = style default patch, "lead:flute" = timbre).
  private synthVoices: Map<string, SynthVoice> = new Map();

  // getStyleId is injected (like getPattern) — the engine must not import the
  // store, since SharePlayer instantiates it outside the main app.
  constructor(getPattern: PatternGetter, getStyleId: StyleIdGetter = () => DEFAULT_STYLE) {
    this.getPattern = getPattern;
    this.getStyleId = getStyleId;
  }

  private synthVoice(instrument: SynthInstrument, timbre?: string): SynthVoice {
    const key = `${instrument}:${timbre ?? ""}`;
    let v = this.synthVoices.get(key);
    if (!v) {
      const patch =
        timbrePatch(instrument, timbre) ??
        STYLES[this.getStyleId()].synth[instrument];
      v = createSynthVoice(instrument, patch);
      v.output.connect(getStyleStage().input);
      this.synthVoices.set(key, v);
    }
    return v;
  }

  // Style changed: drop the cached voices so the next triggered step lazily
  // rebuilds them with the new style's patch.
  reloadSynthVoices(): void {
    for (const v of this.synthVoices.values()) v.dispose();
    this.synthVoices.clear();
  }

  async load(samples: SampleMap): Promise<void> {
    if (this.loaded) return;
    this.players = new Tone.Players({ urls: samples }).connect(
      getStyleStage().input,
    );
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
          if (track.muted || !track.steps[stepIndex]) continue;
          if (track.meta?.kind === "surprise") {
            const src = this.surpriseSources.get(track.sampleId);
            if (!src) continue;
            src.trigger(time, stepIndex, track.volumeDb);
            continue;
          }
          if (track.meta?.kind === "synth") {
            this.synthVoice(track.meta.instrument, track.meta.timbre).triggerNote(
              track.meta.note,
              time,
              track.volumeDb,
            );
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
    source.output.connect(getStyleStage().input);
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
    for (const v of this.synthVoices.values()) v.dispose();
    this.synthVoices.clear();
    this.sequence?.dispose();
    this.sequence = null;
    this.players?.dispose();
    this.players = null;
    this.loaded = false;
  }
}
