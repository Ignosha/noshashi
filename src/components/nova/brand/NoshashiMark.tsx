import { useId } from "react";
import { cn } from "@/lib/utils";
import { FLOWER, MONOGRAM_N } from "./flower";

export type MarkTone = "mono" | "color" | "flower";

/**
 * NoshashiMark — the NOSHASHI monogram, as on the website: a serif N in a
 * firm ring with one ripple, the letter cut clear of the ripple by a
 * knockout in the ground colour. `mono` and `color` both draw it now (the
 * app follows the site's monochrome). `flower` keeps the owner's flower
 * artwork, which stays the operating-system app icon and tray mark.
 *
 * The flower:
 * `color` is the owner's artwork itself (brand/flower-source.png, cropped
 * square around its core by scripts/gen-brand-raster.mjs into
 * public/brand/flower-mark-128.png). `mono` is the single-colour silhouette
 * traced from it (./flower.ts, from scripts/gen-brand.mjs) for places that
 * must be one flat currentColor: inside a filled button, an error state,
 * the menu-bar template. The cardinal petals are cut out of the diagonals
 * by a mask, so the gaps are transparent on any ground.
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

  if (tone !== "flower") {
    const a = title
      ? ({ role: "img", "aria-labelledby": titleId } as const)
      : ({ "aria-hidden": true, focusable: false } as const);
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} fill="none" className={cn("shrink-0", className)} {...a}>
        {title && <title id={titleId}>{title}</title>}
        <circle cx="16" cy="16" r="14.6" stroke="currentColor" strokeWidth={1.7} />
        <circle cx="16" cy="16" r="10.6" stroke="currentColor" strokeWidth={0.9} opacity={0.5} />
        <path d={MONOGRAM_N} fill="hsl(var(--background))" stroke="hsl(var(--background))" strokeWidth={2.2} strokeLinejoin="round" />
        <path d={MONOGRAM_N} fill="currentColor" />
      </svg>
    );
  }

  if (tone === "flower") {
    return (
      <img
        src={`${import.meta.env.BASE_URL}brand/flower-mark-128.png`}
        width={size}
        height={size}
        alt={title ?? ""}
        aria-hidden={title ? undefined : true}
        draggable={false}
        decoding="async"
        className={cn("shrink-0 select-none object-contain", className)}
      />
    );
  }

  const a11y = title
    ? ({ role: "img", "aria-labelledby": titleId } as const)
    : ({ "aria-hidden": true, focusable: false } as const);

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
    </svg>
  );
}
