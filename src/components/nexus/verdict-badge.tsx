"use client";

import { cn } from "@/lib/utils";

export function VerdictBadge({
  verdict,
  className,
  size = "md",
}: {
  verdict: string | null | undefined;
  className?: string;
  size?: "sm" | "md";
}) {
  const v = (verdict || "pending").toLowerCase();
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    approved: {
      label: "Approved",
      cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
      dot: "bg-emerald-400",
    },
    rejected: {
      label: "Rejected",
      cls: "border-rose-500/40 bg-rose-500/10 text-rose-300",
      dot: "bg-rose-400",
    },
    needs_review: {
      label: "Needs Review",
      cls: "border-amber-500/40 bg-amber-500/10 text-amber-300",
      dot: "bg-amber-400",
    },
    completed: {
      label: "Completed",
      cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
      dot: "bg-emerald-400",
    },
    failed: {
      label: "Failed",
      cls: "border-rose-500/40 bg-rose-500/10 text-rose-300",
      dot: "bg-rose-400",
    },
    running: {
      label: "Running",
      cls: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
      dot: "bg-cyan-400 nexus-pulse",
    },
    pending: {
      label: "Pending",
      cls: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
      dot: "bg-zinc-400",
    },
  };
  const conf = map[v] ?? map.pending;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-mono font-medium tracking-wide",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        conf.cls,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", conf.dot)} />
      {conf.label}
    </span>
  );
}

export function StatusDot({
  status,
  className,
}: {
  status: "idle" | "running" | "done" | "error" | "skipped";
  className?: string;
}) {
  const map = {
    idle: "bg-zinc-600",
    running: "bg-cyan-400 nexus-pulse",
    done: "bg-emerald-400",
    error: "bg-rose-400",
    skipped: "bg-zinc-700",
  } as const;
  return <span className={cn("inline-block h-2 w-2 rounded-full", map[status], className)} />;
}
