import type { Pattern } from "@/lib/audio/pattern";
import type { StyleId } from "@/lib/audio/styles";

// Everything needed to replay a loop on the share page: the pattern plus the
// Polly audio (base64 MP3) for each surprise track it references. Drum/synth
// tracks need no extra data — samples ship with the app and synth voices are
// rebuilt from note names. styleId (optional, for old payloads) restores the
// style color/texture/timbre on replay.
export type SharePayload = {
  version: 1;
  createdAt: string;
  vibeLabel: string | null;
  pattern: Pattern;
  surpriseAudio: Record<string, string>;
  styleId?: StyleId;
};
