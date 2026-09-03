import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";

let cached: AnthropicBedrock | null = null;

export function getClaude(): AnthropicBedrock {
  if (cached) return cached;
  cached = new AnthropicBedrock({
    awsRegion: process.env.AWS_REGION ?? "us-east-1",
  });
  return cached;
}

// Bedrock cross-region inference profile. Overridable so a deploy can be
// pinned/rolled back without a rebuild.
export const CLAUDE_MODEL =
  process.env.CLAUDE_MODEL ?? "us.anthropic.claude-opus-4-8";
