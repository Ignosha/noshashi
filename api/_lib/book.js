/*
 * Quoted against fillable, server side.
 *
 * A mirror of toLevels / uncrossedTouch / assembleOrderBook in
 * src/lib/xrpl/client.ts and quotedVsFillable in src/lib/desk/liquidity.ts,
 * for the same reason api/_lib/authority.js mirrors the console's authority
 * module: no TypeScript build step here, and no way for either side to
 * import the other. tests/book-parity.test.js runs both on the same
 * recorded mainnet book and fails if they disagree on a single figure.
 *
 * Read the TypeScript for why. In one line: a resting offer advertises its
 * full size whether or not its owner holds it, rippled reports what the
 * owner can actually deliver in taker_gets_funded, and depth summed from
 * the advertised size has been measured at more than ten times what can
 * fill.
 */

/** Offers within this fraction of the reference mid. A chosen parameter, stated in every output. */
export const BAND = 0.1;

const amount = (value) => {
  if (typeof value === "string") {
    const n = Number(value) / 1_000_000;
    return Number.isFinite(n) ? Number(n.toFixed(6)) : 0;
  }
  if (value && typeof value === "object") return Number(value.value ?? 0);
  return 0;
};

export function toLevels(offers, invert) {
  const levels = new Map();
  for (const offer of offers ?? []) {
    const gets = amount(offer.TakerGets);
    const pays = amount(offer.TakerPays);
    if (gets <= 0 || pays <= 0) continue;
    const getsFunded = offer.taker_gets_funded !== undefined ? amount(offer.taker_gets_funded) : gets;
    const paysFunded = offer.taker_pays_funded !== undefined ? amount(offer.taker_pays_funded) : pays;
    const price = invert ? gets / pays : pays / gets;
    if (!Number.isFinite(price) || price <= 0) continue;
    const listed = invert ? pays : gets;
    const funded = invert ? paysFunded : getsFunded;
    const entry = levels.get(price) ?? { funded: 0, listed: 0 };
    if (Number.isFinite(funded) && funded > 0) entry.funded += Math.min(funded, listed);
    entry.listed += listed;
    levels.set(price, entry);
  }
  const sorted = [...levels.entries()].sort((a, b) => (invert ? b[0] - a[0] : a[0] - b[0]));
  let running = 0;
  return sorted.map(([price, { funded, listed }]) => {
    running += funded;
    return { price, quantity: funded, listedQuantity: listed, cumulative: running };
  });
}

function uncrossedTouch(bids, asks) {
  const ask = asks[0]?.price;
  if (ask === undefined) return { bid: bids[0]?.price, ask: undefined };
  for (const level of bids) if (level.price < ask) return { bid: level.price, ask };
  return { bid: undefined, ask };
}

/** Two book_offers replies as one book: bids pay XRP for the asset, asks the reverse. */
export function assembleBook(bidOffers, askOffers, ledgerIndex) {
  const bids = toLevels(bidOffers, true);
  const asks = toLevels(askOffers, false);
  const { bid, ask } = uncrossedTouch(bids, asks);
  const mid = bid !== undefined && ask !== undefined ? (bid + ask) / 2 : undefined;
  return {
    bids,
    asks,
    bestBid: bids[0]?.price,
    bestAsk: asks[0]?.price,
    referenceBid: bid,
    referenceAsk: ask,
    mid,
    crossed: bids[0] !== undefined && asks[0] !== undefined && bids[0].price > asks[0].price,
    ledgerIndex,
  };
}

export function quotedVsFillable(book) {
  const within = (price) => book.mid === undefined || Math.abs(price - book.mid) <= book.mid * BAND;
  const sum = (levels, key) => levels.filter((l) => within(l.price)).reduce((t, l) => t + l[key], 0);
  const quotedBid = sum(book.bids, "listedQuantity");
  const quotedAsk = sum(book.asks, "listedQuantity");
  const fillableBid = sum(book.bids, "quantity");
  const fillableAsk = sum(book.asks, "quantity");
  return {
    quotedBid,
    quotedAsk,
    fillableBid,
    fillableAsk,
    bidRatio: quotedBid > 0 ? fillableBid / quotedBid : undefined,
    askRatio: quotedAsk > 0 ? fillableAsk / quotedAsk : undefined,
    band: book.mid === undefined ? undefined : BAND,
    ledgerIndex: book.ledgerIndex,
  };
}

/** The disclosures that travel with every depth figure. */
export const DISCLOSURES = [
  "Within 10% of the reference mid (a chosen parameter; the whole book when no mid can be set).",
  "Reference mid is the tightest uncrossed bid/ask pair, so one stale offer cannot set it.",
  "DEX order book only: AMM pool liquidity is not included.",
  "At most the number of offers per side stated in `levels_requested`; deeper offers are not counted.",
  "Fillable counts what each offer's owner held at this ledger (taker_gets_funded).",
];
