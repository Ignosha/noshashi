/*
 * What a payment actually delivered, for an account's own records.
 *
 * An XRPL Payment carries two amounts that are easy to confuse. `Amount`
 * is what the sender asked to deliver. `delivered_amount`, in the
 * transaction's metadata, is what arrived. With the tfPartialPayment
 * flag set they can differ by any amount — a payment of "1,000,000 USD"
 * that delivered 0.000001 USD is a real and repeatedly exploited
 * pattern — and anything that books `Amount` books a number that never
 * arrived. Tax software, exchange deposit handlers and spreadsheets have
 * all made that mistake.
 *
 * This turns an account's validated payment history into rows that put
 * the two amounts side by side, flag the partial payments, and never
 * substitute one amount for the other. Where the ledger did not record a
 * delivered amount (payments validated before 2014-01-20, when the field
 * was introduced), the row says "unavailable" — it does not fall back to
 * `Amount`, because that fallback is the exact error this exists to stop.
 *
 * Pure: transactions in, rows out. The reading is in api/delivered.js.
 */

import { decodeCurrency } from "./authority.js";

/** Seconds between the Unix epoch and the Ripple epoch (2000-01-01). */
export const RIPPLE_EPOCH = 946_684_800;
/** tfPartialPayment. */
export const TF_PARTIAL_PAYMENT = 0x0002_0000;

/** XRP is an integer string of drops; everything else is an object. */
export function parseAmount(amount) {
  if (amount === undefined || amount === null) return null;
  if (typeof amount === "string") {
    if (!/^\d+$/.test(amount)) return null;
    return { currency: "XRP", issuer: "", value: dropsToXrp(amount) };
  }
  if (typeof amount === "object" && amount.currency && amount.value !== undefined) {
    return { currency: String(amount.currency), issuer: String(amount.issuer ?? ""), value: String(amount.value) };
  }
  // MPT amounts ({ mpt_issuance_id, value }) are reported by their id.
  if (typeof amount === "object" && amount.mpt_issuance_id) {
    return { currency: `MPT:${amount.mpt_issuance_id}`, issuer: "", value: String(amount.value) };
  }
  return null;
}

/**
 * Drops to XRP as an exact decimal string. Never through a float: a
 * tax record that says 0.30000000000000004 XRP is a wrong record.
 */
export function dropsToXrp(drops) {
  const s = String(drops).replace(/^0+(?=\d)/, "");
  const padded = s.padStart(7, "0");
  const whole = padded.slice(0, -6).replace(/^0+(?=\d)/, "");
  const frac = padded.slice(-6).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/** Compare two decimal strings without floats. -1, 0 or 1. */
export function compareDecimal(a, b) {
  const norm = (v) => {
    const [i, f = ""] = String(v).replace(/^\+/, "").split(".");
    return { i: i.replace(/^0+(?=\d)/, ""), f: f.replace(/0+$/, "") };
  };
  const x = norm(a);
  const y = norm(b);
  if (x.i.length !== y.i.length) return x.i.length < y.i.length ? -1 : 1;
  if (x.i !== y.i) return x.i < y.i ? -1 : 1;
  const len = Math.max(x.f.length, y.f.length);
  const xf = x.f.padEnd(len, "0");
  const yf = y.f.padEnd(len, "0");
  return xf === yf ? 0 : xf < yf ? -1 : 1;
}

/**
 * Issued-currency values on the ledger can be in exponent form
 * ("1e-6", "1.5e+10"). Expand to plain decimal so the comparison above
 * and a spreadsheet both read it correctly.
 */
export function plainDecimal(value) {
  const s = String(value).trim();
  const m = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(s);
  if (!m) return s;
  const [, sign, int, frac = "", expRaw] = m;
  const exp = Number(expRaw);
  let digits = int + frac;
  let point = int.length + exp;
  if (point <= 0) {
    digits = "0".repeat(1 - point) + digits;
    point = 1;
  } else if (point > digits.length) {
    digits = digits + "0".repeat(point - digits.length);
  }
  const whole = digits.slice(0, point).replace(/^0+(?=\d)/, "");
  const rest = digits.slice(point).replace(/0+$/, "");
  return sign + (rest ? `${whole}.${rest}` : whole);
}

/**
 * A 40-hex code that decodes to "XRP" is an issued token impersonating
 * XRP, a known scam. It keeps its raw code so no row can read as XRP
 * that was not.
 */
export function displayCurrency(code) {
  const name = decodeCurrency(code);
  return code !== "XRP" && name.toUpperCase() === "XRP" ? code : name;
}

const iso = (rippleSeconds) =>
  Number.isFinite(rippleSeconds) ? new Date((rippleSeconds + RIPPLE_EPOCH) * 1000).toISOString() : "";

/**
 * One row per successful Payment that moved value into or out of
 * `account`. Payments that failed (tec…) delivered nothing and are left
 * out; the CSV is a record of what moved.
 *
 * Accepts both account_tx shapes: API v1 ({ tx, meta }) and API v2
 * ({ tx_json, meta, hash, ledger_index, close_time_iso }).
 */
export function deliveredRows(account, transactions) {
  const rows = [];
  for (const entry of transactions ?? []) {
    const tx = entry.tx_json ?? entry.tx ?? {};
    const meta = entry.meta ?? entry.metaData ?? {};
    if (tx.TransactionType !== "Payment") continue;
    if (meta.TransactionResult !== "tesSUCCESS") continue;

    const outgoing = tx.Account === account;
    const incoming = tx.Destination === account;
    // A payment the account only routed (rippling through its lines) is
    // neither sent nor received by it. Self-payments (conversions) are
    // both, and are reported once, as "self".
    if (!outgoing && !incoming) continue;

    const stated = parseAmount(tx.DeliverMax ?? tx.Amount);
    const deliveredRaw = meta.delivered_amount ?? meta.DeliveredAmount;
    const deliveredKnown = deliveredRaw !== undefined && deliveredRaw !== "unavailable";
    const delivered = deliveredKnown ? parseAmount(deliveredRaw) : null;
    const partial = (Number(tx.Flags ?? 0) & TF_PARTIAL_PAYMENT) !== 0;

    const statedValue = stated ? plainDecimal(stated.value) : "";
    const deliveredValue = delivered ? plainDecimal(delivered.value) : "unavailable";
    const short =
      delivered && stated && delivered.currency === stated.currency
        ? compareDecimal(deliveredValue, statedValue) < 0
        : false;

    const date = entry.close_time_iso ?? iso(Number(tx.date ?? entry.date));
    rows.push({
      date_utc: date ? date.replace(/\.000Z$/, "Z") : "",
      ledger_index: Number(entry.ledger_index ?? tx.ledger_index ?? 0),
      tx_hash: String(entry.hash ?? tx.hash ?? ""),
      direction: outgoing && incoming ? "self" : outgoing ? "out" : "in",
      counterparty: outgoing && incoming ? account : outgoing ? String(tx.Destination ?? "") : String(tx.Account ?? ""),
      destination_tag: tx.DestinationTag ?? "",
      currency: displayCurrency(delivered?.currency ?? stated?.currency ?? ""),
      // The raw code as the ledger holds it. A 40-hex code decodes to a
      // display name that two different tokens could share; this cannot.
      currency_code: delivered?.currency ?? stated?.currency ?? "",
      issuer: delivered?.issuer ?? stated?.issuer ?? "",
      amount_stated: statedValue,
      amount_delivered: deliveredValue,
      partial_payment: partial ? "yes" : "no",
      delivered_less_than_stated: short ? "yes" : "no",
      // The sender pays the fee. On an incoming payment it is not the
      // account's cost and is left blank rather than shown as a debit.
      fee_xrp: outgoing ? dropsToXrp(String(tx.Fee ?? "0")) : "",
    });
  }
  return rows;
}

export const COLUMNS = [
  "date_utc",
  "ledger_index",
  "tx_hash",
  "direction",
  "counterparty",
  "destination_tag",
  "currency",
  "currency_code",
  "issuer",
  "amount_stated",
  "amount_delivered",
  "partial_payment",
  "delivered_less_than_stated",
  "fee_xrp",
];

/**
 * RFC 4180 CSV. Every field is quoted only when it needs to be, and a
 * field that a spreadsheet would execute as a formula (=, +, -, @) is
 * prefixed with a quote mark — a currency code is attacker-chosen text.
 */
export function toCsv(rows) {
  const cell = (value) => {
    let s = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}

/** Totals a reader can check the rows against. */
export function summarize(rows) {
  return {
    payments: rows.length,
    partial_payments: rows.filter((r) => r.partial_payment === "yes").length,
    delivered_less_than_stated: rows.filter((r) => r.delivered_less_than_stated === "yes").length,
    delivered_unavailable: rows.filter((r) => r.amount_delivered === "unavailable").length,
  };
}
