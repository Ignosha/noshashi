import { describe, expect, it, vi } from "vitest";
import { lookupTransactionAutopsy } from "./autopsy-lookup";
const hash = "A".repeat(64);
describe("read-only XRPL autopsy lookup", () => {
  it("never calls RPC for an invalid hash", async () => {
    const request = vi.fn();
    await expect(lookupTransactionAutopsy("invalid", request)).rejects.toThrow("INVALID_TRANSACTION_HASH");
    expect(request).not.toHaveBeenCalled();
  });
  it("requests only the read-only tx command", async () => {
    const request = vi.fn().mockResolvedValue({ hash, validated: true, ledger_index: 100, meta: { TransactionResult: "tesSUCCESS" } });
    const result = await lookupTransactionAutopsy(hash, request);
    expect(request).toHaveBeenCalledWith("tx", { transaction: hash, binary: false });
    expect(result.disposition).toBe("SUCCESS");
  });
  it("returns UNKNOWN on network failure", async () => {
    const request = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await lookupTransactionAutopsy(hash, request)).toMatchObject({ status: "UNKNOWN", disposition: "UNKNOWN" });
  });
  it("never promotes unvalidated responses to success", async () => {
    const request = vi.fn().mockResolvedValue({ hash, validated: false, ledger_index: 100, meta: { TransactionResult: "tesSUCCESS" } });
    expect((await lookupTransactionAutopsy(hash, request)).disposition).toBe("UNKNOWN");
  });
  it("does not trust a mismatched hash", async () => {
    const request = vi.fn().mockResolvedValue({ hash: "B".repeat(64), validated: true, ledger_index: 100, meta: { TransactionResult: "tesSUCCESS" } });
    expect((await lookupTransactionAutopsy(hash, request)).reasonCodes).toContain("TRANSACTION_HASH_MISMATCH");
  });
});
