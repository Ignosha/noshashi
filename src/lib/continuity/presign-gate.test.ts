import { describe, expect, it } from "vitest";
import { evaluatePreSignGate, type PreSignDecision, type PreSignRequest } from "./presign-gate";

const request: PreSignRequest = {
  intentHash: "a".repeat(64), policyHash: "b".repeat(64),
  ledgerHash: "c".repeat(64), nowMs: 1000,
};
const decision: PreSignDecision = {
  ...request, verdict: "GO", expiresAtMs: 2000,
  receiptVerified: true, evidenceComplete: true,
};
describe("Continuity pre-sign gate", () => {
  it("permits only a verified, complete, matching unexpired GO", () => {
    expect(evaluatePreSignGate(request, decision)).toEqual({ allowed: true, reason: "AUTHORIZED" });
  });
  it("fails closed without a decision", () => {
    expect(evaluatePreSignGate(request, null).allowed).toBe(false);
  });
  it.each(["HOLD", "NO-GO"] as const)("rejects %s", verdict => {
    expect(evaluatePreSignGate(request, { ...decision, verdict }).allowed).toBe(false);
  });
  it("rejects unverified receipts and missing evidence", () => {
    expect(evaluatePreSignGate(request, { ...decision, receiptVerified: false }).allowed).toBe(false);
    expect(evaluatePreSignGate(request, { ...decision, evidenceComplete: false }).allowed).toBe(false);
  });
  it.each(["intentHash", "policyHash", "ledgerHash"] as const)("rejects changed %s", key => {
    expect(evaluatePreSignGate(request, { ...decision, [key]: "d".repeat(64) }).allowed).toBe(false);
  });
  it("rejects expiration and invalid timestamps", () => {
    expect(evaluatePreSignGate({ ...request, nowMs: 2000 }, decision).allowed).toBe(false);
    expect(evaluatePreSignGate({ ...request, nowMs: Number.NaN }, decision).allowed).toBe(false);
  });
  it("rejects malformed digests", () => {
    expect(evaluatePreSignGate({ ...request, intentHash: "not-a-hash" }, decision).allowed).toBe(false);
  });
});
