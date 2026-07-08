import { NextRequest, NextResponse } from "next/server";
import { aeonVisualJudge } from "@/lib/aeon/client";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/aeon/judge
 *
 * Post-generation AEON visual judge. Multi-metric quality + safety judgment
 * based on the actual image pixels.
 *
 * Body: { imagePath, prompt, loraContext }
 * Returns: { verdict: AEONSafetyVerdict, meta: AEONCallMeta }
 */
export async function POST(req: NextRequest) {
  let body: { imagePath?: string; imageDataUrl?: string; prompt?: string; loraContext?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imagePath, imageDataUrl, prompt = "", loraContext = "" } = body;

  let imageUrl: string | null = null;

  if (imageDataUrl) {
    imageUrl = imageDataUrl;
  } else if (imagePath) {
    // Read from DB or disk
    if (imagePath.startsWith("/api/image/")) {
      const { db } = await import("@/lib/db");
      const genId = imagePath.replace("/api/image/", "");
      const gen = await db.generation.findUnique({ where: { id: genId } });
      if (gen?.imageData) {
        imageUrl = `data:image/png;base64,${gen.imageData}`;
      }
    } else if (imagePath.startsWith("/gallery/") && !imagePath.includes("..")) {
      const fs = await import("fs");
      const path = await import("path");
      const filePath = path.join(process.cwd(), "public", imagePath);
      if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        imageUrl = `data:image/png;base64,${buf.toString("base64")}`;
      }
    }
  }

  if (!imageUrl) {
    return NextResponse.json({ error: "Could not load image" }, { status: 404 });
  }

  const result = await aeonVisualJudge(imageUrl, prompt, loraContext);
  return NextResponse.json(result);
}
