/*
 * GET /api/issuer-history?issuer=r…
 *
 * What an issuer has done with its authority: every freeze, unfreeze,
 * clawback, key change, signer-list change and change of its own flags,
 * read from validated ledgers. See api/_lib/issuer-history.js for what
 * counts and how coverage is reported.
 *
 * Free and unauthenticated, one issuer per request, fifteen minutes at
 * the edge: authority changes are rare, and the reading is several
 * account_tx pages. The Listing review and History reports embed the
 * same reading.
 */

import { readIssuerHistory } from "../issuer-history.js";
import { ADDRESS_RE } from "../authority.js";
import { queryOf } from "../query.js";

export default async function handler(req, res, deps = {}) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const issuer = String(queryOf(req).issuer ?? "").trim();
  if (!ADDRESS_RE.test(issuer)) {
    return res.status(400).json({ error: "Pass ?issuer= an XRPL classic address. They begin with r." });
  }
  try {
    const history = await readIssuerHistory(issuer, deps.rpc ? { rpc: deps.rpc } : {});
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=900, stale-while-revalidate=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json(history);
  } catch (error) {
    const code = error?.code;
    if (code === "actNotFound") return res.status(404).json({ error: "No account exists at that address on the XRP Ledger." });
    return res.status(502).json({
      error: "Could not read the XRP Ledger. Try again shortly.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
