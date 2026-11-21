import { describe, expect, it } from "vitest";
import { canonicalJson, type IntentValue } from "./intent";
import { authorizeSignedDecision, verifySignedDecision, type SignedDecisionClaims } from "./signed-decision";
const claims: SignedDecisionClaims = {
  schema: "noshashi.continuity.decision.v1", tenantId: "bank-a", keyId: "key-1",
  verdict: "GO", intentHash: "a".repeat(64), policyHash: "b".repeat(64),
  ledgerHash: "c".repeat(64), issuedAtMs: 1000, expiresAtMs: 2000,
  evidenceComplete: true,
};
const base64 = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""));
describe("Continuity signed decision verification", () => {
  it("accepts only a valid signature for the right tenant and intent", async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const payload = new TextEncoder().encode("NOSHASHI_CONTINUITY_DECISION_V1\n" + canonicalJson(claims as unknown as IntentValue));
    const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, payload));
    const envelope = { claims, signatureBase64: base64(signature) };
    const key = { tenantId: "bank-a", keyId: "key-1", publicKey: pair.publicKey };
    expect(await verifySignedDecision(envelope, key, "bank-a")).toBe(true);
    const request = { intentHash: claims.intentHash, policyHash: claims.policyHash, ledgerHash: claims.ledgerHash, nowMs: 1500 };
    expect((await authorizeSignedDecision(request, envelope, key, "bank-a")).allowed).toBe(true);
    expect((await authorizeSignedDecision({ ...request, intentHash: "d".repeat(64) }, envelope, key, "bank-a")).allowed).toBe(false);
    expect((await authorizeSignedDecision({ ...request, nowMs: 2000 }, envelope, key, "bank-a")).allowed).toBe(false);
    expect((await authorizeSignedDecision({ ...request, nowMs: 999 }, envelope, key, "bank-a")).allowed).toBe(false);
    expect(await verifySignedDecision(envelope, key, "bank-b")).toBe(false);
    expect(await verifySignedDecision({ ...envelope, claims: { ...claims, verdict: "HOLD" } }, key, "bank-a")).toBe(false);
    expect(await verifySignedDecision({ ...envelope, signatureBase64: "bad" }, key, "bank-a")).toBe(false);
    expect(await verifySignedDecision({ ...envelope, claims: { ...claims, extra: "x" } as never }, key, "bank-a")).toBe(false);
  });
});
