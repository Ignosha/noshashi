/**
 * Ledger-pinned XRPL controls, deliberately incomplete for token transfers.
 * Destination tag comes from destination AccountRoot; issuer global freeze
 * comes from issuer AccountRoot. Trust-line state remains UNKNOWN.
 */
import { lookupPinnedAccountRoot } from "./xrpl-account-root-lookup.mjs";
import { lookupPinnedTrustLine } from "./xrpl-trustline-lookup.mjs";
export async function lookupPinnedPaymentControls({destination,issuer,ledgerHash,currency},
  {lookup=lookupPinnedAccountRoot,trustLineLookup=lookupPinnedTrustLine}={}){
  const base={schema:"noshashi.xrpl.payment-controls.research.v0",
    status:"UNKNOWN",ledgerHash,requireDestinationTag:null,
    issuerGlobalFreeze:null,issuerRequireAuth:null,trustLineFrozen:null,trustLineAuthorized:null,
    issuerAuthorizationConditionMet:null,
    reasonCodes:[],authorizationGranted:false,independentlyAuthenticated:false};
  if(typeof destination!=="string"||typeof issuer!=="string"||
     typeof ledgerHash!=="string"||!/^[A-F0-9]{64}$/i.test(ledgerHash))
    return {...base,reasonCodes:["INVALID_CONTROL_REQUEST"]};
  const [d,i]=await Promise.allSettled([
    lookup({account:destination,ledgerHash}),
    lookup({account:issuer,ledgerHash}),
  ]);
  if(d.status!=="fulfilled"||i.status!=="fulfilled"||
     d.value?.status!=="CORROBORATED"||i.value?.status!=="CORROBORATED"||
     d.value?.account!==destination||i.value?.account!==issuer||
     d.value?.ledgerHash!==ledgerHash.toUpperCase()||
     i.value?.ledgerHash!==ledgerHash.toUpperCase()||
     typeof d.value?.requireDestinationTag!=="boolean"||
     typeof i.value?.globalFreeze!=="boolean")
    return {...base,reasonCodes:["PINNED_CONTROL_EVIDENCE_UNAVAILABLE"]};
  const observed={...base,status:"PARTIAL_CORROBORATED",
    requireDestinationTag:d.value.requireDestinationTag,
    issuerGlobalFreeze:i.value.globalFreeze,
    issuerRequireAuth:typeof i.value.requireAuth==="boolean"?i.value.requireAuth:null,
    reasonCodes:["TRUST_LINE_EVIDENCE_NOT_REQUESTED"]};
  if(typeof currency!=="string"||!/^([A-Z0-9]{3}|[A-F0-9]{40})$/i.test(currency))
    return observed;
  let trustLine;
  try{trustLine=await trustLineLookup({issuer,holder:destination,currency,ledgerHash});}
  catch{return {...observed,reasonCodes:["TRUST_LINE_EVIDENCE_UNAVAILABLE"]};}
  if(trustLine?.status!=="CORROBORATED"||
     trustLine.issuer!==issuer||trustLine.holder!==destination||
     trustLine.currency?.toUpperCase()!==currency.toUpperCase()||
     trustLine.ledgerHash!==ledgerHash.toUpperCase()||
     typeof trustLine.trustLineFrozen!=="boolean"||
     typeof trustLine.trustLineAuthorized!=="boolean")
    return {...observed,reasonCodes:["TRUST_LINE_EVIDENCE_UNAVAILABLE"]};
  return {...observed,status:observed.issuerRequireAuth===null?"PARTIAL_CORROBORATED":"CORROBORATED",
    trustLineFrozen:trustLine.trustLineFrozen,
    trustLineAuthorized:trustLine.trustLineAuthorized,
    issuerAuthorizationConditionMet:observed.issuerRequireAuth===null?null:
      (!observed.issuerRequireAuth||trustLine.trustLineAuthorized),
    reasonCodes:observed.issuerRequireAuth===null?["ISSUER_REQUIRE_AUTH_UNKNOWN"]:[]};
}
