import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Brand pattern — board section 07.
 *
 * Four garden elements: raked stones, a gravel dot grid, a leaf spray
 * and raked sand. They replaced the brand board's orbital geometry when
 * the mark became the lotus; the exported names are unchanged so every
 * scene that placed an orbit now places the garden.
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

/**
 * Raked stones — the karesansui figure. Two stones, each with the sand
 * raked in rings around it, the smaller set of rings stopping where it
 * meets the larger, as a gardener's rake would. Kept under the old name
 * so every scene that placed an orbital system now places the garden.
 */
export function OrbitalSystem({ className, opacity = 0.07, size = 240 }: PatternProps) {
  const uid = useId().replace(/:/g, "");
  const clip = `nsh-rake-${uid}`;
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
      <defs>
        {/* The small stone's rings are cut where the large stone's outer ring runs. */}
        <clipPath id={clip}>
          <path d="M0 0H240V240H0Z M216 120A96 96 0 1 0 24 120A96 96 0 1 0 216 120Z" clipRule="evenodd" />
        </clipPath>
      </defs>
      <g stroke="currentColor" strokeWidth="0.7" fill="none">
        {[30, 46, 62, 78, 96].map((r) => (
          <circle key={r} cx="120" cy="120" r={r} />
        ))}
        <g clipPath={`url(#${clip})`}>
          {[14, 24, 34, 44].map((r) => (
            <circle key={r} cx="206" cy="206" r={r} />
          ))}
        </g>
      </g>
      <path
        d="M104 110c4-11 20-15 30-9 9 5 11 16 5 24-7 9-24 11-33 4-5-4-5-12-2-19Z"
        fill="currentColor"
      />
      <path d="M199 202c2-5 9-7 13-4 4 2 4 8 1 11-3 4-10 4-13 1-2-2-2-5-1-8Z" fill="currentColor" />
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
 * A leaf spray — one curved stem with leaves along it, the garden's
 * answer to the tilted orbit it replaces (same name, same corner
 * placements, same diagonal sweep).
 */
export function EllipseOrbit({ className, opacity = 0.12, size = 200 }: PatternProps) {
  // Leaves: [x, y, angle, length] along the stem.
  const leaves: [number, number, number, number][] = [
    [58, 146, -62, 30],
    [80, 118, 28, 34],
    [102, 92, -58, 36],
    [126, 68, 32, 32],
    [148, 48, -54, 26],
  ];
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
      <path d="M28 184C60 140 110 80 172 26" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      {leaves.map(([x, y, a, l], i) => (
        <path
          key={i}
          transform={`translate(${x} ${y}) rotate(${a})`}
          d={`M0 0C${l * 0.3} ${-l * 0.28} ${l * 0.75} ${-l * 0.26} ${l} 0C${l * 0.75} ${l * 0.26} ${l * 0.3} ${l * 0.28} 0 0Z`}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

/** Raked sand — parallel lines with one slow swell, as a rake leaves them. */
export function DiagonalHatch({ className, opacity = 0.09, size = 200 }: PatternProps) {
  const rows = Array.from({ length: 11 }, (_, i) => 18 + i * 16);
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
        {rows.map((y) => (
          <path key={y} d={`M4 ${y}C54 ${y - 7} 96 ${y + 7} 146 ${y}S186 ${y - 4} 196 ${y}`} />
        ))}
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

/**
 * PatternField — two or three plates layered into one background.
 *
 * A single mark in one corner reads as a decal applied to a flat surface.
 * Two plates at opposing corners, at different scales, read as depth: the
 * panel becomes something the data is sitting *on*. Same geometry, same
 * opacity ceiling, no new elements on screen — only an arrangement.
 *
 * Three registers, so scenes of different character are not all wearing the
 * identical backdrop while still coming from one vocabulary:
 *
 *   orbital  — raked stones. Whole-network scenes: sync, domains.
 *   survey   — gravel and raked sand. Measurement scenes: books, issuance, stress.
 *   approach — the leaf spray. Subject scenes, where one account or one
 *              token is being read.
 *
 * Opacity is capped well under the 8% the design system allows, because
 * these sit inside panels that already carry a lit top edge. No z-index is
 * set, deliberately: Panel is positioned but forms no stacking context, so
 * a negative index would drop the field behind the panel's own background
 * and out of sight. At these opacities the overlay is imperceptible, which
 * is the same bargain every PatternMark on the console already makes.
 */
export function PatternField({
  variant = "orbital",
  className,
}: {
  variant?: "orbital" | "survey" | "approach";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 select-none overflow-hidden",
        className
      )}
      aria-hidden
    >
      {variant === "orbital" && (
        <>
          <OrbitalSystem
            size={300}
            opacity={0.06}
            className="absolute -right-16 -top-16 text-foreground"
          />
          <DotGrid
            size={190}
            gap={20}
            opacity={0.05}
            className="absolute -bottom-6 -left-6 text-foreground"
          />
        </>
      )}

      {variant === "survey" && (
        <>
          <DotGrid
            size={240}
            gap={18}
            opacity={0.05}
            className="absolute -right-8 -top-8 text-foreground"
          />
          <DiagonalHatch
            size={210}
            opacity={0.045}
            className="absolute -bottom-10 -left-10 text-foreground"
          />
        </>
      )}

      {variant === "approach" && (
        <>
          <EllipseOrbit
            size={280}
            opacity={0.055}
            className="absolute -right-14 -top-10 text-foreground"
          />
          <DotGrid
            size={170}
            gap={22}
            opacity={0.04}
            className="absolute -bottom-4 -left-4 text-foreground"
          />
        </>
      )}
    </div>
  );
}
