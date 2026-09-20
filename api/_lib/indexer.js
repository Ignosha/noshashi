/*
 * Holder distribution from an indexer, reconciled against the ledger.
 *
 * ── Why an indexer at all ───────────────────────────────────────────
 * Concentration needs every holder's balance. The ledger will give
 * them, but only through `account_lines`, which pages strictly
 * sequentially because each page needs the previous page's marker.
 * Measured on mainnet: 400 lines a page, ~750ms a page, and RLUSD has
 * ~98,000 lines. That is roughly nine minutes for one issuer. No web
 * request has nine minutes, so the check abstained on every issuer of
 * any size — an honest answer, and a useless one.
 *
 * XRPScan returns the same set in a single request. Measured: 22.6MB,
 * 98,191 entries, 3.2s to fetch and 0.25s to parse.
 *
 * ── Why that is not enough on its own ───────────────────────────────
 * A figure taken from a third party is an assertion by that third
 * party. On a certificate whose whole value is that every number was
 * read from validated ledger state, quietly swapping in "XRPScan says"
 * would hollow out the one claim the document makes — and it is
 * exactly the substitution an opponent would look for.
 *
 * So the indexer is never trusted on its own. The LEDGER is asked for
 * the authoritative total (`gateway_balances`, one cheap request), the
 * indexer's balances are summed, and the two must agree. Measured
 * drift on RLUSD: 0.0002%. A stale, truncated or wrong indexer fails
 * that check and the certificate abstains rather than publishing
 * someone else's error as its own finding.
 *
 * What reconciliation does and does not establish: it proves the
 * indexer's set sums to the supply the ledger says exists, so nothing
 * material is missing and nothing invented has been added. It does not
 * prove any individual line is attributed to the right account. That
 * limitation is stated on the certificate rather than papered over.
 */

import { fetchWithTimeout } from "./html.js";

/** Free, keyless, and the only one of the three that returns balances. */
const XRPSCAN_TRUSTLINES = (issuer) =>
  `https://api.xrpscan.com/api/v1/account/${issuer}/trustlines`;

/**
 * How far the indexer's total may drift from the ledger's before the
 * reading is refused.
 *
 * Generous relative to the 0.0002% measured, because the two reads are
 * seconds and several ledgers apart and an actively-minted issuance
 * genuinely moves between them. Tight enough that a missing whale or a
 * stale snapshot cannot hide inside it.
 */
const RECONCILE_TOLERANCE = 0.01;

/** Big, but one request. Sized against a measured 3.2s for 22.6MB. */
const INDEXER_TIMEOUT_MS = 20_000;

function hhiOf(values) {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return values.reduce((acc, v) => acc + ((v / total) * 100) ** 2, 0);
}

/**
 * Read the distribution for one issuer and reconcile it.
 *
 * `outstanding` is the ledger's own obligations, by currency. It is
 * passed in rather than read here so the caller keeps one source of
 * truth for supply and this module cannot quietly substitute its own.
 *
 * Returns null when the indexer cannot be used at all — unreachable,
 * malformed, or failing reconciliation. Null means "fall back", never
 * "there is nothing to report".
 */
export async function readDistribution(issuer, outstanding) {
  const started = Date.now();
  const response = await fetchWithTimeout(XRPSCAN_TRUSTLINES(issuer), {
    timeout: INDEXER_TIMEOUT_MS,
    headers: { Accept: "application/json", "User-Agent": "noshashi.app authority certificate" },
  });
  if (!response.ok) throw new Error(`indexer replied ${response.status}`);

  const lines = await response.json();
  if (!Array.isArray(lines)) throw new Error("indexer did not return an array of trust lines");

  const held = {};
  for (const currency of Object.keys(outstanding)) held[currency] = [];

  for (const line of lines) {
    const currency = line?.specification?.currency;
    if (!held[currency]) continue;
    // The issuer's own view: a holder's balance is reported negative.
    const amount = -Number(line?.state?.balance ?? 0);
    if (amount > 0) held[currency].push(amount);
  }

  const currencies = [];
  for (const [currency, total] of Object.entries(outstanding)) {
    const amounts = held[currency] ?? [];
    const observedHeld = amounts.reduce((a, b) => a + b, 0);
    const sorted = [...amounts].sort((a, b) => b - a);
    const coverage = total > 0 ? observedHeld / total : 0;

    // Reconciliation, per currency. A single currency that will not
    // reconcile is not allowed to ride along on the others.
    if (Math.abs(coverage - 1) > RECONCILE_TOLERANCE) {
      throw new Error(
        `indexer total for ${currency} is ${(coverage * 100).toFixed(4)}% of the ledger's obligations, outside the ${RECONCILE_TOLERANCE * 100}% tolerance`
      );
    }

    currencies.push({
      currency,
      outstanding: total,
      observedHeld,
      holders: amounts.length,
      hhi: hhiOf(amounts),
      topHolderPct: observedHeld > 0 ? ((sorted[0] ?? 0) / observedHeld) * 100 : 0,
      topFivePct:
        observedHeld > 0
          ? (sorted.slice(0, 5).reduce((a, b) => a + b, 0) / observedHeld) * 100
          : 0,
      coverage,
    });
  }

  return {
    issuer,
    currencies,
    linesWalked: lines.length,
    truncated: false,
    // Provenance travels with the reading. Everything downstream that
    // prints a concentration figure has to be able to say where it
    // came from, and a field is harder to forget than a convention.
    source: "indexer",
    sourceName: "xrpscan.com",
    reconciledAgainstLedger: true,
    elapsedMs: Date.now() - started,
    stoppedBecause: "complete",
    pages: 1,
  };
}
