import { useId } from "react";
import { cn } from "@/lib/utils";
import {
  BODY,
  FIN_LOWER,
  FIN_UPPER,
  NODE,
  NOSE_DOT,
  ORBIT_LOWER,
  ORBIT_UPPER,
  PLUME_FAR,
  PLUME_NEAR,
  PORTHOLE,
  VIEWBOX,
  VIEWBOX_COMPACT,
  COMPACT_THRESHOLD,
} from "./geometry";

export type MarkTone = "mono" | "color";

/**
 * NoshashiMark — the rocket, alone.
 *
 * `mono` inherits `currentColor` and cuts the porthole and nose dot out of
 * the body, so it survives on any ground: rail, dialog, light mode, a
 * printed export, a macOS template image. This is the default because an
 * interface mark that only works on one background is not a mark.
 *
 * `color` reproduces the supplied gradient treatment for surfaces where the
 * brand should be at full strength — preloader, about, onboarding. It is
 * built for dark grounds and shades the porthole rather than cutting it.
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
   * Drop the orbital arcs and crop to the rocket. Defaults to automatic:
   * engaged below 24px, where the arcs render sub-pixel.
   */
  compact?: boolean;
  /** Accessible name. Omit for decorative use beside a visible wordmark. */
  title?: string;
  className?: string;
}) {
  // Namespaced so two marks on one page cannot cross-contaminate gradients.
  const uid = useId().replace(/:/g, "");
  const tight = compact ?? size < COMPACT_THRESHOLD;
  const viewBox = tight ? VIEWBOX_COMPACT : VIEWBOX;
  const blue = `nsh-blue-${uid}`;
  const metal = `nsh-metal-${uid}`;
  const cut = `nsh-cut-${uid}`;
  const titleId = `nsh-title-${uid}`;

  const a11y = title
    ? ({ role: "img", "aria-labelledby": titleId } as const)
    : ({ "aria-hidden": true, focusable: false } as const);

  if (tone === "mono") {
    return (
      <svg
        viewBox={viewBox}
        width={size}
        height={size}
        fill="none"
        className={cn("shrink-0", className)}
        {...a11y}
      >
        {title && <title id={titleId}>{title}</title>}
        <defs>
          {/*
            Scoped to the body: white keeps, black cuts. The porthole
            overhangs the body's lower-left edge, so a mask is the only
            treatment that hides the overhang without editing the artwork —
            evenodd would fill it instead.
          */}
          <mask id={cut} maskUnits="userSpaceOnUse" x="0" y="0" width="180" height="180">
            <path d={BODY} fill="#fff" />
            <path d={PORTHOLE} fill="#000" />
            <circle cx={NOSE_DOT.cx} cy={NOSE_DOT.cy} r={NOSE_DOT.r} fill="#000" />
          </mask>
        </defs>
        {!tight && (
          <>
            <g stroke="currentColor" strokeWidth={7} strokeLinecap="round" fill="none">
              <path d={ORBIT_UPPER} />
              <path d={ORBIT_LOWER} />
            </g>
            <circle cx={NODE.cx} cy={NODE.cy} r={NODE.r} fill="currentColor" />
          </>
        )}
        <path d={BODY} fill="currentColor" mask={`url(#${cut})`} />
        <path d={FIN_UPPER} fill="currentColor" />
        <path d={FIN_LOWER} fill="currentColor" />
        <path d={PLUME_NEAR} fill="currentColor" />
        <path d={PLUME_FAR} fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={size}
      fill="none"
      className={cn("shrink-0", className)}
      {...a11y}
    >
      {title && <title id={titleId}>{title}</title>}
      <defs>
        <linearGradient id={blue} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#0077FF" />
          <stop offset="55%" stopColor="#00C8FF" />
          <stop offset="100%" stopColor="#EAF7FF" />
        </linearGradient>
        <linearGradient id={metal} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#8D9AAA" />
          <stop offset="45%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#BFC9D5" />
        </linearGradient>
      </defs>
      {!tight && (
        <>
          <g stroke={`url(#${blue})`} strokeWidth={7} strokeLinecap="round" fill="none">
            <path d={ORBIT_UPPER} />
            <path d={ORBIT_LOWER} />
          </g>
          <circle cx={NODE.cx} cy={NODE.cy} r={NODE.r} fill="#00C8FF" />
        </>
      )}
      <path d={BODY} fill={`url(#${metal})`} />
      <path d={PORTHOLE} fill="#0B1017" />
      <path d={FIN_UPPER} fill="#DCE5EE" />
      <path d={FIN_LOWER} fill="#B7C3CF" />
      <path d={PLUME_NEAR} fill="#00C8FF" />
      <path d={PLUME_FAR} fill="#0077FF" />
      <circle cx={NOSE_DOT.cx} cy={NOSE_DOT.cy} r={NOSE_DOT.r} fill="#05070A" />
    </svg>
  );
}
