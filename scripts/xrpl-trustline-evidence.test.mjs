import {test} from "node:test";
import assert from "node:assert/strict";
import {parsePinnedTrustLine,corroboratePinnedTrustLine} from "./xrpl-trustline-evidence.mjs";
const issuer="r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59";
const holder="rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
const request={issuer,holder,currency:"USD",ledgerHash:"B".repeat(64)};
const observation=(flags,issuerIsLow=true,hash=request.ledgerHash)=>({
 result:{validated:true,ledger_index:100,ledger_hash:hash,node:{
 LedgerEntryType:"RippleState",Flags:flags,
 LowLimit:{issuer:issuerIsLow?issuer:holder,currency:"USD",value:"100"},
 HighLimit:{issuer:issuerIsLow?holder:issuer,currency:"USD",value:"100"},
 }}});
test("interprets issuer-side freeze and authorization on low side",()=>{
 const r=parsePinnedTrustLine(observation(0x00440000),request);
 assert.equal(r.status,"OBSERVED");
 assert.equal(r.trustLineFrozen,true);
 assert.equal(r.trustLineAuthorized,true);
});
test("interprets issuer-side flags on high side without mixing holder flags",()=>{
 const r=parsePinnedTrustLine(observation(0x00880000,false),request);
 assert.equal(r.status,"OBSERVED");
 assert.equal(r.trustLineFrozen,true);
 assert.equal(r.trustLineAuthorized,true);
 const holderOnly=parsePinnedTrustLine(observation(0x00440000,false),request);
 assert.equal(holderOnly.trustLineFrozen,false);
 assert.equal(holderOnly.trustLineAuthorized,false);
});
test("owner reserve on either side does not authorize a holder",()=>{
 for(const issuerIsLow of [true,false]){
  for(const flags of [0x00010000,0x00020000,0x00030000]){
   const result=parsePinnedTrustLine(observation(flags,issuerIsLow),request);
   assert.equal(result.status,"OBSERVED");
   assert.equal(result.trustLineAuthorized,false);
  }
 }
});
test("authorization disagreement with matching owner reserve fails closed",()=>{
 const lowReserve=observation(0x00010000);
 const lowReserveAndAuth=observation(0x00050000);
 const result=corroboratePinnedTrustLine(lowReserve,lowReserveAndAuth,request);
 assert.deepEqual(result.reasonCodes,["TRUSTLINE_PROVIDER_DISAGREEMENT"]);
 assert.equal(result.trustLineAuthorized,null);
});
test("invalid ledger, currency or account identity fail closed",()=>{
 assert.equal(parsePinnedTrustLine(observation(0,true,"C".repeat(64)),request).status,"UNKNOWN");
 const bad=observation(0);
 bad.result.node.LowLimit.currency="EUR";
 assert.deepEqual(parsePinnedTrustLine(bad,request).reasonCodes,["TRUSTLINE_IDENTITY_MISMATCH"]);
});
test("two-provider disagreement returns UNKNOWN",()=>{
 const r=corroboratePinnedTrustLine(observation(0x00400000),observation(0),request);
 assert.equal(r.status,"UNKNOWN");
 assert.deepEqual(r.reasonCodes,["TRUSTLINE_PROVIDER_DISAGREEMENT"]);
});
test("two agreeing pinned observations remain non-authorizing",()=>{
 const r=corroboratePinnedTrustLine(observation(0),observation(0),request);
 assert.equal(r.status,"CORROBORATED");
 assert.equal(r.trustLineFrozen,false);
 assert.equal(r.trustLineAuthorized,false);
 assert.equal(r.independentlyAuthenticated,false);
});

test("ledger_entry responses require a valid positive ledger index",()=>{
 const missing=observation(0);delete missing.result.ledger_index;
 assert.deepEqual(parsePinnedTrustLine(missing,request).reasonCodes,["LEDGER_INDEX_INVALID"]);
 const negative=observation(0);negative.result.ledger_index=-1;
 assert.deepEqual(parsePinnedTrustLine(negative,request).reasonCodes,["LEDGER_INDEX_INVALID"]);
});

test("matching ledger hash with contradictory ledger indices fails closed",()=>{
 const a=observation(0);
 const b=observation(0);
 b.result.ledger_index=101;
 const result=corroboratePinnedTrustLine(a,b,request);
 assert.equal(result.status,"UNKNOWN");
 assert.equal(result.ledgerIndex,null);
 assert.deepEqual(result.reasonCodes,["TRUSTLINE_LEDGER_INDEX_DISAGREEMENT"]);
 assert.equal(result.independentlyAuthenticated,false);
});
test("matching ledger indices are retained as provenance, not consensus proof",()=>{
 const result=corroboratePinnedTrustLine(observation(0),observation(0),request);
 assert.equal(result.ledgerIndex,100);
 assert.equal(result.independentlyAuthenticated,false);
});

test("distinguishes issuer and holder deep-freeze flags in both account orientations", () => {
 for (const issuerIsLow of [true, false]) {
  const low = parsePinnedTrustLine(observation(0x02000000, issuerIsLow), request);
  assert.equal(low.issuerDeepFrozen, issuerIsLow);
  assert.equal(low.holderDeepFrozen, !issuerIsLow);
  const high = parsePinnedTrustLine(observation(0x04000000, issuerIsLow), request);
  assert.equal(high.issuerDeepFrozen, !issuerIsLow);
  assert.equal(high.holderDeepFrozen, issuerIsLow);
 }
 const disagreement = corroboratePinnedTrustLine(observation(0x02000000), observation(0), request);
 assert.deepEqual(disagreement.reasonCodes, ["TRUSTLINE_PROVIDER_DISAGREEMENT"]);
 assert.equal(disagreement.issuerDeepFrozen, null);
});
