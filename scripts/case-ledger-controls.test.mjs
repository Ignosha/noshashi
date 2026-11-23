import {test} from "node:test";
import assert from "node:assert/strict";
import {lookupPinnedPaymentControls} from "./xrpl-payment-controls.mjs";
import {reviewCaseWithLedgerControls} from "./case-ledger-controls.mjs";
const L="B".repeat(64),H="A".repeat(64);
const destination="rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
const issuer="r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59";
const control={destination,issuer,ledgerHash:L};
const lookup=async({account,ledgerHash})=>({
 status:"CORROBORATED",account,ledgerHash,requireDestinationTag:true,globalFreeze:false});
test("destination tag and issuer freeze come from distinct pinned AccountRoots",async()=>{
 const seen=[];
 const r=await lookupPinnedPaymentControls(control,{lookup:async request=>{
 seen.push(request);return lookup(request);}});
 assert.equal(r.status,"PARTIAL_CORROBORATED");
 assert.equal(r.requireDestinationTag,true);
 assert.equal(r.issuerGlobalFreeze,false);
 assert.equal(r.trustLineFrozen,null);
 assert.equal(r.trustLineAuthorized,null);
 assert.equal(r.authorizationGranted,false);
 assert.deepEqual(seen.map(x=>x.account).sort(),[destination,issuer].sort());
});
test("one unavailable account keeps all controls UNKNOWN",async()=>{
 const r=await lookupPinnedPaymentControls(control,{lookup:async request=>
 request.account===issuer?{status:"UNKNOWN"}:lookup(request)});
 assert.equal(r.status,"UNKNOWN");
 assert.equal(r.requireDestinationTag,null);
});
const tx={status:"VERIFIED_FACT",validated:true,simulated:false,provenance:"two-rpc-providers",ledgerHash:L,ledgerIndex:100};
const input={hash:H,issuer,current:{destination,destinationTagRequired:false,issuerGlobalFreeze:false}};
test("ledger claims are compared without granting approval",async()=>{
 const r=await reviewCaseWithLedgerControls(input,{
 review:async payload=>{
 assert.deepEqual(Object.keys(payload).sort(),["approved","current","hash"]);
 return {transaction:tx,verdict:"HOLD"};},
 controls:async()=>({status:"PARTIAL_CORROBORATED",ledgerHash:L,requireDestinationTag:true,issuerGlobalFreeze:false})});
 assert.equal(r.verdict,"HOLD");
 assert.equal(r.authorizationGranted,false);
 assert.ok(r.reasonCodes.includes("CLAIMED_DESTINATION_TAG_CONFLICT"));
 assert.ok(r.reasonCodes.includes("TRUST_LINE_EVIDENCE_UNAVAILABLE"));
});
test("missing issuer and missing transaction evidence fail closed",async()=>{
 const noIssuer=await reviewCaseWithLedgerControls({...input,issuer:undefined},{
 review:async()=>({transaction:tx})});
 assert.deepEqual(noIssuer.reasonCodes,["ISSUER_OR_DESTINATION_MISSING"]);
 const noTx=await reviewCaseWithLedgerControls(input,{review:async()=>({transaction:null})});
 assert.deepEqual(noTx.reasonCodes,["TRANSACTION_EVIDENCE_UNVERIFIED"]);
});

test("rejects forged transaction and mismatched pinned controls",async()=>{
 const fake=await reviewCaseWithLedgerControls(input,{
  review:async()=>({transaction:{...tx,simulated:true}})});
 assert.deepEqual(fake.reasonCodes,["TRANSACTION_EVIDENCE_UNVERIFIED"]);
 const unpinned=await reviewCaseWithLedgerControls(input,{
  review:async()=>({transaction:tx}),
  controls:async()=>({status:"PARTIAL_CORROBORATED",ledgerHash:"C".repeat(64),
   requireDestinationTag:true,issuerGlobalFreeze:false})});
 assert.deepEqual(unpinned.reasonCodes,["CONTROL_EVIDENCE_UNAVAILABLE"]);
});

test("corroborated trustline evidence flags conflicts but never approves",async()=>{
 const withAsset={...input,currency:"USD",current:{...input.current,trustLineFrozen:false,trustLineAuthorized:true}};
 const r=await reviewCaseWithLedgerControls(withAsset,{
  review:async()=>({transaction:tx,verdict:"HOLD"}),
  controls:async()=>({status:"CORROBORATED",ledgerHash:L,
   requireDestinationTag:false,issuerGlobalFreeze:false,
   trustLineFrozen:true,trustLineAuthorized:true})});
 assert.equal(r.verdict,"HOLD");
 assert.equal(r.authorizationGranted,false);
 assert.ok(r.reasonCodes.includes("CLAIMED_TRUST_LINE_FREEZE_CONFLICT"));
 assert.ok(!r.reasonCodes.includes("CLAIMED_TRUST_LINE_AUTH_CONFLICT"));
});

test("complete pinned payment controls combine AccountRoot and trustline",async()=>{
 const withCurrency={...control,currency:"USD"};
 const r=await lookupPinnedPaymentControls(withCurrency,{
  lookup,
  trustLineLookup:async request=>({status:"CORROBORATED",
   issuer:request.issuer,holder:request.holder,currency:request.currency,
   ledgerHash:request.ledgerHash,trustLineFrozen:true,trustLineAuthorized:false})});
 assert.equal(r.status,"CORROBORATED");
 assert.equal(r.trustLineFrozen,true);
 assert.equal(r.trustLineAuthorized,false);
 assert.equal(r.authorizationGranted,false);
});
test("missing pinned trustline response retains partial evidence and unknown flags",async()=>{
 const r=await lookupPinnedPaymentControls({...control,currency:"USD"},{
  lookup,trustLineLookup:async()=>({status:"UNKNOWN"})});
 assert.equal(r.status,"PARTIAL_CORROBORATED");
 assert.equal(r.trustLineFrozen,null);
 assert.deepEqual(r.reasonCodes,["TRUST_LINE_EVIDENCE_UNAVAILABLE"]);
});
