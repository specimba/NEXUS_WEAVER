"use client";

import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────────────────────
// Inline SVG charts — no external chart lib needed.
// All charts render crisply at any size via viewBox + preserveAspectRatio.
// ────────────────────────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
  label?: string;
}

/**
 * LineChart — minimal SVG line chart with area fill + optional gradient.
 * Props:
 *   data: number[] — y values (x is the index)
 *   width, height: viewBox dimensions
 *   color: stroke color (CSS color)
 *   fillOpacity: area fill opacity (0 disables)
 *   min, max: explicit y domain (defaults to data min/max with padding)
 */
export function LineChart({
  data,
  width = 320,
  height = 80,
  color = "oklch(0.78 0.16 165)",
  fillOpacity = 0.15,
  min,
  max,
  strokeWidth = 1.5,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  min?: number;
  max?: number;
  strokeWidth?: number;
  className?: string;
}) {
  if (data.length === 0) {
    return (
      <div
        className={cn("grid place-items-center text-[10px] text-muted-foreground", className)}
        style={{ height }}
      >
        no data
      </div>
    );
  }
  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const lo = min ?? Math.min(...data);
  const hi = max ?? Math.max(...data);
  const range = hi - lo || 1;
  const stepX = data.length > 1 ? w / (data.length - 1) : 0;

  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + h - ((v - lo) / range) * h;
    return { x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
  const areaPath =
    `${linePath} L${points[points.length - 1].x.toFixed(2)},${(pad + h).toFixed(2)}` +
    ` L${points[0].x.toFixed(2)},${(pad + h).toFixed(2)} Z`;

  const gradId = `lc-grad-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      style={{ height }}
    >
      {fillOpacity > 0 ? (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
        </>
      ) : null}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* last point dot */}
      {points.length > 0 ? (
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r={2.5}
          fill={color}
        />
      ) : null}
    </svg>
  );
}

/**
 * DonutChart — SVG donut/pie chart with labeled segments.
 * Props:
 *   data: { label, value, color }[]
 *   size: viewBox dimension (square)
 *   thickness: donut ring thickness in px
 */
export function DonutChart({
  data,
  size = 120,
  thickness = 14,
  centerLabel,
  centerSub,
  className,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
  className?: string;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const segments = data.map((d) => {
    const frac = total > 0 ? d.value / total : 0;
    const len = frac * circumference;
    const seg = {
      ...d,
      dasharray: `${len} ${circumference - len}`,
      dashoffset: -offset,
      frac,
    };
    offset += len;
    return seg;
  });

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
        {/* background ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="oklch(0.25 0 0 / 0.3)"
          strokeWidth={thickness}
        />
        {total > 0
          ? segments.map((s, i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={s.dasharray}
                strokeDashoffset={s.dashoffset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            ))
          : null}
        {centerLabel ? (
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground font-mono"
            style={{ fontSize: size * 0.18, fontWeight: 700 }}
          >
            {centerLabel}
          </text>
        ) : null}
        {centerSub ? (
          <text
            x={cx}
            y={cy + size * 0.13}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground font-mono"
            style={{ fontSize: size * 0.08 }}
          >
            {centerSub}
          </text>
        ) : null}
      </svg>
      <div className="space-y-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: d.color }}
            />
            <span className="text-muted-foreground">{d.label}</span>
            <span className="ml-auto font-mono text-foreground">
              {d.value}
              {total > 0 ? (
                <span className="text-muted-foreground">
                  {" "}
                  ({Math.round((d.value / total) * 100)}%)
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * BarChart — vertical bar chart with labeled bars.
 * Props:
 *   data: { label, value, color? }[]
 *   height: viewBox height
 */
export function BarChart({
  data,
  height = 120,
  className,
  valueFormatter = (v: number) => String(v),
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  className?: string;
  valueFormatter?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = 100 / Math.max(data.length, 1);
  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 20);
          const x = i * barWidth + barWidth * 0.15;
          const w = barWidth * 0.7;
          const y = height - 16 - h;
          const color = d.color ?? "oklch(0.78 0.16 165)";
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={w}
                height={Math.max(h, 0.5)}
                fill={color}
                opacity={0.85}
                rx={0.5}
              />
              <text
                x={x + w / 2}
                y={y - 1.5}
                textAnchor="middle"
                className="fill-foreground font-mono"
                style={{ fontSize: 4 }}
              >
                {valueFormatter(d.value)}
              </text>
              <text
                x={x + w / 2}
                y={height - 4}
                textAnchor="middle"
                className="fill-muted-foreground font-mono"
                style={{ fontSize: 3.5 }}
              >
                {d.label.slice(0, 8)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Sparkline — tiny inline SVG trend line for compact display.
 */
export function Sparkline({
  data,
  width = 80,
  height = 20,
  color = "oklch(0.78 0.16 165)",
  fillOpacity = 0.2,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
}) {
  return (
    <LineChart
      data={data}
      width={width}
      height={height}
      color={color}
      fillOpacity={fillOpacity}
      strokeWidth={1.25}
      className="inline-block"
    />
  );
}
