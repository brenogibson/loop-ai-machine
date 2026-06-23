import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { getClaude, CLAUDE_MODEL } from "@/lib/claude/client";
import { UPDATE_PATTERN_TOOL } from "@/lib/claude/tools";
import { SURPRISE_TOOL } from "@/lib/claude/surprise-tool";
import { SYNTH_TOOL } from "@/lib/claude/synth-tool";
import {
  SYSTEM_PROMPT,
  catalogBlock,
  currentPatternBlock,
} from "@/lib/claude/prompt";
import {
  synthesizeSurprise,
  type SurpriseArgs,
  type SurpriseLangPref,
} from "@/lib/surprise/synth";
import {
  buildScaleGrid,
  rowsFromDegrees,
  type ScaleName,
} from "@/lib/audio/scale";
import type { Catalog } from "@/lib/samples/catalog";
import type { Pattern, Step, SynthInstrument, Track } from "@/lib/audio/pattern";

type SynthArgs = {
  instrument: SynthInstrument;
  root: string;
  scale: ScaleName;
  notes: Array<{ degree: number; steps: number[] }>;
  vibe_label: string;
  commentary: string;
};

// Default register per instrument: bass low, lead higher.
const SYNTH_OCTAVE: Record<SynthInstrument, number> = { bass: 2, lead: 4 };
const SYNTH_VOLUME: Record<SynthInstrument, number> = { bass: -4, lead: -8 };

type RequestBody = {
  message: string;
  pattern: Pattern;
  surpriseLang?: SurpriseLangPref;
  // The session's locked key, if any synth already set it. When present it
  // overrides Claude's root/scale choice so all synths stay in the same key.
  musicalKey?: { root: string; scale: ScaleName } | null;
};

let cachedCatalog: Catalog | null = null;
async function loadCatalog(): Promise<Catalog> {
  if (cachedCatalog) return cachedCatalog;
  const path = join(process.cwd(), "public", "catalog.json");
  const raw = await readFile(path, "utf8");
  cachedCatalog = JSON.parse(raw) as Catalog;
  return cachedCatalog;
}

type UpdatePatternArgs = {
  bpm: number;
  swing: number;
  tracks: Array<{
    sample_id: string;
    steps: number[];
    volume_db: number;
  }>;
  vibe_label: string;
  commentary: string;
};

function toPattern(args: UpdatePatternArgs, catalog: Catalog): Pattern {
  const validIds = new Set(catalog.samples.map((s) => s.id));
  const tracks: Track[] = args.tracks
    .filter((t) => validIds.has(t.sample_id))
    .map((t) => ({
      sampleId: t.sample_id,
      steps: t.steps.slice(0, 16).map((s) => (s ? 1 : 0) as Step),
      volumeDb: t.volume_db,
    }));
  return {
    bpm: Math.max(60, Math.min(180, Math.round(args.bpm))),
    swing: Math.max(0, Math.min(0.75, args.swing)),
    tracks,
  };
}

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body?.message || !body?.pattern) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const catalog = await loadCatalog();
  const client = getClaude();

  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: catalogBlock(catalog),
      cache_control: { type: "ephemeral" },
    },
  ];

  const userMessage = `${currentPatternBlock(body.pattern)}\n\nPedido do usuário: ${body.message}`;

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: systemBlocks,
      // Three tools: update_pattern (beat), generate_surprise (spoken phrase),
      // generate_synth (bass/lead line). tool_choice:any forces Claude to call
      // exactly one rather than replying with plain text.
      tools: [UPDATE_PATTERN_TOOL, SURPRISE_TOOL, SYNTH_TOOL],
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: userMessage }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolUse) {
      return NextResponse.json(
        { error: "no tool_use in response" },
        { status: 502 },
      );
    }

    const usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens:
        response.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    };

    // Branch on which tool Claude chose.
    if (toolUse.name === "generate_surprise") {
      const result = await synthesizeSurprise(
        toolUse.input as SurpriseArgs,
        body.surpriseLang ?? "auto",
      );
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 502 });
      }
      return NextResponse.json({ kind: "surprise", surprise: result.data, usage });
    }

    if (toolUse.name === "generate_synth") {
      const synth = toolUse.input as SynthArgs;
      const instrument: SynthInstrument =
        synth.instrument === "lead" ? "lead" : "bass";
      // Honor the session key if set, so bass and lead share one key.
      const root = body.musicalKey?.root ?? synth.root;
      const scale = body.musicalKey?.scale ?? synth.scale;
      const octave = SYNTH_OCTAVE[instrument];
      const rows = rowsFromDegrees(root, scale, octave, synth.notes);
      if (rows.length === 0) {
        return NextResponse.json(
          { error: "synth had no valid notes" },
          { status: 502 },
        );
      }
      const tracks = buildScaleGrid(
        instrument,
        root,
        scale,
        octave,
        rows,
        SYNTH_VOLUME[instrument],
      );
      return NextResponse.json({
        kind: "synth",
        synth: {
          instrument,
          tracks,
          root,
          scale,
          vibe_label: synth.vibe_label,
          commentary: synth.commentary,
        },
        usage,
      });
    }

    const args = toolUse.input as UpdatePatternArgs;
    const pattern = toPattern(args, catalog);
    if (pattern.tracks.length < 2) {
      return NextResponse.json(
        { error: "claude returned too few valid tracks" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      kind: "pattern",
      pattern,
      vibe_label: args.vibe_label,
      commentary: args.commentary,
      usage,
    });
  } catch (err) {
    console.error("claude error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
