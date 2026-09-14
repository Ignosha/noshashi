import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Interval refresh for scenes that read mainnet.
 *
 * Every scene in this product reads validated ledger state once, on mount,
 * and then shows that reading until someone presses a button. For most of
 * them that was defensible — an adjudication is about a moment, and the
 * receipt names it. It is not defensible for the scenes an operator leaves
 * open and watches: LEDGER SYNC, the book, the AMM pool. There, a figure
 * from forty minutes ago rendered in the same type as a figure from four
 * seconds ago is the product making exactly the claim it exists to argue
 * against.
 *
 * So this does not simply call setInterval. Three things matter:
 *
 *  - **A hidden window reads nothing.** A backgrounded desk still holding
 *    twelve scenes open would otherwise poll four public nodes forever, for
 *    nobody. Polling resumes on the next visibility change, with an
 *    immediate read so the operator is never shown a stale figure on
 *    returning to the window.
 *  - **Runs never overlap.** A read slower than the interval would
 *    otherwise stack requests until the node refuses them, and the failure
 *    would look like the node being down rather than us flooding it.
 *  - **Staleness is reported, not hidden.** `lastRunAt` exists so a scene
 *    can say how old its reading is. DESIGN.md reserves --telemetry for a
 *    value updating right now; a scene that is paused or failing must be
 *    able to stop claiming liveness, and it cannot do that without knowing.
 *
 * Deliberately not a data-fetching library. It owns scheduling and nothing
 * else — the scene keeps its own state, its own errors and its own idiom.
 */

export type LiveRefreshOptions = {
  /** Milliseconds between reads. Ignored while paused. */
  intervalMs: number;
  /**
   * Master switch. False stops scheduling entirely and reports paused, for
   * a scene behind an entitlement or a user setting.
   */
  enabled?: boolean;
  /** Read once immediately on mount. Default true. */
  runOnMount?: boolean;
};

export type LiveRefreshState = {
  /** Epoch ms of the last completed read, successful or not. Null until one finishes. */
  lastRunAt: number | null;
  /** True while a read is in flight. */
  running: boolean;
  /**
   * True when nothing is scheduled — disabled, window hidden, or offline.
   * A scene showing a cyan "live" treatment must drop it when this is true.
   */
  paused: boolean;
  /** Force a read now. Resets the interval. No-op while one is in flight. */
  refresh: () => Promise<void>;
};

function isHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function useLiveRefresh(
  read: () => Promise<void> | void,
  { intervalMs, enabled = true, runOnMount = true }: LiveRefreshOptions
): LiveRefreshState {
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(() => !enabled || isHidden() || isOffline());

  // The caller's function is re-created on most renders. Holding it in a ref
  // means the interval is scheduled from `intervalMs` and `enabled` alone —
  // otherwise every parent render would tear down and restart the timer, and
  // a read would land either far too often or, with an unlucky render
  // cadence, never.
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  }, [read]);

  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (mounted.current) setRunning(true);
    try {
      await readRef.current();
    } catch {
      // The scene owns error display. Swallowing here keeps one failed read
      // from killing the schedule — a node refusing once must not stop the
      // next attempt, or a transient failure becomes a permanent freeze.
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setRunning(false);
        setLastRunAt(Date.now());
      }
    }
  }, []);

  // Track why we might be paused. Listening to both events rather than
  // polling a flag: the window can be hidden for hours and we want the
  // resume to be immediate, not to wait out an interval.
  useEffect(() => {
    const sync = () => {
      const next = !enabled || isHidden() || isOffline();
      setPaused(next);
      // Coming back from hidden or offline, read at once. Waiting a full
      // interval would show the operator a figure that is provably stale
      // during precisely the seconds they are looking at it.
      if (!next && !isHidden()) void refresh();
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", sync);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", sync);
      window.addEventListener("offline", sync);
    }
    setPaused(!enabled || isHidden() || isOffline());

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", sync);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", sync);
        window.removeEventListener("offline", sync);
      }
    };
  }, [enabled, refresh]);

  // Mount read, separate from the schedule so that disabling and re-enabling
  // does not re-trigger it.
  useEffect(() => {
    if (runOnMount && enabled && !isHidden()) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (paused || intervalMs <= 0) return;
    const id = window.setInterval(() => {
      if (isHidden() || isOffline()) return;
      void refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [paused, intervalMs, refresh]);

  return { lastRunAt, running, paused, refresh };
}

/**
 * How old a reading is, in words, for a caption beside it.
 *
 * Returns null when there is nothing to describe yet, so a caller renders
 * nothing rather than "never" — an empty slot is honest, and a scene that
 * has not read yet is already saying so somewhere else.
 */
export function stalenessLabel(lastRunAt: number | null, now = Date.now()): string | null {
  if (lastRunAt === null) return null;
  const seconds = Math.max(0, Math.round((now - lastRunAt) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}
