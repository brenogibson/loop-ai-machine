"use client";

import { useSequencer } from "@/store/sequencer";

// Optional theme that steers the phrases the Surprise button generates. Lives in
// the right rail; flows to /api/surprise as `theme`. Empty = no steering.
export function SurpriseTheme() {
  const surpriseTheme = useSequencer((s) => s.surpriseTheme);
  const setSurpriseTheme = useSequencer((s) => s.setSurpriseTheme);

  return (
    <section className="w-full flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <div className="text-zinc-400 uppercase tracking-wide">
          Tema das surpresas
        </div>
        {surpriseTheme.trim() && (
          <button
            type="button"
            onClick={() => setSurpriseTheme("")}
            className="text-zinc-500 hover:text-rose-300"
          >
            limpar
          </button>
        )}
      </div>
      <input
        type="text"
        value={surpriseTheme}
        onChange={(e) => setSurpriseTheme(e.target.value)}
        maxLength={120}
        placeholder="ex: festa junina, futebol, amor…"
        className="w-full px-4 py-2 rounded-full bg-white/5 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[rgb(var(--magenta))] focus:shadow-[0_0_14px_rgba(255,60,200,0.3)] transition-shadow text-sm"
      />
      <p className="text-[11px] text-zinc-500">
        As frases faladas vão girar em torno desse tema.
      </p>
    </section>
  );
}
