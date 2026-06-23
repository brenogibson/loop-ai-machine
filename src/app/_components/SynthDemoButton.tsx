"use client";

import { useCallback } from "react";
import {
  buildScaleGrid,
  generateBassline,
  generateChords,
  generateLead,
  mergeRows,
  type ScaleName,
} from "@/lib/audio/scale";
import type { SynthInstrument } from "@/lib/audio/pattern";
import { useSequencer } from "@/store/sequencer";

// TEMP: local generative synth, also the fallback when Claude isn't used.
// Each click generates a fresh randomized-but-musical riff (scale-locked),
// varying key + scale so successive riffs feel different.
const ROOTS = ["C", "D", "E", "F", "G", "A"];
const SCALES: ScaleName[] = ["minor", "minorPentatonic", "dorian"];
const OCTAVE: Record<SynthInstrument, number> = { bass: 2, lead: 4 };
const VOLUME: Record<SynthInstrument, number> = { bass: -4, lead: -8 };

export function SynthDemoButton() {
  const setSynthTracks = useSequencer((s) => s.setSynthTracks);
  const setMusicalKey = useSequencer((s) => s.setMusicalKey);

  const generate = useCallback(
    (instrument: SynthInstrument) => {
      // Reuse the session key if one exists so bass and lead stay in the same
      // key; otherwise pick one now and lock it in for later synths.
      const existing = useSequencer.getState().musicalKey;
      const root = existing
        ? existing.root
        : ROOTS[Math.floor(Math.random() * ROOTS.length)];
      const scale = existing
        ? existing.scale
        : SCALES[Math.floor(Math.random() * SCALES.length)];
      if (!existing) setMusicalKey({ root, scale });
      const octave = OCTAVE[instrument];
      // Bass = single low riff. Lead = structured melody PLUS chord stabs (one
      // octave below) merged together, so it has both a hook and harmony.
      const rows =
        instrument === "bass"
          ? generateBassline(root, scale, octave)
          : mergeRows(
              generateLead(root, scale, octave),
              generateChords(root, scale, octave - 1),
            );
      // Lay the riff onto a full scale grid so every in-scale note is editable.
      const tracks = buildScaleGrid(
        instrument,
        root,
        scale,
        octave,
        rows,
        VOLUME[instrument],
      );
      setSynthTracks(instrument, tracks);
    },
    [setSynthTracks, setMusicalKey],
  );

  const btn =
    "px-5 py-2 rounded-full border font-medium text-sm transition-all bg-white/5 border-white/10 text-zinc-200 hover:border-[rgb(var(--lime))] hover:text-[rgb(var(--lime))] hover:shadow-[0_0_16px_rgba(168,255,96,0.3)]";

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => generate("bass")} className={btn}>
        🎸 Baixo
      </button>
      <button type="button" onClick={() => generate("lead")} className={btn}>
        🎹 Melodia
      </button>
    </div>
  );
}
