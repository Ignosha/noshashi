/*
 * Live XRP market and network state.
 *
 * Three independent reads, merged:
 *
 *   1. CoinGecko — spot price, 24h change, market cap, 24h volume.
 *   2. CoinGecko market chart — seven days of hourly price and volume,
 *      which is what the visualisations are drawn from.
 *   3. An XRPL public node — validated ledger sequence, fee and peer
 *      count, read with the same `server_info` call the desktop app makes.
 *
 * Read on the server, not in the browser. Three reasons, in order: the
 * numbers end up in the HTML where a crawler can see them; the page
 * makes no cross-origin request, so the site's CSP stays closed to
 * everything but our own origin and the XRPL nodes; and a public API's
 * per-IP rate limit is spent once per cache window rather than once per
 * visitor.
 *
 * Same rule as everywhere else on this site: a figure that could not be
 * read is absent, never estimated and never carried over from the last
 * successful read. `sources` says which parts answered.
 */

import { fetchWithTimeout } from "./html.js";

const COINGECKO = "https://api.coingecko.com/api/v3";
const XRPL_NODE = "https://xrplcluster.com";

async function getSpot(timeout) {
  const url =
    `${COINGECKO}/simple/price?ids=ripple&vs_currencies=usd` +
    "&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true&include_last_updated_at=true";
  const response = await fetchWithTimeout(url, {
    timeout,
    headers: { Accept: "application/json", "User-Agent": "noshashi.app market reader" },
  });
  if (!response.ok) throw new Error(`coingecko spot ${response.status}`);
  const payload = await response.json();
  const xrp = payload?.ripple;
  if (!xrp || typeof xrp.usd !== "number") throw new Error("coingecko spot: no price");
  return {
    price: xrp.usd,
    change24h: typeof xrp.usd_24h_change === "number" ? xrp.usd_24h_change : null,
    marketCap: typeof xrp.usd_market_cap === "number" ? xrp.usd_market_cap : null,
    volume24h: typeof xrp.usd_24h_vol === "number" ? xrp.usd_24h_vol : null,
    at: xrp.last_updated_at ? new Date(xrp.last_updated_at * 1000).toISOString() : null,
  };
}

async function getSeries(timeout, days = 7) {
  const url = `${COINGECKO}/coins/ripple/market_chart?vs_currency=usd&days=${days}`;
  const response = await fetchWithTimeout(url, {
    timeout,
    headers: { Accept: "application/json", "User-Agent": "noshashi.app market reader" },
  });
  if (!response.ok) throw new Error(`coingecko chart ${response.status}`);
  const payload = await response.json();

  const clean = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .filter((r) => Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]))
      .map(([t, v]) => ({ t, v }));

  const prices = clean(payload.prices);
  const volumes = clean(payload.total_volumes);
  // Two points cannot describe a week. Below that, draw nothing.
  if (prices.length < 8) throw new Error("coingecko chart: too few points");
  return { prices, volumes, days };
}

async function getLedger(timeout) {
  const response = await fetchWithTimeout(XRPL_NODE, {
    timeout,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "server_info" }),
  });
  if (!response.ok) throw new Error(`xrpl ${response.status}`);
  const info = (await response.json())?.result?.info;
  const validated = info?.validated_ledger;
  if (!validated?.seq) throw new Error("xrpl: no validated ledger");
  return {
    sequence: validated.seq,
    baseFeeXrp: typeof validated.base_fee_xrp === "number" ? validated.base_fee_xrp : null,
    reserveBaseXrp: typeof validated.reserve_base_xrp === "number" ? validated.reserve_base_xrp : null,
    peers: typeof info.peers === "number" ? info.peers : null,
    // Named for what it is: the state of the node that answered, not a
    // property of the network. Different nodes report different loads.
    node: "xrplcluster.com",
  };
}

/** Everything the XRP panel draws. Never throws. */
export async function getMarket({ timeout = 8000, days = 7 } = {}) {
  const [spot, series, ledger] = await Promise.allSettled([
    getSpot(timeout),
    getSeries(timeout, days),
    getLedger(timeout),
  ]);

  const value = (result) => (result.status === "fulfilled" ? result.value : null);

  return {
    spot: value(spot),
    series: value(series),
    ledger: value(ledger),
    live: spot.status === "fulfilled",
    sources: {
      spot: spot.status === "fulfilled",
      series: series.status === "fulfilled",
      ledger: ledger.status === "fulfilled",
    },
    fetchedAt: new Date().toISOString(),
  };
}

/** Compact money, in the units a rail cell has room for. */
export function money(value, { currency = "$" } = {}) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${currency}${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${currency}${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${currency}${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1) return `${currency}${value.toFixed(2)}`;
  // A sub-dollar asset needs four places or the price reads as flat.
  return `${currency}${value.toFixed(4)}`;
}

export function percent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
}

/** Thousands separators, for a ledger sequence read at a glance. */
export function grouped(value) {
  return Number.isFinite(value) ? Number(value).toLocaleString("en-US") : "—";
}
