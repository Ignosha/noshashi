import { describe, expect, it } from "vitest";
import book from "./fixtures/book-usd-bitstamp-107312802.json";
import { assembleOrderBook } from "@/lib/xrpl/client";
import { quotedVsFillable, simulateExit } from "../liquidity";

/**
 * Quoted against fillable, on a real XRP/USD.Bitstamp book at ledger
 * 107,312,802. One ask quotes 1,450,000.7 USD; its owner holds enough for
 * 3,370.63. Most bids near the touch are resting offers whose owners hold
 * nothing at all (taker_gets_funded "0").
 */

const BITSTAMP = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const ob = assembleOrderBook(book.bids, book.asks, book.ledger_index, "USD", BITSTAMP);

describe("quoted vs fillable (real book)", () => {
  const q = quotedVsFillable(ob);

  it("reads the ledger it was taken at", () => {
    expect(q.ledgerIndex).toBe(107_312_802);
  });

  it("never reports more fillable than quoted", () => {
    expect(q.fillableBid).toBeLessThanOrEqual(q.quotedBid);
    expect(q.fillableAsk).toBeLessThanOrEqual(q.quotedAsk);
  });

  it("exposes the 1,450,000.7 USD ask that can deliver 3,370.63", () => {
    const quotedAll = ob.asks.reduce((t, l) => t + l.listedQuantity, 0);
    const fillableAll = ob.asks.reduce((t, l) => t + l.quantity, 0);
    expect(quotedAll - fillableAll).toBeGreaterThan(1_446_000);
    expect(quotedAll - fillableAll).toBeLessThan(1_447_000);
    expect(q.askRatio).toBeDefined();
    expect(q.askRatio!).toBeLessThan(0.05);
  });

  it("an exit is simulated against fillable depth, never the quote", () => {
    const quotedBidAll = ob.bids.reduce((t, l) => t + l.listedQuantity, 0);
    const fill = simulateExit(ob, quotedBidAll);
    expect(fill.filled).toBeLessThanOrEqual(ob.bids.reduce((t, l) => t + l.quantity, 0) + 1e-9);
  });
});
