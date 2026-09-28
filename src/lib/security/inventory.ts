import type { Holdings, HoldingsReader } from "./objects";
import { dropsToXrp, lineSide, liveHoldingsReader } from "./objects";
import { decodeCurrency } from "../../../supabase/functions/_shared/xrplEvents.ts";

/**
 * Forgotten-asset inventory — everything an account holds besides its
 * XRP, and what it would fetch.
 *
 * Tokens on trust lines, AMM liquidity-pool shares (LP tokens), NFTs, and
 * value parked in open DEX orders are easy to lose track of: a wallet app
 * may not show them, and an airdrop may be worth more (or much less) than
 * it looks. Each holding is priced in XRP at the best bid on the DEX order
 * book and the AMM spot price, whichever is higher, read live; an LP token
 * is priced by its share of the pool. A top-of-book price is an
 * indication, not a quote: selling a large balance moves the price.
 */

type Json = Record<string, any>;

export type InventoryItem = {
  id: string;
  kind: "token" | "lp_token" | "nft" | "open_order";
  label: string;
  amount: number;
  currency: string;
  issuer: string | null;
  /** XRP value at the best bid (or pool share); null when nothing bids or it was not priced. */
  valueXrp: number | null;
  /** Where the price came from. */
  priceSource: "order_book" | "amm" | "pool_share" | "xrp" | null;
  note?: string;
};

export type Inventory = {
  address: string;
  exists: boolean;
  ledgerIndex: number;
  xrpBalance: number;
  items: InventoryItem[];
  /** Sum of priced items, in XRP. */
  valuedXrp: number;
  /** True when prices were read. */
  priced: boolean;
  complete: boolean;
};

const isLpCurrency = (code: string) => /^03[0-9A-F]{38}$/i.test(code);

/** The holdings as a list, unpriced. Pure. */
export function inventoryFrom(h: Holdings): Inventory {
  const me = h.address;
  const items: InventoryItem[] = [];
  if (!h.root) return { address: me, exists: false, ledgerIndex: h.ledgerIndex, xrpBalance: 0, items, valuedXrp: 0, priced: false, complete: true };
  for (const o of h.objects) {
    if (o.LedgerEntryType === "RippleState") {
      const side = lineSide(o, me);
      if (side.balance <= 0) continue;
      const lp = isLpCurrency(side.currency);
      items.push({
        id: `line-${o.index}`,
        kind: lp ? "lp_token" : "token",
        label: lp ? `AMM pool share (${side.counterparty.slice(0, 8)}…)` : decodeCurrency(side.currency),
        amount: side.balance,
        currency: side.currency,
        issuer: side.counterparty,
        valueXrp: null,
        priceSource: null,
        ...(Number(o.Flags ?? 0) & 0x00400000 || Number(o.Flags ?? 0) & 0x00800000 ? { note: "A freeze is set on this trust line: a frozen balance cannot be sold until it is lifted." } : {}),
      });
    } else if (o.LedgerEntryType === "Offer" && o.Account === me) {
      const gets = o.TakerGets;
      const xrp = dropsToXrp(gets);
      items.push({
        id: `offer-${o.index}`,
        kind: "open_order",
        label: `Open order selling ${xrp !== null ? `${xrp} XRP` : `${gets?.value} ${decodeCurrency(String(gets?.currency))}`}`,
        amount: xrp ?? Number(gets?.value ?? 0),
        currency: xrp !== null ? "XRP" : String(gets?.currency),
        issuer: xrp !== null ? null : String(gets?.issuer),
        valueXrp: xrp,
        priceSource: xrp !== null ? "xrp" : null,
        note: "Committed to the order until it fills or you cancel it (the balance is still yours meanwhile).",
      });
    }
  }
  for (const n of h.nfts) {
    items.push({
      id: `nft-${n.NFTokenID}`,
      kind: "nft",
      label: `NFT ${String(n.NFTokenID).slice(0, 12)}… (issuer ${n.Issuer}, taxon ${n.NFTokenTaxon})`,
      amount: 1,
      currency: String(n.NFTokenID),
      issuer: String(n.Issuer),
      valueXrp: null,
      priceSource: null,
    });
  }
  return { address: me, exists: true, ledgerIndex: h.ledgerIndex, xrpBalance: Number(h.root.Balance ?? 0) / 1_000_000, items, valuedXrp: 0, priced: false, complete: h.complete };
}

/** Price every item in XRP from the live DEX, AMM pools and NFT buy offers. */
export async function priceInventory(inv: Inventory, reader: HoldingsReader = liveHoldingsReader, maxItems = 60): Promise<Inventory> {
  const items: InventoryItem[] = [];
  let n = 0;
  for (const item of inv.items) {
    if (item.valueXrp !== null || n >= maxItems) {
      items.push(item);
      continue;
    }
    n += 1;
    try {
      if (item.kind === "lp_token" && item.issuer) {
        const amm = (await reader.request("amm_info", { amm_account: item.issuer, ledger_index: "validated" })).amm as Json | undefined;
        const total = Number(amm?.lp_token?.value ?? 0);
        const xrpSide = dropsToXrp(amm?.amount) ?? dropsToXrp(amm?.amount2);
        if (amm && total > 0 && xrpSide !== null) {
          // An equal-weighted pool: the XRP side is half the pool's value.
          items.push({ ...item, valueXrp: round((item.amount / total) * xrpSide * 2), priceSource: "pool_share", note: `${((item.amount / total) * 100).toPrecision(3)}% of the pool.` });
          continue;
        }
        items.push({ ...item, note: amm ? "The pool has no XRP side; priced in its two tokens only." : "The pool no longer exists." });
        continue;
      }
      if (item.kind === "token" && item.issuer) {
        const token = { currency: item.currency, issuer: item.issuer };
        const [book, amm] = await Promise.all([
          reader.request("book_offers", { taker_gets: { currency: "XRP" }, taker_pays: token, limit: 5, ledger_index: "validated" }).catch(() => ({ offers: [] })),
          reader.request("amm_info", { asset: { currency: "XRP" }, asset2: token, ledger_index: "validated" }).catch(() => null),
        ]);
        const best = ((book.offers ?? []) as Json[])[0];
        const bid = best ? (dropsToXrp(best.taker_gets_funded ?? best.TakerGets) ?? 0) / Number((best.taker_pays_funded ?? best.TakerPays)?.value ?? Infinity) : 0;
        const pool = amm?.amm as Json | undefined;
        const spot = pool ? (dropsToXrp(pool.amount) ?? 0) / Number(pool.amount2?.value ?? Infinity) : 0;
        const price = Math.max(Number.isFinite(bid) ? bid : 0, Number.isFinite(spot) ? spot : 0);
        items.push(
          price > 0
            ? { ...item, valueXrp: round(item.amount * price), priceSource: price === bid ? "order_book" : "amm", note: [item.note, `${price.toPrecision(4)} XRP each at the ${price === bid ? "best bid" : "AMM spot price"}.`].filter(Boolean).join(" ") }
            : { ...item, valueXrp: 0, priceSource: null, note: [item.note, "Nobody is bidding XRP for it on the DEX or an AMM pool."].filter(Boolean).join(" ") }
        );
        continue;
      }
      if (item.kind === "nft") {
        const buys = await reader.request("nft_buy_offers", { nft_id: item.currency, ledger_index: "validated", limit: 50 }).catch(() => ({ offers: [] }));
        const best = Math.max(0, ...((buys.offers ?? []) as Json[]).map((o) => dropsToXrp(o.amount) ?? 0));
        items.push(best > 0 ? { ...item, valueXrp: best, priceSource: "order_book", note: `Highest standing buy offer: ${best} XRP.` } : { ...item, valueXrp: 0, note: "No XRP buy offers stand for it." });
        continue;
      }
      items.push(item);
    } catch {
      items.push({ ...item, note: [item.note, "Could not be priced just now."].filter(Boolean).join(" ") });
    }
  }
  items.sort((a, b) => (b.valueXrp ?? -1) - (a.valueXrp ?? -1));
  const valuedXrp = round(items.reduce((s, i) => s + (i.kind === "open_order" ? 0 : i.valueXrp ?? 0), 0));
  return { ...inv, items, valuedXrp, priced: true };
}

const round = (x: number) => Math.round(x * 1e6) / 1e6;
