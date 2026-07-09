"use client";

import { useQuery } from "@tanstack/react-query";
import { useNexus } from "./store";
import { ScoreRing } from "./score-ring";
import { VerdictBadge, StatusDot } from "./verdict-badge";
import { LineChart, DonutChart, BarChart } from "./charts";
import { PIPELINE_STAGES } from "@/lib/nexus-types";
import type { MetricsResponse } from "@/lib/nexus-types";
import { cn } from "@/lib/utils";
import {
  Activity,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Clock,
  Cpu,
  Layers,
  AlertTriangle,
  Server,
  Boxes,
  GitBranch,
  Gauge,
  ArrowRight,
  CircleDot,
  Cloud,
} from "lucide-react";
import { motion } from "framer-motion";

function useMetrics() {
  return useQuery<MetricsResponse>({
    queryKey: ["nexus-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/metrics", { cache: "no-store" });
      if (!res.ok) throw new Error("metrics");
      return res.json();
    },
    refetchInterval: 12000,
  });
}

export function CommandView() {
  const { data, isLoading } = useMetrics();
  const setView = useNexus((s) => s.setView);

  const m = data;
  const kpis = [
    {
      label: "Total Generations",
      value: m?.total ?? 0,
      icon: Boxes,
      tone: "neutral" as const,
      sub: `${m?.completed ?? 0} completed · ${m?.failed ?? 0} failed`,
    },
    {
      label: "Approval Rate",
      value: m && m.total > 0 ? `${Math.round(((m.approved ?? 0) / m.total) * 100)}%` : "—",
      icon: CheckCircle2,
      tone: "ok" as const,
      sub: `${m?.approved ?? 0} approved`,
    },
    {
      label: "Rejections",
      value: m?.rejected ?? 0,
      icon: XCircle,
      tone: "bad" as const,
      sub: `${m?.needsReview ?? 0} need review`,
    },
    {
      label: "Avg Overall Score",
      value: m?.avgScore != null ? m.avgScore.toFixed(1) : "—",
      icon: Gauge,
      tone: "ok" as const,
      sub: "across judged runs",
    },
    {
      label: "Avg End-to-End",
      value: m?.avgTotalMs != null ? `${(m.avgTotalMs / 1000).toFixed(1)}s` : "—",
      icon: Clock,
      tone: "neutral" as const,
      sub: "wall clock",
    },
    {
      label: "Success Rate",
      value: `${m?.successRate ?? 0}%`,
      icon: Activity,
      tone: (m?.successRate ?? 0) >= 80 ? "ok" : (m?.successRate ?? 0) >= 50 ? "warn" : "bad",
      sub: "completed / total",
    },
  ];

  return (
    <div className="space-y-5 nexus-rise">
      <SectionHeader
        eyebrow="Command Center"
        title="Mission Overview"
        desc="Real-time governance view across the NEXUS multi-agent pipeline. Metrics refresh every 12s."
        right={
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 font-mono text-[10px] text-emerald-300">
            <CircleDot className="h-3 w-3 nexus-pulse" /> A2A Coordination Running
          </span>
        }
      />

      {/* KPI grid */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k, idx) => {
          const Icon = k.icon;
          const toneCls =
            k.tone === "ok"
              ? "text-emerald-300 border-emerald-500/20"
              : k.tone === "warn"
                ? "text-amber-300 border-amber-500/20"
                : k.tone === "bad"
                  ? "text-rose-300 border-rose-500/20"
                  : "text-foreground border-border/60";
          return (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              className={cn("nexus-card nexus-card-hover rounded-xl p-3.5", toneCls)}
            >
              <div className="mb-2 flex items-center justify-between">
                <Icon className="h-4 w-4 opacity-80" />
                <span className="text-[9px] uppercase tracking-wider opacity-60">{k.label}</span>
              </div>
              <div className="font-mono text-2xl font-bold leading-none">
                {isLoading ? <span className="opacity-30">··</span> : k.value}
              </div>
              <div className="mt-1.5 text-[10px] text-muted-foreground">{k.sub}</div>
            </motion.div>
          );
        })}
      </section>

      {/* Analytics row: verdict donut + stage timings bar + score trend */}
      <AnalyticsRow metrics={m} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        {/* Left: pipeline flow + per-stage */}
        <div className="space-y-5">
          <Panel title="Pipeline Flow" icon={<GitBranch className="h-4 w-4" />}>
            <div className="flex items-stretch gap-1 overflow-x-auto nexus-scroll pb-1">
              {PIPELINE_STAGES.map((s, i) => {
                const avg = m?.byStage?.[s.id]?.avgMs ?? 0;
                const count = m?.byStage?.[s.id]?.count ?? 0;
                return (
                  <div key={s.id} className="flex items-stretch">
                    <div className="flex min-w-[140px] flex-col gap-1 rounded-lg border border-border/50 bg-background/40 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <StatusDot status="done" className="opacity-60" />
                      </div>
                      <div className="text-xs font-medium leading-tight">{s.label}</div>
                      <div className="font-mono text-[9px] text-primary">{s.model}</div>
                      <div className="mt-1 flex items-center justify-between text-[9px] text-muted-foreground">
                        <span>{count} runs</span>
                        <span className="font-mono">
                          {avg > 0 ? (avg < 1000 ? `${avg}ms` : `${(avg / 1000).toFixed(1)}s`) : "—"}
                        </span>
                      </div>
                    </div>
                    {i < PIPELINE_STAGES.length - 1 ? (
                      <div className="flex items-center px-0.5">
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Architecture Layers" icon={<Layers className="h-4 w-4" />}>
            <div className="space-y-2">
              {ARCH_LAYERS.map((layer) => (
                <div
                  key={layer.name}
                  className="flex items-start gap-3 rounded-lg border border-border/40 bg-background/30 p-3"
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
                      layer.status === "production"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : layer.status === "beta"
                          ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                          : layer.status === "planned"
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                            : "border-zinc-500/30 bg-zinc-500/10 text-zinc-300"
                    )}
                  >
                    {layer.status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold">{layer.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {layer.stack}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{layer.desc}</p>
                    {layer.note ? (
                      <p className="mt-1 flex items-start gap-1 text-[10px] text-amber-300/80">
                        <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                        {layer.note}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Right: recent activity + issues */}
        <div className="space-y-5">
          <Panel title="Recent Activity" icon={<Activity className="h-4 w-4" />}>
            <div className="max-h-80 space-y-1 overflow-y-auto nexus-scroll">
              {m?.recent && m.recent.length > 0 ? (
                m.recent.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-foreground/5"
                  >
                    <span
                      className={cn(
                        "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                        e.severity === "success"
                          ? "bg-emerald-400"
                          : e.severity === "warn"
                            ? "bg-amber-400"
                            : e.severity === "error"
                              ? "bg-rose-400"
                              : "bg-cyan-400"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] text-foreground">{e.message}</div>
                      <div className="font-mono text-[9px] text-muted-foreground">
                        {timeAgo(e.createdAt)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  Pipeline initialized — awaiting first job
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Issues" icon={<AlertTriangle className="h-4 w-4" />}>
            <div className="space-y-1.5">
              {ISSUES.map((iss) => (
                <div
                  key={iss.id}
                  className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-background/30 p-2.5"
                >
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase",
                      iss.sev === "high"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        : "border-zinc-500/40 bg-zinc-500/10 text-zinc-300"
                    )}
                  >
                    {iss.sev}
                  </span>
                  <span className="flex-1 text-[11px] text-muted-foreground">{iss.title}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="GPU Runtime" icon={<ShieldCheck className="h-4 w-4" />}>
            <ModalRuntimePanel />
            <button
              onClick={() => setView("studio")}
              className="mt-3 w-full rounded-lg bg-primary/15 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-primary transition hover:bg-primary/25"
            >
              Launch Studio →
            </button>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/**
 * AnalyticsRow — three chart panels shown between the KPI grid and the
 * main two-column area:
 *   1. Verdict Donut (approved / rejected / needs_review)
 *   2. Stage Timings Bar (avg ms per stage)
 *   3. Score Trend Line (overall scores of recent generations, expanded to 50)
 */
function AnalyticsRow({ metrics }: { metrics?: MetricsResponse }) {
  // Fetch recent generations for the score trend — bumped to 50 for deeper history
  const trend = useQuery({
    queryKey: ["nexus-score-trend"],
    queryFn: async () => {
      const res = await fetch("/api/gallery?limit=50", { cache: "no-store" });
      if (!res.ok) throw new Error("gallery");
      const data = (await res.json()) as { items: { overallScore: number | null; verdict: string | null }[] };
      // reverse to chronological order (oldest → newest)
      const items = [...data.items].reverse();
      const scores = items
        .map((g) => g.overallScore)
        .filter((s): s is number => typeof s === "number");
      return { scores, items };
    },
    refetchInterval: 30000,
  });

  const verdictData = [
    { label: "Approved", value: metrics?.approved ?? 0, color: "oklch(0.78 0.16 165)" },
    { label: "Needs review", value: metrics?.needsReview ?? 0, color: "oklch(0.78 0.14 80)" },
    { label: "Rejected", value: metrics?.rejected ?? 0, color: "oklch(0.68 0.2 25)" },
  ];

  const stageData = (metrics?.byStage
    ? Object.entries(metrics.byStage).filter(([k]) => k !== "prompt" && k !== "output")
    : []
  ).map(([k, v]) => ({
    label:
      k === "flux"
        ? "FLUX"
        : k === "st3gg"
          ? "ST3GG"
          : k === "judge"
            ? "CPM-V"
            : k === "evidence"
              ? "Evidence"
              : k,
    value: v.avgMs,
    color:
      k === "flux"
        ? "oklch(0.78 0.16 165)"
        : k === "st3gg"
          ? "oklch(0.72 0.15 200)"
          : k === "judge"
            ? "oklch(0.78 0.14 250)"
            : "oklch(0.78 0.14 80)",
  }));

  const trendScores = trend.data?.scores ?? [];
  const trendColor = "oklch(0.78 0.16 165)";

  // Compute trend stats
  const trendStats = trendScores.length > 0
    ? {
        avg: Math.round(trendScores.reduce((a, b) => a + b, 0) / trendScores.length),
        min: Math.round(Math.min(...trendScores)),
        max: Math.round(Math.max(...trendScores)),
        latest: Math.round(trendScores[trendScores.length - 1]),
      }
    : null;

  return (
    <section className="grid gap-3 lg:grid-cols-3">
      <Panel title="Verdict Distribution" icon={<CheckCircle2 className="h-4 w-4" />} className="nexus-card-hover">
        <div className="grid place-items-center py-2">
          <DonutChart
            data={verdictData}
            size={110}
            thickness={12}
            centerLabel={String(metrics?.total ?? 0)}
            centerSub="total"
          />
        </div>
      </Panel>

      <Panel title="Avg Stage Timings" icon={<Clock className="h-4 w-4" />} className="nexus-card-hover">
        {stageData.length > 0 ? (
          <BarChart
            data={stageData}
            height={110}
            valueFormatter={(v) => (v < 1000 ? `${v}ms` : `${(v / 1000).toFixed(1)}s`)}
          />
        ) : (
          <div className="grid h-[110px] place-items-center text-[10px] text-muted-foreground">
            no timing data
          </div>
        )}
      </Panel>

      <Panel title="Score Trend" icon={<Gauge className="h-4 w-4" />} className="nexus-card-hover">
        {trendScores.length > 1 ? (
          <div className="py-1">
            <LineChart data={trendScores} height={90} color={trendColor} fillOpacity={0.18} min={0} max={100} />
            <div className="mt-1.5 grid grid-cols-4 gap-1 text-[9px]">
              <div className="rounded border border-border/30 bg-background/30 px-1 py-0.5 text-center">
                <div className="text-muted-foreground">avg</div>
                <div className="font-mono text-primary">{trendStats?.avg ?? "—"}</div>
              </div>
              <div className="rounded border border-border/30 bg-background/30 px-1 py-0.5 text-center">
                <div className="text-muted-foreground">min</div>
                <div className="font-mono text-amber-300">{trendStats?.min ?? "—"}</div>
              </div>
              <div className="rounded border border-border/30 bg-background/30 px-1 py-0.5 text-center">
                <div className="text-muted-foreground">max</div>
                <div className="font-mono text-emerald-300">{trendStats?.max ?? "—"}</div>
              </div>
              <div className="rounded border border-border/30 bg-background/30 px-1 py-0.5 text-center">
                <div className="text-muted-foreground">now</div>
                <div className="font-mono text-foreground">{trendStats?.latest ?? "—"}</div>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between text-[9px] text-muted-foreground">
              <span>oldest · {trendScores.length} pts</span>
              <span>latest</span>
            </div>
          </div>
        ) : (
          <div className="grid h-[110px] place-items-center text-[10px] text-muted-foreground">
            need 2+ scored runs
          </div>
        )}
      </Panel>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  desc,
  right,
}: {
  eyebrow: string;
  title: string;
  desc?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
            {eyebrow}
          </span>
        </div>
        <h1 className="nexus-headline nexus-text-balance font-mono text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {desc ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-[15px]">{desc}</p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

export function Panel({
  title,
  icon,
  children,
  action,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "nexus-card rounded-2xl p-4",
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

interface ArchLayer {
  name: string;
  status: "production" | "beta" | "planned";
  stack: string;
  desc: string;
  note?: string;
}

const ARCH_LAYERS: ArchLayer[] = [
  {
    name: "Modal GPU Runtime",
    status: "production" as const,
    stack: "Modal · H100 80GB",
    desc: "Serverless FLUX.2 Klein 9B inference on NVIDIA L40S. Auto-scales from 0, scales down after 5 min idle. ~5-10s warm, cold start loads from cached volume.",
  },
  {
    name: "Next.js 16 Command Center",
    status: "production" as const,
    stack: "Next.js 16 · Zustand · TanStack Query",
    desc: "Web frontend with live status, command palette, and pipeline orchestration. This very interface.",
  },
  {
    name: "z-ai-web-dev-sdk Fallback",
    status: "production" as const,
    stack: "z-ai · SDK",
    desc: "Hosted inference for brain stages (ST3GG safety scan, visual judge, evidence parsing) when Modal brain is not deployed.",
  },
  {
    name: "Prisma + SQLite Persistence",
    status: "production" as const,
    stack: "Prisma 6 · SQLite",
    desc: "Generation, SafetyScan, JudgeReport, AuditEvent, MetricSample models. Append-only audit trail + runtime metric history.",
  },
  {
    name: "Uncensored Brain (Gemma 4 12B)",
    status: "production" as const,
    stack: "z-ai vision · ~8B params",
    desc: "Visual judge scores prompt adherence, visual quality, aesthetics, safety, wardrobe match. Returns structured JSON verdict.",
  },
  {
    name: "Evidence Aggregator",
    status: "production" as const,
    stack: "z-ai chat · ~8B params",
    desc: "Aggregates scan + judge outputs into a structured evidence object with confidence, risk profile, and recommendations.",
  },
];

const ISSUES = [
  { id: 1, sev: "high" as const, title: "Modal cold-start latency up to 7 min after idle scale-down" },
  { id: 2, sev: "high" as const, title: "GPU credit budget — monitor usage in Modal dashboard" },
  { id: 3, sev: "medium" as const, title: "VLM judge runs on z-ai, not yet on Modal GPU" },
  { id: 4, sev: "low" as const, title: "Metric history capped at 6 hours (720 samples)" },
];

/** Live Modal backend status panel — shown in Command Center's right column. */
function ModalRuntimePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["modal-status"],
    queryFn: async () => {
      const res = await fetch("/api/modal/status", { cache: "no-store" });
      if (!res.ok) throw new Error("modal-status");
      return res.json();
    },
    // No refetchInterval — on-demand only (cost optimization).
  });

  if (isLoading) {
    return <div className="py-2 text-[11px] text-muted-foreground">Loading Modal status…</div>;
  }

  if (!data?.enabled) {
    return (
      <div className="space-y-1.5 text-[11px] text-muted-foreground">
        <p>Modal routing is <span className="font-mono text-amber-300">disabled</span>.</p>
        <p className="text-[10px]">Using z-ai-web-dev-sdk for image generation.</p>
        <p className="text-[10px]">Enable in <code className="font-mono text-primary">.env</code>: <code className="font-mono">MODAL_USE=true</code></p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
          <Cloud className="h-3.5 w-3.5 text-primary" />
          {data.reachable ? "Connected" : "Unreachable"}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase",
            data.reachable
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-300"
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              data.reachable ? "bg-emerald-400" : "bg-amber-400 nexus-pulse"
            )}
          />
          {data.reachable ? "Warm" : "Cold"}
        </span>
      </div>
      {data.model ? (
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Model</span>
          <span className="font-mono text-primary">{data.model}</span>
        </div>
      ) : null}
      {data.gpu ? (
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">GPU</span>
          <span className="font-mono text-primary">{data.gpu}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">Latency</span>
        <span className="font-mono text-primary">
          {data.reachable ? `${data.latencyMs}ms` : "—"}
        </span>
      </div>
      {data.error ? (
        <p className="font-mono text-[9px] text-amber-300/80">{data.error.slice(0, 100)}</p>
      ) : null}
    </div>
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}
