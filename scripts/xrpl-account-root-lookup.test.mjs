import {test} from "node:test";
import assert from "node:assert/strict";
import {lookupPinnedAccountRoot} from "./xrpl-account-root-lookup.mjs";
import {UPSTREAMS} from "./autopsy-gateway.mjs";
const account="rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY",ledgerHash="B".repeat(64);
const request={account,ledgerHash};
const mock=(flags=0,hash=ledgerHash)=>({
 ok:true,headers:{get:()=>null},
 body:(async function*(){yield Buffer.from(JSON.stringify({result:{
 validated:true,ledger_hash:hash,account_data:{
 LedgerEntryType:"AccountRoot",Account:account,Flags:flags,
 }}}));})(),
});
test("queries both trusted providers using pinned hash and no signing",async()=>{
 const urls=[];const fetchFn=async(url,options)=>{
  urls.push(url);assert.equal(options.method,"POST");
  assert.equal(options.redirect,"error");
  const req=JSON.parse(options.body);
  assert.equal(req.method,"account_info");
  assert.equal(req.params[0].ledger_hash,ledgerHash);
  assert.equal(req.params[0].account,account);
  assert.equal(req.params[0].strict,undefined);
  return mock(0x00020000);
 };
 const r=await lookupPinnedAccountRoot(request,{fetchFn});
 assert.equal(r.status,"CORROBORATED");
 assert.equal(r.requireDestinationTag,true);
 assert.deepEqual(urls,UPSTREAMS.map(s=>s.url));
});
test("provider disagreement returns UNKNOWN",async()=>{
 let n=0;const r=await lookupPinnedAccountRoot(request,{
 fetchFn:async()=>mock(n++===0?0:0x00020000)});
 assert.equal(r.status,"UNKNOWN");
 assert.deepEqual(r.reasonCodes,["ACCOUNT_ROOT_PROVIDER_DISAGREEMENT"]);
});
test("missing provider or wrong ledger returns UNKNOWN",async()=>{
 const r=await lookupPinnedAccountRoot(request,{
 fetchFn:async(url)=>url===UPSTREAMS[0].url?mock():Promise.reject(Error("offline"))});
 assert.deepEqual(r.reasonCodes,["PINNED_ACCOUNT_EVIDENCE_UNAVAILABLE"]);
 const mismatch=await lookupPinnedAccountRoot(request,{fetchFn:async()=>mock(0,"C".repeat(64))});
 assert.deepEqual(mismatch.reasonCodes,["PINNED_ACCOUNT_EVIDENCE_UNAVAILABLE"]);
});
test("rejects untrusted servers and invalid request",async()=>{
 const invalid=await lookupPinnedAccountRoot({...request,ledgerHash:"not-a-hash"});
 assert.deepEqual(invalid.reasonCodes,["INVALID_PINNED_REQUEST"]);
 const servers=[UPSTREAMS[0],{name:"Untrusted",url:"https://example.com"}];
 const r=await lookupPinnedAccountRoot(request,{servers,fetchFn:async()=>{throw Error("should not fetch")}});
 assert.deepEqual(r.reasonCodes,["INDEPENDENT_SOURCES_NOT_CONFIGURED"]);
});
test("rejects oversized upstream bodies",async()=>{
 const r=await lookupPinnedAccountRoot(request,{fetchFn:async()=>({
 ok:true,headers:{get:()=>String(1024*1024+1)},body:(async function*(){})(),
 })});
 assert.deepEqual(r.reasonCodes,["PINNED_ACCOUNT_EVIDENCE_UNAVAILABLE"]);
});

test("diagnostics distinguish provider failure from invalid ledger evidence",async()=>{
 const r=await lookupPinnedAccountRoot(request,{
  fetchFn:async url=>url===UPSTREAMS[0].url?mock(0,"C".repeat(64)):Promise.reject(Error("offline"))});
 assert.deepEqual(r.providerDiagnostics.map(x=>x.reasonCodes[0]),
  ["PINNED_LEDGER_UNVERIFIED","PROVIDER_REQUEST_FAILED"]);
 assert.equal(r.status,"UNKNOWN");
});
