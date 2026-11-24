import { test } from "node:test";
import assert from "node:assert/strict";
import { createAutopsyGateway, corroborateAutopsy, parseValidatedTx, validRequest } from "./autopsy-gateway.mjs";

const HASH = "A".repeat(64);
const LEDGER_HASH = "B".repeat(64);
const SECRET = "local-developer-only-secret-key-with-32-chars";
const raw = (code = "tesSUCCESS", overrides = {}) => ({
  result: { hash: HASH, validated: true, ledger_index: 123456,
    ledger_hash: LEDGER_HASH, meta: { TransactionResult: code }, ...overrides },
});
const fakeResponse = value => ({
  ok: true, headers: { get: () => null },
  body: (async function* () { yield Buffer.from(JSON.stringify(value)); })(),
});
const known = (url, options) => Promise.resolve(fakeResponse(raw()));
const twoServers = [
  {name:"providerA", url:"https://example-a.invalid"},
  {name:"providerB", url:"https://example-b.invalid"},
];
test("validates exact request schema", () => {
  assert.equal(validRequest({ network:"xrpl-mainnet", hash:HASH }),true);
  assert.equal(validRequest({ network:"xrpl-mainnet", hash:HASH, url:"http://127.0.0.1" }),false);
  assert.equal(validRequest({ network:"testnet", hash:HASH }),false);
  assert.equal(validRequest({ network:"xrpl-mainnet", hash:"not-a-hash" }),false);
});
test("rejects unvalidated, mismatched and non-tec final outcomes", () => {
  assert.equal(parseValidatedTx(raw("tesSUCCESS", {validated:false}),HASH),null);
  assert.equal(parseValidatedTx(raw("tesSUCCESS", {hash:"C".repeat(64)}),HASH),null);
  assert.equal(parseValidatedTx(raw("terRETRY"),HASH),null);
  assert.equal(parseValidatedTx(raw("tesSUCCESS", {ledger_hash:undefined}),HASH),null);
});
test("corroboration requires two agreeing independent reports", async () => {
  const got = await corroborateAutopsy(HASH,{servers:twoServers,fetchFn:known});
  assert.equal(got.status,"VERIFIED_FACT");
  assert.equal(got.disposition,"SUCCESS");
  assert.equal(got.ledgerHash,LEDGER_HASH);
  assert.deepEqual(got.evidenceSources,["providerA","providerB"]);
  assert.equal(got.simulated,false);
});
test("one upstream unavailable yields UNKNOWN, never FAILED", async () => {
  let i = 0;
  const fetchFn = async () => i++ === 0 ? fakeResponse(raw()) : Promise.reject(Error("offline"));
  const got = await corroborateAutopsy(HASH,{servers:twoServers,fetchFn});
  assert.equal(got.status,"UNKNOWN");
  assert.equal(got.disposition,"UNKNOWN");
  assert.deepEqual(got.reasonCodes,["INDEPENDENT_EVIDENCE_UNAVAILABLE"]);
});
test("conflicting verified ledgers yield UNKNOWN", async () => {
  let i = 0;
  const fetchFn = async () => fakeResponse(raw("tesSUCCESS",{ledger_hash:i++ === 0 ? LEDGER_HASH : "C".repeat(64)}));
  const got = await corroborateAutopsy(HASH,{servers:twoServers,fetchFn});
  assert.equal(got.status,"UNKNOWN");
  assert.deepEqual(got.reasonCodes,["UPSTREAM_EVIDENCE_DISAGREEMENT"]);
});
test("fee-only tec result is not a successful transfer", async () => {
  const fetchFn = async () => fakeResponse(raw("tecNO_DST"));
  const got = await corroborateAutopsy(HASH,{servers:twoServers,fetchFn});
  assert.equal(got.disposition,"FAILED");
  assert.deepEqual(got.reasonCodes,["tecNO_DST"]);
});
test("gateway authenticates, validates inputs and throttles", async () => {
  const gateway = createAutopsyGateway({
    apiKey: SECRET, limit: 5, lookup: async hash => ({ hash, status:"UNKNOWN", simulated:false }),
  });
  await new Promise(resolve=>gateway.listen(0,"127.0.0.1",resolve));
  try {
    const base = "http://127.0.0.1:" + gateway.address().port;
    const post = (key, data) => fetch(base+"/v1/xrpl/transactions/autopsy",{
      method:"POST", headers: {
        "authorization": "Bearer "+key, "content-type":"application/json",
      }, body:JSON.stringify(data),
    });
    assert.equal((await post("wrong", {hash:HASH,network:"xrpl-mainnet"})).status,401);
    assert.equal((await post(SECRET, {hash:"bad",network:"xrpl-mainnet"})).status,400);
    const ok = await post(SECRET,{hash:HASH,network:"xrpl-mainnet"});
    assert.equal(ok.status,200);
    assert.equal((await ok.json()).status,"UNKNOWN");
    assert.equal((await post(SECRET,{hash:HASH,network:"xrpl-mainnet"})).status,200);
    assert.equal((await post(SECRET,{hash:HASH,network:"xrpl-mainnet"})).status,200);
    assert.equal((await post(SECRET,{hash:HASH,network:"xrpl-mainnet"})).status,429);
  } finally {
    await new Promise((resolve,reject)=>gateway.close(err=>err?reject(err):resolve()));
  }
});
test("no local gateway can run with a missing/short secret", () => {
  assert.throws(() => createAutopsyGateway({apiKey:"short"}),/32/);
});

test("payment destination must agree across providers",async()=>{
 const destination="rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
 const other="r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59";
 const response=d=>fakeResponse(raw("tesSUCCESS",{tx_json:{TransactionType:"Payment",Destination:d}}));
 const good=await corroborateAutopsy(HASH,{servers:twoServers,fetchFn:async()=>response(destination)});
 assert.equal(good.paymentDestination,destination);
 const bad=await corroborateAutopsy(HASH,{servers:twoServers,fetchFn:async url=>response(url===twoServers[0].url?destination:other)});
 assert.equal(bad.status,"UNKNOWN");
 assert.deepEqual(bad.reasonCodes,["UPSTREAM_EVIDENCE_DISAGREEMENT"]);
});

test("delivered issued asset identity requires matching provider metadata",async()=>{
 const destination="rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
 const issuer="r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59";
 const response=(delivered,code="tesSUCCESS")=>fakeResponse(raw(code,{
  tx_json:{TransactionType:"Payment",Destination:destination,DeliverMax:{issuer,currency:"EUR",value:"100"}},
  meta:{TransactionResult:code,delivered_amount:delivered}}));
 const asset={issuer,currency:"USD",value:"10"};
 const good=await corroborateAutopsy(HASH,{servers:twoServers,fetchFn:async()=>response(asset)});
 assert.deepEqual(good.paymentAsset,{issuer,currency:"USD"});
 const bad=await corroborateAutopsy(HASH,{servers:twoServers,fetchFn:async url=>response(url===twoServers[0].url?asset:{...asset,currency:"EUR"})});
 assert.equal(bad.status,"UNKNOWN");
 for(const delivered of ["unavailable","1000",undefined,{issuer,currency:123}]){
  const r=await corroborateAutopsy(HASH,{servers:twoServers,fetchFn:async()=>response(delivered)});
  assert.equal(r.paymentAsset,null);
 }
 const failed=await corroborateAutopsy(HASH,{servers:twoServers,fetchFn:async()=>response(asset,"tecNO_DST")});
 assert.equal(failed.paymentAsset,null);
});
