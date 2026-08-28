import { motion } from "framer-motion";
import { StatusDot } from "@/components/nova/StatusDot";
import { cn } from "@/lib/utils";
import type { Status } from "@/lib/xrpl/types";

/**
 * SceneHeader — the masthead every scene opens with.
 *
 * Numbered like a flight-plan section so the console reads as a
 * sequence of scenes rather than a set of tabs, with a hairline rule
 * that draws itself in on mount.
 *
 * Deliberately compact. This is an instrument, not a marketing page: the
 * masthead repeats on all fifteen scenes, so every pixel it takes is a
 * pixel of data the operator does not see, fifteen times over.
 */
export function SceneHeader({
  index,
  kicker,
  title,
  sub,
  status,
  statusLabel,
  right,
  className,
}: {
  /** Two-digit scene number, e.g. "01". */
  index?: string;
  kicker: string;
  title: string;
  sub?: string;
  status?: Status;
  statusLabel?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("shrink-0", className)}>
      <div className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 items-end gap-3">
          {index && (
            <span className="display shrink-0 text-[20px] font-[700] leading-none text-muted-foreground/25">
              {index}
            </span>
          )}
          <div className="min-w-0">
            <p className="stencil text-[9px] tracking-[0.32em] text-muted-foreground">
              {kicker}
            </p>
            <h1 className="display mt-0.5 truncate text-[18px] font-[700] leading-none text-foreground">
              {title}
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {status && statusLabel && (
            <span className="flex items-center gap-1.5 border border-border bg-card px-2 py-1">
              <StatusDot status={status} size={6} pulse={status === "go"} />
              <span
                className={cn(
                  "stencil text-[9px] tracking-[0.2em]",
                  status === "go" && "text-go",
                  status === "hold" && "text-hold",
                  status === "no-go" && "text-no-go"
                )}
              >
                {statusLabel}
              </span>
            </span>
          )}
          {right}
        </div>
      </div>

      <motion.div
        className="mt-2 h-px origin-left bg-border"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />

      {sub && (
        <p className="mt-1.5 max-w-4xl text-[11px] leading-snug text-muted-foreground">
          {sub}
        </p>
      )}
    </div>
  );
}
