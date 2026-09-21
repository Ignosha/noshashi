import { freshnessOf, FRESHNESS_LABEL, type Freshness } from "@/lib/live";
import { cn } from "@/lib/utils";

const TONE: Record<Freshness, string> = {
  live: "text-go",
  recent: "text-go/80",
  cached: "text-muted-foreground",
  delayed: "text-hold",
  stale: "text-no-go",
  unavailable: "text-muted-foreground",
};

export function FreshnessBadge({
  lastRunAt,
  intervalMs,
  paused,
  failed,
  className,
}: {
  lastRunAt: number | null;
  intervalMs: number;
  paused?: boolean;
  failed?: boolean;
  className?: string;
}) {
  const freshness = freshnessOf({ lastRunAt, intervalMs, paused, failed });
  return (
    <span
      className={cn(
        "mono-font inline-flex items-center gap-1.5 text-[9px] tracking-[0.14em]",
        TONE[freshness],
        className
      )}
      aria-label={`Data freshness: ${FRESHNESS_LABEL[freshness]}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {FRESHNESS_LABEL[freshness]}
    </span>
  );
}
