import { NoshashiMark } from "./NoshashiMark";
import { cn } from "@/lib/utils";

/**
 * Lockups.
 *
 * The supplied wordmark SVG baked a #05070A <rect> behind the text and set
 * the type as a `font-family` declaration rather than outlines, so it fell
 * back to Arial anywhere Space Grotesk was absent and could not sit on any
 * surface but its own. Both lockups are therefore composed here in the DOM:
 * the type is real text in the app's own bundled face, it inherits the
 * surface it is placed on, and it stays selectable and screen-readable.
 */

export function NoshashiWordmark({
  size = 18,
  tagline,
  className,
}: {
  size?: number;
  /** Optional descender. Omit in dense chrome. */
  tagline?: string;
  className?: string;
}) {
  return (
    <span className={cn("flex flex-col justify-center leading-none", className)}>
      <span
        className="font-display font-semibold text-text-primary"
        style={{ fontSize: size, letterSpacing: "0.18em" }}
      >
        NOSHASHI
      </span>
      {tagline && (
        <span
          className="mt-1 font-mono text-text-muted"
          style={{ fontSize: Math.max(8, size * 0.42), letterSpacing: "0.22em" }}
        >
          {tagline}
        </span>
      )}
    </span>
  );
}

export function NoshashiLogo({
  size = 22,
  tone = "mono",
  tagline,
  orientation = "horizontal",
  className,
}: {
  size?: number;
  tone?: "mono" | "color";
  tagline?: string;
  orientation?: "horizontal" | "stacked";
  className?: string;
}) {
  // One accessible name for the lockup as a whole; the mark inside is then
  // decorative, so a screen reader announces "NOSHASHI" once, not twice.
  return (
    <span
      className={cn(
        "flex text-text-primary",
        orientation === "horizontal"
          ? "flex-row items-center gap-2.5"
          : "flex-col items-center gap-3",
        className
      )}
      role="img"
      aria-label={tagline ? `NOSHASHI — ${tagline}` : "NOSHASHI"}
    >
      <NoshashiMark size={size} tone={tone} />
      <NoshashiWordmark size={size * 0.8} tagline={tagline} />
    </span>
  );
}
