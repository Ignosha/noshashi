import { rpc } from "@/lib/xrpl/client";

/**
 * Drainer patterns — the sequences thieves run, recognised as they start.
 *
 * A single transaction rarely says "theft"; the order does. These are the
 * patterns seen on the XRP Ledger, each read from an account's history:
 *
 *   key_then_drain      the account's keys change, then value leaves soon after
 *   spray_then_sweep    dozens of dust payments go out, then the account
 *                       deletes itself into another: a phishing relay
 *   nft_giveaway        a zero-price NFT sell offer is created, then accepted
 *                       by someone else: the signature phishing sites ask for
 *   check_then_cash     a check is written, then cashed by its payee soon
 *                       after: a way to pull value with one signature
 *
 * Each pattern names the transactions that make it, so a person can check.
 * A pattern is a reason to look, not a verdict: an owner rotating keys
 * before moving to a new wallet reads like the first one.
 */

type Json = Record<string, any>;

export type DrainerPattern = {
  id: "key_then_drain" | "spray_then_sweep" | "nft_giveaway" | "check_then_cash";
  severity: "critical" | "warn";
  title: string;
  detail: string;
  evidence: string[];
  fromLedger: number;
  toLedger: number;
};

const WINDOW = 3_000; // about three hours of ledgers
const DUST_DROPS = 10_000; // 0.01 XRP

type Row = { tx: Json; meta: Json; ledger: number; hash: string };

function rowsOf(input: Json[]): Row[] {
  return input
    .map((r) => {
      const tx = (r.tx_json ?? r.tx ?? r) as Json;
      return { tx, meta: (r.meta ?? {}) as Json, ledger: Number(r.ledger_index ?? tx.ledger_index ?? 0), hash: String(tx.hash ?? r.hash ?? "") };
    })
    .filter((r) => r.meta.TransactionResult === "tesSUCCESS")
    .sort((a, b) => a.ledger - b.ledger);
}

const xrpOut = (r: Row) => {
  const d = r.meta.delivered_amount ?? r.meta.DeliveredAmount;
  return typeof d === "string" && /^\d+$/.test(d) ? Number(d) : 0;
};

export function drainerPatterns(address: string, history: Json[], largeXrp = 100): DrainerPattern[] {
  const rows = rowsOf(history);
  const out: DrainerPattern[] = [];
  const mine = rows.filter((r) => r.tx.Account === address);

  // Keys change, then value leaves.
  for (const k of mine.filter((r) => r.tx.TransactionType === "SetRegularKey" || r.tx.TransactionType === "SignerListSet" || (r.tx.TransactionType === "AccountSet" && r.tx.SetFlag === 4))) {
    const after = mine.filter((r) => r.ledger >= k.ledger && r.ledger - k.ledger <= WINDOW && r.hash !== k.hash && (r.tx.TransactionType === "AccountDelete" || (r.tx.TransactionType === "Payment" && r.tx.Destination !== address && xrpOut(r) >= largeXrp * 1_000_000)));
    if (after.length) {
      const total = after.reduce((n, r) => n + xrpOut(r), 0) / 1_000_000;
      out.push({
        id: "key_then_drain",
        severity: "critical",
        title: `Keys changed, then ${total.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP left within ${after[after.length - 1].ledger - k.ledger} ledgers`,
        detail: `${k.tx.TransactionType} in ledger ${k.ledger}, then ${after.length} outflow${after.length === 1 ? "" : "s"}. A thief adds a key of their own first so they can keep signing.`,
        evidence: [k.hash, ...after.map((r) => r.hash)],
        fromLedger: k.ledger,
        toLedger: after[after.length - 1].ledger,
      });
      break;
    }
  }

  // Dust spray, then a sweep by AccountDelete.
  const sweep = mine.find((r) => r.tx.TransactionType === "AccountDelete");
  if (sweep) {
    const spray = mine.filter((r) => r.tx.TransactionType === "Payment" && r.ledger <= sweep.ledger && xrpOut(r) > 0 && xrpOut(r) < DUST_DROPS);
    const targets = new Set(spray.map((r) => r.tx.Destination));
    if (spray.length >= 20 && targets.size >= 10) {
      out.push({
        id: "spray_then_sweep",
        severity: "critical",
        title: `${spray.length} dust payments to ${targets.size} accounts, then the account deleted itself into ${sweep.tx.Destination}`,
        detail: "The pattern of a phishing relay: spray links or lookalike addresses into many histories, then pass the balance on and disappear.",
        evidence: [spray[0].hash, spray[spray.length - 1].hash, sweep.hash],
        fromLedger: spray[0].ledger,
        toLedger: sweep.ledger,
      });
    }
  }

  // Zero-price NFT sell offer, accepted by someone else.
  for (const create of mine.filter((r) => r.tx.TransactionType === "NFTokenCreateOffer" && (Number(r.tx.Flags ?? 0) & 1) !== 0 && String(r.tx.Amount ?? "") === "0")) {
    const accepted = rows.find((r) => r.tx.TransactionType === "NFTokenAcceptOffer" && r.tx.Account !== address && r.ledger >= create.ledger && r.ledger - create.ledger <= WINDOW);
    if (accepted) {
      out.push({ id: "nft_giveaway", severity: "critical", title: `An NFT was offered for nothing, and ${accepted.tx.Account} took it`, detail: `NFT ${String(create.tx.NFTokenID).slice(0, 16)}…: the zero-price offer in ledger ${create.ledger} was accepted in ledger ${accepted.ledger}.`, evidence: [create.hash, accepted.hash], fromLedger: create.ledger, toLedger: accepted.ledger });
    }
  }

  // A check written, then cashed soon after by its payee.
  for (const check of mine.filter((r) => r.tx.TransactionType === "CheckCreate")) {
    const cashed = rows.find((r) => r.tx.TransactionType === "CheckCash" && r.tx.Account === check.tx.Destination && r.ledger >= check.ledger && r.ledger - check.ledger <= WINDOW);
    if (cashed) {
      out.push({ id: "check_then_cash", severity: "warn", title: `A check to ${check.tx.Destination} was cashed ${cashed.ledger - check.ledger} ledgers after it was written`, detail: "Checks let the payee pull value later; a phishing site can ask for one signature and cash it at once.", evidence: [check.hash, cashed.hash], fromLedger: check.ledger, toLedger: cashed.ledger });
    }
  }
  return out;
}

/** Read an account's most recent transactions (up to `pages` × 200) and look for the patterns. */
export async function readDrainerPatterns(address: string, pages = 2): Promise<{ patterns: DrainerPattern[]; transactions: number }> {
  const rows: Json[] = [];
  let marker: unknown;
  for (let i = 0; i < pages; i++) {
    const page = await rpc("account_tx", { account: address, ledger_index_min: -1, ledger_index_max: -1, forward: false, limit: 200, ...(marker ? { marker } : {}) });
    rows.push(...((page.transactions ?? []) as Json[]));
    marker = page.marker;
    if (!marker) break;
  }
  return { patterns: drainerPatterns(address, rows), transactions: rows.length };
}
