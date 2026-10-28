import { describe, expect, it } from "vitest";

import { EVIDENCE_TIERS } from "../api/_lib/evidence-tiers.js";
import {
  TIERS,
  schedule,
  currencyCode,
  currencyLabel,
  requestsFor,
  findings,
  renderReport,
  evidenceOf,
} from "../supabase/functions/_shared/evidenceReport.ts";

/**
 * The Ledger Evidence Report's delivery side. The checkout charges from
 * api/_lib/evidence-tiers.js and the delivery function schedules from
 * supabase/functions/_shared/evidenceReport.ts; a buyer who paid for
 * Quarterly and was scheduled as Standard would get one report for $7,500.
 */

const ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const WALLET = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";

describe("tiers", () => {
  it("the checkout and the delivery agree on every tier", () => {
    expect(Object.keys(TIERS).sort()).toEqual(Object.keys(EVIDENCE_TIERS).sort());
    for (const [key, tier] of Object.entries(EVIDENCE_TIERS)) {
      expect(TIERS[key].cents).toBe(tier.cents);
      expect(TIERS[key].cadence).toBe(tier.cadence);
      expect(TIERS[key].limits).toEqual(tier.limits);
      expect(TIERS[key].name).toBe(tier.name);
    }
  });
});

describe("delivery schedule", () => {
  const paid = new Date("2026-10-28T15:00:00Z");

  it("Standard is one report, today", () => {
    expect(schedule("standard", paid, null)).toEqual([{ period_end: null, due_on: "2026-10-28" }]);
  });

  it("a past period end is read today; a future one the day after it", () => {
    expect(schedule("standard", paid, "2026-09-30")).toEqual([{ period_end: "2026-09-30", due_on: "2026-10-28" }]);
    expect(schedule("standard", paid, "2026-10-31")).toEqual([{ period_end: "2026-10-31", due_on: "2026-11-01" }]);
    expect(schedule("standard", paid, "2026-10-28")).toEqual([{ period_end: "2026-10-28", due_on: "2026-10-29" }]);
  });

  it("Quarterly adds the next four quarter-ends, each the day after", () => {
    expect(schedule("quarterly", paid, null)).toEqual([
      { period_end: null, due_on: "2026-10-28" },
      { period_end: "2026-12-31", due_on: "2027-01-01" },
      { period_end: "2027-03-31", due_on: "2027-04-01" },
      { period_end: "2027-06-30", due_on: "2027-07-01" },
      { period_end: "2027-09-30", due_on: "2027-10-01" },
    ]);
  });

  it("Audit support adds the next twelve month-ends", () => {
    const s = schedule("audit", paid, null);
    expect(s).toHaveLength(13);
    expect(s[1]).toEqual({ period_end: "2026-10-31", due_on: "2026-11-01" });
    expect(s[4]).toEqual({ period_end: "2027-01-31", due_on: "2027-02-01" });
    expect(s[5]).toEqual({ period_end: "2027-02-28", due_on: "2027-03-01" });
    expect(s[12]).toEqual({ period_end: "2027-09-30", due_on: "2027-10-01" });
  });

  it("paid on a quarter-end, that quarter-end is read the next day", () => {
    const s = schedule("quarterly", new Date("2026-12-31T10:00:00Z"), null);
    expect(s[1]).toEqual({ period_end: "2026-12-31", due_on: "2027-01-01" });
  });

  it("does not deliver the buyer's own period end twice", () => {
    const s = schedule("audit", paid, "2026-10-31");
    expect(s.filter((d) => d.period_end === "2026-10-31")).toHaveLength(1);
    expect(s).toHaveLength(12);
  });
});

describe("currencies", () => {
  it("writes codes longer than three characters as 40 hex, and reads them back", () => {
    expect(currencyCode("USD")).toBe("USD");
    expect(currencyCode("RLUSD")).toBe("524C555344000000000000000000000000000000");
    expect(currencyLabel("524C555344000000000000000000000000000000")).toBe("RLUSD");
  });

  it("builds the public requests for a scope", () => {
    const r = requestsFor({ issuers: [ISSUER], wallets: [WALLET, ISSUER], books: [`RLUSD.${ISSUER}`] }, "2026-09-30");
    expect(r.map((x) => x.path)).toEqual([
      `/api/authority?issuer=${ISSUER}&walk=1`,
      `/api/treasury?wallets=${WALLET},${ISSUER}&at=2026-09-30`,
      `/api/book?currency=524C555344000000000000000000000000000000&issuer=${ISSUER}`,
    ]);
  });
});

/*
 * Replies as /api/authority, /api/treasury and /api/book returned them
 * from mainnet on 2026-10-28 (trimmed to the fields the report reads).
 */
const issuerReply = {
  ledgerIndex: 107960396,
  evaluatedAt: "2026-10-28T14:48:14.368Z",
  rulesVersion: 2,
  digest: "7AD760C6356662DBB42B1D980AF930F358D3CA9A26C5E0C55C4402B04E6F99E7",
  disclaimer: "Ledger facts about authority retained by this issuer at the stated ledger index.",
  checks: [
    { label: "Freeze permanently surrendered", severity: "warn", passed: false, detail: "lsfNoFreeze is not set." },
    { label: "Issuance not frozen now", severity: "block", passed: true, detail: "lsfGlobalFreeze is clear." },
    { label: "Supply concentration", severity: "warn", passed: false, state: "INSUFFICIENT_DATA", detail: "Supply was not walked." },
  ],
};
const bookReply = {
  currency: "USD",
  currency_label: "USD",
  ledger_index: 107960399,
  read_at: "2026-10-28T14:48:24.578Z",
  units: "quantities in USD; prices in XRP per USD",
  reference: { mid: 0.7658207583869383 },
  quoted: { bid: 4783.087663771024, ask: 1278400.4730999707 },
  fillable: { bid: 4783.087663771024, ask: 20561.798453248863 },
  fillable_ratio: { bid: 1, ask: 0.016084004101929752 },
  disclosures: ["DEX order book only: AMM pool liquidity is not included."],
};

describe("findings", () => {
  it("states each retained power and thin book with its ledger index", () => {
    const f = findings([
      { kind: "issuer", subject: ISSUER, request: "/api/authority", reply: issuerReply },
      { kind: "book", subject: `USD.${WALLET}`, request: "/api/book", reply: bookReply },
    ]);
    expect(f[0]).toContain("Freeze permanently surrendered");
    expect(f[0]).toContain("107,960,396");
    expect(f.some((x) => x.includes("Supply concentration"))).toBe(false);
    expect(f[1]).toContain("1.6%");
  });

  it("says a failed reading failed, never that it passed", () => {
    const f = findings([{ kind: "issuer", subject: ISSUER, request: "/api/authority", error: "timeout" }]);
    expect(f[0]).toContain("could not be read");
  });
});

describe("the report document", () => {
  const sources = [
    { kind: "issuer", subject: ISSUER, request: `/api/authority?issuer=${ISSUER}&walk=1`, reply: issuerReply },
    { kind: "book", subject: `USD.${WALLET}`, request: `/api/book?currency=USD&issuer=${WALLET}`, reply: bookReply },
  ];
  const html = renderReport({
    reference: "NER-20261028-ABCDEF-01",
    tier: "quarterly",
    organization: "Acme <Treasury>",
    scope: { issuers: [ISSUER], wallets: [], books: [`USD.${WALLET}`] },
    periodEnd: null,
    generatedAt: "2026-10-28T15:00:00.000Z",
    sources,
    digest: "A".repeat(64),
  });

  it("is a complete document carrying the digest and the verification link", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("A".repeat(64));
    expect(html).toContain(`/evidence-report/verify/?digest=${"A".repeat(64)}`);
    expect(html).toContain("QUARTERLY");
  });

  it("escapes what the buyer typed", () => {
    expect(html).toContain("Acme &lt;Treasury&gt;");
    expect(html).not.toContain("<Treasury>");
  });

  it("shows an abstention as not measured, not as a pass", () => {
    expect(html).toContain("Not measured");
  });

  it("hashes exactly the replies it was built from", () => {
    expect(JSON.parse(evidenceOf(sources))).toEqual(sources);
  });
});
