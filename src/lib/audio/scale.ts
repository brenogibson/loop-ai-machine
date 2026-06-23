import type { SynthInstrument, SynthTrackMeta, Track, Step } from "./pattern";
import { emptySteps, stepsFrom } from "./pattern";

// Scale-locked note generation. Everything a synth can play is constrained to a
// key + scale, so a layperson editing the grid can never hit a wrong note.

const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export type ScaleName = "major" | "minor" | "dorian" | "minorPentatonic";

// Semitone offsets from the root for each scale.
const SCALE_STEPS: Record<ScaleName, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minorPentatonic: [0, 3, 5, 7, 10],
};

function rootIndex(root: string): number {
  // Normalize sharps to the flat spelling we store.
  const sharpToFlat: Record<string, string> = {
    "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb",
  };
  const r = sharpToFlat[root] ?? root;
  const i = NOTE_NAMES.indexOf(r);
  return i < 0 ? 0 : i;
}

// Absolute semitone for a note name like "C2" / "Eb4" (C0 = 0).
function noteToSemitone(note: string): number {
  const m = note.match(/^([A-G][b#]?)(-?\d+)$/);
  if (!m) return 0;
  return rootIndex(m[1]) + 12 * parseInt(m[2], 10);
}

function semitoneToNote(semitone: number): string {
  const pc = ((semitone % 12) + 12) % 12;
  const octave = Math.floor(semitone / 12);
  return `${NOTE_NAMES[pc]}${octave}`;
}

// Find the scale degree (0-based) and octave offset of an absolute semitone
// relative to a key. Snaps to the nearest degree if slightly off-scale.
function degreeOfSemitone(
  semitone: number,
  root: string,
  scale: ScaleName,
): { degree: number; octaveOffset: number } {
  const steps = SCALE_STEPS[scale];
  const interval = semitone - rootIndex(root);
  const octaveOffset = Math.floor(interval / 12);
  const within = ((interval % 12) + 12) % 12;
  // Nearest scale degree to `within`.
  let degree = 0;
  let bestDist = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const d = Math.abs(steps[i] - within);
    if (d < bestDist) {
      bestDist = d;
      degree = i;
    }
  }
  return { degree, octaveOffset };
}

// Transpose a single note from one key to another by SCALE DEGREE: the note
// keeps its degree (and octave offset) but is voiced in the new key/scale. This
// preserves the riff shape across both root changes and scale changes, and the
// result is always in the new scale. Degrees beyond a smaller scale (e.g.
// pentatonic) are clamped to the top degree.
export function transposeNote(
  note: string,
  fromRoot: string,
  fromScale: ScaleName,
  toRoot: string,
  toScale: ScaleName,
): string {
  const { degree, octaveOffset } = degreeOfSemitone(
    noteToSemitone(note),
    fromRoot,
    fromScale,
  );
  const toSteps = SCALE_STEPS[toScale];
  const clamped = Math.min(degree, toSteps.length - 1);
  const semitone = rootIndex(toRoot) + toSteps[clamped] + 12 * octaveOffset;
  return semitoneToNote(semitone);
}

// Build ascending in-scale note names across octaves, e.g. ["C2","Eb2","G2",...].
// `count` notes starting at `startOctave`. Returned low→high.
export function scaleNotes(
  root: string,
  scale: ScaleName,
  startOctave: number,
  count: number,
): string[] {
  const steps = SCALE_STEPS[scale];
  const base = rootIndex(root);
  const out: string[] = [];
  let degree = 0;
  while (out.length < count) {
    const octaveSpan = Math.floor(degree / steps.length);
    const semitone = base + steps[degree % steps.length] + 12 * octaveSpan;
    const name = NOTE_NAMES[((semitone % 12) + 12) % 12];
    const octave = startOctave + Math.floor(semitone / 12);
    out.push(`${name}${octave}`);
    degree++;
  }
  return out;
}

export type SynthRowInput = {
  note: string;
  steps: number[]; // active 1/16 indices
  volumeDb?: number;
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Number of distinct pitches in a scale (before repeating the octave).
export function scaleSize(scale: ScaleName): number {
  return SCALE_STEPS[scale].length;
}

// Resolve a scale degree (0 = root) to an absolute note name, wrapping past the
// octave. Degrees are clamped so an out-of-range value still maps to a real
// note instead of undefined.
export function noteForDegree(
  root: string,
  scale: ScaleName,
  octave: number,
  degree: number,
): string {
  const size = scaleSize(scale);
  const safe = Math.max(0, Math.min(size, degree));
  return scaleNotes(root, scale, octave, safe + 1)[safe];
}

// Like noteForDegree but WRAPS across octaves instead of clamping, so degrees
// beyond the scale size (e.g. a triad's 3rd/5th = degree+2/+4) keep climbing
// into the next octave. Used by the melody/chord generator.
function degreeNote(
  root: string,
  scale: ScaleName,
  octave: number,
  degree: number,
): string {
  const d = Math.max(0, degree);
  return scaleNotes(root, scale, octave, d + 1)[d];
}

// Generate a randomized-but-musical bassline as rows (note → steps), locked to
// the scale. Rules that keep it groovy: the root anchors the downbeat, notes
// land mostly on strong/off-beats, and density varies per call so successive
// riffs feel different. Returns one row per distinct note used.
export function generateBassline(
  root: string,
  scale: ScaleName,
  octave = 2,
): SynthRowInput[] {
  const notes = scaleNotes(root, scale, octave, 5); // low → high, root first
  // Candidate onset positions, weighted toward musically strong spots.
  const strong = [0, 8]; // bar + half-bar
  const mid = [4, 12]; // backbeats
  const off = [2, 6, 10, 14]; // ands
  const syncopation = [3, 7, 11, 15]; // pushes

  // Build a set of onsets: always the downbeat, plus a random spread.
  const onsets = new Set<number>([0]);
  if (Math.random() < 0.85) onsets.add(pick([8, 10]));
  const extras = pick([2, 3, 4]); // how many more hits
  const palette = [...mid, ...off, ...(Math.random() < 0.5 ? syncopation : [])];
  for (let i = 0; i < extras; i++) onsets.add(pick(palette));
  void strong;

  // Assign a note to each onset. Downbeat = root; others lean low (indices
  // 0-2) so the line stays bass-like, with occasional reaches higher.
  const byNote = new Map<string, number[]>();
  const addHit = (note: string, step: number) => {
    const arr = byNote.get(note) ?? [];
    arr.push(step);
    byNote.set(note, arr);
  };
  for (const step of [...onsets].sort((a, b) => a - b)) {
    let note: string;
    if (step === 0) {
      note = notes[0]; // root anchors the downbeat
    } else {
      const lean = Math.random();
      const idx = lean < 0.55 ? 0 : lean < 0.8 ? pick([1, 2]) : pick([2, 3, 4]);
      note = notes[idx];
    }
    addHit(note, step);
  }

  return [...byNote.entries()].map(([note, steps]) => ({ note, steps }));
}

// Group flat (note, step) hits into one row per note.
function rowsFromHits(hits: Array<{ note: string; step: number }>): SynthRowInput[] {
  const byNote = new Map<string, number[]>();
  for (const h of hits) {
    const arr = byNote.get(h.note) ?? [];
    arr.push(h.step);
    byNote.set(h.note, arr);
  }
  return [...byNote.entries()].map(([note, steps]) => ({
    note,
    steps: steps.sort((a, b) => a - b),
  }));
}

// Merge several row lists into one, unioning steps per note (dedup + sorted).
export function mergeRows(...lists: SynthRowInput[][]): SynthRowInput[] {
  const byNote = new Map<string, Set<number>>();
  for (const list of lists) {
    for (const row of list) {
      const set = byNote.get(row.note) ?? new Set<number>();
      for (const s of row.steps) set.add(s);
      byNote.set(row.note, set);
    }
  }
  return [...byNote.entries()].map(([note, steps]) => ({
    note,
    steps: [...steps].sort((a, b) => a - b),
  }));
}

// A two-chord progression over the bar (one chord per half), drawn from
// pleasant diatonic root degrees. Each chord is a scale triad (root, 3rd, 5th)
// expressed as scale degrees relative to the key.
const PROGRESSIONS = [
  [0, 4], // I - V
  [0, 3], // I - IV
  [0, 5], // I - vi
  [5, 4], // vi - V
  [3, 4], // IV - V
  [0, 0], // static I (for simpler, hook-y lines)
];

function chordDegrees(rootDegree: number): number[] {
  // Triad = scale steps 0,2,4 above the chord root (in scale-degree space).
  return [rootDegree, rootDegree + 2, rootDegree + 4];
}

// Generate a melodic lead with structure: a two-chord progression, a repeating
// rhythmic motif, chord-tones on strong beats and passing tones on weak ones,
// a clear contour, and resolution to a stable note. This reads as a melody
// rather than a random walk, with a consistent note count.
export function generateLead(
  root: string,
  scale: ScaleName,
  octave = 4,
): SynthRowInput[] {
  const prog = pick(PROGRESSIONS);

  // Rhythmic motif: a half-bar (8 steps) cell that we repeat — repetition is
  // what makes a line feel intentional. Density picks how busy the cell is.
  const cells = [
    [0, 3, 6], // syncopated
    [0, 4, 6], // straight-ish
    [0, 2, 4, 6], // busy
    [0, 6], // sparse
    [0, 3, 4, 6],
  ];
  const cell = pick(cells);

  const hits: Array<{ note: string; step: number }> = [];
  let degree = pick([0, 2, 4]); // start on a chord-friendly degree

  for (let half = 0; half < 2; half++) {
    const base = half * 8;
    const chord = chordDegrees(prog[half]);
    const isLastHalf = half === 1;

    cell.forEach((c, i) => {
      const step = base + c;
      const strong = c === 0 || c === 4; // beats within the half-bar
      if (strong) {
        // Land on a chord tone near the current degree (keeps the contour).
        let best = chord[0];
        let bestDist = Infinity;
        for (const ct of chord) {
          const d = Math.abs(ct - degree);
          if (d < bestDist) {
            bestDist = d;
            best = ct;
          }
        }
        degree = best;
      } else {
        // Passing/neighbor tone: step toward the line's arc.
        const move = pick([-1, 1, 1, 2]);
        degree = Math.max(0, degree + move);
      }

      // Resolve the very last note to the tonic for a satisfying ending.
      if (isLastHalf && i === cell.length - 1) degree = 0;

      hits.push({ note: degreeNote(root, scale, octave, degree), step });
    });
  }

  return rowsFromHits(hits);
}

// Generate sustained chord stabs (triads) — the "chords" layer. Plays a triad
// per half-bar following the same kind of progression, so multiple notes sound
// together. Voiced a bit lower than the lead so they sit as a pad/comp.
export function generateChords(
  root: string,
  scale: ScaleName,
  octave = 3,
): SynthRowInput[] {
  const prog = pick(PROGRESSIONS.filter((p) => p[0] !== p[1])); // need movement
  const hits: Array<{ note: string; step: number }> = [];
  // Each chord hits on its half-bar downbeat, optionally re-struck mid-half.
  const restrike = Math.random() < 0.5;
  for (let half = 0; half < 2; half++) {
    const base = half * 8;
    const chord = chordDegrees(prog[half]);
    const steps = restrike ? [base, base + 4] : [base];
    for (const step of steps) {
      for (const ct of chord) {
        hits.push({ note: degreeNote(root, scale, octave, ct), step });
      }
    }
  }
  return rowsFromHits(hits);
}

// Turn a list of (note, steps) into grid Tracks for an instrument. Each row is
// one pitch; sampleId is synthetic and unique so the grid/engine can key on it.
let synthRowCounter = 0;
export function buildSynthTracks(
  instrument: SynthInstrument,
  rows: SynthRowInput[],
  defaultVolumeDb: number,
): Track[] {
  return rows.map((row) => {
    const meta: SynthTrackMeta = { kind: "synth", instrument, note: row.note };
    const steps: Step[] =
      row.steps.length > 0 ? stepsFrom(row.steps) : emptySteps();
    return {
      sampleId: `synth_${instrument}_${row.note}_${++synthRowCounter}`,
      steps,
      volumeDb: row.volumeDb ?? defaultVolumeDb,
      meta,
    };
  });
}

// Resolve a degree-based riff (from Claude's generate_synth) into note→steps
// rows. Degrees are 1-based (1 = root); clamped to the scale so nothing lands
// off-key. Default octave per instrument keeps bass low and lead higher.
export function rowsFromDegrees(
  root: string,
  scale: ScaleName,
  octave: number,
  notes: Array<{ degree: number; steps: number[] }>,
): SynthRowInput[] {
  const byNote = new Map<string, number[]>();
  for (const n of notes) {
    const note = noteForDegree(root, scale, octave, (n.degree ?? 1) - 1);
    const valid = (n.steps ?? []).filter(
      (s) => Number.isInteger(s) && s >= 0 && s <= 15,
    );
    if (valid.length === 0) continue;
    const arr = byNote.get(note) ?? [];
    arr.push(...valid);
    byNote.set(note, arr);
  }
  return [...byNote.entries()].map(([note, steps]) => ({ note, steps }));
}

// Build one row per note of a full scale octave (a mini piano-roll), so every
// in-scale note is on the grid to edit — not just the ones a generated riff
// happened to use. `hits` maps a note name to its active steps; notes absent
// from it get an empty (but editable) row. Rows are ordered high → low so the
// grid reads like a piano roll (higher pitch on top).
export function buildScaleGrid(
  instrument: SynthInstrument,
  root: string,
  scale: ScaleName,
  octave: number,
  hits: SynthRowInput[],
  defaultVolumeDb: number,
): Track[] {
  const degrees = SCALE_STEPS[scale].length;
  // Cover at least one octave from `octave`, but extend to span every note the
  // hits actually use (chords/leads can reach into the next octave) so no used
  // note is left without an editable row.
  let lo = noteToSemitone(scaleNotes(root, scale, octave, 1)[0]);
  let hi = noteToSemitone(scaleNotes(root, scale, octave, degrees + 1)[degrees]);
  for (const h of hits) {
    const s = noteToSemitone(h.note);
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  // Walk scale notes upward from `octave` until we pass `hi`, keeping those in
  // range. Building from the scale guarantees every row is in-scale.
  const span: string[] = [];
  for (let d = 0; ; d++) {
    const note = degreeNote(root, scale, octave, d);
    const semi = noteToSemitone(note);
    if (semi < lo) continue;
    if (semi > hi) break;
    span.push(note);
    if (d > 64) break; // safety
  }
  const stepsByNote = new Map(hits.map((h) => [h.note, h.steps]));
  const rows: SynthRowInput[] = span
    .reverse() // high → low (piano-roll order)
    .map((note) => ({ note, steps: stepsByNote.get(note) ?? [] }));
  return buildSynthTracks(instrument, rows, defaultVolumeDb);
}
