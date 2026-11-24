/**
 * NOSHASHI Evidence Receipt research format.
 * SHA-256 detects changes to a locally constructed report, but DOES NOT
 * authenticate the author or prove the underlying ledger observation.
 */
import { createHash, createPublicKey, KeyObject, sign, timingSafeEqual, verify } from "node:crypto";
import { TRUSTLINE_CORROBORATED_SCHEMA } from "./xrpl-trustline-evidence.mjs";
const HEX64 = /^[0-9A-F]{64}$/;
const MAX = 16_384;
function stable(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("UNSAFE_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "["+value.map(stable).join(",")+"]";
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return "{"+Object.keys(value).sort().map(k => JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";
  }
  throw new Error("UNSUPPORTED_EVIDENCE_VALUE");
}
export function canonicalEvidence(value) {
  const encoded = stable(value);
  if (Buffer.byteLength(encoded,"utf8") > MAX) throw new Error("EVIDENCE_TOO_LARGE");
  return encoded;
}
export function createEvidenceReceipt(report) {
  if (!report || report.schema !== "noshashi.autopsy.v1" ||
      report.status !== "VERIFIED_FACT" || report.validated !== true ||
      report.simulated !== false || typeof report.hash !== "string" ||
      !HEX64.test(report.hash) || typeof report.ledgerHash !== "string" ||
      !HEX64.test(report.ledgerHash) || !Number.isSafeInteger(report.ledgerIndex) ||
      report.ledgerIndex <= 0 || report.provenance !== "two-rpc-providers" ||
      !Array.isArray(report.evidenceSources) || report.evidenceSources.length !== 2 ||
      report.evidenceSources.some(s=>typeof s !== "string" || !s.trim()) ||
      new Set(report.evidenceSources.map(s=>s.trim().toLowerCase())).size !== 2) {
    throw new Error("INSUFFICIENT_VERIFIED_EVIDENCE");
  }
  const evidence = JSON.parse(canonicalEvidence(report));
  const digest = createHash("sha256").update(canonicalEvidence(evidence)).digest("hex");
  return {
    schema:"noshashi.evidence-receipt.research.v0",
    evidence, digestAlgorithm:"sha256", evidenceDigest:digest,
    signed:false, independentlyAuthenticated:false,
    disclaimer:"Digest checks local integrity only; no signer authentication or ledger consensus proof.",
  };
}
export function verifyEvidenceReceipt(receipt) {
  try {
    if (!receipt || receipt.schema !== "noshashi.evidence-receipt.research.v0" ||
        receipt.digestAlgorithm !== "sha256" || receipt.signed !== false ||
        receipt.independentlyAuthenticated !== false ||
        typeof receipt.evidenceDigest !== "string" || !/^[0-9a-f]{64}$/.test(receipt.evidenceDigest)) return false;
    // Reapply the same evidence eligibility checks used during creation.
    const validated = createEvidenceReceipt(receipt.evidence);
    const digest = Buffer.from(validated.evidenceDigest,"hex");
    return timingSafeEqual(digest,Buffer.from(receipt.evidenceDigest,"hex"));
  } catch { return false; }
}

// Verifiers supply the expected public key from their own trust configuration.
const ATTESTATION_SCHEMA = "noshashi.evidence-attestation.research.v0";
const CONTROLS_SCHEMA = "noshashi.control-attestation.research.v0";

function attestationKeyId(publicKey) {
  if (!(publicKey instanceof KeyObject) || publicKey.type !== "public" ||
      publicKey.asymmetricKeyType !== "ed25519") throw new Error("INVALID_ATTESTATION_PUBLIC_KEY");
  return createHash("sha256").update(publicKey.export({type:"spki", format:"der"})).digest("hex");
}

function attestationBytes(schema, keyId, evidenceDigest) {
  return Buffer.from(canonicalEvidence({
    schema, algorithm:"Ed25519", keyId, evidenceDigest,
  }));
}

function signAttestation(schema, evidenceDigest, privateKey) {
  if (!(privateKey instanceof KeyObject) || privateKey.type !== "private" ||
      privateKey.asymmetricKeyType !== "ed25519") throw new Error("INVALID_ATTESTATION_PRIVATE_KEY");
  const keyId = attestationKeyId(createPublicKey(privateKey));
  const signature = sign(null, attestationBytes(schema, keyId, evidenceDigest), privateKey).toString("base64url");
  return {schema, algorithm:"Ed25519", keyId, signature};
}

function verifyAttestation(schema, evidenceDigest, attestation, trustedPublicKey) {
  try {
    if (!attestation || Object.keys(attestation).sort().join(",") !== "algorithm,keyId,schema,signature" ||
        attestation.schema !== schema || attestation.algorithm !== "Ed25519" ||
        typeof attestation.signature !== "string" || !/^[A-Za-z0-9_-]{86}$/.test(attestation.signature)) return false;
    const keyId = attestationKeyId(trustedPublicKey);
    if (attestation.keyId !== keyId) return false;
    const signature = Buffer.from(attestation.signature, "base64url");
    return signature.toString("base64url") === attestation.signature &&
      verify(null, attestationBytes(schema, keyId, evidenceDigest), trustedPublicKey, signature);
  } catch { return false; }
}

export function attestEvidenceReceipt(receipt, privateKey) {
  if (!verifyEvidenceReceipt(receipt)) throw new Error("INVALID_EVIDENCE_RECEIPT");
  return signAttestation(ATTESTATION_SCHEMA, receipt.evidenceDigest, privateKey);
}

export function verifyEvidenceAttestation(receipt, attestation, trustedPublicKey) {
  return verifyEvidenceReceipt(receipt) &&
    verifyAttestation(ATTESTATION_SCHEMA, receipt.evidenceDigest, attestation, trustedPublicKey);
}

function controlEvidenceDigest(receipt, controls) {
  if (!verifyEvidenceReceipt(receipt)) throw new Error("INVALID_EVIDENCE_RECEIPT");
  const tx = receipt.evidence;
  const source = controls?.evidence;
  const asset = tx.paymentAsset;
  const pinned = [source?.destination, source?.issuer, source?.trustLine].every(observation =>
    observation?.status === "CORROBORATED" &&
    observation.ledgerHash === tx.ledgerHash && observation.ledgerIndex === tx.ledgerIndex);
  if (controls?.schema !== "noshashi.xrpl.payment-controls.research.v0" ||
      controls.status !== "CORROBORATED" || controls.authorizationGranted !== false ||
      controls.ledgerHash !== tx.ledgerHash || controls.ledgerIndex !== tx.ledgerIndex ||
      tx.disposition !== "SUCCESS" || !tx.paymentDestination || !asset || !pinned ||
      source.destination.account !== tx.paymentDestination || source.issuer.account !== asset.issuer ||
      source.trustLine.schema !== TRUSTLINE_CORROBORATED_SCHEMA ||
      source.trustLine.holder !== tx.paymentDestination || source.trustLine.issuer !== asset.issuer ||
      source.trustLine.currency !== asset.currency) throw new Error("UNBOUND_CONTROL_EVIDENCE");
  const flagPairs = [
    [controls.requireDestinationTag, source.destination.requireDestinationTag],
    [controls.issuerGlobalFreeze, source.issuer.globalFreeze],
    [controls.issuerRequireAuth, source.issuer.requireAuth],
    [controls.trustLineFrozen, source.trustLine.trustLineFrozen],
    [controls.trustLineAuthorized, source.trustLine.trustLineAuthorized],
  ];
  if (flagPairs.some(([summary, observation]) =>
      typeof summary !== "boolean" || summary !== observation) ||
      typeof controls.issuerAuthorizationConditionMet !== "boolean" ||
      controls.issuerAuthorizationConditionMet !==
        (!controls.issuerRequireAuth || controls.trustLineAuthorized)) {
    throw new Error("INCONSISTENT_CONTROL_EVIDENCE");
  }
  return createHash("sha256").update(canonicalEvidence({transactionDigest:receipt.evidenceDigest, controls})).digest("hex");
}

export function attestControlEvidence(receipt, controls, privateKey) {
  return signAttestation(CONTROLS_SCHEMA, controlEvidenceDigest(receipt, controls), privateKey);
}

export function verifyControlEvidenceAttestation(receipt, controls, attestation, trustedPublicKey) {
  try {
    return verifyAttestation(CONTROLS_SCHEMA, controlEvidenceDigest(receipt, controls), attestation, trustedPublicKey);
  } catch { return false; }
}
