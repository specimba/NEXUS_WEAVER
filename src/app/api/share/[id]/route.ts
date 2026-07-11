import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/share/{generationId}
 *
 * Returns the FULL generation parameters as JSON — enough to reconstruct
 * the exact generation (prompt, engine, calibration, LoRAs, seed, etc.).
 * This enables shareable URLs: /?gen={id} loads the params into the Studio.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const gen = await db.generation.findUnique({
    where: { id },
    select: {
      id: true,
      prompt: true,
      style: true,
      aspect: true,
      wardrobe: true,
      size: true,
      imagePath: true,
      status: true,
      verdict: true,
      overallScore: true,
      calibrationId: true,
      calibration: true,
      loraIds: true,
      seed: true,
      maturityTier: true,
      timings: true,
      evidence: true,
      createdAt: true,
      safetyScan: true,
      judgeReport: true,
    },
  });

  if (!gen) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }

  // Parse the calibration JSON to get engine + steps + cfg
  let calibration: Record<string, unknown> = {};
  try {
    calibration = gen.calibration ? JSON.parse(gen.calibration) : {};
  } catch {}

  let timings: Record<string, number> = {};
  try {
    timings = gen.timings ? JSON.parse(gen.timings) : {};
  } catch {}

  let evidence: Record<string, unknown> = {};
  try {
    evidence = gen.evidence ? JSON.parse(gen.evidence) : {};
  } catch {}

  return NextResponse.json({
    id: gen.id,
    prompt: gen.prompt,
    style: gen.style,
    aspect: gen.aspect,
    wardrobe: gen.wardrobe,
    size: gen.size,
    imagePath: gen.imagePath ? `/api/image/${gen.id}` : null,
    status: gen.status,
    verdict: gen.verdict,
    overallScore: gen.overallScore,
    calibrationId: gen.calibrationId,
    calibration,
    loraIds: gen.loraIds ? gen.loraIds.split(",") : [],
    seed: gen.seed ? Number(gen.seed) : null,
    maturityTier: gen.maturityTier,
    timings,
    evidence,
    createdAt: gen.createdAt.toISOString(),
    safetyScan: gen.safetyScan ? {
      passed: gen.safetyScan.passed,
      score: gen.safetyScan.score,
      riskLevel: gen.safetyScan.riskLevel,
      flags: gen.safetyScan.flags ? JSON.parse(gen.safetyScan.flags) : [],
      rationale: gen.safetyScan.rationale,
    } : null,
    judgeReport: gen.judgeReport ? {
      promptAdherence: gen.judgeReport.promptAdherence,
      visualQuality: gen.judgeReport.visualQuality,
      aestheticScore: gen.judgeReport.aestheticScore,
      safetyScore: gen.judgeReport.safetyScore,
      wardrobeMatch: gen.judgeReport.wardrobeMatch,
      overallScore: gen.judgeReport.overallScore,
      verdict: gen.judgeReport.verdict,
      observations: gen.judgeReport.observations ? JSON.parse(gen.judgeReport.observations) : [],
      strengths: gen.judgeReport.strengths ? JSON.parse(gen.judgeReport.strengths) : [],
      weaknesses: gen.judgeReport.weaknesses ? JSON.parse(gen.judgeReport.weaknesses) : [],
    } : null,
  });
}
