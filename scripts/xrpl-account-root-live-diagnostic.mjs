/**
 * Live read-only diagnostic, NOT a pass/fail security certification.
 * Uses a validated ledger hash from a fixed provider, then queries both
 * pinned AccountRoot endpoints. UNKNOWN is a recorded non-success result.
 */
import {UPSTREAMS} from "./autopsy-gateway.mjs";
import {lookupPinnedAccountRoot} from "./xrpl-account-root-lookup.mjs";
const account="rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
async function ledgerHash(){
  const res=await fetch(UPSTREAMS[0].url,{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(4500),
    headers:{"content-type":"application/json"},
    body:JSON.stringify({method:"ledger",params:[{ledger_index:"validated",transactions:false,expand:false}]}),
  });
  if(!res.ok)throw Error("LEDGER_HTTP_FAILURE");
  const data=await res.json();
  const ledger=data?.result?.ledger;
  const hash=ledger?.ledger_hash??data?.result?.ledger_hash;
  if(!/^[0-9A-F]{64}$/i.test(hash??""))throw Error("VALIDATED_LEDGER_HASH_UNAVAILABLE");
  return hash.toUpperCase();
}
let result;
try{
 const hash=await ledgerHash();
 const evidence=await lookupPinnedAccountRoot({account,ledgerHash:hash});
 result={status:evidence.status,ledgerHash:hash,account,
   requireDestinationTag:evidence.requireDestinationTag,
   globalFreeze:evidence.globalFreeze,
   reasonCodes:evidence.reasonCodes??[],
   note:"Two RPC observations; not cryptographic proof of consensus"};
}catch{
 result={status:"UNKNOWN",account,reasonCodes:["LIVE_LEDGER_DIAGNOSTIC_UNAVAILABLE"]};
}
console.log(JSON.stringify(result,null,2));
if(result.status!=="CORROBORATED")
 console.log("Live pinned control evidence NOT verified. Do not claim this check passed.");
