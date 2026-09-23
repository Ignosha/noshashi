import { useId } from "react";
import { cn } from "@/lib/utils";

export type MarkTone = "mono" | "color";

/**
 * NoshashiMark — the bloom, from the website's hero.
 *
 * Uses the same bloom SVG as templates/hero-bloom.svg but simplified
 * for use as a logo mark at small sizes. Inherits currentColor so it
 * works on any ground (rail, dialog, light mode, printed export).
 */
export function NoshashiMark({
  size = 20,
  tone = "mono",
  compact,
  title,
  className,
}: {
  size?: number;
  tone?: MarkTone;
  /**
   * Simplify at small sizes. Defaults to automatic:
   * engaged below 24px.
   */
  compact?: boolean;
  /** Accessible name. Omit for decorative use beside a visible wordmark. */
  title?: string;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const tight = compact ?? size < 24;
  const titleId = `nsh-title-${uid}`;

  const a11y = title
    ? ({ role: "img", "aria-labelledby": titleId } as const)
    : ({ "aria-hidden": true, focusable: false } as const);

  // Simplified bloom paths derived from hero-bloom.svg
  const petalPaths = [
    // Large outer petals
    "M50 95C30 70 20 40 50 10C80 40 70 70 50 95Z",
    "M50 95C35 75 30 50 50 15C70 50 65 75 50 95Z",
    // Medium petals
    "M50 85C38 65 32 40 50 12C68 40 62 65 50 85Z",
    // Small center
    "M50 75C42 58 38 40 50 18C62 40 58 58 50 75Z",
  ];

  const veinPaths = [
    "M50 90V20",
    "M50 50C40 55 35 65 50 90",
    "M50 50C60 55 65 65 50 90",
  ];

  if (tone === "mono") {
    return (
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        fill="none"
        className={cn("shrink-0", className)}
        {...a11y}
      >
        {title && <title id={titleId}>{title}</title>}
        <defs>
          <radialGradient id={`bloom-petal-${uid}`} cx="50%" cy="86%" r="74%">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".44" />
            <stop offset="46%" stopColor="currentColor" stopOpacity=".21" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`bloom-core-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".60" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        {!tight && (
          <g className="hb-filaments" stroke="currentColor" strokeOpacity=".17" strokeWidth="0.5" strokeLinecap="round" fill="none">
            <path d="M20 40 C40 55 60 45 50 30" />
            <path d="M80 45 C65 60 40 70 50 55" />
            <path d="M25 50 C45 65 55 55 45 40" />
            <path d="M75 35 C55 50 45 45 55 30" />
          </g>
        )}
        <g opacity={tight ? 1 : 0.95}>
          {petalPaths.map((d, i) => (
            <g key={i} transform={`rotate(${i * 90}) scale(${1 - i * 0.12})`} opacity={0.55 + i * 0.1}>
              <path d={d} fill={`url(#bloom-petal-${uid})`} stroke="currentColor" strokeOpacity=".30" strokeWidth={tight ? 0.5 : 0.9} />
              {!tight && (
                <>
                  <path d={veinPaths[0]} fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth={0.5} />
                  <path d={veinPaths[1]} fill="none" stroke="currentColor" strokeOpacity=".11" strokeWidth={0.4} />
                  <path d={veinPaths[2]} fill="none" stroke="currentColor" strokeOpacity=".11" strokeWidth={0.4} />
                </>
              )}
            </g>
          ))}
          <ellipse cx="50" cy="50" rx="19" ry="25" fill={`url(#bloom-core-${uid})`} />
          <ellipse cx="50" cy="50" rx="7" ry="10" fill="currentColor" opacity=".30" />
        </g>
      </svg>
    );
  }

  // Color tone - uses the brand green
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      className={cn("shrink-0", className)}
      {...a11y}
    >
      {title && <title id={titleId}>{title}</title>}
      <defs>
        <radialGradient id={`bloom-petal-color-${uid}`} cx="50%" cy="86%" r="74%">
          <stop offset="0%" stopColor="#9BE15D" stopOpacity=".44" />
          <stop offset="46%" stopColor="#9BE15D" stopOpacity=".21" />
          <stop offset="100%" stopColor="#9BE15D" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`bloom-core-color-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#9BE15D" stopOpacity=".60" />
          <stop offset="100%" stopColor="#9BE15D" stopOpacity="0" />
        </radialGradient>
      </defs>
      {!tight && (
        <g className="hb-filaments" stroke="#9BE15D" strokeOpacity=".17" strokeWidth="0.5" strokeLinecap="round" fill="none">
          <path d="M20 40 C40 55 60 45 50 30" />
          <path d="M80 45 C65 60 40 70 50 55" />
          <path d="M25 50 C45 65 55 55 45 40" />
          <path d="M75 35 C55 50 45 45 55 30" />
        </g>
      )}
      <g opacity={tight ? 1 : 0.95}>
        {petalPaths.map((d, i) => (
          <g key={i} transform={`rotate(${i * 90}) scale(${1 - i * 0.12})`} opacity={0.55 + i * 0.1}>
            <path d={d} fill={`url(#bloom-petal-color-${uid})`} stroke="#9BE15D" strokeOpacity=".30" strokeWidth={tight ? 0.5 : 0.9} />
            {!tight && (
              <>
                <path d={veinPaths[0]} fill="none" stroke="#9BE15D" strokeOpacity=".18" strokeWidth={0.5} />
                <path d={veinPaths[1]} fill="none" stroke="#9BE15D" strokeOpacity=".11" strokeWidth={0.4} />
                <path d={veinPaths[2]} fill="none" stroke="#9BE15D" strokeOpacity=".11" strokeWidth={0.4} />
              </>
            )}
          </g>
        ))}
        <ellipse cx="50" cy="50" rx="19" ry="25" fill={`url(#bloom-core-color-${uid})`} />
        <ellipse cx="50" cy="50" rx="7" ry="10" fill="#9BE15D" opacity=".30" />
      </g>
    </svg>
  );
}
