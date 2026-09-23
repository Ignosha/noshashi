import { useEffect, useState } from "react";
import { StatusDot } from "./StatusDot";
import { Kbd } from "./Kbd";
import { cn } from "@/lib/utils";
import { formatClock, timeAgo } from "@/lib/format";
import { copyrightLine } from "@/lib/brand";
import { shortAddress } from "@/lib/xrpl/client";
import type { LiveEvent } from "@/lib/xrpl/useXRPL";
import type { Status } from "@/lib/xrpl/types";
import { useGoverningPolicy } from "@/lib/org/useOrg";

/**
 * StatusRail — the always-on footer.
 *
 * Mission control never hides its own health, so link state, the
 * validated ledger, and the live transaction feed stay pinned to the
 * bottom of every scene. The ticker is a real feed, not decoration.
 */
export function StatusRail({
  status,
  statusLabel,
  ledgerIndex,
  latencyMs,
  events,
  onOpenPalette,
  onOpenLegal,
}: {
  status: Status;
  statusLabel: string;
  ledgerIndex?: number;
  latencyMs?: number;
  events: LiveEvent[];
  onOpenPalette: () => void;
  onOpenLegal?: () => void;
}) {
  const [clock, setClock] = useState(() => formatClock());

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const ticker = events.slice(0, 14);

  return (
    <footer className="relative z-20 flex h-7 shrink-0 items-center gap-3 border-t border-border bg-background/95 px-3 backdrop-blur">
      <span className="flex shrink-0 items-center gap-1.5">
        <StatusDot status={status} size={6} pulse={status === "go"} />
        <span
          className={cn(
            "stencil text-[8px] tracking-[0.2em]",
            status === "go" && "text-go",
            status === "hold" && "text-hold",
            status === "no-go" && "text-no-go"
          )}
        >
          {statusLabel}
        </span>
      </span>

      <span className="h-3 w-px shrink-0 bg-border" />

      <span className="mono-font shrink-0 text-[9px] tabular-nums text-muted-foreground">
        LGR {ledgerIndex ? ledgerIndex.toLocaleString() : "———"}
      </span>

      {typeof latencyMs === "number" && (
        <span className="mono-font shrink-0 text-[9px] tabular-nums text-muted-foreground">
          {latencyMs}ms
        </span>
      )}

      <span className="h-3 w-px shrink-0 bg-border" />

      <PolicyIndicator />

      <span className="h-3 w-px shrink-0 bg-border" />

      <span className="stencil flex shrink-0 items-center gap-1 text-[8px] tracking-[0.2em] text-muted-foreground" title="The AI agent explains verdicts; it never issues, changes or overrides them.">
        AI <span className="text-foreground/80">ADVISORY</span>
      </span>

      <span className="h-3 w-px shrink-0 bg-border" />

      {/* Live ticker — duplicated once so the marquee wraps seamlessly */}
      <div className="relative min-w-0 flex-1 overflow-hidden">
        {ticker.length === 0 ? (
          <span className="mono-font text-[9px] text-muted-foreground/70">
            AWAITING VALIDATED TRANSACTIONS…
          </span>
        ) : (
          <div className="marquee-track flex w-max items-center gap-6">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center gap-6" aria-hidden={copy === 1}>
                {ticker.map((event) => (
                  <span
                    key={`${copy}-${event.id}`}
                    className="mono-font flex shrink-0 items-center gap-1.5 text-[9px] tabular-nums"
                  >
                    <span
                      className={cn(
                        "h-1 w-1",
                        event.result === "tesSUCCESS" ? "bg-go" : "bg-no-go"
                      )}
                    />
                    <span className="text-foreground/70">{event.type}</span>
                    <span className="text-muted-foreground">
                      {shortAddress(event.account)}
                    </span>
                    <span className="text-muted-foreground/60">
                      {timeAgo(event.at)}
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onOpenPalette}
        className="flex shrink-0 items-center gap-1.5 text-[9px] text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Open command palette"
      >
        <Kbd keys="mod+k" />
      </button>

      <span className="h-3 w-px shrink-0 bg-border" />

      {onOpenLegal && (
        <button
          onClick={onOpenLegal}
          className="mono-font shrink-0 text-[9px] text-muted-foreground/70 underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          {copyrightLine()}
        </button>
      )}

      <span className="h-3 w-px shrink-0 bg-border" />

      <span className="mono-font shrink-0 text-[9px] tabular-nums text-muted-foreground">
        {clock}
      </span>
    </footer>
  );
}

/** The policy every new verdict will use, always visible. */
function PolicyIndicator() {
  const { state, active, source, organizationName } = useGoverningPolicy();
  const label =
    state.status === "loading"
      ? "LOADING"
      : state.status === "unavailable"
        ? "UNAVAILABLE"
        : active
          ? `${active.name.toUpperCase()} v${active.version}`
          : "NONE ACTIVE";
  const tone = state.status === "unavailable" ? "no-go" : active ? "go" : "hold";
  return (
    <span
      className="flex min-w-0 shrink items-center gap-1.5"
      title={`${source === "organization" ? `Organization policy · ${organizationName ?? ""}` : "Workstation policy"} · ${active ? `SHA-256 ${active.hash}` : state.status === "unavailable" ? state.reason : "no institutional policy is applied to new verdicts"}`}
    >
      <span className="stencil shrink-0 text-[8px] tracking-[0.2em] text-muted-foreground">{source === "organization" ? "ORG POLICY" : "POLICY"}</span>
      <span className={cn("mono-font truncate text-[9px]", tone === "go" ? "text-foreground/80" : tone === "no-go" ? "text-no-go" : "text-hold")}>
        {label}
      </span>
      <StatusDot status={tone} size={5} />
    </span>
  );
}
