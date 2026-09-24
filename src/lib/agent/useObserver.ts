import { useEffect, useSyncExternalStore } from "react";
import { fetchAccount, fetchIssuerPosture, fetchTrustLines, fetchWalletCredentials, isValidAddress } from "@/lib/xrpl/client";
import { rippleTimeToDate } from "@/lib/format";
import { readSetting, writeSetting } from "@/lib/store";
import { sendNativeNotification } from "@/lib/notifications";
import type { IssuerPosture } from "@/lib/xrpl/types";
import { observe, type Observation, type WalletReading } from "./observer";

/**
 * The Observer's runtime: which wallets it watches, how often it reads
 * them, and what it has seen. One store shared by the runner (mounted once
 * for the whole app, so it keeps watching whichever screen is open) and
 * the Observer panel in the Agent scene.
 *
 * Every reading is a read of validated mainnet state through the same
 * public servers the rest of the app uses; nothing is sent anywhere else,
 * and the readings and observations stay on this device.
 */

const KEYS = {
  enabled: "observer.enabled",
  wallets: "observer.wallets",
  interval: "observer.intervalMs",
  readings: "observer.readings",
  log: "observer.log",
  lastSweep: "observer.lastSweep",
} as const;

export const OBSERVER_INTERVALS = [
  { label: "5 min", ms: 5 * 60_000 },
  { label: "15 min", ms: 15 * 60_000 },
  { label: "1 hour", ms: 60 * 60_000 },
] as const;

const MAX_LOG = 200;
const MAX_WALLETS = 25;
/** Issuers read per wallet per sweep, so one sweep never floods a public node. */
const MAX_ISSUERS = 20;

export type ObserverState = {
  hydrated: boolean;
  enabled: boolean;
  wallets: string[];
  intervalMs: number;
  readings: Record<string, WalletReading>;
  log: Observation[];
  lastSweep: string | null;
  sweeping: boolean;
  error: string | null;
};

let state: ObserverState = {
  hydrated: false,
  enabled: true,
  wallets: [],
  intervalMs: OBSERVER_INTERVALS[0].ms,
  readings: {},
  log: [],
  lastSweep: null,
  sweeping: false,
  error: null,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<ObserverState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

let hydrating: Promise<void> | null = null;
function hydrate() {
  hydrating ??= (async () => {
    const [enabled, wallets, intervalMs, readings, log, lastSweep] = await Promise.all([
      readSetting<boolean>(KEYS.enabled, true),
      readSetting<string[]>(KEYS.wallets, []),
      readSetting<number>(KEYS.interval, OBSERVER_INTERVALS[0].ms),
      readSetting<Record<string, WalletReading>>(KEYS.readings, {}),
      readSetting<Observation[]>(KEYS.log, []),
      readSetting<string | null>(KEYS.lastSweep, null),
    ]);
    set({ hydrated: true, enabled, wallets, intervalMs, readings, log, lastSweep });
  })();
  return hydrating;
}

/** Read one wallet, and the posture of every issuer it holds a line with. */
export async function readWallet(address: string): Promise<WalletReading> {
  const [account, lines, credentials] = await Promise.all([
    fetchAccount(address),
    fetchTrustLines(address),
    fetchWalletCredentials(address).catch(() => []),
  ]);
  // Only this wallet's own holdings: a negative balance is the other side of
  // a line (what it owes as an issuer), not something it holds.
  const held = lines.filter((l) => l.balance > 0 || (l.balance === 0 && l.limit > 0));
  const issuerIds = [...new Set([address, ...held.map((l) => l.issuer)])].slice(0, MAX_ISSUERS + 1);
  const issuers: Record<string, IssuerPosture> = {};
  for (const id of issuerIds) {
    if (id === address && account.unfunded) continue;
    try {
      const p = await fetchIssuerPosture(id);
      if (!p.unreadable) issuers[id] = p;
    } catch {
      // An unreadable issuer is simply not compared this sweep.
    }
  }
  return {
    address,
    readAt: new Date().toISOString(),
    funded: !account.unfunded,
    balanceXrp: Number(account.balanceXrp),
    ownerCount: account.ownerCount,
    lines: held.map((l) => ({
      issuer: l.issuer,
      currency: l.currency,
      balance: l.balance,
      frozenByIssuer: l.frozenByIssuer,
      deepFrozenByIssuer: Boolean(l.deepFrozenByIssuer),
    })),
    credentials: credentials.map((c) => ({
      issuer: c.issuer,
      type: c.credentialType,
      accepted: c.accepted,
      revoked: c.revoked,
      ...(c.expiration ? { expiresAt: rippleTimeToDate(c.expiration).getTime() } : {}),
    })),
    issuers,
  };
}

/** One pass over every watched wallet. The first reading of a wallet is its baseline. */
export async function sweep(): Promise<Observation[]> {
  await hydrate();
  if (state.sweeping || !state.wallets.length) return [];
  set({ sweeping: true, error: null });
  const found: Observation[] = [];
  const readings = { ...state.readings };
  const failures: string[] = [];
  try {
    for (const address of state.wallets) {
      try {
        const next = await readWallet(address);
        const prev = readings[address];
        if (prev) found.push(...observe(prev, next));
        readings[address] = next;
      } catch (error) {
        failures.push(`${address.slice(0, 6)}…: ${error instanceof Error ? error.message : "unreadable"}`);
      }
    }
    const known = new Set(state.log.map((o) => o.id));
    const fresh = found.filter((o) => !known.has(o.id));
    const log = [...fresh.reverse(), ...state.log].slice(0, MAX_LOG);
    const lastSweep = new Date().toISOString();
    set({ readings, log, lastSweep, error: failures.length ? `Not read this sweep: ${failures.join("; ")}` : null });
    await Promise.all([writeSetting(KEYS.readings, readings), writeSetting(KEYS.log, log), writeSetting(KEYS.lastSweep, lastSweep)]);
    for (const o of fresh.filter((x) => x.severity !== "info").slice(0, 3)) {
      void sendNativeNotification({ title: `NOSHASHI observer · ${o.severity.toUpperCase()}`, body: o.headline });
    }
    return fresh;
  } finally {
    set({ sweeping: false });
  }
}

export const observerActions = {
  async setEnabled(enabled: boolean) {
    set({ enabled });
    await writeSetting(KEYS.enabled, enabled);
  },
  async setInterval(ms: number) {
    set({ intervalMs: ms });
    await writeSetting(KEYS.interval, ms);
  },
  /** Returns an error sentence, or null when the wallet was added. */
  async addWallet(address: string): Promise<string | null> {
    const a = address.trim();
    if (!isValidAddress(a)) return "That is not an XRPL address (r…).";
    if (state.wallets.includes(a)) return "Already watched.";
    if (state.wallets.length >= MAX_WALLETS) return `The observer watches at most ${MAX_WALLETS} wallets.`;
    const wallets = [...state.wallets, a];
    set({ wallets });
    await writeSetting(KEYS.wallets, wallets);
    void sweep(); // Take its baseline now rather than at the next interval.
    return null;
  },
  async removeWallet(address: string) {
    const wallets = state.wallets.filter((w) => w !== address);
    const readings = { ...state.readings };
    delete readings[address];
    set({ wallets, readings });
    await Promise.all([writeSetting(KEYS.wallets, wallets), writeSetting(KEYS.readings, readings)]);
  },
  async clearLog() {
    set({ log: [] });
    await writeSetting(KEYS.log, []);
  },
};

export function useObserver(): ObserverState {
  useEffect(() => void hydrate(), []);
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state
  );
}

/** Mounted once, at the app root: sweeps while enabled, whatever screen is open. */
export function ObserverRunner() {
  const s = useObserver();
  useEffect(() => {
    if (!s.hydrated || !s.enabled || !s.wallets.length) return;
    const due = s.lastSweep ? Date.parse(s.lastSweep) + s.intervalMs - Date.now() : 0;
    const first = window.setTimeout(() => void sweep(), Math.max(5_000, due));
    const every = window.setInterval(() => void sweep(), s.intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [s.hydrated, s.enabled, s.wallets.length, s.intervalMs]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
