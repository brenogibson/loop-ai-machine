import type Anthropic from "@anthropic-ai/sdk";

export const STYLES = [
  "robotic",
  "melodic",
  "reverse",
  "stutter",
  "pitched_up",
  "pitched_down",
  "telephone",
  "megaphone",
  "slice",
  "dub",
  "harmony",
  "chopped",
  "radio_dj",
  "vinyl",
] as const;
export type SurpriseStyle = (typeof STYLES)[number];

// Temporarily disabled styles. Remove from this list to re-enable — the effect
// chains in lib/audio/surprise.ts stay intact so re-enabling needs no code.
// After live testing only the dry/rhythmic styles survived (telephone,
// chopped): wet tails (melodic/reverse/dub) smear into the beat and megaphone
// over-distorts Polly voices. radio_dj/vinyl are their dry replacements.
export const DISABLED_STYLES: SurpriseStyle[] = [
  "robotic",
  "pitched_down",
  "pitched_up",
  "stutter",
  "harmony",
  "slice",
  "melodic",
  "reverse",
  "megaphone",
  "dub",
];

export const ACTIVE_STYLES: SurpriseStyle[] = STYLES.filter(
  (s) => !DISABLED_STYLES.includes(s),
);

export const VOICE_OPTIONS = [
  { id: "Camila", language: "pt-BR", engine: "generative" as const, gender: "F" },
  { id: "Thiago", language: "pt-BR", engine: "neural" as const, gender: "M" },
  { id: "Vitoria", language: "pt-BR", engine: "neural" as const, gender: "F" },
  { id: "Matthew", language: "en-US", engine: "generative" as const, gender: "M" },
  { id: "Ruth", language: "en-US", engine: "generative" as const, gender: "F" },
  { id: "Stephen", language: "en-US", engine: "generative" as const, gender: "M" },
  { id: "Danielle", language: "en-US", engine: "generative" as const, gender: "F" },
];

export const SURPRISE_TOOL: Anthropic.Tool = {
  name: "generate_surprise",
  description:
    "Inventa uma frase de efeito curta pra ser tocada como voz sobre o loop atual, " +
    "escolhe voz do Polly, estilo de processamento de áudio e em quais 1/16 do compasso ela toca.",
  input_schema: {
    type: "object",
    properties: {
      phrase: {
        type: "string",
        description:
          "Frase BEM curta, no máximo 4 palavras (prefira 1-3), pra ser falada sobre o beat. Ex: 'vamo', 'mão pro alto', 'todo mundo na pista', 'sentiu isso?'. Deve combinar com a vibe do pattern.",
      },
      language: {
        type: "string",
        enum: ["pt-BR", "en-US"],
        description:
          "Idioma da frase. Escolha pt-BR pra funk/samba/lofi brasileiro; en-US pra trap/dnb/ambient internacional. Varie.",
      },
      voice_id: {
        type: "string",
        enum: VOICE_OPTIONS.map((v) => v.id),
        description:
          "Voz do Polly. Deve combinar com o language: Camila/Thiago/Vitoria pra pt-BR; Matthew/Ruth/Stephen/Danielle pra en-US.",
      },
      style: {
        type: "string",
        enum: [...ACTIVE_STYLES],
        description:
          "Como a voz é processada: telephone (filtro de rádio antigo, nostálgico), chopped (cada palavra cai num step do grid, bem ritmado — ótimo pra frases de 2-4 palavras), radio_dj (locutor de FM, nítido e potente), vinyl (disco antigo empoeirado, lo-fi). Varie sempre.",
      },
      steps: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: { type: "integer", minimum: 0, maximum: 15 },
        description:
          "Em quais 1/16 steps (0-15) a frase dispara. Use 1-2 steps tipicamente. Evite step 0 se a frase for longa (>0.5s). Boas opções: [8] (metade do compasso), [0] (drop), [4,12] (dois ataques), [15] (fim fantasma).",
      },
      volume_db: {
        type: "number",
        minimum: -12,
        maximum: 3,
        description: "Volume em dB. -3 a 0 pra frases de destaque; -6 a -9 pra fundo.",
      },
      commentary: {
        type: "string",
        description:
          "Comentário curto em PT-BR sobre a surpresa (1 frase, máx 120 chars) — explica a escolha de estilo/frase.",
      },
    },
    required: [
      "phrase",
      "language",
      "voice_id",
      "style",
      "steps",
      "volume_db",
      "commentary",
    ],
  },
};
