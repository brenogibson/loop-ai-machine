import { NextResponse } from "next/server";
import { presignMp3Url } from "@/lib/share/store";

// Short download link: the QR encodes /dl/<shareId> (tiny, scannable) instead
// of a full presigned S3 URL (far too long for a dense-friendly QR). Each hit
// signs a FRESH 10-minute URL and redirects — so the link works for as long as
// the app is up, and the bucket stays fully private (account rule: nothing
// public except CloudFront; signing happens server-side via the instance role).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const url = await presignMp3Url(id);
    if (!url) {
      // Unknown/expired id: land on the app instead of a bare error.
      return NextResponse.redirect(new URL("/", _req.url), 302);
    }
    return NextResponse.redirect(url, 302);
  } catch (err) {
    console.error("dl redirect failed:", err);
    return NextResponse.json({ error: "download failed" }, { status: 502 });
  }
}
