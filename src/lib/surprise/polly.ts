import {
  PollyClient,
  SynthesizeSpeechCommand,
  type Engine,
  type LanguageCode,
  type TextType,
  type VoiceId,
} from "@aws-sdk/client-polly";

let cached: PollyClient | null = null;

export function getPolly(): PollyClient {
  if (cached) return cached;
  cached = new PollyClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  return cached;
}

const EN_TAG_RE = /\{en\}(.*?)\{\/en\}/g;

function escapeSsmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// If the phrase contains {en}...{/en} markers, convert to SSML with
// <lang xml:lang="en-US"> wrapping the inner text so Polly pronounces
// that span with English phonetics even when the voice is pt-BR (or vice-versa
// for an en-US voice, where the fallback language is pt-BR).
function maybeWrapSsml(text: string, languageCode: LanguageCode): {
  content: string;
  textType: TextType;
} {
  if (!EN_TAG_RE.test(text)) {
    return { content: text, textType: "text" };
  }
  EN_TAG_RE.lastIndex = 0;
  const altLang = languageCode === "en-US" ? "pt-BR" : "en-US";
  let last = 0;
  let body = "";
  let match: RegExpExecArray | null;
  while ((match = EN_TAG_RE.exec(text)) !== null) {
    body += escapeSsmlText(text.slice(last, match.index));
    body += `<lang xml:lang="${altLang}">${escapeSsmlText(match[1])}</lang>`;
    last = match.index + match[0].length;
  }
  body += escapeSsmlText(text.slice(last));
  return { content: `<speak>${body}</speak>`, textType: "ssml" };
}

export async function synthesizeSpeech(params: {
  text: string;
  voiceId: VoiceId;
  engine: Engine;
  languageCode: LanguageCode;
}): Promise<Buffer> {
  const client = getPolly();
  const { content, textType } = maybeWrapSsml(params.text, params.languageCode);
  const res = await client.send(
    new SynthesizeSpeechCommand({
      Text: content,
      TextType: textType,
      VoiceId: params.voiceId,
      Engine: params.engine,
      OutputFormat: "mp3",
      LanguageCode: params.languageCode,
      SampleRate: "24000",
    }),
  );
  if (!res.AudioStream) throw new Error("polly returned no audio stream");
  const stream = res.AudioStream as { transformToByteArray(): Promise<Uint8Array> };
  const bytes = await stream.transformToByteArray();
  return Buffer.from(bytes);
}
