/*
 * GET /api/issuer-state?issuer=r…
 *
 * An issuer's AccountRoot and signer list, exactly as the ledger returned
 * them at the latest validated ledger. No interpretation: the certificate
 * (/api/authority), the badge (/api/badge) and the issuer alerts all read
 * these same fields and draw conclusions; this is the source they read,
 * published so anyone can check a conclusion against it without running a
 * node or knowing the JSON-RPC.
 *
 * Free, unauthenticated, one account per request, a minute at the edge.
 */

import { rippleRpc, ADDRESS_RE } from "./_lib/authority.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const issuer = String(req.query?.issuer ?? "").trim();
  if (!ADDRESS_RE.test(issuer)) {
    return res.status(400).json({ error: "Pass ?issuer= an XRPL classic address. They begin with r." });
  }
  try {
    const result = await rippleRpc("account_info", {
      account: issuer,
      ledger_index: "validated",
      signer_lists: true,
    });
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      issuer,
      read_at: new Date().toISOString(),
      method: "account_info (ledger_index: validated, signer_lists: true)",
      result,
    });
  } catch (error) {
    const code = error?.code;
    if (code === "actNotFound") return res.status(404).json({ error: "No account with that address exists on the ledger." });
    return res.status(502).json({
      error: "Could not reach a public XRPL node. Try again shortly.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
