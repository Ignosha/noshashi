/*
 * GET /api/treasury?wallets=r…,r…[&at=YYYY-MM-DD|&ledger=N][&format=raw]
 *
 * The period-end treasury report. See api/_lib/treasury.js for what it
 * states and why. Free and unauthenticated like the certificate: it reads
 * only public ledger state for addresses the caller names, and stores
 * nothing.
 *
 * `at` is a UTC date; the report is taken at the last ledger that closed on
 * or before 23:59:59 that day, which is how a period end is written in a
 * filing. `ledger` pins an exact index instead. Neither means the latest
 * validated ledger.
 *
 * format=raw returns every ledger reply the figures came from, so a reader
 * who does not trust this code can recompute each one.
 */

import { rippleRpc, ADDRESS_RE } from "../authority.js";
import { assembleBook, DISCLOSURES as BOOK_DISCLOSURES } from "../book.js";
import {
  REFERENCE_BOOKS,
  MAX_WALLETS,
  TREASURY_RULES_VERSION,
  TREASURY_DISCLOSURES,
  RIPPLE_EPOCH,
  rippleTimeToIso,
  reservesOf,
  walletOf,
  sumXrp,
  sellXrpInto,
  ammOf,
  ledgerAtOrBefore,
  treasuryDigest,
} from "../treasury.js";
import { queryOf } from "../query.js";

const LEVELS = 100;
/** The FeeSettings singleton's ledger key. Fixed by the protocol. */
const FEE_SETTINGS = "4BC50C9B0D8515D3EAAE1E74B29A95804346C491EE1A95BF25E4AAB854A6A651";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A reply, or null when the ledger answered that the object does not exist. */
async function orNull(promise) {
  try {
    return await promise;
  } catch (error) {
    if (error?.code === "actNotFound" || error?.code === "entryNotFound" || error?.code === "objectNotFound") return null;
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const wallets = [...new Set(String(queryOf(req).wallets ?? "").split(/[\s,]+/).filter(Boolean))];
  if (wallets.length === 0) return res.status(400).json({ error: "Pass ?wallets= one or more XRPL classic addresses, comma-separated." });
  if (wallets.length > MAX_WALLETS) return res.status(400).json({ error: `At most ${MAX_WALLETS} wallets per report.` });
  const bad = wallets.find((w) => !ADDRESS_RE.test(w));
  if (bad) return res.status(400).json({ error: `${bad.slice(0, 40)} is not an XRPL classic address. They begin with r.` });

  const at = String(queryOf(req).at ?? "").trim();
  const pinned = String(queryOf(req).ledger ?? "").trim();
  if (at && !DATE_RE.test(at)) return res.status(400).json({ error: "Pass ?at= a date as YYYY-MM-DD (UTC)." });
  if (pinned && !/^\d{1,10}$/.test(pinned)) return res.status(400).json({ error: "Pass ?ledger= a ledger index." });

  try {
    const latestReply = await rippleRpc("ledger", { ledger_index: "validated" });
    const latest = Number(latestReply.ledger_index ?? latestReply.ledger?.ledger_index);

    // At or below `latest` on every path, so validated: a pinned index above
    // it is refused and the date search never looks past it.
    let index = latest;
    let periodEnd = null;
    if (pinned) {
      index = Number(pinned);
      if (index > latest) return res.status(400).json({ error: `Ledger ${index} is not validated yet. The latest is ${latest}.` });
    } else if (at) {
      const target = new Date(`${at}T23:59:59Z`);
      if (Number.isNaN(target.getTime())) return res.status(400).json({ error: "That date does not exist." });
      periodEnd = target.toISOString();
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
        return res.status(400).json({ error: "That date has not ended yet on the ledger. Pick a past date, or leave it empty for now." });
      }
      index = await ledgerAtOrBefore(target, latest, closeTimeOf);
    }

    // Everything below is read at the one pinned index, so no figure in the
    // report comes from a different ledger than another.
    const validatedIndex = index;
    const [header, fees, infos, books, amms] = await Promise.all([
      rippleRpc("ledger", { ledger_index: validatedIndex }),
      orNull(rippleRpc("ledger_entry", { index: FEE_SETTINGS, ledger_index: validatedIndex })),
      Promise.all(
        wallets.map((account) => orNull(rippleRpc("account_info", { account, ledger_index: validatedIndex, signer_lists: true }))),
      ),
      Promise.all(
        REFERENCE_BOOKS.map((b) => {
          const issued = { currency: b.currency, issuer: b.issuer };
          return Promise.all([
            rippleRpc("book_offers", { taker_gets: { currency: "XRP" }, taker_pays: issued, ledger_index: validatedIndex, limit: LEVELS }),
            rippleRpc("book_offers", { taker_gets: issued, taker_pays: { currency: "XRP" }, ledger_index: validatedIndex, limit: LEVELS }),
          ]);
        }),
      ),
      Promise.all(
        REFERENCE_BOOKS.map((b) =>
          orNull(rippleRpc("amm_info", { asset: { currency: "XRP" }, asset2: { currency: b.currency, issuer: b.issuer }, ledger_index: validatedIndex })),
        ),
      ),
    ]);

    // Historical reads never change; the latest one does.
    const historical = index !== latest;
    res.setHeader(
      "Cache-Control",
      historical ? "public, max-age=3600, s-maxage=86400, immutable" : "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (queryOf(req).format === "raw") {
      return res.status(200).json({
        ledger_index: validatedIndex,
        ledger: header.ledger,
        fee_settings: fees,
        account_info: Object.fromEntries(wallets.map((w, i) => [w, infos[i]])),
        book_offers: REFERENCE_BOOKS.map((b, i) => ({ ...b, bids: books[i][0].offers ?? [], asks: books[i][1].offers ?? [] })),
        amm_info: REFERENCE_BOOKS.map((b, i) => ({ ...b, result: amms[i] })),
      });
    }

    const reserves = reservesOf(fees);
    const walletRows = wallets.map((w, i) => walletOf(w, infos[i], reserves));
    const total = sumXrp(walletRows.map((w) => w.balance_xrp));
    const totalNumber = Number(total ?? 0);
    const keysNeeded = walletRows.map((w) => w.control.keys_needed).filter((k) => k !== null && k !== undefined);

    const bookRows = REFERENCE_BOOKS.map((b, i) => {
      const book = assembleBook(books[i][0].offers ?? [], books[i][1].offers ?? [], index);
      const sell = sellXrpInto(book, totalNumber);
      return {
        label: b.label,
        currency: b.currency,
        issuer: b.issuer,
        offers_read: { bids: (books[i][0].offers ?? []).length, asks: (books[i][1].offers ?? []).length },
        mid_price: sell.mid_price,
        sell,
        amm: ammOf(amms[i]),
      };
    });

    const closeTime = Number(header.ledger?.close_time);
    const report = {
      kind: "treasury",
      rules_version: TREASURY_RULES_VERSION,
      ledger: {
        index,
        hash: header.ledger?.ledger_hash ?? header.ledger_hash ?? null,
        close_time: Number.isFinite(closeTime) ? rippleTimeToIso(closeTime) : null,
        latest_validated: latest,
      },
      period_end: periodEnd,
      reserves: reserves
        ? { base_xrp: Number(reserves.baseDrops) / 1e6, increment_xrp: Number(reserves.incrementDrops) / 1e6 }
        : null,
      wallets: walletRows,
      totals: {
        wallets: walletRows.length,
        found: walletRows.filter((w) => w.found).length,
        balance_xrp: total,
        available_xrp: sumXrp(walletRows.map((w) => w.available_xrp)),
        fewest_keys_to_move_a_wallet: keysNeeded.length ? Math.min(...keysNeeded) : null,
      },
      books: bookRows,
      band: 0.1,
      levels_requested: LEVELS,
      read_at: new Date().toISOString(),
      disclosures: TREASURY_DISCLOSURES,
      book_disclosures: BOOK_DISCLOSURES,
    };
    report.digest = await treasuryDigest(report);
    return res.status(200).json(report);
  } catch (error) {
    return res.status(502).json({
      error: "Could not read the ledger from a public XRPL node. Try again shortly.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
