/**
 * NOSHASHI Evidence Receipt research format.
 * SHA-256 detects changes to a locally constructed report, but DOES NOT
 * authenticate the author or prove the underlying ledger observation.
 */
import { createHash, timingSafeEqual } from "node:crypto";
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
      report.evidenceSources.some(s=>typeof s !== "string" || !s)) {
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
    const digest = createHash("sha256").update(canonicalEvidence(receipt.evidence)).digest();
    return timingSafeEqual(digest,Buffer.from(receipt.evidenceDigest,"hex"));
  } catch { return false; }
}
