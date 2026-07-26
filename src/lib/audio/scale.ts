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

// ---------------------------------------------------------------------------
// Circle of fifths — harmonic journey instead of random key jumps.
//
// Neighbouring keys on the circle share all but one note, so moving along it
// reads as the music *developing* rather than teleporting. The journey walks
// counter-clockwise (down a fifth = the classic V→I resolution, the strongest
// "arrival" in tonal music), alternating between a key and its relative
// minor/major every few steps for emotional contrast, and returns home after a
// full lap through all 12 keys.
// ---------------------------------------------------------------------------

// Clockwise circle of fifths (each step = up a perfect fifth).
const CIRCLE_OF_FIFTHS = [
  "C", "G", "D", "A", "E", "B", "Gb", "Db", "Ab", "Eb", "Bb", "F",
];

export type KeyStep = {
  root: string;
  scale: ScaleName;
  // Human-readable description of the harmonic move, for UI feedback.
  label: string;
};

const MINOR_SCALES: ScaleName[] = ["minor", "dorian", "minorPentatonic"];

function isMinor(scale: ScaleName): boolean {
  return MINOR_SCALES.includes(scale);
}

// Next stop on the harmonic journey. The root ALWAYS advances one step
// counter-clockwise on the circle (down a fifth — the V→I resolution), so a
// full lap visits all 12 keys and lands back home. Every 4th move also flips
// the mode (major ↔ minor) for emotional contrast, without disturbing the
// journey's position — flipping by moving the root to its relative would undo
// the advance and trap the trip in a 4-key loop.
export function nextKeyStep(
  current: { root: string; scale: ScaleName },
  stepIndex: number,
): KeyStep {
  const pos = CIRCLE_OF_FIFTHS.indexOf(NOTE_NAMES[rootIndex(current.root)]);
  const nextRoot = CIRCLE_OF_FIFTHS[((pos < 0 ? 0 : pos) - 1 + 12) % 12];
  const flipMood = stepIndex % 4 === 3;

  if (flipMood) {
    const goingMinor = !isMinor(current.scale);
    return {
      root: nextRoot,
      scale: goingMinor ? MINOR_SCALES[0] : "major",
      label: goingMinor ? "quinta abaixo + fica menor" : "quinta abaixo + fica maior",
    };
  }

  return {
    root: nextRoot,
    scale: current.scale,
    label: "quinta abaixo",
  };
}

// Bass register ceiling: no bass note may sit above this octave, or the line
// stops sounding like a bass (very audible with high roots like Bb/B, where
// the upper scale degrees spill into octave 3).
export const BASS_MAX_OCTAVE = 2;

// Drop a note by whole octaves until it's at or below `maxOctave` (pitch class
// preserved). Used to cap bass notes after transposition.
export function capNoteOctave(note: string, maxOctave: number): string {
  const m = note.match(/^([A-G][b#]?)(-?\d+)$/);
  if (!m) return note;
  const oct = parseInt(m[2], 10);
  return oct > maxOctave ? `${m[1]}${maxOctave}` : note;
}

// Starting octave for a bass riff in this key: if the riff's top degree would
// cross above BASS_MAX_OCTAVE (high roots), start one octave lower so the
// whole line stays in bass register.
export function bassOctaveFor(root: string, scale: ScaleName): number {
  const top = scaleNotes(root, scale, BASS_MAX_OCTAVE, 5)[4];
  const m = top.match(/(-?\d+)$/);
  const topOct = m ? parseInt(m[1], 10) : BASS_MAX_OCTAVE;
  return topOct > BASS_MAX_OCTAVE ? BASS_MAX_OCTAVE - 1 : BASS_MAX_OCTAVE;
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
// land mostly on strong/off-beats, and the line WALKS between degrees instead
// of hammering the root. Guarantees a minimum density (5-8 hits) — the old
// version sampled with replacement into a Set and often collapsed to 2-3 hits.
const BASS_MIN_HITS = 5;

export function generateBassline(
  root: string,
  scale: ScaleName,
  octave = 2,
): SynthRowInput[] {
  const notes = scaleNotes(root, scale, octave, 5); // low → high, root first

  // Onsets: anchors first, then fill from a weighted pool WITHOUT replacement
  // until the target density is reached — no collisions, no sparse riffs.
  const target = BASS_MIN_HITS + Math.floor(Math.random() * 4); // 5..8 hits
  const onsets = new Set<number>([0, pick([8, 10])]); // downbeat + mid anchor
  const pool = [4, 12, 2, 6, 10, 14, ...(Math.random() < 0.5 ? [3, 7, 11, 15] : [])]
    .filter((s) => !onsets.has(s));
  // Shuffle (Fisher-Yates) then take what we need.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (const step of pool) {
    if (onsets.size >= target) break;
    onsets.add(step);
  }

  // Notes: a walk over degrees 0-4. Root anchors the downbeat and the line
  // gravitates home, but never repeats one pitch more than twice in a row —
  // that's what made old riffs feel monotonous.
  const byNote = new Map<string, number[]>();
  const addHit = (note: string, step: number) => {
    const arr = byNote.get(note) ?? [];
    arr.push(step);
    byNote.set(note, arr);
  };
  let degree = 0;
  let repeats = 0;
  let prevNote: string | null = null;
  for (const step of [...onsets].sort((a, b) => a - b)) {
    if (step === 0) {
      degree = 0; // root anchors the downbeat
    } else {
      // May hold the same pitch (groove repetition) but never 3+ in a row.
      const stay = repeats < 2 && Math.random() < 0.3;
      if (!stay) {
        const move = pick([-2, -1, -1, 1, 1, 2, 2, 3]);
        let next = degree + move;
        if (next < 0 || next > 4) next = degree - move; // bounce off the range
        degree = Math.max(0, Math.min(4, next));
      }
    }
    const note = notes[degree];
    repeats = prevNote === note ? repeats + 1 : 0;
    prevNote = note;
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

// Harmony layer: at most TWO stacked moments per loop, and each is a DYAD
// (two notes), never a full triad. Full triads on every half-bar made the loop
// muddy and confusing — single notes carry the melody, and these sparse double
// stops just mark the harmony. Voiced below the lead so they sit underneath.
const MAX_CHORD_HITS = 2;

export function generateChords(
  root: string,
  scale: ScaleName,
  octave = 3,
): SynthRowInput[] {
  const prog = pick(PROGRESSIONS.filter((p) => p[0] !== p[1])); // need movement
  const hits: Array<{ note: string; step: number }> = [];
  // One stab per half-bar downbeat at most; sometimes only a single stab.
  const count = Math.random() < 0.35 ? 1 : MAX_CHORD_HITS;
  for (let i = 0; i < count; i++) {
    const chordRoot = prog[i] ?? prog[0];
    // Dyad: root + third, or root + fifth (open, less cluttered).
    const partner = Math.random() < 0.5 ? chordRoot + 2 : chordRoot + 4;
    for (const deg of [chordRoot, partner]) {
      hits.push({ note: degreeNote(root, scale, octave, deg), step: i * 8 });
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
