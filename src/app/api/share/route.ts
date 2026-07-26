import { NextResponse } from "next/server";
import { putShare, putShareMp3 } from "@/lib/share/store";
import type { SharePayload } from "@/lib/share/types";
import type { Pattern } from "@/lib/audio/pattern";

type RequestBody = {
  pattern: Pattern;
  vibeLabel?: string | null;
  surpriseAudio?: Record<string, string>;
  // Client-rendered MP3 of the loop. Stored in the private bucket; the
  // response carries a presigned URL (10 min) that the QR code points at.
  mp3Base64?: string;
};

// ~1MB per surprise MP3 in base64; cap the whole payload defensively.
const MAX_PAYLOAD_BYTES = 12 * 1024 * 1024;

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    const raw = await req.text();
    if (raw.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: "payload too large" }, { status: 413 });
    }
    body = JSON.parse(raw) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body?.pattern?.tracks?.length) {
    return NextResponse.json({ error: "missing pattern" }, { status: 400 });
  }

  // Only keep audio for surprise tracks that are actually in the pattern.
  const surpriseIds = new Set(
    body.pattern.tracks
      .filter((t) => t.meta?.kind === "surprise")
      .map((t) => t.sampleId),
  );
  const surpriseAudio: Record<string, string> = {};
  for (const [id, b64] of Object.entries(body.surpriseAudio ?? {})) {
    if (surpriseIds.has(id) && typeof b64 === "string") {
      surpriseAudio[id] = b64;
    }
  }

  const payload: SharePayload = {
    version: 1,
    createdAt: new Date().toISOString(),
    vibeLabel: body.vibeLabel ?? null,
    pattern: body.pattern,
    surpriseAudio,
  };

  try {
    const id = await putShare(payload);
    // MP3 upload + presigned URL (the QR target). Optional: if the client
    // couldn't render, the share page link still works while the app is up.
    let mp3 = null;
    if (body.mp3Base64) {
      try {
        mp3 = await putShareMp3(id, Buffer.from(body.mp3Base64, "base64"));
      } catch (err) {
        console.error("mp3 upload failed (share still created):", err);
      }
    }
    return NextResponse.json({ id, mp3 });
  } catch (err) {
    console.error("share put failed:", err);
    return NextResponse.json({ error: "share failed" }, { status: 502 });
  }
}
