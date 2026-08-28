import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

/**
 * Panel — the single surface primitive every scene is built from.
 *
 * An instrument bezel, not a card: hairline border, an uppercase
 * eyebrow rule across the top, and an optional right-hand slot for
 * controls or live state. Keeping every scene on this one component
 * is what makes the console read as a single machine.
 */
export function Panel({
  label,
  right,
  children,
  className,
  bodyClassName,
  corners = false,
  interactive = false,
  nested = false,
  ...props
}: Omit<HTMLMotionProps<"section">, "children"> & {
  /** Uppercase eyebrow. Omit for a bare surface. */
  label?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  bodyClassName?: string;
  /** @deprecated No longer drawn — see the note in the class list. */
  corners?: boolean;
  /** Lift on hover — only for panels that are themselves clickable. */
  interactive?: boolean;
  /**
   * Drop the border and sit on the parent's surface.
   *
   * A panel inside a panel is the card-prison anti-pattern: two nested
   * rectangles say nothing that a rule and some space do not. Use this for
   * any Panel rendered inside another Panel's body — hierarchy then comes
   * from the label and the spacing, not from a second box.
   */
  nested?: boolean;
}) {
  return (
    <motion.section
      whileHover={interactive ? { y: -2 } : undefined}
      transition={SPRING}
      className={cn(
        // No backdrop-blur: it is glassmorphism, it is on this project's
        // banned list, and a blur per panel costs real frames on a screen
        // that renders a dozen of them over live telemetry.
        "panel-lit relative flex flex-col",
        // The board renders panels with a soft corner, not a hard one.
        // overflow-hidden is load-bearing twice over: it clips children to
        // the rounded corner, and it stops a tall body escaping the box and
        // drawing over the panel below it in a flex column.
        nested
          ? "bg-transparent"
          : "overflow-hidden rounded-lg border border-border bg-card",
        // `corners` is retained for call-site compatibility but no longer
        // draws: the tick marks are square and offset -1px, so they hang off
        // a rounded corner, and the brand board's panels carry no such
        // decoration. Crosshairs belong in the background pattern
        // (board section 07), not on the frame of every panel.
        interactive &&
          "cursor-pointer transition-colors duration-200 hover:border-foreground/35 hover:bg-card",
        className
      )}
      {...props}
    >
      {label && (
        <header
          className={cn(
            "flex shrink-0 items-center justify-between gap-2",
            nested
              ? "h-6 border-b border-border/40"
              : "h-9 border-b border-border/70 px-3.5"
          )}
        >
          <span className="stencil truncate text-[9px] tracking-[0.28em] text-muted-foreground">
            {label}
          </span>
          {right && <span className="flex shrink-0 items-center gap-2">{right}</span>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1", nested ? "pt-3" : "p-3.5", bodyClassName)}>
        {children}
      </div>
    </motion.section>
  );
}

/**
 * DataRow — a label/value pair on a hairline baseline.
 * The console's most repeated unit; centralised so spacing never drifts.
 */
export function DataRow({
  label,
  value,
  tone,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: "default" | "go" | "hold" | "no-go" | "muted";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border/40 py-1.5 last:border-0",
        className
      )}
    >
      <span className="stencil shrink-0 text-[8px] tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "data-font truncate text-[11px] tabular-nums",
          tone === "go" && "text-go",
          tone === "hold" && "text-hold",
          tone === "no-go" && "text-no-go",
          tone === "muted" && "text-muted-foreground",
          (!tone || tone === "default") && "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Eyebrow used outside a Panel header (section titles inside a body). */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "stencil text-[8px] tracking-[0.26em] text-muted-foreground",
        className
      )}
    >
      {children}
    </p>
  );
}
