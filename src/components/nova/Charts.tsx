import { useId, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/lib/motion";

/**
 * Monochrome instrument charts.
 *
 * Colour carries one meaning only in this console — mission status —
 * so every chart draws in the foreground ink and reserves GO/HOLD/NO-GO
 * hues for the single mark that is actually reporting state.
 */

function buildPath(values: number[], width: number, height: number, pad = 1) {
  if (values.length === 0) return { line: "", area: "", points: [] as Array<[number, number]> };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;

  const points = values.map((value, index) => {
    const x = pad + index * stepX;
    const y = pad + (height - pad * 2) * (1 - (value - min) / span);
    return [x, y] as [number, number];
  });

  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${points[points.length - 1][0].toFixed(2)},${height} L${points[0][0].toFixed(2)},${height} Z`;

  return { line, area, points };
}

/**
 * Sparkline — a single series drawn as a hairline with a faint fill
 * and a live marker pinned to the most recent sample.
 */
export function Sparkline({
  values,
  width = 240,
  height = 44,
  className,
  tone = "default",
  showMarker = true,
  interactive = false,
  label,
  format,
  labelAt,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  tone?: "default" | "go" | "hold" | "no-go";
  showMarker?: boolean;
  /** Adds a crosshair and a readout on hover. Off by default. */
  interactive?: boolean;
  /** What the series measures, shown in the readout. */
  label?: string;
  /** Format one value for the readout. Defaults to a grouped integer. */
  format?: (value: number) => string;
  /** Label for the point at index i — a timestamp, a ledger, a bucket. */
  labelAt?: (index: number) => string;
}) {
  const gradientId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const { line, area, points } = useMemo(
    () => buildPath(values, width, height),
    [values, width, height]
  );

  // Default series draw in the brand blue, matching the board's market
  // charts; status hues stay reserved for a series actually reporting one.
  const stroke =
    tone === "go"
      ? "hsl(var(--status-go))"
      : tone === "hold"
        ? "hsl(var(--status-hold))"
        : tone === "no-go"
          ? "hsl(var(--status-no-go))"
          : "hsl(var(--brand))";

  if (values.length < 2) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-[9px] tracking-[0.2em] text-muted-foreground",
          className
        )}
        style={{ height }}
      >
        ACQUIRING SIGNAL
      </div>
    );
  }

  const last = points[points.length - 1];

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const host = hostRef.current;
    if (!host) return;
    const box = host.getBoundingClientRect();
    if (box.width <= 0) return;
    // Nearest sample to the pointer, in data space rather than pixels, so
    // the crosshair lands on a real reading instead of between two.
    const ratio = (event.clientX - box.left) / box.width;
    const index = Math.round(ratio * (values.length - 1));
    setHover(Math.max(0, Math.min(values.length - 1, index)));
  };

  const fmt = format ?? ((v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 }));

  const chart = (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full overflow-visible", className)}
      style={{ height }}
      role="img"
      aria-label="Trend sparkline"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          {/* The board's area charts carry a real gradient under the line
              — strong at the trace, gone at the baseline. */}
          <stop offset="0%" stopColor={stroke} stopOpacity="0.38" />
          <stop offset="55%" stopColor={stroke} stopOpacity="0.10" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={area} fill={`url(#${gradientId})`} />
      <motion.path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />

      {showMarker && hover === null && (
        <g>
          <line
            x1={last[0]}
            y1={0}
            x2={last[0]}
            y2={height}
            stroke={stroke}
            strokeWidth="0.5"
            strokeDasharray="2 3"
            opacity="0.35"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={last[0]} cy={last[1]} r="2" fill={stroke} />
        </g>
      )}

      {hover !== null && points[hover] && (
        <g>
          <line
            x1={points[hover][0]}
            y1={0}
            x2={points[hover][0]}
            y2={height}
            stroke="hsl(var(--foreground))"
            strokeWidth="0.75"
            opacity="0.45"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={points[hover][0]} cy={points[hover][1]} r="2.5" fill={stroke} />
        </g>
      )}
    </svg>
  );

  if (!interactive) return chart;

  const active = hover !== null ? hover : values.length - 1;

  return (
    <div
      ref={hostRef}
      className="relative"
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      {chart}
      {/*
        The readout is a fixed strip rather than a floating tooltip: at
        44px tall a tooltip would cover the series it describes, and a
        strip that is always present means the number does not jump into
        and out of existence as the pointer crosses the chart.
      */}
      {/*
        Wraps rather than clips. At 1024 the label, value and timestamp
        together exceed a narrow panel, and the panel clips — so the
        timestamp, which is the whole point of the readout, was the part
        that disappeared. min-w-0 lets the stamp truncate instead.
      */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[9px] tabular-nums text-faint">
        {label && <span className="shrink-0 tracking-[0.14em]">{label}</span>}
        <span className="shrink-0 text-muted-foreground">{fmt(values[active])}</span>
        {labelAt && (
          <span className="ml-auto min-w-0 truncate" title={labelAt(active)}>
            {labelAt(active)}
          </span>
        )}
        {hover === null && !labelAt && <span className="ml-auto shrink-0">LATEST</span>}
      </div>
    </div>
  );
}

/**
 * BarSeries — discrete per-ledger counts as a strip chart.
 *
 * The track is always `slots` columns wide and fills from the left, so
 * an instrument that has only just started listening looks like an
 * instrument acquiring signal rather than three enormous bars.
 */
export function BarSeries({
  values,
  height = 46,
  slots = 48,
  className,
  tone = "default",
}: {
  values: number[];
  height?: number;
  slots?: number;
  className?: string;
  tone?: "default" | "go" | "hold" | "no-go";
}) {
  const max = Math.max(1, ...values);
  const window = values.slice(-slots);
  const padding = Math.max(0, slots - window.length);
  const accent =
    tone === "go"
      ? "bg-go"
      : tone === "hold"
        ? "bg-hold"
        : tone === "no-go"
          ? "bg-no-go"
          : "bg-foreground";

  return (
    <div
      className={cn("flex w-full items-end gap-[2px]", className)}
      style={{ height }}
      role="img"
      aria-label="Per-ledger transaction counts"
    >
      {Array.from({ length: padding }).map((_, index) => (
        <span
          key={`empty-${index}`}
          className="min-w-[2px] flex-1 bg-foreground/[0.07]"
          style={{ height: 3 }}
        />
      ))}
      {window.map((value, index) => {
        const isLast = index === window.length - 1;
        return (
          <motion.span
            key={`bar-${padding + index}`}
            className={cn("min-w-[2px] flex-1", isLast ? accent : "bg-foreground/30")}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{
              height: `${Math.max(3, (value / max) * height)}px`,
              transformOrigin: "bottom",
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * RingGauge — a percentage read as an arc. Used where a bar would
 * read as "progress" rather than "coverage".
 */
export function RingGauge({
  value,
  size = 56,
  label,
  tone = "default",
  className,
}: {
  value: number;
  size?: number;
  label?: string;
  tone?: "default" | "go" | "hold" | "no-go";
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const pct = Math.max(0, Math.min(100, value));
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;

  // Default series draw in the brand blue, matching the board's market
  // charts; status hues stay reserved for a series actually reporting one.
  const stroke =
    tone === "go"
      ? "hsl(var(--status-go))"
      : tone === "hold"
        ? "hsl(var(--status-hold))"
        : tone === "no-go"
          ? "hsl(var(--status-no-go))"
          : "hsl(var(--brand))";

  return (
    <div className={cn("relative grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="2"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="butt"
          strokeDasharray={circumference}
          initial={reduced ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - pct / 100) }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute grid place-items-center text-center">
        <span className="data-font text-[13px] font-[600] leading-none tabular-nums text-foreground">
          {Math.round(pct)}
        </span>
        {label && (
          <span className="stencil mt-0.5 text-[6px] tracking-[0.18em] text-muted-foreground">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Meter — a horizontal coverage bar with a scale rule beneath it.
 * The tick marks are what make it read as an instrument.
 */
export function Meter({
  label,
  value,
  tone = "default",
  className,
}: {
  label: string;
  value: number;
  tone?: "default" | "go" | "hold" | "no-go";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const fill =
    tone === "go"
      ? "bg-go"
      : tone === "hold"
        ? "bg-hold"
        : tone === "no-go"
          ? "bg-no-go"
          : "bg-foreground";

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="stencil min-w-0 truncate text-[8px] tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span className="data-font text-[11px] tabular-nums text-foreground">
          {Math.round(pct)}%
        </span>
      </div>
      <div className="relative h-[3px] w-full bg-secondary">
        <motion.span
          className={cn("absolute inset-y-0 left-0", fill)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <div className="mt-1 flex justify-between">
        {Array.from({ length: 5 }).map((_, index) => (
          <span key={index} className="h-1 w-px bg-border" />
        ))}
      </div>
    </div>
  );
}
