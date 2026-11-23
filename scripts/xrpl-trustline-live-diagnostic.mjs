/**
 * Opt-in read-only live RippleState diagnostic.
 * Caller supplies public account addresses, currency, and validated ledger hash.
 * No signing, no keys, no implicit "latest" fallback, no production release gate.
 */
import {lookupPinnedTrustLine} from "./xrpl-trustline-lookup.mjs";
const {NOSHASHI_TRUSTLINE_ISSUER:issuer,NOSHASHI_TRUSTLINE_HOLDER:holder,
 NOSHASHI_TRUSTLINE_CURRENCY:currency,NOSHASHI_TRUSTLINE_LEDGER_HASH:ledgerHash}=process.env;
if(!issuer||!holder||!currency||!ledgerHash){
 console.log(JSON.stringify({status:"SKIPPED",reasonCodes:["LIVE_TRUSTLINE_FIXTURE_NOT_CONFIGURED"],
  note:"Set issuer, holder, currency and validated ledger hash explicitly. No claims of live verification."},null,2));
}else{
 try{
  const evidence=await lookupPinnedTrustLine({issuer,holder,currency,ledgerHash});
  console.log(JSON.stringify({status:evidence.status,ledgerHash:evidence.ledgerHash,
   issuer,holder,currency,ledgerIndex:evidence.ledgerIndex??null,
   trustLineFrozen:evidence.trustLineFrozen,
   trustLineAuthorized:evidence.trustLineAuthorized,
   reasonCodes:evidence.reasonCodes,providerDiagnostics:evidence.providerDiagnostics??[],
   independentlyAuthenticated:false,
   note:"RPC corroboration only; not cryptographic proof or transaction authorization."},null,2));
  if(evidence.status!=="CORROBORATED")
   console.log("Live pinned trustline evidence NOT verified. Do not claim this check passed.");
 }catch{
  console.log(JSON.stringify({status:"UNKNOWN",reasonCodes:["LIVE_TRUSTLINE_DIAGNOSTIC_UNAVAILABLE"]},null,2));
 }
}
