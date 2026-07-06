"use client";

import { cn } from "@/lib/utils";

// Circular score gauge (0-100)
export function ScoreRing({
  value,
  size = 64,
  stroke = 6,
  label,
  className,
}: {
  value: number | null | undefined;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, typeof value === "number" ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (v / 100) * c;
  const color =
    v >= 80 ? "#34d399" : v >= 60 ? "#fbbf24" : v >= 40 ? "#fb923c" : "#fb7185";
  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-sm font-bold leading-none" style={{ color }}>
          {Math.round(v)}
        </span>
        {label ? (
          <span className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// Horizontal score bar
export function ScoreBar({
  value,
  label,
  className,
}: {
  value: number | null | undefined;
  label?: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, typeof value === "number" ? value : 0));
  const color =
    v >= 80 ? "bg-emerald-400" : v >= 60 ? "bg-amber-400" : v >= 40 ? "bg-orange-400" : "bg-rose-400";
  return (
    <div className={cn("w-full", className)}>
      {label ? (
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-mono font-medium">{Math.round(v)}</span>
        </div>
      ) : null}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        <div
          className={cn("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}
