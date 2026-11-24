import {test} from "node:test";
import assert from "node:assert/strict";
import {parsePinnedAccountRoot,corroboratePinnedAccountRoot} from "./xrpl-account-root-evidence.mjs";
const account="rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY",ledgerHash="B".repeat(64);
const request={account,ledgerHash};
const response=(flags=0)=>({result:{validated:true,ledger_index:100,ledger_hash:ledgerHash,
 account_data:{LedgerEntryType:"AccountRoot",Account:account,Flags:flags}}});
test("extracts RequireDestTag only from pinned validated AccountRoot",()=>{
 assert.equal(parsePinnedAccountRoot(response(0x00020000),request).requireDestinationTag,true);
 assert.equal(parsePinnedAccountRoot(response(0),request).requireDestinationTag,false);
});
test("rejects latest/unvalidated/mismatched ledger responses",()=>{
 const unvalidated=response();
 unvalidated.result.validated=false;
 assert.equal(parsePinnedAccountRoot(unvalidated,request).status,"UNKNOWN");
 const mismatch=response();
 mismatch.result.ledger_hash="C".repeat(64);
 assert.deepEqual(parsePinnedAccountRoot(mismatch,request).reasonCodes,["PINNED_LEDGER_UNVERIFIED"]);
 const missing=response();delete missing.result.ledger_hash;
 assert.equal(parsePinnedAccountRoot(missing,request).status,"UNKNOWN");
});
test("rejects mismatched account and invalid flags",()=>{
 const wrong=response();wrong.result.account_data.Account="rWrong";
 assert.deepEqual(parsePinnedAccountRoot(wrong,request).reasonCodes,["ACCOUNT_ROOT_INVALID"]);
 assert.equal(parsePinnedAccountRoot(response(-1),request).status,"UNKNOWN");
 assert.equal(parsePinnedAccountRoot(response(0x100000000),request).status,"UNKNOWN");
});
test("two corroborating provider observations produce read-only evidence",()=>{
 const result=corroboratePinnedAccountRoot(response(0x00020000),response(0x00020000),request);
 assert.equal(result.status,"CORROBORATED");
 assert.equal(result.requireDestinationTag,true);
 assert.equal(result.independentlyAuthenticated,false);
});
test("disagreement and missing provider evidence remain UNKNOWN",()=>{
 assert.deepEqual(corroboratePinnedAccountRoot(response(0),response(0x00020000),request).reasonCodes,["ACCOUNT_ROOT_PROVIDER_DISAGREEMENT"]);
 assert.deepEqual(corroboratePinnedAccountRoot(response(),null,request).reasonCodes,["PINNED_ACCOUNT_EVIDENCE_UNAVAILABLE"]);
});

test("parses issuer global freeze flag and fails closed on provider disagreement",()=>{
 const frozen=corroboratePinnedAccountRoot(response(0x00400000),response(0x00400000),request);
 assert.equal(frozen.status,"CORROBORATED");
 assert.equal(frozen.globalFreeze,true);
 assert.equal(frozen.requireDestinationTag,false);
 const disagree=corroboratePinnedAccountRoot(response(0x00400000),response(0),request);
 assert.equal(disagree.status,"UNKNOWN");
 assert.deepEqual(disagree.reasonCodes,["ACCOUNT_ROOT_PROVIDER_DISAGREEMENT"]);
});

test("RequireAuth issuer policy flag must match both pinned providers",()=>{
 const a=corroboratePinnedAccountRoot(response(0x00040000),response(0x00040000),request);
 assert.equal(a.status,"CORROBORATED");
 assert.equal(a.requireAuth,true);
 const b=corroboratePinnedAccountRoot(response(0x00040000),response(0),request);
 assert.equal(b.status,"UNKNOWN");
 assert.deepEqual(b.reasonCodes,["ACCOUNT_ROOT_PROVIDER_DISAGREEMENT"]);
});

test("requires an explicit positive ledger index that agrees across providers", () => {
 const first = response();
 const other = response();
 other.result.ledger_index = 101;
 const conflict = corroboratePinnedAccountRoot(first, other, request);
 assert.deepEqual(conflict.reasonCodes, ["ACCOUNT_ROOT_LEDGER_INDEX_DISAGREEMENT"]);
 assert.equal(conflict.ledgerIndex, null);
 delete other.result.ledger_index;
 assert.deepEqual(parsePinnedAccountRoot(other, request).reasonCodes, ["LEDGER_INDEX_INVALID"]);
});
