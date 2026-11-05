/**
 * Treasury wallet alerts — what a watched wallet's new validated
 * transactions mean, as one short message. Pure: no imports with I/O, so
 * the edge function (noshashi-issuer-alerts) and the app's tests share it.
 *
 * Alerted: everything the wallet itself signed (money out, offers, trust
 * lines, settings, keys), anything done to it (a freeze or clawback by an
 * issuer, a check cashed), and incoming value of at least MIN_INCOMING_XRP,
 * or any incoming token amount. Left out: incoming XRP dust (the usual
 * vehicle for phishing memos) and other parties' payments that only
 * rippled through one of the wallet's trust lines.
 */
import { type Amount, classifyTransaction, formatAmount, normalizeTx, type XrplEvent } from "./xrplEvents.ts";

export const MIN_INCOMING_XRP = 1;
/** Lines per message; the rest are counted, never dropped silently. */
export const MAX_LINES = 12;

// deno-lint-ignore no-explicit-any
type Tx = Record<string, any>;

const amt = (a: unknown) => (a && typeof a === "object" && "value" in (a as Amount) ? formatAmount(a as Amount) : "an amount");

/** The events worth telling a treasury about, oldest first. Failed transactions included: a failed send is still a send attempt. */
export function walletEvents(rows: Tx[], wallet: string): XrplEvent[] {
  const out: XrplEvent[] = [];
  for (const row of rows) {
    const { tx, meta, ledgerIndex } = normalizeTx(row);
    if (row.validated === false) continue;
    for (const e of classifyTransaction(tx, meta, wallet, ledgerIndex)) {
      if (e.type === "rippled_through") continue;
      if (e.type === "payment_in") {
        const d = (e.data.delivered ?? e.data.amount) as Amount | null;
        if (d && d.currency === "XRP" && d.value < MIN_INCOMING_XRP) continue;
      }
      out.push(e);
    }
  }
  return out.sort((a, b) => a.ledgerIndex - b.ledgerIndex);
}

const MARK = { high: "🔴", watch: "🟠", info: "⚪" } as const;

/** One line per event, with how much it matters to a treasury. */
export function describeWalletEvent(e: XrplEvent, wallet: string): { severity: keyof typeof MARK; text: string } {
  const failed = e.result && e.result !== "tesSUCCESS" ? ` (failed: ${e.result})` : "";
  const d = e.data as Record<string, unknown>;
  switch (e.type) {
    case "payment_out":
      return { severity: "high", text: `Sent ${amt(d.delivered ?? d.amount)} to ${e.counterparty}${d.destinationTag != null ? ` tag ${d.destinationTag}` : ""}${failed}` };
    case "payment_in":
      return { severity: "info", text: `Received ${amt(d.delivered ?? d.amount)} from ${e.counterparty}${d.partial ? " (partial payment: delivered amount shown)" : ""}${failed}` };
    case "payment_self":
      return { severity: "info", text: `Converted between its own balances${failed}` };
    case "keys_changed":
      return { severity: "high", text: `Signing keys changed: ${String(d.change ?? "").replace(/_/g, " ")}${d.regularKey ? ` (${d.regularKey})` : ""}${typeof d.quorum === "number" && d.quorum > 0 ? ` (quorum ${d.quorum})` : ""}${failed}` };
    case "account_deleted":
      return { severity: "high", text: `Account deleted; remaining XRP sent to ${e.counterparty}${failed}` };
    case "account_settings_changed":
      return {
        severity: d.set === "disableMasterKey" || d.clear === "disableMasterKey" ? "high" : "watch",
        text: `Account settings changed${d.set ? `: set ${d.set}` : ""}${d.clear ? `: cleared ${d.clear}` : ""}${d.domain !== undefined ? `: domain ${d.domain || "removed"}` : ""}${failed}`,
      };
    case "trustline_frozen":
      return { severity: "high", text: `Trust line frozen by ${e.counterparty}${failed}` };
    case "trustline_unfrozen":
      return { severity: "watch", text: `Trust line unfrozen by ${e.counterparty}${failed}` };
    case "trustline_changed":
      return { severity: "watch", text: `Trust line ${d.setBy === wallet ? "set" : "changed by " + d.setBy}: ${amt(d.limit)}${failed}` };
    case "clawback":
      return { severity: "high", text: `Clawback of ${amt(d.amount)} by ${d.issuer}${failed}` };
    case "offer_created":
      return { severity: "watch", text: `Offer placed: gives ${amt(d.takerGets)} for ${amt(d.takerPays)}${failed}` };
    case "offer_cancelled":
      return { severity: "info", text: `Offer cancelled${failed}` };
    case "check_created":
    case "check_cashed":
    case "check_cancelled":
      return { severity: e.type === "check_cashed" ? "high" : "watch", text: `Check ${e.type.slice(6)}${e.counterparty ? ` with ${e.counterparty}` : ""}${failed}` };
    case "escrow":
      return { severity: "watch", text: `${e.txType}${d.amount ? ` ${amt(d.amount)}` : ""}${e.counterparty ? ` with ${e.counterparty}` : ""}${failed}` };
    default:
      return { severity: "watch", text: `${e.txType || "Transaction"}${failed}` };
  }
}

export function walletAlertText(wallet: string, events: XrplEvent[], unsubscribeUrl: string): string {
  const last = events.length ? events[events.length - 1].ledgerIndex : null;
  const lines = events.slice(0, MAX_LINES).map((e) => {
    const { severity, text } = describeWalletEvent(e, wallet);
    return `${MARK[severity]} ${text} · ledger ${e.ledgerIndex}`;
  });
  const more = events.length - lines.length;
  return [
    "NOSHASHI · treasury wallet activity",
    `${wallet}${last ? ` up to ledger ${last}` : ""}`,
    "",
    ...lines,
    ...(more > 0 ? [`…and ${more} more. Full history: https://www.noshashi.app/treasury/?wallets=${wallet}`] : []),
    "",
    "Read from validated ledgers. Ledger facts, not advice.",
    `Stop these alerts: ${unsubscribeUrl}`,
  ].join("\n");
}
