/*
 * The paid Rippling Exposure routes (plans in ../rippling-keys.js).
 *
 *   POST /api/v1/rippling/batch   {"accounts": ["r…", …]}
 *     Every account's exposure, read at the same validated ledger, with
 *     totals per currency across the whole set. For an exchange's or a
 *     custodian's fleet of hot, warm and deposit wallets.
 *
 *   GET  /api/v1/rippling/issuer?issuer=r…&currency=USD[&offset=0&holders=200]
 *     For an issuer: of its largest holders (among the lines read), which
 *     can have this token swapped out of their account by anyone's
 *     payment, and how much of it in total.
 *
 * Read-only, like the free route: nothing is signed or submitted. Each
 * answer carries the ledger index it read and a SHA-256 receipt.
 */

import { createHash } from "node:crypto";
import { rippleRpcWithSource } from "../authority.js";
import { isValidClassicAddress } from "../classic-address.js";
import { clientKey, take } from "../rate-limit.js";
import { queryOf } from "../query.js";
import { analyseRippling, fmt } from "../rippling.js";
import { readLines, LIMITATION } from "./rippling.js";
import { planFor, upgradeOffer, RIPPLING_PLANS, BUY } from "../rippling-keys.js";

const BUDGET_MS = 45_000;
const CONCURRENCY = 6;
/** Holders one issuer-scan call checks; about 35 seconds at Mainnet pace. */
export const PAGE_HOLDERS = 200;

function receipt(report) {
  return { algorithm: "SHA-256", encoding: "UTF-8 JSON.stringify(report without receipt or limitation)", digest: createHash("sha256").update(JSON.stringify(report)).digest("hex") };
}

/** Run `fn` over `items` with at most `n` in flight, stopping new work after `deadline`. */
export async function pool(items, n, fn, deadline = Infinity) {
  const out = new Array(items.length);
  let next = 0;
  let skipped = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      if (Date.now() > deadline) { skipped += 1; continue; }
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return { results: out, skipped };
}

/** A currency as the ledger writes it: three characters, or 40 hex digits. */
export function ledgerCurrency(code) {
  const c = String(code ?? "").trim();
  if (/^[0-9A-Fa-f]{40}$/.test(c)) return c.toUpperCase();
  if (/^[A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}$/.test(c) && c.toUpperCase() !== "XRP") return c;
  if (c.length > 3 && c.length <= 20) return Buffer.from(c, "ascii").toString("hex").toUpperCase().padEnd(40, "0");
  return null;
}

function gate(req, res, need) {
  const plan = planFor(req);
  if (plan === null) { res.status(401).json({ error: "That API key is not valid." }); return null; }
  const p = RIPPLING_PLANS[plan];
  if (!p[need]) { res.status(402).json({ code: "PAID_PLAN", error: BUY, plan, upgrade: upgradeOffer(plan) }); return null; }
  const limit = take(`rippling-pro:${plan}:${String(req.headers.authorization ?? "").slice(-12)}:${clientKey(req)}`, { limit: p.per_minute });
  if (!limit.ok) { res.setHeader("Retry-After", String(limit.retryAfter)); res.status(429).json({ error: "Rate limit for your plan reached; retry shortly." }); return null; }
  return { plan, p };
}

export async function batch(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "POST required" }); }
  const g = gate(req, res, "batch");
  if (!g) return;
  let body = req.body;
  try { if (typeof body === "string") body = JSON.parse(body); } catch { body = null; }
  const accounts = [...new Set(Array.isArray(body?.accounts) ? body.accounts.map((a) => String(a).trim()) : [])];
  if (!accounts.length) return res.status(400).json({ error: 'Send {"accounts": ["r…", …]}.' });
  if (accounts.length > g.p.batch) return res.status(413).json({ error: `Your ${g.p.label} plan checks up to ${g.p.batch} accounts per call.` });
  const bad = accounts.filter((a) => !isValidClassicAddress(a));
  if (bad.length) return res.status(400).json({ error: "Not valid XRPL classic addresses.", invalid: bad });

  const deadline = Date.now() + BUDGET_MS;
  const { results, skipped } = await pool(accounts, CONCURRENCY, async (account) => {
    try {
      const { info, lines, truncated, ledgerIndex } = await readLines(account);
      return { ...analyseRippling({ account, accountInfo: info, lines, truncated }), ledger_index: ledgerIndex };
    } catch (error) {
      return { account, verdict: error?.code === "actNotFound" ? "NOT_FOUND" : "UNRESOLVED" };
    }
  }, deadline);

  const reports = results.map((r, i) => r ?? { account: accounts[i], verdict: "NOT_READ", reason: "Time budget reached; send it again." });
  const totals = {};
  for (const r of reports) for (const e of r.exposures ?? []) {
    if (!e.exposed) continue;
    const t = (totals[e.currency_display] ??= { accounts_exposed: 0, movable_at_par: 0 });
    t.accounts_exposed += 1;
    t.movable_at_par += Number(e.movable_at_par);
  }
  for (const t of Object.values(totals)) t.movable_at_par = fmt(t.movable_at_par);
  const count = (v) => reports.filter((r) => r.verdict === v).length;
  const report = {
    plan: g.plan,
    network: "XRPL Mainnet",
    observed_at: new Date().toISOString(),
    summary: { accounts: accounts.length, exposed: count("EXPOSED"), clear: count("CLEAR"), incomplete: count("INCOMPLETE"), unresolved: count("UNRESOLVED") + count("NOT_FOUND") + count("NOT_READ"), not_read: skipped },
    exposed_by_currency: totals,
    reports,
  };
  return res.status(200).json({ ...report, receipt: receipt(report), limitation: LIMITATION });
}

/** The issuer's holders of `currency` among the first `pages` of its lines, largest first. */
export async function readHolders(issuer, currency, maxHolders) {
  const { result: info } = await rippleRpcWithSource("account_info", { account: issuer, ledger_index: "validated" }, 6000);
  const ledgerIndex = Number(info.ledger_index);
  const holders = [];
  let marker;
  let pages = 0;
  const maxPages = Math.max(5, Math.ceil(maxHolders / 400) * 3);
  do {
    const { result: page } = await rippleRpcWithSource("account_lines", { account: issuer, ledger_index: ledgerIndex, limit: 400, ...(marker ? { marker } : {}) }, 8000);
    for (const l of page.lines ?? []) if (l.currency === currency && Number(l.balance) < 0) holders.push({ account: l.account, held: -Number(l.balance) });
    marker = page.marker;
    pages += 1;
  } while (marker && pages < maxPages);
  holders.sort((a, b) => b.held - a.held);
  return { ledgerIndex, holders: holders.slice(0, maxHolders), holdersRead: holders.length, allLinesRead: !marker };
}

export async function issuerScan(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "GET required" }); }
  const g = gate(req, res, "issuer_holders");
  if (!g) return;
  const q = queryOf(req);
  const issuer = String(q.issuer ?? "").trim();
  const currency = ledgerCurrency(q.currency);
  if (!isValidClassicAddress(issuer) || !currency) return res.status(400).json({ error: "Pass ?issuer=r… and ?currency= (3 letters, a longer ticker, or 40 hex digits)." });
  // One call checks up to PAGE_HOLDERS holders inside the function's time
  // limit; larger scans page with ?offset=. The plan caps offset + holders.
  const offset = Math.max(0, Math.floor(Number(q.offset) || 0));
  const want = Math.min(PAGE_HOLDERS, Math.max(1, Math.floor(Number(q.holders) || PAGE_HOLDERS)));
  if (offset >= g.p.issuer_holders) return res.status(402).json({ code: "PLAN_LIMIT", error: `Your ${g.p.label} plan scans up to ${g.p.issuer_holders} holders per issuer. ${BUY}`, upgrade: upgradeOffer(g.plan) });
  const count = Math.min(want, g.p.issuer_holders - offset);

  let read;
  try { read = await readHolders(issuer, currency, offset + count); }
  catch (error) {
    if (error?.code === "actNotFound") return res.status(404).json({ error: "No account with that address exists on the ledger." });
    return res.status(503).json({ verdict: "UNRESOLVED", error: "Ledger evidence unavailable. Nothing was concluded; retry shortly." });
  }

  const deadline = Date.now() + BUDGET_MS;
  const slice = read.holders.slice(offset, offset + count);
  const { results, skipped } = await pool(slice, CONCURRENCY, async (h) => {
    try {
      const { info, lines, truncated } = await readLines(h.account);
      const r = analyseRippling({ account: h.account, accountInfo: info, lines, truncated });
      const e = r.exposures.find((x) => x.currency === currency && x.exposed);
      const own = e?.lines_at_risk.find((l) => l.peer === issuer);
      return { account: h.account, holds: fmt(h.held), can_be_swapped_out: own ? own.can_lose : "0", verdict: own ? "EXPOSED" : truncated ? "INCOMPLETE" : "CLEAR" };
    } catch {
      return { account: h.account, holds: fmt(h.held), verdict: "UNRESOLVED" };
    }
  }, deadline);

  const rows = results.filter(Boolean);
  const exposedRows = rows.filter((r) => r.verdict === "EXPOSED");
  const swappable = exposedRows.reduce((s, r) => s + Number(r.can_be_swapped_out), 0);
  const heldChecked = rows.reduce((s, r) => s + Number(r.holds), 0);
  const report = {
    plan: g.plan,
    issuer,
    currency,
    network: "XRPL Mainnet",
    issuer_ledger_index: read.ledgerIndex,
    observed_at: new Date().toISOString(),
    scope: {
      holders_found: read.holdersRead,
      all_issuer_lines_read: read.allLinesRead,
      offset,
      holders_checked: rows.length,
      holders_not_reached: skipped,
      next_offset: offset + count < Math.min(read.holdersRead, g.p.issuer_holders) ? offset + count : null,
      selection: "Largest balances among the issuer's trust lines read, checked one by one at their own latest validated ledger.",
    },
    summary: {
      holders_exposed: exposedRows.length,
      held_by_checked_holders: fmt(heldChecked),
      can_be_swapped_out: fmt(swappable),
      share_of_checked_balance: heldChecked ? `${((swappable / heldChecked) * 100).toFixed(2)}%` : "0%",
    },
    holders: rows,
  };
  return res.status(200).json({ ...report, receipt: receipt(report), limitation: LIMITATION });
}
