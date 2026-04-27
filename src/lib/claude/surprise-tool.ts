import type Anthropic from "@anthropic-ai/sdk";

export const STYLES = [
  "robotic",
  "melodic",
  "reverse",
  "stutter",
  "pitched_up",
  "pitched_down",
  "telephone",
] as const;
export type SurpriseStyle = (typeof STYLES)[number];

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
          "Frase curta, 1-6 palavras, pra ser falada sobre o beat. Ex: 'segura o drop', 'vamo', 'that's the vibe', '3 2 1 go', 'let it ride'. Deve combinar com a vibe do pattern.",
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
        enum: [...STYLES],
        description:
          "Como a voz é processada: robotic (bitcrusher + pitch), melodic (reverb + chorus), reverse (toca ao contrário), stutter (repete chop), pitched_up (voz fina), pitched_down (voz grave), telephone (filtro banda estreita).",
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
