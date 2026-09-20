/*
 * TEMPORARY. Deleted before this PR leaves draft.
 *
 * Round two. Round one established that XRPScan's trustlines endpoint
 * returns the whole holder set in one request — 98,190 entries for
 * RLUSD — where the ledger walk needs ~735 sequential pages. This
 * round dry-runs the actual proposal end to end and times it:
 *
 *   1. fetch the distribution from the indexer (one request)
 *   2. fetch authoritative supply from the LEDGER (gateway_balances)
 *   3. reconcile: does the indexer's sum match the ledger's total?
 *   4. only then compute HHI
 *
 * Step 3 is the point. A concentration figure lifted from a third
 * party is an assertion by that third party, which is worth less than
 * nothing on a document meant to settle an argument about who controls
 * an asset. Checking the indexer's total against the ledger's own
 * authoritative obligations turns "XRPScan says" into "XRPScan says,
 * and the ledger agrees on the total" — and catches a stale or
 * truncated indexer instead of quietly publishing its error.
 */
import { fetchWithTimeout } from "./_lib/html.js";

const RLUSD = {
  currency: "524C555344000000000000000000000000000000",
  issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
};

function hhiOf(values) {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return values.reduce((acc, v) => acc + ((v / total) * 100) ** 2, 0);
}

export default async function handler(req, res) {
  const t = {};
  const mark = (k, from) => { t[k] = Date.now() - from; };
  const out = {};

  try {
    // ── 1. Ledger: the authoritative total. ──
    let start = Date.now();
    const ledgerRes = await fetchWithTimeout("https://xrplcluster.com", {
      timeout: 15000,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "gateway_balances",
        params: [{ account: RLUSD.issuer, ledger_index: "validated" }],
      }),
    });
    const ledger = await ledgerRes.json();
    mark("ledger_ms", start);
    const obligations = Number(ledger?.result?.obligations?.[RLUSD.currency] ?? 0);
    out.ledger_obligations = obligations;
    out.ledger_index = ledger?.result?.ledger_index ?? null;

    // ── 2. Indexer: the distribution. ──
    start = Date.now();
    const idxRes = await fetchWithTimeout(
      `https://api.xrpscan.com/api/v1/account/${RLUSD.issuer}/trustlines`,
      { timeout: 45000, headers: { Accept: "application/json", "User-Agent": "noshashi.app" } }
    );
    const raw = await idxRes.text();
    mark("indexer_fetch_ms", start);
    out.indexer_status = idxRes.status;
    out.indexer_bytes = raw.length;

    start = Date.now();
    const lines = JSON.parse(raw);
    mark("indexer_parse_ms", start);
    out.indexer_entries = Array.isArray(lines) ? lines.length : null;

    // ── 3. Reconcile, then measure. ──
    start = Date.now();
    const held = [];
    let wrongCurrency = 0;
    for (const line of lines) {
      if (line?.specification?.currency !== RLUSD.currency) { wrongCurrency += 1; continue; }
      // Issuer's own view: a holder's balance is negative.
      const amount = -Number(line?.state?.balance ?? 0);
      if (amount > 0) held.push(amount);
    }
    const observed = held.reduce((a, b) => a + b, 0);
    const sorted = [...held].sort((a, b) => b - a);
    mark("compute_ms", start);

    out.entries_wrong_currency = wrongCurrency;
    out.holders_with_balance = held.length;
    out.indexer_sum = observed;
    out.reconciliation = obligations > 0
      ? { ratio: observed / obligations, drift_pct: ((observed - obligations) / obligations) * 100 }
      : null;
    out.hhi = Math.round(hhiOf(held));
    out.top_holder_pct = observed > 0 ? (sorted[0] / observed) * 100 : 0;
    out.top_five_pct = observed > 0 ? (sorted.slice(0, 5).reduce((a, b) => a + b, 0) / observed) * 100 : 0;
    out.timings = t;
    out.total_ms = Object.values(t).reduce((a, b) => a + b, 0);
  } catch (error) {
    out.error = error?.message ?? String(error);
    out.timings = t;
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(out);
}
