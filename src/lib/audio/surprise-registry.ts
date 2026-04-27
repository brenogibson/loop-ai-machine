// Holds the raw base64 audio for each surprise track currently in the pattern.
// Needed so offline rendering (export MP3) can rebuild the surprise players
// in a fresh OfflineAudioContext — AudioBuffers aren't portable across contexts.

const store = new Map<string, string>();

export function registerSurpriseAudio(sampleId: string, base64: string): void {
  store.set(sampleId, base64);
}

export function unregisterSurpriseAudio(sampleId: string): void {
  store.delete(sampleId);
}

export function getSurpriseAudio(sampleId: string): string | undefined {
  return store.get(sampleId);
}

export function surpriseAudioEntries(): Array<[string, string]> {
  return Array.from(store.entries());
}
