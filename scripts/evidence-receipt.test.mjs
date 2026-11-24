import {createHash, generateKeyPairSync} from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { attestControlEvidence, attestEvidenceReceipt, verifyControlEvidenceAttestation, verifyEvidenceAttestation, createEvidenceReceipt, verifyEvidenceReceipt, canonicalEvidence } from "./evidence-receipt.mjs";
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

test("duplicate source labels and blank sources are rejected",()=>{
 for(const evidenceSources of [["InFTF"," inftf "],["InFTF"," "]]){
  assert.throws(()=>createEvidenceReceipt({...report,evidenceSources}),/INSUFFICIENT/);
 }
});
test("recomputed digest cannot make ineligible evidence pass verification",()=>{
 const receipt=createEvidenceReceipt(report);
 for(const changes of [{status:"UNKNOWN"},{simulated:true},{validated:false},{evidenceSources:["InFTF","InFTF"]}]){
  const evidence={...report,...changes};
  const evidenceDigest=createHash("sha256").update(canonicalEvidence(evidence)).digest("hex");
  assert.equal(verifyEvidenceReceipt({...receipt,evidence,evidenceDigest}),false);
 }
});

test("control attestation binds the pinned controls to one transaction receipt and signer", () => {
 const issuer = "r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59";
 const holder = "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
 const transaction = {...report, paymentDestination:holder, paymentAsset:{issuer,currency:"USD"}};
 const receipt = createEvidenceReceipt(transaction);
 const pinned = {status:"CORROBORATED", ledgerHash:report.ledgerHash, ledgerIndex:report.ledgerIndex};
 const controls = {
  ...pinned, schema:"noshashi.xrpl.payment-controls.research.v0", authorizationGranted:false,
  trustLineFrozen:true, evidence:{
   destination:{...pinned, account:holder}, issuer:{...pinned, account:issuer},
   trustLine:{...pinned, holder, issuer, currency:"USD"},
  },
 };
 const {publicKey, privateKey} = generateKeyPairSync("ed25519");
 const attestation = attestControlEvidence(receipt, controls, privateKey);
 assert.equal(verifyControlEvidenceAttestation(receipt, controls, attestation, publicKey), true);
 assert.equal(verifyControlEvidenceAttestation(receipt, {...controls, trustLineFrozen:false}, attestation, publicKey), false);
 assert.equal(verifyControlEvidenceAttestation(createEvidenceReceipt({...transaction, hash:"C".repeat(64)}), controls, attestation, publicKey), false);
 assert.equal(verifyControlEvidenceAttestation(receipt, controls, attestEvidenceReceipt(receipt, privateKey), publicKey), false);
 assert.equal(verifyEvidenceAttestation(receipt, attestation, publicKey), false);
 assert.throws(() => attestControlEvidence(receipt, {...controls, status:"PARTIAL_CORROBORATED"}, privateKey), /UNBOUND_CONTROL_EVIDENCE/);
 assert.throws(() => attestControlEvidence(receipt, {
  ...controls, evidence:{...controls.evidence, trustLine:{...controls.evidence.trustLine, currency:"EUR"}},
 }, privateKey), /UNBOUND_CONTROL_EVIDENCE/);
});
