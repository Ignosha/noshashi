import { describe, expect, it } from "vitest";
import { canonicalJson, hashContinuityIntent, validateContinuityIntent, type ContinuityIntent } from "./intent";
const account = "rrrrrrrrrrrrrrrrrrrrrhoLvTp";
const intent: ContinuityIntent = {
  schema: "noshashi.continuity.intent.v1", network: "xrpl-mainnet",
  tenantId: "bank-1", requestId: "req-1", transactionType: "Payment",
  sourceAccount: account, destinationAccount: account,
  asset: { currency: "XRP", issuer: null }, amount: "100",
  destinationTag: 0, lastLedgerSequence: 100,
  signingPayloadSha256: "a".repeat(64),
};
describe("Continuity intent commitment", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalJson({ z: 1, a: { y: true, b: "x" } })).toBe('{"a":{"b":"x","y":true},"z":1}');
  });
  it("rejects values that would be lost or rounded", () => {
    expect(() => canonicalJson({ a: undefined } as never)).toThrow();
    expect(() => canonicalJson({ a: 1.2 })).toThrow();
  });
  it("is stable under property ordering and sensitive to intent changes", async () => {
    const baseline = await hashContinuityIntent(intent);
    expect(baseline).toMatch(/^[0-9a-f]{64}$/);
    const reordered = Object.fromEntries(Object.entries(intent).reverse()) as unknown as ContinuityIntent;
    expect(await hashContinuityIntent(reordered)).toBe(baseline);
    expect(await hashContinuityIntent({ ...intent, amount: "101" })).not.toBe(baseline);
    expect(await hashContinuityIntent({ ...intent, signingPayloadSha256: "b".repeat(64) })).not.toBe(baseline);
  });
  it("rejects missing or unknown fields and invalid values", () => {
    expect(() => validateContinuityIntent({ ...intent, amount: "1e3" })).toThrow();
    expect(() => validateContinuityIntent({ ...intent, destinationTag: -1 })).toThrow();
    expect(() => validateContinuityIntent({ ...intent, extra: "x" } as never)).toThrow();
    expect(() => validateContinuityIntent({ ...intent, asset: { currency: "USD", issuer: null } })).toThrow();
  });
  it("rejects malformed imports before any string coercion", () => {
    expect(() => validateContinuityIntent(null)).toThrow("INVALID_INTENT");
    expect(() => validateContinuityIntent([intent])).toThrow("INVALID_INTENT");
    expect(() => validateContinuityIntent({ ...intent, amount: 100 })).toThrow("INVALID_AMOUNT");
    expect(() => validateContinuityIntent({ ...intent, sourceAccount: [account] })).toThrow("INVALID_ACCOUNT");
    expect(() => validateContinuityIntent({ ...intent, asset: { currency: ["XRP"], issuer: null } })).toThrow("INVALID_ASSET");
    expect(() => validateContinuityIntent({ ...intent, signingPayloadSha256: [intent.signingPayloadSha256] })).toThrow("INVALID_SIGNING_PAYLOAD_HASH");
  });
});
