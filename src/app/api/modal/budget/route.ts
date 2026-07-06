import { NextRequest, NextResponse } from "next/server";
import {
  getBudgetStatus,
  getSpendRecords,
  countSpendByKind,
  initCycleSpend,
} from "@/lib/modal-client";
import {
  GPU_PRICING,
  DEFAULT_CONTRACT,
  validateContract,
  diagnoseCostBleed,
  type ModalGpu,
} from "@/lib/modal-budget";
import {
  ENGINE_GPU_STRATEGY,
  COLD_START_STRATEGIES,
} from "@/lib/modal-strategy";

export const runtime = "nodejs";

// GET /api/modal/budget → full budget status + cost diagnosis + GPU strategy
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const spent = url.searchParams.get("spent");
  const spentNum = spent ? parseFloat(spent) : undefined;

  const status = getBudgetStatus(spentNum);
  const records = getSpendRecords();
  const counts = countSpendByKind();

  // Diagnose the cost bleed from observed event counts
  const diagnosis = diagnoseCostBleed({
    coldStartsPerDay: counts.coldStarts24h,
    healthChecksPerDay: counts.healthChecks24h,
    currentGpu: "H100" as ModalGpu,
    avgInferenceSec: 4,
  });

  return NextResponse.json({
    budget: status,
    spendRecords: records.slice(-50), // last 50 for the log table
    counts,
    diagnosis,
    gpuPricing: GPU_PRICING,
    engineStrategy: ENGINE_GPU_STRATEGY,
    coldStartStrategies: COLD_START_STRATEGIES,
    contract: DEFAULT_CONTRACT,
    contractValidation: validateContract(DEFAULT_CONTRACT),
  });
}

// POST /api/modal/budget → set the cycle-start spend (from Modal dashboard)
// body: { spentThisCycleUsd: number }
export async function POST(req: NextRequest) {
  let body: { spentThisCycleUsd?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const spent = typeof body.spentThisCycleUsd === "number" ? body.spentThisCycleUsd : null;
  if (spent === null || spent < 0) {
    return NextResponse.json({ error: "spentThisCycleUsd must be a non-negative number" }, { status: 400 });
  }
  initCycleSpend(spent);
  const status = getBudgetStatus(spent);
  return NextResponse.json({ ok: true, budget: status });
}
