import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * SkipLink — the first thing in the tab order. Keyboard and screen
 * reader users get past the navigation rail in one keystroke instead of
 * ten. Visually hidden until focused.
 */
export function SkipLink({ targetId = "main-content" }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className={cn(
        "absolute left-3 top-3 z-[200] -translate-y-24 border border-foreground",
        "bg-background px-3 py-2 text-[11px] tracking-wider text-foreground",
        "transition-transform focus-visible:translate-y-0"
      )}
    >
      Skip to main content
    </a>
  );
}

/**
 * Announcer — a polite live region.
 *
 * Live-updating panels (ledger stream, gate verdicts, link state) are
 * silent to assistive technology unless something announces them. This
 * is that something; it throttles so a fast ledger cannot flood a screen
 * reader with speech.
 */
export function Announcer({
  message,
  assertive = false,
  throttleMs = 4000,
}: {
  message: string;
  /** Reserve assertive for verdicts and failures, never for telemetry. */
  assertive?: boolean;
  throttleMs?: number;
}) {
  const [announced, setAnnounced] = useState("");
  const lastRef = useRef(0);

  useEffect(() => {
    if (!message) return;
    const now = Date.now();
    const wait = Math.max(0, throttleMs - (now - lastRef.current));
    const timer = window.setTimeout(() => {
      lastRef.current = Date.now();
      setAnnounced(message);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [message, throttleMs]);

  return (
    <div
      role="status"
      aria-live={assertive ? "assertive" : "polite"}
      aria-atomic="true"
      className="sr-only"
    >
      {announced}
    </div>
  );
}
