/**
 * Ledger-pinned XRPL controls, deliberately incomplete for token transfers.
 * Destination tag comes from destination AccountRoot; issuer global freeze
 * and RequireAuth come from issuer AccountRoot. Trust-line evidence is
 * corroborated only when a currency and pinned RippleState are available.
 */
import { lookupPinnedAccountRoot } from "./xrpl-account-root-lookup.mjs";
import { lookupPinnedTrustLine } from "./xrpl-trustline-lookup.mjs";
import { normalizeIssuedCurrency } from "./xrpl-trustline-evidence.mjs";
export async function lookupPinnedPaymentControls(request,
  {lookup=lookupPinnedAccountRoot,trustLineLookup=lookupPinnedTrustLine}={}){
  const {destination,issuer,ledgerHash,currency}=request??{};
  const base={schema:"noshashi.xrpl.payment-controls.research.v0",
    status:"UNKNOWN",ledgerHash,ledgerIndex:null,requireDestinationTag:null,
    evidence:{destination:null,issuer:null,trustLine:null},
    issuerGlobalFreeze:null,issuerRequireAuth:null,trustLineFrozen:null,trustLineAuthorized:null,
    issuerAuthorizationConditionMet:null,issuerDeepFrozen:null,holderDeepFrozen:null,
    reasonCodes:[],authorizationGranted:false,independentlyAuthenticated:false};
  const address=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
  if(typeof destination!=="string"||!address.test(destination)||
     typeof issuer!=="string"||!address.test(issuer)||issuer===destination||
     typeof ledgerHash!=="string"||!/^[A-F0-9]{64}$/i.test(ledgerHash))
    return {...base,reasonCodes:["INVALID_CONTROL_REQUEST"]};
  const [d,i]=await Promise.allSettled([
    Promise.resolve().then(()=>lookup({account:destination,ledgerHash})),
    Promise.resolve().then(()=>lookup({account:issuer,ledgerHash})),
  ]);
  base.evidence.destination=d.status==="fulfilled"?d.value??null:null;
  base.evidence.issuer=i.status==="fulfilled"?i.value??null:null;
  if(d.status!=="fulfilled"||i.status!=="fulfilled"||
     d.value?.status!=="CORROBORATED"||i.value?.status!=="CORROBORATED"||
     d.value?.account!==destination||i.value?.account!==issuer||
     d.value?.ledgerHash!==ledgerHash.toUpperCase()||
     i.value?.ledgerHash!==ledgerHash.toUpperCase()||
     typeof d.value?.requireDestinationTag!=="boolean"||
     typeof i.value?.globalFreeze!=="boolean")
    return {...base,reasonCodes:["PINNED_CONTROL_EVIDENCE_UNAVAILABLE"]};
  if(!Number.isSafeInteger(d.value.ledgerIndex)||d.value.ledgerIndex<=0||
     d.value.ledgerIndex!==i.value.ledgerIndex)
    return {...base,reasonCodes:["CONTROL_LEDGER_INDEX_CONFLICT"]};
  const observed={...base,status:"PARTIAL_CORROBORATED",ledgerIndex:d.value.ledgerIndex,
    requireDestinationTag:d.value.requireDestinationTag,
    issuerGlobalFreeze:i.value.globalFreeze,
    issuerRequireAuth:typeof i.value.requireAuth==="boolean"?i.value.requireAuth:null,
    reasonCodes:["TRUST_LINE_EVIDENCE_NOT_REQUESTED"]};
  const currencyIdentity=normalizeIssuedCurrency(currency);
  if(!currencyIdentity)
    return observed;
  let trustLine;
  try{trustLine=await trustLineLookup({issuer,holder:destination,currency:currencyIdentity,ledgerHash});}
  catch{return {...observed,reasonCodes:["TRUST_LINE_EVIDENCE_UNAVAILABLE"]};}
  observed.evidence={...observed.evidence,trustLine:trustLine??null};
  if(trustLine?.status!=="CORROBORATED"||
     trustLine.issuer!==issuer||trustLine.holder!==destination||
     normalizeIssuedCurrency(trustLine.currency)!==currencyIdentity||
     trustLine.ledgerHash!==ledgerHash.toUpperCase()||
     typeof trustLine.trustLineFrozen!=="boolean"||
     typeof trustLine.trustLineAuthorized!=="boolean")
    return {...observed,reasonCodes:["TRUST_LINE_EVIDENCE_UNAVAILABLE"]};
  if(trustLine.ledgerIndex!==observed.ledgerIndex)
    return {...base,evidence:observed.evidence,reasonCodes:["CONTROL_LEDGER_INDEX_CONFLICT"]};
  return {...observed,status:observed.issuerRequireAuth===null?"PARTIAL_CORROBORATED":"CORROBORATED",
    trustLineFrozen:trustLine.trustLineFrozen,
    trustLineAuthorized:trustLine.trustLineAuthorized,
    issuerDeepFrozen:typeof trustLine.issuerDeepFrozen==="boolean"?trustLine.issuerDeepFrozen:null,
    holderDeepFrozen:typeof trustLine.holderDeepFrozen==="boolean"?trustLine.holderDeepFrozen:null,
    issuerAuthorizationConditionMet:observed.issuerRequireAuth===null?null:
      (!observed.issuerRequireAuth||trustLine.trustLineAuthorized),
    reasonCodes:observed.issuerRequireAuth===null?["ISSUER_REQUIRE_AUTH_UNKNOWN"]:[]};
}
