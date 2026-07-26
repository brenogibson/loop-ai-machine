import * as Tone from "tone";

// Master FX bus for live playback. Every live source (drums, synth, surprises)
// connects to `input` instead of the destination, so gesture-controlled effects
// act on the whole mix. The offline/export path does NOT go through this bus —
// gesture FX are live performance, not part of the rendered MP3.
//
//   input(Gain) → Filter(lowpass) → Tremolo(stutter gate) → Freeverb → out
export type MasterBus = {
  input: Tone.Gain;
  // Post-FX taps for visualizations (background spectrum, kick pulse).
  fft: Tone.Analyser;
  meter: Tone.Meter;
  setFilterAmount: (amount: number) => void; // 0 = dark/muffled, 1 = open
  setStutter: (on: boolean, bpm: number) => void;
  setReverbAmount: (amount: number) => void; // 0 = dry, 1 = huge
  // Build-up & drop in two phases: performDrop runs the build (filter closing,
  // riser, tightening gate) and lands in a HELD "dropped" state (open filter +
  // reverb bloom) that persists until releaseDrop() dries it back to normal.
  // Returns the build duration in seconds, or null if already running.
  performDrop: (bpm: number, bars?: number) => number | null;
  releaseDrop: () => void;
  // Abort a build mid-way (e.g. gesture hands came down early): cancels the
  // scheduled ramps, kills the riser and restores the neutral state.
  cancelDrop: () => void;
  dispose: () => void;
};

const FILTER_MIN_HZ = 250;
const FILTER_MAX_HZ = 18000;
const REVERB_MAX_WET = 0.6;

let current: MasterBus | null = null;

export function getMasterBus(): MasterBus {
  if (current) return current;

  const input = new Tone.Gain(1);
  const filter = new Tone.Filter({ type: "lowpass", frequency: FILTER_MAX_HZ, Q: 1 });
  // Square-wave tremolo at 1/16-note rate reads as a rhythmic gate/stutter.
  const stutter = new Tone.Tremolo({ type: "square", depth: 1, wet: 0 }).start();
  const reverb = new Tone.Freeverb({ roomSize: 0.85, dampening: 2500, wet: 0 });

  input.connect(filter);
  filter.connect(stutter);
  stutter.connect(reverb);
  reverb.toDestination();

  // Visualization taps on the final mix (parallel — don't affect the audio).
  const fft = new Tone.Analyser("fft", 64);
  const meter = new Tone.Meter({ smoothing: 0.7 });
  reverb.connect(fft);
  reverb.connect(meter);

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  let dropActive = false;
  let riserCleanup: (() => void) | null = null;

  const performDrop = (bpm: number, bars = 2): number | null => {
    if (dropActive) return null;
    dropActive = true;
    const secPerBar = (60 / Math.max(40, bpm)) * 4;
    const buildS = bars * secPerBar;
    const now = Tone.now();

    // Filter sweeps down over the build, snaps open at the drop.
    filter.frequency.cancelScheduledValues(now);
    filter.frequency.setValueAtTime(filter.frequency.value, now);
    filter.frequency.exponentialRampToValueAtTime(420, now + buildS);
    filter.frequency.setValueAtTime(FILTER_MAX_HZ, now + buildS + 0.01);

    // Noise riser: filtered white noise sweeping up, cut dead at the drop.
    const riserNoise = new Tone.Noise("white");
    const riserFilter = new Tone.Filter({ type: "bandpass", frequency: 300, Q: 2 });
    const riserGain = new Tone.Gain(0);
    riserNoise.connect(riserFilter);
    riserFilter.connect(riserGain);
    riserGain.connect(reverb); // join the mix pre-reverb tap so visuals see it
    riserNoise.start(now);
    riserFilter.frequency.exponentialRampToValueAtTime(6000, now + buildS);
    riserGain.gain.linearRampToValueAtTime(0.5, now + buildS * 0.9);
    riserGain.gain.setValueAtTime(0, now + buildS);
    riserNoise.stop(now + buildS + 0.05);

    // Stutter tightens through the last bar for tension, released at the drop.
    stutter.frequency.value = (Math.max(40, bpm) / 60) * 4;
    stutter.wet.setValueAtTime(0, now + buildS - secPerBar);
    stutter.wet.linearRampToValueAtTime(1, now + buildS - 0.05);
    stutter.wet.setValueAtTime(0, now + buildS);

    // Reverb blooms right at the drop and HOLDS — the "dropped" state persists
    // until releaseDrop() is called (user-controlled, not a timer).
    reverb.wet.setValueAtTime(REVERB_MAX_WET, now + buildS);

    const disposeRiser = () => {
      riserNoise.dispose();
      riserFilter.dispose();
      riserGain.dispose();
      riserCleanup = null;
    };
    const timer = setTimeout(disposeRiser, (buildS + 0.5) * 1000);
    riserCleanup = () => {
      clearTimeout(timer);
      try {
        riserNoise.stop();
      } catch {
        // already stopped
      }
      disposeRiser();
    };

    return buildS;
  };

  const releaseDrop = () => {
    if (!dropActive) return;
    reverb.wet.rampTo(0, 0.6);
    dropActive = false;
  };

  const cancelDrop = () => {
    if (!dropActive) return;
    const now = Tone.now();
    riserCleanup?.();
    // Wipe every scheduled ramp and restore the neutral mix.
    filter.frequency.cancelScheduledValues(now);
    filter.frequency.rampTo(FILTER_MAX_HZ, 0.15);
    stutter.wet.cancelScheduledValues(now);
    stutter.wet.rampTo(0, 0.1);
    reverb.wet.cancelScheduledValues(now);
    reverb.wet.rampTo(0, 0.3);
    dropActive = false;
  };

  current = {
    input,
    fft,
    meter,
    setFilterAmount: (amount) => {
      // Exponential sweep feels linear to the ear.
      const a = clamp01(amount);
      const freq = FILTER_MIN_HZ * Math.pow(FILTER_MAX_HZ / FILTER_MIN_HZ, a);
      filter.frequency.rampTo(freq, 0.05);
    },
    setStutter: (on, bpm) => {
      if (on) {
        // 1/16-note gate; read bpm at engage time (gesture is momentary).
        stutter.frequency.value = (Math.max(40, bpm) / 60) * 4;
        stutter.wet.rampTo(1, 0.03);
      } else {
        stutter.wet.rampTo(0, 0.08);
      }
    },
    setReverbAmount: (amount) => {
      // The held drop owns the reverb; gesture control resumes after release.
      if (dropActive) return;
      reverb.wet.rampTo(clamp01(amount) * REVERB_MAX_WET, 0.1);
    },
    performDrop,
    releaseDrop,
    cancelDrop,
    dispose: () => {
      input.dispose();
      filter.dispose();
      stutter.dispose();
      reverb.dispose();
      fft.dispose();
      meter.dispose();
      current = null;
    },
  };
  return current;
}
