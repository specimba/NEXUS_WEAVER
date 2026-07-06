import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isModalEnabled } from "@/lib/modal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/modal/usage
 *
 * Estimates Modal GPU usage + cost based on persisted pipeline runs.
 *
 * Pricing model (Modal H100, as of 2026):
 *   - H100 GPU: $0.00109/sec  (~$0.065/min, ~$3.90/hr)
 *   - We only count `timings.flux` because that's the only stage that
 *     runs on Modal. ST3GG/Judge/Nemotron run on z-ai (no Modal cost).
 *
 * The endpoint also estimates the *effective* cost accounting for cold
 * starts: each cold start adds ~60–420s of GPU time (weight download).
 * We approximate cold starts as 1 per session gap > 15 min.
 */
interface TimingsMap {
  flux?: number;
  st3gg?: number;
  judge?: number;
  nemotron?: number;
  prompt?: number;
  output?: number;
}

function parseTimings(raw: string | null): TimingsMap | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TimingsMap;
  } catch {
    return null;
  }
}

// H100 per-second price on Modal (community cloud).
const H100_PRICE_PER_SEC = 0.00109;
// Rough estimate: each cold start adds ~180s of GPU time (weight load).
const COLD_START_PENALTY_SEC = 180;
// A "session gap" > 15 min likely means a cold start.
const SESSION_GAP_MS = 15 * 60 * 1000;

export async function GET() {
  if (!isModalEnabled()) {
    return NextResponse.json({
      enabled: false,
      message: "Modal routing is disabled — no GPU usage to estimate.",
    });
  }

  // Fetch all completed generations with timings, ordered oldest → newest
  // so we can detect session gaps (cold starts).
  const gens = await db.generation.findMany({
    where: { status: "completed" },
    select: {
      id: true,
      timings: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let totalFluxMs = 0;
  let totalColdStarts = 0;
  let runCount = 0;
  let prevTime: number | null = null;

  for (const g of gens) {
    const t = parseTimings(g.timings);
    if (!t || typeof t.flux !== "number" || t.flux <= 0) continue;
    totalFluxMs += t.flux;
    runCount += 1;
    if (prevTime !== null) {
      const gap = g.createdAt.getTime() - prevTime;
      if (gap > SESSION_GAP_MS) {
        totalColdStarts += 1;
      }
    }
    prevTime = g.createdAt.getTime();
  }

  const totalFluxSec = totalFluxMs / 1000;
  const coldStartSec = totalColdStarts * COLD_START_PENALTY_SEC;
  const totalGpuSec = totalFluxSec + coldStartSec;

  const fluxCost = totalFluxSec * H100_PRICE_PER_SEC;
  const coldStartCost = coldStartSec * H100_PRICE_PER_SEC;
  const totalCost = fluxCost + coldStartCost;

  // Average per-run
  const avgFluxMs = runCount > 0 ? Math.round(totalFluxMs / runCount) : 0;
  const avgCostPerRun = runCount > 0 ? totalCost / runCount : 0;

  // 24h window stats
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentGens = gens.filter((g) => g.createdAt >= dayAgo);
  const recentFluxMs = recentGens
    .map((g) => parseTimings(g.timings)?.flux ?? 0)
    .filter((v) => v > 0)
    .reduce((a, b) => a + b, 0);
  const recentCost = (recentFluxMs / 1000) * H100_PRICE_PER_SEC;

  return NextResponse.json({
    enabled: true,
    runs: runCount,
    runsToday: recentGens.length,
    // timings
    totalFluxSec: Math.round(totalFluxSec * 10) / 10,
    avgFluxMs,
    // cold starts
    coldStarts: totalColdStarts,
    coldStartPenaltySec: coldStartSec,
    // GPU time
    totalGpuSec: Math.round(totalGpuSec * 10) / 10,
    // cost (USD)
    pricePerGpuSec: H100_PRICE_PER_SEC,
    fluxCost: Math.round(fluxCost * 10000) / 10000,
    coldStartCost: Math.round(coldStartCost * 10000) / 10000,
    totalCost: Math.round(totalCost * 10000) / 10000,
    avgCostPerRun: Math.round(avgCostPerRun * 10000) / 10000,
    costToday: Math.round(recentCost * 10000) / 10000,
    // formatted
    totalCostFormatted: `$${totalCost.toFixed(4)}`,
    costTodayFormatted: `$${recentCost.toFixed(4)}`,
    avgCostPerRunFormatted: `$${avgCostPerRun.toFixed(4)}`,
  });
}
