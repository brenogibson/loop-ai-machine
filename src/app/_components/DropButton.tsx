"use client";

import { useCallback, useEffect, useRef } from "react";
import { getMasterBus } from "@/lib/audio/master-bus";
import { useSequencer } from "@/store/sequencer";

// Build-up & drop, user-paced: click → 2-bar build (progress bar) → DROPPED,
// held indefinitely → click again → back to normal. Phase lives in the store
// so the hands-up gesture and this button stay in sync (either can trigger,
// either UI reflects it).
export function DropButton() {
  const playing = useSequencer((s) => s.playing);
  const phase = useSequencer((s) => s.dropPhase);
  const setDropPhase = useSequencer((s) => s.setDropPhase);
  const barRef = useRef<HTMLSpanElement | null>(null);
  const rafRef = useRef(0);

  const handleClick = useCallback(() => {
    const bus = getMasterBus();
    const { dropPhase, pattern, playing } = useSequencer.getState();
    if (dropPhase === "dropped") {
      bus.releaseDrop();
      setDropPhase("idle");
      return;
    }
    if (dropPhase !== "idle" || !playing) return;
    const buildS = bus.performDrop(pattern.bpm, 2);
    if (buildS == null) return;
    setDropPhase("building");
    const started = performance.now();
    const tick = () => {
      const t = (performance.now() - started) / 1000 / buildS;
      // The gesture may have cancelled the build (hands down) meanwhile.
      if (useSequencer.getState().dropPhase !== "building") return;
      if (t >= 1) {
        setDropPhase("dropped");
        return;
      }
      if (barRef.current) {
        barRef.current.style.width = `${Math.round(t * 100)}%`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [setDropPhase]);

  // Stopping the transport while dropped/building resets the FX and the phase.
  useEffect(() => {
    if (playing || phase === "idle") return;
    const bus = getMasterBus();
    bus.cancelDrop();
    bus.releaseDrop();
    cancelAnimationFrame(rafRef.current);
    setDropPhase("idle");
  }, [playing, phase, setDropPhase]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!playing || phase === "building"}
      className={[
        "relative overflow-hidden w-full py-4 rounded-2xl font-black text-xl uppercase tracking-widest transition-all",
        "disabled:cursor-not-allowed",
        phase === "building"
          ? "bg-zinc-900 text-[rgb(var(--beat))] border border-[rgb(var(--beat))]"
          : phase === "dropped"
            ? "bg-[rgb(var(--beat))] text-black shadow-[0_0_35px_rgb(var(--beat)/0.6)] hover:brightness-110"
            : playing
              ? "bg-gradient-to-r from-[rgb(var(--beat))] via-[rgb(var(--drums))] to-[rgb(var(--surprise))] text-white shadow-[0_0_30px_rgb(var(--surprise)/0.45)] hover:shadow-[0_0_50px_rgb(var(--surprise)/0.7)] hover:scale-[1.02] active:scale-95"
              : "bg-white/5 text-zinc-600 border border-white/10",
      ].join(" ")}
    >
      {phase === "building" && (
        <span
          ref={barRef}
          className="absolute inset-y-0 left-0 bg-[rgb(var(--beat))]/25"
          style={{ width: "0%" }}
        />
      )}
      <span className="relative">
        {phase === "building"
          ? "SEGURA…"
          : phase === "dropped"
            ? "✋ VOLTAR AO NORMAL"
            : "🚀 DROP"}
      </span>
    </button>
  );
}
