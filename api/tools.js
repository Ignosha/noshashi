/*
 * One function for the free public reads:
 *
 *   /api/badge         -> api/_lib/routes/badge.js
 *   /api/book          -> api/_lib/routes/book.js
 *   /api/delivered     -> api/_lib/routes/delivered.js
 *   /api/issuer-state  -> api/_lib/routes/issuer-state.js
 *   /api/treasury      -> api/_lib/routes/treasury.js
 *   /api/book-health   -> api/_lib/routes/book-health.js
 *
 * They share one function, not six, because the Hobby plan deploys at most
 * twelve and the site already used eleven (a deployment over the limit
 * fails outright). The public URLs are unchanged: vercel.json rewrites each
 * to /api/tools?tool=<name>, keeping the caller's own query string.
 * tests/function-count.test.js keeps the total at or under twelve.
 */

import badge from "./_lib/routes/badge.js";
import book from "./_lib/routes/book.js";
import delivered from "./_lib/routes/delivered.js";
import issuerState from "./_lib/routes/issuer-state.js";
import treasury from "./_lib/routes/treasury.js";
import bookHealth from "./_lib/routes/book-health.js";

const ROUTES = { badge, book, delivered, "issuer-state": issuerState, treasury, "book-health": bookHealth };

export default function handler(req, res) {
  const route = ROUTES[String(req.query?.tool ?? "")];
  if (!route) return res.status(404).json({ error: "Not found", routes: Object.keys(ROUTES).map((r) => `/api/${r}`) });
  return route(req, res);
}
