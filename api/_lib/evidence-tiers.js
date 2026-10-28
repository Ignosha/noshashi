/*
 * The Ledger Evidence Report's tiers: price, scope and how often the
 * report is delivered. Read by the checkout (the price is charged from
 * here, never from the form) and by the sales page.
 *
 * supabase/functions/_shared/evidenceReport.ts keeps the same table for
 * the delivery side, and tests/evidence-report.test.js fails if the two
 * drift apart.
 */

export const EVIDENCE_TIERS = {
  issuer: {
    name: "Issuer check",
    cents: 75_000,
    cadence: "once",
    limits: { issuers: 1, wallets: 3, books: 1 },
    summary: "One report on a single token issuer: its controls, up to three team or treasury wallets, and its order book.",
  },
  standard: {
    name: "Standard",
    cents: 250_000,
    cadence: "once",
    limits: { issuers: 3, wallets: 10, books: 3 },
    summary: "One report, at your period end or today.",
  },
  quarterly: {
    name: "Quarterly",
    cents: 750_000,
    cadence: "quarterly",
    limits: { issuers: 3, wallets: 10, books: 3 },
    summary: "A report now, then one at each of the next four quarter-ends.",
  },
  audit: {
    name: "Audit support",
    cents: 1_000_000,
    cadence: "monthly",
    limits: { issuers: 6, wallets: 10, books: 6 },
    summary: "A report now, then one at each of the next twelve month-ends, with a larger scope.",
  },
  // Not sold. A Standard report for testing a real card payment end to end.
  // The checkout offers it only when EVIDENCE_TEST_EMAIL is set, and the
  // report always goes to that address, so the URL is worth nothing to
  // anyone else. It is the one tier that takes Stripe promotion codes: it
  // is listed at $1.00 (listCents) so a 50%-off code can be tried, and
  // `cents` stays the least the webhook accepts, $0.50, which is also
  // Stripe's minimum charge.
  test: {
    name: "Test",
    cents: 50,
    listCents: 100,
    promotionCodes: true,
    cadence: "once",
    limits: { issuers: 3, wallets: 10, books: 3 },
    summary: "A test of the full purchase and delivery, sent to the owner.",
    hidden: true,
  },
};

export const DEFAULT_TIER = "standard";

export function tierOf(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return Object.hasOwn(EVIDENCE_TIERS, key) ? key : null;
}
