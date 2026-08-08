import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { getClaude, CLAUDE_MODEL } from "@/lib/claude/client";
import {
  SURPRISE_TOOL,
  ACTIVE_STYLES,
  type SurpriseStyle,
} from "@/lib/claude/surprise-tool";
import { synthesizeSurprise, type SurpriseArgs } from "@/lib/surprise/synth";

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
    "uma ORDEM direta pra dançar/curtir (ex: 'solta o corpo', 'vem pra pista', 'mão pro alto')",
    "uma CHAMADA pra um drop/virada (ex: 'segura essa', 'agora vai', 'preparou?')",
    "uma PROVOCAÇÃO animada pro público (ex: 'dança comigo', 'mostra que sabe', 'tá tímido?')",
    "uma PERGUNTA retórica de pista (ex: 'tá sentindo isso?', 'todo mundo na pista?', 'cadê a energia?')",
    "uma REFERÊNCIA a movimento/dança (ex: 'requebra devagar', 'treme tudo', 'desce até o chão')",
    "uma AFIRMAÇÃO de identidade/atitude (ex: 'esse é o nosso som', 'é festa de verdade')",
    "uma FALA de DJ/apresentador hypeando (ex: 'fala galera', 'quem tá comigo?', 'bora subir')",
    "uma FALA hype de torcida (ex: 'vamo vamo', 'é nóis', 'isso é demais')",
  ];
  return categories[Math.floor(Math.random() * categories.length)];
}
import { currentPatternBlock } from "@/lib/claude/prompt";
import type { Pattern } from "@/lib/audio/pattern";

type RequestBody = {
  pattern: Pattern;
  vibeLabel?: string | null;
  recentPhrases?: string[];
  lang?: "auto" | "pt-BR" | "en-US";
  theme?: string;
};

const SURPRISE_SYSTEM = `Você é o "DJ surpresa" de uma drum machine. Sua função: inventar uma frase de efeito curta pra ser falada sobre o beat atual e escolher como processá-la.

## Como montar a frase
- BEM CURTA: 1 a 4 palavras, no máximo. Direta e fácil de entender de primeira. Prefira 1-3 palavras.
- NATURAL: deve ser uma frase real, que FAZ SENTIDO sozinha e soa bem quando FALADA em voz alta — algo que um DJ ou alguém na pista diria de verdade. NÃO invente frases abstratas, poéticas, sem sentido, nem junte palavras aleatórias.
- A cada chamada você recebe uma CATEGORIA sugerida — siga ela pra ter variedade.
- Conecte a frase à vibe da música e ao tema (quando houver).
- NUNCA use clichês manjados ("segura o drop", "turn it up", "vamo monstro", "let it ride"). Crie variações novas, mas sempre que soem naturais.
- Tom: animado, de festa/pista. Pode ser engraçada ou provocadora, mas sempre compreensível — nunca esquisita só por ser diferente.

## Idioma e voz
- Varie entre PT-BR e EN-US conforme a vibe: funk/samba brasileiro → pt-BR; trap/dnb → frequentemente en-US mas quebre o padrão.
- A voz escolhida DEVE bater com o idioma: Camila/Thiago/Vitoria só pra pt-BR; Matthew/Ruth/Stephen/Danielle só pra en-US.
- Rotacione as vozes ao longo da sessão — não use sempre a mesma.

## Estilos de processamento disponíveis
- telephone: filtro estreito de rádio antigo — nostálgico, qualquer vibe
- chopped: cada palavra é cortada e cai num 1/16 do grid, super ritmado — funciona melhor com frases de 2 a 4 palavras; qualquer vibe
- radio_dj: locutor de FM, nítido, comprimido e presente — funk, trap, hype
- vinyl: disco antigo empoeirado, com leve ondulação — samba, funk, chill

## Steps e volume
- Steps: 1-2 tipicamente. Step 0 = drop, step 8 = meio do compasso (sempre impacta), 4/12 = batida do snare, 15 = fantasma.
- Volume: -3 a 0 pra destaque; -6 a -9 pra fundo.

## Regra crítica de variedade
Cada surpresa deve ser DIFERENTE das anteriores. Nunca reuse frase já usada na sessão (será listada). Alterne deliberadamente CATEGORIA DE FRASE, estilo, idioma, voz e steps. Se as últimas foram ordens em PT-BR, agora faça uma pergunta de pista, ou uma fala de DJ, ou troque pra EN-US. Busque contraste — mas a frase sempre tem que fazer sentido.

## Regra crítica de fonética (MUITO IMPORTANTE)
A frase vai passar por TTS (Amazon Polly) e tem que soar NATURAL. A voz pronuncia o texto seguindo as regras do idioma dela.

- **PREFIRA palavras que a voz do idioma já pronuncia bem naturalmente.** Em PT-BR, use palavras em português de verdade; em EN-US, inglês de verdade.
- **EVITE anglicismos em frases PT-BR.** Quase sempre dá pra escolher uma palavra portuguesa que diz a mesma coisa (ex: "som", "grave", "pista", "batida" em vez de "beat", "drop", "bass").
- **NÃO use grafias fonéticas forçadas** tipo "bíti", "drópi", "grúvi" — elas soam artificiais. Só use a tag \`{en}palavra{/en}\` (máx 1 por frase) em casos raros onde a palavra inglesa é realmente insubstituível.
- **Frase em EN-US:** inglês normal e natural. NÃO misture português.

Exemplos:
- ✅ pt-BR "solta o som" / "todo mundo na pista" / "mão pro alto"
- ✅ en-US "let's go" / "feel the bass" / "hands up"
- ❌ pt-BR "cola no bíti" (forçado) → prefira "cola na batida"
- ❌ misturar idiomas: "vamo let it ride"

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

  const langPref = body.lang ?? "auto";
  const langInstruction =
    langPref === "pt-BR"
      ? `\n\n**Idioma OBRIGATÓRIO desta vez: pt-BR.** A frase DEVE ser em português brasileiro e a voz DEVE ser pt-BR (Camila/Thiago/Vitoria). Não use inglês.`
      : langPref === "en-US"
        ? `\n\n**Idioma OBRIGATÓRIO desta vez: en-US.** A frase DEVE ser em inglês e a voz DEVE ser en-US (Matthew/Ruth/Stephen/Danielle). Não use português.`
        : "";

  const theme = (body.theme ?? "").trim().slice(0, 120);
  const themeInstruction = theme
    ? `\n\n**TEMA desta sessão (MUITO IMPORTANTE):** as frases devem girar em torno de "${theme}". Incorpore esse tema de forma natural e criativa — pode ser literal ou uma referência/clima ligado a ele —, sem perder a variedade de categoria/estilo nem soar repetitivo.`
    : "";

  const userMessage = `${currentPatternBlock(body.pattern)}${
    body.vibeLabel ? `\nVibe atual: ${body.vibeLabel}` : ""
  }${recentLines}${varietyHint}${langInstruction}${themeInstruction}\n\nInvente uma frase de surpresa pra esse beat.`;

  let args: SurpriseArgs;
  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      temperature: 0.8,
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

  const result = await synthesizeSurprise(args, langPref);
  if (!result.ok) {
    console.error("surprise synth error:", result.error);
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result.data);
}
