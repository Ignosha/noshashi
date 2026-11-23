import {test} from "node:test";
import assert from "node:assert/strict";
import {parsePinnedTrustLine,corroboratePinnedTrustLine} from "./xrpl-trustline-evidence.mjs";
const issuer="r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59";
const holder="rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
const request={issuer,holder,currency:"USD",ledgerHash:"B".repeat(64)};
const observation=(flags,issuerIsLow=true,hash=request.ledgerHash)=>({
 result:{validated:true,ledger_hash:hash,node:{
 LedgerEntryType:"RippleState",Flags:flags,
 LowLimit:{issuer:issuerIsLow?issuer:holder,currency:"USD",value:"100"},
 HighLimit:{issuer:issuerIsLow?holder:issuer,currency:"USD",value:"100"},
 }}});
test("interprets issuer-side freeze and authorization on low side",()=>{
 const r=parsePinnedTrustLine(observation(0x00410000),request);
 assert.equal(r.status,"OBSERVED");
 assert.equal(r.trustLineFrozen,true);
 assert.equal(r.trustLineAuthorized,true);
});
test("interprets issuer-side flags on high side without mixing holder flags",()=>{
 const r=parsePinnedTrustLine(observation(0x00820000,false),request);
 assert.equal(r.status,"OBSERVED");
 assert.equal(r.trustLineFrozen,true);
 assert.equal(r.trustLineAuthorized,true);
 const holderOnly=parsePinnedTrustLine(observation(0x00410000,false),request);
 assert.equal(holderOnly.trustLineFrozen,false);
 assert.equal(holderOnly.trustLineAuthorized,false);
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
