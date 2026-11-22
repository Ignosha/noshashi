/**
 * NOSHASHI Approval Drift — deterministic research evaluator, NO live approval.
 * Two pinned XRPL observations + customer-supplied policy snapshot. This does not
 * fetch evidence, authenticate approvers, or sign/submit any transaction.
 */
const HEX64 = /^[A-F0-9]{64}$/i;
const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const MAX_POLICY = 128;
const keys = ["network","transactionHash","ledgerIndex","ledgerHash","destination","destinationTagRequired","issuerGlobalFreeze","trustLineFrozen","trustLineAuthorized","policyVersion"];
function valid(o) {
  return !!o && typeof o === "object" && !Array.isArray(o) &&
    Object.keys(o).sort().join(",") === [...keys].sort().join(",") &&
    o.network === "xrpl-mainnet" &&
    typeof o.transactionHash === "string" && HEX64.test(o.transactionHash) &&
    Number.isSafeInteger(o.ledgerIndex) && o.ledgerIndex > 0 &&
    typeof o.ledgerHash === "string" && HEX64.test(o.ledgerHash) &&
    typeof o.destination === "string" && ADDRESS.test(o.destination) &&
    [true,false,null].includes(o.destinationTagRequired) &&
    [true,false,null].includes(o.issuerGlobalFreeze) &&
    [true,false,null].includes(o.trustLineFrozen) &&
    [true,false,null].includes(o.trustLineAuthorized) &&
    typeof o.policyVersion === "string" && o.policyVersion.length > 0 &&
    o.policyVersion.length <= MAX_POLICY && /^[a-zA-Z0-9_.:-]+$/.test(o.policyVersion);
}
const watched = ["destinationTagRequired","issuerGlobalFreeze","trustLineFrozen","trustLineAuthorized","policyVersion"];
const critical = new Set(["issuerGlobalFreeze","trustLineFrozen","trustLineAuthorized","policyVersion"]);
export function evaluateApprovalDrift(approved, current) {
  const base = { schema:"noshashi.approval-drift.v0", network:"xrpl-mainnet",
    verdict:"HOLD", approvalValid:false, changedFields:[], reasonCodes:[],
    simulated:false, authorizationGranted:false };
  if (!valid(approved) || !valid(current)) return {...base,reasonCodes:["EVIDENCE_SCHEMA_INVALID"]};
  if (approved.transactionHash.toUpperCase() !== current.transactionHash.toUpperCase() ||
      approved.destination !== current.destination) return {...base,reasonCodes:["INTENT_IDENTITY_MISMATCH"]};
  if (current.ledgerIndex < approved.ledgerIndex) return {...base,reasonCodes:["LEDGER_REGRESSION"]};
  if (current.ledgerIndex === approved.ledgerIndex &&
      current.ledgerHash.toUpperCase() !== approved.ledgerHash.toUpperCase())
    return {...base,reasonCodes:["LEDGER_HASH_CONFLICT"]};
  const changes = watched.filter(k => approved[k] !== current[k]);
  const unknown = watched.filter(k => approved[k] === null || current[k] === null);
  if (unknown.length) return {...base,changedFields:changes,reasonCodes:["CONTROL_EVIDENCE_UNKNOWN"]};
  if (changes.length) return {...base,changedFields:changes,
    reasonCodes:changes.some(k=>critical.has(k))?["MATERIAL_APPROVAL_DRIFT"]:["APPROVAL_DRIFT_REVIEW_REQUIRED"]};
  // Even unchanged evidence cannot grant signing authorization: human and
  // institutional controls, source attestation and custody gate are external.
  return {...base,verdict:"UNCHANGED",approvalValid:false,reasonCodes:["EXTERNAL_APPROVAL_REQUIRED"]};
}
