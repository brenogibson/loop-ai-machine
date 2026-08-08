import type Anthropic from "@anthropic-ai/sdk";
import { BASS_TIMBRES, LEAD_TIMBRES } from "@/lib/audio/timbres";

const LEAD_TIMBRE_DESC = Object.entries(LEAD_TIMBRES)
  .map(([id, t]) => `${id} (${t.label})`)
  .join(", ");
const BASS_TIMBRE_DESC = Object.entries(BASS_TIMBRES)
  .map(([id, t]) => `${id} (${t.label})`)
  .join(", ");

const synthPart = (which: "bass" | "lead") => ({
  type: "object" as const,
  properties: {
    timbre: {
      type: "string",
      enum: Object.keys(which === "lead" ? LEAD_TIMBRES : BASS_TIMBRES),
      description:
        which === "lead"
          ? `Instrumento da melodia: ${LEAD_TIMBRE_DESC}. Escolha o que evoca o pedido (ex: flute pra Zelda/ocarina, chiptune pra videogame retrô).`
          : `Instrumento do baixo: ${BASS_TIMBRE_DESC}.`,
    },
    notes: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      description: "As notas da linha, cada uma com grau da escala e steps.",
      items: {
        type: "object",
        properties: {
          degree: {
            type: "integer",
            minimum: 1,
            maximum: 8,
            description: "Grau da escala: 1 = tônica, 5 = quinta, 8 = oitava.",
          },
          steps: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "integer", minimum: 0, maximum: 15 },
            description: "1/16 steps (0-15) em que a nota toca.",
          },
        },
        required: ["degree", "steps"],
      },
    },
  },
  required: ["timbre", "notes"],
});

// One-shot full composition: drums + bass + melody + key in a single tool call.
// This is what lets "faz uma música estilo Zelda" produce a complete theme
// instead of only touching the beat.
export const COMPOSE_TOOL: Anthropic.Tool = {
  name: "compose_song",
  description:
    "Compõe uma música COMPLETA de uma vez: bateria (pattern), baixo, melodia, tonalidade e escala. " +
    "Use quando o pedido implica uma composição inteira ou uma referência musical " +
    "(ex: 'música estilo Zelda', 'tema de faroeste', 'som de festa junina') — não apenas um ajuste.",
  input_schema: {
    type: "object",
    properties: {
      bpm: { type: "integer", minimum: 60, maximum: 180 },
      swing: { type: "number", minimum: 0, maximum: 0.75 },
      drum_tracks: {
        type: "array",
        minItems: 2,
        maxItems: 8,
        description: "Tracks de bateria/percussão (sample_id do catálogo).",
        items: {
          type: "object",
          properties: {
            sample_id: { type: "string" },
            steps: {
              type: "array",
              minItems: 16,
              maxItems: 16,
              items: { type: "integer", enum: [0, 1] },
            },
            volume_db: { type: "number", minimum: -24, maximum: 6 },
          },
          required: ["sample_id", "steps", "volume_db"],
        },
      },
      root: {
        type: "string",
        enum: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
        description: "Tônica da música.",
      },
      scale: {
        type: "string",
        enum: ["major", "minor", "dorian", "minorPentatonic"],
        description: "Escala. major pra épico/aventura (Zelda!), minor pra tensão/mistério.",
      },
      bass: synthPart("bass"),
      lead: synthPart("lead"),
      vibe_label: {
        type: "string",
        description: "Nome curto da música criada (ex: 'tema de aventura').",
      },
      commentary: {
        type: "string",
        description: "Comentário curto e divertido em PT-BR (1 frase, máx 120 chars).",
      },
    },
    required: [
      "bpm",
      "swing",
      "drum_tracks",
      "root",
      "scale",
      "bass",
      "lead",
      "vibe_label",
      "commentary",
    ],
  },
};
