import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import type { Engine, LanguageCode, VoiceId } from "@aws-sdk/client-polly";
import { getClaude, CLAUDE_MODEL } from "@/lib/claude/client";
import {
  SURPRISE_TOOL,
  VOICE_OPTIONS,
  ACTIVE_STYLES,
  type SurpriseStyle,
} from "@/lib/claude/surprise-tool";

function pickRandomStyleHint(): SurpriseStyle {
  return (
    ACTIVE_STYLES[Math.floor(Math.random() * ACTIVE_STYLES.length)] ??
    ACTIVE_STYLES[0]
  );
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

// Rotates categories every call so Claude doesn't gravitate to the same
// register. Each category is a mini-brief describing a *kind* of phrase.
function pickRandomCategoryHint(): string {
  const categories = [
    "uma ORDEM direta com verbo no imperativo (ex: 'solta', 'joga', 'sobe', 'trava', 'racha')",
    "uma GÍRIA ou expressão coloquial que produtores usariam em um sample pack",
    "uma ONOMATOPEIA ou vocalização curta (ex: 'uh', 'yeah', 'heey', 'rá', 'psiu', 'tss')",
    "uma CONTAGEM ou chamada pra drop (ex: '1 2 3 vai', 'em 3', 'já já', 'se prepara')",
    "uma INTERJEIÇÃO de reação (ex: 'nossa', 'eita', 'caramba', 'wow', 'ah não', 'meu deus')",
    "uma PROVOCAÇÃO ou brincadeira com o ouvinte (ex: 'dança aí', 'tá mole', 'vem comigo')",
    "uma AFIRMAÇÃO de identidade (ex: 'esse som é nosso', 'isso é batidão', 'hood shit')",
    "uma PERGUNTA retórica (ex: 'sentiu?', 'tá escutando?', 'tá pegando?', 'you feel it?')",
    "uma REFERÊNCIA a parte do corpo/movimento (ex: 'requebra', 'treme', 'mexe a cintura')",
    "uma DECLARAÇÃO meta sobre a própria música (ex: 'isso sim é beat', 'grúvi bom demais')",
    "uma VOZ de rádio/apresentador (ex: 'ao vivo', 'e agora', 'direto dos estúdios')",
    "uma sentença de DOIS TEMPOS com contraste (ex: 'devagar... rápido', 'sobe e desce')",
    "uma FALA hype de torcida/estádio (ex: 'vamo vamo', 'é nóis', 'na veia')",
    "uma FRASE-cartão minimalista de UMA palavra impactante",
    "uma CHAMADA na primeira pessoa (ex: 'eu disse', 'me escuta', 'aqui é sério')",
  ];
  return categories[Math.floor(Math.random() * categories.length)];
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

## Como montar a frase
- CURTA: 1 a 6 palavras. Memorável, tipo sample de produtor.
- ORIGINAL: a cada chamada você recebe uma CATEGORIA sugerida (ordem, gíria, onomatopeia, contagem, interjeição, provocação, etc). Siga essa categoria pra ter variedade real.
- NUNCA use frases manjadas tipo "segura o drop", "turn it up", "vamo monstro", "let it ride" — essas são lugar-comum. Invente frases novas, específicas pra essa vibe/contexto.
- A frase pode ser absurda, poética, engraçada, brava, sensual, misteriosa — qualquer tom. Só não pode ser genérica nem repetir anteriores.

## Idioma e voz
- Varie entre PT-BR e EN-US conforme a vibe: funk/samba/lofi brasileiro → pt-BR; trap/dnb/ambient → frequentemente en-US mas quebre o padrão.
- A voz escolhida DEVE bater com o idioma: Camila/Thiago/Vitoria só pra pt-BR; Matthew/Ruth/Stephen/Danielle só pra en-US.
- Rotacione as vozes ao longo da sessão — não use sempre a mesma.

## Estilos de processamento disponíveis
- melodic: reverb + chorus, voz com cor — lofi, ambient
- reverse: toca ao contrário — psicodélico, funciona em vibes agressivas
- stutter: chop repetitivo — trap, dnb
- pitched_up: voz fina — trap/dnb pra tensão, cômico
- telephone: filtro estreito — lofi, ambient nostálgico

## Steps e volume
- Steps: 1-2 tipicamente. Step 0 = drop, step 8 = meio do compasso (sempre impacta), 4/12 = batida do snare, 15 = fantasma.
- Volume: -3 a 0 pra destaque; -6 a -9 pra fundo.

## Regra crítica de variedade
Cada surpresa deve ser DIFERENTE das anteriores. Nunca reuse frase já usada na sessão (será listada). Alterne deliberadamente CATEGORIA DE FRASE, estilo, idioma, voz e steps. Se as últimas surpresas foram imperativas em PT-BR, agora faça uma pergunta em EN-US, ou uma onomatopeia, ou uma interjeição. Busque o contraste.

## Regra crítica de fonética (MUITO IMPORTANTE)
A frase vai passar por TTS (Amazon Polly). A voz pronuncia o texto seguindo as regras do idioma dela — grafias "erradas" causam pronúncia bizarra.

**Frase em PT-BR com voz pt-BR:** evite anglicismos. Se precisar de palavra em inglês:
  a) Grafe foneticamente em português: "beat" → "bíti", "drop" → "drópi", "flow" → "flô", "vibe" → "váibi", "groove" → "grúvi", "hype" → "ráipi", "fire" → "fáier". Padrão preferido.
  b) Use tag \`{en}palavra{/en}\` e o backend aplica SSML. Ex: "cola no {en}drop{/en}". Máx 1 palavra por frase.

**Frase em EN-US com voz en-US:** escreva inglês normal. NÃO misture português.

Exemplos de problemas a evitar:
- pt-BR "cola no beat" → Polly lê "bê-á-ti"
- pt-BR "drop incrível" → Polly lê "drópê"
- en-US "vamo let it ride" → Polly en-US estraga "vamo"

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

  const recentPhrases = (body.recentPhrases ?? []).slice(-12);
  const recentLines =
    recentPhrases.length > 0
      ? `\n\nFrases já usadas nesta sessão (NÃO repita nenhuma, nem paráfrase óbvia): ${recentPhrases.map((p) => `"${p}"`).join(", ")}`
      : "";

  const categoryHint = pickRandomCategoryHint();
  const styleHint = pickRandomStyleHint();
  const stepHint = pickRandomStepHint();
  const varietyHint = `\n\n**Categoria da frase desta vez:** ${categoryHint}.
Estilo sugerido: "${styleHint}" (pode mudar se não combinar).
Step sugerido: ${stepHint}.
Regra dura: a frase deve ser ORIGINAL, não pode ser uma das frases listadas acima nem um clichê manjado ("segura o drop", "turn it up", etc).`;

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
  if (!ACTIVE_STYLES.includes(args.style)) {
    // Claude broke the enum — either invented a style or reached for a
    // disabled one. Fall back to a random active style instead of 502ing.
    args.style = pickRandomStyleHint();
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
