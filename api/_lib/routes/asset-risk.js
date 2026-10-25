/*
 * GET /api/v1/asset-risk?issuer=r…&currency=USD[&size=1000]
 *
 * One issued asset in one call: what the issuer can do to holders
 * (freeze, claw back, require approval, charge a fee, who controls the
 * keys) and what its XRP order book can actually absorb, both read from
 * validated ledgers, with the unknowns listed and a SHA-256 receipt over
 * the whole report. Schema and assembly: api/_lib/asset-risk.js.
 *
 * Free and keyless while NOSHASHI finds out what developers use, so a
 * first call takes one curl and no account. Abuse control is the same as
 * the other public reads: a minute at the edge (a cached answer costs no
 * ledger read) and a per-caller limit on what reaches the function.
 *
 * Errors are { error: <stable code>, message }, the shape the Compliance
 * API uses, so a client handles both the same way.
 */

import { readAuthoritySurface, certificateFrom, rippleRpc, ADDRESS_RE, decodeCurrency } from "../authority.js";
import { assembleBook, quotedVsFillable, DISCLOSURES } from "../book.js";
import { assemble, receiptFor } from "../asset-risk.js";
import { clientKey, take } from "../rate-limit.js";
import { queryOf } from "../query.js";

const LEVELS = 100;
const CURRENCY_RE = /^(?:[A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}|[0-9A-Fa-f]{40})$/;
export const LIMIT_PER_MINUTE = 30;

const fail = (res, status, error, message) => res.status(status).json({ error, message });

async function readBook(issued) {
  const ledger = await rippleRpc("ledger", { ledger_index: "validated" });
  const validatedIndex = Number(ledger.ledger_index ?? ledger.ledger?.ledger_index);
  const [bids, asks] = await Promise.all([
    rippleRpc("book_offers", { taker_gets: { currency: "XRP" }, taker_pays: issued, ledger_index: validatedIndex, limit: LEVELS }),
    rippleRpc("book_offers", { taker_gets: issued, taker_pays: { currency: "XRP" }, ledger_index: validatedIndex, limit: LEVELS }),
  ]);
  return assembleBook(bids.offers ?? [], asks.offers ?? [], validatedIndex);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return fail(res, 405, "method_not_allowed", "Use GET.");
  }

  const q = queryOf(req);
  const issuer = String(q.issuer ?? "").trim();
  const rawCurrency = String(q.currency ?? "").trim();
  const rawSize = q.size === undefined || q.size === "" ? undefined : Number(q.size);

  if (!ADDRESS_RE.test(issuer)) return fail(res, 400, "invalid_issuer", "Pass ?issuer= the issuing account, an XRPL classic address beginning with r.");
  if (rawCurrency && (!CURRENCY_RE.test(rawCurrency) || rawCurrency.toUpperCase() === "XRP")) {
    return fail(res, 400, "invalid_currency", "Pass ?currency= a 3-character code or a 40-hex currency code (not XRP).");
  }
  if (rawSize !== undefined && !(Number.isFinite(rawSize) && rawSize > 0 && rawSize <= 1e15)) {
    return fail(res, 400, "invalid_size", "Pass ?size= a positive number of units of the asset to estimate an exit for.");
  }
  if (rawSize !== undefined && !rawCurrency) {
    return fail(res, 400, "size_needs_currency", "?size= estimates an exit on one order book, so it needs ?currency= too.");
  }

  const limit = take(`asset-risk:${clientKey(req)}`, { limit: LIMIT_PER_MINUTE, windowMs: 60_000 });
  res.setHeader("X-RateLimit-Limit", String(LIMIT_PER_MINUTE));
  if (!limit.ok) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return fail(res, 429, "rate_limited", `At most ${LIMIT_PER_MINUTE} uncached requests a minute per caller. Retry after ${limit.retryAfter}s, or ask institutions@noshashi.app for a higher limit.`);
  }
  res.setHeader("X-RateLimit-Remaining", String(limit.remaining));

  const currency = rawCurrency ? rawCurrency.toUpperCase() : undefined;
  const evaluatedAt = new Date().toISOString();

  // Both reads run at once and fail independently: a report with one
  // source missing says which, rather than failing the whole call.
  const [certResult, bookResult] = await Promise.allSettled([
    readAuthoritySurface(issuer).then(certificateFrom),
    currency ? readBook({ currency, issuer }) : Promise.resolve(null),
  ]);

  const certificate = certResult.status === "fulfilled" ? certResult.value : null;
  const book = bookResult.status === "fulfilled" ? bookResult.value : null;
  if (!certificate && currency && !book) {
    return fail(res, 502, "ledger_unreachable", "Could not read the issuer or its order book from a public XRPL node. Try again shortly.");
  }
  if (!certificate && !currency) {
    return fail(res, 502, "ledger_unreachable", "Could not read the issuer from a public XRPL node. Try again shortly.");
  }

  const assessed = assemble({
    levelsRequested: LEVELS,
    issuer,
    currency,
    currencyLabel: currency ? decodeCurrency(currency) : undefined,
    certificate,
    certificateError: certResult.status === "rejected" ? String(certResult.reason?.message ?? certResult.reason) : undefined,
    book,
    quoted: book ? quotedVsFillable(book) : null,
    bookError: bookResult.status === "rejected" ? String(bookResult.reason?.message ?? bookResult.reason) : undefined,
    size: rawSize,
    disclosures: DISCLOSURES,
    evaluatedAt,
  });

  const report = {
    ...assessed,
    // Where to re-read each source yourself. Inside the digest, so a
    // receipt also pins which reads it claims to rest on.
    evidence: {
      issuer_state: `/api/issuer-state?issuer=${issuer}`,
      certificate: `/api/authority?issuer=${issuer}`,
      ...(currency ? { order_book_raw: `/api/book?currency=${encodeURIComponent(currency)}&issuer=${issuer}&format=raw` } : {}),
    },
  };
  const digest = await receiptFor(report);
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
  return res.status(200).json({
    ...report,
    receipt: {
      algorithm: "SHA-256",
      digest,
      covers: "Canonical JSON (keys sorted at every depth) of every field in this response except `receipt`.",
    },
  });
}
