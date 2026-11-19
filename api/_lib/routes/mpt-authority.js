/*
 * GET /api/mpt-authority?issuer=r…   every MPT issuance an account holds
 * GET /api/mpt-authority?id=<48 hex>  one MPT issuance
 * GET /api/mpt-authority?list=1        a page of every MPT issuance on the ledger
 *
 * What the issuer of a Multi-Purpose Token can still do to holders:
 * claw back, lock, require approval, restrict transfers, and who holds
 * the issuer's keys. See api/_lib/mpt-authority.js.
 *
 * Free and unauthenticated, five minutes at the edge.
 */

import { readMptAuthority, listMptIssuances, MPT_ID_RE } from "../mpt-authority.js";
import { ADDRESS_RE } from "../authority.js";
import { queryOf } from "../query.js";

export default async function handler(req, res, deps = {}) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const q = queryOf(req);
  const issuer = String(q.issuer ?? "").trim();
  const id = String(q.id ?? "").trim();
  if (String(q.list ?? "") === "1") {
    const marker = String(q.marker ?? "").trim();
    if (marker && !/^[0-9A-Fa-f]{64}$/.test(marker)) return res.status(400).json({ error: "marker must be the 64-hex value a previous page returned." });
    try {
      const page = await listMptIssuances({ marker: marker || undefined, limit: Number(q.limit ?? 50) || 50 }, deps.rpc ? { rpc: deps.rpc } : {});
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=1800");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(200).json(page);
    } catch (error) {
      return res.status(502).json({ error: "Could not read the XRP Ledger. Try again shortly.", detail: error instanceof Error ? error.message : String(error) });
    }
  }
  if (!(id ? MPT_ID_RE.test(id) : ADDRESS_RE.test(issuer))) {
    return res.status(400).json({ error: "Pass ?issuer= an XRPL classic address, or ?id= a 48-character MPT issuance ID." });
  }
  try {
    const reply = await readMptAuthority(id ? { id } : { issuer }, deps.rpc ? { rpc: deps.rpc } : {});
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=900");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json(reply);
  } catch (error) {
    const code = error?.code;
    if (code === "actNotFound") return res.status(404).json({ error: "No account exists at that address on the XRP Ledger." });
    if (code === "entryNotFound") return res.status(404).json({ error: "No MPT issuance has that ID on the XRP Ledger." });
    return res.status(502).json({
      error: "Could not read the XRP Ledger. Try again shortly.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
