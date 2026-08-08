"use client";

import { useEffect, useRef, useState } from "react";
import { DrumEngine } from "@/lib/audio/engine";
import { getStyleStage } from "@/lib/audio/style-stage";
import { DEFAULT_STYLE } from "@/lib/audio/styles";
import { createSurpriseSource } from "@/lib/audio/surprise";
import { fetchCatalog, sampleMapFrom } from "@/lib/samples/catalog";
import type { SurpriseStyle } from "@/lib/claude/surprise-tool";
import type { SharePayload } from "@/lib/share/types";

// Minimal replay UI: the full DrumEngine drives drums/synth from the shared
// pattern; surprise audio is rebuilt from the embedded base64 MP3s.
export function SharePlayer({ share }: { share: SharePayload }) {
  const engineRef = useRef<DrumEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const styleId = share.styleId ?? DEFAULT_STYLE;
    const engine = new DrumEngine(() => share.pattern, () => styleId);
    engineRef.current = engine;
    engine.setOnStep(setStep);
    // Restore the shared loop's sound identity (color/texture/timbre).
    getStyleStage().setStyle(styleId);

    (async () => {
      const catalog = await fetchCatalog();
      await engine.load(sampleMapFrom(catalog));
      for (const track of share.pattern.tracks) {
        if (track.meta?.kind !== "surprise") continue;
        const b64 = share.surpriseAudio[track.sampleId];
        if (!b64) continue;
        const source = await createSurpriseSource({
          sampleId: track.sampleId,
          phrase: track.meta.phrase,
          style: track.meta.style as SurpriseStyle,
          audioBase64: b64,
          bpm: share.pattern.bpm,
        });
        if (disposed) {
          source.dispose();
          return;
        }
        engine.registerSurpriseSource(source);
      }
      if (!disposed) setReady(true);
    })().catch((err) => {
      console.error("share player load failed", err);
      if (!disposed) setError("Não consegui carregar o loop.");
    });

    return () => {
      disposed = true;
      engine.dispose();
      engineRef.current = null;
    };
  }, [share]);

  const toggle = async () => {
    const engine = engineRef.current;
    if (!engine || !ready) return;
    if (playing) {
      engine.stop();
      setPlaying(false);
      return;
    }
    await engine.start();
    setPlaying(true);
  };

  const currentBeat = step >= 0 ? Math.floor(step / 4) : -1;
  const trackCount = share.pattern.tracks.length;

  return (
    <section className="flex flex-col items-center gap-6">
      <button
        type="button"
        onClick={toggle}
        disabled={!ready || !!error}
        className={[
          "w-32 h-32 rounded-full text-4xl font-bold transition-all",
          "disabled:opacity-40 disabled:cursor-wait",
          playing
            ? "bg-[rgb(var(--surprise))] text-black shadow-[0_0_45px_rgb(var(--surprise)/0.6)]"
            : "bg-[rgb(var(--drums))] text-black shadow-[0_0_45px_rgb(var(--drums)/0.55)] animate-cta-glow",
        ].join(" ")}
      >
        {error ? "✕" : !ready ? "…" : playing ? "■" : "▶"}
      </button>

      <div className="flex items-center gap-3">
        {[0, 1, 2, 3].map((beat) => (
          <span
            key={beat}
            className={[
              "w-4 h-4 rounded-full border transition-colors duration-75",
              beat === currentBeat
                ? "bg-[rgb(var(--beat))] border-[rgb(var(--beat))] shadow-[0_0_16px_rgb(var(--beat)/0.9)] animate-beat-pulse"
                : "bg-transparent border-zinc-700",
            ].join(" ")}
          />
        ))}
      </div>

      <div className="text-center text-sm text-zinc-400">
        {share.vibeLabel && (
          <p className="text-[rgb(var(--drums))] font-medium">{share.vibeLabel}</p>
        )}
        <p>
          {share.pattern.bpm} BPM · {trackCount}{" "}
          {trackCount === 1 ? "faixa" : "faixas"}
        </p>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}
    </section>
  );
}
