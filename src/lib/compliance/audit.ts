import { rpc, XrplError } from "@/lib/xrpl/client";
import { sanctionsFor, type SanctionEntry } from "@/lib/xrpl/sanctions";
import { threatsFor, type ThreatHit } from "@/lib/security/threats";
import { toCsv } from "@/lib/format";
import { canonical, sha256Hex } from "./registry";

/**
 * The audit trail a compliance officer files: every validated transaction
 * of an account, with what was actually delivered (not the Amount field,
 * which a partial payment makes a lie), the destination tag that ties it to
 * a customer, memos, and every counterparty screened against the OFAC SDN
 * list and the confirmed scam registry. Exports as CSV with a manifest that
 * carries the CSV's SHA-256 and the ledger range, so the file can be shown
 * to be the one produced.
 */

const RIPPLE_EPOCH = 946_684_800;
const TF_PARTIAL_PAYMENT = 0x0002_0000;
const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

export type Delivered = { currency: string; issuer: string | null; value: string };

export type AuditRow = {
  hash: string;
  ledger: number;
  /** ISO 8601, from the ledger's close time. */
  date: string;
  type: string;
  result: string;
  direction: "in" | "out" | "other";
  counterparty: string | null;
  delivered: Delivered | null;
  /** Delivered XRP, when what moved was XRP. */
  deliveredXrp: number | null;
  destinationTag: number | null;
  sourceTag: number | null;
  memos: string[];
  feeXrp: number;
  /** A partial payment that delivered less than its Amount field says. */
  partial: boolean;
};

function hexText(hex: unknown): string | null {
  if (typeof hex !== "string" || !hex || hex.length % 2 || !/^[0-9A-Fa-f]+$/.test(hex)) return null;
  try {
    const bytes = new Uint8Array(hex.length / 2).map((_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return /[\x00-\x08\x0E-\x1F]/.test(text) ? null : text;
  } catch {
    return null;
  }
}

/**
 * a < b for XRPL decimal strings, exactly. Token amounts carry up to 16
 * significant digits, more than a double keeps: 593.8292727371549 and
 * 593.829272737155 are the same Number, and a partial payment short by the
 * difference would pass as whole.
 */
export function decimalLess(a: string, b: string): boolean {
  const scaled = (v: string): bigint => {
    const m = /^(-?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(v.trim());
    if (!m) return 0n;
    const digits = `${m[2] || "0"}${m[3] ?? ""}`;
    const shift = 40 + Number(m[4] ?? 0) - (m[3]?.length ?? 0);
    const n = shift >= 0 ? BigInt(digits) * 10n ** BigInt(shift) : BigInt(digits) / 10n ** BigInt(-shift);
    return m[1] ? -n : n;
  };
  return scaled(a) < scaled(b);
}

function amountOf(a: unknown): Delivered | null {
  if (typeof a === "string" && /^\d+$/.test(a)) return { currency: "XRP", issuer: null, value: String(Number(a) / 1e6) };
  if (a && typeof a === "object") {
    const o = a as Record<string, unknown>;
    if (typeof o.value === "string" && typeof o.currency === "string") {
      const code = o.currency.length === 40 ? hexText(o.currency.replace(/(00)+$/, "")) ?? o.currency : o.currency;
      return { currency: code, issuer: typeof o.issuer === "string" ? o.issuer : null, value: o.value };
    }
  }
  return null;
}

/** One `account_tx` entry, shaped for the trail. `subject` is the account being audited. */
export function auditRowFromTx(entry: Record<string, any>, subject: string): AuditRow {
  const tx = entry.tx_json ?? entry.tx ?? {};
  const meta = entry.meta ?? {};
  const type = String(tx.TransactionType ?? "UNKNOWN");
  const sender = typeof tx.Account === "string" ? tx.Account : null;
  const destination = typeof tx.Destination === "string" ? tx.Destination : null;
  const direction: AuditRow["direction"] = sender === subject ? (destination ? "out" : "other") : destination === subject ? "in" : "other";
  const counterparty = direction === "out" ? destination : direction === "in" ? sender : sender !== subject ? sender : null;
  const delivered = amountOf(meta.delivered_amount ?? meta.DeliveredAmount);
  const stated = amountOf(tx.DeliverMax ?? tx.Amount);
  const partial =
    type === "Payment" &&
    (Number(tx.Flags ?? 0) & TF_PARTIAL_PAYMENT) !== 0 &&
    delivered !== null &&
    stated !== null &&
    delivered.currency === stated.currency &&
    decimalLess(delivered.value, stated.value);
  const closeTime = Number(tx.date ?? entry.close_time_iso ?? 0);
  const date = entry.close_time_iso ? String(entry.close_time_iso) : new Date((closeTime + RIPPLE_EPOCH) * 1000).toISOString();
  const memos: string[] = [];
  for (const m of (tx.Memos ?? []) as Array<{ Memo?: Record<string, string> }>) {
    const text = hexText(m.Memo?.MemoData) ?? hexText(m.Memo?.MemoType);
    if (text) memos.push(text.slice(0, 280));
  }
  const successful = meta.TransactionResult === "tesSUCCESS";
  return {
    hash: String(tx.hash ?? entry.hash ?? ""),
    ledger: Number(entry.ledger_index ?? tx.ledger_index ?? 0),
    date,
    type,
    result: String(meta.TransactionResult ?? "—"),
    direction,
    counterparty,
    delivered: successful ? delivered : null,
    deliveredXrp: successful && delivered?.currency === "XRP" ? Number(delivered.value) : null,
    destinationTag: Number.isInteger(tx.DestinationTag) ? tx.DestinationTag : null,
    sourceTag: Number.isInteger(tx.SourceTag) ? tx.SourceTag : null,
    memos,
    feeXrp: Number(tx.Fee ?? 0) / 1e6,
    partial,
  };
}

export type TrailPage = { rows: AuditRow[]; marker: unknown | null };

/** One page (up to 200) of validated history, newest first. */
export async function readTrailPage(subject: string, marker?: unknown): Promise<TrailPage> {
  try {
    const r = await rpc("account_tx", {
      account: subject,
      ledger_index_min: -1,
      ledger_index_max: -1,
      forward: false,
      limit: 200,
      ...(marker ? { marker } : {}),
    });
    const rows = ((r.transactions ?? []) as Array<Record<string, any>>).filter((e) => e.validated !== false).map((e) => auditRowFromTx(e, subject));
    return { rows, marker: r.marker ?? null };
  } catch (e) {
    if (e instanceof XrplError && e.code === "actNotFound") return { rows: [], marker: null };
    throw e;
  }
}

export type Screening = {
  sanctions: Record<string, SanctionEntry>;
  threats: Record<string, ThreatHit>;
  /** Lists that could not be read. An unread list is never reported as clear. */
  unchecked: string[];
  screened: number;
};

/** Every distinct counterparty, against the OFAC SDN list and the scam registry, 50 at a time. */
export async function screenCounterparties(rows: AuditRow[]): Promise<Screening> {
  const accounts = [...new Set(rows.map((r) => r.counterparty).filter((a): a is string => !!a && ADDRESS.test(a)))];
  const out: Screening = { sanctions: {}, threats: {}, unchecked: [], screened: accounts.length };
  for (let i = 0; i < accounts.length; i += 50) {
    const batch = accounts.slice(i, i + 50);
    const [s, t] = await Promise.all([sanctionsFor(batch), threatsFor(batch)]);
    if (s === null) out.unchecked.push("OFAC SDN list");
    else Object.assign(out.sanctions, s.hits);
    if (t === null) out.unchecked.push("scam registry");
    else Object.assign(out.threats, t);
  }
  out.unchecked = [...new Set(out.unchecked)];
  return out;
}

export type EvidencePackage = { csv: string; manifest: string; digest: string };

/** The CSV and its manifest. The manifest names the CSV's SHA-256, so the file can be verified. */
export async function evidencePackage(subject: string, rows: AuditRow[], screening: Screening | null, thresholdXrp: number): Promise<EvidencePackage> {
  const csv = toCsv(
    rows.map((r) => ({
      hash: r.hash,
      ledger_index: r.ledger,
      date_utc: r.date,
      type: r.type,
      result: r.result,
      direction: r.direction,
      counterparty: r.counterparty ?? "",
      delivered_value: r.delivered?.value ?? "",
      delivered_currency: r.delivered?.currency ?? "",
      delivered_issuer: r.delivered?.issuer ?? "",
      destination_tag: r.destinationTag ?? "",
      source_tag: r.sourceTag ?? "",
      fee_xrp: r.feeXrp,
      partial_payment: r.partial,
      above_threshold: r.deliveredXrp !== null && r.deliveredXrp >= thresholdXrp,
      counterparty_sanctioned: !!(r.counterparty && screening?.sanctions[r.counterparty]),
      counterparty_reported_scam: !!(r.counterparty && screening?.threats[r.counterparty]),
      memos: r.memos.join(" | "),
      subject,
    }))
  );
  const digest = await sha256Hex(csv);
  const ledgers = rows.map((r) => r.ledger).filter((n) => n > 0);
  const manifest = canonical({
    kind: "noshashi.audit_trail",
    subject,
    rows: rows.length,
    ledger_min: ledgers.length ? Math.min(...ledgers) : null,
    ledger_max: ledgers.length ? Math.max(...ledgers) : null,
    csv_sha256: digest,
    threshold_xrp: thresholdXrp,
    screening: screening ? { counterparties: screening.screened, sanctioned: Object.keys(screening.sanctions).length, reported: Object.keys(screening.threats).length, unchecked: screening.unchecked } : null,
    generated_at: new Date().toISOString(),
    source: "account_tx, validated ledgers only",
  });
  return { csv, manifest, digest };
}
