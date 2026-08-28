import { rpc, XrplError } from "@/lib/xrpl/client";

/**
 * Settlement forensics — what a transaction actually moved.
 *
 * This exists because of one field. A Payment carries `Amount`, which is what
 * the sender asked to deliver, and its metadata carries `delivered_amount`,
 * which is what arrived. On a partial payment those differ, and the
 * transaction still returns `tesSUCCESS`.
 *
 * Crediting `Amount` instead of `delivered_amount` is the single most
 * expensive integrity mistake available on this ledger — it is how exchanges
 * have been drained. Verified live on 2026-08-27, three of 223 consecutive
 * payments carried the partial flag, and one of them looked like this:
 *
 *     Amount            999,332.8758813435 LRC
 *     delivered_amount    3,958.6406220523 LRC     <- 0.396%
 *     TransactionResult   tesSUCCESS
 *
 * A system reading `Amount` credits two hundred and fifty times what it
 * received, and its own logs show a successful payment for the full sum.
 *
 * Three further traps this module refuses to fall into:
 *
 *   1. `validated` must be true before any of this means anything. An
 *      unvalidated transaction can still disappear. "Not yet final" is a
 *      distinct answer from "settled", and never rendered as settled.
 *
 *   2. `delivered_amount` comes back as the literal string "unavailable" for
 *      payments in very old ledgers, where the field was not recorded.
 *      Unavailable is unknown, not zero, and is reported as unknown.
 *
 *   3. Non-Payment transactions have no `delivered_amount` at all. Their
 *      absence is meaningless, not a delivery of nothing.
 */

/** tfPartialPayment. */
const TF_PARTIAL_PAYMENT = 0x00020000;

export type Amount =
  | { kind: "xrp"; drops: number; value: number }
  | { kind: "iou"; currency: string; issuer: string; value: number };

export type SettlementReport = {
  hash: string;
  /** False means nothing here is final yet. */
  validated: boolean;
  transactionType: string;
  result: string;
  succeeded: boolean;
  account: string;
  destination?: string;
  ledgerIndex?: number;
  feeDrops: number;
  /** What the sender asked to deliver. Payments only. */
  requested?: Amount;
  /** What actually arrived. undefined when not applicable or not recorded. */
  delivered?: Amount;
  /** True when the ledger did not record a delivered amount for this payment. */
  deliveredUnavailable: boolean;
  partialFlagSet: boolean;
  /** delivered / requested, when both are known and same-currency. */
  deliveredFraction?: number;
  readAt: string;
};

function parseAmount(raw: unknown): Amount | undefined {
  if (typeof raw === "string") {
    const drops = Number(raw);
    if (!Number.isFinite(drops)) return undefined;
    return { kind: "xrp", drops, value: drops / 1_000_000 };
  }
  if (raw && typeof raw === "object") {
    const a = raw as Record<string, unknown>;
    const value = Number(a.value);
    if (!Number.isFinite(value)) return undefined;
    return {
      kind: "iou",
      currency: String(a.currency ?? ""),
      issuer: String(a.issuer ?? ""),
      value,
    };
  }
  return undefined;
}

export function formatAmount(amount: Amount): string {
  if (amount.kind === "xrp") {
    return `${amount.value.toLocaleString(undefined, { maximumFractionDigits: 6 })} XRP`;
  }
  // 160-bit hex currency codes carry an ASCII name padded with zeroes.
  let code = amount.currency;
  if (/^[0-9A-F]{40}$/i.test(code)) {
    const decoded = (code.match(/../g) ?? [])
      .map((b) => String.fromCharCode(parseInt(b, 16)))
      .join("")
      .replace(/\0+$/, "")
      .trim();
    if (decoded && /^[\x20-\x7E]+$/.test(decoded)) code = decoded;
  }
  return `${amount.value.toLocaleString(undefined, { maximumFractionDigits: 10 })} ${code}`;
}

/** Same asset? Comparing across currencies would be meaningless. */
function comparable(a: Amount, b: Amount): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "xrp") return true;
  return a.currency === (b as typeof a).currency && a.issuer === (b as typeof a).issuer;
}

export async function readSettlement(hash: string): Promise<SettlementReport> {
  /*
   * `rpc` rejects with an XrplError carrying rippled's error code; it does
   * not return one on the result. Reading `res.error` here would be dead
   * code and the useful message would never reach the user.
   */
  let res: Record<string, any>;
  try {
    res = await rpc("tx", { transaction: hash.trim() });
  } catch (caught) {
    if (caught instanceof XrplError && caught.code === "txnNotFound") {
      throw new Error(
        "No transaction with that hash is in this node's history. It may never have existed, or the node may not retain ledgers that far back."
      );
    }
    throw caught;
  }

  // The `tx` command returns fields flat on current rippled and nested under
  // tx_json on others. Accept either rather than assuming a version.
  const tx = (res.tx_json ?? res) as Record<string, any>;
  const meta = (res.meta ?? res.metaData ?? {}) as Record<string, any>;

  const transactionType = String(tx.TransactionType ?? "unknown");
  const result = String(meta.TransactionResult ?? "unknown");
  const flags = Number(tx.Flags ?? 0);

  // Amount was renamed DeliverMax in newer API versions; both may be present.
  const requested =
    transactionType === "Payment"
      ? parseAmount(tx.DeliverMax ?? tx.Amount)
      : undefined;

  const rawDelivered = meta.delivered_amount ?? meta.DeliveredAmount;
  const deliveredUnavailable = rawDelivered === "unavailable";
  const delivered = deliveredUnavailable ? undefined : parseAmount(rawDelivered);

  let deliveredFraction: number | undefined;
  if (requested && delivered && comparable(requested, delivered) && requested.value > 0) {
    deliveredFraction = delivered.value / requested.value;
  }

  return {
    hash: String(tx.hash ?? res.hash ?? hash),
    validated: res.validated === true,
    transactionType,
    result,
    succeeded: result.startsWith("tes"),
    account: String(tx.Account ?? ""),
    destination: tx.Destination ? String(tx.Destination) : undefined,
    ledgerIndex: Number(res.ledger_index ?? tx.ledger_index ?? 0) || undefined,
    feeDrops: Number(tx.Fee ?? 0),
    requested,
    delivered,
    deliveredUnavailable,
    partialFlagSet: (flags & TF_PARTIAL_PAYMENT) !== 0,
    deliveredFraction,
    readAt: new Date().toISOString(),
  };
}

export type SettlementFinding = {
  id: string;
  severity: "critical" | "warn" | "info" | "ok";
  title: string;
  detail: string;
  action?: string;
};

/** Below this fraction delivered, the gap is the story. */
const SHORTFALL_FLOOR = 0.999999;

export function settlementFindings(report: SettlementReport): SettlementFinding[] {
  const out: SettlementFinding[] = [];

  if (!report.validated) {
    out.push({
      id: "not-validated",
      severity: "critical",
      title: "This transaction is not validated",
      detail:
        "The node returned it, but it is not in a validated ledger. Until it is, it can still fail or vanish, and nothing below describes a settled outcome.",
      action: "Do not credit anything against this transaction yet.",
    });
  }

  if (!report.succeeded) {
    out.push({
      id: "failed",
      severity: "warn",
      title: `The transaction did not succeed (${report.result})`,
      detail: `Nothing was delivered. The ${(report.feeDrops / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} XRP fee was still burned — a failed transaction costs its sender the fee and changes no balances otherwise.`,
      action: "Treat this as a non-event for settlement, not as a pending one.",
    });
    return out;
  }

  if (report.transactionType !== "Payment") {
    out.push({
      id: "not-payment",
      severity: "info",
      title: `This is a ${report.transactionType}, not a Payment`,
      detail:
        "It carries no delivered amount because none applies. That absence is not a delivery of nothing — this transaction type does not move a payment balance at all.",
    });
    return out;
  }

  if (report.deliveredUnavailable) {
    out.push({
      id: "delivered-unavailable",
      severity: "warn",
      title: "The delivered amount was never recorded",
      detail:
        "The ledger returns `unavailable` for this payment, which happens in ledgers old enough to predate the field. What arrived is unknown — it is specifically not zero, and not the requested amount either.",
      action:
        "Reconstruct the movement from the affected balances in the metadata before crediting anything.",
    });
    return out;
  }

  // The headline case.
  if (report.partialFlagSet) {
    const fraction = report.deliveredFraction;
    const shortfall =
      fraction !== undefined && fraction < SHORTFALL_FLOOR
        ? 1 / Math.max(fraction, Number.MIN_VALUE)
        : undefined;

    if (fraction !== undefined && fraction < SHORTFALL_FLOOR) {
      out.push({
        id: "partial-shortfall",
        severity: "critical",
        title: `Only ${(fraction * 100).toFixed(4)}% of the requested amount arrived`,
        detail: `This payment is flagged tfPartialPayment and returned ${report.result}. It asked to deliver ${report.requested ? formatAmount(report.requested) : "—"} and actually delivered ${report.delivered ? formatAmount(report.delivered) : "—"}. Any system that credits the requested figure over-credits by roughly ${shortfall && Number.isFinite(shortfall) ? `${shortfall.toFixed(0)}x` : "an unbounded factor"}.`,
        action:
          "Credit delivered_amount. The success code and the requested amount are both true and both irrelevant to what you received.",
      });
    } else {
      out.push({
        id: "partial-full",
        severity: "warn",
        title: "Partial payment permitted, but it delivered in full",
        detail: `The sender set tfPartialPayment, which allows the ledger to deliver less than requested. This time it delivered ${report.delivered ? formatAmount(report.delivered) : "—"}, the full requested amount. The flag is a property of the sender's instruction, not of this outcome.`,
        action:
          "The same sender can send less next time under the same flag. Read delivered_amount every time.",
      });
    }
  } else if (report.delivered) {
    out.push({
      id: "settled",
      severity: "ok",
      title: `Settled in full — ${formatAmount(report.delivered)}`,
      detail: `The payment is validated, returned ${report.result}, and is not flagged for partial delivery. The requested and delivered amounts agree.`,
    });
  }

  if (report.destination && report.destination === report.account) {
    out.push({
      id: "self-payment",
      severity: "info",
      title: "The sender and the destination are the same account",
      detail:
        "This is a payment to itself, which on XRPL is how a circular trade through the order books is executed. It is a trading operation rather than a transfer to a counterparty.",
    });
  }

  const rank = { critical: 0, warn: 1, info: 2, ok: 3 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
