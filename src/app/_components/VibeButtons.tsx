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
                ? "bg-emerald-500 text-black border-emerald-300 scale-105"
                : "bg-zinc-900 text-zinc-200 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800",
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
