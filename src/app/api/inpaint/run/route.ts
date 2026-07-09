import { NextRequest, NextResponse } from "next/server";
import { MODAL_INPAINT_URL } from "@/lib/secrets";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/inpaint/run
 *
 * Real inpainting using FLUX.1 Kontext-dev on Modal L40S.
 * Takes a source image + mask + prompt, returns the edited image.
 */
export async function POST(req: NextRequest) {
  let body: {
    sourceImagePath?: string;
    maskDataUrl?: string;
    prompt?: string;
    denoise?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sourceImagePath = "", maskDataUrl = "", prompt = "", denoise = 0.75 } = body;

  if (!sourceImagePath) {
    return NextResponse.json({ error: "sourceImagePath is required" }, { status: 400 });
  }
  if (!prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (!maskDataUrl) {
    return NextResponse.json({ error: "maskDataUrl is required" }, { status: 400 });
  }

  // Load the source image as base64
  let imageBase64 = "";
  try {
    if (sourceImagePath.startsWith("/api/image/")) {
      const genId = sourceImagePath.replace("/api/image/", "");
      const gen = await db.generation.findUnique({ where: { id: genId } });
      if (gen?.imageData) imageBase64 = gen.imageData;
    } else if (sourceImagePath.startsWith("/gallery/")) {
      const filePath = path.join(process.cwd(), "public", sourceImagePath);
      if (fs.existsSync(filePath)) {
        imageBase64 = fs.readFileSync(filePath).toString("base64");
      }
    }
  } catch (err) {
    return NextResponse.json({ error: "Failed to load source image" }, { status: 500 });
  }

  if (!imageBase64) {
    return NextResponse.json({ error: "Could not load source image" }, { status: 404 });
  }

  // Extract base64 from mask data URL
  const maskBase64 = maskDataUrl.replace(/^data:image\/[a-z]+;base64,/, "");

  // Call the Kontext inpaint backend
  if (!MODAL_INPAINT_URL) {
    return NextResponse.json({
      imagePath: null,
      errorMessage: "Inpaint backend not deployed. Run: modal deploy modal-apps/nexus_kontext_inpaint.py",
    });
  }

  try {
    const res = await fetch(`${MODAL_INPAINT_URL}/inpaint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: imageBase64,
        mask: maskBase64,
        prompt: prompt.trim(),
        strength: denoise,
        seed: Math.floor(Math.random() * 2_147_483_647),
        num_steps: 8,
        guidance_scale: 3.5,
      }),
      signal: AbortSignal.timeout(240_000), // 4 min timeout
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({
        imagePath: null,
        errorMessage: `Inpaint backend HTTP ${res.status}: ${text.slice(0, 200)}`,
      });
    }

    const data = await res.json() as { image?: string; ms?: number };

    if (!data.image) {
      return NextResponse.json({
        imagePath: null,
        errorMessage: "Inpaint backend returned no image",
      });
    }

    // Save the result to the gallery
    const galleryDir = path.join(process.cwd(), "public", "gallery");
    if (!fs.existsSync(galleryDir)) {
      fs.mkdirSync(galleryDir, { recursive: true });
    }
    const filename = `inpaint-${Date.now()}.png`;
    const filepath = path.join(galleryDir, filename);
    fs.writeFileSync(filepath, Buffer.from(data.image, "base64"));

    return NextResponse.json({
      imagePath: `/gallery/${filename}`,
      ms: data.ms,
      model: "FLUX.1-Kontext-dev",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      imagePath: null,
      errorMessage: `Inpaint failed: ${msg.slice(0, 200)}`,
    });
  }
}
