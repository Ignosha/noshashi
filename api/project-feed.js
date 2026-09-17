/*
 * GET /api/project-feed — the mission log as JSON.
 *
 * Repository notices merged with the GitHub releases feed, plus the
 * derived status board. Cached for two minutes: a maintenance notice
 * should reach the page quickly, and releases are infrequent enough
 * that nothing is gained by going lower.
 */
import { getProjectFeed, deriveStatus } from "./_lib/project-feed.js";
import { cacheHeaders } from "./_lib/html.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const limit = Math.min(50, Math.max(1, Number(req.query?.limit) || 12));
  const origin = process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`;
  const feed = await getProjectFeed({ limit, origin });

  cacheHeaders(res, 120, 900);
  return res.status(200).json({ ...feed, status: deriveStatus(feed.entries) });
}
