export const MAX_AGE_MS=180000;
export const ENDPOINTS=['https://xrplcluster.com','https://s1.ripple.com:51234','https://s2.ripple.com:51234'];
export function reportFresh(report,now=Date.now()){
 const t=typeof report?.retrieved_at==='string'?Date.parse(report.retrieved_at):NaN;
 if(!Number.isFinite(t)||t>now+60000)return false;
 if(now-t>MAX_AGE_MS)return false;
 if(report.mode==='issuer'){const closed=Date.parse(report.ledger_closed_at);if(!Number.isFinite(closed)||now-closed>300000||closed>now+60000)return false;}
 return true;
}
export async function verifyTerminalResponse(value,expected,now=Date.now()){
 const r=value?.report;
 if(!r||r.schema!=='noshashi.cloud-terminal.v1'||r.network!=='XRPL Mainnet'||!['issuer','payment'].includes(r.mode)||r.mode!==expected.mode)throw new Error('Unexpected evidence format or network.');
 if(JSON.stringify(r.subject)!==JSON.stringify(expected))throw new Error('The returned investigation does not match these inputs.');
 if(!['VERIFIED','PARTIAL','STALE','UNVALIDATED'].includes(r.status)||!Array.isArray(r.sources)||r.sources.length<1||r.sources.length>2||r.sources.some(s=>!ENDPOINTS.includes(s.endpoint)||!['account_info','ledger','tx'].includes(s.method)))throw new Error('Source provenance is incomplete.');
 if((r.mode==='issuer'&&r.sources[0].method!=='account_info')||(r.mode==='payment'&&r.sources[0].method!=='tx'))throw new Error('Source method does not match the investigation.');
 if(!Array.isArray(r.missing)||!r.facts||!Array.isArray(r.limitations)||typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.sha256))throw new Error('Evidence integrity metadata is missing.');
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(r))))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(digest!==value.sha256)throw new Error('The evidence hash does not match.');
 if(r.status==='VERIFIED'&&(r.validated!==true||!Number.isSafeInteger(r.ledger_index)||r.ledger_index<=0||r.missing.length))throw new Error('Complete validated evidence was not established.');
 if(r.status==='VERIFIED'){
  if((r.mode==='issuer'&&(r.sources.length!==2||r.sources[1].method!=='ledger'))||(r.mode==='payment'&&r.sources.length!==1))throw new Error('Complete source provenance is missing.');
  if(r.mode==='issuer'&&(!Number.isInteger(r.facts.flags)||r.facts.issuer!==expected.issuer||r.facts.currency_context!==expected.currency||['no_freeze','global_freeze','require_auth','allow_clawback','master_disabled','signer_list_present'].some(k=>typeof r.facts[k]!=='boolean')))throw new Error('Issuer evidence fields are incomplete.');
  if(r.mode==='payment'&&(r.facts.transaction_hash!==expected.hash||r.facts.validated!==true||typeof r.facts.result!=='string'||typeof r.facts.transaction_type!=='string'||(r.facts.delivery_state==='DELIVERED'&&(!r.facts.delivered||typeof r.facts.delivered.value!=='string'||typeof r.facts.delivered.currency!=='string'))))throw new Error('Payment evidence fields are incomplete.');
 }
 return {report:r,sha256:value.sha256,exportable:r.status==='VERIFIED'&&reportFresh(r,now)};
}
export function exportAllowed(value,now=Date.now()) {return !!value?.exportable&&value.report.status==='VERIFIED'&&value.report.validated===true&&reportFresh(value.report,now);}
