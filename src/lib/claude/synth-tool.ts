import type Anthropic from "@anthropic-ai/sdk";
import type { SynthInstrument } from "@/lib/audio/pattern";
import type { ScaleName } from "@/lib/audio/scale";

export const SYNTH_INSTRUMENTS: SynthInstrument[] = ["bass", "lead"];
export const SYNTH_SCALES: ScaleName[] = [
  "major",
  "minor",
  "dorian",
  "minorPentatonic",
];

// Claude describes the riff by SCALE DEGREE (1 = root) rather than absolute note
// names — this keeps everything in-scale by construction and frees Claude from
// reasoning about sharps/flats. The backend resolves degrees to real pitches.
export const SYNTH_TOOL: Anthropic.Tool = {
  name: "generate_synth",
  description:
    "Adiciona uma linha de sintetizador (baixo ou melodia) ao loop, travada numa escala " +
    "pra sempre soar afinada. Você escolhe instrumento, tonalidade, escala e o riff " +
    "descrito por GRAUS da escala (1 = tônica) e em quais 1/16 do compasso cada nota toca.",
  input_schema: {
    type: "object",
    properties: {
      instrument: {
        type: "string",
        enum: SYNTH_INSTRUMENTS,
        description: "bass = linha grave que segue o kick; lead = melodia por cima.",
      },
      root: {
        type: "string",
        enum: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
        description: "Tônica da escala. Combine com a vibe (ex: menores pra trap/lofi).",
      },
      scale: {
        type: "string",
        enum: SYNTH_SCALES,
        description:
          "Escala: minor/minorPentatonic pra peso e segurança, major pra alegre, dorian pra funk/groove.",
      },
      notes: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        description: "As notas do riff, cada uma com seu grau e os steps onde toca.",
        items: {
          type: "object",
          properties: {
            degree: {
              type: "integer",
              minimum: 1,
              maximum: 8,
              description:
                "Grau da escala: 1 = tônica, 5 = quinta, 8 = oitava. Pro baixo prefira 1-3.",
            },
            steps: {
              type: "array",
              minItems: 1,
              maxItems: 8,
              items: { type: "integer", minimum: 0, maximum: 15 },
              description: "1/16 steps (0-15) em que essa nota toca.",
            },
          },
          required: ["degree", "steps"],
        },
      },
      vibe_label: {
        type: "string",
        description: "Nome curto do que foi criado (ex: 'baixo pesado', 'melodia lo-fi').",
      },
      commentary: {
        type: "string",
        description: "Comentário curto e divertido em PT-BR (1 frase, máx 120 chars).",
      },
    },
    required: ["instrument", "root", "scale", "notes", "vibe_label", "commentary"],
  },
};
