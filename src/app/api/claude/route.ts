import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { getClaude, CLAUDE_MODEL } from "@/lib/claude/client";
import { UPDATE_PATTERN_TOOL } from "@/lib/claude/tools";
import {
  SYSTEM_PROMPT,
  catalogBlock,
  currentPatternBlock,
} from "@/lib/claude/prompt";
import type { Catalog } from "@/lib/samples/catalog";
import type { Pattern, Step, Track } from "@/lib/audio/pattern";

type RequestBody = {
  message: string;
  pattern: Pattern;
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
      tools: [UPDATE_PATTERN_TOOL],
      tool_choice: { type: "tool", name: "update_pattern" },
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

    const args = toolUse.input as UpdatePatternArgs;
    const pattern = toPattern(args, catalog);
    if (pattern.tracks.length < 2) {
      return NextResponse.json(
        { error: "claude returned too few valid tracks" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      pattern,
      vibe_label: args.vibe_label,
      commentary: args.commentary,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_input_tokens:
          response.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      },
    });
  } catch (err) {
    console.error("claude error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
