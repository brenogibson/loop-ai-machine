"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DrumEngine } from "@/lib/audio/engine";
import { setCurrentEngine } from "@/lib/audio/engine-registry";
import { fetchCatalog, sampleMapFrom } from "@/lib/samples/catalog";
import { unregisterSurpriseAudio } from "@/lib/audio/surprise-registry";
import type { Track } from "@/lib/audio/pattern";
import { useSequencer } from "@/store/sequencer";

const STYLE_EMOJI: Record<string, string> = {
  robotic: "🤖",
  melodic: "🎶",
  reverse: "⏪",
  stutter: "🔁",
  pitched_up: "⬆️",
  pitched_down: "⬇️",
  telephone: "📞",
  megaphone: "📣",
  slice: "✂️",
  dub: "🌊",
  harmony: "🎼",
  chopped: "🪓",
};

const SYNTH_EMOJI: Record<string, string> = {
  bass: "🎸",
  lead: "🎹",
};

type SectionKey = "drums" | "bass" | "lead" | "surprise";

type SectionDef = {
  key: SectionKey;
  label: string;
  emoji: string;
  colorVar: string; // bare CSS var name, used as rgb(var(...))
  unit: string;
  predicate: (t: Track) => boolean;
  defaultCollapsed: boolean;
};

// Tracks are grouped into these sections for display. Order here = render order.
const SECTIONS: SectionDef[] = [
  {
    key: "drums",
    label: "Bateria",
    emoji: "🥁",
    colorVar: "--cyan",
    unit: "faixas",
    predicate: (t) => t.meta === undefined,
    defaultCollapsed: false,
  },
  {
    key: "bass",
    label: "Baixo",
    emoji: "🎸",
    colorVar: "--lime",
    unit: "notas",
    predicate: (t) => t.meta?.kind === "synth" && t.meta.instrument === "bass",
    defaultCollapsed: true,
  },
  {
    key: "lead",
    label: "Melodia",
    emoji: "🎹",
    colorVar: "--lime",
    unit: "notas",
    predicate: (t) => t.meta?.kind === "synth" && t.meta.instrument === "lead",
    defaultCollapsed: true,
  },
  {
    key: "surprise",
    label: "Vozes",
    emoji: "🎤",
    colorVar: "--magenta",
    unit: "vozes",
    predicate: (t) => t.meta?.kind === "surprise",
    defaultCollapsed: true,
  },
];

const INITIAL_COLLAPSED = Object.fromEntries(
  SECTIONS.map((s) => [s.key, s.defaultCollapsed]),
) as Record<SectionKey, boolean>;

type IndexedTrack = { track: Track; originalIndex: number };

export function StepSequencer() {
  const engineRef = useRef<DrumEngine | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] =
    useState<Record<SectionKey, boolean>>(INITIAL_COLLAPSED);

  const pattern = useSequencer((s) => s.pattern);
  const currentStep = useSequencer((s) => s.currentStep);
  const playing = useSequencer((s) => s.playing);
  const toggleStep = useSequencer((s) => s.toggleStep);
  const setBpm = useSequencer((s) => s.setBpm);
  const setCurrentStep = useSequencer((s) => s.setCurrentStep);
  const setPlaying = useSequencer((s) => s.setPlaying);
  const setEngineReady = useSequencer((s) => s.setEngineReady);
  const removeTrackBySampleId = useSequencer((s) => s.removeTrackBySampleId);

  useEffect(() => {
    const engine = new DrumEngine(() => useSequencer.getState().pattern);
    engineRef.current = engine;
    setCurrentEngine(engine);
    engine.setOnStep(setCurrentStep);
    fetchCatalog()
      .then((catalog) => engine.load(sampleMapFrom(catalog)))
      .then(() => {
        setLoaded(true);
        setEngineReady(true);
      })
      .catch((err) => console.error("load failed", err));

    const unsub = useSequencer.subscribe((state, prev) => {
      if (
        state.pattern.bpm !== prev.pattern.bpm ||
        state.pattern.swing !== prev.pattern.swing
      ) {
        engineRef.current?.syncTransport(state.pattern);
      }
      // A vibe change wipes all surprise tracks (the preserve logic keeps them
      // across Claude chat updates, but vibe buttons fully reset).
      if (state.vibeId !== prev.vibeId && state.vibeId != null) {
        engineRef.current?.clearSurpriseSources();
      }
      // When a track with a surprise source disappears from the pattern (user
      // removed it), free the audio nodes.
      const prevSurpriseIds = new Set(
        prev.pattern.tracks
          .filter((t) => t.meta?.kind === "surprise")
          .map((t) => t.sampleId),
      );
      const nextSurpriseIds = new Set(
        state.pattern.tracks
          .filter((t) => t.meta?.kind === "surprise")
          .map((t) => t.sampleId),
      );
      for (const id of prevSurpriseIds) {
        if (!nextSurpriseIds.has(id)) {
          engineRef.current?.unregisterSurpriseSource(id);
          unregisterSurpriseAudio(id);
        }
      }
    });

    return () => {
      unsub();
      engine.dispose();
      engineRef.current = null;
      setCurrentEngine(null);
      setEngineReady(false);
    };
  }, [setCurrentStep, setEngineReady]);

  const handlePlay = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || !loaded) return;
    if (playing) {
      engine.stop();
      setPlaying(false);
      return;
    }
    await engine.start();
    setPlaying(true);
  }, [loaded, playing, setPlaying]);

  const toggleSection = useCallback((key: SectionKey) => {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }, []);

  const currentBeat = currentStep >= 0 ? Math.floor(currentStep / 4) : -1;

  // Tag every track with its original index in pattern.tracks BEFORE grouping —
  // toggleStep indexes pattern.tracks, so display order must not affect it.
  const indexed: IndexedTrack[] = pattern.tracks.map((track, originalIndex) => ({
    track,
    originalIndex,
  }));

  return (
    <section className="flex flex-col gap-5 w-full">
      <div className="flex items-center gap-5 flex-wrap">
        <button
          type="button"
          onClick={handlePlay}
          disabled={!loaded}
          className={[
            "px-7 py-3 rounded-full font-semibold tracking-wide transition-all",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            playing
              ? "bg-[rgb(var(--magenta))] text-black shadow-[0_0_25px_rgba(255,60,200,0.6)] hover:brightness-110"
              : "bg-[rgb(var(--cyan))] text-black shadow-[0_0_25px_rgba(56,232,255,0.55)] hover:brightness-110",
          ].join(" ")}
        >
          {loaded ? (playing ? "■ Stop" : "▶ Play") : "Carregando…"}
        </button>

        {/* Big beat indicator — readable across the room */}
        <div className="flex items-center gap-2">
          {[0, 1, 2, 3].map((beat) => {
            const on = beat === currentBeat;
            return (
              <span
                key={beat}
                className={[
                  "w-3.5 h-3.5 rounded-full border transition-colors duration-75",
                  on
                    ? "bg-[rgb(var(--amber))] border-[rgb(var(--amber))] shadow-[0_0_16px_rgba(255,196,84,0.9)] animate-beat-pulse"
                    : "bg-transparent border-zinc-700",
                ].join(" ")}
              />
            );
          })}
        </div>

        <label className="flex items-center gap-3 text-sm text-zinc-300 ml-auto">
          BPM
          <input
            type="range"
            min={60}
            max={180}
            value={pattern.bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-40 accent-[rgb(var(--cyan))]"
          />
          <span className="tabular-nums w-10 text-right font-mono text-[rgb(var(--cyan))]">
            {pattern.bpm}
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        {SECTIONS.map((section) => {
          const members = indexed.filter(({ track }) => section.predicate(track));
          if (members.length === 0) return null;
          const isCollapsed = collapsed[section.key];
          const liveActive =
            playing &&
            currentStep >= 0 &&
            members.some(({ track }) => track.steps[currentStep] === 1);
          return (
            <div key={section.key} className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                aria-expanded={!isCollapsed}
                className="flex items-center gap-3 w-full min-h-14 px-4 py-3 rounded-xl border text-left transition-all active:scale-[0.99]"
                style={{
                  borderColor: `rgb(var(${section.colorVar}) / ${isCollapsed ? 0.35 : 0.6})`,
                  backgroundColor: `rgb(var(${section.colorVar}) / ${isCollapsed ? 0.08 : 0.16})`,
                  boxShadow: isCollapsed
                    ? "none"
                    : `0 0 18px rgb(var(${section.colorVar}) / 0.25)`,
                }}
              >
                <span
                  className="inline-block text-lg leading-none transition-transform"
                  style={{
                    color: `rgb(var(${section.colorVar}))`,
                    transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)",
                  }}
                >
                  ▸
                </span>
                <span className="text-2xl leading-none">{section.emoji}</span>
                <span
                  className="font-bold text-base sm:text-lg uppercase tracking-wide"
                  style={{ color: `rgb(var(${section.colorVar}))` }}
                >
                  {section.label}
                </span>
                <span className="text-sm text-zinc-400">
                  {members.length} {section.unit}
                </span>
                {/* Live dot: pulses in time when this section triggers a step */}
                <span
                  aria-label={liveActive ? "tocando agora" : undefined}
                  className={["ml-auto", liveActive ? "animate-beat-pulse" : ""].join(" ")}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 9999,
                    backgroundColor: liveActive
                      ? `rgb(var(${section.colorVar}))`
                      : "rgb(63 63 70)",
                    boxShadow: liveActive
                      ? `0 0 12px rgb(var(${section.colorVar}) / 0.9)`
                      : "none",
                  }}
                />
              </button>

              {!isCollapsed && (
                <div className="flex flex-col gap-1.5">
                  {members.map(({ track, originalIndex }) => (
                    <TrackRow
                      key={track.sampleId}
                      track={track}
                      originalIndex={originalIndex}
                      currentStep={currentStep}
                      playing={playing}
                      toggleStep={toggleStep}
                      removeTrackBySampleId={removeTrackBySampleId}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

type TrackRowProps = {
  track: Track;
  originalIndex: number;
  currentStep: number;
  playing: boolean;
  toggleStep: (trackIndex: number, stepIndex: number) => void;
  removeTrackBySampleId: (sampleId: string) => void;
};

function TrackRow({
  track,
  originalIndex,
  currentStep,
  playing,
  toggleStep,
  removeTrackBySampleId,
}: TrackRowProps) {
  const isSurprise = track.meta?.kind === "surprise";
  const isSynth = track.meta?.kind === "synth";
  const removable = isSurprise || isSynth;
  const label =
    isSurprise && track.meta?.kind === "surprise"
      ? `${STYLE_EMOJI[track.meta.style] ?? "🎤"} ${track.meta.phrase}`
      : isSynth && track.meta?.kind === "synth"
        ? `${SYNTH_EMOJI[track.meta.instrument]} ${track.meta.note}`
        : track.sampleId;
  const accent = isSurprise
    ? "var(--magenta)"
    : isSynth
      ? "var(--lime)"
      : "var(--cyan)";

  return (
    <div className="flex items-center gap-3">
      <div
        className={[
          "w-32 text-xs tracking-wide truncate flex items-center gap-1",
          isSurprise
            ? "text-[rgb(var(--magenta))] font-medium"
            : isSynth
              ? "text-[rgb(var(--lime))] font-medium"
              : "text-zinc-400 uppercase",
        ].join(" ")}
        title={label}
      >
        {removable && (
          <button
            type="button"
            onClick={() => removeTrackBySampleId(track.sampleId)}
            className="w-4 h-4 rounded-full bg-zinc-800 hover:bg-rose-500 text-zinc-400 hover:text-white text-[10px] leading-none flex items-center justify-center flex-shrink-0"
            aria-label={`remover ${track.sampleId}`}
          >
            ×
          </button>
        )}
        <span className="truncate">{label}</span>
      </div>
      <div
        className="grid gap-1 flex-1"
        style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}
      >
        {track.steps.map((active, stepIndex) => {
          const isBeat = stepIndex % 4 === 0;
          const isCurrent = stepIndex === currentStep;
          // The cell bursts the instant the playhead lands on it while lit.
          const burst = isCurrent && active && playing;
          return (
            <button
              type="button"
              key={stepIndex}
              onClick={() => toggleStep(originalIndex, stepIndex)}
              style={
                active
                  ? {
                      backgroundColor: `rgb(${accent})`,
                      boxShadow: `0 0 ${burst ? 22 : 10}px rgba(${accent} / ${burst ? 0.85 : 0.45})`,
                      borderColor: `rgb(${accent})`,
                    }
                  : isCurrent && playing
                    ? {
                        // Lit playhead column reads as a beam sweeping across.
                        backgroundColor: `rgb(${accent} / 0.14)`,
                        borderColor: `rgb(${accent} / 0.4)`,
                      }
                    : undefined
              }
              className={[
                "h-10 rounded-md border transition-[background-color,box-shadow] duration-75",
                burst ? "animate-step-burst" : "",
                !active && !(isCurrent && playing)
                  ? isBeat
                    ? "bg-zinc-800/60 border-zinc-700"
                    : "bg-zinc-900/60 border-zinc-800"
                  : "",
              ].join(" ")}
              aria-label={`${label} step ${stepIndex + 1}`}
            />
          );
        })}
      </div>
    </div>
  );
}
