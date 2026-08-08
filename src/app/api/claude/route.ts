import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { getClaude, CLAUDE_MODEL } from "@/lib/claude/client";
import { UPDATE_PATTERN_TOOL } from "@/lib/claude/tools";
import { SURPRISE_TOOL } from "@/lib/claude/surprise-tool";
import { SYNTH_TOOL } from "@/lib/claude/synth-tool";
import { COMPOSE_TOOL } from "@/lib/claude/compose-tool";
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
  bassOctaveFor,
  buildScaleGrid,
  rowsFromDegrees,
  type ScaleName,
} from "@/lib/audio/scale";
import { DEFAULT_STYLE, STYLES, isStyleId } from "@/lib/audio/styles";
import { isTimbreFor } from "@/lib/audio/timbres";
import type { Catalog } from "@/lib/samples/catalog";
import type { Pattern, Step, SynthInstrument, Track } from "@/lib/audio/pattern";

type SynthArgs = {
  instrument: SynthInstrument;
  timbre?: string;
  root: string;
  scale: ScaleName;
  notes: Array<{ degree: number; steps: number[] }>;
  vibe_label: string;
  commentary: string;
};

type ComposePart = {
  timbre: string;
  notes: Array<{ degree: number; steps: number[] }>;
};

type ComposeArgs = {
  bpm: number;
  swing: number;
  drum_tracks: UpdatePatternArgs["tracks"];
  root: string;
  scale: ScaleName;
  bass: ComposePart;
  lead: ComposePart;
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
  // Session style: shifts the bass register (e.g. D&B +1 keeps the reese audible).
  styleId?: string;
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
      tools: [UPDATE_PATTERN_TOOL, SURPRISE_TOOL, SYNTH_TOOL, COMPOSE_TOOL],
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

    if (toolUse.name === "compose_song") {
      const args = toolUse.input as ComposeArgs;
      const pattern = toPattern(
        {
          bpm: args.bpm,
          swing: args.swing,
          tracks: args.drum_tracks,
          vibe_label: args.vibe_label,
          commentary: args.commentary,
        },
        catalog,
      );
      if (pattern.tracks.length < 2) {
        return NextResponse.json(
          { error: "compose returned too few valid drum tracks" },
          { status: 502 },
        );
      }
      const styleId = isStyleId(body.styleId) ? body.styleId : DEFAULT_STYLE;
      const bassShift = STYLES[styleId].identity.bassOctaveShift ?? 0;

      const buildPart = (
        instrument: SynthInstrument,
        part: ComposePart,
      ): Track[] | null => {
        const octave =
          instrument === "bass"
            ? bassOctaveFor(args.root, args.scale) + bassShift
            : SYNTH_OCTAVE[instrument];
        const rows = rowsFromDegrees(args.root, args.scale, octave, part.notes);
        if (rows.length === 0) return null;
        const timbre = isTimbreFor(instrument, part.timbre)
          ? part.timbre
          : undefined;
        return buildScaleGrid(
          instrument,
          args.root,
          args.scale,
          octave,
          rows,
          SYNTH_VOLUME[instrument],
          timbre,
        );
      };

      const bassTracks = buildPart("bass", args.bass);
      const leadTracks = buildPart("lead", args.lead);

      return NextResponse.json({
        kind: "compose",
        compose: {
          pattern,
          root: args.root,
          scale: args.scale,
          bassTracks,
          leadTracks,
          vibe_label: args.vibe_label,
          commentary: args.commentary,
        },
        usage,
      });
    }

    if (toolUse.name === "generate_synth") {
      const synth = toolUse.input as SynthArgs;
      const instrument: SynthInstrument =
        synth.instrument === "lead" ? "lead" : "bass";
      // Honor the session key if set, so bass and lead share one key.
      const root = body.musicalKey?.root ?? synth.root;
      const scale = body.musicalKey?.scale ?? synth.scale;
      // Bass register is capped at octave 2 — high roots start an octave lower.
      const styleId = isStyleId(body.styleId) ? body.styleId : DEFAULT_STYLE;
      const octave =
        instrument === "bass"
          ? bassOctaveFor(root, scale) +
            (STYLES[styleId].identity.bassOctaveShift ?? 0)
          : SYNTH_OCTAVE[instrument];
      const rows = rowsFromDegrees(root, scale, octave, synth.notes);
      if (rows.length === 0) {
        return NextResponse.json(
          { error: "synth had no valid notes" },
          { status: 502 },
        );
      }
      const timbre = isTimbreFor(instrument, synth.timbre)
        ? synth.timbre
        : undefined;
      const tracks = buildScaleGrid(
        instrument,
        root,
        scale,
        octave,
        rows,
        SYNTH_VOLUME[instrument],
        timbre,
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
