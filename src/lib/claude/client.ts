import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";

let cached: AnthropicBedrock | null = null;

export function getClaude(): AnthropicBedrock {
  if (cached) return cached;
  cached = new AnthropicBedrock({
    awsRegion: process.env.AWS_REGION ?? "us-east-1",
  });
  return cached;
}

export const CLAUDE_MODEL = "us.anthropic.claude-sonnet-4-6";
