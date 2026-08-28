import { useCallback, useEffect, useRef, useState } from "react";
import { fetchIssuerPosture } from "@/lib/xrpl/client";
import { sendNativeNotification } from "@/lib/notifications";
import { readSetting, writeSetting } from "@/lib/store";
import type { IssuerPosture } from "@/lib/xrpl/types";

/**
 * Issuer drift monitoring.
 *
 * An issuer's posture is not a static property. lsfGlobalFreeze can be
 * set in a single transaction, and the moment it is, every issued
 * balance behind that issuer stops being spendable. Nothing on the
 * ledger announces this to a holder — the flag simply changes, and the
 * holder finds out when a payment fails.
 *
 * So we take a baseline of every issuer the operator is exposed to and
 * re-read it on an interval. Any transition that changes what the
 * holder can do with their balance raises an alert and a native
 * notification. Transitions are recorded with both the old and the new
 * value, because "frozen" on its own is not actionable — "unfrozen at
 * 09:12, frozen at 14:40" is.
 *
 * Only material transitions are reported. A transfer rate moving by a
 * basis point is noise; a transfer rate appearing where there was none
 * is a cost the operator did not agree to.
 */

const BASELINE_KEY = "engine.watch.baseline";
const ALERTS_KEY = "engine.watch.alerts";
const MAX_ALERTS = 200;

/** Poll cadence. Ledgers close every 3–5s; issuer flags change rarely. */
export const WATCH_INTERVALS = [
  { label: "5 min", ms: 5 * 60_000 },
  { label: "15 min", ms: 15 * 60_000 },
  { label: "1 hour", ms: 60 * 60_000 },
] as const;

export type DriftSeverity = "critical" | "warn" | "info";

export type DriftAlert = {
  id: string;
  at: string;
  issuer: string;
  domain?: string;
  severity: DriftSeverity;
  field: string;
  from: string;
  to: string;
  headline: string;
  detail: string;
  acknowledged?: boolean;
};

type Baseline = Record<string, IssuerPosture>;

/** Compare two postures and describe every material transition. */
export function diffPosture(
  before: IssuerPosture,
  after: IssuerPosture
): Omit<DriftAlert, "id" | "at">[] {
  const out: Omit<DriftAlert, "id" | "at">[] = [];
  const base = { issuer: after.address, domain: after.domain };

  if (!before.globalFreeze && after.globalFreeze) {
    out.push({
      ...base,
      severity: "critical",
      field: "lsfGlobalFreeze",
      from: "clear",
      to: "set",
      headline: "Issuer froze every line",
      detail:
        "This issuer has set lsfGlobalFreeze. Balances issued by it cannot be sent or redeemed until the flag is cleared. Treat the position as immobilised, not as a holding.",
    });
  } else if (before.globalFreeze && !after.globalFreeze) {
    out.push({
      ...base,
      severity: "info",
      field: "lsfGlobalFreeze",
      from: "set",
      to: "clear",
      headline: "Issuer lifted the global freeze",
      detail:
        "lsfGlobalFreeze has been cleared. Balances behind this issuer are transferable again. The freeze remains in the record — the issuer retains the right to set it a second time.",
    });
  }

  // Losing lsfNoFreeze is impossible on-ledger (it is irreversible), so
  // observing it means we were reading a different account or the earlier
  // read was wrong. Either way the operator should know.
  if (before.noFreeze && !after.noFreeze) {
    out.push({
      ...base,
      severity: "critical",
      field: "lsfNoFreeze",
      from: "set",
      to: "clear",
      headline: "Freeze surrender no longer visible",
      detail:
        "lsfNoFreeze is irreversible once set, so it should never disappear. This reading contradicts the baseline. Re-verify the issuer address before relying on either result.",
    });
  } else if (!before.noFreeze && after.noFreeze) {
    out.push({
      ...base,
      severity: "info",
      field: "lsfNoFreeze",
      from: "clear",
      to: "set",
      headline: "Issuer permanently surrendered freeze",
      detail:
        "lsfNoFreeze is now set and cannot be undone. This issuer can no longer freeze individual lines or the whole issuance.",
    });
  }

  if (before.requireAuth !== after.requireAuth) {
    out.push({
      ...base,
      severity: after.requireAuth ? "warn" : "info",
      field: "lsfRequireAuth",
      from: before.requireAuth ? "set" : "clear",
      to: after.requireAuth ? "set" : "clear",
      headline: after.requireAuth
        ? "Issuer now requires authorisation"
        : "Issuer dropped the authorisation requirement",
      detail: after.requireAuth
        ? "New holders must be authorised individually before they can hold this issuance. Existing lines are unaffected, but onboarding now depends on the issuer acting."
        : "Holders no longer need individual authorisation to hold this issuance.",
    });
  }

  if (before.masterDisabled !== after.masterDisabled) {
    out.push({
      ...base,
      severity: "warn",
      field: "lsfDisableMaster",
      from: before.masterDisabled ? "set" : "clear",
      to: after.masterDisabled ? "set" : "clear",
      headline: after.masterDisabled
        ? "Issuer disabled its master key"
        : "Issuer re-enabled its master key",
      detail: after.masterDisabled
        ? "Control of this issuer now rests entirely with a regular key or signer list. That is usually a hardening step, but it changes who can sign."
        : "The master key is active again. Whoever holds it can now sign for this issuer.",
    });
  }

  if (before.transferRateBps !== after.transferRateBps) {
    const worse = after.transferRateBps > before.transferRateBps;
    out.push({
      ...base,
      severity: worse ? "warn" : "info",
      field: "TransferRate",
      from: `${before.transferRateBps} bps`,
      to: `${after.transferRateBps} bps`,
      headline: worse
        ? "Issuer raised its transfer fee"
        : "Issuer lowered its transfer fee",
      detail: `Every transfer of this issuance now costs ${after.transferRateBps} basis points, changed from ${before.transferRateBps}. The fee is charged by the issuer and is not refundable.`,
    });
  }

  return out;
}

function postureLabel(p: IssuerPosture): string {
  if (p.globalFreeze) return "FROZEN";
  if (p.noFreeze) return "FREEZE SURRENDERED";
  return "FREEZE AVAILABLE";
}

export { postureLabel };

export type WatchState = {
  alerts: DriftAlert[];
  baseline: Baseline;
  loaded: boolean;
  running: boolean;
  lastSweep?: string;
  sweeping: boolean;
  error?: string;
};

/**
 * Watch a set of issuers for posture drift.
 *
 * The caller supplies the issuer list — normally every issuer the
 * operator's portfolio is exposed to. Sweeps run on a timer while
 * `running` is true and once immediately when the issuer set changes,
 * so a newly added issuer gets a baseline without waiting an interval.
 */
export function useIssuerWatch(issuers: string[]) {
  const [alerts, setAlerts] = useState<DriftAlert[]>([]);
  const [baseline, setBaseline] = useState<Baseline>({});
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [lastSweep, setLastSweep] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [intervalMs, setIntervalMs] = useState<number>(WATCH_INTERVALS[1].ms);

  // Held in a ref so the sweep closure always sees current state without
  // being re-created — otherwise the interval would restart on every alert.
  const baselineRef = useRef<Baseline>({});
  const issuersRef = useRef<string[]>([]);
  issuersRef.current = issuers;

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [storedAlerts, storedBaseline, storedRunning, storedInterval] =
        await Promise.all([
          readSetting<DriftAlert[]>(ALERTS_KEY, []),
          readSetting<Baseline>(BASELINE_KEY, {}),
          readSetting<boolean>("engine.watch.running", false),
          readSetting<number>("engine.watch.interval", WATCH_INTERVALS[1].ms),
        ]);
      if (!alive) return;
      setAlerts(Array.isArray(storedAlerts) ? storedAlerts : []);
      const b = storedBaseline && typeof storedBaseline === "object" ? storedBaseline : {};
      baselineRef.current = b;
      setBaseline(b);
      setRunning(Boolean(storedRunning));
      setIntervalMs(
        WATCH_INTERVALS.some((i) => i.ms === storedInterval)
          ? storedInterval
          : WATCH_INTERVALS[1].ms
      );
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const sweep = useCallback(async () => {
    const targets = issuersRef.current;
    if (targets.length === 0) return;
    setSweeping(true);
    setError(undefined);

    const nextBaseline: Baseline = { ...baselineRef.current };
    const fresh: DriftAlert[] = [];
    let failures = 0;

    for (const issuer of targets) {
      try {
        const posture = await fetchIssuerPosture(issuer);
        if (posture.unreadable) {
          failures += 1;
          continue;
        }
        const prior = nextBaseline[issuer];
        if (prior) {
          for (const d of diffPosture(prior, posture)) {
            fresh.push({
              ...d,
              id: `${issuer}-${d.field}-${Date.now()}-${fresh.length}`,
              at: new Date().toISOString(),
            });
          }
        }
        nextBaseline[issuer] = posture;
      } catch {
        failures += 1;
      }
    }

    baselineRef.current = nextBaseline;
    setBaseline(nextBaseline);
    await writeSetting(BASELINE_KEY, nextBaseline);

    const stamp = new Date().toISOString();
    setLastSweep(stamp);
    await writeSetting("engine.watch.lastSweep", stamp);

    if (fresh.length > 0) {
      // Read-modify-write against storage, not against React state, so a
      // second window sweeping at the same time cannot drop alerts.
      const stored = await readSetting<DriftAlert[]>(ALERTS_KEY, []);
      const merged = [...fresh, ...(Array.isArray(stored) ? stored : [])].slice(
        0,
        MAX_ALERTS
      );
      await writeSetting(ALERTS_KEY, merged);
      setAlerts(merged);

      const critical = fresh.filter((a) => a.severity === "critical");
      const lead = critical[0] ?? fresh[0];
      await sendNativeNotification({
        title:
          critical.length > 0
            ? "Issuer posture changed — action required"
            : "Issuer posture changed",
        body:
          fresh.length === 1
            ? `${lead.headline} · ${lead.issuer.slice(0, 10)}…`
            : `${fresh.length} changes across your issuers. ${lead.headline}.`,
      });
    }

    if (failures > 0) {
      setError(
        `${failures} of ${targets.length} issuers could not be read this sweep. Their baselines are unchanged.`
      );
    }
    setSweeping(false);
  }, []);

  // Timer. Restarts only when the toggle or cadence changes.
  useEffect(() => {
    if (!loaded || !running) return;
    void sweep();
    const t = window.setInterval(() => void sweep(), intervalMs);
    return () => window.clearInterval(t);
  }, [loaded, running, intervalMs, sweep]);

  // Baseline any issuer we have never seen, even while paused — an
  // unbaselined issuer cannot produce a meaningful diff later.
  useEffect(() => {
    if (!loaded || running) return;
    const unseen = issuers.filter((i) => !baselineRef.current[i]);
    if (unseen.length === 0) return;
    void sweep();
  }, [loaded, running, issuers, sweep]);

  const toggle = useCallback(async (next: boolean) => {
    setRunning(next);
    await writeSetting("engine.watch.running", next);
  }, []);

  const setCadence = useCallback(async (ms: number) => {
    setIntervalMs(ms);
    await writeSetting("engine.watch.interval", ms);
  }, []);

  const acknowledge = useCallback(async (id: string) => {
    const stored = await readSetting<DriftAlert[]>(ALERTS_KEY, []);
    const next = (Array.isArray(stored) ? stored : []).map((a) =>
      a.id === id ? { ...a, acknowledged: true } : a
    );
    await writeSetting(ALERTS_KEY, next);
    setAlerts(next);
  }, []);

  const clearAlerts = useCallback(async () => {
    await writeSetting(ALERTS_KEY, []);
    setAlerts([]);
  }, []);

  return {
    alerts,
    baseline,
    loaded,
    running,
    sweeping,
    lastSweep,
    error,
    intervalMs,
    sweep,
    toggle,
    setCadence,
    acknowledge,
    clearAlerts,
    unacknowledged: alerts.filter((a) => !a.acknowledged).length,
  };
}
