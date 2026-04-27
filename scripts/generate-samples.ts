// Pipeline offline de geração de samples via Replicate (Stable Audio Open).
// Rodar ANTES do evento para popular public/samples com áudio de verdade.
//
// Pré-requisitos:
//   - REPLICATE_API_TOKEN no ambiente
//   - npm i -D replicate tsx
//   - ffmpeg instalado (para converter WAV -> webm/opus)
//
// Uso:
//   npx tsx scripts/generate-samples.ts
//
// Estratégia híbrida:
//   - Drums (kick/snare/hat/clap/perc) vêm de sample pack livre (baixado manualmente)
//     ou ficam nos placeholders atuais. Stable Audio não é bom pra drums sintéticos.
//   - Bass/melodic/fx são gerados aqui via Stable Audio Open.

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

type Spec = {
  id: string;
  category: "bass" | "melodic" | "fx";
  vibes: string[];
  bpm_range: [number, number];
  prompt: string;
  duration_s: number;
  description: string;
};

const SPECS: Spec[] = [
  // --- BASS ---
  {
    id: "bass_sub_gen",
    category: "bass",
    vibes: ["trap", "dnb", "ambient"],
    bpm_range: [60, 180],
    prompt: "deep sub bass one-shot, clean sine, 808 style, dry",
    duration_s: 1,
    description: "Deep generated sub bass",
  },
  {
    id: "bass_saw_gen",
    category: "bass",
    vibes: ["funk", "dnb"],
    bpm_range: [100, 180],
    prompt: "reese bass one-shot, detuned saw, aggressive",
    duration_s: 1,
    description: "Aggressive saw bass",
  },
  // --- MELODIC ---
  {
    id: "melodic_pad_lofi",
    category: "melodic",
    vibes: ["lofi", "ambient"],
    bpm_range: [60, 100],
    prompt: "warm lo-fi pad chord, dusty, vinyl texture, 1 bar at 90bpm",
    duration_s: 2.7,
    description: "Lo-fi pad chord",
  },
  {
    id: "melodic_stab_funk",
    category: "melodic",
    vibes: ["funk", "samba"],
    bpm_range: [95, 130],
    prompt: "funky clavinet stab, dry, punchy, 1/8 note",
    duration_s: 0.3,
    description: "Funk clav stab",
  },
  // --- FX ---
  {
    id: "fx_riser_gen",
    category: "fx",
    vibes: ["trap", "dnb"],
    bpm_range: [100, 180],
    prompt: "upward noise riser 2 seconds, building tension, filter sweep",
    duration_s: 2,
    description: "Tension riser",
  },
  {
    id: "fx_impact",
    category: "fx",
    vibes: ["trap", "dnb", "ambient"],
    bpm_range: [60, 180],
    prompt: "cinematic impact hit, boom, one-shot",
    duration_s: 1.5,
    description: "Impact hit",
  },
  // TODO: expandir pra ~20 especs antes do evento
];

async function generateOne(spec: Spec, outDir: string): Promise<void> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN required");

  // Modelo: Stable Audio Open 1.0 no Replicate.
  // Docs: https://replicate.com/stackadoc/stable-audio-open-1.0
  const res = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      version: "stackadoc/stable-audio-open-1.0",
      input: {
        prompt: spec.prompt,
        seconds_total: spec.duration_s,
        steps: 100,
      },
    }),
  });
  if (!res.ok) throw new Error(`replicate ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { output?: string };
  if (!body.output) throw new Error(`no output for ${spec.id}`);

  const audio = await fetch(body.output);
  if (!audio.ok) throw new Error(`download ${audio.status}`);
  const buf = Buffer.from(await audio.arrayBuffer());
  const path = join(outDir, `${spec.id}.wav`);
  await writeFile(path, buf);
  console.log(`✓ ${spec.id} → ${path} (${buf.length} bytes)`);
}

async function main(): Promise<void> {
  const outDir = join(process.cwd(), "public", "samples");
  await mkdir(outDir, { recursive: true });
  for (const spec of SPECS) {
    try {
      await generateOne(spec, outDir);
    } catch (err) {
      console.error(`✗ ${spec.id}:`, err);
    }
  }
  console.log(`\nNext: run scripts/build-catalog.ts to merge into catalog.json`);
}

main();
