"use client";

import { useSequencer } from "@/store/sequencer";

const LANG_OPTIONS: { id: import("@/store/sequencer").SurpriseLang; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "pt-BR", label: "PT" },
  { id: "en-US", label: "EN" },
];

// Surprise settings (right rail): optional theme steering the generated
// phrases + the phrase language. Both flow to /api/surprise.
export function SurpriseTheme() {
  const surpriseTheme = useSequencer((s) => s.surpriseTheme);
  const setSurpriseTheme = useSequencer((s) => s.setSurpriseTheme);
  const surpriseLang = useSequencer((s) => s.surpriseLang);
  const setSurpriseLang = useSequencer((s) => s.setSurpriseLang);

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
        className="w-full px-4 py-2 rounded-full bg-white/5 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[rgb(var(--surprise))] focus:shadow-[0_0_14px_rgb(var(--surprise)/0.3)] transition-shadow text-sm"
      />
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-zinc-500">
          As frases faladas vão girar em torno desse tema.
        </p>
        <div className="flex items-center gap-1 rounded-full bg-white/5 border border-white/10 p-0.5">
          {LANG_OPTIONS.map((opt) => {
            const active = surpriseLang === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSurpriseLang(opt.id)}
                className={[
                  "px-2.5 py-0.5 text-[11px] rounded-full font-medium transition-colors",
                  active
                    ? "bg-[rgb(var(--surprise))] text-white shadow-[0_0_12px_rgb(var(--surprise)/0.45)]"
                    : "text-zinc-400 hover:text-zinc-200",
                ].join(" ")}
                aria-pressed={active}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
