import { describe, it, expect } from "vitest";
import {
  bookFindings,
  buildSide,
  type BookReport,
  type BookSide,
  type BookOffer,
} from "../book";
import { toLevels } from "@/lib/xrpl/client";

/**
 * Order book integrity.
 *
 * The claim under test is "how much of this depth can actually fill". It
 * fails in two directions and both cost money: overstating depth tells an
 * operator they can exit a position the book cannot absorb, and
 * understating it makes a healthy book look broken and drives them
 * somewhere worse.
 *
 * Fixtures use the real proportions measured on mainnet 2026-08-28 —
 * Bitstamp USD at 7.2% funded, GateHub bids at 98.1% — so a threshold moved
 * far enough to misclassify either of those real books fails here.
 */

const offer = (over: Partial<BookOffer> = {}): BookOffer => ({
  account: "rMaker",
  listed: 1_000,
  fundable: 1_000,
  price: 0.5,
  dead: false,
  expired: false,
  ...over,
});

const side = (over: Partial<BookSide> = {}): BookSide => {
  const offers = over.offers ?? [offer()];
  const listedDepth = over.listedDepth ?? offers.reduce((s, o) => s + o.listed, 0);
  const fundableDepth = over.fundableDepth ?? offers.reduce((s, o) => s + o.fundable, 0);
  return {
    offers,
    listedDepth,
    fundableDepth,
    fundedRatio: listedDepth > 0 ? fundableDepth / listedDepth : 1,
    deadOffers: offers.filter((o) => o.dead).length,
    bestPrice: offers.find((o) => !o.dead)?.price,
    ...over,
  };
};

const report = (over: Partial<BookReport> = {}): BookReport => ({
  pair: "USD/XRP",
  currency: "USD",
  issuer: "rIssuer",
  bids: side(),
  asks: side({ offers: [offer({ price: 0.6 })] }),
  makers: 20,
  topMakerShare: 0.1,
  topMaker: "rMaker",
  ledgerIndex: 106_599_989,
  ledgerCloseTime: new Date("2026-08-28T00:00:00Z"),
  readAt: "2026-08-28T00:00:00Z",
  ...over,
});

describe("bookFindings — phantom depth", () => {
  it("raises CRITICAL when almost none of the quoted depth can fill", () => {
    // The real Bitstamp USD ask side: 1,606,485 listed, 116,105 fundable.
    const asks = side({
      offers: [
        offer({ listed: 1_400_100, fundable: 22_240 }),
        offer({ listed: 206_385, fundable: 93_865, account: "rOther" }),
      ],
    });
    const f = bookFindings(report({ asks }));
    const phantom = f.find((x) => x.id === "phantom-Asks");
    expect(phantom?.severity).toBe("critical");
    expect(phantom!.title).toMatch(/9[0-9]\.\d% of asks depth cannot fill/);
  });

  it("tells the operator to size against the fundable figure", () => {
    const asks = side({ offers: [offer({ listed: 1_000_000, fundable: 10_000 })] });
    const f = bookFindings(report({ asks }));
    expect(f.find((x) => x.id === "phantom-Asks")!.action).toMatch(/fundable/i);
  });

  it("does not condemn a healthy book", () => {
    // The real GateHub bid side: 98.1% funded.
    const bids = side({ offers: [offer({ listed: 304_014, fundable: 298_240 })] });
    const f = bookFindings(report({ bids }));
    expect(f.find((x) => x.id === "phantom-Bids")).toBeUndefined();
    expect(f.find((x) => x.id === "funded-Bids")?.severity).toBe("ok");
  });

  it("warns rather than screams in the middle band", () => {
    // GateHub asks: 40.9% funded — bad, but not the 7% case.
    const asks = side({ offers: [offer({ listed: 1_881_039, fundable: 769_816 })] });
    expect(bookFindings(report({ asks })).find((x) => x.id === "phantom-Asks")?.severity).toBe(
      "warn"
    );
  });

  it("reports an empty side rather than implying a price exists", () => {
    const f = bookFindings(report({ asks: side({ offers: [], listedDepth: 0, fundableDepth: 0 }) }));
    const empty = f.find((x) => x.id === "empty-Asks");
    expect(empty?.severity).toBe("warn");
    expect(empty!.detail).toMatch(/no price here/i);
  });
});

describe("bookFindings — who is holding the book up", () => {
  it("flags a single account resting most of the quoted depth", () => {
    // Bitstamp's real figure was 80%.
    const f = bookFindings(report({ topMakerShare: 0.8, topMaker: "rWhale" }));
    const conc = f.find((x) => x.id === "maker-concentration");
    expect(conc?.severity).toBe("warn");
    expect(conc!.detail).toContain("rWhale");
  });

  it("stays quiet when makers are spread out", () => {
    const f = bookFindings(report({ topMakerShare: 0.08 }));
    expect(f.find((x) => x.id === "maker-concentration")).toBeUndefined();
  });
});

describe("bookFindings — expiry and touch", () => {
  it("counts offers already past their expiry", () => {
    const f = bookFindings(
      report({
        bids: side({ offers: [offer({ expired: true, dead: true, fundable: 0 })] }),
      })
    );
    const exp = f.find((x) => x.id === "expired");
    expect(exp).toBeDefined();
    expect(exp!.detail).toMatch(/excluded from the fundable figures/i);
  });

  it("measures the spread on offers that can actually fill", () => {
    const f = bookFindings(
      report({
        bids: side({ offers: [offer({ price: 0.5 })] }),
        asks: side({ offers: [offer({ price: 0.6 })] }),
      })
    );
    const spread = f.find((x) => x.id === "spread");
    expect(spread).toBeDefined();
    expect(spread!.detail).toMatch(/offers that can actually fill/i);
  });

  it("ignores a dead offer when choosing the touch", () => {
    // A wholly unfunded offer at a better price must not set the spread —
    // that is exactly the number a naive book would quote.
    const asks = side({
      offers: [
        offer({ price: 0.51, fundable: 0, dead: true }),
        offer({ price: 0.6, account: "rReal" }),
      ],
    });
    const f = bookFindings(report({ asks }));
    // 0.5 bid against 0.6 fundable ask is not crossed; against 0.51 it would be.
    expect(f.find((x) => x.id === "crossed")).toBeUndefined();
    expect(f.find((x) => x.id === "spread")).toBeDefined();
  });

  it("reports a crossed fundable touch instead of hiding it", () => {
    const f = bookFindings(
      report({
        bids: side({ offers: [offer({ price: 0.7 })] }),
        asks: side({ offers: [offer({ price: 0.6 })] }),
      })
    );
    expect(f.find((x) => x.id === "crossed")?.severity).toBe("warn");
  });
});

/**
 * Parsing tests, added because every mutation escaped without them.
 *
 * Three separate breaks — reporting listed depth as fillable, pinning
 * fundedRatio to 1, and letting a wholly unfunded offer set the touch — all
 * passed the eleven tests above, because each fed a hand-built BookSide
 * into bookFindings and none exercised the function that reads the ledger.
 * A fourth, reverting toLevels to listed amounts, reintroduced the shipped
 * exit-liquidity bug with nothing failing.
 *
 * Offer shapes below are captured from mainnet book_offers responses.
 */
describe("buildSide — reading real offers", () => {
  // The genuine 1.4M-listed / 22K-funded offer from Bitstamp's ask side.
  const whale = {
    Account: "rBTwLga3i2gz",
    TakerGets: { currency: "USD", issuer: "rvYA", value: "1400100.5" },
    TakerPays: "1000000000",
    taker_gets_funded: { currency: "USD", issuer: "rvYA", value: "22240.28838254035" },
    owner_funds: "22273.64881511416",
  };
  const solid = {
    Account: "rPrDM69juKRk",
    TakerGets: { currency: "USD", issuer: "rvYA", value: "1.562" },
    TakerPays: "1100000",
    owner_funds: "58465.11030695114",
  };

  it("uses the funded amount, not the listed one", () => {
    const s = buildSide([whale], 0, false);
    expect(s.listedDepth).toBeCloseTo(1_400_100.5, 1);
    expect(s.fundableDepth).toBeCloseTo(22_240.288, 2);
    expect(s.fundedRatio).toBeLessThan(0.02);
  });

  it("treats an absent taker_gets_funded as fully funded", () => {
    // Absence means the owner can cover it — the opposite of the usual
    // absent-means-nothing reading, and getting it backwards would report
    // every healthy offer as dead.
    const s = buildSide([solid], 0, false);
    expect(s.fundableDepth).toBeCloseTo(1.562, 3);
    expect(s.fundedRatio).toBe(1);
    expect(s.deadOffers).toBe(0);
  });

  it("counts a zero-funded offer as dead but keeps its listed size visible", () => {
    const dead = {
      ...whale,
      taker_gets_funded: { currency: "USD", issuer: "rvYA", value: "0" },
    };
    const s = buildSide([dead], 0, false);
    expect(s.deadOffers).toBe(1);
    expect(s.fundableDepth).toBe(0);
    expect(s.listedDepth).toBeCloseTo(1_400_100.5, 1); // phantom stays visible
  });

  it("excludes an expired offer from fundable depth", () => {
    const expired = { ...solid, Expiration: 100 };
    const s = buildSide([expired], 200 /* ledger close after expiry */, false);
    expect(s.offers[0].expired).toBe(true);
    expect(s.fundableDepth).toBe(0);
  });

  it("keeps an unexpired offer with a future expiry", () => {
    const s = buildSide([{ ...solid, Expiration: 900 }], 200, false);
    expect(s.offers[0].expired).toBe(false);
    expect(s.fundableDepth).toBeGreaterThan(0);
  });

  it("does not let a dead offer become the best price", () => {
    const better = {
      ...solid,
      Account: "rGhost",
      TakerPays: "500000",
      taker_gets_funded: { currency: "USD", issuer: "rvYA", value: "0" },
    };
    const s = buildSide([better, solid], 0, false);
    expect(s.bestPrice).toBe(s.offers.find((o) => !o.dead)!.price);
    expect(s.offers[0].dead).toBe(true); // it still sorts to the front
  });

  it("never reports fundable above listed", () => {
    // A malformed response claiming more funded than listed must clamp,
    // not inflate depth.
    const liar = {
      ...whale,
      taker_gets_funded: { currency: "USD", issuer: "rvYA", value: "99999999" },
    };
    const s = buildSide([liar], 0, false);
    expect(s.fundableDepth).toBeLessThanOrEqual(s.listedDepth);
    expect(s.fundedRatio).toBeLessThanOrEqual(1);
  });
});

describe("toLevels — the depth every downstream calculation reads", () => {
  it("aggregates funded quantity and keeps listed alongside it", () => {
    // Guards the shipped exit-liquidity fix: summing TakerGets here told
    // an operator they could exit ~14x what the book could absorb.
    const levels = toLevels(
      [
        {
          TakerGets: { currency: "USD", issuer: "rvYA", value: "1400100.5" },
          TakerPays: "1000000000",
          taker_gets_funded: { currency: "USD", issuer: "rvYA", value: "22240.28838254035" },
        },
      ],
      false
    );
    expect(levels).toHaveLength(1);
    expect(levels[0].quantity).toBeCloseTo(22_240.288, 2);
    expect(levels[0].listedQuantity).toBeCloseTo(1_400_100.5, 1);
    expect(levels[0].cumulative).toBeCloseTo(22_240.288, 2);
  });

  it("contributes nothing fillable from a wholly unfunded offer", () => {
    const levels = toLevels(
      [
        {
          TakerGets: { currency: "USD", issuer: "rvYA", value: "500" },
          TakerPays: "1000000",
          taker_gets_funded: { currency: "USD", issuer: "rvYA", value: "0" },
        },
      ],
      false
    );
    expect(levels[0].quantity).toBe(0);
    expect(levels[0].listedQuantity).toBe(500);
  });
});
