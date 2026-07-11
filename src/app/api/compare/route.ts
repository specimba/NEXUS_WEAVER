import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runPipeline, type PipelineRunInput } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/compare
 *
 * A/B comparison — generates the SAME prompt with TWO different engines
 * and returns both results side-by-side. This is the showcase feature for
 * demonstrating the "3-model experimental advantage".
 *
 * Body: {
 *   prompt: string,
 *   engineA: string,  // engine ID (e.g. "flux2-klein-9b")
 *   engineB: string,  // engine ID (e.g. "krea-2-turbo")
 *   calibrationA?: string,  // calibration preset ID
 *   calibrationB?: string,
 *   loraIds?: string[],
 *   loraWeights?: Record<string, number>,
 *   aspect?: string,
 *   style?: string,
 * }
 *
 * Returns: { jobA: {jobId}, jobB: {jobId} } — poll /api/pipeline/jobs/{id} for each
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

  const engineA = typeof body.engineA === "string" ? body.engineA : "flux2-klein-9b";
  const engineB = typeof body.engineB === "string" ? body.engineB : "krea-2-turbo";
  const calibrationA = typeof body.calibrationA === "string" ? body.calibrationA : "studio-quality";
  const calibrationB = typeof body.calibrationB === "string" ? body.calibrationB : "krea2-turbo-fast";
  const loraIds = Array.isArray(body.loraIds) ? body.loraIds.filter((x): x is string => typeof x === "string") : [];
  const loraWeights = body.loraWeights && typeof body.loraWeights === "object" ? body.loraWeights as Record<string, number> : {};
  const aspect = typeof body.aspect === "string" ? body.aspect : "1:1";
  const style = typeof body.style === "string" ? body.style : "photorealistic";
  const skipBrain = typeof body.skipBrain === "boolean" ? body.skipBrain : true;

  // Create both jobs
  const baseInput: Omit<PipelineRunInput, "engineId" | "calibrationId"> = {
    prompt,
    style,
    aspect,
    wardrobe: null,
    loraIds,
    loraWeights,
    skipBrain,
  };

  const inputA: PipelineRunInput = { ...baseInput, engineId: engineA, calibrationId: calibrationA };
  const inputB: PipelineRunInput = { ...baseInput, engineId: engineB, calibrationId: calibrationB };

  const jobA = await db.pipelineJob.create({
    data: { status: "queued", currentStage: "queued", input: JSON.stringify(inputA) },
  });
  const jobB = await db.pipelineJob.create({
    data: { status: "queued", currentStage: "queued", input: JSON.stringify(inputB) },
  });

  // Start both pipelines (fire-and-forget, same seed for fair comparison)
  const { startPipelineJob } = await import("@/lib/pipeline-job-worker");
  const seed = Math.floor(Math.random() * 2_147_483_647);
  startPipelineJob(jobA.id, { ...inputA, modalBoost: false } as PipelineRunInput, Date.now());
  startPipelineJob(jobB.id, { ...inputB, modalBoost: false } as PipelineRunInput, Date.now());

  return NextResponse.json({
    jobA: { jobId: jobA.id, engine: engineA, calibration: calibrationA },
    jobB: { jobId: jobB.id, engine: engineB, calibration: calibrationB },
    seed,
    message: "A/B comparison started. Poll /api/pipeline/jobs/{id} for each job.",
  }, { status: 202 });
}
