/**
 * Read-only pinned XRPL AccountRoot lookup across two fixed RPC providers.
 * Research only; no signing, account credentials or public HTTP endpoint.
 */
import { UPSTREAMS } from "./autopsy-gateway.mjs";
import { corroboratePinnedAccountRoot, parsePinnedAccountRoot } from "./xrpl-account-root-evidence.mjs";
const HEX64=/^[A-F0-9]{64}$/i;
const ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const MAX_BYTES=1024*1024;

export async function fetchPinnedAccountInfo(server,request,fetchFn=fetch){
  if (!UPSTREAMS.some(s=>s.name===server?.name && s.url===server.url))
    throw new Error("UNTRUSTED_RPC_SERVER");
  if (!ADDRESS.test(request?.account??"") || !HEX64.test(request?.ledgerHash??""))
    throw new Error("INVALID_PINNED_REQUEST");
  const response=await fetchFn(server.url,{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(4500),
    headers:{"content-type":"application/json","accept":"application/json"},
    body:JSON.stringify({method:"account_info",params:[{
      account:request.account,ledger_hash:request.ledgerHash.toUpperCase(),
      api_version:2,
    }]}),
  });
  if (!response?.ok) throw new Error("UPSTREAM_HTTP_FAILURE");
  const declared=Number(response.headers?.get?.("content-length")??0);
  if (!Number.isFinite(declared)||declared<0||declared>MAX_BYTES) throw new Error("UPSTREAM_RESPONSE_TOO_LARGE");
  if (!response.body) throw new Error("UPSTREAM_EMPTY_BODY");
  const chunks=[];let size=0;
  for await(const chunk of response.body){
    size+=chunk.byteLength;
    if(size>MAX_BYTES) throw new Error("UPSTREAM_RESPONSE_TOO_LARGE");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function lookupPinnedAccountRoot(request,{servers=UPSTREAMS,fetchFn=fetch}={}){
  const base={schema:"noshashi.xrpl.account-root.corroborated.v0",
    status:"UNKNOWN",account:request?.account??null,
    ledgerHash:typeof request?.ledgerHash==="string"?request.ledgerHash.toUpperCase():null,
    requireDestinationTag:null,globalFreeze:null,requireAuth:null,reasonCodes:[],sourceCount:0,
    independentlyAuthenticated:false};
  if(!ADDRESS.test(request?.account??"")||!HEX64.test(request?.ledgerHash??""))
    return {...base,reasonCodes:["INVALID_PINNED_REQUEST"]};
  if(!Array.isArray(servers)||servers.length!==2||
     servers[0]?.name===servers[1]?.name||servers[0]?.url===servers[1]?.url||
     !servers.every(s=>UPSTREAMS.some(known=>known.url===s.url&&known.name===s.name)))
    return {...base,reasonCodes:["INDEPENDENT_SOURCES_NOT_CONFIGURED"]};
  const results=await Promise.allSettled(servers.map(s=>fetchPinnedAccountInfo(s,request,fetchFn)));
  const diagnostics=results.map((r,index)=>{
    const observation=r.status==="fulfilled"?parsePinnedAccountRoot(r.value,request):null;
    return {provider:servers[index].name,status:observation?.status??"UNKNOWN",
      reasonCodes:observation?.reasonCodes??["PROVIDER_REQUEST_FAILED"]};
  });
  if(results.some(r=>r.status!=="fulfilled"))
    return {...base,reasonCodes:["PINNED_ACCOUNT_EVIDENCE_UNAVAILABLE"],
      providerDiagnostics:diagnostics};
  return {...corroboratePinnedAccountRoot(results[0].value,results[1].value,request),
    evidenceSources:servers.map(s=>s.name),providerDiagnostics:diagnostics};
}
