import { NextResponse } from "next/server";
import { getShare } from "@/lib/share/store";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const share = await getShare(id);
    if (!share) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(share);
  } catch (err) {
    console.error("share get failed:", err);
    return NextResponse.json({ error: "share lookup failed" }, { status: 502 });
  }
}
