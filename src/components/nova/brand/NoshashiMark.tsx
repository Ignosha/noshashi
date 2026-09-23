import { useId } from "react";
import { cn } from "@/lib/utils";
import { LOTUS } from "./lotus";

export type MarkTone = "mono" | "color";

/**
 * NoshashiMark — the lotus.
 *
 * Geometry comes from ./lotus.ts, which scripts/gen-brand.mjs writes
 * alongside the site favicon, the site header mark and the Tauri icon
 * source, so the console cannot drift from the brand.
 *
 * Front petals are separated from those behind by a cut in a mask rather
 * than by an outline, so the gaps are genuinely transparent: `mono`
 * inherits currentColor and works on any ground; `color` fills the same
 * shape with the brand gradient.
 */
export function NoshashiMark({
  size = 20,
  tone = "mono",
  title,
  className,
}: {
  size?: number;
  tone?: MarkTone;
  /** Kept for call-site compatibility; the lotus needs no small-size variant. */
  compact?: boolean;
  /** Accessible name. Omit for decorative use beside a visible wordmark. */
  title?: string;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const titleId = `nsh-title-${uid}`;
  const maskId = `nsh-lotus-${uid}`;
  const gradId = `nsh-grad-${uid}`;
  const fill = tone === "color" ? `url(#${gradId})` : "currentColor";

  const a11y = title
    ? ({ role: "img", "aria-labelledby": titleId } as const)
    : ({ "aria-hidden": true, focusable: false } as const);

  const cut = (d: string, key: string) => [
    <path key={`${key}-gap`} d={d} fill="#000" stroke="#000" strokeWidth={LOTUS.gap * 2} strokeLinejoin="round" />,
    <path key={`${key}-fill`} d={d} fill="#fff" />,
  ];

  return (
    <svg
      viewBox={LOTUS.viewBox}
      width={size}
      height={size}
      fill="none"
      className={cn("shrink-0", className)}
      {...a11y}
    >
      {title && <title id={titleId}>{title}</title>}
      <defs>
        {tone === "color" && (
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#C8F59A" />
            <stop offset=".55" stopColor="#9BE15D" />
            <stop offset="1" stopColor="#55D98A" />
          </linearGradient>
        )}
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          {LOTUS.back.map((d, i) => (
            <path key={`b${i}`} d={d} fill="#fff" />
          ))}
          {LOTUS.middle.flatMap((d, i) => cut(d, `m${i}`))}
          {LOTUS.front.flatMap((d, i) => cut(d, `f${i}`))}
        </mask>
      </defs>
      <rect width="64" height="64" fill={fill} mask={`url(#${maskId})`} />
      {LOTUS.ripples.map((d, i) => (
        <path key={`r${i}`} d={d} fill={fill} />
      ))}
    </svg>
  );
}
