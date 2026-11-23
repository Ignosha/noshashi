/**
 * Ledger-pinned XRPL controls, deliberately incomplete for token transfers.
 * Destination tag comes from destination AccountRoot; issuer global freeze
 * comes from issuer AccountRoot. Trust-line state remains UNKNOWN.
 */
import { lookupPinnedAccountRoot } from "./xrpl-account-root-lookup.mjs";
export async function lookupPinnedPaymentControls({destination,issuer,ledgerHash},
  {lookup=lookupPinnedAccountRoot}={}){
  const base={schema:"noshashi.xrpl.payment-controls.research.v0",
    status:"UNKNOWN",ledgerHash,requireDestinationTag:null,
    issuerGlobalFreeze:null,trustLineFrozen:null,trustLineAuthorized:null,
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
  return {...base,status:"PARTIAL_CORROBORATED",
    requireDestinationTag:d.value.requireDestinationTag,
    issuerGlobalFreeze:i.value.globalFreeze,
    reasonCodes:["TRUST_LINE_EVIDENCE_NOT_IMPLEMENTED"]};
}
