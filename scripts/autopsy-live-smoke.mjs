/**
 * On-demand verification against two independent XRPL RPC services.
 * Strict by design: a provider outage or response disagreement fails this smoke test.
 * Do not run during ordinary unit tests; live servers are outside NOSHASHI's control.
 */
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { corroborateAutopsy } from "./autopsy-gateway.mjs";
import { lookupPinnedPaymentControls } from "./xrpl-payment-controls.mjs";
import { reviewCaseWithLedgerControls } from "./case-ledger-controls.mjs";
import { verifyControlEvidenceAttestation, verifyEvidenceAttestation, verifyEvidenceReceipt } from "./evidence-receipt.mjs";

// Validated historical example from https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/tx
const hash = "C53ECF838647FA5A4C780377025FEC7999AB4182590510CA461444B207AB74A9";
const expectedLedgerHash = "793E56131D8D4ABFB27FA383BFC44F2978B046E023FF46C588D7E0C874C2472A";
const report = await corroborateAutopsy(hash);
console.log(JSON.stringify({ status:report.status, disposition:report.disposition,
  ledgerIndex:report.ledgerIndex, sources:report.evidenceSources, reasonCodes:report.reasonCodes },null,2));
assert.equal(report.status,"VERIFIED_FACT","Two independent XRPL sources must corroborate a validated outcome");
assert.equal(report.disposition,"SUCCESS");
assert.equal(report.resultCode,"tesSUCCESS");
assert.equal(report.ledgerIndex,56865245);
assert.equal(report.ledgerHash,expectedLedgerHash);
assert.equal(report.simulated,false);

// Public successful issued-asset Payment also recorded in docs/product/settlement-exception-desk.md.
const paymentHash = "33C313E12DD8B2CFDB98ABC6298D4EFD0F3BC8EF283C057A026DA6170E7939AD";
const payment = await corroborateAutopsy(paymentHash);
assert.equal(payment.status, "VERIFIED_FACT");
assert.equal(payment.disposition, "SUCCESS");
assert.equal(payment.ledgerIndex, 107585451);
assert.equal(payment.ledgerHash, "879FD94AC6C1944ABE886760B2706E2A5B863A94DDDA62F9FD0D62E66A97F06B");
assert.deepEqual(payment.paymentAsset, {
  issuer:"rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz",
  currency:"534F4C4F00000000000000000000000000000000",
});
assert.deepEqual(payment.deliveredAmount, {unit:"issued", value:"0.067791435856414"});
console.log(JSON.stringify({
  status:payment.status, ledgerIndex:payment.ledgerIndex, sources:payment.evidenceSources,
  paymentAsset:payment.paymentAsset, deliveredAmount:payment.deliveredAmount,
}, null, 2));

// Public Payment with distinct destination and issuer. Approval snapshots are synthetic.
const snapshot = {
  network:"xrpl-mainnet",
  transactionHash:"D2AE63967BC12BA53B9AC9C13886EF7CEFA7EBE90F9890AA664FED4D0F073CF5",
  ledgerIndex:107699222,
  ledgerHash:"9DC505EDD5B5D28376983B6A0B23BB9C538FB0C1EE3010A16F7F8CC5148D1703",
  destination:"rPBJGLCysYLSrfH6SttjoWkYW3Pvu2qPR",
  destinationTagRequired:false,
  issuerGlobalFreeze:false,
  trustLineFrozen:false,
  trustLineAuthorized:false,
  policyVersion:"smoke-fixture",
};
const {privateKey, publicKey} = generateKeyPairSync("ed25519");
const reviewed = await reviewCaseWithLedgerControls({
  hash:snapshot.transactionHash, approved:snapshot, current:snapshot,
  issuer:"r9rRLst96Ue4YTDQkWWkX1ePB6p6Ye4FkA",
  currency:"58525061794E6574000000000000000000000000",
}, {attestationKey:privateKey});
assert.equal(reviewed.controls?.status, "CORROBORATED", JSON.stringify({
  caseReasons:reviewed.reasonCodes, controlReasons:reviewed.controls?.reasonCodes,
  providerDiagnostics:Object.fromEntries(Object.entries(reviewed.controls?.evidence ?? {}).map(
    ([subject, evidence]) => [subject, evidence?.providerDiagnostics ?? []],
  )),
}));
assert.deepEqual(reviewed.caseReview.transaction.deliveredAmount, {unit:"issued", value:"92.7851455"});
assert.equal(reviewed.controls.issuerRequireAuth, false);
assert.equal(reviewed.controls.issuerAuthorizationConditionMet, true);
assert.deepEqual(reviewed.reasonCodes, ["APPROVAL_SNAPSHOT_UNAUTHENTICATED"]);
assert.equal(reviewed.verdict, "HOLD");
assert.equal(reviewed.authorizationGranted, false);
assert.equal(verifyEvidenceReceipt(reviewed.caseReview.receipt), true);
assert.equal(verifyEvidenceAttestation(reviewed.caseReview.receipt, reviewed.caseReview.evidenceAttestation, publicKey), true);
assert.equal(verifyControlEvidenceAttestation(reviewed.caseReview.receipt, reviewed.controls, reviewed.controlAttestation, publicKey), true);
console.log(JSON.stringify({
  ledgerIndex:snapshot.ledgerIndex, controls:reviewed.controls.status, verdict:reviewed.verdict,
  ephemeralSignerVerified:true, controlAttestationVerified:true, syntheticApprovalSnapshots:true, reasonCodes:reviewed.reasonCodes,
}, null, 2));

// Historical public RippleState with issuer-side freeze, deep freeze, and owner reserve.
const flagged = await lookupPinnedPaymentControls({
  issuer:"rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
  destination:"rnXyVQzgxZe7TR1EPzTkGj2jxH4LMJYh66",
  currency:"524C555344000000000000000000000000000000",
  ledgerHash:"81CC0FF836670FAF04921C437F8138B2E86DAEFE7B561373F463698C67CC5FED",
});
assert.equal(flagged.status, "CORROBORATED");
assert.equal(flagged.ledgerIndex, 108533744);
for (const sourceEvidence of Object.values(flagged.evidence)) {
  assert.equal(sourceEvidence.ledgerIndex, flagged.ledgerIndex);
  assert.deepEqual(sourceEvidence.evidenceSources, ["InFTF", "Honeycluster"]);
}
assert.equal(flagged.trustLineFrozen, true);
assert.equal(flagged.issuerDeepFrozen, true);
assert.equal(flagged.holderDeepFrozen, false);
assert.equal(flagged.trustLineAuthorized, false);
assert.equal(flagged.issuerGlobalFreeze, false);
assert.equal(flagged.issuerRequireAuth, false);
assert.equal(flagged.authorizationGranted, false);
console.log(JSON.stringify(flagged, null, 2));
