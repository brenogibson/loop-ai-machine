"use client";

import { useCallback } from "react";
import { nextKeyStep, type ScaleName } from "@/lib/audio/scale";
import { useSequencer } from "@/store/sequencer";

// One button that walks the session through a harmonic journey on the circle of
// fifths (see nextKeyStep): each press resolves down a fifth, with a relative
// major/minor flip every 4th press, coming back home after 12 moves. Feels like
// the music is developing instead of jumping to a random key. Existing bass and
// lead are transposed, so riffs and edits survive.
const MOOD_LABEL: Record<ScaleName, string> = {
  major: "alegre",
  minor: "triste",
  dorian: "groovy",
  minorPentatonic: "pesado",
};

const TOTAL_STOPS = 12; // a full lap of the circle

export function KeyButton() {
  const musicalKey = useSequencer((s) => s.musicalKey);
  const keyStep = useSequencer((s) => s.keyStep);
  const hasSynth = useSequencer((s) =>
    s.pattern.tracks.some((t) => t.meta?.kind === "synth"),
  );
  const transposeSynthTo = useSequencer((s) => s.transposeSynthTo);

  const advance = useCallback(() => {
    const { musicalKey: current, keyStep } = useSequencer.getState();
    if (!current) return;
    const next = nextKeyStep(current, keyStep);
    transposeSynthTo({ root: next.root, scale: next.scale });
  }, [transposeSynthTo]);

  if (!hasSynth || !musicalKey) return null;

  // Preview the upcoming move so the button promises where the music is going.
  const upcoming = nextKeyStep(musicalKey, keyStep);
  const lap = keyStep % TOTAL_STOPS;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={advance}
        title={`Próximo: ${upcoming.root} (${upcoming.label})`}
        className="px-5 py-2 rounded-full border font-medium text-sm transition-all bg-white/5 border-white/10 text-zinc-200 hover:border-[rgb(var(--synth))] hover:text-[rgb(var(--synth))] hover:shadow-[0_0_16px_rgb(var(--synth)/0.3)]"
      >
        🎵 Evoluir harmonia{" "}
        <span className="text-zinc-500">
          {musicalKey.root} → {upcoming.root}
        </span>
      </button>

      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span>
          tom{" "}
          <span className="text-[rgb(var(--synth))] font-medium">
            {musicalKey.root} {MOOD_LABEL[musicalKey.scale]}
          </span>
        </span>
        {/* Journey progress: how far around the circle this session has gone. */}
        <span className="flex items-center gap-0.5" title={`${lap}/${TOTAL_STOPS} da volta completa`}>
          {Array.from({ length: TOTAL_STOPS }, (_, i) => (
            <span
              key={i}
              className="w-1 h-2.5 rounded-full"
              style={{
                backgroundColor:
                  i < lap ? "rgb(var(--synth))" : "rgb(255 255 255 / 0.15)",
              }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
