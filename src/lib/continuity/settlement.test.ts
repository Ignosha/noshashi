import { describe, expect, it } from "vitest";
import { evaluateSettlement, type SettlementEvidence } from "./settlement";
import type { ContinuityIntent } from "./intent";
import { XRPL_RLUSD } from "./rlusd";
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
    expect(evaluateSettlement(intent, { ...evidence, sourceExists: null }).verdict).toBe("HOLD");
    expect(evaluateSettlement(intent, { ...evidence, validated: false }).verdict).toBe("HOLD");
    expect(evaluateSettlement(intent, { ...evidence, destinationExists: null }).verdict).toBe("HOLD");
  });
  it("blocks insufficient spendable XRP and missing required tags", () => {
    expect(evaluateSettlement(intent, { ...evidence, sourceSpendableDrops: "1000000" }).verdict).toBe("NO-GO");
    expect(evaluateSettlement(intent, { ...evidence, destinationTagRequired: true }).verdict).toBe("NO-GO");
  });
  it.each([
    { validated: false },
    { ledgerIndex: intent.lastLedgerSequence },
    { destinationAccount: "rDifferentAccount" },
    { sourceAccount: "rDifferentAccount" },
  ])("withholds a negative result from unbound evidence %j", (override) => {
    const result = evaluateSettlement(intent, {
      ...evidence, ...override, destinationTagRequired: true, sourceSpendableDrops: "0",
    });
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons).not.toContain("DESTINATION_TAG_REQUIRED");
    expect(result.reasons).not.toContain("INSUFFICIENT_SPENDABLE_XRP");
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

describe("Continuity RLUSD settlement observations", () => {
  const recipient = "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
  const payment = { ...intent, asset: { issuer: XRPL_RLUSD.issuer, currency: XRPL_RLUSD.currency },
    destinationAccount: recipient, amount: "10" };
  const clear = {
    issuerAuthorized: false, issuerFrozen: false, holderFrozen: false,
    issuerDeepFrozen: false, holderDeepFrozen: false,
  };
  const controls = {
    ledgerHash: "a".repeat(64), asset: XRPL_RLUSD, issuerRequireAuth: false, issuerGlobalFreeze: false,
    sourceLine: clear, destinationLine: clear,
  };
  const snapshot = { ...evidence, destinationAccount: recipient, rlusd: controls };

  it("holds even when observed controls are clear and no authorization flag is required", () => {
    expect(evaluateSettlement(payment, snapshot)).toEqual({
      verdict: "HOLD", reasons: ["ISSUED_ASSET_SETTLEMENT_CHECKS_INCOMPLETE"], evidenceComplete: false,
    });
  });

  it("holds when trust-line evidence is unavailable", () => {
    const result = evaluateSettlement(payment, { ...snapshot, rlusd: { ...controls, destinationLine: null } });
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons).toContain("RLUSD_DESTINATION_TRUST_LINE_UNKNOWN");
  });

  it("observes authorization only when required and blocks an unauthorized destination", () => {
    const result = evaluateSettlement(payment, { ...snapshot, rlusd: {
      ...controls, issuerRequireAuth: true, sourceLine: { ...clear, issuerAuthorized: true },
    } });
    expect(result.verdict).toBe("NO-GO");
    expect(result.reasons).toContain("RLUSD_DESTINATION_UNAUTHORIZED");
    expect(result.reasons).not.toContain("RLUSD_SOURCE_UNAUTHORIZED");
  });

  it("blocks a confirmed issuer global freeze when a trust line is unavailable", () => {
    const result = evaluateSettlement(payment, { ...snapshot, rlusd: {
      ...controls, issuerGlobalFreeze: true, sourceLine: null,
    } });
    expect(result.verdict).toBe("NO-GO");
    expect(result.reasons).toContain("RLUSD_ISSUER_GLOBAL_FREEZE");
    expect(result.evidenceComplete).toBe(false);
  });

  it("handles directional individual freeze without treating every flag as a block", () => {
    const observed = { ...snapshot, rlusd: { ...controls,
      sourceLine: { ...clear, holderFrozen: true }, destinationLine: { ...clear, issuerFrozen: true },
    } };
    expect(evaluateSettlement(payment, observed).verdict).toBe("HOLD");
    const blocked = { ...snapshot, rlusd: { ...controls,
      sourceLine: { ...clear, issuerFrozen: true }, destinationLine: { ...clear, holderFrozen: true },
    } };
    expect(evaluateSettlement(payment, blocked).reasons).toEqual(expect.arrayContaining([
      "RLUSD_SOURCE_FROZEN_BY_ISSUER", "RLUSD_DESTINATION_FROZEN_BY_HOLDER",
    ]));
  });

  it("blocks deep freeze on either side of either holder line", () => {
    const result = evaluateSettlement(payment, { ...snapshot, rlusd: { ...controls,
      sourceLine: { ...clear, holderDeepFrozen: true }, destinationLine: { ...clear, issuerDeepFrozen: true },
    } });
    expect(result.verdict).toBe("NO-GO");
    expect(result.reasons).toEqual(expect.arrayContaining(["RLUSD_SOURCE_DEEP_FROZEN", "RLUSD_DESTINATION_DEEP_FROZEN"]));
  });

  it("does not apply holder-to-holder restrictions to direct issuer transfers", () => {
    const direct = { ...payment, destinationAccount: XRPL_RLUSD.issuer };
    const result = evaluateSettlement(direct, { ...snapshot, destinationAccount: XRPL_RLUSD.issuer,
      rlusd: { ...controls, issuerGlobalFreeze: true } });
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons).toContain("RLUSD_PAYMENT_ROUTE_NOT_EVALUATED");
  });

  it.each([
    { currency: "RLUSD", issuer: XRPL_RLUSD.issuer },
    { currency: XRPL_RLUSD.currency, issuer: account },
  ])("does not attribute genuine RLUSD controls to an unverified asset %j", (asset) => {
    const result = evaluateSettlement({ ...payment, asset }, { ...snapshot, rlusd: { ...controls, issuerGlobalFreeze: true } });
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons).toContain("RLUSD_ASSET_IDENTITY_UNVERIFIED");
  });
});
