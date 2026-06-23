import type { Engine, LanguageCode, VoiceId } from "@aws-sdk/client-polly";
import {
  VOICE_OPTIONS,
  ACTIVE_STYLES,
  type SurpriseStyle,
} from "@/lib/claude/surprise-tool";
import { synthesizeSpeech } from "@/lib/surprise/polly";

// Raw tool arguments Claude produces for a surprise (from either the dedicated
// /api/surprise call or the generate_surprise tool inside the chat agent).
export type SurpriseArgs = {
  phrase: string;
  language: "pt-BR" | "en-US";
  voice_id: string;
  style: SurpriseStyle;
  steps: number[];
  volume_db: number;
  commentary: string;
};

export type SurpriseLangPref = "auto" | "pt-BR" | "en-US";

export type SurpriseResult = {
  phrase: string;
  language: "pt-BR" | "en-US";
  voice_id: string;
  style: SurpriseStyle;
  steps: number[];
  volume_db: number;
  commentary: string;
  audio_base64: string;
  audio_mime: "audio/mpeg";
};

function pickRandomActiveStyle(): SurpriseStyle {
  return (
    ACTIVE_STYLES[Math.floor(Math.random() * ACTIVE_STYLES.length)] ??
    ACTIVE_STYLES[0]
  );
}

// Validate the tool args, reconcile voice/language (honoring a forced language
// preference), clamp values, and synthesize the phrase with Polly. Shared by
// the Surprise button route and the chat agent so both behave identically.
export async function synthesizeSurprise(
  args: SurpriseArgs,
  langPref: SurpriseLangPref = "auto",
): Promise<
  | { ok: true; data: SurpriseResult }
  | { ok: false; error: string }
> {
  let voice = VOICE_OPTIONS.find((v) => v.id === args.voice_id);
  if (!voice) {
    // Claude invented a voice — fall back to one matching the language pref or
    // the requested language instead of failing.
    const wantLang = langPref !== "auto" ? langPref : args.language;
    voice = VOICE_OPTIONS.find((v) => v.language === wantLang) ?? VOICE_OPTIONS[0];
    args.voice_id = voice.id;
  }
  // Forced language overrides a mismatched voice choice.
  if (langPref !== "auto" && voice.language !== langPref) {
    const fallback = VOICE_OPTIONS.find((v) => v.language === langPref);
    if (fallback) {
      voice = fallback;
      args.voice_id = fallback.id;
    }
  }
  if (voice.language !== args.language) {
    args.language = voice.language as "pt-BR" | "en-US";
  }
  if (!ACTIVE_STYLES.includes(args.style)) {
    // Disabled or invented style — pick a random active one rather than 502.
    args.style = pickRandomActiveStyle();
  }
  const steps = (args.steps ?? [])
    .filter((s) => Number.isInteger(s) && s >= 0 && s <= 15)
    .slice(0, 4);
  if (steps.length === 0) steps.push(8);
  const volumeDb = Math.max(-12, Math.min(3, args.volume_db ?? -3));

  let audioBase64: string;
  try {
    const audio = await synthesizeSpeech({
      text: args.phrase,
      voiceId: voice.id as VoiceId,
      engine: voice.engine as Engine,
      languageCode: voice.language as LanguageCode,
    });
    audioBase64 = audio.toString("base64");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `polly failed: ${msg}` };
  }

  return {
    ok: true,
    data: {
      phrase: args.phrase,
      language: args.language,
      voice_id: args.voice_id,
      style: args.style,
      steps,
      volume_db: volumeDb,
      commentary: args.commentary,
      audio_base64: audioBase64,
      audio_mime: "audio/mpeg",
    },
  };
}
