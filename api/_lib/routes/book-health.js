/*
 * GET /api/book-health[?at=YYYY-MM-DD]
 *
 * Quoted against fillable, on the books that matter most on the XRP Ledger,
 * all read at ONE validated ledger: the latest, or the last ledger that
 * closed on or before 23:59:59 UTC on the date given. History comes from the
 * ledger itself rather than from a database of past readings, so a day's
 * figures can be re-read by anyone at the ledger index stated, and nothing
 * here is stored.
 *
 * Same arithmetic, band and disclosures as /api/book (api/_lib/book.js).
 * AMM pool reserves are reported beside each book and never added to it.
 * Ratios, not a score: what a reader does with a 2% funded book is theirs
 * to decide.
 */

import { rippleRpc, decodeCurrency } from "../authority.js";
import { assembleBook, quotedVsFillable, DISCLOSURES } from "../book.js";
import { RIPPLE_EPOCH, rippleTimeToIso, ledgerAtOrBefore, ammOf } from "../treasury.js";
import { queryOf } from "../query.js";

const LEVELS = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Fixed and published, so every day is measured against the same books. */
export const HEALTH_BOOKS = [
  { label: "USD · Bitstamp", currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B" },
  { label: "USD · GateHub", currency: "USD", issuer: "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq" },
  { label: "RLUSD · Ripple", currency: "524C555344000000000000000000000000000000", issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De" },
  { label: "EUR · GateHub", currency: "EUR", issuer: "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq" },
  { label: "BTC · Bitstamp", currency: "BTC", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B" },
  { label: "SOLO · Sologenic", currency: "534F4C4F00000000000000000000000000000000", issuer: "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz" },
];

async function orNull(promise) {
  try {
    return await promise;
  } catch (error) {
    if (error?.code === "actNotFound" || error?.code === "objectNotFound" || error?.code === "entryNotFound") return null;
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const at = String(queryOf(req).at ?? "").trim();
  if (at && !DATE_RE.test(at)) return res.status(400).json({ error: "Pass ?at= a date as YYYY-MM-DD (UTC), or nothing for now." });

  try {
    const latestReply = await rippleRpc("ledger", { ledger_index: "validated" });
    const latest = Number(latestReply.ledger_index ?? latestReply.ledger?.ledger_index);

    // At or below `latest` on every path, so validated.
    let index = latest;
    if (at) {
      const target = new Date(`${at}T23:59:59Z`);
      if (Number.isNaN(target.getTime())) return res.status(400).json({ error: "That date does not exist." });
      const times = new Map();
      // Only ever asked for indexes at or below `latest`, and every ledger
      // at or below the latest validated one is itself validated.
      const closeTimeOf = async (validatedIndex) => {
        if (!times.has(validatedIndex)) {
          const r = await rippleRpc("ledger", { ledger_index: validatedIndex });
          times.set(validatedIndex, Number(r.ledger?.close_time) + RIPPLE_EPOCH);
        }
        return times.get(validatedIndex);
      };
      if (target.getTime() / 1000 >= (await closeTimeOf(latest))) {
        return res.status(400).json({ error: "That date has not ended yet on the ledger." });
      }
      index = await ledgerAtOrBefore(target, latest, closeTimeOf);
    }

    const validatedIndex = index;
    const [header, ...perBook] = await Promise.all([
      rippleRpc("ledger", { ledger_index: validatedIndex }),
      ...HEALTH_BOOKS.map((b) => {
        const issued = { currency: b.currency, issuer: b.issuer };
        return Promise.all([
          rippleRpc("book_offers", { taker_gets: { currency: "XRP" }, taker_pays: issued, ledger_index: validatedIndex, limit: LEVELS }),
          rippleRpc("book_offers", { taker_gets: issued, taker_pays: { currency: "XRP" }, ledger_index: validatedIndex, limit: LEVELS }),
          orNull(rippleRpc("amm_info", { asset: { currency: "XRP" }, asset2: issued, ledger_index: validatedIndex })),
        ]);
      }),
    ]);

    const books = HEALTH_BOOKS.map((b, i) => {
      const [bids, asks, amm] = perBook[i];
      const book = assembleBook(bids.offers ?? [], asks.offers ?? [], validatedIndex);
      const q = quotedVsFillable(book);
      return {
        label: b.label,
        currency: b.currency,
        currency_label: decodeCurrency(b.currency),
        issuer: b.issuer,
        offers_read: { bids: (bids.offers ?? []).length, asks: (asks.offers ?? []).length },
        // XRP per unit of the asset, as /api/book reports it; and the inverse for people.
        mid_xrp_per_unit: book.mid ?? null,
        quoted: { bid: q.quotedBid, ask: q.quotedAsk },
        fillable: { bid: q.fillableBid, ask: q.fillableAsk },
        fillable_ratio: { bid: q.bidRatio ?? null, ask: q.askRatio ?? null },
        amm: ammOf(amm),
      };
    });

    const closeTime = Number(header.ledger?.close_time);
    res.setHeader(
      "Cache-Control",
      at ? "public, max-age=3600, s-maxage=86400, immutable" : "public, max-age=0, s-maxage=120, stale-while-revalidate=600",
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      ledger_index: validatedIndex,
      ledger_hash: header.ledger?.ledger_hash ?? null,
      close_time: Number.isFinite(closeTime) ? rippleTimeToIso(closeTime) : null,
      date: at || null,
      read_at: new Date().toISOString(),
      band: 0.1,
      levels_requested: LEVELS,
      units: "quantities in each book's asset; mid in XRP per unit of the asset",
      books,
      disclosures: DISCLOSURES,
    });
  } catch (error) {
    return res.status(502).json({
      error: "Could not read the ledger from a public XRPL node. Try again shortly.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
