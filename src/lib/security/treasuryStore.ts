import { createElement, useEffect, useSyncExternalStore } from "react";
import { useBilling } from "@/lib/billing/useEntitlements";
import { readSetting, writeSetting } from "@/lib/store";
import { isTrayView } from "@/lib/env";
import { isValidAddress } from "@/lib/xrpl/client";
import { canonical } from "@/lib/compliance/registry";
import { evidenceRecord } from "./workflowEvidence";
import {
  treasuryPolicy,
  readTreasuryActivity,
  treasuryFlow,
  evaluateTreasury,
  type TreasuryPolicy,
  type TreasuryCursor,
  type TreasuryFlow,
  type TreasuryFinding,
} from "./treasury";
import {
  notifyTreasury,
  type TreasuryNotificationStatus,
} from "./treasuryNotify";
export type TreasuryWatch = {
  address: string;
  policy: TreasuryPolicy;
  enabled: boolean;
  authorized: true;
};
export type TreasuryAlert = {
  id: string;
  address: string;
  finding: TreasuryFinding;
  policy: TreasuryPolicy;
  observedAt: string;
  review: "pending" | "expected" | "not_recognized";
  reviewedAt: string | null;
};
type Monitor = {
  cursor: TreasuryCursor | null;
  flows: TreasuryFlow[];
  startedAt: number | null;
  lastReadAt: string | null;
  ledger: number | null;
  error: string | null;
  gaps: string[];
  complete: boolean;
};
type State = {
  loaded: boolean;
  watches: TreasuryWatch[];
  monitors: Record<string, Monitor>;
  alerts: TreasuryAlert[];
  busy: boolean;
  error: string | null;
  notification: TreasuryNotificationStatus | null;
  lastNotificationAt: string | null;
};
const KEY = "security.treasury.v1";
const blank = (): Monitor => ({
  cursor: null,
  flows: [],
  startedAt: null,
  lastReadAt: null,
  ledger: null,
  error: null,
  gaps: [],
  complete: false,
});
let state: State = {
  loaded: false,
  watches: [],
  monitors: {},
  alerts: [],
  busy: false,
  error: null,
  notification: null,
  lastNotificationAt: null,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
let hydration: Promise<void> | null = null;
async function hydrate() {
  if (state.loaded) return;
  if (!hydration)
    hydration = (async () => {
      const saved = await readSetting<any>(KEY, null);
      try {
        if (saved) {
          if (
            !Array.isArray(saved.watches) ||
            saved.watches.length > 50 ||
            !Array.isArray(saved.alerts) ||
            saved.alerts.length > 200
          )
            throw Error(
              "Invalid saved monitoring state. Export/review device storage before resetting.",
            );
          const watches: TreasuryWatch[] = saved.watches.map((w: any) => {
            if (
              !isValidAddress(w.address) ||
              w.authorized !== true ||
              typeof w.enabled !== "boolean"
            )
              throw Error("Invalid saved watch.");
            return { ...w, policy: treasuryPolicy(w.policy) };
          });
          if (new Set(watches.map((w) => w.address)).size !== watches.length)
            throw Error("Duplicate saved watches.");
          if (
            saved.schema !== "noshashi-treasury-state-v1" ||
            !saved.monitors ||
            typeof saved.monitors !== "object"
          )
            throw Error("Unsupported or incomplete saved monitoring state.");
          for (const monitor of Object.values(saved.monitors) as any[]) {
            if (
              !monitor ||
              !Array.isArray(monitor.flows) ||
              monitor.flows.length > 2000 ||
              !Array.isArray(monitor.gaps) ||
              monitor.gaps.length > 20 ||
              monitor.gaps.some((g: unknown) => typeof g !== "string") ||
              typeof monitor.complete !== "boolean" ||
              (monitor.cursor &&
                (!Number.isSafeInteger(monitor.cursor.ledger) ||
                  monitor.cursor.ledger < 1 ||
                  (monitor.cursor.pending &&
                    (!Number.isSafeInteger(monitor.cursor.pending.to) ||
                      !Array.isArray(monitor.cursor.pending.seen) ||
                      monitor.cursor.pending.seen.length > 200))))
            )
              throw Error(
                "Saved monitor coverage is invalid; no monitoring was resumed.",
              );
            if (
              monitor.flows.some(
                (f: any) =>
                  !f ||
                  !/^[A-F0-9]{64}$/.test(f.hash) ||
                  !isValidAddress(f.destination) ||
                  ![f.drops, f.beforeDrops, f.afterDrops, f.feeDrops].every(
                    (v) => typeof v === "string" && /^\d{1,18}$/.test(v),
                  ) ||
                  !Number.isFinite(f.at) ||
                  !Number.isSafeInteger(f.ledger),
              )
            )
              throw Error("Saved payment evidence is invalid.");
          }
          if (
            saved.alerts.some(
              (a: any) =>
                !a ||
                typeof a.id !== "string" ||
                !isValidAddress(a.address) ||
                !["pending", "expected", "not_recognized"].includes(a.review) ||
                !a.finding ||
                typeof a.finding.title !== "string" ||
                !Array.isArray(a.finding.hashes) ||
                a.finding.hashes.length > 2800 ||
                !Array.isArray(a.finding.destinations) ||
                typeof a.finding.drops !== "string" ||
                !/^\d{1,22}$/.test(a.finding.drops),
            )
          )
            throw Error("Saved review records are invalid.");
          set({
            watches,
            monitors: saved.monitors ?? {},
            alerts: saved.alerts,
            notification: saved.notification ?? null,
            lastNotificationAt: saved.lastNotificationAt ?? null,
          });
        }
      } catch (e) {
        set({
          error:
            e instanceof Error
              ? e.message
              : "Saved monitoring state could not be read.",
        });
      } finally {
        set({ loaded: true });
      }
    })();
  await hydration;
}
async function persist() {
  const saved = {
    schema: "noshashi-treasury-state-v1",
    watches: state.watches,
    monitors: state.monitors,
    alerts: state.alerts,
    notification: state.notification,
    lastNotificationAt: state.lastNotificationAt,
  };
  await writeSetting(KEY, saved);
  const check = await readSetting<any>(KEY, null);
  if (canonical(check) !== canonical(saved))
    throw Error(
      "Monitoring state could not be confirmed in device storage. Keep an evidence export; persistence is unconfirmed.",
    );
}
async function commitChange(action: () => void | Promise<void>) {
  await hydrate();
  if (state.busy || state.error)
    throw Error(
      "Wait for the current operation or reload saved state before making changes.",
    );
  set({ busy: true });
  try {
    await action();
    await persist();
  } catch (e) {
    set({
      error:
        e instanceof Error
          ? e.message
          : "Local state persistence is unconfirmed.",
    });
    throw e;
  } finally {
    set({ busy: false });
  }
}
export const getTreasurySnapshot = () => state;
export function useTreasuryGuard() {
  useEffect(() => {
    void hydrate();
  }, []);
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, getTreasurySnapshot);
}
export async function saveTreasuryWatch(watch: TreasuryWatch, limit: number) {
  await hydrate();
  if (state.busy)
    throw Error("Wait for the active read to finish before changing watches.");
  if (state.error) throw Error("Reload saved state before changing watches.");
  if (!isValidAddress(watch.address) || watch.authorized !== true)
    throw Error(
      "Confirm that you operate this account or are authorized to monitor it.",
    );
  const policy = treasuryPolicy(watch.policy);
  if (
    !state.watches.some((w) => w.address === watch.address) &&
    state.watches.length >= limit
  )
    throw Error(`Your plan permits ${limit} local treasury watches.`);
  await commitChange(() =>
    set({
      watches: state.watches.some((w) => w.address === watch.address)
        ? state.watches.map((w) =>
            w.address === watch.address ? { ...watch, policy } : w,
          )
        : [...state.watches, { ...watch, policy }],
    }),
  );
}
export async function pauseTreasuryWatch(address: string) {
  await commitChange(() =>
    set({
      watches: state.watches.map((w) =>
        w.address === address ? { ...w, enabled: !w.enabled } : w,
      ),
    }),
  );
}
export async function reviewTreasuryAlert(
  id: string,
  review: TreasuryAlert["review"],
) {
  if (!["pending", "expected", "not_recognized"].includes(review))
    throw Error("Choose a valid review state.");
  await commitChange(() =>
    set({
      alerts: state.alerts.map((a) =>
        a.id === id
          ? {
              ...a,
              review,
              reviewedAt:
                review === "pending" ? null : new Date().toISOString(),
            }
          : a,
      ),
    }),
  );
}
export async function testTreasuryNotification() {
  let result: TreasuryNotificationStatus = "unavailable";
  await commitChange(async () => {
    result = await notifyTreasury(0, true);
    set({ notification: result, lastNotificationAt: new Date().toISOString() });
  });
  return result;
}

export async function pollTreasury(limit: number) {
  await hydrate();
  if (state.busy || state.error) return;
  set({ busy: true });
  let added = 0;
  const cycleStarted = Date.now();
  try {
    for (const watch of state.watches
      .slice(0, limit)
      .filter((w) => w.enabled)) {
      const previous = state.monitors[watch.address] ?? blank();
      if (Date.now() - cycleStarted > 45000) {
        const error =
          "Not checked within this cycle’s time budget; coverage is unknown. Retry after connectivity recovers.";
        if (previous.error !== error) added++;
        set({
          monitors: {
            ...state.monitors,
            [watch.address]: { ...previous, error, complete: false },
          },
        });
        await persist();
        continue;
      }

      try {
        const read = await readTreasuryActivity(watch.address, previous.cursor);
        const issues: string[] = [];
        const fresh: TreasuryFlow[] = [];
        for (const row of read.rows) {
          const r = treasuryFlow(watch.address, row);
          if (r.flow) {
            if (r.flow.at > read.anchor.closeTime)
              issues.push("Transaction time exceeds the pinned ledger anchor.");
            else fresh.push(r.flow);
          }
          if (r.issue) issues.push(r.issue);
        }
        const cutoff = read.anchor.closeTime - 1440 * 60000;
        const merged = [
          ...new Map(
            [...previous.flows, ...fresh].map((f) => [f.hash, f]),
          ).values(),
        ].filter((f) => f.at >= cutoff);
        if (merged.length > 2000)
          issues.push(
            "Local 2,000-payment capacity reached; rolling-window totals are incomplete.",
          );
        const flows = merged.slice(-2000);
        const old = new Set(previous.flows.map((f) => f.hash));
        const newHashes = new Set(
          fresh.filter((f) => !old.has(f.hash)).map((f) => f.hash),
        );
        const candidates = evaluateTreasury(
          watch.policy,
          [...flows, ...fresh],
          read.anchor.closeTime,
        ).filter((f) => f.hashes.some((h) => newHashes.has(h)));
        const alerts = [...state.alerts];
        for (const finding of candidates) {
          const record = await evidenceRecord("treasury-alert-v1", {
            address: watch.address,
            policy: watch.policy,
            finding,
          });
          if (alerts.some((a) => a.id === record.sha256)) continue;
          alerts.unshift({
            id: record.sha256,
            address: watch.address,
            finding,
            policy: watch.policy,
            observedAt: new Date().toISOString(),
            review: "pending",
            reviewedAt: null,
          });
          added++;
        }
        if (issues.some((issue) => !previous.gaps.includes(issue))) added++;
        const monitor: Monitor = {
          cursor: read.cursor,
          flows,
          startedAt: previous.startedAt ?? read.anchor.closeTime,
          lastReadAt: new Date().toISOString(),
          ledger: read.anchor.ledger,
          error: null,
          gaps: [...new Set([...previous.gaps, ...issues])].slice(-20),
          complete: read.complete,
        };
        set({
          monitors: { ...state.monitors, [watch.address]: monitor },
          alerts: alerts.slice(0, 200),
        });
        await persist();
      } catch (e) {
        if (!previous.error) added++;
        set({
          monitors: {
            ...state.monitors,
            [watch.address]: {
              ...previous,
              error: e instanceof Error ? e.message : "Read unavailable.",
              complete: false,
            },
          },
        });
        await persist();
      }
    }
    if (added) {
      const notification = await notifyTreasury(added);
      set({ notification, lastNotificationAt: new Date().toISOString() });
      await persist();
    }
  } catch (e) {
    set({
      error:
        e instanceof Error ? e.message : "Monitoring state is unconfirmed.",
    });
  } finally {
    set({ busy: false });
  }
}
export function TreasuryGuardRunner() {
  const s = useTreasuryGuard();
  const { has } = useBilling();
  const limit = has("asset_recovery") ? 50 : 3;
  return !isTrayView && s.loaded && s.watches.some((w) => w.enabled)
    ? createElement(TreasuryLoop, { limit })
    : null;
}
function TreasuryLoop({ limit }: { limit: number }) {
  useEffect(() => {
    const first = setTimeout(() => void pollTreasury(limit), 5000);
    const timer = setInterval(() => void pollTreasury(limit), 60000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [limit]);
  return null;
}

export async function reloadTreasuryState() {
  if (state.busy) throw Error("Wait for the active read.");
  hydration = null;
  set({ loaded: false, watches: [], monitors: {}, alerts: [], error: null });
  await hydrate();
}
