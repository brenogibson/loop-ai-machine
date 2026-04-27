"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DrumEngine } from "@/lib/audio/engine";
import { setCurrentEngine } from "@/lib/audio/engine-registry";
import { fetchCatalog, sampleMapFrom } from "@/lib/samples/catalog";
import { unregisterSurpriseAudio } from "@/lib/audio/surprise-registry";
import { useSequencer } from "@/store/sequencer";

const STYLE_EMOJI: Record<string, string> = {
  robotic: "🤖",
  melodic: "🎶",
  reverse: "⏪",
  stutter: "🔁",
  pitched_up: "⬆️",
  pitched_down: "⬇️",
  telephone: "📞",
};

export function StepSequencer() {
  const engineRef = useRef<DrumEngine | null>(null);
  const [loaded, setLoaded] = useState(false);

  const pattern = useSequencer((s) => s.pattern);
  const currentStep = useSequencer((s) => s.currentStep);
  const playing = useSequencer((s) => s.playing);
  const toggleStep = useSequencer((s) => s.toggleStep);
  const setBpm = useSequencer((s) => s.setBpm);
  const setCurrentStep = useSequencer((s) => s.setCurrentStep);
  const setPlaying = useSequencer((s) => s.setPlaying);
  const removeTrackBySampleId = useSequencer((s) => s.removeTrackBySampleId);

  useEffect(() => {
    const engine = new DrumEngine(() => useSequencer.getState().pattern);
    engineRef.current = engine;
    setCurrentEngine(engine);
    engine.setOnStep(setCurrentStep);
    fetchCatalog()
      .then((catalog) => engine.load(sampleMapFrom(catalog)))
      .then(() => setLoaded(true))
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
    };
  }, [setCurrentStep]);

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

  return (
    <section className="flex flex-col gap-5 w-full max-w-4xl">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handlePlay}
          disabled={!loaded}
          className="px-6 py-3 rounded-full bg-emerald-500 text-black font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-400 transition-colors"
        >
          {loaded ? (playing ? "■ Stop" : "▶ Play") : "Loading…"}
        </button>
        <label className="flex items-center gap-3 text-sm text-zinc-300">
          BPM
          <input
            type="range"
            min={60}
            max={180}
            value={pattern.bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-40"
          />
          <span className="tabular-nums w-10 text-right">{pattern.bpm}</span>
        </label>
      </div>

      <div className="grid gap-2">
        {pattern.tracks.map((track, trackIndex) => {
          const isSurprise = track.meta?.kind === "surprise";
          const label = isSurprise && track.meta
            ? `${STYLE_EMOJI[track.meta.style] ?? "🎤"} ${track.meta.phrase}`
            : track.sampleId;
          return (
            <div key={track.sampleId} className="flex items-center gap-3">
              <div
                className={[
                  "w-32 text-xs tracking-wide truncate flex items-center gap-1",
                  isSurprise
                    ? "text-fuchsia-300 font-medium"
                    : "text-zinc-400 uppercase",
                ].join(" ")}
                title={label}
              >
                {isSurprise && (
                  <button
                    type="button"
                    onClick={() => removeTrackBySampleId(track.sampleId)}
                    className="w-4 h-4 rounded-full bg-zinc-800 hover:bg-rose-500 text-zinc-400 hover:text-white text-[10px] leading-none flex items-center justify-center flex-shrink-0"
                    aria-label={`remover ${track.meta?.phrase ?? track.sampleId}`}
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
                  const activeColor = isSurprise
                    ? "bg-fuchsia-500 border-fuchsia-300"
                    : "bg-emerald-500 border-emerald-300";
                  return (
                    <button
                      type="button"
                      key={stepIndex}
                      onClick={() => toggleStep(trackIndex, stepIndex)}
                      className={[
                        "h-10 rounded-md border transition-colors",
                        active
                          ? activeColor
                          : isBeat
                            ? "bg-zinc-800 border-zinc-700"
                            : "bg-zinc-900 border-zinc-800",
                        isCurrent ? "ring-2 ring-amber-400" : "",
                      ].join(" ")}
                      aria-label={`${label} step ${stepIndex + 1}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
