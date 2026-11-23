import {test} from "node:test";
import assert from "node:assert/strict";
import {UPSTREAMS} from "./autopsy-gateway.mjs";
import {fetchPinnedTrustLine,lookupPinnedTrustLine} from "./xrpl-trustline-lookup.mjs";
const issuer="r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59";
const holder="rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
const request={issuer,holder,currency:"USD",ledgerHash:"B".repeat(64)};
function reply(flags=0,ledgerHash=request.ledgerHash){
 return {result:{validated:true,ledger_index:100,ledger_hash:ledgerHash,node:{
  LedgerEntryType:"RippleState",Flags:flags,
  LowLimit:{issuer,currency:"USD",value:"100"},
  HighLimit:{issuer:holder,currency:"USD",value:"100"}}}};
}
function fetchMock(left,right=left){
 const responses=[left,right];let index=0;
 return async(url,options)=>{
  assert.ok(UPSTREAMS.some(s=>s.url===url));
  assert.equal(options.method,"POST");
  assert.equal(options.redirect,"error");
  const body=JSON.parse(options.body);
  assert.equal(body.method,"ledger_entry");
  assert.equal(body.params[0].ledger_hash,request.ledgerHash);
  assert.deepEqual(body.params[0].ripple_state.accounts,[issuer,holder]);
  const data=JSON.stringify(responses[index++]);
  return {ok:true,headers:{get:()=>String(Buffer.byteLength(data))},
   body:(async function*(){yield Buffer.from(data);})()};
 };
}
test("corroborates pinned issuer-side RippleState flags",async()=>{
 const r=await lookupPinnedTrustLine(request,{fetchFn:fetchMock(reply(0x00410000))});
 assert.equal(r.status,"CORROBORATED");
 assert.equal(r.trustLineFrozen,true);
 assert.equal(r.trustLineAuthorized,true);
 assert.equal(r.independentlyAuthenticated,false);
 assert.equal(r.evidenceSources.length,2);
});
test("provider disagreement fails closed",async()=>{
 const r=await lookupPinnedTrustLine(request,{fetchFn:fetchMock(reply(0x00400000),reply(0))});
 assert.equal(r.status,"UNKNOWN");
 assert.deepEqual(r.reasonCodes,["TRUSTLINE_PROVIDER_DISAGREEMENT"]);
});
test("wrong pinned ledger fails closed",async()=>{
 const r=await lookupPinnedTrustLine(request,{fetchFn:fetchMock(reply(0),reply(0,"C".repeat(64)))});
 assert.equal(r.status,"UNKNOWN");
 assert.deepEqual(r.reasonCodes,["TRUSTLINE_EVIDENCE_UNAVAILABLE"]);
 assert.deepEqual(r.providerDiagnostics.map(x=>x.reasonCodes[0]),
  [undefined,"PINNED_LEDGER_UNVERIFIED"]);
});
test("untrusted servers and malformed requests never fetch",async()=>{
 let called=false;
 const never=async()=>{called=true;throw Error("unexpected");};
 const wrong=await lookupPinnedTrustLine(request,{
  servers:[UPSTREAMS[0],{name:"rogue",url:"https://example.org"}],fetchFn:never});
 assert.deepEqual(wrong.reasonCodes,["INDEPENDENT_SOURCES_NOT_CONFIGURED"]);
 const invalid=await lookupPinnedTrustLine({...request,currency:"USD/ETH"},{fetchFn:never});
 assert.deepEqual(invalid.reasonCodes,["INVALID_TRUSTLINE_REQUEST"]);
 assert.equal(called,false);
 await assert.rejects(()=>fetchPinnedTrustLine({name:"rogue",url:"https://example.org"},request,never),
  /UNTRUSTED_RPC_SERVER/);
});
test("oversized response is rejected",async()=>{
 const big=async()=>({ok:true,headers:{get:()=>String(1024*1024+1)}});
 await assert.rejects(()=>fetchPinnedTrustLine(UPSTREAMS[0],request,big),
  /UPSTREAM_RESPONSE_TOO_LARGE/);
});

test("trustline diagnostics distinguish RPC outage from invalid pinned response",async()=>{
 const r=await lookupPinnedTrustLine(request,{
  fetchFn:async url=>url===UPSTREAMS[0].url?
   Promise.reject(Error("offline")):fetchMock(reply())(url,{
    method:"POST",redirect:"error",
    body:JSON.stringify({method:"ledger_entry",params:[{
     ledger_hash:request.ledgerHash,
     ripple_state:{accounts:[issuer,holder]}}]})})});
 assert.equal(r.status,"UNKNOWN");
 assert.equal(r.providerDiagnostics[0].reasonCodes[0],"PROVIDER_REQUEST_FAILED");
 assert.equal(r.providerDiagnostics[1].status,"OBSERVED");
});

test("missing, malformed, and negative content lengths fail closed",async()=>{
 for(const declared of ["-1","not-a-number",String(1024*1024+1)]){
  const mock=async()=>({ok:true,headers:{get:()=>declared},body:(async function*(){yield Buffer.from("{}");})()});
  await assert.rejects(()=>fetchPinnedTrustLine(UPSTREAMS[0],request,mock),
   /UPSTREAM_RESPONSE_TOO_LARGE/);
 }
});
test("missing HTTP response is classified as unavailable",async()=>{
 const r=await lookupPinnedTrustLine(request,{fetchFn:async()=>null});
 assert.equal(r.status,"UNKNOWN");
 assert.deepEqual(r.providerDiagnostics.map(x=>x.reasonCodes[0]),
  ["PROVIDER_REQUEST_FAILED","PROVIDER_REQUEST_FAILED"]);
 assert.equal(r.ledgerIndex,null);
});
test("provider ledger index mismatch cannot be corroborated",async()=>{
 const first=reply(),second=reply();
 second.result.ledger_index=101;
 const r=await lookupPinnedTrustLine(request,{fetchFn:fetchMock(first,second)});
 assert.equal(r.status,"UNKNOWN");
 assert.deepEqual(r.reasonCodes,["TRUSTLINE_LEDGER_INDEX_DISAGREEMENT"]);
 assert.equal(r.independentlyAuthenticated,false);
});
