/**
 * Read-only RippleState ledger_entry lookup, pinned to a requested ledger hash.
 * Fixed upstreams, bounded response, no wallet access, no public endpoint.
 */
import {UPSTREAMS} from "./autopsy-gateway.mjs";
import {corroboratePinnedTrustLine,parsePinnedTrustLine} from "./xrpl-trustline-evidence.mjs";
const ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const HEX64=/^[A-F0-9]{64}$/i;
const CURRENCY=/^([A-Z0-9]{3}|[A-F0-9]{40})$/i;
const MAX_BYTES=1024*1024;
function valid(request){
 return request&&typeof request==="object"&&!Array.isArray(request)&&
  ADDRESS.test(request.issuer??"")&&ADDRESS.test(request.holder??"")&&
  request.issuer!==request.holder&&CURRENCY.test(request.currency??"")&&
  HEX64.test(request.ledgerHash??"");
}
export async function fetchPinnedTrustLine(server,request,fetchFn=fetch){
 if(!UPSTREAMS.some(s=>s.name===server?.name&&s.url===server?.url))
  throw Error("UNTRUSTED_RPC_SERVER");
 if(!valid(request))throw Error("INVALID_TRUSTLINE_REQUEST");
 const response=await fetchFn(server.url,{
  method:"POST",redirect:"error",signal:AbortSignal.timeout(4500),
  headers:{"content-type":"application/json","accept":"application/json"},
  body:JSON.stringify({method:"ledger_entry",params:[{
   ripple_state:{accounts:[request.issuer,request.holder],
    currency:request.currency.toUpperCase()},
   ledger_hash:request.ledgerHash.toUpperCase(),api_version:2,
  }]}),
 });
 if(!response.ok)throw Error("UPSTREAM_HTTP_FAILURE");
 const declared=Number(response.headers?.get?.("content-length")??0);
 if(!Number.isFinite(declared)||declared>MAX_BYTES)
  throw Error("UPSTREAM_RESPONSE_TOO_LARGE");
 if(!response.body)throw Error("UPSTREAM_EMPTY_BODY");
 const chunks=[];let size=0;
 for await(const chunk of response.body){
  size+=chunk.byteLength;
  if(size>MAX_BYTES)throw Error("UPSTREAM_RESPONSE_TOO_LARGE");
  chunks.push(Buffer.from(chunk));
 }
 return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function lookupPinnedTrustLine(request,{servers=UPSTREAMS,fetchFn=fetch}={}){
 const base={schema:"noshashi.xrpl.trustline.corroborated.v0",
  status:"UNKNOWN",issuer:request?.issuer??null,holder:request?.holder??null,
  currency:request?.currency??null,
  ledgerHash:typeof request?.ledgerHash==="string"?request.ledgerHash.toUpperCase():null,
  trustLineFrozen:null,trustLineAuthorized:null,reasonCodes:[],
  independentlyAuthenticated:false,evidenceSources:[]};
 if(!valid(request))return {...base,reasonCodes:["INVALID_TRUSTLINE_REQUEST"]};
 if(!Array.isArray(servers)||servers.length!==2||
    servers[0]?.name===servers[1]?.name||servers[0]?.url===servers[1]?.url||
    !servers.every(s=>UPSTREAMS.some(k=>k.name===s.name&&k.url===s.url)))
  return {...base,reasonCodes:["INDEPENDENT_SOURCES_NOT_CONFIGURED"]};
 const responses=await Promise.allSettled(servers.map(s=>fetchPinnedTrustLine(s,request,fetchFn)));
 const providerDiagnostics=responses.map((r,index)=>{
  const observation=r.status==="fulfilled"?parsePinnedTrustLine(r.value,request):null;
  return {provider:servers[index].name,status:observation?.status??"UNKNOWN",
   reasonCodes:observation?.reasonCodes??["PROVIDER_REQUEST_FAILED"]};
 });
 if(responses.some(r=>r.status!=="fulfilled"))
  return {...base,reasonCodes:["TRUSTLINE_EVIDENCE_UNAVAILABLE"],providerDiagnostics};
 return {...corroboratePinnedTrustLine(responses[0].value,responses[1].value,request),
  evidenceSources:servers.map(s=>s.name),providerDiagnostics};
}
