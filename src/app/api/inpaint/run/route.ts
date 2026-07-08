import { NextRequest, NextResponse } from "next/server";

// M5 — NO8D-style inpainting endpoint (stub).
//
// We do NOT have a deployed inpaint GPU in this sandbox (FLUX.1-Kontext-dev
// or Qwen-Image-Edit would need a Modal app + MODAL_INPAINT_BASE_URL). The UI
// fully prepares the request (source image, mask, prompt, denoise strength)
// and POSTs it here. The endpoint:
//   1. Validates the payload.
//   2. Returns a structured { imagePath: null, errorMessage: "…" } so the
//      frontend can render a clear "deploy your inpaint backend" callout.
//
// When the user deploys a real inpaint Modal app, swap the stub block for a
// fetch to `${MODAL_INPAINT_BASE_URL}/generate` with the mask + prompt.
//
// All API calls use relative fetch paths only (no absolute URLs / ports).

export const runtime = "nodejs";
export const maxDuration = 300;

interface InpaintRunBody {
  sourceImagePath?: unknown;
  maskDataUrl?: unknown;
  prompt?: unknown;
  denoise?: unknown;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export async function POST(req: NextRequest) {
  let body: InpaintRunBody;
  try {
    body = (await req.json()) as InpaintRunBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sourceImagePath = isString(body.sourceImagePath)
    ? body.sourceImagePath.trim()
    : "";
  if (!sourceImagePath) {
    return NextResponse.json(
      { error: "sourceImagePath is required" },
      { status: 400 }
    );
  }
  // Path-traversal guard — allow /gallery/ and /api/image/ paths.
  if (
    sourceImagePath.includes("..") ||
    (!sourceImagePath.startsWith("/gallery/") && !sourceImagePath.startsWith("/api/image/"))
  ) {
    return NextResponse.json(
      {
        error: "sourceImagePath must start with /gallery/ or /api/image/",
      },
      { status: 400 }
    );
  }

  const maskDataUrl = isString(body.maskDataUrl) ? body.maskDataUrl : "";
  if (!maskDataUrl) {
    return NextResponse.json(
      { error: "maskDataUrl is required" },
      { status: 400 }
    );
  }
  // The mask is a PNG data URL drawn on the client canvas. We accept any
  // `data:image/...` prefix.
  if (!/^data:image\//i.test(maskDataUrl)) {
    return NextResponse.json(
      { error: "maskDataUrl must be a data:image/* URL" },
      { status: 400 }
    );
  }

  const prompt = isString(body.prompt) ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json(
      { error: "prompt is required" },
      { status: 400 }
    );
  }
  if (prompt.length > 2000) {
    return NextResponse.json(
      { error: "prompt too long (max 2000 chars)" },
      { status: 400 }
    );
  }

  const denoise = isNumber(body.denoise)
    ? Math.max(0.1, Math.min(1.0, body.denoise))
    : 0.75;

  // ─────────────────────────────────────────────────────────────────────────
  // STUB: no real inpaint GPU. Return the structured "not yet deployed"
  // message so the client can render a clear callout. The mask + prompt are
  // ready to send — once MODAL_INPAINT_BASE_URL is set, swap this block.
  // ─────────────────────────────────────────────────────────────────────────
  const errorMessage =
    "Inpainting requires a deployed Modal app with FLUX.1-Kontext-dev or Qwen-Image-Edit. " +
    "Set MODAL_INPAINT_BASE_URL. The mask + prompt are ready to send.";

  return NextResponse.json(
    {
      imagePath: null,
      errorMessage,
      // Echo back the validated params so the client can show what was sent.
      request: {
        sourceImagePath,
        prompt,
        denoise,
        maskBytes: maskDataUrl.length,
      },
    },
    { status: 200 }
  );
}
