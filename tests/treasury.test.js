/*
 * The treasury report's arithmetic, held to recorded mainnet replies. The
 * live read is checked on the preview deployment; these pin the figures a
 * reader would recompute from format=raw.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  dropsToXrp,
  sumXrp,
  reservesOf,
  controlOf,
  walletOf,
  sellXrpInto,
  ledgerAtOrBefore,
  treasuryDigest,
  REFERENCE_BOOKS,
} from "../api/_lib/treasury.js";
import { assembleBook, quotedVsFillable } from "../api/_lib/book.js";

const fixture = (name) => JSON.parse(readFileSync(`tests/fixtures/${name}`, "utf8"));
const solo = fixture("issuer-state-solo-107586973.json").result;
const bitstamp = fixture("issuer-state-bitstamp-107586973.json").result;
const rlusd = fixture("issuer-state-rlusd-107586974.json").result;
const book = JSON.parse(readFileSync("src/lib/desk/__tests__/fixtures/book-usd-bitstamp-107312802.json", "utf8"));

describe("exact XRP amounts", () => {
  it("converts drops without floats", () => {
    expect(dropsToXrp("412602491965")).toBe("412602.491965");
    expect(dropsToXrp("1000000")).toBe("1");
    expect(dropsToXrp("1")).toBe("0.000001");
    expect(dropsToXrp("0")).toBe("0");
    expect(dropsToXrp("-5")).toBeNull();
  });

  it("sums balances exactly", () => {
    expect(sumXrp(["0.1", "0.2"])).toBe("0.3");
    expect(sumXrp(["412602.491965", "7460.161228", null])).toBe("420062.653193");
  });
});

describe("reserves", () => {
  it("reads both the pre- and post-XRPFees field names", () => {
    expect(reservesOf({ node: { ReserveBase: 10000000, ReserveIncrement: 2000000 } })).toEqual({ baseDrops: "10000000", incrementDrops: "2000000" });
    expect(reservesOf({ node: { ReserveBaseDrops: "1000000", ReserveIncrementDrops: "200000" } })).toEqual({ baseDrops: "1000000", incrementDrops: "200000" });
  });

  it("never turns an unreadable reserve into zero", () => {
    expect(reservesOf(null)).toBeNull();
    expect(walletOf("rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", bitstamp, null).available_xrp).toBeNull();
  });

  it("subtracts the base plus one increment per owned object", () => {
    const w = walletOf("rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", bitstamp, { baseDrops: "1000000", incrementDrops: "200000" });
    expect(w.balance_xrp).toBe("412602.491965");
    expect(w.owner_count).toBe(378);
    expect(w.reserve_xrp).toBe("76.6");
    expect(w.available_xrp).toBe("412525.891965");
  });
});

describe("who can move a wallet (recorded mainnet accounts)", () => {
  it("names a usable regular key as one key", () => {
    const c = controlOf(bitstamp);
    expect(c.master_key_enabled).toBe(false);
    expect(c.regular_key).toBe("rUUs1jns6tdUQwAABDJyHMUHvdGNvNADvJ");
    expect(c.keys_needed).toBe(1);
    expect(c.summary).toBe("One key can move the whole balance.");
  });

  it("does not count a blackhole regular key as a signer", () => {
    const c = controlOf(solo);
    expect(c.regular_key).toBeNull();
    expect(c.routes).toEqual([]);
    expect(c.keys_needed).toBeNull();
    expect(c.summary).toMatch(/blackholed/);
  });

  it("counts signer weights, not heads", () => {
    const c = controlOf(rlusd);
    expect(c.master_key_enabled).toBe(false);
    expect(c.signer_list.signers).toHaveLength(26);
    expect(c.signer_list.quorum).toBe(25);
    const weights = c.signer_list.signers.map((s) => s.weight).sort((a, b) => b - a);
    let sum = 0;
    let n = 0;
    while (sum < 25) sum += weights[n++];
    expect(c.signer_list.minimum_signers).toBe(n);
    expect(c.keys_needed).toBe(n);
  });

  it("says control is unknown when the account could not be read", () => {
    const c = controlOf(null);
    expect(c.readable).toBe(false);
    expect(walletOf("rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", null, null).found).toBe(false);
  });
});

describe("selling XRP into a recorded book (XRP/USD.Bitstamp, ledger 107,312,802)", () => {
  const assembled = assembleBook(book.bids, book.asks, book.ledger_index);

  it("never counts more than the funded depth", () => {
    const s = sellXrpInto(assembled, 1e12);
    expect(s.xrp_sold).toBeCloseTo(s.capacity_xrp, 6);
    expect(s.capacity_xrp).toBeLessThanOrEqual(s.listed_capacity_xrp);
    expect(s.share_of_holding_sellable).toBeLessThan(1);
  });

  it("agrees with the published ask-side figures", () => {
    const q = quotedVsFillable(assembled);
    const s = sellXrpInto(assembled, 1e12);
    // Same band, same levels: USD received for the whole band is the fillable ask.
    expect(s.asset_received).toBeCloseTo(q.fillableAsk, 6);
  });

  it("fills a small sale at the touch", () => {
    const s = sellXrpInto(assembled, 1);
    expect(s.xrp_sold).toBe(1);
    expect(s.average_price).toBeCloseTo(1 / assembled.asks.find((l) => l.quantity > 0).price, 9);
  });

  it("is zero for an empty holding", () => {
    const s = sellXrpInto(assembled, 0);
    expect(s.xrp_sold).toBe(0);
    expect(s.average_price).toBeNull();
  });
});

describe("finding the ledger for a period end", () => {
  // A deterministic stand-in for ledger close times: one ledger every 3 or
  // 5 seconds alternately, so the first estimate is always off.
  const closeTimeOf = async (i) => 1_700_000_000 + i * 4 + (i % 2 ? 1 : -1);

  it("returns the last ledger closed at or before the moment", async () => {
    const latest = 5_000_000;
    for (const i of [1_234_567, 4_999_000, 10]) {
      const t = new Date((await closeTimeOf(i)) * 1000);
      expect(await ledgerAtOrBefore(t, latest, closeTimeOf)).toBe(i);
      const justBefore = new Date(((await closeTimeOf(i + 1)) - 1) * 1000);
      expect(await ledgerAtOrBefore(justBefore, latest, closeTimeOf)).toBe(i);
    }
  });

  it("returns the latest ledger for a moment after it", async () => {
    expect(await ledgerAtOrBefore(new Date(4e12), 5_000_000, closeTimeOf)).toBe(5_000_000);
  });
});

describe("the digest", () => {
  const report = () => ({
    ledger: { index: 107586973, hash: "AB", close_time: "2026-10-11T16:00:00.000Z" },
    wallets: [walletOf("rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", bitstamp, { baseDrops: "1000000", incrementDrops: "200000" })],
    totals: { balance_xrp: "412602.491965" },
    books: [{ ...REFERENCE_BOOKS[0], mid_price: 2.5, sell: sellXrpInto(assembleBook(book.bids, book.asks, book.ledger_index), 412602.491965) }],
  });

  it("is stable and changes with any stated figure", async () => {
    const a = await treasuryDigest(report());
    expect(a).toMatch(/^[0-9A-F]{64}$/);
    expect(await treasuryDigest(report())).toBe(a);
    const moved = report();
    moved.ledger.index += 1;
    expect(await treasuryDigest(moved)).not.toBe(a);
  });
});
