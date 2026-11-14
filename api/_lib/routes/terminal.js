import {createHash} from 'node:crypto';
import {rippleRpcWithSource} from '../authority.js';
import {queryOf} from '../query.js';
import {take,clientKey} from '../rate-limit.js';
import {terminalInput,issuerFacts,paymentFacts,assembleTerminal,NODE_ENDPOINTS} from '../terminal-model.js';
const cache=new Map();let inFlight=0;
const allowed=new Set(['tool','mode','issuer','currency','hash','__path']);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({code:'METHOD',error:'GET required. No ledger submission is supported.'});}
 let input;
 try{
  if(String(req.url||'').length>800)throw new Error('Request too long.');
  const q=queryOf(req);if(Object.keys(q).some(k=>!allowed.has(k)))throw new Error('Unsupported parameter.');
  const url=new URL(req.url||'/', 'http://localhost');for(const k of url.searchParams.keys()){if(!allowed.has(k))throw new Error('Unsupported parameter.');if(url.searchParams.getAll(k).length>1)throw new Error('Repeated parameters are not allowed.');}
  input=terminalInput(q);
 }catch(e){return res.status(400).json({code:'INVALID',error:e.message});}
 const gate=take(`terminal:caller:${clientKey(req)}`,{limit:6});
 if(!gate.ok){res.setHeader('Retry-After',String(gate.retryAfter));return res.status(429).json({code:'RATE_LIMIT',error:'Demo limit reached. Wait before another read.'});}
 const key=JSON.stringify(input),saved=cache.get(key);
 if(saved&&Date.now()-saved.at<30000)return res.status(200).json(saved.value);
 if(inFlight>=2){res.setHeader('Retry-After','10');return res.status(429).json({code:'BUSY',error:'Demo reads are busy. Retry after ten seconds.'});}
 const budget=take('terminal:instance-budget',{limit:30});if(!budget.ok){res.setHeader('Retry-After',String(budget.retryAfter));return res.status(429).json({code:'RATE_LIMIT',error:'Demo provider budget reached. Retry later.'});}
 inFlight++;
 try{
  const sources=[];const read=async(method,params)=>{const r=await rippleRpcWithSource(method,params,1800);if(!NODE_ENDPOINTS.includes(r.endpoint))throw new Error('Unexpected provider');sources.push({method,endpoint:r.endpoint});return r.result;};
  let data;
  if(input.mode==='issuer'){
   const result=await read('account_info',{account:input.issuer,ledger_index:'validated',signer_lists:true});
   let header=null;if(result.validated===true&&Number.isSafeInteger(result.ledger_index)&&result.ledger_index>0){try{header=await read('ledger',{ledger_index:result.ledger_index,transactions:false,expand:false});}catch{/* Account facts remain partial without age evidence. */}}
   data=issuerFacts(input,result,header);
  }else data=paymentFacts(input,await read('tx',{transaction:input.hash,binary:false}));
  const report=assembleTerminal(input,data,sources);const value={report,sha256:createHash('sha256').update(JSON.stringify(report)).digest('hex')};
  if(report.status==='VERIFIED'){if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,{value,at:Date.now()});}
  return res.status(200).json(value);
 }catch(e){
  if(['actNotFound','txnNotFound'].includes(e?.code))return res.status(404).json({code:'NOT_FOUND',error:'No result was returned by the public node. Check the identifier and network.'});
  if(/429|rate.?limit|tooBusy|slowDown/i.test(String(e?.code)+' '+String(e?.message))){res.setHeader('Retry-After','60');return res.status(429).json({code:'PROVIDER_LIMIT',error:'The public provider is limited. Retry later.'});}
  const timeout=/abort|timeout|timed out/i.test(String(e?.name)+' '+String(e?.message));return res.status(timeout?504:503).json({code:timeout?'TIMEOUT':'PROVIDER_FAILURE',error:timeout?'The public-node read timed out. No evidence substituted.':'A verified public-node reading is unavailable. No evidence substituted.'});
 }finally{inFlight--;}
}
