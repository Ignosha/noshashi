import { useId } from "react";
import { cn } from "@/lib/utils";
import { FLOWER } from "./flower";

export type MarkTone = "mono" | "color";

/**
 * NoshashiMark — the flower.
 *
 * Geometry comes from ./flower.ts, which scripts/gen-brand.mjs traces from
 * the owner's artwork (brand/flower-source.png) and writes alongside the
 * site favicon and header mark, so the console cannot drift from the brand.
 *
 * `color` is the artwork's look: translucent petals, lime edges and veins,
 * a white-hot core. `mono` is one flat currentColor, the cardinal petals
 * cut out of the diagonals by a mask so the gaps are genuinely transparent
 * on any ground.
 */
export function NoshashiMark({
  size = 20,
  tone = "mono",
  title,
  className,
}: {
  size?: number;
  tone?: MarkTone;
  /** Kept for call-site compatibility; the flower needs no small-size variant. */
  compact?: boolean;
  /** Accessible name. Omit for decorative use beside a visible wordmark. */
  title?: string;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const titleId = `nsh-title-${uid}`;
  const a11y = title
    ? ({ role: "img", "aria-labelledby": titleId } as const)
    : ({ "aria-hidden": true, focusable: false } as const);
  const petals = [...FLOWER.diagonal, ...FLOWER.cardinal, ...FLOWER.inner];

  return (
    <svg
      viewBox={FLOWER.viewBox}
      width={size}
      height={size}
      fill="none"
      className={cn("shrink-0", className)}
      {...a11y}
    >
      {title && <title id={titleId}>{title}</title>}
      {tone === "color" ? (
        <>
          <defs>
            <radialGradient id={`${uid}-p`} gradientUnits="userSpaceOnUse" cx="50" cy="50" r="50">
              <stop offset="0" stopColor="#EAFFA0" stopOpacity=".95" />
              <stop offset=".14" stopColor="#8EDD4A" stopOpacity=".62" />
              <stop offset=".4" stopColor="#2A7F32" stopOpacity=".42" />
              <stop offset="1" stopColor="#0A3316" stopOpacity=".62" />
            </radialGradient>
            <radialGradient id={`${uid}-c`} gradientUnits="userSpaceOnUse" cx="50" cy="50" r="13">
              <stop offset="0" stopColor="#fff" />
              <stop offset=".18" stopColor="#F4FFB8" />
              <stop offset=".5" stopColor="#A9F152" stopOpacity=".55" />
              <stop offset="1" stopColor="#7BD83A" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g fill={`url(#${uid}-p)`} stroke="#8FE34E" strokeWidth=".55" strokeLinejoin="round">
            {petals.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          <g stroke="#C6F77E" strokeWidth=".35" strokeOpacity=".85">
            {FLOWER.veins.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          <circle cx="50" cy="50" r="13" fill={`url(#${uid}-c)`} />
        </>
      ) : (
        <>
          <defs>
            <mask id={`${uid}-m`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
              {FLOWER.diagonal.map((d, i) => (
                <path key={`d${i}`} d={d} fill="#fff" />
              ))}
              {FLOWER.cardinal.flatMap((d, i) => [
                <path key={`g${i}`} d={d} fill="#000" stroke="#000" strokeWidth={4.8} strokeLinejoin="round" />,
                <path key={`c${i}`} d={d} fill="#fff" />,
              ])}
              {FLOWER.veins.map((d, i) => (
                <path key={`v${i}`} d={d} stroke="#000" strokeWidth={1.6} />
              ))}
              <circle cx="50" cy="50" r="6.5" fill="#fff" />
            </mask>
          </defs>
          <rect width="100" height="100" fill="currentColor" mask={`url(#${uid}-m)`} />
        </>
      )}
    </svg>
  );
}
