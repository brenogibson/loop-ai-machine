"use client";

import { useCallback } from "react";
import type { ScaleName } from "@/lib/audio/scale";
import { useSequencer } from "@/store/sequencer";

// Shifts the whole session — transposing any bass/lead already on the grid so
// the riff and edits are preserved. Two controls, both shown only once a synth
// exists: change root (key), and cycle the "mood" (scale). transposeNote
// handles both root and scale changes in-scale.
const ROOTS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Moods exposed to laypeople instead of theory names.
const MOODS: { label: string; emoji: string; scale: ScaleName }[] = [
  { label: "Alegre", emoji: "😊", scale: "major" },
  { label: "Triste", emoji: "😔", scale: "minor" },
  { label: "Groovy", emoji: "🕺", scale: "dorian" },
  { label: "Pesado", emoji: "😤", scale: "minorPentatonic" },
];

const BTN =
  "px-5 py-2 rounded-full border font-medium text-sm transition-all bg-white/5 border-white/10 text-zinc-200 hover:border-[rgb(var(--lime))] hover:text-[rgb(var(--lime))] hover:shadow-[0_0_16px_rgba(168,255,96,0.3)]";

export function KeyButton() {
  const musicalKey = useSequencer((s) => s.musicalKey);
  const hasSynth = useSequencer((s) =>
    s.pattern.tracks.some((t) => t.meta?.kind === "synth"),
  );
  const transposeSynthTo = useSequencer((s) => s.transposeSynthTo);

  const changeRoot = useCallback(() => {
    const current = useSequencer.getState().musicalKey;
    if (!current) return;
    const others = ROOTS.filter((r) => r !== current.root);
    const root = others[Math.floor(Math.random() * others.length)];
    transposeSynthTo({ root, scale: current.scale });
  }, [transposeSynthTo]);

  const nextMood = useCallback(() => {
    const current = useSequencer.getState().musicalKey;
    if (!current) return;
    // Advance to the next mood in the list, wrapping around.
    const idx = MOODS.findIndex((m) => m.scale === current.scale);
    const next = MOODS[(idx + 1) % MOODS.length];
    transposeSynthTo({ root: current.root, scale: next.scale });
  }, [transposeSynthTo]);

  if (!hasSynth || !musicalKey) return null;

  const mood = MOODS.find((m) => m.scale === musicalKey.scale);

  return (
    <>
      <button
        type="button"
        onClick={changeRoot}
        title={`Tom atual: ${musicalKey.root}`}
        className={BTN}
      >
        🎵 Trocar tom <span className="text-zinc-500">({musicalKey.root})</span>
      </button>
      <button
        type="button"
        onClick={nextMood}
        title="Muda o clima (escala)"
        className={BTN}
      >
        {mood?.emoji ?? "🎭"} Clima{" "}
        <span className="text-zinc-500">({mood?.label ?? musicalKey.scale})</span>
      </button>
    </>
  );
}
