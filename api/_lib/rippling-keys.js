/*
 * Paid access to the Rippling Exposure API, without a database.
 *
 * Keys are issued by hand after an invoice is paid. Only their SHA-256
 * hashes are stored, in the RIPPLING_API_KEYS environment variable:
 *
 *   RIPPLING_API_KEYS="desk:9f86d0…,institution:2c26b4…"
 *
 * A caller sends `Authorization: Bearer nsh_rip_…`. With no variable set,
 * every paid route answers 402 with how to buy, and the free route keeps
 * working. The per-minute limits are per warm instance (see rate-limit.js);
 * monthly volume is set by the order, not metered here.
 */

import { createHash, timingSafeEqual } from "node:crypto";

/** What each plan unlocks. Prices are what the page and the invoice say. */
export const RIPPLING_PLANS = {
  free: { label: "Free", monthly_usd: 0, per_minute: 12, batch: 0, issuer_holders: 0 },
  starter: { label: "Starter", monthly_usd: 299, per_minute: 60, batch: 25, issuer_holders: 0 },
  desk: { label: "Desk", monthly_usd: 1250, per_minute: 120, batch: 100, issuer_holders: 500 },
  institution: { label: "Institution", monthly_usd: 3500, per_minute: 300, batch: 250, issuer_holders: 2000 },
};

const sha256 = (v) => createHash("sha256").update(v).digest("hex");

/** Parse the variable into [{ plan, hash }]; unknown plans and bad hashes are ignored. */
export function parseKeys(value = "") {
  return String(value)
    .split(",")
    .map((entry) => entry.trim().split(":"))
    .filter(([plan, hash]) => RIPPLING_PLANS[plan] && plan !== "free" && /^[0-9a-f]{64}$/.test(hash ?? ""))
    .map(([plan, hash]) => ({ plan, hash }));
}

/** The caller's plan: "free" without a key; null for a key that is not valid. */
export function planFor(req, env = process.env) {
  const header = String(req.headers?.authorization ?? "");
  if (!header) return "free";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!/^nsh_rip_[A-Za-z0-9_-]{24,}$/.test(token)) return null;
  const hash = Buffer.from(sha256(token), "hex");
  for (const k of parseKeys(env.RIPPLING_API_KEYS)) {
    if (timingSafeEqual(hash, Buffer.from(k.hash, "hex"))) return k.plan;
  }
  return null;
}

export const BUY = "This needs a paid Rippling Exposure plan (Starter, Desk or Institution). See https://www.noshashi.app/rippling/#plans or email institutions@noshashi.app.";
