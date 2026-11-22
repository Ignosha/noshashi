import { test } from "node:test";
import assert from "node:assert/strict";
import { createDevServer, fixtureAutopsy, SAMPLE_HASH } from "./marketplace-dev.mjs";
test("synthetic fixture never masquerades as a live lookup", () => {
  const known = fixtureAutopsy({network:"xrpl-mainnet",hash:SAMPLE_HASH});
  assert.equal(known.code,200);
  assert.equal(known.value.simulated,true);
  assert.equal(known.value.evidenceSource,"synthetic-fixture");
  assert.equal(known.value.disposition,"FAILED");
  const unknown = fixtureAutopsy({network:"xrpl-mainnet",hash:"B".repeat(64)});
  assert.equal(unknown.value.status,"UNKNOWN");
  assert.equal(unknown.value.validated,false);
});
test("invalid input fails before lookup", () => {
  assert.equal(fixtureAutopsy({network:"xrpl-mainnet",hash:"bad"}).code,400);
  assert.equal(fixtureAutopsy({network:"other",hash:SAMPLE_HASH}).code,400);
  assert.equal(fixtureAutopsy({network:"xrpl-mainnet",hash:SAMPLE_HASH,extra:true}).code,400);
});
test("local HTTP route accepts JSON and rejects unsupported paths", async () => {
  const server=createDevServer();
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {
    const addr=server.address();
    const base=`http://127.0.0.1:${addr.port}`;
    const script=await fetch(base+"/marketplace/marketplace.js");
    assert.equal(script.status,200);
    assert.match(script.headers.get("content-type"), /javascript/);
    const health=await fetch(base+"/health");
    assert.equal(health.status,200);
    assert.equal((await health.json()).mode,"synthetic-fixtures");
    const response=await fetch(base+"/v1/xrpl/transactions/autopsy",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({network:"xrpl-mainnet",hash:SAMPLE_HASH})});
    assert.equal(response.status,200);
    assert.equal((await response.json()).simulated,true);
    const invalid=await fetch(base+"/v1/xrpl/transactions/autopsy",{method:"POST",headers:{"content-type":"application/json"},body:"{"});
    assert.equal(invalid.status,400);
    assert.equal((await fetch(base+"/missing")).status,404);
  } finally {
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  }
});
