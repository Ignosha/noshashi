/*
 * The Asset Risk report: one issued asset's issuer controls and DEX
 * liquidity, read from validated ledgers, with the evidence and the
 * limits of what was read. Served by GET /api/v1/asset-risk.
 *
 * Nothing here is new analysis. The controls are the authority checks
 * (api/_lib/authority.js, rules versioned and digested there); depth is
 * quoted against fillable (api/_lib/book.js). This module adds the one
 * figure neither gives on its own, what a sale or purchase of a stated
 * size would actually fill at, and binds the whole report to a digest.
 *
 * It never says an asset is safe. A clean report means the ledger showed
 * none of the controls or thin books it checks for; it says nothing about
 * backing, redemption, the issuer's identity or anything off-ledger.
 */

export const SCHEMA = "noshashi.asset-risk.v1";

/**
 * Walk one side of the book with an order of `size` units of the asset.
 *
 * `levels` are book.js levels, best price first: `quantity` is what the
 * offers' owners could deliver (funded), in units of the asset; `price`
 * is XRP per unit. Selling the asset walks the bids, buying walks the
 * asks. Impact is the average fill price against the reference mid.
 */
export function walkBook(levels, size, mid) {
  if (!(size > 0)) return null;
  let remaining = size;
  let filled = 0;
  let xrp = 0;
  let worst;
  let used = 0;
  for (const level of levels ?? []) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, level.quantity);
    if (take <= 0) continue;
    filled += take;
    xrp += take * level.price;
    remaining -= take;
    worst = level.price;
    used += 1;
  }
  const average = filled > 0 ? xrp / filled : undefined;
  return {
    size,
    filled: round(filled),
    fully_fillable: remaining <= 1e-9,
    unfilled: round(Math.max(remaining, 0)),
    xrp: round(xrp),
    average_price: average === undefined ? null : round(average),
    worst_price: worst === undefined ? null : round(worst),
    impact_vs_mid_pct: average === undefined || !(mid > 0) ? null : round(((average - mid) / mid) * 100, 4),
    levels_used: used,
  };
}

const round = (n, places = 6) => Number(Number(n).toFixed(places));

/** What every report states it did not check. Order is stable: it is digested. */
export const LIMITATIONS = [
  "Not a rating. Nothing here says an asset is safe, legitimate or a good investment.",
  "Off-ledger facts are not read: backing, reserves, redemption, attestations and the issuer's legal identity.",
  "A domain on the issuer account is self-declared; confirm it against the issuer's own xrp-ledger.toml.",
  "Liquidity is the XRP order book on the DEX only. AMM pools and other trading pairs are not included.",
  "Exit estimates walk resting offers at one ledger. Books change every few seconds and other orders can fill first.",
  "Issuer settings can change after this ledger, except those an issuer has given up permanently (lsfNoFreeze).",
];

/** Stable JSON: object keys sorted at every depth, so the digest does not depend on key order. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function receiptFor(report) {
  const bytes = new TextEncoder().encode(canonical(report));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Assemble the report from what was read. Pure: the route does the I/O.
 *
 *   certificate  certificateFrom() output, or null when it could not be read
 *   book         assembleBook() output, or null; quoted from quotedVsFillable()
 *   size         order size in units of the asset, or undefined
 *   levelsRequested  offers read per side, which the disclosures refer to
 */
export function assemble({ levelsRequested, issuer, currency, currencyLabel, certificate, certificateError, book, quoted, bookError, size, disclosures, evaluatedAt }) {
  const unknowns = [];
  if (!certificate) unknowns.push(`issuer_controls: ${certificateError ?? "not read"}`);
  else if (certificate.verdict === "insufficient-data") unknowns.push("issuer_controls: part of the issuer's state could not be read; see the failed checks");
  if (!currency) unknowns.push("liquidity: pass ?currency= to read the order book for one issued currency");
  else if (!book) unknowns.push(`liquidity: ${bookError ?? "not read"}`);
  else if (book.mid === undefined) unknowns.push("liquidity: no uncrossed bid and ask, so there is no reference mid and exit impact cannot be measured");

  const liquidity = book
    ? {
        ledger_index: book.ledgerIndex,
        reference: { bid: book.referenceBid ?? null, ask: book.referenceAsk ?? null, mid: book.mid ?? null },
        quoted: { bid: quoted.quotedBid, ask: quoted.quotedAsk },
        fillable: { bid: quoted.fillableBid, ask: quoted.fillableAsk },
        fillable_ratio: { bid: quoted.bidRatio ?? null, ask: quoted.askRatio ?? null },
        band: quoted.band ?? null,
        levels_requested: levelsRequested ?? null,
        exit:
          size > 0
            ? { sell: walkBook(book.bids, size, book.mid), buy: walkBook(book.asks, size, book.mid) }
            : null,
        units: `quantities in ${currencyLabel}; prices in XRP per ${currencyLabel}`,
        disclosures,
      }
    : null;

  const ledgers = [certificate?.ledgerIndex, book?.ledgerIndex].filter((n) => n > 0);
  return {
    schema: SCHEMA,
    asset: { issuer, currency: currency ?? null, currency_label: currencyLabel ?? null },
    evaluated_at: evaluatedAt,
    ledgers: {
      issuer_controls: certificate?.ledgerIndex ?? null,
      liquidity: book?.ledgerIndex ?? null,
      // Two reads, two validated ledgers. A gap of a few ledgers is a few
      // seconds; it is stated rather than hidden.
      gap: ledgers.length === 2 ? Math.abs(ledgers[0] - ledgers[1]) : null,
    },
    issuer_controls: certificate
      ? {
          authority_verdict: certificate.verdict,
          meaning: "Verdict of the authority rules on the issuer's ledger controls, not a rating of the asset.",
          rules_version: certificate.rulesVersion,
          certificate_digest: certificate.digest,
          checks: certificate.checks,
        }
      : null,
    liquidity,
    unknowns,
    limitations: LIMITATIONS,
  };
}
