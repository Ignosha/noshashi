import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewInstitutionalCase } from "./institutional-case-review.mjs";
import { verifyEvidenceReceipt } from "./evidence-receipt.mjs";
const H="A".repeat(64), L="B".repeat(64), L2="C".repeat(64);
const report={schema:"noshashi.autopsy.v1",network:"xrpl-mainnet",hash:H,
 status:"VERIFIED_FACT",validated:true,ledgerIndex:100,ledgerHash:L,
 resultCode:"tesSUCCESS",disposition:"SUCCESS",reasonCodes:[],
 evidenceSources:["InFTF","Honeycluster"],provenance:"two-rpc-providers",simulated:false};
const approved={network:"xrpl-mainnet",transactionHash:H,ledgerIndex:99,ledgerHash:L2,
 destination:"rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY",
 destinationTagRequired:false,issuerGlobalFreeze:false,trustLineFrozen:false,
 trustLineAuthorized:true,policyVersion:"policy-1"};
const current={...approved,ledgerIndex:100,ledgerHash:L};
const input={hash:H,approved,current};
const lookup=async()=>report;
test("composes verified tx, unchanged drift and tamper-detectable receipt without GO",async()=>{
 const r=await reviewInstitutionalCase(input,{lookup});
 assert.equal(r.verdict,"HOLD");
 assert.equal(r.authorizationGranted,false);
 assert.equal(r.controlEvidenceAuthenticated,false);
 assert.equal(r.transaction.disposition,"SUCCESS");
 assert.equal(r.drift.verdict,"UNCHANGED");
 assert.equal(verifyEvidenceReceipt(r.receipt),true);
 assert.ok(r.reasonCodes.includes("CONTROL_SNAPSHOTS_NOT_AUTHENTICATED"));
});
test("material freeze drift keeps case on HOLD",async()=>{
 const r=await reviewInstitutionalCase({...input,current:{...current,issuerGlobalFreeze:true}},{lookup});
 assert.equal(r.verdict,"HOLD");
 assert.deepEqual(r.drift.reasonCodes,["MATERIAL_APPROVAL_DRIFT"]);
});
test("UNKNOWN tx evidence never creates receipt",async()=>{
 const r=await reviewInstitutionalCase(input,{lookup:async()=>({...report,status:"UNKNOWN",validated:false})});
 assert.equal(r.receipt,null);
 assert.deepEqual(r.reasonCodes,["TRANSACTION_EVIDENCE_UNVERIFIED"]);
});
test("lookup outage cannot grant approval",async()=>{
 const r=await reviewInstitutionalCase(input,{lookup:async()=>{throw Error("offline")}});
 assert.equal(r.receipt,null);
 assert.deepEqual(r.reasonCodes,["TRANSACTION_LOOKUP_UNAVAILABLE"]);
});
test("different hash and conflicting ledger are rejected",async()=>{
 const wrong=await reviewInstitutionalCase({...input,current:{...current,transactionHash:"D".repeat(64)}},{lookup});
 assert.deepEqual(wrong.reasonCodes,["CASE_TRANSACTION_IDENTITY_MISMATCH"]);
 const conflict=await reviewInstitutionalCase({...input,current:{...current,ledgerHash:"E".repeat(64)}},{lookup});
 assert.deepEqual(conflict.reasonCodes,["CASE_LEDGER_EVIDENCE_CONFLICT"]);
});
test("failed transaction gets receipt of failure but no approval",async()=>{
 const r=await reviewInstitutionalCase(input,{lookup:async()=>({...report,resultCode:"tecNO_DST",disposition:"FAILED",reasonCodes:["tecNO_DST"]})});
 assert.equal(r.verdict,"HOLD");
 assert.equal(verifyEvidenceReceipt(r.receipt),true);
 assert.ok(r.reasonCodes.includes("TRANSACTION_NOT_SUCCESSFUL"));
});
test("unrecognized case fields are rejected",async()=>{
 const r=await reviewInstitutionalCase({...input,override:true},{lookup});
 assert.deepEqual(r.reasonCodes,["INVALID_CASE_INPUT"]);
});
