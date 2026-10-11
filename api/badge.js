/*
 * GET /api/badge?issuer=r…[&style=flat|card][&theme=light|dark]
 *
 * The issuer authority badge: an SVG an issuer, a listing site or anyone
 * else can put on a page, showing the authority the issuer has kept, read
 * live from validated ledger state. See api/_lib/badge.js for what it
 * shows and why it shows no verdict.
 *
 * Free and unauthenticated, like /api/authority, and bounded the same
 * way: one issuer per request, flags only (no holder walk), five minutes
 * at the edge. An image proxy that fetches a badge on every page view
 * costs one ledger read per issuer per five minutes, not one per view.
 *
 * An image must never break the page it is on, so every failure is
 * still a 200 with an SVG — a grey "unreadable" badge, cached for a
 * minute so a node outage is not pinned to the README for an hour.
 * A malformed address is the one 400, because it is the caller's
 * mistake and caching it would serve the mistake to everyone.
 */

import { readAuthoritySurface, certificateFrom, ADDRESS_RE } from "./_lib/authority.js";
import { flatBadge, cardBadge } from "./_lib/badge.js";

function send(res, svg, sMaxAge, swr) {
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`);
  // Embedded on other origins by design.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Opened directly, the SVG is a document on our origin. It carries no
  // script, and this makes sure none could run if one were ever injected.
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  return res.status(200).send(svg);
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const issuer = String(req.query?.issuer ?? "").trim();
  if (!ADDRESS_RE.test(issuer)) {
    return res.status(400).json({ error: "Pass ?issuer= an XRPL classic address. They begin with r." });
  }
  const style = req.query?.style === "card" ? "card" : "flat";
  const theme = req.query?.theme === "dark" ? "dark" : "light";
  const render = style === "card" ? cardBadge : flatBadge;

  try {
    const surface = await readAuthoritySurface(issuer, { walkSupply: false });
    const certificate = await certificateFrom(surface);
    const failed = surface.unreadable.length > 0;
    return send(res, render({ certificate, issuer, theme }), failed ? 60 : 300, failed ? 120 : 3600);
  } catch {
    return send(res, render({ certificate: null, issuer, theme }), 60, 120);
  }
}
