import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import type { Engine, LanguageCode, VoiceId } from "@aws-sdk/client-polly";
import { getClaude, CLAUDE_MODEL } from "@/lib/claude/client";
import {
  SURPRISE_TOOL,
  VOICE_OPTIONS,
  STYLES,
  type SurpriseStyle,
} from "@/lib/claude/surprise-tool";

function pickRandomHint(avoid: Set<SurpriseStyle>): SurpriseStyle {
  const pool = STYLES.filter((s) => !avoid.has(s));
  return pool[Math.floor(Math.random() * pool.length)] ?? STYLES[0];
}

function pickRandomStepHint(): string {
  const options = [
    "step 0 (batida 1 — drop/impacto)",
    "step 4 (batida 2 — cai com o snare)",
    "step 8 (metade do compasso — virada)",
    "step 12 (batida 4 — antecipação)",
    "step 14 (final, em cima do último contratempo)",
    "step 15 (última fantasma — ponte pro próximo ciclo)",
    "steps 0 e 8 (dois ataques equilibrados)",
    "steps 4 e 12 (dobra no backbeat)",
  ];
  return options[Math.floor(Math.random() * options.length)];
}
import { currentPatternBlock } from "@/lib/claude/prompt";
import { synthesizeSpeech } from "@/lib/surprise/polly";
import type { Pattern } from "@/lib/audio/pattern";

type RequestBody = {
  pattern: Pattern;
  vibeLabel?: string | null;
  recentPhrases?: string[];
};

type SurpriseArgs = {
  phrase: string;
  language: "pt-BR" | "en-US";
  voice_id: string;
  style: SurpriseStyle;
  steps: number[];
  volume_db: number;
  commentary: string;
};

const SURPRISE_SYSTEM = `Você é o "DJ surpresa" de uma drum machine. Sua função: inventar uma frase de efeito curta pra ser falada sobre o beat atual e escolher como processá-la.

## Regras de escolha
- A frase deve ser CURTA (1 a 6 palavras), memorable, tipo sample de produtor. Ex: "segura o drop", "vamo monstro", "that's the vibe", "3 2 1 go", "let it ride", "turn it up".
- Varie entre PT-BR e EN-US conforme a vibe: funk/samba/lofi BR → pt-BR; trap/dnb/ambient → en-US normalmente, mas ocasionalmente quebre o padrão pra surpreender.
- A voz escolhida deve bater com o idioma: Camila/Thiago/Vitoria só pra pt-BR; Matthew/Ruth/Stephen/Danielle só pra en-US.
- Estilos disponíveis e quando usar:
  - robotic: trap pesado, dnb; voz distorcida tipo vocoder
  - melodic: lofi, ambient; voz com reverb longo e cor
  - reverse: efeito psicodélico, funciona em qualquer vibe agressiva
  - stutter: trap, dnb; chop repetitivo
  - pitched_up: fininho, cômico, funciona em trap/dnb pra tensão
  - pitched_down: grave/monstro, ambient/trap pesado
  - telephone: filtro estreito, lofi/ambient nostálgico
- Steps: escolha 1-2 steps (raramente 3-4). Step 0 = drop, step 8 = metade do compasso (sempre impacta), step 4/12 = onde o snare bate, step 15 = último 1/16 (fantasma).
- Volume: -3 a 0 pra destaque (drops), -6 a -9 pra textura de fundo.

## Regra crítica de variedade
Cada surpresa deve ser DIFERENTE das anteriores. Nunca reuse frase já usada na sessão (será listada). Alterne deliberadamente entre estilos, idiomas, vozes e steps entre chamadas consecutivas. Se as últimas surpresas foram robotic+EN, escolha algo como pitched_down+PT-BR ou telephone+EN desta vez. O hint de estilo que o usuário passar é só sugestão — varie também do hint se fizer sentido, mas NUNCA repita frase.

## Regra crítica de fonética (MUITO IMPORTANTE)
A frase vai passar por TTS (Amazon Polly). A voz escolhida pronuncia o texto seguindo as regras do idioma dela. Grafias "erradas" pro idioma da voz causam pronúncia bizarra.

Duas opções pra lidar com isso:

**1. Frase em PT-BR com voz pt-BR (Camila/Thiago/Vitoria):** evite anglicismos. Se precisar de uma palavra em inglês (gírias de produção tipo "beat", "drop", "flow", "vibe"), faça UMA das duas:
   a) **Grafe foneticamente em português** — "beat" → "bíti", "drop" → "drópi", "flow" → "flô", "vibe" → "váibi", "groove" → "grúvi", "hype" → "ráipi", "fire" → "fáier". Escolha esta opção por padrão — soa mais natural e divertido.
   b) **Use a tag {en}...{/en}** no trecho inglês e o backend aplica SSML pra Polly alternar idioma. Ex: "cola no {en}beat{/en}". Use com moderação (1 palavra por frase no máx).

**2. Frase em EN-US com voz en-US (Matthew/Ruth/Stephen/Danielle):** escreva inglês normal. Não misture palavras em português — Polly vai pronunciar ao pé da letra em inglês ("vamo" viraria "vay-mo").

Exemplos bons:
- pt-BR: "segura o drópi", "vai no bíti", "esse grúvi é meu", "cola no {en}drop{/en}"
- en-US: "turn it up", "that's the vibe", "feel the pressure", "let it ride"

Exemplos RUINS (NÃO faça):
- pt-BR "cola no beat" (Polly lê "bê-á-ti")
- pt-BR "drop incrível" (Polly lê "drópê")
- en-US "vamo let it ride" (Polly en-US estraga "vamo")

Responda SEMPRE chamando generate_surprise.`;

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body?.pattern) {
    return NextResponse.json({ error: "missing pattern" }, { status: 400 });
  }

  const client = getClaude();
  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: SURPRISE_SYSTEM,
      cache_control: { type: "ephemeral" },
    },
  ];

  const recentPhrases = (body.recentPhrases ?? []).slice(-7);
  const recentLines =
    recentPhrases.length > 0
      ? `\n\nFrases já usadas nesta sessão (NÃO repita nenhuma, nem paráfrase óbvia): ${recentPhrases.map((p) => `"${p}"`).join(", ")}`
      : "";

  const styleHint = pickRandomHint(new Set<SurpriseStyle>());
  const stepHint = pickRandomStepHint();
  const varietyHint = `\n\nPra essa surpresa, considere usar o estilo "${styleHint}" e disparar em: ${stepHint}. Você pode escolher diferente se fizer mais sentido pro beat, mas varie — não repita o mesmo padrão das surpresas anteriores.`;

  const userMessage = `${currentPatternBlock(body.pattern)}${
    body.vibeLabel ? `\nVibe atual: ${body.vibeLabel}` : ""
  }${recentLines}${varietyHint}\n\nInvente uma frase de surpresa pra esse beat.`;

  let args: SurpriseArgs;
  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      temperature: 1.0,
      system: systemBlocks,
      tools: [SURPRISE_TOOL],
      tool_choice: { type: "tool", name: "generate_surprise" },
      messages: [{ role: "user", content: userMessage }],
    });
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolUse) {
      return NextResponse.json({ error: "no tool_use" }, { status: 502 });
    }
    args = toolUse.input as SurpriseArgs;
  } catch (err) {
    console.error("claude surprise error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `claude failed: ${msg}` },
      { status: 502 },
    );
  }

  // Validate
  const voice = VOICE_OPTIONS.find((v) => v.id === args.voice_id);
  if (!voice) {
    return NextResponse.json(
      { error: `invalid voice_id: ${args.voice_id}` },
      { status: 502 },
    );
  }
  if (voice.language !== args.language) {
    args.language = voice.language as "pt-BR" | "en-US";
  }
  if (!STYLES.includes(args.style)) {
    return NextResponse.json(
      { error: `invalid style: ${args.style}` },
      { status: 502 },
    );
  }
  const steps = (args.steps ?? [])
    .filter((s) => Number.isInteger(s) && s >= 0 && s <= 15)
    .slice(0, 4);
  if (steps.length === 0) steps.push(8);
  const volumeDb = Math.max(-12, Math.min(3, args.volume_db ?? -3));

  // Polly
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
    console.error("polly error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `polly failed: ${msg}` },
      { status: 502 },
    );
  }

  return NextResponse.json({
    phrase: args.phrase,
    language: args.language,
    voice_id: args.voice_id,
    style: args.style,
    steps,
    volume_db: volumeDb,
    commentary: args.commentary,
    audio_base64: audioBase64,
    audio_mime: "audio/mpeg",
  });
}
