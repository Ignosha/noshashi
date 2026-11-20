import { describe, expect, it } from "vitest";
import {
  reviewBridge,
  reviewLending,
} from "../src/lib/continuity/portfolio.ts";
import {
  bridgeSample,
  lendingSample,
} from "../src/lib/continuity/portfolioSamples.ts";
import { amountText, amountUnits } from "../src/lib/continuity/amounts.ts";
const copy = (value) => structuredClone(value);

describe("exact operational amounts", () => {
  it("preserves tiny and large values", () => {
    expect(amountText(amountUnits("1e-96"))).toBe("0." + "0".repeat(95) + "1");
    expect(amountText(amountUnits("9007199254740993.000000000000001"))).toBe(
      "9007199254740993.000000000000001",
    );
    expect(() => amountUnits("1e999")).toThrow();
    expect(() => amountUnits("-1")).toThrow();
  });
});
describe("bridge record reconciliation", () => {
  it("finds a credit that exceeds the destination receipt", () =>
    expect(reviewBridge(bridgeSample).reasons).toContain(
      "Accounting credit amount mismatch",
    ));
  it("reconciles a complete, matched record set", () => {
    const value = copy(bridgeSample);
    value.credits[0].amount = "995";
    expect(reviewBridge(value).outcome).toBe("Supplied records reconcile");
  });
  it("matches EVM address casing without folding other identity formats", () => {
    const value = copy(bridgeSample);
    value.credits[0].amount = "995";
    value.route.destinationAccount = "0x" + "AB".repeat(20);
    value.receipt.account = value.route.destinationAccount.toLowerCase();
    value.route.destinationAssetId = "0x" + "CD".repeat(20);
    value.receipt.assetId = value.route.destinationAssetId.toLowerCase();
    value.credits[0].assetId = value.route.destinationAssetId;
    expect(reviewBridge(value).outcome).toBe("Supplied records reconcile");
  });
  it("retains missing coverage and flags duplicate credits", () => {
    const value = copy(bridgeSample);
    value.creditExportComplete = false;
    value.credits.push(value.credits[0]);
    expect(reviewBridge(value).reasons).toEqual(
      expect.arrayContaining([
        "Accounting export coverage unconfirmed",
        "Multiple credits supplied for this transfer",
      ]),
    );
  });
  it("checks network, account, asset and message identity independently", () => {
    const value = copy(bridgeSample);
    Object.assign(value.receipt, {
      network: "other",
      account: "other",
      assetId: "other",
      messageId: "other",
    });
    expect(reviewBridge(value).reasons).toEqual(
      expect.arrayContaining([
        "Destination network mismatch",
        "Destination account mismatch",
        "Destination asset identity mismatch",
        "Bridge message identifier mismatch",
      ]),
    );
  });
  it("keeps confirmation and missing-receipt cases unresolved", () => {
    const value = copy(bridgeSample);
    value.receipt = null;
    expect(reviewBridge(value).outcome).toBe("Review required");
    value.source.status = "pending";
    expect(reviewBridge(value).reasons).toContain(
      "Source or bridge confirmation outstanding",
    );
  });
});
describe("borrower concentration", () => {
  it("aggregates multiple wallets for the same declared borrower", () => {
    expect(reviewLending(lendingSample)).toMatchObject({
      existing: "200000",
      proposed: "300000",
      remainingUnderLimit: "50000",
      exceeds: true,
      covered: true,
    });
  });
  it("accepts the exact policy boundary", () => {
    const value = copy(lendingSample);
    value.requested = "50000";
    expect(reviewLending(value).exceeds).toBe(false);
  });
  it("preserves incomplete mappings even when known exposure exceeds the limit", () => {
    const value = copy(lendingSample);
    value.loans.push({ ...value.loans[0], loanId: "unknown", entityId: null });
    expect(reviewLending(value)).toMatchObject({
      covered: false,
      exceeds: true,
      unmapped: 1,
    });
  });
  it("rejects duplicate loans, mixed assets and conflicting mappings", () => {
    const duplicate = copy(lendingSample);
    duplicate.loans.push(duplicate.loans[0]);
    expect(() => reviewLending(duplicate)).toThrow(/Duplicate/);
    const mixed = copy(lendingSample);
    mixed.loans[0].assetId = "other";
    expect(() => reviewLending(mixed)).toThrow(/one exact asset/);
    const conflict = copy(lendingSample);
    conflict.loans[1].address = conflict.loans[0].address;
    conflict.loans[1].entityId = "Other";
    expect(() => reviewLending(conflict)).toThrow(/conflicting/);
  });
  it("does not round a small breach into a passing limit", () => {
    const value = copy(lendingSample);
    value.portfolioValue = "1";
    value.maximumShareBps = 3000;
    value.loans[0].outstanding = "0.1";
    value.loans[1].outstanding = "0.2";
    value.requested = "1e-96";
    expect(reviewLending(value).exceeds).toBe(true);
  });
});
