import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { walkBook, canonical, receiptFor, assemble, LIMITATIONS, SCHEMA } from "../api/_lib/asset-risk.js";
import handler, { LIMIT_PER_MINUTE } from "../api/_lib/routes/asset-risk.js";
import { DISCLOSURES } from "../api/_lib/book.js";
import { take } from "../api/_lib/rate-limit.js";

/**
 * GET /api/v1/asset-risk: the report's arithmetic, its receipt, and the
 * request contract. The ledger reads themselves are the authority and
 * book modules, which have their own tests; the certificate here is the
 * real Bitstamp one recorded in tests/fixtures.
 */

const bitstamp = JSON.parse(readFileSync("tests/fixtures/authority-bitstamp-107585800.json", "utf8"));

// Book levels as book.js emits them: best price first, quantity funded.
const bids = [
  { price: 0.74, quantity: 100, listedQuantity: 100, cumulative: 100 },
  { price: 0.72, quantity: 50, listedQuantity: 900, cumulative: 150 },
];
const asks = [{ price: 0.79, quantity: 40, listedQuantity: 4000, cumulative: 40 }];
const mid = 0.765;

describe("walkBook", () => {
  it("fills a sale from the best bid down and reports the impact against mid", () => {
    const sell = walkBook(bids, 120, mid);
    expect(sell.filled).toBe(120);
    expect(sell.fully_fillable).toBe(true);
    expect(sell.levels_used).toBe(2);
    expect(sell.worst_price).toBe(0.72);
    // (100 × 0.74 + 20 × 0.72) / 120
    expect(sell.average_price).toBeCloseTo(0.736667, 6);
    expect(sell.impact_vs_mid_pct).toBeCloseTo(((0.736667 - mid) / mid) * 100, 2);
  });

  it("says how much could not fill when the book is too thin", () => {
    const buy = walkBook(asks, 100, mid);
    expect(buy.filled).toBe(40);
    expect(buy.unfilled).toBe(60);
    expect(buy.fully_fillable).toBe(false);
  });

  it("counts only funded quantity, never the advertised size", () => {
    expect(walkBook(bids, 1000, mid).filled).toBe(150);
  });

  it("returns nothing for no size, and no impact without a mid", () => {
    expect(walkBook(bids, 0, mid)).toBeNull();
    expect(walkBook(bids, 10, undefined).impact_vs_mid_pct).toBeNull();
    expect(walkBook([], 10, mid).average_price).toBeNull();
  });
});

describe("receipt", () => {
  it("does not depend on key order", async () => {
    expect(canonical({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(canonical({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }));
    expect(await receiptFor({ x: 1, y: 2 })).toBe(await receiptFor({ y: 2, x: 1 }));
  });

  it("changes when any figure changes", async () => {
    expect(await receiptFor({ x: 1 })).not.toBe(await receiptFor({ x: 2 }));
    expect(await receiptFor({ x: 1 })).toMatch(/^[0-9A-F]{64}$/);
  });
});

describe("assemble", () => {
  const book = { bids, asks, referenceBid: 0.74, referenceAsk: 0.79, mid, ledgerIndex: 107585803 };
  const quoted = { quotedBid: 1000, quotedAsk: 4000, fillableBid: 150, fillableAsk: 40, bidRatio: 0.15, askRatio: 0.01, band: 0.1 };
  const base = { levelsRequested: 100, issuer: bitstamp.issuer, currency: "USD", currencyLabel: "USD", certificate: bitstamp, book, quoted, size: 120, disclosures: DISCLOSURES, evaluatedAt: "2026-10-25T00:00:00.000Z" };

  it("carries the certificate's verdict, rules and digest without re-deciding them", () => {
    const r = assemble(base);
    expect(r.schema).toBe(SCHEMA);
    expect(r.issuer_controls.authority_verdict).toBe(bitstamp.verdict);
    expect(r.issuer_controls.certificate_digest).toBe(bitstamp.digest);
    expect(r.issuer_controls.rules_version).toBe(2);
    expect(r.issuer_controls.checks).toHaveLength(bitstamp.checks.length);
    expect(r.ledgers).toEqual({ issuer_controls: 107585800, liquidity: 107585803, gap: 3 });
    expect(r.liquidity.exit.sell.filled).toBe(120);
    expect(r.liquidity.levels_requested).toBe(100);
    expect(r.liquidity.exit.buy.fully_fillable).toBe(false);
    expect(r.unknowns).toEqual([]);
  });

  it("never claims safety, and always lists what it did not check", () => {
    const r = assemble(base);
    expect(r.limitations).toEqual(LIMITATIONS);
    // The only mention of safety is the disclaimer that denies it.
    const { limitations, ...rest } = r;
    expect(limitations[0]).toMatch(/^Not a rating/);
    expect(JSON.stringify(rest)).not.toMatch(/\bsafe\b/i);
  });

  it("names each missing source instead of failing the report", () => {
    const r = assemble({ ...base, certificate: null, certificateError: "timeout" });
    expect(r.issuer_controls).toBeNull();
    expect(r.unknowns[0]).toMatch(/^issuer_controls: timeout/);
    const noCurrency = assemble({ ...base, currency: undefined, book: null, quoted: null, size: undefined });
    expect(noCurrency.liquidity).toBeNull();
    expect(noCurrency.unknowns[0]).toMatch(/pass \?currency=/);
  });

  it("does not estimate an exit without a size", () => {
    expect(assemble({ ...base, size: undefined }).liquidity.exit).toBeNull();
  });
});

describe("GET /api/v1/asset-risk contract", () => {
  let ip = 0;
  const call = async (query, method = "GET") => {
    ip += 1;
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; },
    };
    await handler({ method, query, headers: { "x-forwarded-for": `10.1.0.${ip}` } }, res);
    return res;
  };

  it.each([
    [{}, "invalid_issuer"],
    [{ issuer: "not-an-address" }, "invalid_issuer"],
    [{ issuer: bitstamp.issuer, currency: "XRP" }, "invalid_currency"],
    [{ issuer: bitstamp.issuer, currency: "USD", size: "-5" }, "invalid_size"],
    [{ issuer: bitstamp.issuer, size: "10" }, "size_needs_currency"],
  ])("rejects %j with %s", async (query, code) => {
    const res = await call(query);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe(code);
    expect(res.body.message).toBeTruthy();
  });

  it("answers only GET", async () => {
    const res = await call({ issuer: bitstamp.issuer }, "POST");
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe("method_not_allowed");
  });

  it(`answers 429 once a caller has made ${LIMIT_PER_MINUTE} uncached requests in a minute`, async () => {
    // Fill this caller's window the way earlier requests would, then send
    // a valid request: it must be refused before any ledger read.
    for (let n = 0; n < LIMIT_PER_MINUTE; n += 1) take("asset-risk:10.9.9.9", { limit: LIMIT_PER_MINUTE, windowMs: 60_000 });
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; },
    };
    await handler({ method: "GET", query: { issuer: bitstamp.issuer }, headers: { "x-forwarded-for": "10.9.9.9" } }, res);
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe("rate_limited");
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("does not count rejected requests against the limit", async () => {
    const res = await call({ issuer: bitstamp.issuer, currency: "@@" });
    expect(res.statusCode).toBe(400);
    expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
  });
});
