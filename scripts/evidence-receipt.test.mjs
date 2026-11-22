import { test } from "node:test";
import assert from "node:assert/strict";
import { createEvidenceReceipt, verifyEvidenceReceipt, canonicalEvidence } from "./evidence-receipt.mjs";
const report = {
  schema:"noshashi.autopsy.v1", network:"xrpl-mainnet",
  hash:"A".repeat(64), status:"VERIFIED_FACT", validated:true,
  ledgerIndex:12345, ledgerHash:"B".repeat(64), resultCode:"tesSUCCESS",
  disposition:"SUCCESS", reasonCodes:[], evidenceSources:["InFTF","Honeycluster"],
  provenance:"two-rpc-providers",simulated:false,
};
test("stable digest survives JSON key order changes",()=>{
  const receipt=createEvidenceReceipt(report);
  assert.equal(receipt.signed,false);
  assert.equal(receipt.independentlyAuthenticated,false);
  assert.equal(verifyEvidenceReceipt(receipt),true);
  const reversed=Object.fromEntries(Object.entries(report).reverse());
  assert.equal(createEvidenceReceipt(reversed).evidenceDigest,receipt.evidenceDigest);
});
test("modification breaks digest verification",()=>{
  const receipt=createEvidenceReceipt(report);
  assert.equal(verifyEvidenceReceipt({...receipt,evidence:{...receipt.evidence,resultCode:"tecNO_DST"}}),false);
  assert.equal(verifyEvidenceReceipt({...receipt,evidenceDigest:"0".repeat(64)}),false);
});
test("UNKNOWN, simulated and unvalidated reports cannot be packaged as verified receipts",()=>{
  assert.throws(()=>createEvidenceReceipt({...report,status:"UNKNOWN"}),/INSUFFICIENT/);
  assert.throws(()=>createEvidenceReceipt({...report,simulated:true}),/INSUFFICIENT/);
  assert.throws(()=>createEvidenceReceipt({...report,validated:false}),/INSUFFICIENT/);
  assert.throws(()=>createEvidenceReceipt({...report,evidenceSources:["InFTF"]}),/INSUFFICIENT/);
});
test("rejects unsupported or oversized canonical values",()=>{
  assert.throws(()=>canonicalEvidence({f:()=>{}}),/UNSUPPORTED/);
  assert.throws(()=>canonicalEvidence({f:"x".repeat(20000)}),/TOO_LARGE/);
});
