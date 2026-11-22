import { describe, expect, it } from "vitest";
import { previewContinuityTransaction } from "./preview";
import type { ContinuityIntent } from "./intent";
const account = "rrrrrrrrrrrrrrrrrrrrrhoLvTp";
const intent: ContinuityIntent = {
  schema: "noshashi.continuity.intent.v1", network: "xrpl-mainnet",
  tenantId: "tenant", requestId: "req", transactionType: "Payment",
  sourceAccount: account, destinationAccount: account,
  asset: { currency: "XRP", issuer: null }, amount: "1",
  destinationTag: null, lastLedgerSequence: 100, signingPayloadSha256: "a".repeat(64),
};
describe("Continuity read-only preview", () => {
  it("fails closed when XRPL evidence is absent", async () => {
    const result = await previewContinuityTransaction(intent, null);
    expect(result.verdict).toBe("HOLD");
    expect(result.signingAuthorized).toBe(false);
    expect(result.evidenceComplete).toBe(false);
  });
  it("never authorizes an invalid intent", async () => {
    const result = await previewContinuityTransaction({ ...intent, amount: "-1" }, null);
    expect(result.intentHash).toBeNull();
    expect(result.signingAuthorized).toBe(false);
  });
  it("never treats partial evidence as authorization", async () => {
    const result = await previewContinuityTransaction(intent, {
      policyChecks: [], issuerCertificate: null, exitFill: null,
      requiredExitAmount: null, maximumSlippageBps: null,
      validatedLedgerIndex: null, issuerLedgerIndex: null, liquidityLedgerIndex: null,
    });
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons).toContain("SETTLEMENT_AND_SOURCE_VERIFICATION_NOT_INTEGRATED");
    expect(result.signingAuthorized).toBe(false);
  });
});
