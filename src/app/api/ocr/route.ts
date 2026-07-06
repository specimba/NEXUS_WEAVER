import { NextRequest, NextResponse } from "next/server";
import { runOcr } from "@/lib/ocr";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/ocr
// body: { imagePath: string }   // relative path under /public, e.g. "/gallery/abc.png"
// Returns the extracted text + bounding boxes.
export async function POST(req: NextRequest) {
  let body: { imagePath?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const imagePath = typeof body.imagePath === "string" ? body.imagePath : null;
  if (!imagePath) {
    return NextResponse.json({ error: "imagePath is required" }, { status: 400 });
  }
  // Prevent path traversal.
  if (imagePath.includes("..")) {
    return NextResponse.json({ error: "invalid imagePath" }, { status: 400 });
  }

  try {
    const result = await runOcr(imagePath);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
