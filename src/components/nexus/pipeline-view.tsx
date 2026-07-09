"use client";

import { useQuery } from "@tanstack/react-query";
import { getPipelineStages } from "@/lib/nexus-types";
import type { MetricsResponse } from "@/lib/nexus-types";
import { Panel, SectionHeader } from "./command-view";
import { cn } from "@/lib/utils";
import { StatusDot } from "./verdict-badge";
import {
  Workflow,
  ArrowRight,
  Cpu,
  Clock,
  Database,
  ShieldCheck,
  ScanEye,
  FileJson,
  Image as ImageIcon,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { useNexus } from "./store";

// Read the selected engine + brain from the store so the pipeline stages
// reflect the user's actual configuration.
function useNexusEngineId(): string | undefined {
  return useNexus((s) => s.engineId);
}
function useNexusBrainId(): string | undefined {
  return useNexus((s) => s.brainId);
}

function useMetrics() {
  return useQuery<MetricsResponse>({
    queryKey: ["nexus-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/metrics", { cache: "no-store" });
      if (!res.ok) throw new Error("metrics");
      return res.json();
    },
    refetchInterval: 15000,
  });
}

function stageIcon(id: string) {
  switch (id) {
    case "prompt":
      return Sparkles;
    case "flux":
      return ImageIcon;
    case "st3gg":
      return ShieldCheck;
    case "judge":
      return ScanEye;
    case "evidence":
      return FileJson;
    case "output":
      return CheckCircle2;
    default:
      return Cpu;
  }
}

export function PipelineView() {
  const { data: m } = useMetrics();
  // Engine-aware stages: reflect the actually-selected engine + brain, not
  // a hardcoded "FLUX.1-schnell" label.
  const engineId = useNexusEngineId();
  const brainId = useNexusBrainId();
  const stages = getPipelineStages(engineId, brainId);

  return (
    <div className="space-y-5 nexus-rise">
      <SectionHeader
        eyebrow="Pipeline"
        title="Multi-Model Visual Creation Flow"
        desc="Four governed models collaborate end-to-end on Modal GPU + z-ai inference. Hover a stage for details."
        right={
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 nexus-pulse" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              5 lanes active
            </span>
          </div>
        }
      />

      {/* Flow diagram */}
      <Panel title="Stage Flow" icon={<Workflow className="h-4 w-4 text-primary" />}>
        <div className="overflow-x-auto nexus-scroll">
          <div className="flex min-w-max items-stretch gap-0 py-2">
            {stages.map((s, i) => {
              const Icon = stageIcon(s.id);
              const avg = m?.byStage?.[s.id]?.avgMs ?? 0;
              const count = m?.byStage?.[s.id]?.count ?? 0;
              const pct = avg > 0 ? Math.min(100, Math.round((avg / 30000) * 100)) : 0;
              return (
                <div key={s.id} className="flex items-stretch">
                  <div className="nexus-card nexus-card-hover nexus-card-glow group relative w-[180px] overflow-hidden rounded-xl p-3">
                    {/* Stage index ribbon */}
                    <div className="absolute right-0 top-0 rounded-bl-lg bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary transition group-hover:scale-110 group-hover:bg-primary/20">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        stage
                      </span>
                    </div>
                    <div className="text-sm font-semibold leading-tight">{s.label}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-primary">{s.model}</div>
                    <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                      {s.description}
                    </p>
                    <div className="mt-2.5 grid grid-cols-2 gap-1 border-t border-border/40 pt-2 text-[9px]">
                      <div>
                        <div className="text-muted-foreground/60">params</div>
                        <div className="font-mono text-foreground">{s.params}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-muted-foreground/60">typical</div>
                        <div className="font-mono text-foreground">{s.typicalMs}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground/60">runs</div>
                        <div className="font-mono text-foreground">{count}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-muted-foreground/60">avg</div>
                        <div className="font-mono text-foreground">
                          {avg > 0 ? (avg < 1000 ? `${avg}ms` : `${(avg / 1000).toFixed(1)}s`) : "—"}
                        </div>
                      </div>
                    </div>
                    {/* Avg timing bar */}
                    {avg > 0 ? (
                      <div className="mt-2">
                        <div className="mb-0.5 flex items-center justify-between text-[8px] text-muted-foreground/60">
                          <span>relative cost</span>
                          <span className="font-mono">{pct}%</span>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-700",
                              pct > 60 ? "bg-amber-400" : pct > 30 ? "bg-cyan-400" : "bg-emerald-400"
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {i < stages.length - 1 ? (
                    <div className="flex w-8 items-center justify-center">
                      <svg width="32" height="24" viewBox="0 0 32 24">
                        <line
                          x1="0"
                          y1="12"
                          x2="32"
                          y2="12"
                          stroke="oklch(0.78 0.16 165 / 50%)"
                          strokeWidth="1.5"
                          className="nexus-flow-line"
                        />
                        <polygon points="28,8 32,12 28,16" fill="oklch(0.78 0.16 165 / 70%)" />
                      </svg>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Model cards */}
        <Panel title="Model Lanes" icon={<Cpu className="h-4 w-4" />} className="lg:col-span-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {MODEL_LANES.map((lane) => (
              <div
                key={lane.name}
                className="rounded-lg border border-border/40 bg-background/30 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{lane.name}</span>
                  <StatusDot status="done" className="opacity-70" />
                </div>
                <div className="font-mono text-[10px] text-primary">{lane.role}</div>
                <div className="mt-2 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">params</span>
                  <span className="font-mono">{lane.params}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">engine</span>
                  <span className="font-mono text-foreground">{lane.engine}</span>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">{lane.note}</p>
              </div>
            ))}
          </div>
        </Panel>

        {/* Budget + runtime */}
        <div className="space-y-5">
          <Panel title="Model Sizes" icon={<Database className="h-4 w-4" />}>
            <div className="space-y-2">
              <BudgetRow label="FLUX.2 Klein 9B" value={9} color="bg-emerald-400" />
              <BudgetRow label="Gemma 4 12B" value={12} color="bg-cyan-400" />
              <BudgetRow label="Gemma 4 12B" value={12} color="bg-amber-400" />
              <BudgetRow label="ST3GG" value={0.8} color="bg-rose-400" />
            </div>
            <div className="mt-3 border-t border-border/40 pt-3 text-[10px] text-muted-foreground">
              Model sizes shown for reference. There is no fixed parameter cap — Modal auto-scales GPU containers per request, and z-ai hosted inference has its own quotas.
            </div>
          </Panel>

          <Panel title="Modal Runtime" icon={<Clock className="h-4 w-4" />}>
            <ModalRuntimeDetails />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ModalRuntimeDetails() {
  const { data, isLoading } = useQuery({
    queryKey: ["modal-status"],
    queryFn: async () => {
      const res = await fetch("/api/modal/status", { cache: "no-store" });
      if (!res.ok) throw new Error("modal-status");
      return res.json();
    },
    // No refetchInterval — on-demand only. The backend caches Modal health
    // for 60s, and polling here was burning the budget (8 loops × 15s).
    // Use the Monitor view's refresh button for manual updates.
  });

  if (isLoading) {
    return <div className="py-2 text-[11px] text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-1.5 text-[11px]">
      <RuntimeRow label="Backend" value={data?.enabled ? "Modal (H100)" : "z-ai fallback"} />
      <RuntimeRow label="Status" value={data?.reachable ? "Warm" : data?.enabled ? "Cold / unreachable" : "Disabled"} />
      {data?.model ? <RuntimeRow label="Model" value={data.model} /> : null}
      {data?.gpu ? <RuntimeRow label="GPU" value={data.gpu} /> : null}
      <RuntimeRow label="Latency" value={data?.reachable ? `${data.latencyMs}ms` : "—"} />
      <RuntimeRow label="Warm call" value="~1.5–2s" />
      <RuntimeRow label="Cold start" value="up to ~7 min" />
      <RuntimeRow label="Scale-down" value="10 min idle" />
    </div>
  );
}

function BudgetRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">{value < 1 ? `${value}B` : `${value}B`}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${(value / 32) * 100}%` }} />
      </div>
    </div>
  );
}

function RuntimeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/30 bg-background/30 px-2 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

const MODEL_LANES = [
  {
    name: "FLUX.2 Klein 9B",
    role: "Generator",
    params: "~9B (Modal L40S)",
    engine: "Modal /generate → H100 GPU",
    note: "Diffusion renderer — produces the base image from the structured prompt on a Modal H100 GPU. Falls back to z-ai hosted inference when Modal is disabled.",
  },
  {
    name: "ST3GG",
    role: "Safety Scanner",
    params: "<1B",
    engine: "z-ai chat completions",
    note: "Flags policy / wardrobe / content risk before the judge consumes the image.",
  },
  {
    name: "Gemma 4 12B",
    role: "Visual Judge",
    params: "~8B",
    engine: "z-ai vision completions",
    note: "Scores prompt adherence, aesthetics, safety and wardrobe match from pixels.",
  },
  {
    name: "Gemma 4 12B",
    role: "Evidence Aggregator",
    params: "~8B",
    engine: "z-ai chat completions",
    note: "Aggregates scan + judge outputs into a single structured JSON verdict.",
  },
];
