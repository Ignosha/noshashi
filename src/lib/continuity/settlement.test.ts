import { describe, expect, it } from "vitest";
import { evaluateSettlement, type SettlementEvidence } from "./settlement";
import type { ContinuityIntent } from "./intent";
const account = "rrrrrrrrrrrrrrrrrrrrrhoLvTp";
const intent: ContinuityIntent = {
  schema: "noshashi.continuity.intent.v1", network: "xrpl-mainnet",
  tenantId: "bank", requestId: "req", transactionType: "Payment",
  sourceAccount: account, destinationAccount: account,
  asset: { currency: "XRP", issuer: null }, amount: "1000000",
  destinationTag: null, lastLedgerSequence: 200, signingPayloadSha256: "a".repeat(64),
};
const evidence: SettlementEvidence = {
  ledgerIndex: 190, validated: true, sourceAccount: account, destinationAccount: account,
  sourceExists: true, destinationExists: true, sourceSequence: 1,
  sourceSpendableDrops: "2000000", estimatedFeeDrops: "12",
  destinationTagRequired: false, trustLineAuthorized: null,
  trustLineFrozen: null, issuerGlobalFreeze: null,
};
describe("Continuity settlement checks", () => {
  it("checks an XRP payment with complete evidence", () => {
    expect(evaluateSettlement(intent, evidence)).toEqual({ verdict: "GO", reasons: [], evidenceComplete: true });
  });
  it("holds on absent or unvalidated evidence", () => {
    expect(evaluateSettlement(intent, null).verdict).toBe("HOLD");
    expect(evaluateSettlement(intent, { ...evidence, validated: false }).verdict).toBe("HOLD");
    expect(evaluateSettlement(intent, { ...evidence, destinationExists: null }).verdict).toBe("HOLD");
  });
  it("blocks insufficient spendable XRP and missing required tags", () => {
    expect(evaluateSettlement(intent, { ...evidence, sourceSpendableDrops: "1000000" }).verdict).toBe("NO-GO");
    expect(evaluateSettlement(intent, { ...evidence, destinationTagRequired: true }).verdict).toBe("NO-GO");
  });
  it("does not assume an unfunded destination is safe", () => {
    expect(evaluateSettlement(intent, { ...evidence, destinationExists: false }).verdict).toBe("HOLD");
  });
  it("holds issued-asset transactions until all asset checks exist", () => {
    const issued = { ...intent, asset: { currency: "USD", issuer: account }, amount: "10" };
    expect(evaluateSettlement(issued, evidence).verdict).toBe("HOLD");
  });
  it("blocks frozen issued assets", () => {
    const issued = { ...intent, asset: { currency: "USD", issuer: account }, amount: "10" };
    expect(evaluateSettlement(issued, { ...evidence, trustLineAuthorized: true, trustLineFrozen: true, issuerGlobalFreeze: false }).verdict).toBe("NO-GO");
  });
});
