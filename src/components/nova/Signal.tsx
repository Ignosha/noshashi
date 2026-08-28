import { motion } from "framer-motion";
import { StatusDot } from "./StatusDot";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

/**
 * Signal — a detection reported as mission telemetry.
 *
 * The board's register for an alert is not "a coloured box with an
 * exclamation mark". It is a reading: what was detected, how strong, how
 * confident, from what source, at what time. That structure is the point —
 * an operator can act on "ON-CHAIN INFLOW +28.4%, HIGH, 14:32:08 UTC" and
 * cannot act on "Warning!".
 *
 * Every field is optional except the headline, because a signal that has to
 * invent a confidence level to fill a slot is worse than one that admits it
 * does not have one.
 */

export type SignalSeverity = "critical" | "warn" | "info" | "ok";

const TONE: Record<SignalSeverity, { text: string; rule: string; status: "go" | "hold" | "no-go" }> = {
  critical: { text: "text-no-go", rule: "border-l-no-go", status: "no-go" },
  warn: { text: "text-hold", rule: "border-l-hold", status: "hold" },
  info: { text: "text-telemetry", rule: "border-l-telemetry", status: "go" },
  ok: { text: "text-go", rule: "border-l-go", status: "go" },
};

export function Signal({
  severity = "info",
  kicker = "SIGNAL DETECTED",
  headline,
  children,
  detail,
  action,
  magnitude,
  confidence,
  source,
  at,
  acknowledged,
  onAcknowledge,
  className,
}: {
  severity?: SignalSeverity;
  /** Overrides the default banner. Use the verdict where there is one. */
  kicker?: string;
  headline: string;
  /** Extra readings rendered under the detail — depth, spread, slippage. */
  children?: React.ReactNode;
  detail?: string;
  /** The reading itself — "+28.4%", "3,412 XRP", "2 blocking". */
  magnitude?: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  /** Where it came from. Provenance is not optional in this product. */
  source?: string;
  /** ISO timestamp. Rendered as UTC, because a log with local times is useless. */
  at?: string;
  detailClassName?: string;
  action?: string;
  acknowledged?: boolean;
  onAcknowledge?: () => void;
  className?: string;
}) {
  const tone = TONE[severity];
  const stamp = at
    ? new Date(at).toISOString().slice(11, 19) + " UTC"
    : undefined;

  return (
    <motion.article
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: acknowledged ? 0.45 : 1, x: 0 }}
      transition={SPRING}
      className={cn("inset-row border-l-2 px-3.5 py-3", tone.rule, className)}
    >
      <header className="flex flex-wrap items-center gap-2">
        <StatusDot status={tone.status} size={6} pulse={severity === "critical"} />
        <span className={cn("stencil text-[8.5px] tracking-[0.24em]", tone.text)}>
          {kicker}
        </span>
        {stamp && (
          <span className="ml-auto font-mono text-[9px] tabular-nums text-faint">
            {stamp}
          </span>
        )}
      </header>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className={cn("text-[12.5px] font-medium", tone.text)}>{headline}</h3>
        {magnitude && (
          <span className="data-font text-[15px] font-[600] tabular-nums text-foreground">
            {magnitude}
          </span>
        )}
      </div>

      {detail && (
        <p className="mt-1.5 max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
          {detail}
        </p>
      )}

      {action && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-telemetry">{action}</p>
      )}

      {children}

      {(confidence || source) && (
        <dl className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 border-t border-border/50 pt-2 font-mono text-[9px] tracking-[0.14em] text-faint">
          {confidence && (
            <div className="flex gap-1.5">
              <dt>CONFIDENCE</dt>
              <dd className="text-muted-foreground">{confidence}</dd>
            </div>
          )}
          {source && (
            <div className="flex gap-1.5">
              <dt>SOURCE</dt>
              <dd className="text-muted-foreground">{source}</dd>
            </div>
          )}
          {onAcknowledge && !acknowledged && (
            <button
              onClick={onAcknowledge}
              className="ml-auto tracking-[0.18em] text-faint transition-colors hover:text-foreground"
            >
              ACK
            </button>
          )}
        </dl>
      )}
    </motion.article>
  );
}
