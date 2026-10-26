/**
 * Payment verification for the hosted API: did this XRPL transaction pay
 * this invoice?
 *
 * A line-for-line port of the desktop engine (src-tauri/src/verify:
 * amount.rs, verifier.rs, evidence.rs, rpc.rs). Same reason codes, same
 * order of checks, same canonical evidence, same digests: the shared
 * vectors in tests/fixtures/payment-verify-vectors.json are checked by
 * both `cargo test` (t36) and src/lib/desk/__tests__/payment-hosted.test.ts,
 * so a rule that drifts on one side fails the other's test.
 *
 * The module has no imports so the Vite test suite executes it unmodified.
 * SHA-256 comes from WebCrypto, which Deno and Node both provide.
 */

export const RULES_VERSION = "xrpl-payment/1";
export const EVIDENCE_SCHEMA = "noshashi.xrpl-payment-evidence/1";
export const TF_PARTIAL_PAYMENT = 0x0002_0000;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

/* ------------------------------------------------------------------ */
/* Exact decimals (amount.rs)                                          */
/* ------------------------------------------------------------------ */

/** sign × digits × 10^exponent. Zero has no digits. No floating point. */
export type Decimal = { negative: boolean; digits: string; exponent: number };

export class AmountError extends Error {}

const DROPS_PER_XRP_EXPONENT = -6;
const MAX_DROPS = 100_000_000_000_000_000n;
const MAX_IOU_DIGITS = 16;
const MAX_ABS_EXPONENT = 400;

export const ZERO: Decimal = { negative: false, digits: "", exponent: 0 };

const isZero = (d: Decimal) => d.digits === "";
const isNegative = (d: Decimal) => d.negative && !isZero(d);
const isDigits = (s: string) => /^[0-9]*$/.test(s);

function normalized(negative: boolean, digits: string, exponent: number): Decimal {
  const lead = digits.replace(/^0+/, "");
  const trimmed = lead.replace(/0+$/, "");
  if (!trimmed) return ZERO;
  return { negative, digits: trimmed, exponent: exponent + (lead.length - trimmed.length) };
}

function malformed(input: string): AmountError {
  return new AmountError(`not a decimal amount: ${JSON.stringify([...input].slice(0, 40).join(""))}`);
}

export function parseDecimal(input: string): Decimal {
  if (input === "") throw new AmountError("empty amount");
  let negative = false;
  let rest = input;
  if (input[0] === "-" || input[0] === "+") {
    negative = input[0] === "-";
    rest = input.slice(1);
  }
  const e = rest.search(/[eE]/);
  const mantissa = e >= 0 ? rest.slice(0, e) : rest;
  const expPart = e >= 0 ? rest.slice(e + 1) : null;
  const dot = mantissa.indexOf(".");
  const intPart = dot >= 0 ? mantissa.slice(0, dot) : mantissa;
  const fracPart = dot >= 0 ? mantissa.slice(dot + 1) : "";
  if (!intPart && !fracPart) throw malformed(input);
  if (!isDigits(intPart) || !isDigits(fracPart)) throw malformed(input);
  let exp = 0;
  if (expPart !== null) {
    const digits = expPart.replace(/^[-+]/, "");
    if (!digits || digits.length > 6 || !isDigits(digits)) throw malformed(input);
    exp = Number(expPart);
  }
  if (Math.abs(exp) > MAX_ABS_EXPONENT) throw new AmountError("amount out of range");
  return normalized(negative, intPart + fracPart, exp - fracPart.length);
}

export function decimalFromDrops(drops: string): Decimal {
  if (drops === "") throw new AmountError("empty amount");
  if (drops.startsWith("-")) throw new AmountError("negative amount");
  if (!isDigits(drops) || drops.length > 18) throw malformed(drops);
  if (BigInt(drops) > MAX_DROPS) throw new AmountError("amount out of range");
  return normalized(false, drops, DROPS_PER_XRP_EXPONENT);
}

export function decimalFromIou(value: string): Decimal {
  const d = parseDecimal(value);
  if (isNegative(d)) throw new AmountError("negative amount");
  if (d.digits.length > MAX_IOU_DIGITS) throw new AmountError("more precision than the asset allows");
  return d;
}

/** Whole drops, or why the value is not a whole number of drops. */
export function toDrops(d: Decimal): bigint {
  if (isNegative(d)) throw new AmountError("negative amount");
  if (isZero(d)) return 0n;
  const shift = d.exponent - DROPS_PER_XRP_EXPONENT;
  if (shift < 0) throw new AmountError("more precision than the asset allows");
  if (d.digits.length + shift > 18) throw new AmountError("amount out of range");
  const n = BigInt(d.digits + "0".repeat(shift));
  if (n > MAX_DROPS) throw new AmountError("amount out of range");
  return n;
}

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function cmpAbs(a: Decimal, b: Decimal): number {
  if (isZero(a) || isZero(b)) return isZero(a) === isZero(b) ? 0 : isZero(a) ? -1 : 1;
  const ma = a.digits.length + a.exponent;
  const mb = b.digits.length + b.exponent;
  if (ma !== mb) return ma < mb ? -1 : 1;
  const n = Math.max(a.digits.length, b.digits.length);
  return cmpStr(a.digits.padEnd(n, "0"), b.digits.padEnd(n, "0"));
}

export function compare(a: Decimal, b: Decimal): number {
  const na = isNegative(a);
  const nb = isNegative(b);
  if (!na && nb) return 1;
  if (na && !nb) return -1;
  return na ? cmpAbs(b, a) : cmpAbs(a, b);
}

export const negated = (d: Decimal): Decimal => (isZero(d) ? d : { ...d, negative: !d.negative });

function cmpDigitStrings(a: string, b: string): number {
  const x = a.replace(/^0+/, "");
  const y = b.replace(/^0+/, "");
  return x.length !== y.length ? (x.length < y.length ? -1 : 1) : cmpStr(x, y);
}

export function add(a: Decimal, b: Decimal): Decimal {
  if (isZero(a)) return b;
  if (isZero(b)) return a;
  const exp = Math.min(a.exponent, b.exponent);
  const x = BigInt(a.digits + "0".repeat(a.exponent - exp));
  const y = BigInt(b.digits + "0".repeat(b.exponent - exp));
  if (a.negative === b.negative) return normalized(a.negative, (x + y).toString(), exp);
  const order = cmpDigitStrings(x.toString(), y.toString());
  if (order === 0) return ZERO;
  return order > 0 ? normalized(a.negative, (x - y).toString(), exp) : normalized(b.negative, (y - x).toString(), exp);
}

export const sub = (a: Decimal, b: Decimal) => add(a, negated(b));

export function toPlain(d: Decimal): string {
  if (isZero(d)) return "0";
  const sign = d.negative ? "-" : "";
  if (d.exponent >= 0) return `${sign}${d.digits}${"0".repeat(d.exponent)}`;
  const frac = -d.exponent;
  if (d.digits.length > frac) {
    const cut = d.digits.length - frac;
    return `${sign}${d.digits.slice(0, cut)}.${d.digits.slice(cut)}`;
  }
  return `${sign}0.${"0".repeat(frac - d.digits.length)}${d.digits}`;
}

/* ------------------------------------------------------------------ */
/* Assets and ledger amounts                                           */
/* ------------------------------------------------------------------ */

export type Asset = { kind: "xrp" } | { kind: "issued"; currency: string; issuer: string };
export type Amount = { asset: Asset; value: Decimal };

/** Currency and issuer; 40-hex currency codes compare case-insensitively. */
export function sameAsset(a: Asset, b: Asset): boolean {
  if (a.kind === "xrp" || b.kind === "xrp") return a.kind === b.kind;
  const currency =
    a.currency.length === 40 && b.currency.length === 40
      ? a.currency.toUpperCase() === b.currency.toUpperCase()
      : a.currency === b.currency;
  return currency && a.issuer === b.issuer;
}

type Parsed = { kind: "known"; amount: Amount } | { kind: "unsupported"; what: string } | { kind: "malformed"; why: string };

const isObject = (v: unknown): v is JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);
const has = (o: JsonObject, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export function parseLedgerAmount(raw: Json): Parsed {
  if (typeof raw === "string") {
    try {
      return { kind: "known", amount: { asset: { kind: "xrp" }, value: decimalFromDrops(raw) } };
    } catch (e) {
      return { kind: "malformed", why: `XRP drops: ${(e as Error).message}` };
    }
  }
  if (isObject(raw)) {
    if (has(raw, "mpt_issuance_id")) return { kind: "unsupported", what: "multi-purpose token (MPT) amount" };
    if (!has(raw, "currency") || !has(raw, "issuer") || !has(raw, "value")) {
      return { kind: "unsupported", what: "amount object without currency, issuer and value" };
    }
    const { currency: c, issuer: i, value: v } = raw;
    if (typeof c !== "string" || typeof i !== "string" || typeof v !== "string") {
      return { kind: "malformed", why: "issued amount fields are not strings" };
    }
    if (c === "XRP" || !c || !i) return { kind: "malformed", why: "issued amount with XRP or empty currency, or no issuer" };
    try {
      return { kind: "known", amount: { asset: { kind: "issued", currency: c, issuer: i }, value: decimalFromIou(v) } };
    } catch (e) {
      return { kind: "malformed", why: `issued value: ${(e as Error).message}` };
    }
  }
  return { kind: "malformed", why: "amount is neither a drops string nor an object" };
}

/* ------------------------------------------------------------------ */
/* Canonical evidence (evidence.rs)                                    */
/* ------------------------------------------------------------------ */

function utf8Compare(a: string, b: string): number {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

/** Object keys sorted by UTF-8 bytes at every depth, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    const keys = Object.keys(value).sort(utf8Compare);
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function hexSha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
}

export const digest = (value: unknown) => hexSha256(canonicalJson(value));

/* ------------------------------------------------------------------ */
/* Contract (model.rs)                                                 */
/* ------------------------------------------------------------------ */

export type Network = "mainnet" | "testnet";
export type Status = "VERIFIED" | "HOLD" | "REJECTED";

export const REASON_STATUS = {
  SETTLED: "VERIFIED",
  SETTLED_PARTIAL_PERMITTED: "VERIFIED",
  INVALID_HASH: "REJECTED",
  TRANSACTION_FAILED: "REJECTED",
  NOT_PAYMENT: "REJECTED",
  ASSET_MISMATCH: "REJECTED",
  DESTINATION_MISMATCH: "REJECTED",
  DESTINATION_TAG_MISMATCH: "REJECTED",
  UNDERPAID: "REJECTED",
  PARTIAL_NOT_PERMITTED: "REJECTED",
  ALREADY_APPLIED: "REJECTED",
  INVALID_POLICY: "REJECTED",
  HASH_MISMATCH: "HOLD",
  NO_INVOICE_POLICY: "HOLD",
  NOT_FOUND: "HOLD",
  NOT_VALIDATED: "HOLD",
  MISSING_METADATA: "HOLD",
  MISSING_RESULT: "HOLD",
  DELIVERED_UNAVAILABLE: "HOLD",
  DELIVERED_MISSING: "HOLD",
  UNSUPPORTED_ASSET: "HOLD",
  MALFORMED_AMOUNT: "HOLD",
  MALFORMED_RESPONSE: "HOLD",
  OVERPAID_REVIEW: "HOLD",
  SOURCE_UNAVAILABLE: "HOLD",
  SOURCE_DISAGREEMENT: "HOLD",
  PARTIAL_PAYMENT_FLAGGED: "HOLD",
} as const satisfies Record<string, Status>;

export type Reason = keyof typeof REASON_STATUS;

export type InvoicePolicy = {
  invoice_id: string;
  destination: string;
  destination_tag: number | null;
  asset: Asset;
  expected_amount: Decimal;
  underpayment_tolerance: Decimal | null;
  allow_partial_payment: boolean;
  hold_overpayment: boolean;
};

export type Observation = {
  source: string;
  observed_at: string;
  returned_hash: string | null;
  validated: boolean | null;
  ledger_index: number | null;
  transaction_type: string | null;
  transaction_result: string | null;
  account: string | null;
  destination: string | null;
  destination_tag: number | null;
  flags: number | null;
  /** Absent is `undefined`; a JSON null the node sent is `null`. */
  requested_raw: Json | undefined;
  delivered_raw: Json | undefined;
  has_meta: boolean;
};

export type SourceRead =
  | { status: "observed"; observation: Observation }
  | { status: "not_found"; source: string; observed_at: string }
  | { status: "failed"; source: string; observed_at: string; error: string };

export type Finding = { code: Reason; explanation: string };

/* ------------------------------------------------------------------ */
/* Invoice input                                                       */
/* ------------------------------------------------------------------ */

const U32_MAX = 4_294_967_295;

/**
 * The invoice as the Rust command deserialises it: strings for money,
 * optional fields may be absent or null, unknown fields are ignored.
 * Returns the reason it is unreadable instead of throwing.
 */
export function parseInvoice(raw: unknown): InvoicePolicy | string {
  if (!isObject(raw)) return "invoice must be a JSON object.";
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : null);
  const invoiceId = str("invoice_id");
  if (invoiceId === null) return "invoice.invoice_id must be a string.";
  const destination = str("destination");
  if (destination === null) return "invoice.destination must be a string.";
  let tag: number | null = null;
  if (raw.destination_tag !== undefined && raw.destination_tag !== null) {
    const t = raw.destination_tag;
    if (typeof t !== "number" || !Number.isInteger(t) || t < 0 || t > U32_MAX) return "invoice.destination_tag must be a whole number up to 4294967295.";
    tag = t;
  }
  const a = raw.asset;
  let asset: Asset;
  if (isObject(a) && a.kind === "xrp") asset = { kind: "xrp" };
  else if (isObject(a) && a.kind === "issued" && typeof a.currency === "string" && typeof a.issuer === "string") {
    asset = { kind: "issued", currency: a.currency, issuer: a.issuer };
  } else return 'invoice.asset must be {"kind":"xrp"} or {"kind":"issued","currency","issuer"}.';
  const decimal = (k: string, required: boolean): Decimal | null | string => {
    const v = raw[k];
    if (v === undefined || v === null) return required ? `invoice.${k} is required, as a decimal string.` : null;
    if (typeof v !== "string") return `invoice.${k} must be a decimal string, like "125.50", never a JSON number.`;
    try {
      return parseDecimal(v);
    } catch (e) {
      return `invoice.${k}: ${(e as Error).message}.`;
    }
  };
  const expected = decimal("expected_amount", true);
  if (typeof expected === "string" || expected === null) return expected ?? "invoice.expected_amount is required.";
  const tolerance = decimal("underpayment_tolerance", false);
  if (typeof tolerance === "string") return tolerance;
  for (const k of ["allow_partial_payment", "hold_overpayment"]) {
    if (raw[k] !== undefined && typeof raw[k] !== "boolean") return `invoice.${k} must be true or false.`;
  }
  return {
    invoice_id: invoiceId,
    destination,
    destination_tag: tag,
    asset,
    expected_amount: expected,
    underpayment_tolerance: tolerance,
    allow_partial_payment: raw.allow_partial_payment === true,
    hold_overpayment: raw.hold_overpayment === true,
  };
}

/** The invoice exactly as serde serialises it, for keys and evidence. */
export function invoiceJson(p: InvoicePolicy): JsonObject {
  return {
    invoice_id: p.invoice_id,
    destination: p.destination,
    destination_tag: p.destination_tag,
    asset: p.asset,
    expected_amount: toPlain(p.expected_amount),
    underpayment_tolerance: p.underpayment_tolerance ? toPlain(p.underpayment_tolerance) : null,
    allow_partial_payment: p.allow_partial_payment,
    hold_overpayment: p.hold_overpayment,
  };
}

/** Validate the invoice itself before using it. */
export function policyProblem(p: InvoicePolicy): string | null {
  if (!p.invoice_id.trim()) return "The invoice has no identifier.";
  if (!p.destination.trim()) return "The invoice names no receiving account.";
  if (isNegative(p.expected_amount) || isZero(p.expected_amount)) return "The expected amount must be greater than zero.";
  const t = p.underpayment_tolerance;
  if (t) {
    if (isNegative(t)) return "The underpayment tolerance cannot be negative.";
    if (compare(t, p.expected_amount) >= 0) return "The underpayment tolerance must be smaller than the expected amount.";
  }
  if (p.asset.kind === "xrp") {
    try {
      toDrops(p.expected_amount);
    } catch {
      return "An XRP amount cannot be finer than one drop (0.000001 XRP).";
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Observation (verifier.rs observe)                                   */
/* ------------------------------------------------------------------ */

export function normalizeHash(input: string): string | null {
  const h = input.trim();
  return /^[0-9A-Fa-f]{64}$/.test(h) ? h.toUpperCase() : null;
}

/** serde_json's `Value::get`: present (possibly null) or undefined. */
function get(v: Json | undefined, k: string): Json | undefined {
  return isObject(v) && has(v, k) ? v[k] : undefined;
}
const asStr = (v: Json | undefined) => (typeof v === "string" ? v : null);
const asU64 = (v: Json | undefined) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);
const or = (a: Json | undefined, b: () => Json | undefined) => (a !== undefined ? a : b());

/** A rippled `tx` result (API v1 or v2) or an `account_tx` entry. */
export function observe(source: string, observedAt: string, result: Json): SourceRead {
  const err = asStr(get(result, "error"));
  if (err !== null) {
    if (err === "txnNotFound") return { status: "not_found", source, observed_at: observedAt };
    return { status: "failed", source, observed_at: observedAt, error: `node error: ${err}` };
  }
  if (!isObject(result)) return { status: "failed", source, observed_at: observedAt, error: "result is not a JSON object" };
  const tx = or(get(result, "tx_json"), () => or(get(result, "tx"), () => result));
  const m = or(get(result, "meta"), () => get(result, "metaData"));
  const meta = isObject(m) ? m : undefined;
  const tag = asU64(get(tx, "DestinationTag"));
  return {
    status: "observed",
    observation: {
      source,
      observed_at: observedAt,
      returned_hash: asStr(get(result, "hash")) ?? asStr(get(tx, "hash")),
      validated: typeof get(result, "validated") === "boolean" ? (get(result, "validated") as boolean) : null,
      ledger_index: asU64(or(get(result, "ledger_index"), () => get(tx, "ledger_index"))),
      transaction_type: asStr(get(tx, "TransactionType")),
      transaction_result: meta ? asStr(get(meta, "TransactionResult")) : null,
      account: asStr(get(tx, "Account")),
      destination: asStr(get(tx, "Destination")),
      destination_tag: tag !== null && tag <= U32_MAX ? tag : null,
      flags: asU64(get(tx, "Flags")),
      requested_raw: or(get(tx, "DeliverMax"), () => get(tx, "Amount")),
      delivered_raw: meta ? or(get(meta, "delivered_amount"), () => get(meta, "DeliveredAmount")) : undefined,
      has_meta: meta !== undefined,
    },
  };
}

/* ------------------------------------------------------------------ */
/* The checks (verifier.rs decide)                                     */
/* ------------------------------------------------------------------ */

const sourceOf = (r: SourceRead) => (r.status === "observed" ? r.observation.source : r.source);

function fingerprint(o: Observation): string {
  return canonicalJson({
    hash: o.returned_hash?.toUpperCase() ?? null,
    ledger_index: o.ledger_index,
    type: o.transaction_type,
    result: o.transaction_result,
    account: o.account,
    destination: o.destination,
    destination_tag: o.destination_tag,
    flags: o.flags,
    requested: o.requested_raw ?? null,
    delivered: o.delivered_raw ?? null,
  });
}

function amountText(a: Amount): string {
  return a.asset.kind === "xrp" ? `${toPlain(a.value)} XRP` : `${toPlain(a.value)} ${a.asset.currency} (issuer ${a.asset.issuer})`;
}

type Decision = {
  reason: Reason;
  findings: Finding[];
  primary: Observation | null;
  requested: Amount | null;
  delivered: Amount | null;
  partial: boolean | null;
  difference: Decimal | null;
};

function decide(requestedHash: string, reads: SourceRead[], invoice: InvoicePolicy | null, priorInvoice: string | null): Decision {
  const d: Decision = { reason: "SETTLED", findings: [], primary: null, requested: null, delivered: null, partial: null, difference: null };
  const stop = (code: Reason, why: string): Decision => {
    d.reason = code;
    d.findings.unshift({ code, explanation: why });
    return d;
  };

  const hash = normalizeHash(requestedHash);
  if (!hash) return stop("INVALID_HASH", "A transaction hash is exactly 64 hexadecimal characters. Nothing was looked up.");
  if (invoice) {
    const problem = policyProblem(invoice);
    if (problem) return stop("INVALID_POLICY", problem);
  }

  const observed = reads.flatMap((r) => (r.status === "observed" ? [r.observation] : []));
  for (const r of reads) {
    if (r.status === "failed") d.findings.push({ code: "SOURCE_UNAVAILABLE", explanation: `${r.source} gave no usable answer: ${r.error}.` });
  }
  if (!observed.length) {
    const notFound = reads.some((r) => r.status === "not_found");
    const failed = reads.some((r) => r.status === "failed");
    return notFound && !failed
      ? stop(
          "NOT_FOUND",
          "No source has this transaction. It may not exist, may not have reached these nodes yet, or may be older than their history. Not found is not the same as failed."
        )
      : stop("SOURCE_UNAVAILABLE", "No source returned a usable answer, so nothing about this transaction is known.");
  }

  for (const o of observed) {
    if (o.returned_hash === null) {
      return stop("MALFORMED_RESPONSE", `${o.source} returned a transaction without a hash, so it cannot be tied to the one requested.`);
    }
    if (o.returned_hash.toUpperCase() !== hash) {
      return stop("HASH_MISMATCH", `${o.source} answered with transaction ${o.returned_hash}, not the one requested. Its answer is not used.`);
    }
  }

  const validated = observed.filter((o) => o.validated === true);
  const first = validated[0];
  if (!first) {
    const o = observed[0];
    d.primary = o;
    return stop(
      "NOT_VALIDATED",
      o.validated === null
        ? "The source did not say whether this transaction is in a validated ledger. Until that is known it is treated as not final."
        : "The transaction is not in a validated ledger yet. It can still fail or disappear; nothing is final."
    );
  }
  for (const other of validated.slice(1)) {
    if (fingerprint(other) !== fingerprint(first)) {
      d.primary = first;
      return stop(
        "SOURCE_DISAGREEMENT",
        `${first.source} and ${other.source} both report this transaction as validated but disagree on its contents. Neither answer is chosen; a person should review both.`
      );
    }
  }
  for (const o of observed.filter((x) => x.validated !== true)) {
    d.findings.push({ code: "NOT_VALIDATED", explanation: `${o.source} has not yet seen this transaction as validated; it is lagging, not contradicting.` });
  }
  for (const r of reads) {
    if (r.status === "not_found") d.findings.push({ code: "NOT_FOUND", explanation: `${r.source} does not have this transaction yet; treated as lagging.` });
  }
  const o = first;
  d.primary = o;

  if (!o.has_meta) {
    return stop("MISSING_METADATA", "The validated transaction came back without its metadata, which is where the delivered amount and the result live.");
  }
  const result = o.transaction_result;
  if (result === null) return stop("MISSING_RESULT", "The metadata has no TransactionResult, so whether the transaction succeeded is unknown.");
  if (result !== "tesSUCCESS") {
    return stop(
      "TRANSACTION_FAILED",
      `The transaction is validated with result ${result}. It delivered nothing; only its fee was spent. This is a final failure, not a pending payment.`
    );
  }
  if (o.transaction_type === null) return stop("MALFORMED_RESPONSE", "The transaction has no TransactionType.");
  if (o.transaction_type !== "Payment") {
    return stop("NOT_PAYMENT", `This is a ${o.transaction_type}, not a Payment. It does not deliver a payment amount, so it cannot settle an invoice.`);
  }

  const partial = o.flags === null ? null : (BigInt(o.flags) & BigInt(TF_PARTIAL_PAYMENT)) !== 0n;
  d.partial = partial;

  if (o.requested_raw === undefined) return stop("MALFORMED_RESPONSE", "The payment has neither Amount nor DeliverMax.");
  const req = parseLedgerAmount(o.requested_raw);
  if (req.kind === "unsupported") return stop("UNSUPPORTED_ASSET", `The requested amount is a ${req.what}, which this engine does not read yet.`);
  if (req.kind === "malformed") return stop("MALFORMED_AMOUNT", `The requested amount could not be read: ${req.why}.`);
  d.requested = req.amount;

  if (o.delivered_raw === undefined) {
    return stop(
      "DELIVERED_MISSING",
      "The metadata carries no delivered_amount. The requested amount is not evidence of what arrived, so nothing is credited."
    );
  }
  if (o.delivered_raw === "unavailable") {
    return stop(
      "DELIVERED_UNAVAILABLE",
      'The ledger reports delivered_amount as "unavailable": this payment predates the field. What arrived is unknown, not zero, and not the requested amount. Reconstruct it from the balance changes before crediting.'
    );
  }
  const del = parseLedgerAmount(o.delivered_raw);
  if (del.kind === "unsupported") return stop("UNSUPPORTED_ASSET", `The delivered amount is a ${del.what}, which this engine does not read yet.`);
  if (del.kind === "malformed") return stop("MALFORMED_AMOUNT", `The delivered amount could not be read: ${del.why}.`);
  const delivered = del.amount;
  const requested = req.amount;
  d.delivered = delivered;

  if (partial === true) {
    const note =
      sameAsset(requested.asset, delivered.asset) && compare(requested.value, delivered.value) > 0
        ? `Flagged tfPartialPayment: it asked to deliver ${amountText(requested)} and delivered ${amountText(delivered)}. Credit only what was delivered.`
        : `Flagged tfPartialPayment: it delivered ${amountText(delivered)}. The flag allowed less; this time it was not less.`;
    d.findings.push({ code: "PARTIAL_PAYMENT_FLAGGED", explanation: note });
  }

  if (!invoice) {
    return stop(
      "NO_INVOICE_POLICY",
      `The payment is validated and delivered ${amountText(delivered)}. No invoice was supplied, so these are the transaction's facts only: nothing is marked as settled.`
    );
  }
  const p = invoice;
  if (priorInvoice !== null && priorInvoice !== p.invoice_id) {
    return stop("ALREADY_APPLIED", `This transaction was already applied to invoice ${priorInvoice}. One payment cannot settle two invoices.`);
  }
  if (o.destination !== p.destination) {
    return stop("DESTINATION_MISMATCH", `The payment went to ${o.destination ?? "an unrecorded account"}, not to the invoice's account ${p.destination}.`);
  }
  if (p.destination_tag !== null && o.destination_tag !== p.destination_tag) {
    return stop(
      "DESTINATION_TAG_MISMATCH",
      `The invoice requires destination tag ${p.destination_tag}; the payment carries ${o.destination_tag === null ? "no tag" : o.destination_tag}.`
    );
  }
  if (!sameAsset(delivered.asset, p.asset)) {
    return stop(
      "ASSET_MISMATCH",
      "The payment delivered a different asset from the one invoiced. The same currency code from a different issuer is a different asset."
    );
  }

  const difference = sub(delivered.value, p.expected_amount);
  d.difference = difference;
  const short = compare(difference, negated(p.underpayment_tolerance ?? ZERO)) < 0;

  if (partial === true && !p.allow_partial_payment) {
    return stop(
      "PARTIAL_NOT_PERMITTED",
      "The payment is flagged tfPartialPayment and this invoice does not accept partial payments. Its success code does not mean the invoice was paid in full."
    );
  }
  if (short) {
    return stop("UNDERPAID", `Delivered ${amountText(delivered)}, short of the invoiced ${toPlain(p.expected_amount)} by ${toPlain(negated(difference))}.`);
  }
  if (compare(difference, ZERO) > 0 && p.hold_overpayment) {
    return stop("OVERPAID_REVIEW", `Delivered ${toPlain(difference)} more than invoiced; this invoice holds overpayments for review.`);
  }
  return partial === true
    ? stop("SETTLED_PARTIAL_PERMITTED", "Partial payment accepted by this invoice's policy: what it delivered meets the invoice.")
    : stop("SETTLED", `Validated, succeeded, not partial, delivered ${amountText(delivered)} to the invoiced account.`);
}

/* ------------------------------------------------------------------ */
/* Report (verifier.rs verify)                                         */
/* ------------------------------------------------------------------ */

export type AmountView = { asset: Asset; value: string };

export type VerificationReport = {
  transaction_hash: string;
  network: Network;
  status: Status;
  reason_code: Reason;
  explanation: string;
  findings: Finding[];
  validated: boolean | null;
  ledger_index: number | null;
  transaction_result: string | null;
  transaction_type: string | null;
  requested_amount: AmountView | null;
  delivered_amount: AmountView | null;
  partial_payment: boolean | null;
  amount_difference: string | null;
  amount_mismatch: boolean | null;
  invoice_id: string | null;
  sources: string[];
  observed_at: string;
  rule_version: string;
  decision_key: string;
  evidence_digest: string;
  evidence: JsonObject;
};

const amountView = (a: Amount | null): AmountView | null => (a ? { asset: a.asset, value: toPlain(a.value) } : null);

function observationRecord(r: SourceRead): JsonObject {
  if (r.status === "not_found") return { status: "not_found", source: r.source, observed_at: r.observed_at };
  if (r.status === "failed") return { status: "failed", source: r.source, observed_at: r.observed_at, error: r.error };
  const o = r.observation;
  return {
    status: "observed",
    source: o.source,
    observed_at: o.observed_at,
    returned_hash: o.returned_hash,
    validated: o.validated,
    ledger_index: o.ledger_index,
    transaction_type: o.transaction_type,
    transaction_result: o.transaction_result,
    account: o.account,
    destination: o.destination,
    destination_tag: o.destination_tag,
    flags: o.flags,
    requested_raw: o.requested_raw ?? null,
    delivered_raw: o.delivered_raw ?? null,
    has_meta: o.has_meta,
  };
}

export type VerifyInput = {
  requestedHash: string;
  network: Network;
  reads: SourceRead[];
  invoice: InvoicePolicy | null;
  priorInvoice: string | null;
  evaluatedAt: string;
  rulesVersion?: string;
};

/** Run the checks and build the report with its evidence and digest. */
export async function verify(input: VerifyInput): Promise<VerificationReport> {
  const rules = input.rulesVersion ?? RULES_VERSION;
  const d = decide(input.requestedHash, input.reads, input.invoice, input.priorInvoice);
  const status = REASON_STATUS[d.reason];
  const hash = normalizeHash(input.requestedHash) ?? input.requestedHash.trim();
  const amountMismatch =
    d.requested && d.delivered ? !(sameAsset(d.requested.asset, d.delivered.asset) && compare(d.requested.value, d.delivered.value) === 0) : null;
  const invoiceValue = input.invoice ? invoiceJson(input.invoice) : null;
  const decisionKey = await digest({ network: input.network, hash, invoice: invoiceValue, rules });
  const amountJson = (a: Amount | null) => (a ? { asset: a.asset, value: toPlain(a.value) } : null);

  const evidence: JsonObject = {
    schema: EVIDENCE_SCHEMA,
    rule_version: rules,
    network: input.network,
    transaction_hash: hash,
    evaluated_at: input.evaluatedAt,
    observed: input.reads.map(observationRecord),
    invoice: invoiceValue,
    prior_invoice: input.priorInvoice,
    derived: {
      status,
      reason_code: d.reason,
      findings: d.findings.map((f) => f.code),
      partial_payment: d.partial,
      requested_amount: amountJson(d.requested),
      delivered_amount: amountJson(d.delivered),
      amount_difference: d.difference ? toPlain(d.difference) : null,
    },
  };
  const p = d.primary;
  return {
    transaction_hash: hash,
    network: input.network,
    status,
    reason_code: d.reason,
    explanation: d.findings[0]?.explanation ?? "",
    findings: d.findings,
    validated: p?.validated ?? null,
    ledger_index: p?.ledger_index ?? null,
    transaction_result: p?.transaction_result ?? null,
    transaction_type: p?.transaction_type ?? null,
    requested_amount: amountView(d.requested),
    delivered_amount: amountView(d.delivered),
    partial_payment: d.partial,
    amount_difference: d.difference ? toPlain(d.difference) : null,
    amount_mismatch: amountMismatch,
    invoice_id: input.invoice?.invoice_id ?? null,
    sources: input.reads.map(sourceOf),
    observed_at: p?.observed_at ?? input.evaluatedAt,
    rule_version: rules,
    decision_key: decisionKey,
    evidence_digest: await digest(evidence),
    evidence,
  };
}

/* ------------------------------------------------------------------ */
/* Transport (rpc.rs)                                                  */
/* ------------------------------------------------------------------ */

export type Endpoint = { name: string; operator: string; url: string };

/** The allowlist. Full-history nodes first. Callers never supply a URL. */
export function endpoints(network: Network): Endpoint[] {
  return network === "mainnet"
    ? [
        { name: "xrplcluster.com", operator: "XRPL Labs", url: "https://xrplcluster.com/" },
        { name: "s2.ripple.com", operator: "Ripple", url: "https://s2.ripple.com:51234/" },
        { name: "s1.ripple.com", operator: "Ripple", url: "https://s1.ripple.com:51234/" },
      ]
    : [
        { name: "s.altnet.rippletest.net", operator: "Ripple", url: "https://s.altnet.rippletest.net:51234/" },
        { name: "testnet.xrpl-labs.com", operator: "XRPL Labs", url: "https://testnet.xrpl-labs.com/" },
      ];
}

/** One endpoint per operator, in allowlist order, at most `n`. */
export function independent(network: Network, n: number): Endpoint[] {
  const out: Endpoint[] = [];
  for (const e of endpoints(network)) if (out.length < n && !out.some((o) => o.operator === e.operator)) out.push(e);
  return out;
}

export const LIMITS = { requestTimeoutMs: 12_000, maxBodyBytes: 1024 * 1024, maxAttempts: 3, baseBackoffMs: 300, maxRetryAfterMs: 5_000 };
export type Limits = typeof LIMITS;

export type FetchStats = { source: string; attempts: number; latency_ms: number; last_error: string | null };

type Attempt = { kind: "done"; result: Json } | { kind: "retry"; error: string; waitMs: number | null } | { kind: "fail"; error: string };

const BUSY = new Set(["slowDown", "tooBusy", "noNetwork", "noCurrent", "noClosed"]);

async function readBounded(response: Response, max: number): Promise<Uint8Array | string> {
  const declared = Number(response.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declared) && declared > max) return `response of ${declared} bytes exceeds the ${max}-byte limit`;
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    let next: ReadableStreamReadResult<Uint8Array>;
    try {
      next = await reader.read();
    } catch {
      return "response body could not be read";
    }
    if (next.done) break;
    size += next.value.length;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return `response exceeds the ${max}-byte limit; reading stopped`;
    }
    chunks.push(next.value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

async function attempt(fetcher: typeof fetch, url: string, hash: string, limits: Limits): Promise<Attempt> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json", "accept-encoding": "identity" },
      body: JSON.stringify({ method: "tx", params: [{ transaction: hash, binary: false, api_version: 2 }] }),
      redirect: "manual",
      signal: AbortSignal.timeout(limits.requestTimeoutMs),
    });
  } catch (e) {
    const name = (e as Error)?.name;
    return { kind: "retry", error: name === "TimeoutError" || name === "AbortError" ? "timed out" : "could not connect", waitMs: null };
  }
  const status = response.status;
  if (status === 429) {
    const after = Number((response.headers.get("retry-after") ?? "").trim());
    await response.body?.cancel().catch(() => undefined);
    return {
      kind: "retry",
      error: "rate limited (HTTP 429)",
      waitMs: Number.isInteger(after) && after >= 0 ? Math.min(after * 1000, limits.maxRetryAfterMs) : null,
    };
  }
  if (status >= 500) {
    await response.body?.cancel().catch(() => undefined);
    return { kind: "retry", error: `HTTP ${status}`, waitMs: null };
  }
  if (status < 200 || status >= 300) {
    await response.body?.cancel().catch(() => undefined);
    return { kind: "fail", error: `HTTP ${status}` };
  }
  const encoding = response.headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity") {
    await response.body?.cancel().catch(() => undefined);
    return { kind: "fail", error: `compressed response (${encoding}) refused` };
  }
  const bytes = await readBounded(response, limits.maxBodyBytes);
  if (typeof bytes === "string") return { kind: "fail", error: bytes };
  let parsed: Json;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes)) as Json;
  } catch {
    return { kind: "fail", error: "response is not valid JSON" };
  }
  const result = get(parsed, "result");
  if (result === undefined) return { kind: "fail", error: "JSON-RPC response has no result" };
  const code = asStr(get(result, "error"));
  if (code !== null && BUSY.has(code)) return { kind: "retry", error: `node busy (${code})`, waitMs: null };
  return { kind: "done", result };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Read one transaction from one endpoint, with bounded retries. */
export async function fetchTx(
  endpoint: Endpoint,
  hash: string,
  limits: Limits = LIMITS,
  fetcher: typeof fetch = fetch
): Promise<{ read: SourceRead; stats: FetchStats }> {
  const started = Date.now();
  const stats: FetchStats = { source: endpoint.name, attempts: 0, latency_ms: 0, last_error: null };
  let last = "";
  for (let n = 0; n < limits.maxAttempts; n += 1) {
    stats.attempts = n + 1;
    const a = await attempt(fetcher, endpoint.url, hash, limits);
    if (a.kind === "done") {
      stats.latency_ms = Date.now() - started;
      return { read: observe(endpoint.name, new Date().toISOString(), a.result), stats };
    }
    last = a.error;
    if (a.kind === "fail") break;
    if (n + 1 < limits.maxAttempts) {
      await sleep((a.waitMs ?? limits.baseBackoffMs * 2 ** n) + Math.floor(Math.random() * limits.baseBackoffMs));
    }
  }
  stats.latency_ms = Date.now() - started;
  stats.last_error = last;
  return { read: { status: "failed", source: endpoint.name, observed_at: new Date().toISOString(), error: last }, stats };
}

/** Single source with failover, or one read per independent operator. */
export async function readSources(
  hash: string,
  network: Network,
  dualSource: boolean,
  limits: Limits = LIMITS,
  fetcher: typeof fetch = fetch
): Promise<{ reads: SourceRead[]; stats: FetchStats[] }> {
  const reads: SourceRead[] = [];
  const stats: FetchStats[] = [];
  if (dualSource) {
    for (const r of await Promise.all(independent(network, 2).map((e) => fetchTx(e, hash, limits, fetcher)))) {
      reads.push(r.read);
      stats.push(r.stats);
    }
    return { reads, stats };
  }
  for (const e of endpoints(network)) {
    const r = await fetchTx(e, hash, limits, fetcher);
    reads.push(r.read);
    stats.push(r.stats);
    if (r.read.status !== "failed") break;
  }
  return { reads, stats };
}

/* ------------------------------------------------------------------ */
/* Signed exports                                                      */
/* ------------------------------------------------------------------ */

/*
 * A digest proves a record is unaltered; it does not say who produced it,
 * because anyone can hash anything. The hosted API can also sign: Ed25519
 * over a small canonical statement naming the evidence digest. The private
 * key lives only in the function's secrets (PAYMENT_EVIDENCE_SIGNING_KEY,
 * base64 PKCS#8), never in the repository or the desktop app. Without it
 * the API serves unsigned reports and says so.
 */

export const SIGNATURE_SCHEMA = "noshashi.payment-evidence-signature/1";

export type SigningKey = { privateKey: CryptoKey; publicJwk: JsonWebKey; keyId: string };

export type EvidenceSignature = {
  schema: string;
  alg: "Ed25519";
  key_id: string;
  signed_at: string;
  /** The exact bytes signed: canonical JSON of the statement. */
  payload: string;
  /** base64url Ed25519 signature over `payload` as UTF-8. */
  signature: string;
};

const b64urlEncode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlDecode = (text: string) => {
  const s = text.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

/** Import a base64 PKCS#8 Ed25519 key. The key id is the first 16 hex of SHA-256 of the public key. */
export async function importSigningKey(pkcs8Base64: string): Promise<SigningKey> {
  const der = Uint8Array.from(atob(pkcs8Base64.trim()), (c) => c.charCodeAt(0));
  const extractable = await crypto.subtle.importKey("pkcs8", der, { name: "Ed25519" }, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", extractable);
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.x) throw new Error("not an Ed25519 key");
  const privateKey = await crypto.subtle.importKey("pkcs8", der, { name: "Ed25519" }, false, ["sign"]);
  const publicJwk: JsonWebKey = { kty: "OKP", crv: "Ed25519", x: jwk.x };
  const keyId = (await hexSha256(jwk.x)).slice(0, 16);
  return { privateKey, publicJwk, keyId };
}

/** Sign what a report concluded and the digest of the evidence behind it. */
export async function signReport(report: VerificationReport, key: SigningKey, signedAt: string): Promise<EvidenceSignature> {
  const payload = canonicalJson({
    schema: SIGNATURE_SCHEMA,
    key_id: key.keyId,
    signed_at: signedAt,
    transaction_hash: report.transaction_hash,
    network: report.network,
    invoice_id: report.invoice_id,
    status: report.status,
    reason_code: report.reason_code,
    rule_version: report.rule_version,
    decision_key: report.decision_key,
    evidence_digest: report.evidence_digest,
  });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key.privateKey, new TextEncoder().encode(payload)));
  return { schema: SIGNATURE_SCHEMA, alg: "Ed25519", key_id: key.keyId, signed_at: signedAt, payload, signature: b64urlEncode(sig) };
}

/**
 * Check a signature with the published public key, and that the signed
 * statement names this evidence. Anyone can run this; it needs no secret.
 */
export async function checkSignature(sig: EvidenceSignature, publicJwk: JsonWebKey, evidence: unknown): Promise<boolean> {
  const key = await crypto.subtle.importKey("jwk", publicJwk, { name: "Ed25519" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, b64urlDecode(sig.signature), new TextEncoder().encode(sig.payload));
  if (!ok) return false;
  const statement = JSON.parse(sig.payload) as { evidence_digest?: string };
  return statement.evidence_digest === (await digest(evidence));
}
