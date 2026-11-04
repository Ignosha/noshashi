import { cn } from "@/lib/utils";

export type MarkTone = "mono" | "color";

/**
 * The owner's circular seal, drawn from the original outlined vector.
 * The graphite circle is part of the emblem; outside it is transparent.
 * Both legacy tone options retain the same neutral identity. The native
 * menu-bar template has its own simplified N for small-size legibility.
 */
export function NoshashiMark({
  size = 20,
  title,
  className,
}: {
  size?: number;
  tone?: MarkTone;
  /** Kept for existing call-site compatibility. */
  compact?: boolean;
  /** Accessible name. Omit for decorative use beside a visible wordmark. */
  title?: string;
  className?: string;
}) {
  return (
    <img
        src={`${import.meta.env.BASE_URL}brand/desktop-emblem.svg`}
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
