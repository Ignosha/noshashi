import { rpc } from "@/lib/xrpl/client";

/**
 * Market surveillance — how a token's order book is really being used.
 *
 * An issuer's account history carries every transaction that touches its
 * token: orders placed, replaced and cancelled, and every trade that
 * crossed one. Read together they show what a quoted price hides:
 *
 *   quote churn       one account placing and replacing orders again and
 *                     again, with none ever filling: displayed depth that
 *                     never trades (layering or spoofing, or a market maker
 *                     re-quoting; the pattern is the same)
 *   self-cluster      trades between accounts funded by the same account:
 *   trades            volume that changes no one's position (wash trading)
 *   concentration     one account supplying most of the activity
 *
 * Findings are indicators with the numbers behind them, not verdicts. They
 * cover the transactions read, which the report states.
 */

type Json = Record<string, any>;

export type Fill = { hash: string; ledger: number; taker: string; maker: string };

export type TraderActivity = { account: string; placed: number; replaced: number; cancelled: number; filledAsMaker: number; tookAsTaker: number };

export type SurveillanceFinding = { id: string; severity: "warn" | "info"; title: string; detail: string; accounts: string[] };

export type SurveillanceReport = {
  issuer: string;
  transactions: number;
  ledgers: { from: number; to: number };
  traders: TraderActivity[];
  fills: Fill[];
  findings: SurveillanceFinding[];
};

/** Trades in one transaction: every offer another account owned that it consumed. */
export function fillsOf(row: Json): Fill[] {
  const tx = (row.tx_json ?? row.tx ?? row) as Json;
  const meta = (row.meta ?? {}) as Json;
  if (meta.TransactionResult !== "tesSUCCESS") return [];
  const out: Fill[] = [];
  for (const n of (meta.AffectedNodes ?? []) as Json[]) {
    const node = (n.ModifiedNode ?? n.DeletedNode) as Json | undefined;
    if (!node || node.LedgerEntryType !== "Offer") continue;
    const prev = node.PreviousFields as Json | undefined;
    // A consumed offer changed its amounts; a cancelled one was deleted without them changing.
    if (!prev || !("TakerGets" in prev || "TakerPays" in prev)) continue;
    const maker = String(node.FinalFields?.Account ?? "");
    if (maker && maker !== tx.Account) out.push({ hash: String(tx.hash ?? ""), ledger: Number(row.ledger_index ?? tx.ledger_index ?? 0), taker: String(tx.Account), maker });
  }
  return out;
}

/** Read the history. `funders` maps an account to the account that created it, where known. Pure. */
export function surveil(issuer: string, history: Json[], funders: Record<string, string> = {}): SurveillanceReport {
  const traders = new Map<string, TraderActivity>();
  const get = (a: string) => {
    if (!traders.has(a)) traders.set(a, { account: a, placed: 0, replaced: 0, cancelled: 0, filledAsMaker: 0, tookAsTaker: 0 });
    return traders.get(a)!;
  };
  const fills: Fill[] = [];
  let lo = Infinity;
  let hi = 0;
  for (const row of history) {
    const tx = (row.tx_json ?? row.tx ?? row) as Json;
    const ledger = Number(row.ledger_index ?? tx.ledger_index ?? 0);
    lo = Math.min(lo, ledger);
    hi = Math.max(hi, ledger);
    if ((row.meta ?? {}).TransactionResult !== "tesSUCCESS") continue;
    const account = String(tx.Account ?? "");
    if (tx.TransactionType === "OfferCreate") {
      const t = get(account);
      t.placed += 1;
      if (typeof tx.OfferSequence === "number") t.replaced += 1;
    } else if (tx.TransactionType === "OfferCancel") {
      get(account).cancelled += 1;
    }
    for (const f of fillsOf(row)) {
      fills.push(f);
      get(f.maker).filledAsMaker += 1;
      get(f.taker).tookAsTaker += 1;
    }
  }
  const list = [...traders.values()].sort((a, b) => b.placed + b.cancelled - (a.placed + a.cancelled));
  const findings: SurveillanceFinding[] = [];
  const orderActivity = list.reduce((n, t) => n + t.placed + t.cancelled, 0);

  for (const t of list) {
    const churn = t.replaced + t.cancelled;
    if (t.placed >= 20 && churn / t.placed >= 0.8 && t.filledAsMaker === 0) {
      findings.push({
        id: `quote-churn-${t.account}`,
        severity: "warn",
        title: `${t.account} placed ${t.placed} orders, replaced or cancelled ${churn}, and none filled`,
        detail: `Over ledgers ${lo.toLocaleString("en-US")}–${hi.toLocaleString("en-US")}. Depth that is constantly re-quoted and never trades makes the book look deeper than it is: check what can actually be filled before relying on the quoted price.`,
        accounts: [t.account],
      });
    }
  }
  const top = list[0];
  if (top && orderActivity >= 20 && (top.placed + top.cancelled) / orderActivity >= 0.5) {
    findings.push({
      id: "concentration",
      severity: "info",
      title: `One account supplied ${Math.round(((top.placed + top.cancelled) / orderActivity) * 100)}% of the order activity`,
      detail: `${top.account}: ${top.placed + top.cancelled} of ${orderActivity} order placements and cancellations in the transactions read.`,
      accounts: [top.account],
    });
  }
  const related = fills.filter((f) => funders[f.maker] && funders[f.maker] === funders[f.taker]);
  if (related.length) {
    const pairs = [...new Set(related.map((f) => `${f.taker} ↔ ${f.maker}`))];
    findings.push({ id: "self-cluster-trades", severity: "warn", title: `${related.length} trade${related.length === 1 ? "" : "s"} between accounts funded by the same account`, detail: `${pairs.slice(0, 5).join("; ")}. Trading between accounts of one owner moves the price and volume without changing who holds what.`, accounts: [...new Set(related.flatMap((f) => [f.maker, f.taker]))] });
  }
  if (!findings.length) findings.push({ id: "nothing", severity: "info", title: "No manipulation indicators in the transactions read", detail: `${history.length} transactions, ${fills.length} trade${fills.length === 1 ? "" : "s"}.`, accounts: [] });
  return { issuer, transactions: history.length, ledgers: { from: lo === Infinity ? 0 : lo, to: hi }, traders: list, fills, findings };
}

/** Read an issuer's recent history, and who created the busiest accounts, then surveil it. */
export async function surveilIssuer(issuer: string, pages = 3): Promise<SurveillanceReport> {
  const rows: Json[] = [];
  let marker: unknown;
  for (let i = 0; i < pages; i++) {
    const page = await rpc("account_tx", { account: issuer, ledger_index_min: -1, ledger_index_max: -1, forward: false, limit: 200, ...(marker ? { marker } : {}) });
    rows.push(...((page.transactions ?? []) as Json[]));
    marker = page.marker;
    if (!marker) break;
  }
  const first = surveil(issuer, rows);
  const busiest = [...new Set([...first.traders.slice(0, 10).map((t) => t.account), ...first.fills.flatMap((f) => [f.maker, f.taker])])].slice(0, 30);
  const funders: Record<string, string> = {};
  for (const a of busiest) {
    const r = await rpc("account_tx", { account: a, ledger_index_min: -1, ledger_index_max: -1, forward: true, limit: 1 }).catch(() => null);
    const tx = ((r?.transactions ?? []) as Json[])[0];
    const t = (tx?.tx_json ?? tx?.tx) as Json | undefined;
    if (t?.TransactionType === "Payment" && t.Destination === a) funders[a] = String(t.Account);
  }
  return surveil(issuer, rows, funders);
}
