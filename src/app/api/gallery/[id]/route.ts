import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gen = await db.generation.findUnique({
    where: { id },
    include: { safetyScan: true, judgeReport: true },
  });
  if (!gen) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    id: gen.id,
    prompt: gen.prompt,
    style: gen.style,
    aspect: gen.aspect,
    wardrobe: gen.wardrobe,
    size: gen.size,
    imagePath: gen.imagePath,
    status: gen.status,
    verdict: gen.verdict,
    overallScore: gen.overallScore,
    errorMessage: gen.errorMessage,
    createdAt: gen.createdAt.toISOString(),
    updatedAt: gen.updatedAt.toISOString(),
    timings: safeParse<Record<string, number> | null>(gen.timings, null),
    evidence: safeParse<Record<string, unknown> | null>(gen.evidence, null),
    safety: gen.safetyScan
      ? {
          passed: gen.safetyScan.passed,
          score: gen.safetyScan.score,
          riskLevel: gen.safetyScan.riskLevel,
          flags: safeParse<string[]>(gen.safetyScan.flags, []),
          rationale: gen.safetyScan.rationale,
          stageMs: gen.safetyScan.stageMs,
        }
      : null,
    judge: gen.judgeReport
      ? {
          promptAdherence: gen.judgeReport.promptAdherence,
          visualQuality: gen.judgeReport.visualQuality,
          aestheticScore: gen.judgeReport.aestheticScore,
          safetyScore: gen.judgeReport.safetyScore,
          wardrobeMatch: gen.judgeReport.wardrobeMatch,
          overallScore: gen.judgeReport.overallScore,
          verdict: gen.judgeReport.verdict,
          observations: safeParse<string[]>(gen.judgeReport.observations, []),
          strengths: safeParse<string[]>(gen.judgeReport.strengths, []),
          weaknesses: safeParse<string[]>(gen.judgeReport.weaknesses, []),
          stageMs: gen.judgeReport.stageMs,
        }
      : null,
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gen = await db.generation.findUnique({ where: { id } });
  if (!gen) return NextResponse.json({ error: "not found" }, { status: 404 });

  // remove image file if present
  if (gen.imagePath) {
    const abs = path.join(process.cwd(), "public", gen.imagePath);
    if (fs.existsSync(abs)) {
      try {
        fs.unlinkSync(abs);
      } catch {
        /* ignore */
      }
    }
  }

  await db.generation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
