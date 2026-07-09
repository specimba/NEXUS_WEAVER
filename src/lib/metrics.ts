import { db } from "@/lib/db";
import type { StageId, MetricsResponse } from "@/lib/nexus-types";

export interface TimingMap {
  prompt?: number;
  flux?: number;
  st3gg?: number;
  judge?: number;
  evidence?: number;
  output?: number;
}

// Parse a JSON timings string safely
export function parseTimings(raw: string | null | undefined): TimingMap | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TimingMap;
  } catch {
    return null;
  }
}

// Total ms across all stages
export function totalMs(t: TimingMap | null | undefined): number | null {
  if (!t) return null;
  const vals = Object.values(t).filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0);
}

// Compute aggregate metrics for the Command Center
export async function computeMetrics(): Promise<MetricsResponse> {
  const generations = await db.generation.findMany({
    select: {
      id: true,
      status: true,
      verdict: true,
      overallScore: true,
      timings: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const total = generations.length;
  const completed = generations.filter((g) => g.status === "completed").length;
  const failed = generations.filter((g) => g.status === "failed").length;
  const approved = generations.filter((g) => g.verdict === "approved").length;
  const rejected = generations.filter((g) => g.verdict === "rejected").length;
  const needsReview = generations.filter((g) => g.verdict === "needs_review").length;

  const scored = generations.filter((g) => typeof g.overallScore === "number");
  const avgScore =
    scored.length > 0
      ? Math.round(
          (scored.reduce((a, g) => a + (g.overallScore as number), 0) / scored.length) * 10
        ) / 10
      : null;

  const timingTotals = generations
    .map((g) => totalMs(parseTimings(g.timings)))
    .filter((v): v is number => typeof v === "number");
  const avgTotalMs =
    timingTotals.length > 0
      ? Math.round(timingTotals.reduce((a, b) => a + b, 0) / timingTotals.length)
      : null;

  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  // per-stage aggregates
  const stageIds: StageId[] = ["prompt", "flux", "st3gg", "judge", "evidence", "output"];
  const byStage = {} as MetricsResponse["byStage"];
  for (const sid of stageIds) {
    const ms = generations
      .map((g) => parseTimings(g.timings)?.[sid])
      .filter((v): v is number => typeof v === "number");
    byStage[sid] = {
      count: ms.length,
      avgMs: ms.length > 0 ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0,
    };
  }

  const recentEvents = await db.auditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, message: true, severity: true, createdAt: true },
  });
  const recent = recentEvents.map((e) => ({
    id: e.id,
    message: e.message,
    severity: e.severity,
    createdAt: e.createdAt.toISOString(),
  }));

  return {
    total,
    completed,
    failed,
    approved,
    rejected,
    needsReview,
    avgScore,
    avgTotalMs,
    successRate,
    recent,
    byStage,
  };
}
