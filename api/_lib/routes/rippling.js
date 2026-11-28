/*
 * GET /api/v1/rippling?account=r…
 *
 * Can a third party swap this account's balances between its own trust
 * lines? Reads account_info and every page of account_lines at the latest
 * validated ledger (up to 2,000 lines), and returns the currencies that can
 * be rippled at par, how much can move, and unsigned TrustSet / AccountSet
 * templates that close it. Read-only: nothing is signed or submitted.
 *
 * Free, one account per request, 12 a minute per caller; a paid key
 * (../rippling-keys.js) raises the limit. Batch and issuer scans are in
 * rippling-pro.js. See api/_lib/rippling.js for the rules.
 */

import { createHash } from "node:crypto";
import { rippleRpcWithSource } from "../authority.js";
import { isValidClassicAddress } from "../classic-address.js";
import { clientKey, take } from "../rate-limit.js";
import { queryOf } from "../query.js";
import { analyseRippling } from "../rippling.js";
import { resolveRipplingPlan } from "../rippling-subscriptions.js";
import { upgradeOffer, RIPPLING_PLANS } from "../rippling-keys.js";

const PAGE = 400;
const MAX_PAGES = 5;

export const LIMITATION =
  "A read of validated ledger state at one ledger index. Amounts are sums at par and rounded; quality_in/quality_out on a line can change the rate a path pays. Not a security audit, legal opinion or guarantee. Fix templates are unsigned and must be reviewed before signing. The receipt is a hash, not a digital signature.";

export async function readLines(account) {
  const { result: info, endpoint } = await rippleRpcWithSource("account_info", { account, ledger_index: "validated" }, 6000);
  const ledgerIndex = Number(info.ledger_index);
  const lines = [];
  let marker;
  let pages = 0;
  let truncated = false;
  do {
    let page;
    try {
      // Pinned to the same ledger as account_info so the pages agree.
      ({ result: page } = await rippleRpcWithSource(
        "account_lines",
        { account, ledger_index: ledgerIndex, limit: PAGE, ...(marker ? { marker } : {}) },
        8000,
      ));
    } catch (error) {
      if (pages === 0) throw error;
      truncated = true;
      break;
    }
    lines.push(...(page.lines ?? []));
    marker = page.marker;
    pages += 1;
    if (marker && pages >= MAX_PAGES) truncated = true;
  } while (marker && pages < MAX_PAGES);
  return { info, lines, truncated, ledgerIndex, endpoint };
}

export default async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const account = String(queryOf(req).account ?? "").trim();
  if (!isValidClassicAddress(account)) {
    return res.status(400).json({ error: "Pass ?account= a valid XRPL classic address (it begins with r and has a valid checksum)." });
  }
  let plan;
  try {
    plan = await resolveRipplingPlan(req);
  } catch {
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({ error: "Could not verify subscription access. Try again shortly." });
    return;
  }
  if (plan === null) return res.status(401).json({ error: "That API key is not valid." });
  const limit = take(`rippling:${plan}:${clientKey(req)}`, { limit: RIPPLING_PLANS[plan].per_minute });
  if (!limit.ok) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return res.status(429).json(plan === "free"
      ? { code: "RATE_LIMIT", error: `The free check allows ${RIPPLING_PLANS.free.per_minute} a minute. Wait ${limit.retryAfter} s, or use a paid plan for more.`, upgrade: upgradeOffer("free") }
      : { code: "RATE_LIMIT", error: "Please wait before checking again." });
  }
  // The free check also has a daily allowance per caller. Like the
  // per-minute limit it is kept per warm instance (see rate-limit.js), so
  // it is a fair-use line, not a meter; paid keys have no daily cap.
  if (plan === "free") {
    const day = take(`rippling-day:${clientKey(req)}`, { limit: RIPPLING_PLANS.free.per_day, windowMs: 24 * 60 * 60_000 });
    if (!day.ok) {
      res.setHeader("Retry-After", String(day.retryAfter));
      return res.status(429).json({
        code: "FREE_LIMIT",
        error: `You've used today's ${RIPPLING_PLANS.free.per_day} free rippling checks. Choose a plan to keep checking now, or come back tomorrow.`,
        upgrade: upgradeOffer("free"),
      });
    }
    if (typeof day.remaining === "number") res.setHeader("X-Free-Checks-Remaining", String(day.remaining));
  }
  try {
    const { info, lines, truncated, ledgerIndex, endpoint } = await readLines(account);
    const report = {
      ...analyseRippling({ account, accountInfo: info, lines, truncated }),
      network: "XRPL Mainnet",
      ledger_index: ledgerIndex,
      ledger_hash: info.ledger_hash ?? null,
      observed_at: new Date().toISOString(),
      source: endpoint,
      method: "account_info + account_lines (validated, same ledger)",
    };
    const digest = createHash("sha256").update(JSON.stringify(report)).digest("hex");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=120");
    return res.status(200).json({
      ...report,
      receipt: { algorithm: "SHA-256", encoding: "UTF-8 JSON.stringify(report without receipt or limitation)", digest },
      limitation: LIMITATION,
    });
  } catch (error) {
    if (error?.code === "actNotFound") return res.status(404).json({ error: "No account with that address exists on the ledger." });
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ verdict: "UNRESOLVED", error: "Ledger evidence unavailable. Nothing was concluded; retry shortly." });
  }
}
