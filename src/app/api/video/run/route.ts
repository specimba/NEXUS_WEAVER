import { NextRequest, NextResponse } from "next/server";
import { runVideoStage } from "@/lib/video-pipeline";

// Video generation on Modal can take 30-120s warm, much longer cold.
// Match the image pipeline's maxDuration so the fetch doesn't get killed
// by the platform before Modal responds.
export const runtime = "nodejs";
export const maxDuration = 300;

interface VideoRunBody {
  sourceImagePath?: unknown;
  prompt?: unknown;
  engineId?: unknown;
  steps?: unknown;
  cfg?: unknown;
  durationSec?: unknown;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export async function POST(req: NextRequest) {
  let body: VideoRunBody;
  try {
    body = (await req.json()) as VideoRunBody;
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
  // Guard against path traversal — allow /gallery/ and /api/image/ paths
  if (
    sourceImagePath.includes("..") ||
    (!sourceImagePath.startsWith("/gallery/") && !sourceImagePath.startsWith("/api/image/"))
  ) {
    return NextResponse.json(
      { error: "sourceImagePath must start with /gallery/ or /api/image/" },
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

  const engineId = isString(body.engineId) && body.engineId ? body.engineId : "wan-2.2";
  const steps = isNumber(body.steps) ? body.steps : undefined;
  const cfg = isNumber(body.cfg) ? body.cfg : undefined;
  const durationSec = isNumber(body.durationSec) ? body.durationSec : undefined;

  const result = await runVideoStage({
    sourceImagePath,
    prompt,
    engineId,
    steps,
    cfg,
    durationSec,
  });

  return NextResponse.json(result, { status: 200 });
}
