import { describe, expect, it } from "vitest";
import { parseCommitments, rehearseWork } from "../src/lib/continuity/rehearsal.ts";
import { sampleDomain, sampleAccounts, sampleTime } from "../src/lib/continuity/sample.ts";
import { sampleWork } from "../src/lib/continuity/workSample.ts";
const snapshot = { domain: sampleDomain, closeTime: sampleTime, accounts: sampleAccounts };
const rules = sampleDomain.accepted;

describe("Continuity change rehearsal", () => {
  it("distinguishes baseline expiry from effects of the proposed rule removal", () => {
    const result = rehearseWork(snapshot, [rules[1]], sampleWork);
    const payment = result.find(row => row.id === "Payment-01");
    const loan = result.find(row => row.id === "Loan-01");
    expect(payment.outcome).toBe("Access prerequisite unmet");
    expect(payment.changedByScenario).toBe(true);
    expect(loan.outcome).toBe("Access prerequisite unmet");
    expect(loan.changedByScenario).toBe(false);
  });
  it("keeps work eligible when an alternative credential meets the deadline", () => {
    const result = rehearseWork(snapshot, [rules[1]], sampleWork);
    expect(result.find(row => row.id === "Trade-01").outcome).toBe("Access prerequisite met");
  });
  it("leaves unmapped accounts and unread domains unresolved", () => {
    expect(rehearseWork(snapshot, rules, sampleWork).find(row => row.id === "Closure-01").missingEvidence).toBe(true);
    const activity = { ...sampleWork[0], dependencies: [{ account: "Sample desk A", domainId: "F".repeat(64) }] };
    expect(rehearseWork(snapshot, rules, [activity])[0].outcome).toBe("Needs ledger evidence");
  });
  it("requires every declared dependency and preserves missing evidence alongside a failed check", () => {
    const activity = { ...sampleWork[1], dependencies: [
      { account: "Sample desk B", domainId: sampleDomain.domainId },
      { account: "Missing account", domainId: sampleDomain.domainId },
    ] };
    const [result] = rehearseWork(snapshot, [rules[1]], [activity]);
    expect(result.outcome).toBe("Access prerequisite unmet");
    expect(result.missingEvidence).toBe(true);
  });
  it("honors owner access at a deadline without credentials", () => {
    const activity = { ...sampleWork[0], dependencies: [{ account: sampleDomain.owner, domainId: sampleDomain.domainId }] };
    const value = { ...snapshot, accounts: [{ account: sampleDomain.owner, credentials: [] }] };
    expect(rehearseWork(value, [rules[1]], [activity])[0].outcome).toBe("Access prerequisite met");
  });
  it("rejects invalid dates, duplicate IDs, empty dependencies and invalid domains", () => {
    for (const plannedAt of ["2026-02-30T00:00:00Z", "2026-11-19T00:00:00Z", "2028-11-20T00:00:00Z", "2026-11-27"]) {
      expect(() => parseCommitments([{ ...sampleWork[0], plannedAt }], sampleTime)).toThrow();
    }
    expect(() => parseCommitments([sampleWork[0], sampleWork[0]], sampleTime)).toThrow();
    expect(() => parseCommitments([{ ...sampleWork[0], dependencies: [] }], sampleTime)).toThrow();
    expect(() => parseCommitments([{ ...sampleWork[0], dependencies: [{ account: "A", domainId: "bad" }] }], sampleTime)).toThrow();
    expect(() => parseCommitments([null], sampleTime)).toThrow();
  });
  it("evaluates the exact expiry boundary at a scheduled time", () => {
    const activity = { ...sampleWork[1], plannedAt: "2026-11-23T00:00:00Z" };
    expect(rehearseWork(snapshot, rules, [activity])[0].outcome).toBe("Access prerequisite unmet");
  });
  it("rejects invalid scenarios and orders the exported work by deadline", () => {
    expect(() => rehearseWork(snapshot, [], sampleWork)).toThrow();
    const times = rehearseWork(snapshot, rules, sampleWork).map(row => row.plannedAt);
    expect(times).toEqual([...times].sort());
  });
});
