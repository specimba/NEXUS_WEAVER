import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getJobState } from "@/lib/pipeline-job-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * GET /api/pipeline/jobs/[id] — poll a pipeline job's progress.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "job id required" }, { status: 400 });

  const state = await getJobState(id);
  if (!state) return NextResponse.json({ error: "job not found" }, { status: 404 });

  // Stuck-job recovery: if a job has been "running" for >5 minutes, mark it as
  // failed. This happens when the dev server is reaped (killed) mid-pipeline —
  // the background worker dies but the DB row stays "running" forever.
  if (state.status === "running" || state.status === "queued") {
    const ageMs = Date.now() - new Date(state.createdAt).getTime();
    const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    if (ageMs > STUCK_THRESHOLD_MS) {
      await db.pipelineJob.update({
        where: { id },
        data: {
          status: "failed",
          errorMessage: `Job timed out after ${Math.round(ageMs / 1000)}s. The server may have restarted mid-pipeline. Please retry.`,
          totalMs: ageMs,
          currentStage: "error",
        },
      });
      // Return the updated state
      const updatedState = await getJobState(id);
      if (updatedState) {
        return NextResponse.json({ ...updatedState, result: null });
      }
    }
  }

  // Hydrate the full pipeline result from the Generation row if available.
  let result: Record<string, unknown> | null = null;
  if (state.generationId) {
    const gen = await db.generation.findUnique({
      where: { id: state.generationId },
      include: { safetyScan: true, judgeReport: true },
    });
    if (gen) {
      let safety: Record<string, unknown> | null = null;
      if (gen.safetyScan) {
        safety = {
          passed: gen.safetyScan.passed,
          score: gen.safetyScan.score,
          riskLevel: gen.safetyScan.riskLevel,
          flags: safeJsonArray(gen.safetyScan.flags),
          rationale: gen.safetyScan.rationale,
          stageMs: gen.safetyScan.stageMs,
        };
      }
      let judge: Record<string, unknown> | null = null;
      if (gen.judgeReport) {
        judge = {
          promptAdherence: gen.judgeReport.promptAdherence,
          visualQuality: gen.judgeReport.visualQuality,
          aestheticScore: gen.judgeReport.aestheticScore,
          safetyScore: gen.judgeReport.safetyScore,
          wardrobeMatch: gen.judgeReport.wardrobeMatch,
          overallScore: gen.judgeReport.overallScore,
          verdict: gen.judgeReport.verdict,
          observations: safeJsonArray(gen.judgeReport.observations),
          strengths: safeJsonArray(gen.judgeReport.strengths),
          weaknesses: safeJsonArray(gen.judgeReport.weaknesses),
          stageMs: gen.judgeReport.stageMs,
        };
      }
      let evidence: Record<string, unknown> | null = null;
      if (gen.evidence) { try { evidence = JSON.parse(gen.evidence); } catch { evidence = { raw: gen.evidence }; } }
      let timings: Record<string, number> | null = null;
      if (gen.timings) { try { timings = JSON.parse(gen.timings); } catch { /* leave null */ } }
      let calibration: Record<string, unknown> | null = null;
      if (gen.calibration) { try { calibration = JSON.parse(gen.calibration); } catch { /* leave null */ } }
      result = {
        id: gen.id,
        status: gen.status,
        prompt: gen.prompt,
        style: gen.style,
        aspect: gen.aspect,
        wardrobe: gen.wardrobe,
        size: gen.size,
        imagePath: gen.imageData ? `/api/image/${gen.id}` : gen.imagePath,
        verdict: gen.verdict,
        overallScore: gen.overallScore,
        safety,
        judge,
        evidence,
        timings,
        calibration,
        loraIds: gen.loraIds ? gen.loraIds.split(",").filter(Boolean) : [],
        maturityTier: gen.maturityTier,
        blockReason: gen.errorMessage && gen.status === "failed" && gen.verdict === "rejected" ? gen.errorMessage : null,
        errorMessage: gen.errorMessage,
        engineId: null,
        backend: state.status === "completed" ? "modal" : null,
        backendMismatch: false,
        createdAt: gen.createdAt.toISOString(),
      };
    }
  }

  return NextResponse.json({ ...state, result });
}

function safeJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}
