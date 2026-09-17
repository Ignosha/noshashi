/*
 * GET /api/xrp-market — the XRP panel's data as JSON.
 *
 * Lets the rendered panel refresh itself in the browser, and makes the
 * figures inspectable. Cached at the edge for two minutes: the upstream
 * public APIs are rate limited per IP, and this is what keeps that
 * limit spent once per window instead of once per visitor.
 */
import { getMarket } from "./_lib/market.js";
import { cacheHeaders } from "./_lib/html.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const days = Math.min(30, Math.max(1, Number(req.query?.days) || 7));
  const market = await getMarket({ days });

  cacheHeaders(res, 120, 900);
  return res.status(market.live ? 200 : 503).json(market);
}
