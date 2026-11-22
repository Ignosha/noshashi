import { describe, expect, it } from "vitest";
import { normalizeAutopsy } from "./autopsy";
const hash = "A".repeat(64);
const valid = { hash, validated: true, ledger_index: 100, meta: { TransactionResult: "tesSUCCESS" } };
describe("XRPL transaction autopsy normalization", () => {
  it("rejects malformed hashes", () => {
    expect(() => normalizeAutopsy("bad", valid)).toThrow("INVALID_TRANSACTION_HASH");
  });
  it("holds when evidence is missing", () => {
    expect(normalizeAutopsy(hash, null)).toMatchObject({ status: "UNKNOWN", disposition: "UNKNOWN", reasonCodes: ["TRANSACTION_EVIDENCE_MISSING"] });
  });
  it("rejects a different transaction hash", () => {
    expect(normalizeAutopsy(hash, { ...valid, hash: "B".repeat(64) }).reasonCodes).toContain("TRANSACTION_HASH_MISMATCH");
  });
  it("never treats unvalidated results as final", () => {
    expect(normalizeAutopsy(hash, { ...valid, validated: false }).disposition).toBe("UNKNOWN");
  });
  it("rejects missing ledger metadata", () => {
    expect(normalizeAutopsy(hash, { ...valid, ledger_index: undefined }).status).toBe("UNKNOWN");
    expect(normalizeAutopsy(hash, { ...valid, meta: null }).status).toBe("UNKNOWN");
  });
  it("normalizes validated success", () => {
    expect(normalizeAutopsy(hash, valid)).toMatchObject({ status: "VERIFIED_FACT", disposition: "SUCCESS", resultCode: "tesSUCCESS" });
  });
  it("normalizes validated failure without calling it success", () => {
    expect(normalizeAutopsy(hash, { ...valid, meta: { TransactionResult: "tecNO_DST" } })).toMatchObject({ disposition: "FAILED", reasonCodes: ["tecNO_DST"] });
  });
});
