"use client";

// NEXUS Visual Weaver v4 — Cost Lab View
// ---------------------------------------------------------------------------
// Mission-control for Modal spend optimization. Reaches into /api/modal/budget
// (which exposes the in-memory spend tracker + diagnosis + GPU pricing +
// engine→GPU strategy + cold-start strategies + the ModalRunContract).
//
// Built to answer one question: "why is my Modal budget at 87%?"
// ---------------------------------------------------------------------------

import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Panel, SectionHeader } from "./command-view";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Cpu,
  Download,
  Copy,
  RefreshCw,
  ShieldCheck,
  Zap,
  Snowflake,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Wallet,
  PiggyBank,
  ChevronDown,
  ChevronUp,
  Terminal,
  Server,
  Activity,
  Clock,
  CircleDot,
  FileCode2,
  Info,
  type LucideIcon,
} from "lucide-react";
import {
  GPU_PRICING,
  type GpuPricing,
  type ModalGpu,
  type ModalRunContract,
  type SpendRecord,
  type BudgetStatus,
  type CostDiagnosis,
  type ContractValidation,
} from "@/lib/modal-budget";
import {
  ENGINE_GPU_STRATEGY,
  COLD_START_STRATEGIES,
  OPTIMIZED_MODAL_APP_CODE,
  type EngineGpuStrategy,
} from "@/lib/modal-strategy";

// ── Response shape from /api/modal/budget ──────────────────────────────────

interface BudgetApiResponse {
  budget: BudgetStatus;
  spendRecords: SpendRecord[];
  counts: {
    coldStarts24h: number;
    inferences24h: number;
    healthChecks24h: number;
    idleEvents24h: number;
  };
  diagnosis: CostDiagnosis;
  gpuPricing: GpuPricing[];
  engineStrategy: EngineGpuStrategy[];
  coldStartStrategies: { id: string; title: string; detail: string; impact: string }[];
  contract: ModalRunContract;
  contractValidation: ContractValidation;
}

// Engine type lookup (kept locally — do not import from lib/engines.ts since
// the strategy array is already self-describing by engineId prefix).
const ENGINE_TYPE_BY_ID: Record<string, "image" | "edit" | "video"> = {
  "flux2-klein-9b": "image",
  "flux2-dev": "image",
  "krea-2-turbo": "image",
  "krea-2-raw": "image",
  "z-image-turbo": "image",
  "ideogram-4": "image",
  "flux1-kontext-dev": "edit",
  "qwen-image-edit": "edit",
  "wan-2.2": "video",
  "ltx-2.3": "video",
  "longcat-video": "video",
  joyai: "video",
  "sulphur-2": "video",
  "hunyuan-video": "video",
};

const ENGINE_TYPE_META: Record<"image" | "edit" | "video", { label: string; tone: string }> = {
  image: { label: "Image", tone: "text-emerald-300 border-emerald-500/30 bg-emerald-500/5" },
  edit: { label: "Edit", tone: "text-teal-300 border-teal-500/30 bg-teal-500/5" },
  video: { label: "Video", tone: "text-rose-300 border-rose-500/30 bg-rose-500/5" },
};

function useBudget() {
  return useQuery<BudgetApiResponse>({
    queryKey: ["modal-budget"],
    queryFn: async () => {
      const res = await fetch("/api/modal/budget", { cache: "no-store" });
      if (!res.ok) throw new Error("modal-budget");
      return res.json();
    },
    // NO refetchInterval — cost optimization. Refresh on demand via the
    // Refresh button. Polling here would be ironic.
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtUsd(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "$—";
  return `$${v.toFixed(digits)}`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${hh}:${mm}:${ss}`;
}

const KIND_META: Record<
  SpendRecord["kind"],
  { label: string; tone: string; icon: LucideIcon }
> = {
  cold_start: {
    label: "Cold start",
    tone: "text-amber-300 border-amber-500/30 bg-amber-500/5",
    icon: Snowflake,
  },
  inference: {
    label: "Inference",
    tone: "text-emerald-300 border-emerald-500/30 bg-emerald-500/5",
    icon: Zap,
  },
  idle: {
    label: "Idle",
    tone: "text-rose-300 border-rose-500/30 bg-rose-500/5",
    icon: Clock,
  },
  health_check: {
    label: "Health check",
    tone: "text-rose-300 border-rose-500/30 bg-rose-500/5",
    icon: Activity,
  },
};

function gpuTone(gpu: ModalGpu): { row: string; badge: string } {
  if (gpu === "H100") {
    return {
      row: "bg-amber-500/[0.06] border-amber-500/30",
      badge: "text-amber-300 border-amber-500/40 bg-amber-500/10",
    };
  }
  if (gpu === "L4" || gpu === "A10" || gpu === "L40S") {
    return {
      row: "bg-emerald-500/[0.06] border-emerald-500/30",
      badge: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
    };
  }
  return {
    row: "",
    badge: "text-muted-foreground border-border/60 bg-card/40",
  };
}

// ── Main component ─────────────────────────────────────────────────────────

export function CostLabView() {
  const { data, isLoading, isError, refetch, isFetching } = useBudget();
  const qc = useQueryClient();
  const [refreshingStatus, setRefreshingStatus] = useState(false);

  const onRefresh = useCallback(async () => {
    // 1. Refresh Modal backend status (uses the 5min server cache — force=1 was
    //    removed because it cold-started FLUX.2 on every Cost Lab open. Cost audit 2-a.)
    setRefreshingStatus(true);
    try {
      await fetch("/api/modal/status", { cache: "no-store" });
      // Invalidate the sidebar status query so the header reflects truth.
      qc.invalidateQueries({ queryKey: ["modal-status"] });
    } catch {
      /* swallow — the budget refresh is the important one */
    } finally {
      setRefreshingStatus(false);
    }
    // 2. Re-fetch the budget payload.
    await refetch();
    toast.success("Cost Lab refreshed", {
      description: "Budget status + Modal health re-fetched on demand.",
    });
  }, [refetch, qc]);

  const b = data?.budget;
  const d = data?.diagnosis;
  const counts = data?.counts;

  return (
    <div className="space-y-5 nexus-rise">
      <SectionHeader
        eyebrow="Cost Lab"
        title="Modal Spend Mission Control"
        desc="Real-time budget tracking, cost-bleed diagnosis, and GPU right-sizing. No background polling — every fetch is intentional."
        right={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isFetching || refreshingStatus || isLoading}
              className="gap-1.5"
            >
              {isFetching || refreshingStatus ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
        }
      />

      {/* Loading skeleton */}
      {isLoading ? (
        <Card className="nexus-card">
          <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="font-mono text-sm">Loading budget status…</span>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card className="nexus-card border-rose-500/30">
          <CardContent className="flex items-center gap-3 py-12 text-rose-300">
            <AlertCircle className="h-4 w-4" />
            <span className="font-mono text-sm">
              Could not load /api/modal/budget. Check the backend.
            </span>
          </CardContent>
        </Card>
      ) : null}

      {/* ── 1. Budget Emergency Banner ──────────────────────────────────── */}
      {b && b.killSwitchActive ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Card className="nexus-card border-rose-500/40 bg-rose-500/[0.07]">
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-500/15 text-rose-300 nexus-glow">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold uppercase tracking-wider text-rose-200">
                      Kill Switch Active
                    </span>
                    <Badge className="border-rose-500/40 bg-rose-500/15 text-rose-200">
                      Modal generation disabled
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-rose-200/80">
                    Budget at {b.spentPct.toFixed(0)}% · {fmtUsd(b.remainingUsd)} remaining of{" "}
                    {fmtUsd(b.workspaceBudgetUsd, 0)}. The pipeline refuses new Modal runs until
                    spend is reset or budget is increased.
                  </p>
                </div>
              </div>
              <SetSpendDialog
                current={b.spentThisCycleUsd}
                onSaved={() => {
                  refetch();
                  qc.invalidateQueries({ queryKey: ["modal-budget"] });
                }}
              />
            </CardContent>
          </Card>
        </motion.div>
      ) : b && b.spentPct >= 70 ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Card className="nexus-card border-amber-500/40 bg-amber-500/[0.06]">
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-300 nexus-pulse">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold uppercase tracking-wider text-amber-200">
                      Modal budget at {b.spentPct.toFixed(0)}%
                    </span>
                    <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-200">
                      {fmtUsd(b.remainingUsd)} remaining
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-amber-200/80">
                    Approaching the kill-switch threshold (90% or &lt;$5). Sync your actual Modal
                    dashboard spend below to keep the tracker accurate.
                  </p>
                </div>
              </div>
              <SetSpendDialog
                current={b.spentThisCycleUsd}
                onSaved={() => {
                  refetch();
                  qc.invalidateQueries({ queryKey: ["modal-budget"] });
                }}
              />
            </CardContent>
          </Card>
        </motion.div>
      ) : null}

      {/* ── 2. Spend Overview Cards ─────────────────────────────────────── */}
      {b && d ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SpendStatCard
            icon={<Wallet className="h-3.5 w-3.5" />}
            label="Spent This Cycle"
            value={fmtUsd(b.spentThisCycleUsd)}
            sub={`${b.spentPct.toFixed(1)}% of ${fmtUsd(b.workspaceBudgetUsd, 0)}`}
            tone={b.spentPct >= 90 ? "bad" : b.spentPct >= 70 ? "warn" : "ok"}
            trend={b.spentPct >= 70 ? "up" : "flat"}
          />
          <SpendStatCard
            icon={<PiggyBank className="h-3.5 w-3.5" />}
            label="Remaining"
            value={fmtUsd(b.remainingUsd)}
            sub={`of ${fmtUsd(b.workspaceBudgetUsd, 0)} workspace budget`}
            tone={b.remainingUsd < 10 ? "bad" : b.remainingUsd < 25 ? "warn" : "ok"}
            trend={b.remainingUsd < 25 ? "down" : "flat"}
          />
          <SpendStatCard
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Projected Month-End"
            value={fmtUsd(b.projectedMonthEndUsd)}
            sub={`based on 24h burn × 30`}
            tone={b.projectedMonthEndUsd > b.workspaceBudgetUsd ? "bad" : "warn"}
            trend={b.projectedMonthEndUsd > b.workspaceBudgetUsd ? "up" : "flat"}
          />
          <SpendStatCard
            icon={<TrendingDown className="h-3.5 w-3.5" />}
            label="Est. Monthly Savings"
            value={fmtUsd(d.estimatedMonthlySavingsUsd)}
            sub="after applying recommendations"
            tone="ok"
            trend="down"
          />
        </div>
      ) : null}

      {/* ── Counts strip ──────────────────────────────────────────────── */}
      {counts ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <CountChip
            icon={<Snowflake className="h-3.5 w-3.5" />}
            label="Cold starts · 24h"
            value={counts.coldStarts24h}
            tone={counts.coldStarts24h > 3 ? "bad" : "neutral"}
          />
          <CountChip
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Inferences · 24h"
            value={counts.inferences24h}
            tone={counts.inferences24h > 0 ? "ok" : "neutral"}
          />
          <CountChip
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Health checks · 24h"
            value={counts.healthChecks24h}
            tone={counts.healthChecks24h > 50 ? "bad" : "neutral"}
          />
          <CountChip
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Idle events · 24h"
            value={counts.idleEvents24h}
            tone={counts.idleEvents24h > 0 ? "warn" : "neutral"}
          />
        </div>
      ) : null}

      {/* ── 3. Cost Diagnosis ──────────────────────────────────────────── */}
      {d ? (
        <Panel
          title="Cost Diagnosis"
          icon={<AlertCircle className="h-3.5 w-3.5 text-amber-300" />}
          action={
            <span className="font-mono text-[10px] text-muted-foreground">
              {d.criticalIssues.length} critical · {d.recommendations.length} recs
            </span>
          }
        >
          <div className="space-y-4">
            {/* Critical issues */}
            <div className="space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-rose-300/80">
                Critical Issues — what's burning the budget
              </div>
              {d.criticalIssues.length === 0 ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] px-3 py-2.5 text-xs text-emerald-200">
                  <CheckCircle2 className="mr-2 inline h-3.5 w-3.5" />
                  No critical cost-bleed detected. Spend pattern looks healthy.
                </div>
              ) : (
                <div className="grid gap-2 lg:grid-cols-2">
                  {d.criticalIssues.map((issue, i) => (
                    <motion.div
                      key={`${issue.title}-${i}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.04 }}
                      className="rounded-lg border border-rose-500/30 bg-rose-500/[0.05] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-mono text-xs font-semibold text-rose-100">
                          {issue.title}
                        </div>
                        <Badge className="shrink-0 border-amber-500/40 bg-amber-500/15 text-amber-200">
                          {issue.impactUsd}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-rose-100/70">
                        {issue.detail}
                      </p>
                      <div className="mt-2 flex items-start gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] px-2 py-1.5 text-[11px] text-emerald-200">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          <span className="font-semibold">Fix:</span> {issue.fix}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Recommendations */}
            <div className="space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-300/80">
                Recommendations — savings opportunities
              </div>
              {d.recommendations.length === 0 ? (
                <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-2.5 text-xs text-muted-foreground">
                  No recommendations. You're already on the optimal GPU + polling strategy.
                </div>
              ) : (
                <div className="grid gap-2 lg:grid-cols-2">
                  {d.recommendations.map((rec, i) => (
                    <motion.div
                      key={`${rec.title}-${i}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.04 }}
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-mono text-xs font-semibold text-emerald-100">
                          {rec.title}
                        </div>
                        <Badge className="shrink-0 border-emerald-500/40 bg-emerald-500/15 text-emerald-200">
                          -{rec.savingsPct}%
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-100/70">
                        {rec.detail}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Panel>
      ) : null}

      {/* ── 4. Spend Log ──────────────────────────────────────────────── */}
      <Panel
        title="Spend Log · last 50 events"
        icon={<Activity className="h-3.5 w-3.5 text-primary" />}
        action={
          <span className="font-mono text-[10px] text-muted-foreground">
            {data?.spendRecords.length ?? 0} records
          </span>
        }
      >
        <div className="max-h-96 overflow-y-auto nexus-scroll rounded-lg border border-border/40">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="pl-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Timestamp
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  GPU
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Kind
                </TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                  Duration
                </TableHead>
                <TableHead className="pr-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                  Cost
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data && data.spendRecords.length === 0 ? (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                    <Info className="mx-auto mb-1.5 h-4 w-4 opacity-60" />
                    No spend recorded yet — run a generation to start tracking.
                  </TableCell>
                </TableRow>
              ) : (
                data?.spendRecords
                  .slice()
                  .reverse()
                  .map((r, i) => {
                    const m = KIND_META[r.kind];
                    const KindIcon = m.icon;
                    return (
                      <TableRow key={`${r.timestamp}-${i}`} className="border-border/30">
                        <TableCell className="pl-3 font-mono text-[10px] text-muted-foreground">
                          {fmtTime(r.timestamp)}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-[11px] text-foreground/80">{r.gpu}</span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
                              m.tone
                            )}
                          >
                            <KindIcon className="h-2.5 w-2.5" />
                            {m.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-[11px] text-foreground/80">
                          {r.durationSec.toFixed(1)}s
                        </TableCell>
                        <TableCell className="pr-3 text-right font-mono text-[11px] font-semibold text-foreground">
                          {fmtUsd(r.costUsd, 4)}
                        </TableCell>
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      {/* ── 5. GPU Pricing Comparison ─────────────────────────────────── */}
      <Panel
        title="GPU Pricing Comparison"
        icon={<Cpu className="h-3.5 w-3.5 text-primary" />}
        action={
          <span className="font-mono text-[10px] text-muted-foreground">
            cheapest → most expensive
          </span>
        }
      >
        <div className="overflow-x-auto nexus-scroll">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="pl-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                  GPU
                </TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                  VRAM
                </TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                  $/sec
                </TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                  $/hr
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="hidden pr-3 text-[10px] uppercase tracking-wider text-muted-foreground lg:table-cell">
                  Notes
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {GPU_PRICING.slice()
                .sort((a, b) => a.costPerHour - b.costPerHour)
                .map((g) => {
                  const tone = gpuTone(g.id);
                  const isH100 = g.id === "H100";
                  const isRecommendedCheaper =
                    g.recommended && (g.id === "L4" || g.id === "A10" || g.id === "L40S");
                  return (
                    <TableRow
                      key={g.id}
                      className={cn("border-border/30", tone.row)}
                    >
                      <TableCell className="pl-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-foreground">
                            {g.name}
                          </span>
                          {isH100 ? (
                            <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-200">
                              Current
                            </Badge>
                          ) : null}
                          {isRecommendedCheaper ? (
                            <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-200">
                              ★ Cheaper alt
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-foreground/80">
                        {g.vramGb}GB
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-foreground/80">
                        ${g.costPerSec.toFixed(6)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] font-semibold text-foreground">
                        ${g.costPerHour.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {g.recommended ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Recommended
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-card/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                            <XCircle className="h-2.5 w-2.5" />
                            Avoid
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden pr-3 text-[11px] text-muted-foreground lg:table-cell">
                        {g.notes}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </Panel>

      {/* ── 6. Engine → GPU Strategy ──────────────────────────────────── */}
      <Panel
        title="Engine → GPU Strategy"
        icon={<Server className="h-3.5 w-3.5 text-primary" />}
        action={
          <span className="font-mono text-[10px] text-muted-foreground">
            {ENGINE_GPU_STRATEGY.length} engines mapped
          </span>
        }
      >
        <div className="space-y-4">
          {(["image", "edit", "video"] as const).map((type) => {
            const engines = ENGINE_GPU_STRATEGY.filter(
              (s) => ENGINE_TYPE_BY_ID[s.engineId] === type
            );
            if (engines.length === 0) return null;
            const meta = ENGINE_TYPE_META[type];
            return (
              <div key={type}>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider",
                      meta.tone
                    )}
                  >
                    {meta.label}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {engines.length} engine{engines.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="overflow-x-auto nexus-scroll rounded-lg border border-border/40">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/40 hover:bg-transparent">
                        <TableHead className="pl-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                          Engine
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Recommended GPU
                        </TableHead>
                        <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                          Cost / Run
                        </TableHead>
                        <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                          vs H100
                        </TableHead>
                        <TableHead className="hidden pr-3 text-[10px] uppercase tracking-wider text-muted-foreground lg:table-cell">
                          Rationale
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {engines.map((s) => {
                        const tone = gpuTone(s.recommendedGpu);
                        const cheaper = s.vsCurrentH100Pct < 0;
                        const same = s.vsCurrentH100Pct === 0;
                        return (
                          <TableRow key={s.engineId} className="border-border/30">
                            <TableCell className="pl-3">
                              <div className="font-mono text-xs font-semibold text-foreground">
                                {s.engineName}
                              </div>
                              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                                {s.quantization} · {s.vramRequiredGb}GB
                              </div>
                            </TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px]",
                                  tone.badge
                                )}
                              >
                                {s.recommendedGpu}
                              </span>
                              <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                                → {s.fallbackGpu}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-[11px] font-semibold text-foreground">
                              {fmtUsd(s.costPerRunUsd, 4)}
                            </TableCell>
                            <TableCell className="text-right">
                              {cheaper ? (
                                <span className="inline-flex items-center gap-0.5 font-mono text-[11px] font-semibold text-emerald-300">
                                  <TrendingDown className="h-3 w-3" />
                                  {s.vsCurrentH100Pct}%
                                </span>
                              ) : same ? (
                                <span className="font-mono text-[11px] text-amber-300">0%</span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 font-mono text-[11px] font-semibold text-rose-300">
                                  <TrendingUp className="h-3 w-3" />
                                  +{s.vsCurrentH100Pct}%
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="hidden pr-3 text-[11px] text-muted-foreground lg:table-cell">
                              {s.rationale}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ── 7. Cold-Start Strategies ──────────────────────────────────── */}
      <Panel
        title="Cold-Start Strategies"
        icon={<Snowflake className="h-3.5 w-3.5 text-cyan-300" />}
        action={
          <span className="font-mono text-[10px] text-muted-foreground">
            {COLD_START_STRATEGIES.length} actionable fixes
          </span>
        }
      >
        <div className="grid gap-2 md:grid-cols-2">
          {COLD_START_STRATEGIES.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.04 }}
              className="nexus-card-hover rounded-lg border border-border/50 bg-card/40 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-cyan-500/10 text-cyan-300">
                    <Snowflake className="h-3 w-3" />
                  </span>
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {s.title}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{s.detail}</p>
              <div className="mt-2 flex items-start gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] px-2 py-1.5 text-[11px] text-emerald-200">
                <Zap className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{s.impact}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </Panel>

      {/* ── 8. Optimized Modal App ────────────────────────────────────── */}
      <OptimizedAppCard />

      {/* ── 9. ModalRunContract ───────────────────────────────────────── */}
      {data ? (
        <ContractCard
          contract={data.contract}
          validation={data.contractValidation}
        />
      ) : null}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SpendStatCard({
  icon,
  label,
  value,
  sub,
  tone,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "ok" | "warn" | "bad";
  trend: "up" | "down" | "flat";
}) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/[0.04]"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/[0.04]"
        : "border-rose-500/30 bg-rose-500/[0.05]";
  const iconCls =
    tone === "ok"
      ? "bg-emerald-500/15 text-emerald-300"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-300"
        : "bg-rose-500/15 text-rose-300";
  return (
    <Card className={cn("nexus-card nexus-card-hover", toneCls)}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={cn("grid h-7 w-7 place-items-center rounded-md", iconCls)}>
              {icon}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
          </div>
          {trend === "up" ? (
            <TrendingUp className="h-3.5 w-3.5 text-amber-300" />
          ) : trend === "down" ? (
            <TrendingDown className="h-3.5 w-3.5 text-emerald-300" />
          ) : null}
        </div>
        <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-foreground">
          {value}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function CountChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "ok" | "warn" | "bad" | "neutral";
}) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-200"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/[0.05] text-amber-200"
        : tone === "bad"
          ? "border-rose-500/30 bg-rose-500/[0.06] text-rose-200"
          : "border-border/50 bg-card/40 text-muted-foreground";
  return (
    <div className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2", toneCls)}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-background/40">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="font-mono text-lg font-bold leading-none">{value}</div>
        <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider opacity-70">
          {label}
        </div>
      </div>
    </div>
  );
}

function SetSpendDialog({
  current,
  onSaved,
}: {
  current: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(current.toFixed(2));
  const [saving, setSaving] = useState(false);

  // Keep the input synced with the latest current value when reopened.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setValue(current.toFixed(2));
    }
    setOpen(next);
  };

  const onSave = async () => {
    const n = parseFloat(value);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Invalid amount", {
        description: "Enter a non-negative dollar amount (e.g. 87.08).",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/modal/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spentThisCycleUsd: n }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      toast.success("Cycle spend updated", {
        description: `Set to ${fmtUsd(n)}. Budget tracker resynced to your Modal dashboard.`,
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error("Failed to set spend", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <DollarSign className="h-3.5 w-3.5" />
          Set current spend
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono">
            <DollarSign className="h-4 w-4 text-primary" />
            Sync Modal dashboard spend
          </DialogTitle>
          <DialogDescription>
            Enter the actual spent amount from your Modal workspace dashboard
            (modal.com → Settings → Usage). This resets the cycle baseline used
            by the in-memory tracker.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="spent-input" className="font-mono text-[11px] uppercase tracking-wider">
            Spent this cycle (USD)
          </Label>
          <Input
            id="spent-input"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={saving}
            className="font-mono"
            placeholder="87.08"
          />
          <p className="text-[10px] text-muted-foreground">
            Current tracker value: <span className="font-mono">{fmtUsd(current)}</span>
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={saving}
            className="gap-1.5"
          >
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Save spend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OptimizedAppCard() {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => OPTIMIZED_MODAL_APP_CODE.split("\n"), []);
  const previewLines = lines.slice(0, 40);
  const shownLines = expanded ? lines : previewLines;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(OPTIMIZED_MODAL_APP_CODE);
      setCopied(true);
      toast.success("Modal app code copied", {
        description: `${lines.length} lines · ready to paste into nexus_model_optimized.py`,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Clipboard unavailable", {
        description: "Use the Download button instead.",
      });
    }
  };

  const onDownload = () => {
    try {
      const blob = new Blob([OPTIMIZED_MODAL_APP_CODE], { type: "text/x-python" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nexus_model_optimized.py";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Download started", {
        description: "nexus_model_optimized.py · deploy with `uvx modal deploy`",
      });
    } catch {
      toast.error("Download failed", {
        description: "Your browser blocked the blob download.",
      });
    }
  };

  return (
    <Panel
      title="Optimized Modal App · ready to deploy"
      icon={<FileCode2 className="h-3.5 w-3.5 text-emerald-300" />}
      action={
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={onCopy}
            className="gap-1.5"
          >
            {copied ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            Copy code
          </Button>
          <Button
            size="sm"
            onClick={onDownload}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Download .py
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/[0.05] px-3 py-2 text-[11px] text-emerald-200">
          <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-mono font-semibold">
              Deploy with: <code className="text-emerald-100">uvx modal deploy nexus_model_optimized.py</code>
            </div>
            <div className="mt-0.5 text-emerald-200/80">
              Requires <code className="font-mono">MODAL_TOKEN_ID</code> +{" "}
              <code className="font-mono">MODAL_TOKEN_SECRET</code> env vars + a{" "}
              <code className="font-mono">huggingface-secret</code> Modal secret.
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-lg border border-border/50 bg-black/40">
          <div className="flex items-center justify-between border-b border-border/40 bg-card/40 px-3 py-1.5">
            <div className="flex items-center gap-2">
              <CircleDot className="h-3 w-3 text-primary" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                nexus_model_optimized.py
              </span>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">
              {shownLines.length} / {lines.length} lines
            </span>
          </div>
          <div className="max-h-[420px] overflow-auto nexus-scroll">
            <pre className="px-3 py-2 font-mono text-[10.5px] leading-relaxed text-emerald-100/90">
              {shownLines.map((line, i) => (
                <div key={i} className="flex">
                  <span className="mr-3 inline-block w-8 select-none text-right text-emerald-300/30">
                    {i + 1}
                  </span>
                  <span className="whitespace-pre-wrap break-all">{line || " "}</span>
                </div>
              ))}
            </pre>
          </div>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border/50 bg-card/40 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> Show all {lines.length} lines
            </>
          )}
        </button>
      </div>
    </Panel>
  );
}

function ContractCard({
  contract,
  validation,
}: {
  contract: ModalRunContract;
  validation: ContractValidation;
}) {
  const rows: { label: string; value: string | boolean; hint?: string }[] = [
    { label: "maxSpendUsd", value: `$${contract.maxSpendUsd.toFixed(2)}`, hint: "Per-cycle spend cap" },
    { label: "minContainers", value: contract.minContainers === 0, hint: "Must be 0 — no always-on cost" },
    { label: "backgroundPolling", value: contract.backgroundPolling, hint: "Must be false — was #1 budget bleeder" },
    { label: "broadModelHealthChecks", value: contract.broadModelHealthChecks, hint: "Must be false" },
    { label: "volumeCleanupRequired", value: contract.volumeCleanupRequired, hint: "Must be true" },
    { label: "perRunCostSummaryRequired", value: contract.perRunCostSummaryRequired, hint: "Must be true" },
    { label: "artifactManifestRequired", value: contract.artifactManifestRequired, hint: "Must be true" },
  ];

  return (
    <Panel
      title="ModalRunContract"
      icon={<ShieldCheck className="h-3.5 w-3.5 text-primary" />}
      action={
        validation.passed ? (
          <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-200">
            <CheckCircle2 className="h-3 w-3" />
            Validation passed
          </Badge>
        ) : (
          <Badge className="border-rose-500/40 bg-rose-500/15 text-rose-200">
            <AlertTriangle className="h-3 w-3" />
            {validation.errors.length} violation{validation.errors.length > 1 ? "s" : ""}
          </Badge>
        )
      }
    >
      <div className="space-y-3">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {rows.map((row) => {
            const isBool = typeof row.value === "boolean";
            // For booleans, "good" means: required-true fields are true, required-false fields are false.
            const isGoodBool = isBool
              ? (row.label === "minContainers" || row.label === "backgroundPolling" || row.label === "broadModelHealthChecks")
                ? row.value === false
                : row.value === true
              : true;
            return (
              <div
                key={row.label}
                className={cn(
                  "flex items-start justify-between gap-2 rounded-md border px-2.5 py-1.5",
                  isBool
                    ? isGoodBool
                      ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                      : "border-rose-500/30 bg-rose-500/[0.05]"
                    : "border-border/50 bg-card/40"
                )}
              >
                <div className="flex items-start gap-2">
                  {isBool ? (
                    isGoodBool ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                    ) : (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
                    )
                  ) : (
                    <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                  <div>
                    <div className="font-mono text-[11px] font-semibold text-foreground">
                      {row.label}
                    </div>
                    {row.hint ? (
                      <div className="text-[10px] text-muted-foreground">{row.hint}</div>
                    ) : null}
                  </div>
                </div>
                <div className="font-mono text-[11px] font-semibold text-foreground/80">
                  {isBool ? (row.value ? "true" : "false") : String(row.value)}
                </div>
              </div>
            );
          })}
        </div>

        {/* allowedOperations */}
        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Allowed operations
          </div>
          <div className="flex flex-wrap gap-1.5">
            {contract.allowedOperations.map((op) => (
              <span
                key={op}
                className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-primary"
              >
                <CheckCircle2 className="h-2.5 w-2.5" />
                {op}
              </span>
            ))}
          </div>
        </div>

        {/* Validation errors */}
        {!validation.passed ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.05] p-3">
            <div className="mb-1.5 flex items-center gap-2 font-mono text-[11px] font-semibold text-rose-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              Contract violations
            </div>
            <ul className="space-y-1">
              {validation.errors.map((err, i) => (
                <li key={i} className="flex items-start gap-2 font-mono text-[11px] text-rose-100/80">
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-300" />
                  {err}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Notes */}
        {contract.notes.length > 0 ? (
          <div className="rounded-lg border border-border/50 bg-card/40 p-3">
            <div className="mb-1.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              Notes
            </div>
            <ul className="space-y-1">
              {contract.notes.map((n, i) => (
                <li key={i} className="text-[11px] text-muted-foreground">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
