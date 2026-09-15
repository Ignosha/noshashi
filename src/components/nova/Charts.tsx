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

/** XRPL closes every three to four seconds. Anything outside is worth seeing. */
export const CADENCE_NORMAL_MIN_S = 3;
export const CADENCE_NORMAL_MAX_S = 4;

/**
 * CadenceRibbon — the interval between consecutive ledger closes.
 *
 * The panel this sits in is called LEDGER CADENCE, and it used to plot
 * transactions per close. That is throughput: a ledger carrying four hundred
 * transactions and one carrying none can close at exactly the same rhythm,
 * and a network genuinely stalling would not move the line at all. Cadence is
 * the *timing*, so this draws the timing.
 *
 * Each bar is one interval. The band behind them is the three-to-four-second
 * window a healthy network closes in, drawn rather than described so that
 * "normal" is a thing you see a bar sitting inside instead of a claim in a
 * caption.
 *
 * Deviation is encoded by opacity and a marker, never by hue: DESIGN.md
 * spends `--go`/`--hold`/`--no-go` on verdicts alone, and a slow ledger close
 * is an observation, not an adjudication. The newest bar is the only thing
 * drawn in `--telemetry`, which is reserved for a value updating right now.
 */
export function CadenceRibbon({
  intervals,
  height = 62,
  live = false,
  labelAt,
  className,
}: {
  /** Seconds between consecutive closes, oldest first. */
  intervals: number[];
  height?: number;
  /** Draw the newest interval as live. False when the stream is down. */
  live?: boolean;
  labelAt?: (index: number) => string;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();

  if (intervals.length === 0) {
    return (
      <div className={cn("flex items-center", className)} style={{ height }}>
        <p className="mono-font text-[10px] text-muted-foreground">
          TWO CLOSES NEEDED TO MEASURE AN INTERVAL…
        </p>
      </div>
    );
  }

  /**
   * Zoomed to the data, not anchored at zero — and that is why these are
   * dots rather than bars.
   *
   * A bar encodes magnitude as length from a baseline, so truncating its
   * axis misstates every ratio on the chart; bars start at zero or they lie.
   * Drawn that way, though, this chart was useless: every interval sits
   * between 3.7 and 4.1 seconds, which on a 0–6s axis is four pixels of
   * variation inside a wall of identical bars. The reading the panel exists
   * to give — is the network holding its rhythm, and how tightly — was
   * invisible.
   *
   * A dot encodes position, not length. Nothing about it claims a baseline,
   * so a zoomed range is honest, and the band drawn behind supplies the
   * reference the axis no longer does. The range always contains the whole
   * 3–4s window, so the band can never fall off-scale and flatter the
   * reading by cropping.
   */
  const lo = Math.min(CADENCE_NORMAL_MIN_S, ...intervals) - 0.3;
  const hi = Math.max(CADENCE_NORMAL_MAX_S, ...intervals) + 0.3;
  const span = hi - lo || 1;
  const y = (seconds: number) => ((seconds - lo) / span) * height;

  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const newest = intervals[intervals.length - 1];

  /**
   * Marginal distribution down the right edge, sharing the run chart's y
   * scale so a bucket sits at the height of the intervals inside it.
   *
   * This is the half of the picture a run chart alone cannot show. Twenty
   * bars stepping in and out of the band and twenty bars sitting hard
   * against one edge of it look similar in sequence and mean completely
   * different things about the network; the shape of the distribution is
   * what separates them, and it costs twenty pixels.
   */
  const BUCKETS = 11;
  const histogram = Array.from({ length: BUCKETS }, () => 0);
  for (const seconds of intervals) {
    const slot = Math.min(
      BUCKETS - 1,
      Math.max(0, Math.floor(((seconds - lo) / span) * BUCKETS))
    );
    histogram[slot] += 1;
  }
  const peak = Math.max(...histogram, 1);

  return (
    <div className={className}>
      <div className="flex w-full items-stretch gap-1.5" style={{ height }}>
        <div className="relative min-w-0 flex-1">
          {/* The healthy window, behind the data. */}
          <div
            className="pointer-events-none absolute inset-x-0 border-y border-dashed border-border/70 bg-secondary/40"
            style={{
              bottom: y(CADENCE_NORMAL_MIN_S),
              height: Math.max(1, y(CADENCE_NORMAL_MAX_S) - y(CADENCE_NORMAL_MIN_S)),
            }}
          />
          {/* Observed median. A run chart without a centre line asks the eye
              to average twenty bars, which it does badly and confidently. */}
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-foreground/45"
            style={{ bottom: y(median) }}
          />
          <div className="absolute inset-0 flex items-stretch gap-px">
            {intervals.map((seconds, index) => {
              const isNewest = index === intervals.length - 1;
              const outOfBand =
                seconds < CADENCE_NORMAL_MIN_S || seconds > CADENCE_NORMAL_MAX_S;
              return (
                <div
                  key={index}
                  className="relative min-w-[2px] flex-1"
                  title={
                    labelAt
                      ? `${labelAt(index)} · ${seconds.toFixed(2)}s`
                      : `${seconds.toFixed(2)}s`
                  }
                >
                  {/* A hairline down to the band's floor. Not a bar — it is a
                      drop line, which is what lets the eye follow a sequence
                      of dots without implying length from zero. */}
                  <span
                    className={cn(
                      "absolute left-1/2 w-px -translate-x-1/2 bg-foreground/15",
                      outOfBand && "bg-foreground/30"
                    )}
                    style={{ bottom: 0, height: Math.max(0, y(seconds)) }}
                  />
                  <motion.span
                    className={cn(
                      "absolute left-1/2 h-[3px] w-[3px] -translate-x-1/2 translate-y-1/2 rounded-full",
                      isNewest && live
                        ? "h-[5px] w-[5px] bg-[hsl(var(--telemetry))]"
                        : "bg-brand",
                      // Weight, not hue — status hue is reserved for verdicts.
                      outOfBand ? "opacity-100" : "opacity-70"
                    )}
                    style={{ bottom: y(seconds) }}
                    initial={reduced ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25 }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Distribution. Deliberately unlabelled and recessive — it is a
            shape to be read at a glance, not a second chart competing with
            the first for attention. */}
        <div
          className="relative w-[26px] shrink-0 border-l border-border/60"
          title="Distribution of observed intervals"
          aria-hidden
        >
          {histogram.map((count, slot) => (
            <div
              key={slot}
              className="absolute left-0 bg-foreground/25"
              style={{
                bottom: (slot / BUCKETS) * height,
                height: Math.max(1, height / BUCKETS - 1),
                width: `${(count / peak) * 100}%`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="mono-font text-[8px] tracking-[0.1em] text-muted-foreground">
          ARRIVAL, MEASURED HERE · BAND {CADENCE_NORMAL_MIN_S}–
          {CADENCE_NORMAL_MAX_S}s · MEDIAN {median.toFixed(2)}s
        </span>
        <span className="mono-font text-[8px] tabular-nums text-muted-foreground">
          NOW{" "}
          <span
            className={cn(
              "text-foreground",
              live && "text-[hsl(var(--telemetry))]"
            )}
          >
            {newest.toFixed(2)}s
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * BulletRow — a measured percentage against the threshold it is judged by.
 *
 * A `Meter` answers "how much"; it cannot answer "is that enough", so the
 * reader supplies a threshold from memory and usually supplies the wrong one.
 * The bullet graph carries both: the bar is the measurement, the notch is the
 * threshold, and the bands behind them are the qualitative ranges. Same
 * height as the bar it replaces.
 *
 * Bands are drawn in neutral ink rather than red/amber/green. DESIGN.md
 * spends status hue on verdicts, and "68% of reserve is spendable" is a
 * reading, not an adjudication — the notch already says whether it cleared.
 */
export function BulletRow({
  label,
  value,
  threshold,
  caption,
  tone = "default",
  className,
}: {
  label: string;
  /** 0–100. */
  value: number;
  /** 0–100. The figure this is judged against, when there is one. */
  threshold?: number;
  /** What the measurement is of, when the label alone is ambiguous. */
  caption?: string;
  tone?: "default" | "go" | "hold" | "no-go";
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const pct = Math.max(0, Math.min(100, value));
  const cleared = threshold === undefined || pct >= threshold;

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
        <span className="flex shrink-0 items-baseline gap-1.5">
          <span className="data-font text-[11px] tabular-nums text-foreground">
            {Math.round(pct)}%
          </span>
          {threshold !== undefined && (
            // Word beside the mark: the notch alone would be colour-adjacent
            // encoding, and this has to read in forced-colours too.
            <span className="mono-font text-[8px] tracking-[0.1em] text-muted-foreground">
              {cleared ? "MET" : "SHORT"}
            </span>
          )}
        </span>
      </div>

      <div className="relative h-[7px] w-full">
        {/* Qualitative bands — recessive, three steps of the same ink. */}
        <div className="absolute inset-0 bg-secondary" />
        <div className="absolute inset-y-0 left-0 w-[60%] bg-foreground/[0.06]" />
        <div className="absolute inset-y-0 left-0 w-[30%] bg-foreground/[0.10]" />

        {/* The measurement, thinner than its bands so it reads as a mark on
            them rather than as another band. */}
        <motion.span
          className={cn("absolute left-0 top-[2px] h-[3px]", fill)}
          initial={reduced ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />

        {threshold !== undefined && (
          <span
            className="absolute top-[-1px] h-[9px] w-px bg-foreground"
            style={{ left: `${Math.max(0, Math.min(100, threshold))}%` }}
            title={`Threshold ${threshold}%`}
          />
        )}
      </div>

      {caption && (
        <p className="mt-1 text-[9px] leading-snug text-muted-foreground">{caption}</p>
      )}
    </div>
  );
}

/**
 * StateRow — a fact that is either true or false, drawn as a state.
 *
 * Exists because binary conditions were being rendered as `Meter` bars at 0
 * or 100 percent. A bar carries an implied scale, so a reader sees a
 * measurement with a value somewhere on a continuum; "is the stream
 * connected" has no such continuum, and 100% enforcement is not a coverage
 * figure anyone computed. Drawing it as a bar claims a precision that was
 * never measured, which is the one thing this product is sold on not doing.
 */
export function StateRow({
  label,
  active,
  activeLabel = "ACTIVE",
  inactiveLabel = "INACTIVE",
  detail,
  className,
}: {
  label: string;
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
  /** Why it is in this state, when that is not obvious from the label. */
  detail?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="stencil min-w-0 truncate text-[8px] tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {/* Glyph plus word: never colour alone. */}
          <span
            aria-hidden
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              active ? "bg-go" : "bg-no-go"
            )}
          />
          <span className="mono-font text-[9px] tracking-[0.1em] text-foreground">
            {active ? activeLabel : inactiveLabel}
          </span>
        </span>
      </div>
      {detail && (
        <p className="mt-1 text-[9px] leading-snug text-muted-foreground">{detail}</p>
      )}
    </div>
  );
}
