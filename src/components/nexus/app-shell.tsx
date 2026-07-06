"use client";

import { useNexus } from "./store";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  LayoutDashboard,
  Workflow,
  ShieldCheck,
  Images,
  Activity,
  Cpu,
  Cloud,
  CircleDot,
  Keyboard,
  X,
  Library,
  DollarSign,
} from "lucide-react";
import type { ViewId } from "@/lib/nexus-types";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ConsentGate } from "./consent-gate";
import { LEGAL_DISCLAIMER } from "@/lib/policy";

const NAV: { id: ViewId; label: string; icon: typeof Sparkles; hint: string }[] = [
  { id: "studio", label: "Studio", icon: Sparkles, hint: "Generate" },
  { id: "library", label: "LoRA Library", icon: Library, hint: "HF + Civitai" },
  { id: "command", label: "Command Center", icon: LayoutDashboard, hint: "Overview" },
  { id: "pipeline", label: "Pipeline", icon: Workflow, hint: "Flow" },
  { id: "compliance", label: "Compliance", icon: ShieldCheck, hint: "Safety" },
  { id: "costlab", label: "Cost Lab", icon: DollarSign, hint: "Budget" },
  { id: "gallery", label: "Gallery", icon: Images, hint: "Archive" },
  { id: "monitor", label: "Monitor", icon: Activity, hint: "System" },
];

function useMetricsPoll() {
  return useQuery({
    queryKey: ["nexus-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/metrics", { cache: "no-store" });
      if (!res.ok) throw new Error("metrics");
      return res.json();
    },
    refetchInterval: 15000,
  });
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const view = useNexus((s) => s.view);
  const setView = useNexus((s) => s.setView);
  const running = useNexus((s) => s.running);
  const metrics = useMetricsPoll();
  const setPolicy = useNexus((s) => s.setPolicy);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Load the active safety/legal policy on mount (drives NSFW gating everywhere).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/policy", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data) setPolicy(data);
      } catch {
        /* ignore — defaults apply */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setPolicy]);

  const total = metrics.data?.total ?? 0;
  const approved = metrics.data?.approved ?? 0;
  const successRate = metrics.data?.successRate ?? 0;
  const avgScore = metrics.data?.avgScore;

  // ? toggles shortcuts overlay; g+s/g+c/g+p/g+f/g+m switch views (Vim-style)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const editable = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !editable) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setShowShortcuts(false);
        return;
      }
      if (e.key === "g" && !editable && !e.metaKey && !e.ctrlKey) {
        // wait for next key
        const onNext = (ev: KeyboardEvent) => {
          window.removeEventListener("keydown", onNext, true);
          const k = ev.key.toLowerCase();
          if (k === "s") setView("studio");
          else if (k === "l") setView("library");
          else if (k === "c") setView("command");
          else if (k === "p") setView("pipeline");
          else if (k === "f") setView("compliance");
          else if (k === "b") setView("costlab");
          else if (k === "g") setView("gallery");
          else if (k === "m") setView("monitor");
        };
        window.addEventListener("keydown", onNext, true);
        setTimeout(() => window.removeEventListener("keydown", onNext, true), 800);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView]);

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* NSFW 18+ consent gate (renders only until a decision is recorded) */}
      <ConsentGate />
      {/* Ambient aurora background */}
      <div className="nexus-aurora nexus-aurora-drift" />
      <div className="nexus-grid-bg pointer-events-none absolute inset-0 z-0 opacity-60" />

      {/* Top status bar */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
          {/* Logo */}
          <button
            onClick={() => setView("studio")}
            className="flex shrink-0 items-center gap-2.5"
            aria-label="NEXUS Visual Weaver home"
          >
            <div className="relative grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary nexus-glow">
              <CircleDot className="h-4 w-4" />
            </div>
            <div className="hidden leading-none sm:block">
              <div className="font-mono text-[13px] font-bold tracking-tight">
                NEXUS<span className="text-primary">·</span>WEAVER
              </div>
              <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                v2.3 · Modal GPU
              </div>
            </div>
          </button>

          {/* Live status pills (desktop) */}
          <div className="ml-2 hidden items-center gap-2 lg:flex">
            <Pill icon={<Cpu className="h-3 w-3" />} label="Pipeline" value={running ? "Running" : "Ready"} tone={running ? "ok" : "neutral"} />
            <Pill
              label="Gens"
              value={String(total)}
              tone="neutral"
            />
            <Pill
              label="Approved"
              value={String(approved)}
              tone="ok"
            />
            <Pill
              label="Success"
              value={`${successRate}%`}
              tone={successRate >= 80 ? "ok" : successRate >= 50 ? "warn" : "bad"}
            />
            {typeof avgScore === "number" ? (
              <Pill label="Avg Score" value={avgScore.toFixed(1)} tone="ok" />
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowShortcuts(true)}
              className="hidden items-center justify-center rounded-md nexus-glass h-8 w-8 text-muted-foreground transition hover:border-primary/40 hover:text-foreground sm:inline-flex"
              title="Keyboard shortcuts (?)"
              aria-label="Keyboard shortcuts"
            >
              <kbd className="font-mono text-[11px]">?</kbd>
            </button>
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              className="hidden items-center gap-1.5 rounded-md nexus-glass px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground sm:inline-flex"
              title="Command Palette (⌘K)"
            >
              <Keyboard className="h-3.5 w-3.5" />
              <kbd className="font-mono text-[10px]">⌘K</kbd>
            </button>
            <a
              href="https://modal.com"
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground sm:inline-flex"
              title="Modal — serverless GPU cloud"
            >
              <Cloud className="h-3.5 w-3.5" />
              Modal
            </a>
            <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-card/50 px-2.5 py-1.5">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  running ? "bg-cyan-400 nexus-pulse" : "bg-emerald-400"
                )}
              />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {running ? "Running" : "Online"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 flex flex-1">
        {/* Side nav (desktop) */}
        <nav className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col border-r border-border/60 bg-sidebar/40 p-3 md:flex">
          <div className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Command Center
          </div>
          <ul className="flex flex-col gap-0.5">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => setView(item.id)}
                    className={cn(
                      "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition",
                      active
                        ? "bg-primary/12 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition",
                        active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    <span className="flex-1 font-medium">{item.label}</span>
                    {active ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                        {item.hint}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-auto space-y-2 px-2 pb-1">
            <ModalSidebarWidget />
            <div className="text-center text-[9px] text-muted-foreground/70">
              NEXUS · Modal GPU runtime
            </div>
          </div>
        </nav>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border/60 bg-background/95 backdrop-blur-xl md:hidden">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2 text-[9px] font-medium transition",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label.split(" ")[0]}
              </button>
            );
          })}
        </nav>

        {/* Main content */}
        <main className="min-w-0 flex-1 pb-20 md:pb-0">
          <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-5 sm:py-7">{children}</div>
        </main>
      </div>

      {/* Footer (sticky bottom on desktop) */}
      <footer className="relative z-10 mt-auto hidden border-t border-border/60 bg-background/80 py-3 backdrop-blur md:block">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-5 text-[11px] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold text-foreground">NEXUS Visual Weaver</span>
            <span className="text-muted-foreground/50">·</span>
            <span>Governed multi-agent visual creation pipeline</span>
          </div>
          <p className="max-w-5xl leading-relaxed text-muted-foreground/70">
            <span className="font-semibold text-muted-foreground">Legal:</span>{" "}
            {LEGAL_DISCLAIMER}
          </p>
          <div className="flex items-center gap-3 font-mono">
            <span>FLUX.2 → ST3GG → Gemma 4 → Nemotron</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-primary">Modal L40S GPU · uncensored brain</span>
          </div>
        </div>
      </footer>

      {/* Keyboard shortcuts overlay */}
      {showShortcuts ? <ShortcutsOverlay onClose={() => setShowShortcuts(false)} /> : null}
    </div>
  );
}

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const groups: { title: string; items: { keys: string[]; desc: string }[] }[] = [
    {
      title: "Global",
      items: [
        { keys: ["⌘", "K"], desc: "Open command palette" },
        { keys: ["?"], desc: "Toggle this shortcuts overlay" },
        { keys: ["Esc"], desc: "Close overlay / dialog" },
        { keys: ["g", "s"], desc: "Go to Studio" },
        { keys: ["g", "l"], desc: "Go to LoRA Library" },
        { keys: ["g", "c"], desc: "Go to Command Center" },
        { keys: ["g", "p"], desc: "Go to Pipeline" },
        { keys: ["g", "f"], desc: "Go to Compliance" },
        { keys: ["g", "b"], desc: "Go to Cost Lab (Budget)" },
        { keys: ["g", "g"], desc: "Go to Gallery" },
        { keys: ["g", "m"], desc: "Go to Monitor" },
      ],
    },
    {
      title: "Studio",
      items: [
        { keys: ["⌘", "↵"], desc: "Run pipeline (when prompt is set)" },
        { keys: ["⌘", "E"], desc: "Enhance prompt with AI" },
      ],
    },
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm nexus-scale-in"
      onClick={onClose}
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="nexus-card nexus-glow-strong relative w-full max-w-lg rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary">
            <Keyboard className="h-3.5 w-3.5" />
          </span>
          <h2 className="font-mono text-sm font-semibold">Keyboard Shortcuts</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {g.title}
              </div>
              <ul className="space-y-1.5">
                {g.items.map((it) => (
                  <li key={it.desc} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted-foreground">{it.desc}</span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      {it.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="rounded border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[9px] text-foreground"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-[9px] text-muted-foreground/60">
          Press <kbd className="rounded border border-border/60 bg-background/60 px-1 py-0.5 font-mono text-[9px]">?</kbd> anywhere to toggle this overlay
        </p>
      </div>
    </div>
  );
}

function Pill({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad" | "neutral";
}) {
  const toneCls =
    tone === "ok"
      ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/5"
      : tone === "warn"
        ? "text-amber-300 border-amber-500/30 bg-amber-500/5"
        : tone === "bad"
          ? "text-rose-300 border-rose-500/30 bg-rose-500/5"
          : "text-muted-foreground border-border/60 bg-card/40";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px]",
        toneCls
      )}
    >
      {icon}
      <span className="uppercase tracking-wider opacity-70">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Modal integration widgets
// ---------------------------------------------------------------------------

interface ModalStatus {
  enabled: boolean;
  baseUrl: string;
  reachable: boolean;
  status: string;
  model: string | null;
  gpu: string | null;
  latencyMs: number;
  error: string | null;
  coldStartBudgetSec: number;
  warmTimeoutSec: number;
}

function useModalStatus() {
  return useQuery<ModalStatus>({
    queryKey: ["modal-status"],
    queryFn: async () => {
      const res = await fetch("/api/modal/status", { cache: "no-store" });
      if (!res.ok) throw new Error("modal-status");
      return res.json();
    },
    // No refetchInterval — the sidebar polls on EVERY page view. With 8 loops
    // at 15s this was the #1 budget bleeder (310 health checks/day). The
    // backend now caches Modal health for 60s; fetch once on mount only.
    // Use Cost Lab or Monitor for manual refresh.
    retry: 1,
  });
}

/** Compact badge shown in the top-right header. */
function ModalStatusBadge() {
  const { data } = useModalStatus();
  if (!data) return null;
  const tone = !data.enabled
    ? "neutral"
    : data.reachable
      ? "ok"
      : "warn";
  const label = !data.enabled ? "z-ai" : data.reachable ? "Modal" : "Modal·cold";
  return (
    <Pill
      icon={<Cloud className="h-3 w-3" />}
      label="GPU"
      value={label}
      tone={tone}
    />
  );
}

/** Sidebar widget showing live Modal backend status + GPU info. */
function ModalSidebarWidget() {
  const { data, isLoading } = useModalStatus();

  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Cloud className="h-3 w-3" /> Modal Backend
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 font-mono text-[9px]",
            data?.reachable ? "text-emerald-300" : data?.enabled ? "text-amber-300" : "text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              data?.reachable ? "bg-emerald-400" : data?.enabled ? "bg-amber-400 nexus-pulse" : "bg-muted-foreground/40"
            )}
          />
          {isLoading ? "…" : !data?.enabled ? "z-ai" : data?.reachable ? "Warm" : "Cold"}
        </span>
      </div>

      {data?.reachable ? (
        <div className="space-y-1 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Model</span>
            <span className="font-mono text-primary">{data.model ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">GPU</span>
            <span className="font-mono text-primary">{data.gpu ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Latency</span>
            <span className="font-mono text-primary">{data.latencyMs}ms</span>
          </div>
        </div>
      ) : data?.enabled ? (
        <div className="space-y-1.5 text-[10px] text-muted-foreground">
          <p>
            {data.error ? "Unreachable" : "Container cold-starting…"}
          </p>
          {data.error ? (
            <p className="font-mono text-[9px] text-amber-300/80">{data.error.slice(0, 80)}</p>
          ) : null}
          <p className="text-[9px]">
            Cold starts can take up to ~{Math.round(data.coldStartBudgetSec / 60)} min for FLUX weight load.
            Warm calls return in ~1.5–2s.
          </p>
        </div>
      ) : (
        <div className="space-y-1 text-[10px] text-muted-foreground">
          <p>Modal routing disabled.</p>
          <p className="text-[9px]">
            Set <code className="font-mono text-primary">MODAL_USE=true</code> in <code className="font-mono">.env</code> to route FLUX generation through the Modal H100 GPU.
          </p>
        </div>
      )}
    </div>
  );
}
