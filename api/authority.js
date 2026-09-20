/*
 * GET /api/authority?issuer=r…&walk=1 — the free authority certificate.
 *
 * Deliberately unauthenticated and deliberately free. The paid product
 * is the console and the Compliance API; this endpoint exists so that
 * somebody with no account — a policy staffer, a journalist, a holder
 * checking their own position — can establish what authority an issuer
 * has kept without taking anyone's word for it, including ours.
 *
 * What keeps it from being a free tier of the paid thing: it answers
 * one issuer per request, caches at the edge, and does nothing with the
 * result. No key, no history, no export, no monitoring, no alert when a
 * flag changes. Those are the product.
 *
 * Abuse control is the edge cache and a short holder walk, not a key.
 * A cached answer costs no ledger read at all, and the walk is capped
 * so an issuer with a million trust lines cannot be used to hold a
 * function open.
 */

import { readAuthoritySurface, certificateFrom, ADDRESS_RE } from "./_lib/authority.js";
import { cacheHeaders } from "./_lib/html.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const issuer = String(req.query?.issuer ?? "").trim();
  if (!issuer) {
    return res.status(400).json({
      error: "Pass ?issuer= an XRPL classic address.",
    });
  }
  // Shape only. A checksum-valid address that does not exist is the
  // ledger's answer to give, not this handler's to guess — it comes
  // back as an unreadable certificate, which is the honest result.
  if (!ADDRESS_RE.test(issuer)) {
    return res.status(400).json({
      error: "That is not an XRPL classic address. They begin with r.",
    });
  }

  // Off by default. The walk is several round trips and most callers
  // want the flags; asking for it is a decision to wait.
  const walkSupply = req.query?.walk === "1" || req.query?.walk === "true";

  try {
    const surface = await readAuthoritySurface(issuer, { walkSupply });
    const certificate = await certificateFrom(surface);

    // A certificate is a claim about one ledger, so a cached copy is
    // only as good as the ledger it names — which the body states. Five
    // minutes at the edge, an hour of stale-while-revalidate.
    cacheHeaders(res, 300, 3600);
    return res.status(200).json({
      ...certificate,
      // Outside the digest deliberately: this describes how the reading
      // was taken, not what was read, and it changes between two runs
      // that produce the identical certificate. It is here because a
      // coverage figure on its own does not say whether the walk ended
      // early or simply ran out of holders to count.
      walk: surface.issuance
        ? {
            pages: surface.issuance.pages,
            lines_walked: surface.issuance.linesWalked,
            truncated: surface.issuance.truncated,
            stopped_because: surface.issuance.stoppedBecause,
            elapsed_ms: surface.issuance.elapsedMs,
          }
        : null,
      disclaimer:
        "Ledger facts about authority retained by this issuer at the stated ledger index. " +
        "Not a score, and not a determination that any asset is or is not decentralised, " +
        "a security, or compliant with any statute.",
    });
  } catch (error) {
    // Reaching here means the read itself threw rather than resolving
    // into an unreadable certificate — a node outage, not a bad issuer.
    return res.status(502).json({
      error: "Could not reach a public XRPL node. Try again shortly.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
