/**
 * NOSHASHI read-only institutional case-review research composition.
 * Never treats customer-provided control snapshots as authenticated evidence.
 */
import { corroborateAutopsy } from "./autopsy-gateway.mjs";
import { evaluateApprovalDrift } from "./approval-drift.mjs";
import { attestEvidenceReceipt, createEvidenceReceipt } from "./evidence-receipt.mjs";

export async function reviewInstitutionalCase(input, { lookup = corroborateAutopsy, attestationKey } = {}) {
  const base = {
    schema:"noshashi.case-review.research.v0", verdict:"HOLD",
    authorizationGranted:false, transaction:null, drift:null, receipt:null,
    reasonCodes:[], controlEvidenceAuthenticated:false, simulated:false,
  };
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).sort().join(",") !== "approved,current,hash" ||
      typeof input.hash !== "string" || !/^[a-fA-F0-9]{64}$/.test(input.hash)) {
    return {...base,reasonCodes:["INVALID_CASE_INPUT"]};
  }
  let transaction;
  try {
    transaction = await lookup(input.hash.toUpperCase());
  } catch {
    return {...base,reasonCodes:["TRANSACTION_LOOKUP_UNAVAILABLE"]};
  }
  if (!transaction || transaction.schema !== "noshashi.autopsy.v1" ||
      transaction.hash !== input.hash.toUpperCase() ||
      transaction.status !== "VERIFIED_FACT" ||
      transaction.validated !== true || transaction.simulated !== false ||
      transaction.provenance !== "two-rpc-providers") {
    return {...base,transaction:transaction ?? null,reasonCodes:["TRANSACTION_EVIDENCE_UNVERIFIED"]};
  }
  const drift = evaluateApprovalDrift(input.approved,input.current);
  if (typeof input.approved?.transactionHash !== "string" ||
      typeof input.current?.transactionHash !== "string" ||
      input.approved.transactionHash.toUpperCase() !== transaction.hash ||
      input.current.transactionHash.toUpperCase() !== transaction.hash) {
    return {...base,transaction,drift,reasonCodes:["CASE_TRANSACTION_IDENTITY_MISMATCH"]};
  }
  // The current observation must be pinned to the transaction's validated
  // ledger or a later ledger. No externally supplied snapshot is trusted as
  // authenticated by this prototype.
  if (!Number.isSafeInteger(input.current?.ledgerIndex) ||
      input.current.ledgerIndex < transaction.ledgerIndex ||
      (input.current.ledgerIndex === transaction.ledgerIndex &&
       (typeof input.current.ledgerHash !== "string" || input.current.ledgerHash.toUpperCase() !== transaction.ledgerHash))) {
    return {...base,transaction,drift,reasonCodes:["CASE_LEDGER_EVIDENCE_CONFLICT"]};
  }
  let receipt;
  try {
    receipt = createEvidenceReceipt(transaction);
  } catch {
    return {...base,transaction,drift,reasonCodes:["RECEIPT_EVIDENCE_INSUFFICIENT"]};
  }
  let evidenceAttestation;
  if (attestationKey !== undefined) {
    try {
      evidenceAttestation = attestEvidenceReceipt(receipt, attestationKey);
    } catch {
      return {...base,transaction,drift,reasonCodes:["EVIDENCE_ATTESTATION_UNAVAILABLE"]};
    }
  }
  const reasonCodes = [...drift.reasonCodes];
  if (transaction.disposition !== "SUCCESS") reasonCodes.push("TRANSACTION_NOT_SUCCESSFUL");
  // The output never grants a GO; external policy snapshots are not verified
  // and approval drift does not establish institutional signing authority.
  if (drift.verdict === "UNCHANGED" && transaction.disposition === "SUCCESS")
    reasonCodes.push("CONTROL_SNAPSHOTS_NOT_AUTHENTICATED");
  return {...base,transaction,drift,receipt,reasonCodes,...(evidenceAttestation ? {evidenceAttestation} : {})};
}
