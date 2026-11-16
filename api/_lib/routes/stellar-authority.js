/*
 * GET /api/stellar/authority?issuer=G…[&asset=CODE]
 *
 * The free authority certificate for a Stellar issuer: whether it can
 * freeze holders, claw balances back, decide who may hold, and whether
 * one key controls it. Same verdict and digest scheme as the XRPL
 * certificate at /api/authority, read from Horizon instead of rippled.
 *
 * Free, unauthenticated, one issuer per request, five minutes at the edge.
 */

import {
  isStellarAccountId,
  ASSET_CODE_RE,
  readStellarSurface,
  stellarCertificateFrom,
} from "../stellar.js";
import { cacheHeaders } from "../html.js";
import { queryOf } from "../query.js";

export default async function handler(req, res, deps = {}) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const q = queryOf(req);
  const issuer = String(q.issuer ?? "").trim();
  if (!issuer) return res.status(400).json({ error: "Pass ?issuer= a Stellar account ID. They begin with G." });
  if (!isStellarAccountId(issuer)) {
    return res.status(400).json({
      error: "That is not a valid Stellar account ID. They are 56 characters, begin with G, and carry a checksum.",
    });
  }
  const asset = q.asset ? String(q.asset).trim() : undefined;
  if (asset && !ASSET_CODE_RE.test(asset)) {
    return res.status(400).json({ error: "?asset= takes a Stellar asset code: 1 to 12 letters or digits." });
  }

  try {
    const surface = await readStellarSurface(issuer, { fetchImpl: deps.fetchImpl ?? fetch });
    const certificate = await stellarCertificateFrom(surface, { asset });
    if (asset && !certificate.asset) {
      return res.status(404).json({ error: `This issuer does not issue an asset with the code ${asset}.` });
    }
    if (surface.unreadable.length === 0 && surface.account && !surface.account.notFound && surface.ledgerIndex > 0) {
      cacheHeaders(res, 300, 3600);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json(certificate);
  } catch (error) {
    return res.status(502).json({
      error: "Could not read the Stellar network. Try again shortly.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
