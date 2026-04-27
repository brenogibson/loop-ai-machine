import { getCurrentEngine } from "@/lib/audio/engine-registry";
import { clearSurpriseAudio } from "@/lib/audio/surprise-registry";
import { useSequencer } from "@/store/sequencer";

/**
 * Full session reset: stops audio, frees surprise nodes, clears state,
 * returns to the demo pattern. Call when a new person arrives at the booth.
 */
export function hardResetSession(): void {
  const engine = getCurrentEngine();
  if (engine) {
    engine.stop();
    engine.clearSurpriseSources();
  }
  clearSurpriseAudio();
  useSequencer.getState().resetSession();
}
