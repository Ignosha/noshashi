/**
 * Opt-in read-only live RippleState diagnostic.
 * Caller supplies public account addresses, currency, and validated ledger hash.
 * No signing, no keys, no implicit "latest" fallback, no production release gate.
 */
import {lookupPinnedTrustLine} from "./xrpl-trustline-lookup.mjs";
const {NOSHASHI_TRUSTLINE_ISSUER:issuer,NOSHASHI_TRUSTLINE_HOLDER:holder,
 NOSHASHI_TRUSTLINE_CURRENCY:currency,NOSHASHI_TRUSTLINE_LEDGER_HASH:ledgerHash}=process.env;
const required=process.env.NOSHASHI_REQUIRE_LIVE_TRUSTLINE==="1";
if(!issuer||!holder||!currency||!ledgerHash){
 if(required)process.exitCode=1;
 console.log(JSON.stringify({status:"SKIPPED",reasonCodes:["LIVE_TRUSTLINE_FIXTURE_NOT_CONFIGURED"],
  note:"Set issuer, holder, currency and validated ledger hash explicitly. No claims of live verification."},null,2));
}else{
 try{
  const evidence=await lookupPinnedTrustLine({issuer,holder,currency,ledgerHash});
  console.log(JSON.stringify({status:evidence.status,ledgerHash:evidence.ledgerHash,
   issuer,holder,currency,ledgerIndex:evidence.ledgerIndex??null,
   trustLineFrozen:evidence.trustLineFrozen,
   trustLineAuthorized:evidence.trustLineAuthorized,
   issuerDeepFrozen:evidence.issuerDeepFrozen,holderDeepFrozen:evidence.holderDeepFrozen,
   reasonCodes:evidence.reasonCodes,providerDiagnostics:evidence.providerDiagnostics??[],
   independentlyAuthenticated:false,
   note:"RPC corroboration only; not cryptographic proof or transaction authorization."},null,2));
  if(evidence.status!=="CORROBORATED"){
   if(required)process.exitCode=1;
   console.log("Live pinned trustline evidence NOT verified. Do not claim this check passed.");
  }
 }catch{
  if(required)process.exitCode=1;
  console.log(JSON.stringify({status:"UNKNOWN",reasonCodes:["LIVE_TRUSTLINE_DIAGNOSTIC_UNAVAILABLE"]},null,2));
 }
}
