import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  generateKontextEdit,
  KontextNotDeployedError,
  type KontextLora,
} from "@/lib/kontext-client";

/**
 * POST /api/kontext/edit
 *
 * Multi-loop garment refinement step of the Studio workflow:
 *   generate (FLUX.2 Klein 9B) → refine wardrobe (FLUX.1 Kontext) ×≤3 → judge.
 *
 * Body: { imageBase64, prompt, negativePrompt?, denoise?, steps?, loras? }
 * Returns: { image: base64, ms: number, model: string, imagePath?: string }
 *
 * The refined PNG is persisted to public/gallery/ so it's addressable as a
 * real URL (/gallery/...). This lets the Studio display it, the "Use this
 * version" action set it as the run's imagePath, and downstream tools
 * (Inpaint, Video) consume it via a path they can validate.
 *
 * If the Kontext Modal app is not deployed, returns 503 with the canonical
 * "FLUX.1 Kontext not deployed. Run modal-apps/deploy_all.sh to deploy."
 * message so the client can render a clear deploy-backend callout.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

const GALLERY_DIR = path.join(process.cwd(), "public", "gallery");

const NOT_DEPLOYED_MESSAGE =
  "FLUX.1 Kontext not deployed. Run modal-apps/deploy_all.sh to deploy.";

interface KontextEditBody {
  imageBase64?: unknown;
  prompt?: unknown;
  negativePrompt?: unknown;
  denoise?: unknown;
  steps?: unknown;
  cfg?: unknown;
  seed?: unknown;
  loras?: unknown;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export async function POST(req: NextRequest) {
  let body: KontextEditBody;
  try {
    body = (await req.json()) as KontextEditBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const imageBase64 = isString(body.imageBase64) ? body.imageBase64.trim() : "";
  if (!imageBase64) {
    return NextResponse.json(
      { error: "imageBase64 is required" },
      { status: 400 }
    );
  }
  // Strip an optional data: prefix so the client may send either form.
  const strippedBase64 = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
  if (strippedBase64.length < 1000) {
    return NextResponse.json(
      { error: "imageBase64 is too short to be a valid image" },
      { status: 400 }
    );
  }

  const prompt = isString(body.prompt) ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (prompt.length > 2000) {
    return NextResponse.json(
      { error: "prompt too long (max 2000 chars)" },
      { status: 400 }
    );
  }

  const negativePrompt = isString(body.negativePrompt)
    ? body.negativePrompt.trim()
    : undefined;
  const denoise = isNumber(body.denoise)
    ? Math.max(0.1, Math.min(1.0, body.denoise))
    : undefined;
  const steps = isNumber(body.steps)
    ? Math.max(1, Math.min(50, Math.round(body.steps)))
    : undefined;
  const cfg = isNumber(body.cfg) ? body.cfg : undefined;
  const seed = isNumber(body.seed) ? Math.round(body.seed) : undefined;

  let loras: KontextLora[] | undefined;
  if (Array.isArray(body.loras)) {
    const parsed: KontextLora[] = [];
    for (const l of body.loras) {
      if (!l || typeof l !== "object") continue;
      const obj = l as Record<string, unknown>;
      const repo = isString(obj.repo) ? obj.repo.trim() : "";
      if (!repo) continue;
      const adapter = isString(obj.adapter) ? obj.adapter.trim() : undefined;
      const weight = isNumber(obj.weight)
        ? Math.max(0, Math.min(1, obj.weight))
        : 0.7;
      parsed.push({ repo, ...(adapter ? { adapter } : {}), weight });
    }
    if (parsed.length > 0) loras = parsed;
  }

  try {
    const result = await generateKontextEdit({
      imageBase64: strippedBase64,
      prompt,
      ...(negativePrompt ? { negativePrompt } : {}),
      ...(denoise !== undefined ? { denoise } : {}),
      ...(steps !== undefined ? { steps } : {}),
      ...(cfg !== undefined ? { cfg } : {}),
      ...(seed !== undefined ? { seed } : {}),
      ...(loras && loras.length > 0 ? { loras } : {}),
    });

    // Persist the refined image to public/gallery/ so it's addressable as a
    // real URL. This lets the Studio display it, "Use this version" set it as
    // the run's imagePath, and downstream tools (Inpaint, Video) consume it.
    let imagePath: string | null = null;
    try {
      if (!fs.existsSync(GALLERY_DIR)) {
        fs.mkdirSync(GALLERY_DIR, { recursive: true });
      }
      const filename = `kontext-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.png`;
      fs.writeFileSync(
        path.join(GALLERY_DIR, filename),
        Buffer.from(result.imageBase64, "base64")
      );
      imagePath = `/gallery/${filename}`;
    } catch (writeErr) {
      // The image is still returned as base64; the client can fall back to a
      // data URL. Log so the operator notices disk issues.
      console.error(
        "[kontext/edit] failed to persist refined image to gallery:",
        writeErr instanceof Error ? writeErr.message : String(writeErr)
      );
    }

    return NextResponse.json(
      {
        image: result.imageBase64,
        ms: result.ms,
        model: result.model,
        ...(imagePath ? { imagePath } : {}),
      },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof KontextNotDeployedError) {
      return NextResponse.json(
        {
          error: NOT_DEPLOYED_MESSAGE,
          errorMessage: err.message,
        },
        { status: 503 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[kontext/edit] error:", msg);
    return NextResponse.json(
      { error: msg, errorMessage: msg },
      { status: 500 }
    );
  }
}
