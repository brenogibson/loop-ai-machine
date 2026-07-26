import {
  bassOctaveFor,
  buildScaleGrid,
  generateBassline,
  generateChords,
  generateLead,
  mergeRows,
  type ScaleName,
} from "./scale";
import type { SynthInstrument } from "./pattern";
import { useSequencer } from "@/store/sequencer";

// Local generative synth (no Claude round-trip): one call = a fresh
// randomized-but-musical riff, scale-locked to the session key. The first
// generated synth fixes the key; later ones reuse it so bass and lead always
// agree. Used by the grid section "gerar" buttons.
const ROOTS = ["C", "D", "E", "F", "G", "A"];
const SCALES: ScaleName[] = ["minor", "minorPentatonic", "dorian"];
const OCTAVE: Record<SynthInstrument, number> = { bass: 2, lead: 4 };
const VOLUME: Record<SynthInstrument, number> = { bass: -4, lead: -8 };

export function generateSynthRiff(instrument: SynthInstrument): void {
  const { musicalKey, setMusicalKey, setSynthTracks } = useSequencer.getState();
  const root =
    musicalKey?.root ?? ROOTS[Math.floor(Math.random() * ROOTS.length)];
  const scale =
    musicalKey?.scale ?? SCALES[Math.floor(Math.random() * SCALES.length)];
  if (!musicalKey) setMusicalKey({ root, scale });

  // Bass register is capped: with high roots (Bb/B) octave 2 would spill into
  // octave 3, so the whole riff starts an octave lower instead.
  const octave =
    instrument === "bass" ? bassOctaveFor(root, scale) : OCTAVE[instrument];
  // Bass = single low riff. Lead = structured melody PLUS chord stabs (one
  // octave below) merged together, so it has both a hook and harmony.
  const rows =
    instrument === "bass"
      ? generateBassline(root, scale, octave)
      : mergeRows(
          generateLead(root, scale, octave),
          generateChords(root, scale, octave - 1),
        );
  const tracks = buildScaleGrid(
    instrument,
    root,
    scale,
    octave,
    rows,
    VOLUME[instrument],
  );
  setSynthTracks(instrument, tracks);
}
