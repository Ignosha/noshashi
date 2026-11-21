import { describe, expect, it } from "vitest";
import { evaluateAssurance, type AssuranceInput } from "./assurance";
const base: AssuranceInput = {
  policyChecks: [{ id: "POLICY", label: "Rule", severity: "block", passed: true, detail: "" }],
  issuerCertificate: { verdict: "go", ledgerIndex: 100 } as AssuranceInput["issuerCertificate"],
  exitFill: { requested: 100, filled: 100, slippageBps: 10 } as AssuranceInput["exitFill"],
  requiredExitAmount: 100, maximumSlippageBps: 50,
  validatedLedgerIndex: 100, issuerLedgerIndex: 100, liquidityLedgerIndex: 100,
};
describe("Continuity assurance composition", () => {
  it("GO requires matching complete evidence", () => {
    expect(evaluateAssurance(base)).toEqual({ verdict: "GO", reasons: [], evidenceComplete: true });
  });
  it("holds when any mandatory evidence is missing or stale", () => {
    expect(evaluateAssurance({ ...base, issuerCertificate: null }).verdict).toBe("HOLD");
    expect(evaluateAssurance({ ...base, liquidityLedgerIndex: 99 }).verdict).toBe("HOLD");
    expect(evaluateAssurance({ ...base, policyChecks: [] }).verdict).toBe("HOLD");
  });
  it("does not treat insufficient issuer data as complete", () => {
    const result = evaluateAssurance({ ...base, issuerCertificate: { verdict: "insufficient-data", ledgerIndex: 100 } as never });
    expect(result.verdict).toBe("HOLD");
    expect(result.evidenceComplete).toBe(false);
  });
  it("blocks hard policy and issuer failures", () => {
    expect(evaluateAssurance({ ...base, policyChecks: [{ id: "BLOCK", label: "Block", severity: "block", passed: false, detail: "" }] }).verdict).toBe("NO-GO");
    expect(evaluateAssurance({ ...base, issuerCertificate: { verdict: "no-go", ledgerIndex: 100 } as never }).verdict).toBe("NO-GO");
  });
  it("blocks insufficient depth and slippage", () => {
    expect(evaluateAssurance({ ...base, exitFill: { ...base.exitFill!, filled: 50 } }).verdict).toBe("NO-GO");
    expect(evaluateAssurance({ ...base, exitFill: { ...base.exitFill!, slippageBps: 100 } }).verdict).toBe("NO-GO");
  });
  it("never passes unknown liquidity", () => {
    expect(evaluateAssurance({ ...base, exitFill: { ...base.exitFill!, slippageBps: undefined } }).verdict).toBe("HOLD");
  });
});
