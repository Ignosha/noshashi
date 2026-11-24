import { attestControlEvidence } from "./evidence-receipt.mjs";
import { normalizeIssuedCurrency } from "./xrpl-trustline-evidence.mjs";
import { reviewInstitutionalCase } from "./institutional-case-review.mjs";
import { lookupPinnedPaymentControls } from "./xrpl-payment-controls.mjs";
/**
 * Composes verified transaction report with pinned read-only control evidence.
 * Does not authenticate customer approval snapshots, trustlines, or sign funds.
 */
export async function reviewCaseWithLedgerControls(input,{
  review=reviewInstitutionalCase,controls=lookupPinnedPaymentControls,attestationKey
}={}){
  const base={schema:"noshashi.case-ledger-controls.research.v0",
    verdict:"HOLD",authorizationGranted:false,controls:null,caseReview:null,
    reasonCodes:[],controlEvidenceAuthenticated:false};
  let caseReview;
  try{caseReview=await review({hash:input?.hash,approved:input?.approved,current:input?.current}, {attestationKey});}catch{
    return {...base,reasonCodes:["CASE_REVIEW_UNAVAILABLE"]};
  }
  if(!caseReview||caseReview.transaction?.status!=="VERIFIED_FACT"||
     caseReview.transaction.validated!==true||
     caseReview.transaction.simulated!==false||
     caseReview.transaction.provenance!=="two-rpc-providers"||
     !/^[A-F0-9]{64}$/i.test(caseReview.transaction.ledgerHash??"")||
     !Number.isSafeInteger(caseReview.transaction.ledgerIndex)||
     caseReview.transaction.ledgerIndex<=0)
    return {...base,caseReview,reasonCodes:["TRANSACTION_EVIDENCE_UNVERIFIED"]};
  if(caseReview.reasonCodes?.includes("EVIDENCE_ATTESTATION_UNAVAILABLE"))
    return {...base,caseReview,reasonCodes:["EVIDENCE_ATTESTATION_UNAVAILABLE"]};
  const destination=input?.current?.destination;
  const issuer=input?.issuer;
  const currency=input?.currency;
  // Issuer must be explicit; never infer the issuer from a Payment's sender.
  if(typeof issuer!=="string"||typeof destination!=="string")
    return {...base,caseReview,reasonCodes:["ISSUER_OR_DESTINATION_MISSING"]};
  const verifiedDestination=caseReview.transaction.paymentDestination;
  if(typeof verifiedDestination==="string"&&verifiedDestination!==destination)
    return {...base,caseReview,reasonCodes:["PAYMENT_DESTINATION_MISMATCH"]};
  const asset=caseReview.transaction.paymentAsset;
  if(asset&&(asset.issuer!==issuer||!normalizeIssuedCurrency(asset.currency)||normalizeIssuedCurrency(asset.currency)!==normalizeIssuedCurrency(currency)))
    return {...base,caseReview,reasonCodes:["PAYMENT_ASSET_MISMATCH"]};
  let controlEvidence;
  try{controlEvidence=await controls({issuer,destination,
    ledgerHash:caseReview.transaction.ledgerHash,currency});}
  catch{return {...base,caseReview,reasonCodes:["CONTROL_LOOKUP_UNAVAILABLE"]};}
  if(!["PARTIAL_CORROBORATED","CORROBORATED"].includes(controlEvidence?.status)||
     controlEvidence.ledgerHash!==caseReview.transaction.ledgerHash||
     typeof controlEvidence.requireDestinationTag!=="boolean"||
     typeof controlEvidence.issuerGlobalFreeze!=="boolean")
    return {...base,caseReview,controls:controlEvidence??null,
      reasonCodes:["CONTROL_EVIDENCE_UNAVAILABLE"]};
  if(controlEvidence.ledgerIndex!==caseReview.transaction.ledgerIndex)
    return {...base,caseReview,controls:controlEvidence,reasonCodes:["CONTROL_LEDGER_INDEX_CONFLICT"]};
  // Complete evidence must include an explicit, internally consistent
  // authorization decision. Missing flags must never look like cleared controls.
  if(controlEvidence.status==="CORROBORATED"&&(
     typeof controlEvidence.issuerRequireAuth!=="boolean"||
     typeof controlEvidence.trustLineFrozen!=="boolean"||
     typeof controlEvidence.trustLineAuthorized!=="boolean"||
     typeof controlEvidence.issuerAuthorizationConditionMet!=="boolean"||
     controlEvidence.issuerAuthorizationConditionMet!==
       (!controlEvidence.issuerRequireAuth||controlEvidence.trustLineAuthorized)))
    return {...base,caseReview,controls:controlEvidence,
      reasonCodes:["CONTROL_EVIDENCE_UNAVAILABLE"]};
  const claims=input?.current??{};
  // Only matching corroborated destination and delivered asset establish contextual binding.
  // Explicit caller-supplied controls are contextual research, not transaction-bound proof.
  const codes=["APPROVAL_SNAPSHOT_UNAUTHENTICATED"];
  if(!asset||verifiedDestination!==destination)codes.push("CONTROL_TRANSACTION_BINDING_UNVERIFIED");
  if(verifiedDestination!==destination)codes.push("PAYMENT_DESTINATION_UNVERIFIED");
  if(controlEvidence.status!=="CORROBORATED")codes.push("TRUST_LINE_EVIDENCE_UNAVAILABLE");
  if(claims.destinationTagRequired!==controlEvidence.requireDestinationTag)
    codes.push("CLAIMED_DESTINATION_TAG_CONFLICT");
  if(claims.issuerGlobalFreeze!==controlEvidence.issuerGlobalFreeze)
    codes.push("CLAIMED_ISSUER_FREEZE_CONFLICT");
  if(controlEvidence.issuerGlobalFreeze===true)
    codes.push("ISSUER_GLOBAL_FREEZE_ACTIVE");
  if(controlEvidence.issuerDeepFrozen===true)codes.push("ISSUER_TRUST_LINE_DEEP_FROZEN");
  if(controlEvidence.holderDeepFrozen===true)codes.push("HOLDER_TRUST_LINE_DEEP_FROZEN");
  if(controlEvidence.status==="CORROBORATED"){
    if(controlEvidence.issuerAuthorizationConditionMet===false)
      codes.push("ISSUER_TRUST_LINE_AUTHORIZATION_REQUIRED");
    if(controlEvidence.trustLineFrozen===true)
      codes.push("ISSUER_TRUST_LINE_FROZEN");
    if(claims.trustLineFrozen!==controlEvidence.trustLineFrozen)
      codes.push("CLAIMED_TRUST_LINE_FREEZE_CONFLICT");
    if(claims.trustLineAuthorized!==controlEvidence.trustLineAuthorized)
      codes.push("CLAIMED_TRUST_LINE_AUTH_CONFLICT");
  }
  if(attestationKey!==undefined&&controlEvidence.status==="CORROBORATED"&&asset&&verifiedDestination===destination){
    try {
      const controlAttestation=attestControlEvidence(caseReview.receipt,controlEvidence,attestationKey);
      return {...base,caseReview,controls:controlEvidence,reasonCodes:codes,controlAttestation};
    } catch {
      codes.push("CONTROL_ATTESTATION_UNAVAILABLE");
    }
  }
  return {...base,caseReview,controls:controlEvidence,reasonCodes:codes};
}
