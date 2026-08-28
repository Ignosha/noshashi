import { rpc } from "@/lib/xrpl/client";

/**
 * Order book integrity — what the book advertises against what can fill.
 *
 * Offers are more than half of everything that happens on this ledger. A
 * transaction census over 60 consecutive ledgers on 2026-08-28 found
 * OfferCreate and OfferCancel together at 50.6% of 7,499 transactions,
 * more than payments.
 *
 * And the book lies, in a specific and measurable way. An offer rests
 * whether or not its owner still holds the asset to honour it. rippled
 * reports the truth in `taker_gets_funded`, which appears ONLY when the
 * owner cannot cover the listed amount — so its absence means fully
 * funded, and its presence means this is all they actually have. Nothing
 * removes a stale offer until someone tries to cross it.
 *
 * Measured on mainnet the same day:
 *
 *   USD/Bitstamp   1,606,485 listed   116,107 fundable   92.8% phantom
 *   USD/GateHub    1,881,039 listed   772,777 fundable   58.9% phantom
 *
 * One offer advertised 1,400,100 USD against an owner balance of 22,273 —
 * 1.6% real, and on its own most of the visible depth on that side.
 *
 * This is the same shape as the partial-payment trap: a number the ledger
 * publishes, taken at face value, that means something other than what it
 * appears to. There the gap is between requested and delivered; here it is
 * between quoted and fillable.
 */

/** Ripple epoch: 2000-01-01. */
const RIPPLE_EPOCH_OFFSET = 946_684_800;
/** Below this fraction fundable, the book is advertising something else. */
const PHANTOM_FLOOR = 0.5;
/** A single offer holding more than this share of listed depth dominates. */
const DOMINANT_SHARE = 0.25;

export type BookOffer = {
  account: string;
  /** What the offer advertises, in the asset being sold. */
  listed: number;
  /** What its owner can actually deliver right now. */
  fundable: number;
  price: number;
  /** True when nothing at all can fill. */
  dead: boolean;
  /** Set when the offer carries an expiry that has already passed. */
  expired: boolean;
};

export type BookSide = {
  offers: BookOffer[];
  listedDepth: number;
  fundableDepth: number;
  /** fundable / listed. 1 means every quoted unit is real. */
  fundedRatio: number;
  deadOffers: number;
  bestPrice?: number;
};

export type BookReport = {
  pair: string;
  currency: string;
  issuer: string;
  bids: BookSide;
  asks: BookSide;
  /** Distinct accounts resting offers across both sides. */
  makers: number;
  /** Largest share of listed depth held by one account, either side. */
  topMakerShare: number;
  topMaker?: string;
  ledgerIndex: number;
  ledgerCloseTime: Date;
  readAt: string;
};

const amount = (value: unknown): number => {
  if (typeof value === "string") return Number(value) / 1_000_000;
  if (value && typeof value === "object") return Number((value as any).value ?? 0);
  return 0;
};

/**
 * Turn raw `book_offers` entries into a side.
 *
 * Exported for testing. Three mutations of this function — reporting listed
 * depth as fillable, forcing fundedRatio to 1, and letting a wholly
 * unfunded offer set the touch — all passed a suite that fed hand-built
 * sides into bookFindings. The reasoning was covered; the step that reads
 * the ledger was not.
 */
export function buildSide(
  raw: Array<Record<string, any>>,
  closeTime: number,
  /** True when the asset being sold is the quote (XRP) rather than the base. */
  invert: boolean
): BookSide {
  const offers: BookOffer[] = [];

  for (const o of raw) {
    const gets = amount(o.TakerGets);
    const pays = amount(o.TakerPays);
    if (gets <= 0 || pays <= 0) continue;

    const getsFunded =
      o.taker_gets_funded !== undefined ? amount(o.taker_gets_funded) : gets;
    const paysFunded =
      o.taker_pays_funded !== undefined ? amount(o.taker_pays_funded) : pays;

    const price = invert ? gets / pays : pays / gets;
    if (!Number.isFinite(price) || price <= 0) continue;

    const listed = invert ? pays : gets;
    const fundableRaw = invert ? paysFunded : getsFunded;
    const fundable = Number.isFinite(fundableRaw) ? Math.max(0, Math.min(fundableRaw, listed)) : 0;

    // An offer past its expiry cannot fill even if fully funded. rippled
    // prunes these lazily, so they can still be sitting in the book.
    const expired =
      o.Expiration !== undefined && Number(o.Expiration) < closeTime;

    offers.push({
      account: String(o.Account ?? ""),
      listed,
      fundable: expired ? 0 : fundable,
      price,
      dead: expired || fundable <= 0,
      expired,
    });
  }

  offers.sort((a, b) => (invert ? b.price - a.price : a.price - b.price));

  const listedDepth = offers.reduce((sum, o) => sum + o.listed, 0);
  const fundableDepth = offers.reduce((sum, o) => sum + o.fundable, 0);

  return {
    offers,
    listedDepth,
    fundableDepth,
    fundedRatio: listedDepth > 0 ? fundableDepth / listedDepth : 1,
    deadOffers: offers.filter((o) => o.dead).length,
    bestPrice: offers.find((o) => !o.dead)?.price,
  };
}

export async function readBook(
  currency: string,
  issuer: string,
  limit = 100
): Promise<BookReport> {
  const issued = { currency, issuer };
  const [bidRes, askRes, led] = await Promise.all([
    // Bids: someone paying XRP to receive the issued asset.
    rpc("book_offers", {
      taker_gets: { currency: "XRP" },
      taker_pays: issued,
      ledger_index: "validated",
      limit,
    }),
    // Asks: someone paying the issued asset to receive XRP.
    rpc("book_offers", {
      taker_gets: issued,
      taker_pays: { currency: "XRP" },
      ledger_index: "validated",
      limit,
    }),
    rpc("ledger", { ledger_index: "validated" }),
  ]);

  const closeTime = Number(led.ledger?.close_time ?? 0);
  const bids = buildSide((bidRes.offers ?? []) as Array<Record<string, any>>, closeTime, true);
  const asks = buildSide((askRes.offers ?? []) as Array<Record<string, any>>, closeTime, false);

  // Maker concentration across the whole book, by listed size.
  const byAccount = new Map<string, number>();
  for (const o of [...bids.offers, ...asks.offers]) {
    byAccount.set(o.account, (byAccount.get(o.account) ?? 0) + o.listed);
  }
  const totalListed = bids.listedDepth + asks.listedDepth;
  const ranked = [...byAccount.entries()].sort((a, b) => b[1] - a[1]);

  return {
    pair: `${currency}/XRP`,
    currency,
    issuer,
    bids,
    asks,
    makers: byAccount.size,
    topMakerShare: totalListed > 0 && ranked[0] ? ranked[0][1] / totalListed : 0,
    topMaker: ranked[0]?.[0],
    ledgerIndex: Number(led.ledger_index ?? led.ledger?.ledger_index ?? 0),
    ledgerCloseTime: new Date((closeTime + RIPPLE_EPOCH_OFFSET) * 1000),
    readAt: new Date().toISOString(),
  };
}

export type BookFinding = {
  id: string;
  severity: "critical" | "warn" | "info" | "ok";
  title: string;
  detail: string;
  action?: string;
};

export function bookFindings(report: BookReport): BookFinding[] {
  const out: BookFinding[] = [];
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const qty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  for (const [name, side] of [
    ["Asks", report.asks],
    ["Bids", report.bids],
  ] as const) {
    if (side.offers.length === 0) {
      out.push({
        id: `empty-${name}`,
        severity: "warn",
        title: `Nothing resting on the ${name.toLowerCase()} side`,
        detail: `No offers at all. There is no price here to trade against, whatever a chart elsewhere may show.`,
      });
      continue;
    }

    const phantom = 1 - side.fundedRatio;
    if (side.fundedRatio < PHANTOM_FLOOR) {
      out.push({
        id: `phantom-${name}`,
        severity: phantom > 0.9 ? "critical" : "warn",
        title: `${pct(phantom)} of ${name.toLowerCase()} depth cannot fill`,
        detail: `The book advertises ${qty(side.listedDepth)} but only ${qty(side.fundableDepth)} is backed by an owner who still holds it. ${side.deadOffers} of ${side.offers.length} offers can deliver nothing at all. An offer rests whether or not its owner kept the funds, and nothing removes it until someone tries to cross it.`,
        action:
          "Size against the fundable figure. The advertised depth is what you would be quoted and not what you would receive.",
      });
    } else {
      out.push({
        id: `funded-${name}`,
        severity: "ok",
        title: `${name} are ${pct(side.fundedRatio)} funded`,
        detail: `${qty(side.fundableDepth)} of ${qty(side.listedDepth)} advertised is backed by owners who still hold it.`,
      });
    }
  }

  if (report.topMakerShare >= DOMINANT_SHARE && report.topMaker) {
    out.push({
      id: "maker-concentration",
      severity: report.topMakerShare >= 0.5 ? "warn" : "info",
      title: `One account rests ${pct(report.topMakerShare)} of the quoted depth`,
      detail: `${report.topMaker} accounts for that share of everything listed across both sides, among ${report.makers} makers in total. A book carried by one participant moves when they change their mind, not when the market does.`,
      action: "Check whether that account's offers are the ones that are funded.",
    });
  }

  const expired = [...report.bids.offers, ...report.asks.offers].filter((o) => o.expired);
  if (expired.length > 0) {
    out.push({
      id: "expired",
      severity: "info",
      title: `${expired.length} offer${expired.length === 1 ? "" : "s"} already past expiry`,
      detail:
        "These carry an expiration the current ledger has passed. They still occupy the book because nothing has tried to cross them, and they are excluded from the fundable figures above.",
    });
  }

  const bid = report.bids.bestPrice;
  const ask = report.asks.bestPrice;
  if (bid !== undefined && ask !== undefined) {
    if (bid >= ask) {
      out.push({
        id: "crossed",
        severity: "warn",
        title: "The fundable touch is crossed",
        detail: `Best fundable bid ${bid.toFixed(6)} is at or above best fundable ask ${ask.toFixed(6)}. On a live book this resolves in moments, so it usually means the read caught a moment mid-cross rather than a standing arbitrage.`,
      });
    } else {
      const spread = ask - bid;
      out.push({
        id: "spread",
        severity: "info",
        title: `Fundable spread ${((spread / ask) * 100).toFixed(2)}%`,
        detail: `Between ${bid.toFixed(6)} and ${ask.toFixed(6)}, measured on offers that can actually fill. A spread taken from the advertised touch would be narrower and would not be tradeable.`,
      });
    }
  }

  const rank = { critical: 0, warn: 1, info: 2, ok: 3 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
