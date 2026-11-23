import { reviewInstitutionalCase } from "./institutional-case-review.mjs";
import { lookupPinnedPaymentControls } from "./xrpl-payment-controls.mjs";
/**
 * Composes verified transaction report with pinned read-only control evidence.
 * Does not authenticate customer approval snapshots, trustlines, or sign funds.
 */
export async function reviewCaseWithLedgerControls(input,{
  review=reviewInstitutionalCase,controls=lookupPinnedPaymentControls
}={}){
  const base={schema:"noshashi.case-ledger-controls.research.v0",
    verdict:"HOLD",authorizationGranted:false,controls:null,caseReview:null,
    reasonCodes:[],controlEvidenceAuthenticated:false};
  let caseReview;
  try{caseReview=await review({hash:input?.hash,approved:input?.approved,current:input?.current});}catch{
    return {...base,reasonCodes:["CASE_REVIEW_UNAVAILABLE"]};
  }
  if(!caseReview||caseReview.transaction?.status!=="VERIFIED_FACT"||
     !caseReview.transaction.ledgerHash||!caseReview.transaction.ledgerIndex)
    return {...base,caseReview,reasonCodes:["TRANSACTION_EVIDENCE_UNVERIFIED"]};
  const destination=input?.current?.destination;
  const issuer=input?.issuer;
  // Issuer must be explicit; never infer the issuer from a Payment's sender.
  if(typeof issuer!=="string"||typeof destination!=="string")
    return {...base,caseReview,reasonCodes:["ISSUER_OR_DESTINATION_MISSING"]};
  let controlEvidence;
  try{controlEvidence=await controls({issuer,destination,
    ledgerHash:caseReview.transaction.ledgerHash});}
  catch{return {...base,caseReview,reasonCodes:["CONTROL_LOOKUP_UNAVAILABLE"]};}
  if(controlEvidence?.status!=="PARTIAL_CORROBORATED")
    return {...base,caseReview,controls:controlEvidence??null,
      reasonCodes:["CONTROL_EVIDENCE_UNAVAILABLE"]};
  const codes=["TRUST_LINE_EVIDENCE_NOT_IMPLEMENTED","APPROVAL_SNAPSHOT_UNAUTHENTICATED"];
  if(input.current.destinationTagRequired!==controlEvidence.requireDestinationTag)
    codes.push("CLAIMED_DESTINATION_TAG_CONFLICT");
  if(input.current.issuerGlobalFreeze!==controlEvidence.issuerGlobalFreeze)
    codes.push("CLAIMED_ISSUER_FREEZE_CONFLICT");
  return {...base,caseReview,controls:controlEvidence,reasonCodes:codes};
}
