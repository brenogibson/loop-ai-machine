import type { DrumEngine } from "./engine";

let current: DrumEngine | null = null;

export function setCurrentEngine(engine: DrumEngine | null): void {
  current = engine;
}

export function getCurrentEngine(): DrumEngine | null {
  return current;
}
