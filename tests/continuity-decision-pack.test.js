import { describe, expect, it } from "vitest";
import { canonical, sha256Hex } from "../src/lib/compliance/registry.ts";
import { renderDecisionReport, summarizeWork, verifyDecisionPack } from "../src/lib/continuity/decisionPack.ts";
import { rehearseWork } from "../src/lib/continuity/rehearsal.ts";
import { sampleDomain, sampleAccounts, sampleTime } from "../src/lib/continuity/sample.ts";
import { sampleWork } from "../src/lib/continuity/workSample.ts";

function evidence() {
  const snapshot = { domain: sampleDomain, accounts: sampleAccounts, closeTime: sampleTime };
  const proposedRules = [sampleDomain.accepted[1]];
  return structuredClone({ version: 1, source: "fictional sample", ledger: null, ...snapshot, proposedRules, horizonDays: 7,
    rehearsal: { assumptions: "Credentials and domain rules stay as observed.", rows: rehearseWork(snapshot, proposedRules, sampleWork).map(row => ({ ...row, review: { owner: "Treasury", nextAction: "Check dependency with domain operator" } })) } });
}
async function pack(value) { return { evidence: value, sha256: await sha256Hex(canonical(value)) }; }

describe("Continuity decision evidence", () => {
  it("reopens an existing version 1 rehearsal and retains notes and observation metadata", async () => {
    const value = evidence();
    const restored = await verifyDecisionPack(await pack(value));
    expect(restored.rehearsal.rows).toEqual(value.rehearsal.rows);
    expect(restored.snapshot.domain).toEqual(value.domain);
    expect(restored.snapshot.accounts).toEqual(value.accounts);
  });
  it("detects edited file contents against the recorded digest", async () => {
    const saved = await pack(evidence());
    saved.evidence.rehearsal.rows[0].review.owner = "Other owner";
    await expect(verifyDecisionPack(saved)).rejects.toThrow(/digest/);
  });
  it("replays calculations even when a modified finding has a newly calculated digest", async () => {
    const value = evidence();
    value.rehearsal.rows[0].outcome = "Altered finding";
    await expect(verifyDecisionPack(await pack(value))).rejects.toThrow(/replay/);
  });
  it("rejects invalid credential acceptance flags and duplicate accounts", async () => {
    const value = evidence();
    value.accounts[0].credentials[0].accepted = "yes";
    await expect(verifyDecisionPack(await pack(value))).rejects.toThrow(/acceptance/);
    const duplicate = evidence(); duplicate.accounts.push(duplicate.accounts[0]);
    await expect(verifyDecisionPack(await pack(duplicate))).rejects.toThrow(/Duplicate saved accounts/);
  });
  it("rejects inconsistent claimed ledger times", async () => {
    const value = evidence(); value.source = "validated ledger";
    value.ledger = { index: 100, closeTime: sampleTime + 1, closeIso: "2026-11-20T00:00:00.000Z" };
    await expect(verifyDecisionPack(await pack(value))).rejects.toThrow(/ledger time/);
  });
  it("reports incomplete coverage and ownership without a blanket approval result", () => {
    const value = evidence(); value.rehearsal.rows[0].review.owner = "";
    const summary = summarizeWork(value.rehearsal.rows);
    expect(summary).toMatchObject({ activities: 5, requiredChecks: 5, coveredChecks: 4, affectedByChange: 1, missingEvidence: 1, missingOwner: 1 });
  });
  it("escapes user text in a standalone printable report", () => {
    const value = evidence(); value.rehearsal.rows[0].review.nextAction = '<img src=x onerror="alert(1)">';
    const html = renderDecisionReport(value, "a".repeat(64));
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    expect(html).toContain("4/5 declared prerequisites covered");
    expect(html).toContain("@media print");
    expect(html).toContain("Current rules at planned time");
  });
});
