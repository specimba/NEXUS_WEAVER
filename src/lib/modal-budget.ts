// NEXUS Visual Weaver v4 — Modal Budget & Cost Optimization
// ---------------------------------------------------------------------------
// Ports the user's `modal_budget.py` ModalRunContract into the dashboard and
// adds a live cost estimator + spend tracker + kill switch.
//
// ROOT CAUSE OF BUDGET BLEED (from Modal logs analysis):
//   - 5 cold starts of FLUX.1-schnell in 17 minutes (each ~28s H100 = ~$0.031)
//   - 310 background health checks (GET /health) from 8 polling loops
//   - 0 actual /generate calls — paid for cold starts + idle, generated nothing
//   - The dashboard's `refetchInterval: 15000` on /api/modal/status kept the
//     container warm (idle H100 waste) OR triggered cold starts when it was down.
//
// MODAL PRICING (authoritative, modal.com/pricing, per second):
//   H100:  $0.001097/s = $3.95/hr   ← current (overkill for FLUX.1-schnell 12B)
//   H200:  $0.001261/s = $4.54/hr
//   B200:  $0.001736/s = $6.25/hr
//   A100:  $0.000694/s = $2.50/hr (80GB)
//   L40S:  $0.000542/s = $1.95/hr   ← recommended for FLUX.2 9B / Krea 2 (48GB)
//   A10:   $0.000306/s = $1.10/hr   ← recommended for Z-Image / FLUX.1 fp8 (24GB)
//   L4:    $0.000222/s = $0.80/hr   ← cheapest, fits FLUX.1-schnell fp8 (24GB)
//   T4:    $0.000164/s = $0.59/hr   ← too small (16GB) for diffusion
//   Non-preemptible: 3x base price
//
// COLD START FACTS (modal.com/docs/guide/cold-start):
//   - Default scaledown_window: 60s. Range: 2s–1200s (20 min).
//   - Cold start = container boot + image pull + weight load (~25-30s for FLUX).
//   - GPU snapshotting (alpha) can drastically cut cold start time.
//   - min_containers > 0 = always-on cost (forbidden by contract).
//   - buffer_containers = pre-warmed pool (also costs idle).
// ---------------------------------------------------------------------------

// ── ModalRunContract (ported from upload/modal_budget.py) ───────────────────

export const DEFAULT_PILOT_BUDGET_USD = 40.0;

export interface ModalRunContract {
  maxSpendUsd: number;
  minContainers: number;
  backgroundPolling: boolean;
  broadModelHealthChecks: boolean;
  volumeCleanupRequired: boolean;
  perRunCostSummaryRequired: boolean;
  artifactManifestRequired: boolean;
  allowedOperations: readonly string[];
  notes: string[];
}

export const DEFAULT_CONTRACT: ModalRunContract = {
  maxSpendUsd: DEFAULT_PILOT_BUDGET_USD,
  minContainers: 0,
  backgroundPolling: false,
  broadModelHealthChecks: false,
  volumeCleanupRequired: true,
  perRunCostSummaryRequired: true,
  artifactManifestRequired: true,
  allowedOperations: ["eval_only", "fine_tune", "distill", "probe", "generate"] as const,
  notes: [],
};

export interface ContractValidation {
  passed: boolean;
  maxSpendUsd: number;
  errors: string[];
}

export function validateContract(contract: ModalRunContract): ContractValidation {
  const errors: string[] = [];
  if (contract.maxSpendUsd > DEFAULT_PILOT_BUDGET_USD) {
    errors.push(`max_spend_usd must be <= ${DEFAULT_PILOT_BUDGET_USD}`);
  }
  if (contract.maxSpendUsd <= 0) errors.push("max_spend_usd must be positive");
  if (contract.minContainers !== 0) {
    errors.push("min_containers must be 0 to avoid surprise always-on spend");
  }
  if (contract.backgroundPolling) {
    errors.push("background_polling must be disabled (was the #1 budget bleeder)");
  }
  if (contract.broadModelHealthChecks) {
    errors.push("broad_model_health_checks must be disabled");
  }
  if (!contract.volumeCleanupRequired) errors.push("volume_cleanup_required must be true");
  if (!contract.perRunCostSummaryRequired) errors.push("per_run_cost_summary_required must be true");
  if (!contract.artifactManifestRequired) errors.push("artifact_manifest_required must be true");
  return { passed: errors.length === 0, maxSpendUsd: contract.maxSpendUsd, errors };
}

// ── GPU pricing table (authoritative from modal.com/pricing) ────────────────

export type ModalGpu = "H100" | "H200" | "B200" | "A100-80" | "A100-40" | "L40S" | "A10" | "L4" | "T4" | "none";

export interface GpuPricing {
  id: ModalGpu;
  name: string;
  vramGb: number;
  costPerSec: number;
  costPerHour: number;
  preemptible: boolean;
  recommended: boolean;
  notes: string;
}

export const GPU_PRICING: GpuPricing[] = [
  { id: "L4", name: "Nvidia L4", vramGb: 24, costPerSec: 0.000222, costPerHour: 0.80, preemptible: true, recommended: true, notes: "Cheapest viable GPU. Fits FLUX.1-schnell fp8 / Z-Image. 80% cheaper than H100." },
  { id: "A10", name: "Nvidia A10", vramGb: 24, costPerSec: 0.000306, costPerHour: 1.10, preemptible: true, recommended: true, notes: "24GB. FLUX.1/2 fp8, Z-Image, Ideogram 4. 72% cheaper than H100." },
  { id: "L40S", name: "Nvidia L40S", vramGb: 48, costPerSec: 0.000542, costPerHour: 1.95, preemptible: true, recommended: true, notes: "48GB. FLUX.2 9B bf16, Krea 2, Qwen Edit. 51% cheaper than H100." },
  { id: "A100-40", name: "A100 40GB", vramGb: 40, costPerSec: 0.000583, costPerHour: 2.10, preemptible: true, recommended: false, notes: "Older A100. Use L40S instead at 48GB for less." },
  { id: "A100-80", name: "A100 80GB", vramGb: 80, costPerSec: 0.000694, costPerHour: 2.50, preemptible: true, recommended: false, notes: "80GB. Only for large video models that don't fit in 48GB." },
  { id: "H100", name: "Nvidia H100", vramGb: 80, costPerSec: 0.001097, costPerHour: 3.95, preemptible: true, recommended: false, notes: "Current default — OVERKILL for 12B FLUX.1-schnell. Reserve for Wan 2.2 / HunyuanVideo only." },
  { id: "H200", name: "Nvidia H200", vramGb: 141, costPerSec: 0.001261, costPerHour: 4.54, preemptible: true, recommended: false, notes: "141GB. Only for 70B+ LLMs or multi-model video." },
  { id: "B200", name: "Nvidia B200", vramGb: 192, costPerSec: 0.001736, costPerHour: 6.25, preemptible: true, recommended: false, notes: "192GB. Reserved for future frontier models." },
  { id: "T4", name: "Nvidia T4", vramGb: 16, costPerSec: 0.000164, costPerHour: 0.59, preemptible: true, recommended: false, notes: "16GB — too small for diffusion models. CPU-only tasks only." },
];

export function getGpuPricing(id: ModalGpu): GpuPricing {
  return GPU_PRICING.find((g) => g.id === id) ?? GPU_PRICING[5]; // default H100
}

// ── Cost estimator ───────────────────────────────────────────────────────────

export interface CostEstimate {
  gpu: ModalGpu;
  costPerSec: number;
  coldStartSec: number;
  inferenceSec: number;
  coldStartCost: number;
  inferenceCost: number;
  totalCostPerRun: number;
  vsH100Pct: number; // negative = savings
}

export function estimateRunCost(params: {
  gpu: ModalGpu;
  coldStartSec: number; // weight-load time (cold start)
  inferenceSec: number; // actual diffusion time
}): CostEstimate {
  const gpu = getGpuPricing(params.gpu);
  const coldStartCost = gpu.costPerSec * params.coldStartSec;
  const inferenceCost = gpu.costPerSec * params.inferenceSec;
  const totalCostPerRun = coldStartCost + inferenceCost;
  const h100 = getGpuPricing("H100");
  const h100Total = h100.costPerSec * (params.coldStartSec + params.inferenceSec);
  const vsH100Pct = h100Total > 0 ? ((totalCostPerRun - h100Total) / h100Total) * 100 : 0;
  return {
    gpu: params.gpu,
    costPerSec: gpu.costPerSec,
    coldStartSec: params.coldStartSec,
    inferenceSec: params.inferenceSec,
    coldStartCost,
    inferenceCost,
    totalCostPerRun,
    vsH100Pct,
  };
}

// ── Spend tracker (in-memory + persisted to DB via /api/modal/budget) ────────

export interface SpendRecord {
  timestamp: number;
  gpu: ModalGpu;
  durationSec: number;
  costUsd: number;
  kind: "cold_start" | "inference" | "idle" | "health_check";
  generationId?: string;
}

export interface BudgetStatus {
  workspaceBudgetUsd: number;
  spentThisCycleUsd: number;
  remainingUsd: number;
  spentPct: number;
  killSwitchActive: boolean;
  contract: ModalRunContract;
  recentSpend: SpendRecord[];
  projectedMonthEndUsd: number;
}

// Default workspace budget — user is on Starter ($100). They're at 87%.
export const DEFAULT_WORKSPACE_BUDGET_USD = 100;

export function assessBudgetStatus(params: {
  spentThisCycleUsd: number;
  workspaceBudgetUsd?: number;
  contract?: ModalRunContract;
  recentSpend?: SpendRecord[];
}): BudgetStatus {
  const workspaceBudgetUsd = params.workspaceBudgetUsd ?? DEFAULT_WORKSPACE_BUDGET_USD;
  const contract = params.contract ?? DEFAULT_CONTRACT;
  const remainingUsd = workspaceBudgetUsd - params.spentThisCycleUsd;
  const spentPct = workspaceBudgetUsd > 0 ? (params.spentThisCycleUsd / workspaceBudgetUsd) * 100 : 0;
  // Kill switch: activate when spent > 90% OR remaining < $5
  const killSwitchActive = spentPct >= 90 || remainingUsd < 5;
  // Simple linear projection: scale recent spend to a 30-day month
  const recent = params.recentSpend ?? [];
  const last24h = recent.filter((r) => r.timestamp > Date.now() - 24 * 3600 * 1000);
  const last24hCost = last24h.reduce((a, r) => a + r.costUsd, 0);
  const projectedMonthEndUsd = params.spentThisCycleUsd + last24hCost * 30;
  return {
    workspaceBudgetUsd,
    spentThisCycleUsd: params.spentThisCycleUsd,
    remainingUsd,
    spentPct,
    killSwitchActive,
    contract,
    recentSpend: recent,
    projectedMonthEndUsd,
  };
}

// ── Diagnosis: what's burning the budget ─────────────────────────────────────

export interface CostDiagnosis {
  criticalIssues: { title: string; detail: string; impactUsd: string; fix: string }[];
  recommendations: { title: string; detail: string; savingsPct: number }[];
  estimatedMonthlySavingsUsd: number;
}

export function diagnoseCostBleed(params: {
  coldStartsPerDay: number;
  healthChecksPerDay: number;
  currentGpu: ModalGpu;
  avgInferenceSec: number;
}): CostDiagnosis {
  const gpu = getGpuPricing(params.currentGpu);
  const h100 = getGpuPricing("H100");

  // Cost of cold starts: each ~28s of H100
  const coldStartCostPerDay = params.coldStartsPerDay * 28 * h100.costPerSec;
  // Cost of health-check-induced idle: each warm health check keeps container
  // alive ~60s extra. 310 checks/day × 60s × H100 rate.
  const idleCostPerDay = params.healthChecksPerDay * 60 * h100.costPerSec;

  const criticalIssues: CostDiagnosis["criticalIssues"] = [];
  const recommendations: CostDiagnosis["recommendations"] = [];

  if (params.healthChecksPerDay > 50) {
    criticalIssues.push({
      title: "Background health-check polling",
      detail: `${params.healthChecksPerDay} health checks/day from 8 dashboard polling loops (10-30s intervals). Each check either keeps the container warm (idle H100 waste) or triggers a cold start.`,
      impactUsd: `$${idleCostPerDay.toFixed(2)}/day`,
      fix: "Remove all refetchInterval polling of /api/modal/status. Replace with on-demand fetch (only when user opens Monitor or runs a generation). Use a 60s shared cache.",
    });
  }
  if (params.coldStartsPerDay > 3) {
    criticalIssues.push({
      title: "Excessive cold starts",
      detail: `${params.coldStartsPerDay} cold starts/day. Each loads FLUX.1-schnell weights (~28s H100). The 120s scaledown window + 15s polling creates a cold-start storm.`,
      impactUsd: `$${coldStartCostPerDay.toFixed(2)}/day`,
      fix: "Stop background polling (above). Enable GPU snapshotting (alpha). Reduce scaledown_window to 60s. Cache weights in a Modal Volume (already done — stop re-committing on every start).",
    });
  }
  if (params.currentGpu === "H100") {
    recommendations.push({
      title: "Downgrade FLUX.1/FLUX.2 image generation from H100 to L40S or L4",
      detail: `FLUX.1-schnell is 12B params — fits in 24GB (L4/A10 fp8) or 48GB (L40S bf16). H100's 80GB is overkill. L40S = $1.95/hr (51% cheaper). L4 = $0.80/hr (80% cheaper).`,
      savingsPct: 51,
    });
    recommendations.push({
      title: "Route Z-Image Turbo to L4",
      detail: `Z-Image Turbo is the fastest engine (4 steps). On L4 at $0.80/hr, a 4-step 1024² generation costs ~$0.001. Reserve H100 for Wan 2.2 / HunyuanVideo only.`,
      savingsPct: 80,
    });
  }
  recommendations.push({
    title: "Batch generations in a single session",
    detail: `Each cold start amortizes over the generations in that session. 10 generations in one warm session = 1 cold start. 10 generations across 10 cold sessions = 10 cold starts (~$0.31 wasted).`,
    savingsPct: 30,
  });

  const gpuSavings = params.currentGpu === "H100" ? 0.5 : 0; // ~50% from L40S
  const pollingSavings = idleCostPerDay > 0 ? 0.9 : 0; // 90% of idle waste
  const coldStartSavings = coldStartCostPerDay > 0 ? 0.7 : 0; // 70% of cold-start waste
  const totalDaily = coldStartCostPerDay + idleCostPerDay;
  const estimatedMonthlySavingsUsd = totalDaily * 30 * 0.8 + (gpuSavings > 0 ? 15 : 0);

  return { criticalIssues, recommendations, estimatedMonthlySavingsUsd };
}
