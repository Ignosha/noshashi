/*
 * GET /api/book?currency=USD&issuer=r…[&format=json|raw]
 *
 * What the XRP / issued-currency order book QUOTES against what can
 * actually FILL, at one validated ledger. See api/_lib/book.js. Free and
 * unauthenticated like the certificate; a minute at the edge.
 *
 * format=raw returns the two book_offers replies exactly as the ledger
 * sent them, so every figure can be recomputed by someone who does not
 * trust this code.
 */

import { rippleRpc, ADDRESS_RE, decodeCurrency } from "../authority.js";
import { assembleBook, quotedVsFillable, DISCLOSURES } from "../book.js";

const LEVELS = 100;
// Three-letter codes, or the 40-hex form for longer tickers.
const CURRENCY_RE = /^(?:[A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}|[0-9A-Fa-f]{40})$/;

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const currency = String(req.query?.currency ?? "").trim();
  const issuer = String(req.query?.issuer ?? "").trim();
  if (!CURRENCY_RE.test(currency) || currency.toUpperCase() === "XRP") {
    return res.status(400).json({ error: "Pass ?currency= a 3-character code or a 40-hex currency code (not XRP)." });
  }
  if (!ADDRESS_RE.test(issuer)) {
    return res.status(400).json({ error: "Pass ?issuer= the issuing account (r…)." });
  }
  const issued = { currency: currency.length === 3 ? currency.toUpperCase() : currency.toUpperCase(), issuer };

  try {
    // Both sides at the SAME ledger: read the validated index once and pin it.
    const ledger = await rippleRpc("ledger", { ledger_index: "validated" });
    const validatedIndex = Number(ledger.ledger_index ?? ledger.ledger?.ledger_index);
    const [bidRes, askRes] = await Promise.all([
      rippleRpc("book_offers", { taker_gets: { currency: "XRP" }, taker_pays: issued, ledger_index: validatedIndex, limit: LEVELS }),
      rippleRpc("book_offers", { taker_gets: issued, taker_pays: { currency: "XRP" }, ledger_index: validatedIndex, limit: LEVELS }),
    ]);

    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.query?.format === "raw") {
      return res.status(200).json({ currency: issued.currency, issuer, ledger_index: validatedIndex, bids: bidRes.offers ?? [], asks: askRes.offers ?? [] });
    }

    const book = assembleBook(bidRes.offers ?? [], askRes.offers ?? [], validatedIndex);
    // The raw code is what the ledger holds and stays in `currency`; the
    // display name is for people. A 40-hex code for a long ticker reads as
    // "524C5553…" otherwise.
    const label = decodeCurrency(issued.currency);
    const q = quotedVsFillable(book);
    return res.status(200).json({
      pair: `XRP/${label}`,
      currency_label: label,
      currency: issued.currency,
      issuer,
      ledger_index: validatedIndex,
      read_at: new Date().toISOString(),
      levels_requested: LEVELS,
      offers_read: { bids: (bidRes.offers ?? []).length, asks: (askRes.offers ?? []).length },
      reference: { bid: book.referenceBid ?? null, ask: book.referenceAsk ?? null, mid: book.mid ?? null, touch_crossed: book.crossed },
      quoted: { bid: q.quotedBid, ask: q.quotedAsk },
      fillable: { bid: q.fillableBid, ask: q.fillableAsk },
      fillable_ratio: { bid: q.bidRatio ?? null, ask: q.askRatio ?? null },
      band: q.band ?? null,
      units: `quantities in ${label}; prices in XRP per ${label}`,
      disclosures: DISCLOSURES,
    });
  } catch (error) {
    return res.status(502).json({
      error: "Could not read the order book from a public XRPL node. Try again shortly.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
