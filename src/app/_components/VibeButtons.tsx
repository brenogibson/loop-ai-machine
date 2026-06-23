"use client";

import { VIBES } from "@/lib/vibes";
import { useSequencer } from "@/store/sequencer";

export function VibeButtons() {
  const vibeId = useSequencer((s) => s.vibeId);
  const setPattern = useSequencer((s) => s.setPattern);

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {VIBES.map((vibe) => {
        const active = vibe.id === vibeId;
        return (
          <button
            type="button"
            key={vibe.id}
            onClick={() => setPattern(vibe.pattern, vibe.id)}
            className={[
              "px-4 py-3 rounded-xl border text-sm font-medium transition-all",
              active
                ? "bg-[rgb(var(--cyan))] text-black border-[rgb(var(--cyan))] scale-105 shadow-[0_0_22px_rgba(56,232,255,0.5)]"
                : "bg-white/5 text-zinc-200 border-white/10 hover:border-[rgb(var(--cyan))]/50 hover:bg-white/10 hover:shadow-[0_0_14px_rgba(56,232,255,0.25)]",
            ].join(" ")}
          >
            <span className="mr-2 text-base">{vibe.emoji}</span>
            {vibe.label}
          </button>
        );
      })}
    </div>
  );
}
