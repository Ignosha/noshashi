import { rpc, XrplError } from "@/lib/xrpl/client";

/**
 * Counterparty provenance — how old this account is, and who funded it.
 *
 * The first question a compliance desk asks about an unfamiliar address is
 * not what it holds. It is how long it has existed, who put the first XRP
 * into it, and whether its behaviour matches its age. An account created
 * last week and funded by an account created the week before is a pattern;
 * a 2013 account funded by a known gateway is a different pattern.
 *
 * Three traps, all verified against mainnet on 2026-08-27:
 *
 *   1. `Sequence` is NOT a transaction count on modern accounts. Since
 *      DeletableAccounts, a newly created account's sequence starts at the
 *      LEDGER INDEX of its creation. A live AMM account reads:
 *
 *          Sequence          92,835,117
 *          creation ledger   92,835,117     <- identical
 *
 *      Reporting that as "92.8 million transactions sent" — which is what
 *      the obvious reading gives — would be wrong by the entire number. The
 *      count is derived against the creation ledger instead, and reported as
 *      an approximation because it is one.
 *
 *   2. A node with partial history cannot show you the first transaction,
 *      only the first it retains. If the earliest transaction found sits at
 *      the node's earliest retained ledger, the true origin is older and
 *      unknown — reporting that boundary as a creation date would invent an
 *      account age. The report says "at least this old" instead.
 *
 *   3. `account_tx` returns newest-first by default. Reading the "first"
 *      transaction requires `forward: true`; without it you get the most
 *      recent one and would report today as the funding date.
 */

/** Ripple epoch: 2000-01-01. */
const RIPPLE_EPOCH_OFFSET = 946_684_800;
/** The first ledger any public node retains. */
const HISTORY_GENESIS = 32_570;

export type ProvenanceReport = {
  address: string;
  balanceXrp: number;
  ownerCount: number;
  /** Raw ledger value. Do not render as a transaction count. */
  sequence: number;
  /** Ledger index of the earliest transaction found. */
  originLedger?: number;
  originDate?: Date;
  /** Who sent the first funds in, when that first event was a payment. */
  fundedBy?: string;
  fundingAmountXrp?: number;
  /** The kind of the first transaction seen (Payment, AMMCreate, …). */
  originType?: string;
  /**
   * Approximate count of transactions this account has SENT, corrected for
   * the sequence-starts-at-ledger-index rule. Undefined when it cannot be
   * derived honestly.
   */
  approxSentCount?: number;
  /** True when the origin may predate what this node retains. */
  historyIncomplete: boolean;
  nodeHistoryFrom?: number;
  ageDays?: number;
  lastActivityLedger?: number;
  readAt: string;
};

export async function readProvenance(address: string): Promise<ProvenanceReport> {
  let info: Record<string, any>;
  try {
    info = await rpc("account_info", { account: address, ledger_index: "validated" });
  } catch (caught) {
    if (caught instanceof XrplError && caught.code === "actNotFound") {
      throw new Error(
        "That address is not funded, so no account exists for it yet. An XRPL address only becomes an account once someone sends it enough XRP to meet the reserve — until then it has no history to read."
      );
    }
    if (caught instanceof XrplError && caught.code === "actMalformed") {
      throw new Error("That is not a well-formed XRPL address.");
    }
    throw caught;
  }

  const data = info.account_data ?? {};
  const sequence = Number(data.Sequence ?? 0);

  // What this node actually retains, so we can tell a real origin from the
  // edge of its history.
  let nodeHistoryFrom: number | undefined;
  try {
    const server = await rpc("server_info", {});
    const range = String(server.info?.complete_ledgers ?? "");
    const from = Number(range.split("-")[0]);
    if (Number.isFinite(from)) nodeHistoryFrom = from;
  } catch {
    /* Not fatal — we simply cannot bound the history claim. */
  }

  // forward: true is load-bearing. Without it this returns the NEWEST
  // transaction and every date below would describe today.
  let earliest: Record<string, any> | undefined;
  try {
    const first = await rpc("account_tx", {
      account: address,
      ledger_index_min: -1,
      ledger_index_max: -1,
      binary: false,
      forward: true,
      limit: 5,
    });
    earliest = (first.transactions ?? [])[0];
  } catch {
    /* Leave origin undefined rather than guessing one. */
  }

  const tx = (earliest?.tx_json ?? earliest?.tx ?? {}) as Record<string, any>;
  const originLedger =
    Number(earliest?.ledger_index ?? tx.ledger_index ?? 0) || undefined;
  const rawDate = Number(tx.date);
  const originDate = Number.isFinite(rawDate)
    ? new Date((rawDate + RIPPLE_EPOCH_OFFSET) * 1000)
    : undefined;

  const originType = tx.TransactionType ? String(tx.TransactionType) : undefined;

  // The funding source is whoever sent value in, not merely whoever acted
  // first — an account's first record can be someone else's TrustSet.
  const isInboundPayment =
    originType === "Payment" && tx.Destination === address && tx.Account !== address;
  const fundedBy = isInboundPayment ? String(tx.Account) : undefined;
  const fundingRaw = tx.Amount ?? tx.DeliverMax;
  const fundingAmountXrp =
    isInboundPayment && typeof fundingRaw === "string"
      ? Number(fundingRaw) / 1_000_000
      : undefined;

  /*
   * Sequence correction. An account created after DeletableAccounts starts
   * its sequence at the creation ledger index, so the count of transactions
   * it has sent is the distance travelled from there — not the sequence.
   */
  let approxSentCount: number | undefined;
  if (originLedger !== undefined) {
    approxSentCount =
      sequence >= originLedger
        ? sequence - originLedger // modern: seq seeded at creation ledger
        : Math.max(0, sequence - 1); // legacy: seq seeded at 1
  }

  const historyIncomplete =
    originLedger !== undefined &&
    nodeHistoryFrom !== undefined &&
    nodeHistoryFrom > HISTORY_GENESIS &&
    originLedger <= nodeHistoryFrom;

  const ageDays = originDate
    ? Math.floor((Date.now() - originDate.getTime()) / 86_400_000)
    : undefined;

  return {
    address,
    balanceXrp: Number(data.Balance ?? 0) / 1_000_000,
    ownerCount: Number(data.OwnerCount ?? 0),
    sequence,
    originLedger,
    originDate,
    fundedBy,
    fundingAmountXrp,
    originType,
    approxSentCount,
    historyIncomplete,
    nodeHistoryFrom,
    ageDays,
    lastActivityLedger: Number(data.PreviousTxnLgrSeq ?? 0) || undefined,
    readAt: new Date().toISOString(),
  };
}

export type ProvenanceFinding = {
  id: string;
  severity: "critical" | "warn" | "info" | "ok";
  title: string;
  detail: string;
  action?: string;
};

/** Below this age, an account has no track record to speak of. */
const YOUNG_DAYS = 30;
/** Established enough that its history is itself evidence. */
const ESTABLISHED_DAYS = 365;

export function provenanceFindings(report: ProvenanceReport): ProvenanceFinding[] {
  const out: ProvenanceFinding[] = [];

  if (report.historyIncomplete) {
    out.push({
      id: "history-incomplete",
      severity: "warn",
      title: "This account may be older than it appears",
      detail: `The earliest transaction found sits at ledger ${report.originLedger?.toLocaleString()}, which is the edge of what this node retains (from ${report.nodeHistoryFrom?.toLocaleString()}). Anything before that is not missing from the ledger, only from this node — so the age below is a floor, not a measurement.`,
      action: "Query a full-history node before treating the age as established.",
    });
  } else if (report.originDate && report.ageDays !== undefined) {
    if (report.ageDays < YOUNG_DAYS) {
      out.push({
        id: "young-account",
        severity: "warn",
        title: `This account is ${report.ageDays} day${report.ageDays === 1 ? "" : "s"} old`,
        detail: `First seen ${report.originDate.toISOString().slice(0, 10)}. An account this new has no track record — nothing about its history can corroborate or contradict what its operator tells you.`,
        action: "Weight the counterparty's off-ledger identity accordingly.",
      });
    } else if (report.ageDays >= ESTABLISHED_DAYS) {
      out.push({
        id: "established",
        severity: "ok",
        title: `Continuously on the ledger for ${(report.ageDays / 365).toFixed(1)} years`,
        detail: `First seen ${report.originDate.toISOString().slice(0, 10)} at ledger ${report.originLedger?.toLocaleString()}. A record of this length is difficult to manufacture after the fact.`,
      });
    } else {
      out.push({
        id: "moderate-age",
        severity: "info",
        title: `On the ledger for ${report.ageDays.toLocaleString()} days`,
        detail: `First seen ${report.originDate.toISOString().slice(0, 10)}.`,
      });
    }
  }

  if (report.fundedBy) {
    out.push({
      id: "funding-source",
      severity: "info",
      title: `Funded by ${report.fundedBy}`,
      detail: `The first inbound payment was ${report.fundingAmountXrp?.toLocaleString(undefined, { maximumFractionDigits: 6 }) ?? "an amount"} XRP from that account. Whoever funded an address is the strongest on-ledger link it has to anyone, because it cannot be undone or edited afterwards.`,
      action: "Run that funding account through this same screen.",
    });
  } else if (report.originType) {
    out.push({
      id: "origin-not-payment",
      severity: "info",
      title: `The earliest record is ${/^[AEIOU]/i.test(report.originType) ? "an" : "a"} ${report.originType}, not a payment in`,
      detail:
        "No inbound funding payment appears at the start of this account's history, so no funding counterparty can be named from it. That is an absence of evidence, not evidence of an absence.",
    });
  }

  /* The sequence trap, stated explicitly because the raw number invites the
     wrong reading and users will see it in other tools. */
  if (report.approxSentCount !== undefined && report.originLedger !== undefined) {
    const seeded = report.sequence >= report.originLedger;
    out.push({
      id: "activity",
      severity: "info",
      title: `Approximately ${report.approxSentCount.toLocaleString()} transactions sent`,
      detail: seeded
        ? `The account's sequence number reads ${report.sequence.toLocaleString()}, but that is not a count. Accounts created after the DeletableAccounts amendment have their sequence seeded to the ledger index they were created at (${report.originLedger.toLocaleString()} here), so the number of transactions actually sent is the difference — roughly ${report.approxSentCount.toLocaleString()}.`
        : `This account predates sequence seeding, so its sequence of ${report.sequence.toLocaleString()} does count upward from one.`,
    });
  }

  if (report.ownerCount === 0 && report.balanceXrp > 0) {
    out.push({
      id: "no-objects",
      severity: "info",
      title: "The account holds no trust lines, offers or escrows",
      detail: `It carries ${report.balanceXrp.toLocaleString(undefined, { maximumFractionDigits: 6 })} XRP and nothing else. An address used purely to hold and move XRP looks like this; so does a freshly prepared one.`,
    });
  }

  const rank = { critical: 0, warn: 1, info: 2, ok: 3 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
