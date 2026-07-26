import type { Pattern } from "@/lib/audio/pattern";

// Everything needed to replay a loop on the share page: the pattern plus the
// Polly audio (base64 MP3) for each surprise track it references. Drum/synth
// tracks need no extra data — samples ship with the app and synth voices are
// rebuilt from note names.
export type SharePayload = {
  version: 1;
  createdAt: string;
  vibeLabel: string | null;
  pattern: Pattern;
  surpriseAudio: Record<string, string>;
};
