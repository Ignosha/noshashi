import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const script=fileURLToPath(new URL("./xrpl-trustline-live-diagnostic.mjs",import.meta.url));
function run(required){
 const env={...process.env,NOSHASHI_REQUIRE_LIVE_TRUSTLINE:required};
 for(const key of ["ISSUER","HOLDER","CURRENCY","LEDGER_HASH"])
  delete env["NOSHASHI_TRUSTLINE_"+key];
 return spawnSync(process.execPath,[script],{env,encoding:"utf8",timeout:10000});
}
test("optional diagnostic reports skipped without claiming live success",()=>{
 const r=run("0");
 assert.equal(r.status,0);
 assert.equal(JSON.parse(r.stdout).status,"SKIPPED");
});
test("mandatory diagnostic fails when live fixture is missing",()=>{
 const r=run("1");
 assert.equal(r.status,1);
 assert.equal(JSON.parse(r.stdout).status,"SKIPPED");
 assert.ok(JSON.parse(r.stdout).reasonCodes.includes("LIVE_TRUSTLINE_FIXTURE_NOT_CONFIGURED"));
});
