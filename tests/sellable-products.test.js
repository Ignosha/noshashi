/*
 * The three report products added on 2026-11-18: the Verified Issuer
 * subscription, the Listing review and the Issuer history report. The
 * history reply is built from the live SOLO fixture, so the report is
 * checked against what the ledger actually holds.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { EVIDENCE_TIERS } from "../api/_lib/evidence-tiers.js";
import { readReportScope, readVerifiedScope, verifiedForm } from "../api/create-checkout-session.js";
import { eventsFrom, tally } from "../api/_lib/issuer-history.js";
import { requestsFor, reportModel, findings, schedule } from "../supabase/functions/_shared/evidenceReport.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/issuer-history-solo-2026-11-18.json", import.meta.url), "utf8"));
const SOLO = fixture.issuer;
const events = eventsFrom(fixture.transactions, SOLO);
const historyReply = {
  issuer: SOLO,
  coverage: { complete: false, transactions_read: 1000, note: "The account's earliest 200 transactions and its latest 800 were read." },
  tally: tally(events),
  events,
};

describe("prices and scope", () => {
  it("sells Verified at $49, Listing at $750 and History at $250", () => {
    expect(EVIDENCE_TIERS.verified.cents).toBe(4_900);
    expect(EVIDENCE_TIERS.listing.cents).toBe(75_000);
    expect(EVIDENCE_TIERS.history.cents).toBe(25_000);
  });

  it("never sells Verified as a one-off report", () => {
    expect(readReportScope({ tier: "verified", issuers: SOLO }).error).toBeTruthy();
    expect(readReportScope({ tier: "listing", issuers: SOLO }).tier).toBe("listing");
  });

  it("History covers one issuer and nothing else", () => {
    expect(readReportScope({ tier: "history", issuers: SOLO }).tier).toBe("history");
    expect(readReportScope({ tier: "history", issuers: SOLO, wallets: SOLO }).error).toMatch(/wallets/);
  });
});

describe("Verified Issuer checkout", () => {
  it("needs a real issuing account", () => {
    expect(readVerifiedScope({ issuer: "nope" }).error).toBeTruthy();
    const ok = readVerifiedScope({ issuer: SOLO, currency: "SOLO", organization: "Sologenic" });
    expect(ok.books).toEqual([`SOLO.${SOLO}`]);
  });

  it("is a monthly subscription that carries the issuer on the subscription", () => {
    const form = verifiedForm(readVerifiedScope({ issuer: SOLO }), "https://www.noshashi.app");
    expect(form.get("mode")).toBe("subscription");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("4900");
    expect(form.get("line_items[0][price_data][recurring][interval]")).toBe("month");
    expect(form.get("subscription_data[metadata][product]")).toBe("verified_issuer");
    expect(form.get("subscription_data[metadata][issuers]")).toBe(SOLO);
  });

  it("each paid month is one report", () => {
    expect(schedule("verified", new Date("2026-11-18T12:00:00Z"), null)).toHaveLength(1);
  });
});

describe("history in the report", () => {
  it("Listing and History read the history; the Issuer check does not", () => {
    const scope = { issuers: [SOLO], wallets: [], books: [] };
    expect(requestsFor(scope, null, "listing").map((r) => r.kind)).toEqual(["issuer", "mpt", "history"]);
    expect(requestsFor(scope, null, "history").map((r) => r.kind)).toEqual(["issuer", "mpt", "history"]);
    expect(requestsFor(scope, null, "issuer").map((r) => r.kind)).toEqual(["issuer", "mpt"]);
  });

  it("lists what the issuer did and says when the reading was partial", () => {
    const sources = [{ kind: "history", subject: SOLO, request: "/api/issuer-history", reply: historyReply }];
    const model = reportModel({
      reference: "NER-TEST",
      tier: "history",
      organization: null,
      scope: { issuers: [SOLO], wallets: [], books: [] },
      periodEnd: null,
      generatedAt: "2026-11-18T12:00:00Z",
      sources,
      digest: "0".repeat(64),
    });
    const text = JSON.stringify(model.blocks);
    expect(text).toContain("What the issuer has done");
    expect(text).toContain("Turned on: master key disabled");
    expect(text).toContain("2019-12-07");
    expect(findings(sources).join(" ")).toMatch(/not all of it was read/);
  });

  it("counts freezes and clawbacks as findings", () => {
    const reply = { ...historyReply, coverage: { complete: true }, tally: { freezes: 2, clawbacks: 1, key_changes: 0, power_changes: 0 } };
    const f = findings([{ kind: "history", subject: SOLO, request: "", reply }]).join(" ");
    expect(f).toMatch(/frozen a holder's balance 2 times/);
    expect(f).toMatch(/clawed back holders' tokens 1 time\./);
  });
});
