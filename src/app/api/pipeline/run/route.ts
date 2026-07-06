import { NextRequest, NextResponse } from "next/server";
import { STYLES, ASPECTS } from "@/lib/nexus-types";
import { DEFAULT_CALIBRATION_ID } from "@/lib/calibration";
import { db } from "@/lib/db";
import { startPipelineJob } from "@/lib/pipeline-job-worker";
import type { PipelineRunInput } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

function parseAspect(aspect: string | null | undefined): string {
  if (aspect && ASPECTS.some((a) => a.id === aspect)) return aspect;
  return "1:1";
}
function parseStyle(style: string | null | undefined): string {
  if (style && (STYLES as readonly string[]).includes(style)) return style;
  return "cinematic";
}

/**
 * POST /api/pipeline/run — ASYNC JOB PATTERN (v5)
 * Creates a PipelineJob row, fires the background worker (NOT awaited), and
 * returns HTTP 202 + { jobId } immediately. Frontend polls /api/pipeline/jobs/[id].
 */
export async function POST(req: NextRequest) {
  let body: {
    prompt?: unknown; style?: unknown; aspect?: unknown; wardrobe?: unknown;
    calibrationId?: unknown; calibrationOverrides?: unknown;
    loraIds?: unknown; loraWeights?: unknown; consentFingerprint?: unknown;
    engineId?: unknown; brainId?: unknown; videoEnabled?: unknown;
    artisticOverride?: unknown; modalBoost?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  if (prompt.length > 2000) return NextResponse.json({ error: "prompt too long (max 2000 chars)" }, { status: 400 });

  const style = parseStyle(typeof body.style === "string" ? body.style : "cinematic");
  const aspect = parseAspect(typeof body.aspect === "string" ? body.aspect : "1:1");
  const wardrobe = typeof body.wardrobe === "string" && body.wardrobe.trim() ? body.wardrobe.trim().slice(0, 500) : null;
  const calibrationId = typeof body.calibrationId === "string" && body.calibrationId ? body.calibrationId : DEFAULT_CALIBRATION_ID;
  const calibrationOverrides = body.calibrationOverrides && typeof body.calibrationOverrides === "object" ? (body.calibrationOverrides as Record<string, unknown>) : undefined;
  const loraIds = Array.isArray(body.loraIds) ? body.loraIds.filter((x): x is string => typeof x === "string") : [];
  const loraWeights = body.loraWeights && typeof body.loraWeights === "object" ? (body.loraWeights as Record<string, number>) : {};
  const consentFingerprint = typeof body.consentFingerprint === "string" ? body.consentFingerprint : undefined;
  const engineId = typeof body.engineId === "string" ? body.engineId : undefined;
  const brainId = typeof body.brainId === "string" ? body.brainId : undefined;
  const videoEnabled = typeof body.videoEnabled === "boolean" ? body.videoEnabled : false;
  const artisticOverride = typeof body.artisticOverride === "boolean" ? body.artisticOverride : false;
  const modalBoost = typeof body.modalBoost === "boolean" ? body.modalBoost : false;

  const input: PipelineRunInput = {
    prompt, style, aspect, wardrobe, calibrationId, calibrationOverrides,
    loraIds, loraWeights, consentFingerprint, engineId, brainId, videoEnabled,
    artisticOverride, modalBoost,
  };

  const createdAtMs = Date.now();
  const job = await db.pipelineJob.create({
    data: { status: "queued", currentStage: "queued", input: JSON.stringify(input) },
  });

  startPipelineJob(job.id, input, createdAtMs);

  return NextResponse.json(
    { jobId: job.id, status: "queued", message: "Pipeline queued. Poll /api/pipeline/jobs/[id] for progress.", createdAt: new Date(createdAtMs).toISOString() },
    { status: 202 }
  );
}

export async function GET() {
  const latest = await db.pipelineJob.findFirst({ orderBy: { createdAt: "desc" } });
  if (!latest) return NextResponse.json({ jobs: [], message: "No pipeline jobs yet." });
  const { getJobState } = await import("@/lib/pipeline-job-worker");
  const state = await getJobState(latest.id);
  return NextResponse.json({ latest: state });
}
