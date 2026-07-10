import { NextRequest, NextResponse } from "next/server";
import { callModalBrain } from "@/lib/modal-client";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/prompt/reverse
 *
 * NO8D Prompt+ "Reverse" mode — uses the Visual Judge brain (Gemma 4 31B,
 * vision-capable) to reverse-engineer an image into a descriptive generation
 * prompt. Accepts either a gallery/image-path reference or a raw data URL.
 *
 * Body:  { imagePath?: string } | { imageDataUrl?: string }
 * Returns: { prompt: string, ms: number, model: string } | { error: string }
 *
 * The result is shown in an EDITABLE textarea (NO8D "auto off" pattern) before
 * the user sends it to the Studio.
 */
export async function POST(req: NextRequest) {
  let body: { imagePath?: string; imageDataUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Resolve the image to a base64 data URL for the vision model.
  let dataUrl = "";
  try {
    if (body.imagePath) {
      if (body.imagePath.startsWith("/api/image/")) {
        const genId = body.imagePath.replace("/api/image/", "");
        const gen = await db.generation.findUnique({ where: { id: genId } });
        if (gen?.imageData) {
          dataUrl = `data:image/png;base64,${gen.imageData}`;
        }
      } else if (body.imagePath.startsWith("/gallery/")) {
        const filePath = path.join(process.cwd(), "public", body.imagePath);
        if (fs.existsSync(filePath)) {
          const b64 = fs.readFileSync(filePath).toString("base64");
          dataUrl = `data:image/png;base64,${b64}`;
        }
      }
    } else if (body.imageDataUrl) {
      dataUrl = body.imageDataUrl;
    }
  } catch {
    return NextResponse.json({ error: "Failed to load source image" }, { status: 500 });
  }

  if (!dataUrl) {
    return NextResponse.json(
      { error: "Could not load image. Provide a valid imagePath or imageDataUrl." },
      { status: 400 }
    );
  }

  const system = `You are a vision model that reverse-engineers image-generation prompts. Given an image, produce a concise, FLUX.2-optimized prompt that would recreate a similar image.

Describe what you actually SEE:
1. SUBJECT — who/what is depicted, with physical detail (attire, expression, pose)
2. ACTION/POSE — what is happening, motion, gesture
3. SETTING/CONTEXT — where, time of day, atmosphere, background
4. STYLE/LIGHTING/CAMERA — art direction, light source + quality, color palette, lens/focal-length, film stock or render look

Rules:
- Write it as a generation prompt, NOT a description of an image.
- Do NOT say "this image shows" or "I see". Just write the prompt.
- 200-400 characters, plain prose, no bullet points, no preamble.
- Capture the mood and aesthetic, not just the literal contents.`;

  const result = await callModalBrain(
    [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: "Reverse-engineer this image into a single generation prompt." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    { temperature: 0.4, maxTokens: 1500, role: "judge" }
  );

  if (!result) {
    return NextResponse.json(
      {
        error:
          "Visual Judge brain endpoint unavailable (cold or not configured). It may be warming up — retry in 30s, or check /api/modal/status.",
      },
      { status: 503 }
    );
  }

  const prompt = result.content.trim();
  if (!prompt) {
    return NextResponse.json({ error: "Brain returned an empty response." }, { status: 502 });
  }

  return NextResponse.json({
    prompt,
    ms: result.ms,
    model: result.model,
  });
}
