/*
 * The period-end treasury report: what a company's XRP wallets held at one
 * validated ledger, who could move them, and how much of the order-book
 * depth a mark would lean on could actually have been filled.
 *
 * Written for the auditor's two questions about an XRP treasury. "Who can
 * move it" is answered from each wallet's AccountRoot and signer list, the
 * same fields the authority certificate reads. "What does the mark rest on"
 * is answered from the books of the dollar assets XRP trades against on the
 * ledger, quoted against funded, with the same band and disclosures as
 * /api/book. AMM pool reserves are reported beside the books, never summed
 * into them, so the 10% band never has to describe a curve.
 *
 * Pure functions only. api/_lib/routes/treasury.js does the reading, and
 * tests/treasury.test.js holds these to recorded mainnet replies.
 */

import { signerListOf, minimumSignersForQuorum, regularKeyCanSign, decodeCurrency } from "./authority.js";
import { BAND } from "./book.js";

/*
 * Bumped whenever a figure inside the digest is computed differently, so a
 * report re-run under new rules can never share a digest with the old one.
 */
export const TREASURY_RULES_VERSION = 1;

/** At most this many wallets per report: one request has to stay inside the function's time. */
export const MAX_WALLETS = 10;

/**
 * The dollar books an XRP mark is usually taken against on the ledger.
 * Fixed and published, not chosen per request, so two companies' reports
 * are measured against the same markets.
 */
export const REFERENCE_BOOKS = [
  { label: "USD (Bitstamp)", currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B" },
  { label: "USD (GateHub)", currency: "USD", issuer: "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq" },
  { label: "RLUSD (Ripple)", currency: "524C555344000000000000000000000000000000", issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De" },
];

const LSF_DISABLE_MASTER = 0x00100000;

/** Seconds between the Unix epoch and the ledger's (2000-01-01T00:00:00Z). */
export const RIPPLE_EPOCH = 946684800;

export const rippleTimeToIso = (seconds) => new Date((Number(seconds) + RIPPLE_EPOCH) * 1000).toISOString();

/** Drops as an exact XRP decimal string. Balances are never rounded through a float. */
export function dropsToXrp(drops) {
  const s = String(drops ?? "");
  if (!/^\d+$/.test(s)) return null;
  const padded = s.padStart(7, "0");
  const whole = padded.slice(0, -6).replace(/^0+(?=\d)/, "");
  const frac = padded.slice(-6).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/**
 * The reserve rules in force at a ledger, from its FeeSettings entry.
 * Before the XRPFees amendment the fields were ReserveBase/ReserveIncrement
 * (numbers, drops); after it, ReserveBaseDrops/ReserveIncrementDrops
 * (strings, drops). Either is read; neither is "could not read", never zero.
 */
export function reservesOf(feeSettings) {
  const node = feeSettings?.node ?? feeSettings ?? {};
  const base = node.ReserveBaseDrops ?? node.ReserveBase;
  const increment = node.ReserveIncrementDrops ?? node.ReserveIncrement;
  if (base === undefined || increment === undefined) return null;
  return { baseDrops: String(base), incrementDrops: String(increment) };
}

/**
 * Who can move one wallet, from an account_info reply requested with
 * signer_lists: true. Every route to a signature is listed. The headline is
 * the weakest of them, because that is the one an auditor has to rely on.
 */
export function controlOf(info) {
  const data = info?.account_data;
  if (!data) return { readable: false, routes: [], summary: "Could not be read at this ledger." };

  const masterEnabled = (Number(data.Flags ?? 0) & LSF_DISABLE_MASTER) === 0;
  const regularKey = regularKeyCanSign(data.RegularKey) ? data.RegularKey : null;
  const { list, unreadable } = signerListOf(info);

  const routes = [];
  if (masterEnabled) routes.push({ kind: "master_key", keys_needed: 1, detail: "The account's own master key can sign alone." });
  if (regularKey) routes.push({ kind: "regular_key", keys_needed: 1, key: regularKey, detail: "A regular key can sign alone." });

  let signerList = null;
  if (list) {
    const signers = (list.SignerEntries ?? []).map((e) => ({
      account: e.SignerEntry?.Account,
      weight: Number(e.SignerEntry?.SignerWeight ?? 0),
    }));
    const quorum = Number(list.SignerQuorum ?? 0);
    const totalWeight = signers.reduce((t, s) => t + s.weight, 0);
    const minimum = minimumSignersForQuorum(signers, quorum);
    signerList = {
      quorum,
      total_weight: totalWeight,
      signers,
      // Signer weights, summed heaviest first. A "3 of 5" read from a
      // headcount is wrong whenever weights differ.
      minimum_signers: Number.isFinite(minimum) ? minimum : null,
    };
    if (Number.isFinite(minimum)) {
      routes.push({
        kind: "signer_list",
        keys_needed: minimum,
        detail: `${minimum} of ${signers.length} listed signers reach the quorum of ${quorum} (total weight ${totalWeight}).`,
      });
    }
  }

  const weakest = routes.reduce((min, r) => (min === null || r.keys_needed < min ? r.keys_needed : min), null);
  let summary;
  if (unreadable && routes.length === 0) summary = "The signer list could not be read, so control is not established.";
  else if (weakest === null) summary = "No key can sign: the account is blackholed.";
  else if (weakest === 1) summary = "One key can move the whole balance.";
  else summary = `At least ${weakest} keys are needed to move the balance.`;

  return {
    readable: !unreadable,
    master_key_enabled: masterEnabled,
    regular_key: regularKey,
    signer_list: signerList,
    signer_list_unreadable: unreadable ?? undefined,
    keys_needed: weakest,
    routes,
    summary,
  };
}

/** One wallet's line in the report. */
export function walletOf(address, info, reserves) {
  const data = info?.account_data;
  if (!data) {
    return { address, found: false, balance_xrp: null, reserve_xrp: null, available_xrp: null, control: controlOf(info) };
  }
  const balanceDrops = BigInt(String(data.Balance ?? "0"));
  let reserveDrops = null;
  if (reserves) {
    reserveDrops = BigInt(reserves.baseDrops) + BigInt(reserves.incrementDrops) * BigInt(Number(data.OwnerCount ?? 0));
  }
  const available = reserveDrops === null ? null : balanceDrops > reserveDrops ? balanceDrops - reserveDrops : 0n;
  return {
    address,
    found: true,
    balance_xrp: dropsToXrp(balanceDrops.toString()),
    owner_count: Number(data.OwnerCount ?? 0),
    reserve_xrp: reserveDrops === null ? null : dropsToXrp(reserveDrops.toString()),
    available_xrp: available === null ? null : dropsToXrp(available.toString()),
    control: controlOf(info),
  };
}

/** Sum of exact XRP decimal strings, exact. */
export function sumXrp(values) {
  let drops = 0n;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const [whole, frac = ""] = String(v).split(".");
    drops += BigInt(whole) * 1_000_000n + BigInt((frac + "000000").slice(0, 6));
  }
  return dropsToXrp(drops.toString());
}

/**
 * Selling XRP into one book. The asks of an XRP/asset book are offers that
 * give the asset for XRP, priced in XRP per unit and ordered cheapest
 * first, so a seller of XRP takes them in order. Only funded quantity
 * counts and only within the band above the reference mid, the same rule
 * simulateExit in src/lib/desk/liquidity.ts applies to the other side.
 */
export function sellXrpInto(book, xrp) {
  const ceiling = book.mid !== undefined ? book.mid * (1 + BAND) : Infinity;
  const asks = book.asks.filter((l) => l.price <= ceiling && l.price > 0 && Number.isFinite(l.price));

  // What the band holds in XRP terms: each funded unit absorbs `price` XRP.
  const capacityXrp = asks.reduce((t, l) => t + l.quantity * l.price, 0);
  const listedCapacityXrp = asks.reduce((t, l) => t + l.listedQuantity * l.price, 0);

  // Summed from what each level took, not as the request minus what was
  // left: for a holding far larger than the book, that subtraction loses
  // the book's whole size to rounding.
  let remaining = Math.max(0, Number(xrp) || 0);
  let received = 0;
  let sold = 0;
  for (const level of asks) {
    if (remaining <= 0) break;
    const levelXrp = level.quantity * level.price;
    const take = Math.min(remaining, levelXrp);
    received += take / level.price;
    sold += take;
    remaining -= take;
  }
  return {
    capacity_xrp: capacityXrp,
    listed_capacity_xrp: listedCapacityXrp,
    funded_share: listedCapacityXrp > 0 ? capacityXrp / listedCapacityXrp : null,
    xrp_sold: sold,
    asset_received: received,
    // Average price paid by the book, in asset per XRP: the number a mark
    // would be compared against.
    average_price: sold > 0 ? received / sold : null,
    mid_price: book.mid ? 1 / book.mid : null,
    share_of_holding_sellable: Number(xrp) > 0 ? sold / Number(xrp) : null,
  };
}

/** An amm_info reply as the report states it, or null when there is no pool. */
export function ammOf(reply) {
  const amm = reply?.amm;
  if (!amm) return null;
  const xrpSide = typeof amm.amount === "string" ? amm.amount : typeof amm.amount2 === "string" ? amm.amount2 : null;
  const other = typeof amm.amount === "string" ? amm.amount2 : amm.amount;
  return {
    account: amm.account,
    xrp: xrpSide === null ? null : dropsToXrp(xrpSide),
    asset: other && typeof other === "object" ? { currency: decodeCurrency(other.currency), value: String(other.value) } : null,
    trading_fee_bps: amm.trading_fee !== undefined ? Number(amm.trading_fee) / 10 : null,
    asset_frozen: Boolean(amm.asset2_frozen || amm.asset_frozen),
  };
}

/**
 * The validated ledger that closed last at or before `target` (a Date).
 *
 * `closeTimeOf(index)` returns that ledger's close time in Unix seconds.
 * Ledgers close about every four seconds, so the first guess lands close
 * and the bracket is widened only until it straddles the target; then a
 * bisection finishes it. Twenty or so reads for any date in the ledger's
 * history, all against public full-history servers.
 */
export async function ledgerAtOrBefore(target, latest, closeTimeOf) {
  const t = Math.floor(target.getTime() / 1000);
  const latestTime = await closeTimeOf(latest);
  if (t >= latestTime) return latest;

  const guess = Math.max(1, Math.min(latest, Math.round(latest - (latestTime - t) / 3.9)));
  let lo = guess;
  let hi = guess;
  let step = 2000;
  // Widen until lo closed at or before t and hi closed after it.
  while (lo > 1 && (await closeTimeOf(lo)) > t) {
    hi = lo;
    lo = Math.max(1, lo - step);
    step *= 2;
  }
  if (lo === hi) {
    step = 2000;
    while (hi < latest && (await closeTimeOf(hi)) <= t) {
      lo = hi;
      hi = Math.min(latest, hi + step);
      step *= 2;
    }
    if ((await closeTimeOf(hi)) <= t) return hi;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await closeTimeOf(mid)) <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The digest a reader can recompute from the report body: SHA-256 over a
 * canonical JSON of every figure that matters, in a fixed order. Floats are
 * fixed to six places first so two runtimes cannot disagree in the
 * seventeenth digit.
 */
export async function treasuryDigest(report) {
  const f = (n) => (n === null || n === undefined || !Number.isFinite(n) ? null : Number(n).toFixed(6));
  const canonical = JSON.stringify({
    kind: "treasury",
    rules: TREASURY_RULES_VERSION,
    ledger: [report.ledger.index, report.ledger.hash, report.ledger.close_time],
    wallets: report.wallets.map((w) => [w.address, w.balance_xrp, w.reserve_xrp, w.control.keys_needed]),
    total: report.totals.balance_xrp,
    books: report.books.map((b) => [
      b.currency,
      b.issuer,
      f(b.mid_price),
      f(b.sell.capacity_xrp),
      f(b.sell.listed_capacity_xrp),
      f(b.sell.xrp_sold),
      f(b.sell.asset_received),
    ]),
  });
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export const TREASURY_DISCLOSURES = [
  "Every figure is read from validated XRP Ledger mainnet at the ledger index stated, and can be re-read at that index by anyone.",
  "Book depth counts offers within 10% of each book's reference mid (a chosen parameter) and only what each offer's owner held at that ledger (taker_gets_funded).",
  "At most 100 offers per side are read; deeper offers are not counted.",
  "AMM pool reserves are shown separately and are not added to book depth.",
  "The sell simulation takes each book on its own, as if the whole holding were sold into it alone, and ignores fees and other sellers.",
  "Reserve is the base reserve plus one increment per owned object, under the reserve rules in force at that ledger.",
  "This is a record of ledger facts. It is not a valuation, an audit opinion or a statement about fair value under any accounting standard.",
];
