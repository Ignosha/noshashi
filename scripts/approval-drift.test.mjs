import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateApprovalDrift } from "./approval-drift.mjs";
const before = {
  network:"xrpl-mainnet", transactionHash:"A".repeat(64),
  ledgerIndex:100, ledgerHash:"B".repeat(64),
  destination:"rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY",
  destinationTagRequired:false, issuerGlobalFreeze:false,
  trustLineFrozen:false, trustLineAuthorized:true, policyVersion:"policy-1",
};
const after = {...before, ledgerIndex:101, ledgerHash:"C".repeat(64)};
test("unchanged evidence never authorizes a transaction",()=>{
  const r=evaluateApprovalDrift(before,after);
  assert.equal(r.verdict,"UNCHANGED");
  assert.equal(r.authorizationGranted,false);
  assert.equal(r.approvalValid,false);
  assert.deepEqual(r.reasonCodes,["EXTERNAL_APPROVAL_REQUIRED"]);
});
test("freeze introduced after approval forces HOLD",()=>{
  const r=evaluateApprovalDrift(before,{...after,issuerGlobalFreeze:true});
  assert.equal(r.verdict,"HOLD");
  assert.deepEqual(r.changedFields,["issuerGlobalFreeze"]);
  assert.deepEqual(r.reasonCodes,["MATERIAL_APPROVAL_DRIFT"]);
});
test("policy version change forces HOLD",()=>{
  const r=evaluateApprovalDrift(before,{...after,policyVersion:"policy-2"});
  assert.equal(r.verdict,"HOLD");
  assert.deepEqual(r.reasonCodes,["MATERIAL_APPROVAL_DRIFT"]);
});
test("tag requirement change forces manual re-review",()=>{
  const r=evaluateApprovalDrift(before,{...after,destinationTagRequired:true});
  assert.equal(r.verdict,"HOLD");
  assert.deepEqual(r.reasonCodes,["APPROVAL_DRIFT_REVIEW_REQUIRED"]);
});
test("unknown freeze evidence cannot imply safety",()=>{
  const r=evaluateApprovalDrift(before,{...after,issuerGlobalFreeze:null});
  assert.equal(r.verdict,"HOLD");
  assert.deepEqual(r.reasonCodes,["CONTROL_EVIDENCE_UNKNOWN"]);
});
test("invalid, mismatched, or regressed evidence fails closed",()=>{
  assert.deepEqual(evaluateApprovalDrift(before,{...after,ledgerIndex:99}).reasonCodes,["LEDGER_REGRESSION"]);
  assert.deepEqual(evaluateApprovalDrift(before,{...before,ledgerHash:"D".repeat(64)}).reasonCodes,["LEDGER_HASH_CONFLICT"]);
  assert.deepEqual(evaluateApprovalDrift(before,{...after,transactionHash:"E".repeat(64)}).reasonCodes,["INTENT_IDENTITY_MISMATCH"]);
  assert.deepEqual(evaluateApprovalDrift(before,{...after,untrusted:"anything"}).reasonCodes,["EVIDENCE_SCHEMA_INVALID"]);
});
