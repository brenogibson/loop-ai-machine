import type Anthropic from "@anthropic-ai/sdk";

export const UPDATE_PATTERN_TOOL: Anthropic.Tool = {
  name: "update_pattern",
  description:
    "Atualiza o pattern da drum machine com base no pedido do usuário. " +
    "Você escolhe BPM, swing, tracks (com sample_id do catálogo, steps 0/1 e volume em dB), " +
    "e escreve um commentary curto e divertido em português (1 frase).",
  input_schema: {
    type: "object",
    properties: {
      bpm: {
        type: "integer",
        minimum: 60,
        maximum: 180,
        description: "Tempo em BPM",
      },
      swing: {
        type: "number",
        minimum: 0,
        maximum: 0.75,
        description: "Quantidade de swing (0 = reto, 0.5 = bastante swing)",
      },
      tracks: {
        type: "array",
        maxItems: 8,
        minItems: 2,
        items: {
          type: "object",
          properties: {
            sample_id: {
              type: "string",
              description:
                "ID exato de um sample do catálogo (ex: kick_808, snare_tight)",
            },
            steps: {
              type: "array",
              minItems: 16,
              maxItems: 16,
              items: { type: "integer", enum: [0, 1] },
              description:
                "Array de 16 valores 0 ou 1 indicando quando o sample toca em cada 1/16",
            },
            volume_db: {
              type: "number",
              minimum: -24,
              maximum: 6,
              description: "Volume em dB (0 = original, negativo = mais baixo)",
            },
          },
          required: ["sample_id", "steps", "volume_db"],
        },
      },
      vibe_label: {
        type: "string",
        description: "Nome curto da vibe resultante (ex: 'funk agressivo', 'lo-fi noturno')",
      },
      commentary: {
        type: "string",
        description:
          "Comentário curto e divertido em português sobre o beat criado (1 frase, máx 120 chars)",
      },
    },
    required: ["bpm", "swing", "tracks", "vibe_label", "commentary"],
  },
};
