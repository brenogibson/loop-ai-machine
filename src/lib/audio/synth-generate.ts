import {
  bassOctaveFor,
  buildScaleGrid,
  generateBassline,
  generateChords,
  generateLead,
  mergeRows,
} from "./scale";
import type { SynthInstrument } from "./pattern";
import { STYLES } from "./styles";
import { useSequencer } from "@/store/sequencer";

// Local generative synth (no Claude round-trip): one call = a fresh
// randomized-but-musical riff, scale-locked to the session key. The first
// generated synth fixes the key; later ones reuse it so bass and lead always
// agree. Key/scale/density are seeded from the current STYLE's musical
// identity, so a Trap bass comes out sparse-and-minor while Samba is major
// and busy. Used by the grid section "gerar" buttons.
const OCTAVE: Record<SynthInstrument, number> = { bass: 2, lead: 4 };
const VOLUME: Record<SynthInstrument, number> = { bass: -4, lead: -8 };

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateSynthRiff(instrument: SynthInstrument): void {
  const { musicalKey, setMusicalKey, setSynthTracks, styleId } =
    useSequencer.getState();
  const identity = STYLES[styleId].identity;
  const root = musicalKey?.root ?? pick(identity.roots);
  const scale = musicalKey?.scale ?? pick(identity.scales);
  if (!musicalKey) setMusicalKey({ root, scale });

  // Bass register is capped: with high roots (Bb/B) octave 2 would spill into
  // octave 3, so the whole riff starts an octave lower instead. Styles may
  // shift the whole bass register (e.g. D&B +1 so the reese stays audible).
  const octave =
    instrument === "bass"
      ? bassOctaveFor(root, scale) + (identity.bassOctaveShift ?? 0)
      : OCTAVE[instrument];
  // Bass = single low riff. Lead = structured melody PLUS chord stabs (one
  // octave below) merged together, so it has both a hook and harmony.
  const rows =
    instrument === "bass"
      ? generateBassline(root, scale, octave, identity.bassHits)
      : mergeRows(
          generateLead(root, scale, octave, identity.leadDensity),
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
}
