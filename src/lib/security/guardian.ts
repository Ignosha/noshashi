import { createElement, useEffect, useSyncExternalStore } from "react";
import { rpc } from "@/lib/xrpl/client";
import { readSetting, writeSetting } from "@/lib/store";
import { sendNativeNotification } from "@/lib/notifications";
import { useBilling } from "@/lib/billing/useEntitlements";
import { containsLink, memosOf } from "../../../supabase/functions/_shared/xrplEvents.ts";

/**
 * Personal Guardian — takeover alerts for your own addresses, on this device.
 *
 * While the app is open it reads each address's new validated
 * transactions once a minute from the public XRPL servers and raises a
 * native notification the moment something happens that a thief would do:
 * a new regular key or signer list, the master key disabled or re-enabled,
 * the account deleted, a large amount leaving, or a phishing lure (a dust
 * payment or an offer carrying a link) arriving. Nothing leaves the
 * device: the addresses, the alerts and the last ledger read are kept in
 * local settings. The organization's server-side Guardian (Strategic)
 * does the same for watched accounts when no one has the app open.
 *
 * Free on every plan for up to FREE_ADDRESSES addresses; Pro and above
 * (asset_recovery) watch up to PAID_ADDRESSES.
 */

type Json = Record<string, any>;

export const FREE_ADDRESSES = 3;
export const PAID_ADDRESSES = 50;
const POLL_MS = 60_000;
const ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

export type GuardianAlert = {
  id: string;
  address: string;
  kind: "keys_changed" | "master_key" | "account_deleted" | "large_outflow" | "phishing_lure";
  severity: "critical" | "warn";
  title: string;
  detail: string;
  hash: string;
  ledger: number;
  at: string | null;
};

export type GuardianConfig = { enabled: boolean; addresses: string[]; largeXrp: number };

type GuardianState = {
  config: GuardianConfig;
  /** Last validated ledger read, per address. */
  cursor: Record<string, number>;
  alerts: GuardianAlert[];
  lastRunAt: string | null;
  lastError: string | null;
  hydrated: boolean;
};

let state: GuardianState = {
  config: { enabled: true, addresses: [], largeXrp: 1000 },
  cursor: {},
  alerts: [],
  lastRunAt: null,
  lastError: null,
  hydrated: false,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<GuardianState>) => {
  state = { ...state, ...patch };
  for (const l of listeners) l();
};

async function hydrate() {
  if (state.hydrated) return;
  const [config, cursor, alerts] = await Promise.all([
    readSetting<GuardianConfig>("guardian.config", state.config),
    readSetting<Record<string, number>>("guardian.cursor", {}),
    readSetting<GuardianAlert[]>("guardian.alerts", []),
  ]);
  set({ config: { ...state.config, ...config }, cursor, alerts, hydrated: true });
}

export function useGuardian(): GuardianState {
  useEffect(() => {
    void hydrate();
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}

export function setGuardianConfig(config: Partial<GuardianConfig>) {
  const next = { ...state.config, ...config, addresses: [...new Set((config.addresses ?? state.config.addresses).filter((a) => ADDRESS_RE.test(a)))] };
  set({ config: next });
  void writeSetting("guardian.config", next);
}

export function clearGuardianAlerts() {
  set({ alerts: [] });
  void writeSetting("guardian.alerts", []);
}

const iso = (t: unknown) => (typeof t === "number" ? new Date((t + 946_684_800) * 1000).toISOString() : null);

/** What in these rows (oldest first) a watcher of `address` should be told about. Pure. */
export function guardianAlertsFor(address: string, rows: Json[], largeXrp: number): GuardianAlert[] {
  const out: GuardianAlert[] = [];
  for (const row of rows) {
    const tx = (row.tx_json ?? row.tx ?? row) as Json;
    const meta = (row.meta ?? {}) as Json;
    if (meta.TransactionResult !== "tesSUCCESS") continue;
    const hash = String(tx.hash ?? row.hash ?? "");
    const ledger = Number(row.ledger_index ?? tx.ledger_index ?? 0);
    const base = { address, hash, ledger, at: iso(tx.date ?? row.date) };
    const mine = tx.Account === address;
    const add = (a: Omit<GuardianAlert, "id" | keyof typeof base>) => out.push({ ...base, ...a, id: `${hash}:${a.kind}` });
    switch (tx.TransactionType) {
      case "SetRegularKey":
        if (mine) add({ kind: "keys_changed", severity: "critical", title: tx.RegularKey ? "A new regular key can sign for your account" : "Your regular key was removed", detail: tx.RegularKey ? `${tx.RegularKey} can now move everything. If you did not do this, move what is left to a new account now and open Incident Response.` : "If you did not do this, check who still can sign." });
        break;
      case "SignerListSet":
        if (mine) add({ kind: "keys_changed", severity: "critical", title: Number(tx.SignerQuorum ?? 0) > 0 ? "Your account's signer list changed" : "Your signer list was removed", detail: "Signers can move everything. If this was not you, the account is compromised." });
        break;
      case "AccountSet":
        if (mine && (tx.SetFlag === 4 || tx.ClearFlag === 4)) add({ kind: "master_key", severity: "critical", title: tx.SetFlag === 4 ? "Your master key was disabled" : "Your master key was re-enabled", detail: tx.SetFlag === 4 ? "Only a regular key or the signers can sign now. If you did not do this, someone else controls the account." : "The original seed can sign alone again." });
        break;
      case "AccountDelete":
        if (mine) add({ kind: "account_deleted", severity: "critical", title: "Your account was deleted", detail: `Its XRP went to ${tx.Destination}. If you did not do this, open Incident Response and follow it.` });
        break;
      case "Payment": {
        const delivered = meta.delivered_amount ?? meta.DeliveredAmount;
        const xrp = typeof delivered === "string" && /^\d+$/.test(delivered) ? Number(delivered) / 1_000_000 : 0;
        if (mine && tx.Destination !== address && xrp >= largeXrp) {
          add({ kind: "large_outflow", severity: "warn", title: `${xrp.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP left your account`, detail: `To ${tx.Destination}${typeof tx.DestinationTag === "number" ? ` tag ${tx.DestinationTag}` : ""}. If you did not send it, your seed is exposed: move what is left now.` });
        }
        if (!mine && tx.Destination === address && xrp < 0.01 && memosOf(tx).some(containsLink)) {
          add({ kind: "phishing_lure", severity: "warn", title: "A dust payment with a link arrived", detail: `From ${tx.Account}. Links that arrive on the ledger lead to fake wallets and airdrops. Do not open it, and never enter your seed anywhere.` });
        }
        break;
      }
      case "NFTokenCreateOffer":
        if (!mine && tx.Destination === address && memosOf(tx).some(containsLink)) {
          add({ kind: "phishing_lure", severity: "warn", title: "An NFT offer with a link was sent to you", detail: `From ${tx.Account}. Unsolicited NFT offers are a phishing carrier: do not follow the link or accept it.` });
        }
        break;
    }
  }
  return out;
}

let running = false;

/** Read every watched address once. First sight of an address starts from the current ledger, without replaying history. */
export async function runGuardianOnce(limit: number): Promise<void> {
  if (running) return;
  running = true;
  try {
    await hydrate();
    const addresses = state.config.addresses.slice(0, limit);
    if (!addresses.length) return;
    const ledger = await rpc("ledger", { ledger_index: "validated" });
    const validated = Number(ledger.ledger?.ledger_index ?? ledger.ledger_index);
    const cursor = { ...state.cursor };
    const fresh: GuardianAlert[] = [];
    let failed = 0;
    for (const address of addresses) {
      const from = cursor[address];
      if (!from) {
        cursor[address] = validated;
        continue;
      }
      if (from >= validated) continue;
      try {
        // ledger_index_max -1 is the latest validated ledger, which may be newer than the one read above.
        const page = await rpc("account_tx", { account: address, ledger_index_min: from + 1, ledger_index_max: -1, forward: true, limit: 200 });
        const rows = (page.transactions ?? []) as Json[];
        fresh.push(...guardianAlertsFor(address, rows, state.config.largeXrp));
        const last = rows.length ? Number(rows[rows.length - 1].ledger_index ?? rows[rows.length - 1].tx?.ledger_index ?? validated) : validated;
        // A full page means more remain: continue from the last ledger read next time.
        cursor[address] = page.marker && rows.length ? last - 1 : Math.max(validated, last);
      } catch (error) {
        if (/actNotFound/i.test(error instanceof Error ? error.message : String(error))) cursor[address] = validated;
        else failed += 1;
      }
    }
    const known = new Set(state.alerts.map((a) => a.id));
    const added = fresh.filter((a) => !known.has(a.id));
    const alerts = [...added.reverse(), ...state.alerts].slice(0, 100);
    set({ cursor, alerts, lastRunAt: new Date().toISOString(), lastError: failed ? `${failed} address${failed === 1 ? "" : "es"} could not be read on the last check.` : null });
    await Promise.all([writeSetting("guardian.cursor", cursor), writeSetting("guardian.alerts", alerts)]);
    for (const a of added.slice(0, 5)) await sendNativeNotification({ title: `NOSHASHI GUARDIAN · ${a.severity === "critical" ? "TAKEOVER RISK" : "WARNING"}`, body: `${a.address.slice(0, 8)}…: ${a.title}` });
  } catch (error) {
    set({ lastError: error instanceof Error ? error.message : "The check did not complete." });
  } finally {
    running = false;
  }
}

/** Mounted once in App: polls while the app is open and Guardian is on. */
export function PersonalGuardianRunner() {
  const g = useGuardian();
  const { has } = useBilling();
  const limit = has("asset_recovery") ? PAID_ADDRESSES : FREE_ADDRESSES;
  const active = g.hydrated && g.config.enabled && g.config.addresses.length > 0;
  return active ? createElement(GuardianLoop, { limit, key: g.config.addresses.join(",") }) : null;
}

function GuardianLoop({ limit }: { limit: number }) {
  useEffect(() => {
    const first = window.setTimeout(() => void runGuardianOnce(limit), 5_000);
    const every = window.setInterval(() => void runGuardianOnce(limit), POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [limit]);
  return null;
}
