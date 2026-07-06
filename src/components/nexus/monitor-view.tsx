"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef, useMemo } from "react";
import { Panel, SectionHeader } from "./command-view";
import { cn } from "@/lib/utils";
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Server,
  Zap,
  Gauge,
  RefreshCw,
  CircleDot,
  Boxes,
  Timer,
  Database,
  Image as ImageIcon,
  Microchip,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

interface HealthData {
  status: string;
  service: string;
  version: string;
  uptime: number;
  timestamp: string;
  db: { generations: number; auditEvents: number; sizeMB: number };
  storage: { galleryImages: number };
  process: {
    pid: number;
    cpuPercent: number;
    memory: {
      rssMB: number;
      heapUsedMB: number;
      heapTotalMB: number;
      externalMB: number;
    };
  };
  system: {
    platform: string;
    nodeVersion: string;
    cpuCores: number;
    cpuModel: string;
    loadAvg: { "1m": number; "5m": number; "15m": number };
    totalMemMB: number;
    freeMemMB: number;
  };
  models: Record<string, string>;
  paramBudget: { total: string; cap: string };
}

function useHealth() {
  return useQuery<HealthData>({
    queryKey: ["nexus-health"],
    queryFn: async () => {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) throw new Error("health");
      return res.json();
    },
    refetchInterval: 15000, // slowed from 3s → 15s (cost optimization)
  });
}

interface AuditResp {
  items: {
    id: string;
    kind: string;
    message: string;
    severity: string;
    generationId: string | null;
    createdAt: string;
  }[];
}

function useAudit() {
  return useQuery<AuditResp>({
    queryKey: ["nexus-audit-stream"],
    queryFn: async () => {
      const res = await fetch("/api/audit?limit=40", { cache: "no-store" });
      if (!res.ok) throw new Error("audit");
      return res.json();
    },
    refetchInterval: 15000, // slowed from 4s → 15s (cost optimization)
  });
}

interface MetricSample {
  cpuPercent: number;
  rssMB: number;
  heapUsedMB: number;
  heapTotalMB: number;
  load1m: number;
  dbSizeMB: number;
  galleryImgs: number;
  generations: number;
  auditEvents: number;
  uptimeSec: number;
  createdAt: string;
}

function useMetricsHistory(hours: number) {
  return useQuery<{ count: number; samples: MetricSample[]; note?: string }>({
    queryKey: ["nexus-metrics-history", hours],
    queryFn: async () => {
      const res = await fetch(`/api/metrics-history?hours=${hours}`, { cache: "no-store" });
      if (!res.ok) throw new Error("metrics-history");
      return res.json();
    },
    refetchInterval: 15000,
  });
}

type TimeRange = 1 | 6 | 24;

export function MonitorView() {
  const health = useHealth();
  const audit = useAudit();
  const [now, setNow] = useState(Date.now());
  // Real RSS memory history (MB) collected from health responses (live, in-memory)
  const [rssSeries, setRssSeries] = useState<number[]>([]);
  const [heapSeries, setHeapSeries] = useState<number[]>([]);
  const lastTimestamp = useRef<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>(6);
  const history = useMetricsHistory(timeRange);

  // Append real RSS to the sparkline whenever health data updates
  useEffect(() => {
    if (!health.data) return;
    // avoid duplicate points from refetches returning same timestamp
    if (lastTimestamp.current === health.data.timestamp) return;
    lastTimestamp.current = health.data.timestamp;
    setRssSeries((prev) => {
      const next = [...prev, health.data!.process.memory.rssMB];
      return next.slice(-48); // keep last 48 samples (~2.4 min at 3s interval)
    });
    setHeapSeries((prev) => {
      const next = [...prev, health.data!.process.memory.heapUsedMB];
      return next.slice(-48);
    });
  }, [health.data]);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const uptime = health.data?.uptime ?? 0;
  const uptimeStr = formatUptime(uptime);

  const mem = health.data?.process.memory;
  const sys = health.data?.system;
  const rss = mem?.rssMB ?? 0;
  const heapUsed = mem?.heapUsedMB ?? 0;
  const heapTotal = mem?.heapTotalMB ?? 1;
  const heapPct = Math.round((heapUsed / heapTotal) * 100);
  const totalMem = sys?.totalMemMB ?? 1;
  const freeMem = sys?.freeMemMB ?? 0;
  const usedMemPct = Math.round(((totalMem - freeMem) / totalMem) * 100);

  // Compute historical stats from persisted samples
  const histStats = useMemo(() => {
    const samples = history.data?.samples ?? [];
    if (samples.length < 2) {
      return { rssMin: 0, rssMax: 0, rssAvg: 0, heapMin: 0, heapMax: 0, heapAvg: 0, count: samples.length };
    }
    const rssVals = samples.map((s) => s.rssMB);
    const heapVals = samples.map((s) => s.heapUsedMB);
    return {
      rssMin: Math.min(...rssVals),
      rssMax: Math.max(...rssVals),
      rssAvg: rssVals.reduce((a, b) => a + b, 0) / rssVals.length,
      heapMin: Math.min(...heapVals),
      heapMax: Math.max(...heapVals),
      heapAvg: heapVals.reduce((a, b) => a + b, 0) / heapVals.length,
      count: samples.length,
    };
  }, [history.data]);

  // Persisted series for the historical chart
  const persistedRss = useMemo(
    () => (history.data?.samples ?? []).map((s) => s.rssMB),
    [history.data]
  );
  const persistedHeap = useMemo(
    () => (history.data?.samples ?? []).map((s) => s.heapUsedMB),
    [history.data]
  );
  // Persisted generations count delta (for sparkline of new generations over time)
  const persistedGens = useMemo(
    () => (history.data?.samples ?? []).map((s) => s.generations),
    [history.data]
  );

  return (
    <div className="space-y-5 nexus-rise">
      <SectionHeader
        eyebrow="Monitor"
        title="System & Runtime Telemetry"
        desc="Live process metrics from the Node.js runtime, Modal GPU posture, model lanes and the audit stream — with persisted history."
        right={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 nexus-pulse" />
              live · 3s
            </span>
            <button
              onClick={() => {
                health.refetch();
                audit.refetch();
                history.refetch();
              }}
              className="nexus-press inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>
        }
      />

      {/* Top health strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={CircleDot}
          label="Service Status"
          value={(health.data?.status ?? "loading").toUpperCase()}
          tone={health.data?.status === "ok" ? "ok" : "warn"}
        />
        <StatTile icon={Timer} label="Uptime" value={uptimeStr} tone="neutral" />
        <StatTile
          icon={Boxes}
          label="Generations"
          value={String(health.data?.db?.generations ?? 0)}
          tone="neutral"
        />
        <StatTile
          icon={Activity}
          label="Audit Events"
          value={String(health.data?.db?.auditEvents ?? 0)}
          tone="neutral"
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        {/* Left: runtime + memory chart */}
        <div className="space-y-5">
          <Panel title="Process Health" icon={<Server className="h-4 w-4" />}>
            <div className="grid gap-2 sm:grid-cols-2">
              <Metric
                icon={Cpu}
                label="Process CPU"
                value={`${(health.data?.process.cpuPercent ?? 0).toFixed(1)}%`}
                sub={`pid ${health.data?.process.pid ?? "—"}`}
              />
              <Metric
                icon={MemoryStick}
                label="RSS Memory"
                value={`${rss.toFixed(0)} MB`}
                sub={`heap ${heapUsed.toFixed(0)}/${heapTotal.toFixed(0)} MB`}
              />
              <Metric
                icon={Database}
                label="DB Size"
                value={`${(health.data?.db?.sizeMB ?? 0).toFixed(2)} MB`}
                sub={`${health.data?.db?.generations ?? 0} gens`}
              />
              <Metric
                icon={HardDrive}
                label="Gallery Images"
                value={String(health.data?.storage?.galleryImages ?? 0)}
                sub="PNG files"
              />
              <Metric
                icon={Microchip}
                label="CPU Cores"
                value={String(sys?.cpuCores ?? "—")}
                sub={sys?.cpuModel?.slice(0, 24) ?? ""}
              />
              <Metric
                icon={Gauge}
                label="Load (1m)"
                value={(sys?.loadAvg["1m"] ?? 0).toFixed(2)}
                sub={`5m ${(sys?.loadAvg["5m"] ?? 0).toFixed(2)} · 15m ${(sys?.loadAvg["15m"] ?? 0).toFixed(2)}`}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/40 pt-3 text-[10px]">
              <div className="flex items-center justify-between rounded-md border border-border/30 bg-background/30 px-2 py-1">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono text-foreground">{health.data?.version ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border/30 bg-background/30 px-2 py-1">
                <span className="text-muted-foreground">Node</span>
                <span className="font-mono text-foreground">{sys?.nodeVersion ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border/30 bg-background/30 px-2 py-1">
                <span className="text-muted-foreground">Platform</span>
                <span className="font-mono text-foreground">{sys?.platform ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border/30 bg-background/30 px-2 py-1">
                <span className="text-muted-foreground">Budget</span>
                <span className="font-mono text-primary">
                  {health.data?.paramBudget?.total ?? "—"} / {health.data?.paramBudget?.cap ?? "—"}
                </span>
              </div>
            </div>
          </Panel>

          {/* Live memory chart (in-memory samples) */}
          <Panel title="Memory Pressure (live RSS)" icon={<MemoryStick className="h-4 w-4" />}>
            <div className="mb-2 flex items-center justify-between text-[10px]">
              <span className="font-mono text-muted-foreground">
                RSS: <span className="text-primary">{rss.toFixed(0)} MB</span>
              </span>
              <span className="font-mono text-muted-foreground">
                Heap: {heapPct}% used
              </span>
              <span className="font-mono text-muted-foreground">
                System: {usedMemPct}% used
              </span>
            </div>
            <div className="relative h-32 w-full overflow-hidden rounded-lg border border-border/40 bg-background/40">
              <Sparkline data={rssSeries} color="oklch(0.78 0.16 165)" />
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
              <span>samples: {rssSeries.length}/48</span>
              <span>peak: {rssSeries.length > 0 ? `${Math.max(...rssSeries).toFixed(0)} MB` : "—"}</span>
              <span>{new Date(now).toLocaleTimeString()}</span>
            </div>
          </Panel>

          {/* Persisted history chart with time range selector */}
          <Panel
            title="Persisted Memory History"
            icon={<TrendingUp className="h-4 w-4" />}
            action={
              <div className="flex items-center gap-1 rounded-md border border-border/40 bg-background/40 p-0.5">
                {([1, 6, 24] as TimeRange[]).map((h) => (
                  <button
                    key={h}
                    onClick={() => setTimeRange(h)}
                    className={cn(
                      "nexus-press rounded px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition",
                      timeRange === h
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            }
          >
            <div className="mb-2 flex items-center justify-between text-[10px]">
              <span className="font-mono text-muted-foreground">
                <span className="text-emerald-300">●</span> RSS ·{" "}
                <span className="text-amber-300">●</span> Heap
              </span>
              <span className="font-mono text-muted-foreground">
                {histStats.count} samples · {timeRange}h window
              </span>
            </div>
            <div className="relative h-36 w-full overflow-hidden rounded-lg border border-border/40 bg-background/40">
              {histStats.count < 2 ? (
                <div className="grid h-full w-full place-items-center text-[10px] text-muted-foreground/60">
                  {history.isLoading ? "Loading history…" : "Collecting persisted samples…"}
                </div>
              ) : (
                <DualSparkline
                  primary={persistedRss}
                  secondary={persistedHeap}
                  primaryColor="oklch(0.78 0.16 165)"
                  secondaryColor="oklch(0.82 0.15 80)"
                />
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
              <HistStat
                icon={TrendingDown}
                label="RSS min"
                value={histStats.count > 0 ? `${histStats.rssMin.toFixed(0)} MB` : "—"}
                tone="down"
              />
              <HistStat
                icon={Minus}
                label="RSS avg"
                value={histStats.count > 0 ? `${histStats.rssAvg.toFixed(0)} MB` : "—"}
                tone="neutral"
              />
              <HistStat
                icon={TrendingUp}
                label="RSS max"
                value={histStats.count > 0 ? `${histStats.rssMax.toFixed(0)} MB` : "—"}
                tone="up"
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
              <HistStat
                icon={TrendingDown}
                label="Heap min"
                value={histStats.count > 0 ? `${histStats.heapMin.toFixed(0)} MB` : "—"}
                tone="down"
              />
              <HistStat
                icon={Minus}
                label="Heap avg"
                value={histStats.count > 0 ? `${histStats.heapAvg.toFixed(0)} MB` : "—"}
                tone="neutral"
              />
              <HistStat
                icon={TrendingUp}
                label="Heap max"
                value={histStats.count > 0 ? `${histStats.heapMax.toFixed(0)} MB` : "—"}
                tone="up"
              />
            </div>
          </Panel>

          {/* Heap usage bar */}
          <Panel title="Heap & System Memory" icon={<Gauge className="h-4 w-4" />}>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Node Heap</span>
                  <span className="font-mono text-foreground">
                    {heapUsed.toFixed(0)} / {heapTotal.toFixed(0)} MB ({heapPct}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500 nexus-progress-fill",
                      heapPct > 80 ? "bg-rose-400" : heapPct > 60 ? "bg-amber-400" : "bg-emerald-400"
                    )}
                    style={{ width: `${Math.min(100, heapPct)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">System Memory</span>
                  <span className="font-mono text-foreground">
                    {(totalMem - freeMem).toFixed(0)} / {totalMem.toFixed(0)} MB ({usedMemPct}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500 nexus-progress-fill",
                      usedMemPct > 85 ? "bg-rose-400" : usedMemPct > 70 ? "bg-amber-400" : "bg-cyan-400"
                    )}
                    style={{ width: `${Math.min(100, usedMemPct)}%` }}
                  />
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Model Lanes" icon={<Cpu className="h-4 w-4" />}>
            <div className="space-y-2">
              {Object.entries(health.data?.models ?? {}).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/30 p-2.5"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    <Cpu className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {k}
                    </div>
                    <div className="truncate text-xs text-foreground">{v}</div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 nexus-pulse" />
                    active
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Right: GPU runtime + cost + audit stream */}
        <div className="space-y-5">
          <Panel title="Modal GPU Runtime" icon={<Zap className="h-4 w-4" />}>
            <ModalGpuPanel />
          </Panel>

          <Panel title="Modal GPU Usage & Cost" icon={<Gauge className="h-4 w-4" />}>
            <ModalCostPanel />
          </Panel>

          <Panel
            title="Live Audit Stream"
            icon={<Activity className="h-4 w-4" />}
            action={
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 nexus-pulse" />
                streaming
              </span>
            }
          >
            <div className="nexus-scroll max-h-[440px] space-y-1 overflow-y-auto">
              {(audit.data?.items ?? []).length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No events. Run a pipeline to populate the stream.
                </div>
              ) : (
                audit.data?.items.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-start gap-2 rounded-md border border-border/30 bg-background/30 px-2 py-1.5"
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
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                          {e.kind}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground/60">
                          {new Date(e.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-[11px] text-foreground">{e.message}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad" | "neutral";
}) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-500/30 text-emerald-300"
      : tone === "warn"
        ? "border-amber-500/30 text-amber-300"
        : tone === "bad"
          ? "border-rose-500/30 text-rose-300"
          : "border-border/60 text-foreground";
  return (
    <div className={cn("nexus-card nexus-card-hover rounded-xl p-3.5", toneCls)}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 opacity-80" />
        <span className="text-[9px] uppercase tracking-wider opacity-60">{label}</span>
      </div>
      <div className="font-mono text-lg font-bold leading-none">{value}</div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-background/30 p-2.5">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate font-mono text-sm text-foreground">{value}</div>
        {sub ? <div className="truncate font-mono text-[9px] text-muted-foreground/70">{sub}</div> : null}
      </div>
    </div>
  );
}

function HistStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  tone: "up" | "down" | "neutral";
}) {
  const toneCls =
    tone === "up"
      ? "text-emerald-300"
      : tone === "down"
        ? "text-amber-300"
        : "text-muted-foreground";
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border/30 bg-background/30 px-2 py-1">
      <Icon className={cn("h-3 w-3", toneCls)} />
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("ml-auto font-mono text-[10px]", toneCls)}>{value}</span>
    </div>
  );
}

function GpuRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/30 bg-background/30 px-2 py-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-[11px]", warn ? "text-amber-300" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

/** Live Modal GPU status panel — replaces the old ZeroGPU panel. */
function ModalGpuPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["modal-status"],
    queryFn: async () => {
      const res = await fetch("/api/modal/status", { cache: "no-store" });
      if (!res.ok) throw new Error("modal-status");
      return res.json() as Promise<{
        enabled: boolean;
        reachable: boolean;
        model: string | null;
        gpu: string | null;
        latencyMs: number;
        error: string | null;
        coldStartBudgetSec: number;
      }>;
    },
    // No refetchInterval — on-demand only (cost optimization).
  });

  if (isLoading) {
    return <div className="py-2 text-[11px] text-muted-foreground">Loading Modal status…</div>;
  }

  if (!data?.enabled) {
    return (
      <div className="space-y-2">
        <GpuRow label="Backend" value="z-ai fallback" />
        <GpuRow label="Modal routing" value="disabled" warn />
        <p className="text-[10px] text-muted-foreground">
          Set <code className="font-mono text-primary">MODAL_USE=true</code> in <code className="font-mono">.env</code> to enable real GPU inference on Modal H100.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <GpuRow label="Backend" value="Modal" />
      <GpuRow
        label="Status"
        value={data.reachable ? "Warm (ready)" : "Cold / unreachable"}
        warn={!data.reachable}
      />
      {data.model ? <GpuRow label="Model" value={data.model} /> : null}
      {data.gpu ? <GpuRow label="GPU" value={data.gpu} /> : null}
      <GpuRow
        label="Latency"
        value={data.reachable ? `${data.latencyMs}ms` : "—"}
      />
      <GpuRow label="Warm call" value="~1.5–2s" />
      <GpuRow label="Cold start" value={`up to ~${Math.round(data.coldStartBudgetSec / 60)} min`} warn />
      <GpuRow label="Scale-down" value="10 min idle" />
      {data.error ? (
        <p className="font-mono text-[9px] text-amber-300/80">{data.error.slice(0, 100)}</p>
      ) : null}
    </div>
  );
}

/**
 * ModalCostPanel — estimates Modal GPU usage + cost based on persisted
 * pipeline runs. Reads from /api/modal/usage.
 */
function ModalCostPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["modal-usage"],
    queryFn: async () => {
      const res = await fetch("/api/modal/usage", { cache: "no-store" });
      if (!res.ok) throw new Error("usage");
      return res.json();
    },
    refetchInterval: 60000, // slowed from 30s → 60s (cost optimization)
  });

  if (isLoading) {
    return <div className="py-2 text-[11px] text-muted-foreground">Loading usage…</div>;
  }

  if (!data?.enabled) {
    return (
      <div className="space-y-1.5 text-[11px] text-muted-foreground">
        <p>Modal routing is disabled — no GPU usage.</p>
        <p className="text-[10px]">
          Enable <code className="font-mono text-primary">MODAL_USE=true</code> to route FLUX through the H100 GPU.
        </p>
      </div>
    );
  }

  const u = data;
  return (
    <div className="space-y-2">
      {/* Big total cost */}
      <div className="flex items-end justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Total estimated cost</div>
          <div className="font-mono text-2xl font-bold text-emerald-300">
            {u.totalCostFormatted}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Today</div>
          <div className="font-mono text-sm text-foreground">{u.costTodayFormatted}</div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-md border border-border/30 bg-background/30 px-2 py-1.5">
          <div className="text-[9px] uppercase text-muted-foreground">Runs</div>
          <div className="font-mono text-sm text-foreground">{u.runs}</div>
          <div className="text-[9px] text-muted-foreground">{u.runsToday} today</div>
        </div>
        <div className="rounded-md border border-border/30 bg-background/30 px-2 py-1.5">
          <div className="text-[9px] uppercase text-muted-foreground">GPU time</div>
          <div className="font-mono text-sm text-foreground">{u.totalGpuSec}s</div>
          <div className="text-[9px] text-muted-foreground">avg {u.avgFluxMs}ms/run</div>
        </div>
        <div className="rounded-md border border-border/30 bg-background/30 px-2 py-1.5">
          <div className="text-[9px] uppercase text-muted-foreground">Cold starts</div>
          <div className="font-mono text-sm text-amber-300">{u.coldStarts}</div>
          <div className="text-[9px] text-muted-foreground">~{u.coldStartPenaltySec}s penalty</div>
        </div>
        <div className="rounded-md border border-border/30 bg-background/30 px-2 py-1.5">
          <div className="text-[9px] uppercase text-muted-foreground">Per run</div>
          <div className="font-mono text-sm text-foreground">{u.avgCostPerRunFormatted}</div>
          <div className="text-[9px] text-muted-foreground">@ ${u.pricePerGpuSec}/sec H100</div>
        </div>
      </div>

      <p className="text-[9px] text-muted-foreground/70">
        Estimates based on <code className="font-mono">timings.flux</code> from persisted runs.
        Cold starts approximated as 1 per 15-min session gap (180s weight-load penalty each).
        Actual billing may differ — see Modal dashboard for authoritative usage.
      </p>
    </div>
  );
}

function Sparkline({
  data,
  color = "oklch(0.78 0.16 165)",
}: {
  data: number[];
  color?: string;
}) {
  const w = 600;
  const h = 128;
  if (data.length < 2) {
    return (
      <div className="grid h-full w-full place-items-center text-[10px] text-muted-foreground/60">
        Collecting samples…
      </div>
    );
  }
  const max = Math.max(...data) * 1.1;
  const min = Math.min(...data) * 0.9;
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => [i * step, h - ((v - min) / range) * h]);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;
  const gradId = `memgrad-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color.replace(")", " / 35%)").replace("oklch", "oklch")} />
          <stop offset="100%" stopColor="oklch(0.78 0.16 165 / 0%)" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {/* last point dot */}
      <circle
        cx={points[points.length - 1][0]}
        cy={points[points.length - 1][1]}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}

/** Dual-line sparkline showing two series on the same chart. */
function DualSparkline({
  primary,
  secondary,
  primaryColor = "oklch(0.78 0.16 165)",
  secondaryColor = "oklch(0.82 0.15 80)",
}: {
  primary: number[];
  secondary: number[];
  primaryColor?: string;
  secondaryColor?: string;
}) {
  const w = 600;
  const h = 144;
  const all = [...primary, ...secondary];
  if (all.length < 2) return null;
  const max = Math.max(...all) * 1.1;
  const min = Math.min(...all) * 0.85;
  const range = max - min || 1;

  function buildPath(data: number[]) {
    if (data.length < 2) return { line: "", area: "" };
    const step = w / (data.length - 1);
    const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * h]);
    const line = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
      .join(" ");
    const area = `${line} L${w},${h} L0,${h} Z`;
    return { line, area, last: pts[pts.length - 1] };
  }
  const p = buildPath(primary);
  const s = buildPath(secondary);
  const gradId1 = `dual-p-${Math.random().toString(36).slice(2, 9)}`;
  const gradId2 = `dual-s-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id={gradId1} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={primaryColor.replace(")", " / 28%)").replace("oklch", "oklch")} />
          <stop offset="100%" stopColor={primaryColor.replace(")", " / 0%)").replace("oklch", "oklch")} />
        </linearGradient>
        <linearGradient id={gradId2} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={secondaryColor.replace(")", " / 18%)").replace("oklch", "oklch")} />
          <stop offset="100%" stopColor={secondaryColor.replace(")", " / 0%)").replace("oklch", "oklch")} />
        </linearGradient>
      </defs>
      {/* horizontal grid lines */}
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1="0"
          y1={h * g}
          x2={w}
          y2={h * g}
          stroke="oklch(1 0 0 / 5%)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {p.area && <path d={p.area} fill={`url(#${gradId1})`} />}
      {s.area && <path d={s.area} fill={`url(#${gradId2})`} />}
      {p.line && (
        <path
          d={p.line}
          fill="none"
          stroke={primaryColor}
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {s.line && (
        <path
          d={s.line}
          fill="none"
          stroke={secondaryColor}
          strokeWidth="1.4"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {p.last && <circle cx={p.last[0]} cy={p.last[1]} r="2.5" fill={primaryColor} />}
      {s.last && <circle cx={s.last[0]} cy={s.last[1]} r="2" fill={secondaryColor} />}
    </svg>
  );
}

function formatUptime(s: number): string {
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
