import { canonicalJson, type IntentValue } from "./intent";
import { evaluatePreSignGate, type GateResult, type PreSignRequest, type PreSignDecision } from "./presign-gate";

/** Signed claims are authorization evidence, not proof of XRPL correctness. */
export type SignedDecisionClaims = Readonly<{
  schema: "noshashi.continuity.decision.v1";
  tenantId: string;
  keyId: string;
  verdict: "GO" | "HOLD" | "NO-GO";
  intentHash: string;
  policyHash: string;
  ledgerHash: string;
  issuedAtMs: number;
  expiresAtMs: number;
  evidenceComplete: boolean;
}>;
export type SignedDecisionEnvelope = Readonly<{
  claims: SignedDecisionClaims;
  signatureBase64: string;
}>;
export type TrustedDecisionKey = Readonly<{
  tenantId: string;
  keyId: string;
  publicKey: CryptoKey;
}>;
const hash = /^[a-f0-9]{64}$/i;
const keys = ["evidenceComplete","expiresAtMs","intentHash","issuedAtMs","keyId","ledgerHash","policyHash","schema","tenantId","verdict"];
function validClaims(c: SignedDecisionClaims): boolean {
  if (!c || typeof c !== "object" || Object.keys(c).sort().join(",") !== keys.join(",")) return false;
  if (c.schema !== "noshashi.continuity.decision.v1" || !["GO","HOLD","NO-GO"].includes(c.verdict)) return false;
  if (![c.intentHash,c.policyHash,c.ledgerHash].every(x => typeof x === "string" && hash.test(x))) return false;
  if (![c.tenantId,c.keyId].every(x => typeof x === "string" && x.length > 0 && x.length <= 128)) return false;
  if (!Number.isSafeInteger(c.issuedAtMs) || !Number.isSafeInteger(c.expiresAtMs) || c.issuedAtMs < 0 || c.expiresAtMs <= c.issuedAtMs) return false;
  return typeof c.evidenceComplete === "boolean";
}
function decodeBase64(input: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input) || input.length % 4 !== 0 || input.length > 1024) throw new Error("BAD_SIGNATURE_ENCODING");
  const bytes = Uint8Array.from(atob(input), c => c.charCodeAt(0));
  if (bytes.length !== 64) throw new Error("BAD_SIGNATURE_LENGTH");
  return bytes;
}
/**
 * The trusted key must be resolved server-side from an authenticated,
 * tenant-scoped registry. Never accept a public key supplied by the caller.
 * ECDSA P-256 / SHA-256 signature is WebCrypto raw 64-byte (r || s).
 */
export async function verifySignedDecision(
  envelope: SignedDecisionEnvelope,
  key: TrustedDecisionKey,
  tenantId: string,
): Promise<boolean> {
  try {
    const c = envelope?.claims;
    if (!validClaims(c) || c.tenantId !== tenantId || key.tenantId !== tenantId || c.keyId !== key.keyId) return false;
    if (key.publicKey.type !== "public" || key.publicKey.algorithm.name !== "ECDSA" ||
        (key.publicKey.algorithm as EcKeyAlgorithm).namedCurve !== "P-256" ||
        !key.publicKey.usages.includes("verify")) return false;
    const payload = new TextEncoder().encode("NOSHASHI_CONTINUITY_DECISION_V1\n" + canonicalJson(c as unknown as IntentValue));
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key.publicKey, decodeBase64(envelope.signatureBase64), payload);
  } catch {
    return false;
  }
}
/** Recompute the request intent hash before calling this function. */
export async function authorizeSignedDecision(
  request: PreSignRequest,
  envelope: SignedDecisionEnvelope,
  key: TrustedDecisionKey,
  tenantId: string,
): Promise<GateResult> {
  const verified = await verifySignedDecision(envelope, key, tenantId);
  if (!verified) return { allowed: false, reason: "UNVERIFIED_RECEIPT" };
  const c = envelope.claims;
  if (request.nowMs < c.issuedAtMs) return { allowed: false, reason: "INVALID_BINDING" };
  const decision: PreSignDecision = {
    verdict: c.verdict, intentHash: c.intentHash, policyHash: c.policyHash,
    ledgerHash: c.ledgerHash, expiresAtMs: c.expiresAtMs,
    receiptVerified: true, evidenceComplete: c.evidenceComplete,
  };
  return evaluatePreSignGate(request, decision);
}
