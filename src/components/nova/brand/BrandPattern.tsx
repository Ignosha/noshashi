import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Brand pattern — board section 07.
 *
 * Four geometric elements, reproduced from the brand board: a concentric
 * orbital system, a dot grid, a tilted ellipse orbit with nodes, and a
 * diagonal hatch.
 *
 * These are the sanctioned background graphics and they replace the
 * starfield and warp effects that came before. The distinction is not
 * cosmetic: a starfield animates continuously behind live data, competing
 * with it for attention and costing frames forever. These are static
 * geometry at 4–8% opacity — they give a panel somewhere to sit without
 * ever asking to be looked at.
 *
 * Every element is `aria-hidden`, non-interactive, and drawn with
 * `currentColor` so it inherits whatever it is placed on.
 */

type PatternProps = {
  className?: string;
  /** 0–1. Default is deliberately low; these must never compete with data. */
  opacity?: number;
  size?: number;
};

/** Concentric orbital rings with a body at the centre and nodes on the paths. */
export function OrbitalSystem({ className, opacity = 0.07, size = 240 }: PatternProps) {
  return (
    <svg
      viewBox="0 0 240 240"
      width={size}
      height={size}
      fill="none"
      className={cn("pointer-events-none select-none", className)}
      style={{ opacity }}
      aria-hidden
    >
      <g stroke="currentColor" strokeWidth="0.6" fill="none">
        <ellipse cx="120" cy="120" rx="34" ry="46" />
        <ellipse cx="120" cy="120" rx="58" ry="76" />
        <ellipse cx="120" cy="120" rx="80" ry="102" />
        <ellipse cx="120" cy="120" rx="100" ry="126" transform="rotate(-14 120 120)" />
      </g>
      <circle cx="120" cy="120" r="7" fill="currentColor" />
      {/* Bodies on the paths — asymmetric, as on the board. */}
      <circle cx="120" cy="74" r="3" fill="currentColor" />
      <circle cx="120" cy="178" r="2.6" fill="currentColor" />
      <circle cx="62" cy="120" r="2" fill="currentColor" />
      <circle cx="178" cy="120" r="2" fill="currentColor" />
      <circle cx="120" cy="18" r="2.2" fill="currentColor" />
    </svg>
  );
}

/** Regular dot grid. */
export function DotGrid({
  className,
  opacity = 0.1,
  size = 200,
  gap = 22,
}: PatternProps & { gap?: number }) {
  const uid = useId().replace(/:/g, "");
  const id = `nsh-dots-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      className={cn("pointer-events-none select-none", className)}
      style={{ opacity }}
      aria-hidden
    >
      <defs>
        <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse">
          <circle cx="1.2" cy="1.2" r="1.2" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/**
 * A single tilted orbit — two arcs meeting at a apex and a perigee, with a
 * body on the path. The board's most distinctive element, and the one that
 * echoes the mark's own arcs.
 */
export function EllipseOrbit({ className, opacity = 0.12, size = 200 }: PatternProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      fill="none"
      className={cn("pointer-events-none select-none", className)}
      style={{ opacity }}
      aria-hidden
    >
      <g stroke="currentColor" strokeWidth="0.7" fill="none">
        <path d="M28 176 C34 96 86 30 168 24" />
        <path d="M168 24 C162 104 110 170 28 176" />
      </g>
      <circle cx="168" cy="24" r="4" fill="currentColor" />
      <circle cx="120" cy="108" r="6.5" fill="currentColor" />
      <circle cx="28" cy="176" r="2.6" fill="currentColor" />
    </svg>
  );
}

/** Diagonal hatch, lines of uneven length as on the board. */
export function DiagonalHatch({ className, opacity = 0.09, size = 200 }: PatternProps) {
  // Deterministic lengths — a random pattern would reflow on every render.
  const lines = [0.62, 0.78, 0.9, 1, 1, 0.94, 0.82, 0.7, 0.56, 0.42];
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      fill="none"
      className={cn("pointer-events-none select-none", className)}
      style={{ opacity }}
      aria-hidden
    >
      <g stroke="currentColor" strokeWidth="0.8" strokeLinecap="round">
        {lines.map((len, i) => {
          const x = 8 + i * 20;
          const span = 150 * len;
          return <line key={i} x1={x} y1={192} x2={x + span} y2={192 - span} />;
        })}
      </g>
    </svg>
  );
}

/**
 * Convenience wrapper: places one element as a decorative corner mark.
 *
 * Positioned absolutely and clipped by the parent, so it bleeds off the
 * edge rather than sitting in the layout like a picture.
 */
export function PatternMark({
  element = "orbit",
  className,
  opacity,
  size = 260,
}: {
  element?: "orbital" | "orbit" | "dots" | "hatch";
  className?: string;
  opacity?: number;
  size?: number;
}) {
  const common = { opacity, size, className: "text-foreground" };
  return (
    <div className={cn("pointer-events-none absolute select-none", className)} aria-hidden>
      {element === "orbital" && <OrbitalSystem {...common} />}
      {element === "orbit" && <EllipseOrbit {...common} />}
      {element === "dots" && <DotGrid {...common} />}
      {element === "hatch" && <DiagonalHatch {...common} />}
    </div>
  );
}
