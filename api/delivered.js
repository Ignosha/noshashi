/*
 * GET /api/delivered?account=r…[&from=YYYY-MM-DD][&to=YYYY-MM-DD][&format=csv|json|raw]
 *
 * An account's validated payments with what each one actually delivered,
 * as a CSV for a spreadsheet, an accountant or tax software. See
 * api/_lib/delivered.js for why `Amount` and `delivered_amount` are
 * different numbers and why the difference matters.
 *
 * Free and unauthenticated. Every transaction is public ledger data, and
 * the account owner is the person most likely to ask. Bounded so one
 * request cannot hold a function open: the history is read newest first,
 * a page at a time, until the `from` date is passed, MAX_PAGES pages are
 * read, or the time budget runs out. When it stops early the response
 * says so — `complete: false` in JSON, the `X-NOSHASHI-Complete: false`
 * header on the CSV, and the oldest ledger it reached — so a partial
 * history is never mistaken for a whole one. Narrow the dates to read
 * further back.
 *
 *   format=csv   (default) text/csv, one row per payment
 *   format=json  the rows plus a summary and the completeness fields
 *   format=raw   the first page exactly as the ledger returned it, so
 *                anyone can check the rows against the source
 */

import { rippleRpc, ADDRESS_RE } from "./_lib/authority.js";
import { deliveredRows, toCsv, summarize, RIPPLE_EPOCH } from "./_lib/delivered.js";
import { take, clientKey } from "./_lib/rate-limit.js";

const PAGE_LIMIT = 400;
const MAX_PAGES = 25;
const BUDGET_MS = 40_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value, endOfDay) {
  if (!value) return null;
  if (!DATE_RE.test(value)) return NaN;
  const ms = Date.parse(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}Z`);
  return Number.isFinite(ms) ? ms : NaN;
}

const txDateMs = (entry) => {
  if (entry.close_time_iso) return Date.parse(entry.close_time_iso);
  const tx = entry.tx_json ?? entry.tx ?? {};
  const seconds = Number(tx.date ?? entry.date);
  return Number.isFinite(seconds) ? (seconds + RIPPLE_EPOCH) * 1000 : NaN;
};

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const account = String(req.query?.account ?? "").trim();
  if (!ADDRESS_RE.test(account)) {
    return res.status(400).json({ error: "Pass ?account= an XRPL classic address. They begin with r." });
  }
  const fromMs = parseDate(String(req.query?.from ?? ""), false);
  const toMs = parseDate(String(req.query?.to ?? ""), true);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return res.status(400).json({ error: "Dates are YYYY-MM-DD, in UTC." });
  }
  if (fromMs !== null && toMs !== null && fromMs > toMs) {
    return res.status(400).json({ error: "`from` is after `to`." });
  }
  const format = ["json", "raw"].includes(req.query?.format) ? req.query.format : "csv";

  // A full read is up to 25 ledger round trips. A person downloads a
  // year once; a loop downloading it every second is not a person.
  const limit = take(`delivered:${clientKey(req)}`, { limit: 10, windowMs: 60_000 });
  if (!limit.ok) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return res.status(429).json({ error: "Too many exports. Try again in a minute." });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "X-NOSHASHI-Complete, X-NOSHASHI-Stopped-Because, X-NOSHASHI-Oldest-Ledger");

  const started = Date.now();
  const transactions = [];
  let marker;
  let pages = 0;
  let stoppedBecause = "end_of_history";
  let oldestLedger = null;
  let newestLedger = null;

  try {
    for (;;) {
      const result = await rippleRpc(
        "account_tx",
        {
          account,
          ledger_index_min: -1,
          ledger_index_max: -1,
          forward: false,
          limit: PAGE_LIMIT,
          ...(marker ? { marker } : {}),
        },
        12_000,
      );
      pages += 1;
      const page = result.transactions ?? [];

      if (format === "raw") {
        res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
        return res.status(200).json({
          account,
          note: "The first page of account_tx, newest first, exactly as the ledger returned it.",
          ledger_index_min: result.ledger_index_min,
          ledger_index_max: result.ledger_index_max,
          transactions: page,
        });
      }

      newestLedger ??= result.ledger_index_max ?? null;
      let passedFrom = false;
      for (const entry of page) {
        const ms = txDateMs(entry);
        const ledger = Number(entry.ledger_index ?? (entry.tx ?? entry.tx_json ?? {}).ledger_index);
        if (Number.isFinite(ledger)) oldestLedger = ledger;
        if (fromMs !== null && ms < fromMs) {
          passedFrom = true;
          break;
        }
        if (toMs !== null && ms > toMs) continue;
        transactions.push(entry);
      }

      marker = result.marker;
      if (passedFrom) { stoppedBecause = "reached_from_date"; break; }
      if (!marker) { stoppedBecause = "end_of_history"; break; }
      if (pages >= MAX_PAGES) { stoppedBecause = "page_cap"; break; }
      if (Date.now() - started > BUDGET_MS) { stoppedBecause = "time_budget"; break; }
    }
  } catch (error) {
    return res.status(502).json({
      error: "Could not read this account's history from a public XRPL node. Try again shortly.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const complete = stoppedBecause === "end_of_history" || stoppedBecause === "reached_from_date";
  const rows = deliveredRows(account, transactions);

  // Recent history changes every few seconds; a fixed past range does not.
  const closedRange = toMs !== null && toMs < Date.now() - 86_400_000;
  res.setHeader(
    "Cache-Control",
    closedRange && complete
      ? "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"
      : "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
  );

  if (format === "json") {
    return res.status(200).json({
      account,
      from: req.query?.from || null,
      to: req.query?.to || null,
      complete,
      stopped_because: stoppedBecause,
      pages_read: pages,
      newest_ledger: newestLedger,
      oldest_ledger_reached: oldestLedger,
      summary: summarize(rows),
      rows,
      note:
        "amount_delivered is the ledger's delivered_amount, never Amount. "
        + "'unavailable' means the ledger did not record it (payments before 2014-01-20). "
        + "Successful payments only. Not tax advice.",
    });
  }

  const name = `xrpl-delivered-${account}${req.query?.from ? `-${req.query.from}` : ""}${req.query?.to ? `-to-${req.query.to}` : ""}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.setHeader("X-NOSHASHI-Complete", String(complete));
  res.setHeader("X-NOSHASHI-Stopped-Because", stoppedBecause);
  if (oldestLedger) res.setHeader("X-NOSHASHI-Oldest-Ledger", String(oldestLedger));
  return res.status(200).send(toCsv(rows));
}
