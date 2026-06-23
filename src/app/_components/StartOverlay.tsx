"use client";

import { useCallback, useState } from "react";
import { getCurrentEngine } from "@/lib/audio/engine-registry";
import { vibeById } from "@/lib/vibes";
import { useSequencer } from "@/store/sequencer";

// One tap to enter: picks an energetic beat, unlocks audio (browsers require a
// user gesture), and starts the loop — so the first thing a newcomer sees is
// the machine already alive.
export function StartOverlay() {
  const engineReady = useSequencer((s) => s.engineReady);
  const playing = useSequencer((s) => s.playing);
  const setPattern = useSequencer((s) => s.setPattern);
  const setPlaying = useSequencer((s) => s.setPlaying);
  const [dismissed, setDismissed] = useState(false);
  const [starting, setStarting] = useState(false);

  const start = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    const funk = vibeById("funk");
    if (funk) setPattern(funk.pattern, funk.id);
    const engine = getCurrentEngine();
    try {
      if (engine && !playing) {
        await engine.start();
        setPlaying(true);
      }
    } catch (err) {
      console.error("start failed", err);
    }
    setDismissed(true);
  }, [starting, playing, setPattern, setPlaying]);

  if (dismissed) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-[var(--bg)]/80 backdrop-blur-md p-6 text-center">
      <h1 className="text-5xl sm:text-7xl font-black tracking-tighter uppercase bg-gradient-to-r from-[rgb(var(--cyan))] via-[rgb(var(--fg))] to-[rgb(var(--magenta))] bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(255,60,200,0.35)]">
        Loop Machine
      </h1>
      <p className="text-zinc-300 max-w-md text-base sm:text-lg">
        Crie um beat com a ajuda da IA. Toque, peça, baixe — em poucos minutos.
      </p>
      <button
        type="button"
        onClick={start}
        disabled={!engineReady || starting}
        className={[
          "px-12 py-5 rounded-full text-xl font-bold tracking-wide transition-all",
          "bg-[rgb(var(--cyan))] text-black",
          "shadow-[0_0_45px_rgba(56,232,255,0.6)] hover:shadow-[0_0_70px_rgba(56,232,255,0.85)] hover:scale-105",
          "disabled:opacity-50 disabled:cursor-wait disabled:scale-100",
          engineReady && !starting ? "animate-cta-glow" : "",
        ].join(" ")}
      >
        {engineReady ? (starting ? "Tocando…" : "▶ Começar") : "Carregando…"}
      </button>
      <p className="text-xs text-zinc-500">som ativado · use fones ou caixa</p>
    </div>
  );
}
