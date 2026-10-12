import { describe, expect, it } from "vitest";
import book from "./fixtures/book-usd-bitstamp-107312802.json";
import { assembleOrderBook } from "@/lib/xrpl/client";
import { quotedVsFillable } from "../liquidity";
// The website's server-side copy (api/book.js serves it). Plain ESM, no
// TypeScript build, so it cannot import this module — and so it is held to
// it here instead, figure for figure, on a real mainnet book.
// @ts-expect-error — plain JS module without type declarations
import { assembleBook, quotedVsFillable as serverQvf } from "../../../../api/_lib/book.js";

const BITSTAMP = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";

describe("api/_lib/book.js agrees with the console on a real book", () => {
  const console = assembleOrderBook(book.bids, book.asks, book.ledger_index, "USD", BITSTAMP);
  const server = assembleBook(book.bids, book.asks, book.ledger_index);

  it("builds the same levels on both sides", () => {
    expect(server.bids).toEqual(console.bids);
    expect(server.asks).toEqual(console.asks);
  });

  it("sets the same reference mid", () => {
    expect(server.mid).toBe(console.mid);
    expect(server.referenceBid).toBe(console.referenceBid);
    expect(server.referenceAsk).toBe(console.referenceAsk);
    expect(server.crossed).toBe(console.crossed);
  });

  it("reports the same quoted and fillable figures", () => {
    expect(serverQvf(server)).toEqual(quotedVsFillable(console));
  });
});
