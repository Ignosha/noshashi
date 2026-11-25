import { describe, expect, it } from "vitest";
import archive from "../continuity/demo/solo-mainnet-107585451.json";
import { archivedRlusdIssuer, reviewArchivedPayment, rehearseWalletHandoff, rlusd, verifyDemoReceipt } from "../continuity/demo/evidence.ts";

describe("Continuity demonstration", () => {
  it("reviews the two archived reports, withholding settlement without an invoice", async () => {
    const { report, receipt } = await reviewArchivedPayment();
    expect(report).toMatchObject({
      status: "HOLD",
      reason_code: "NO_INVOICE_POLICY",
      validated: true,
      transaction_result: "tesSUCCESS",
      ledger_index: 107585451,
      requested_amount: { value: "0.067791435856414" },
      delivered_amount: { value: "0.067791435856414" },
      sources: ["InFTF", "Honeycluster"],
    });
    expect(receipt.evidence).toMatchObject({ type: "historical-replay", destinationTagRequired: false });
    expect(await verifyDemoReceipt(receipt)).toBe(true);
    expect(await verifyDemoReceipt({ ...receipt, evidence: { ...receipt.evidence, destinationTagRequired: true } })).toBe(false);
  });

  it("rejects a mixed ledger, mismatched source and conflicting payment", async () => {
    const wrongLedger = structuredClone(archive.records);
    wrongLedger[1].account_info.result.ledger_hash = "F".repeat(64);
    await expect(reviewArchivedPayment(wrongLedger)).rejects.toThrow("same validated ledger");

    const duplicate = [archive.records[0], archive.records[0]];
    await expect(reviewArchivedPayment(duplicate)).rejects.toThrow("distinct archived RPC");

    const conflicting = structuredClone(archive.records);
    conflicting[1].tx.result.meta.delivered_amount.value = "1";
    await expect(reviewArchivedPayment(conflicting)).rejects.toThrow("expected historical SOLO payment");
  });

  it("keeps the archived issuer snapshot distinct from the simulated payment", async () => {
    expect(rlusd.issuer).toBe("rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De");
    expect(archivedRlusdIssuer()).toMatchObject({ ledgerIndex: 107586974, powers: { globalFreeze: false, requireAuth: false } });
    const prior = await rehearseWalletHandoff(false);
    const current = await rehearseWalletHandoff(true);
    expect(prior).toMatchObject({ simulated: true, verdict: "HOLD", signingAuthorized: false });
    expect(current).toMatchObject({ simulated: true, verdict: "NO-GO", signingAuthorized: false });
    expect(current.reasons).toContain("DESTINATION_TAG_REQUIRED");
    expect(current.intentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(current.intentHash).toBe(prior.intentHash);
  });
});
