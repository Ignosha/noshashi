/*
 * GET /api/xrp-news — the newsroom as JSON.
 *
 * Exists so the server-rendered pages can refresh themselves in the
 * browser without a reload, and so the feed is inspectable. The CDN
 * holds the response for five minutes and serves a stale copy while it
 * refreshes, which is why three upstream RSS fetches do not become
 * three upstream RSS fetches per visitor.
 */
import { getNews } from "./_lib/news.js";
import { cacheHeaders } from "./_lib/html.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const limit = Math.min(30, Math.max(1, Number(req.query?.limit) || 12));
  const news = await getNews({ limit });

  cacheHeaders(res, 300, 3600);
  // No source answered: say so with a 503 so a monitor can see it,
  // while still returning the shape a client expects.
  return res.status(news.live ? 200 : 503).json(news);
}
