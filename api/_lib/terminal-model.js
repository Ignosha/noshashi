import { isValidClassicAddress } from './classic-address.js';
export const TERMINAL_SCHEMA='noshashi.cloud-terminal.v1';
export const NODE_ENDPOINTS=['https://xrplcluster.com','https://s1.ripple.com:51234','https://s2.ripple.com:51234'];
export const HASH=/^[A-Fa-f0-9]{64}$/;
export function terminalInput(q){
 const mode=q.mode;
 if(!['issuer','payment'].includes(mode))throw new Error('Choose issuer or payment.');
 if(mode==='payment'){
  if(typeof q.hash!=='string'||!HASH.test(q.hash))throw new Error('Enter exactly 64 hexadecimal transaction-hash characters.');
  if(q.issuer!==undefined||q.currency!==undefined)throw new Error('Payment lookup accepts a transaction hash only.');
  return {mode,hash:q.hash.toUpperCase()};
 }
 if(typeof q.issuer!=='string'||!isValidClassicAddress(q.issuer))throw new Error('Enter a checksum-valid XRPL classic issuer address.');
 if(typeof q.currency!=='string'||!(/^[A-Za-z0-9]{3}$/.test(q.currency)||HASH40.test(q.currency))||q.currency.toUpperCase()==='XRP'||/^0{40}$/.test(q.currency))throw new Error('Enter a three-character alphanumeric or 40-hex issued currency code, not native XRP.');
 if(q.hash!==undefined)throw new Error('Issuer lookup accepts issuer and currency only.');
 return {mode,issuer:q.issuer,currency:HASH40.test(q.currency)?q.currency.toUpperCase():q.currency};
}
const HASH40=/^[A-Fa-f0-9]{40}$/;
const index=n=>Number.isSafeInteger(n)&&n>0;
export function issuerFacts(input,result,header){
 if(result?.validated!==true||!index(result.ledger_index)||result.account_data?.Account!==input.issuer)throw new Error('Unverified issuer snapshot');
 const a=result.account_data,flags=a.Flags;const missing=[];
 const validFlags=Number.isInteger(flags)&&flags>=0&&flags<=0xffffffff;
 if(!validFlags)missing.push('Issuer Flags were not returned as a valid integer.');
 const rawLists=Array.isArray(result.signer_lists)?result.signer_lists:Array.isArray(a.signer_lists)?a.signer_lists:null;
 const readable=rawLists!==null&&rawLists.length<=1&&rawLists.every(l=>Number.isSafeInteger(l?.SignerQuorum)&&l.SignerQuorum>0&&Array.isArray(l.SignerEntries)&&l.SignerEntries.length>0&&l.SignerEntries.length<=32&&l.SignerEntries.every(e=>isValidClassicAddress(e?.SignerEntry?.Account)&&Number.isInteger(e.SignerEntry.SignerWeight)&&e.SignerEntry.SignerWeight>0&&e.SignerEntry.SignerWeight<=65535));
 const lists=readable?rawLists.map(l=>({SignerQuorum:l.SignerQuorum,SignerEntries:l.SignerEntries.map(e=>({SignerEntry:{Account:e.SignerEntry.Account,SignerWeight:e.SignerEntry.SignerWeight}}))})):null;
 if(lists===null)missing.push('Signer-list coverage is unknown.');
 const headerOk=header?.validated===true&&Number(header.ledger_index??header.ledger?.ledger_index)===result.ledger_index&&Number.isSafeInteger(header.ledger?.close_time)&&header.ledger.close_time>0;
 if(!headerOk)missing.push('Ledger close time could not be verified.');
 const control=(bit)=>validFlags?Boolean(flags&bit):null;
 return {ledger_index:result.ledger_index,validated:true,ledger_closed_at:headerOk?new Date((header.ledger.close_time+946684800)*1000).toISOString():null,missing,
  facts:{issuer:input.issuer,currency_context:input.currency,currency_issuance:'NOT_CHECKED',flags:validFlags?flags:null,no_freeze:control(0x00200000),global_freeze:control(0x00400000),require_auth:control(0x00040000),allow_clawback:control(0x80000000),master_disabled:control(0x00100000),signer_list_present:lists===null?null:lists.length>0},
  evidence:{account_data:{Account:a.Account,Flags:validFlags?flags:null},signer_lists:lists,ledger_header:headerOk?{ledger_index:result.ledger_index,close_time:header.ledger.close_time}:null}};
}
function delivered(raw){
 if(typeof raw==='string'&&/^\d{1,30}$/.test(raw)){const n=BigInt(raw);return {value:`${n/1000000n}.${(n%1000000n).toString().padStart(6,'0')}`,currency:'XRP',issuer:null};}
 if(raw&&typeof raw==='object'&&typeof raw.value==='string'&&/^\d{1,96}(?:\.\d{1,96})?(?:[eE][+-]?\d{1,3})?$/.test(raw.value)&&typeof raw.currency==='string'&&(/^[A-Za-z0-9]{3}$/.test(raw.currency)||HASH40.test(raw.currency))&&raw.currency!=='XRP'&&isValidClassicAddress(raw.issuer))return{value:raw.value,currency:raw.currency,issuer:raw.issuer};
 return null;
}
export function paymentFacts(input,result){
 const tx=result?.tx_json??result;const hash=result?.hash??tx?.hash;
 if(typeof hash!=='string'||hash.toUpperCase()!==input.hash)throw new Error('Transaction identity could not be verified');
 const validated=result.validated===true, ledger=index(result.ledger_index)?result.ledger_index:null;
 const meta=result.meta&&typeof result.meta==='object'&&!Array.isArray(result.meta)?result.meta:null;
 const type=typeof tx.TransactionType==='string'&&tx.TransactionType.length<64?tx.TransactionType:null;
 const code=typeof meta?.TransactionResult==='string'&&/^[A-Za-z0-9_]{1,80}$/.test(meta.TransactionResult)?meta.TransactionResult:null;
 const success=code==='tesSUCCESS', amount=validated&&type==='Payment'&&success?delivered(meta?.delivered_amount):null;
 const missing=[];if(validated&&type==='Payment'&&(!isValidClassicAddress(tx.Account)||!isValidClassicAddress(tx.Destination)))missing.push('Payment account identifiers unavailable.');if(validated&&code&&!/^tesSUCCESS$|^tec[A-Z0-9_]+$/.test(code))missing.push('Unrecognized validated transaction result.');if(validated&&!ledger)missing.push('Validated ledger index unavailable.');if(validated&&!code)missing.push('Transaction result unavailable.');if(!type)missing.push('Transaction type unavailable.');if(validated&&type==='Payment'&&success&&!amount)missing.push('Delivered amount unavailable; requested Amount is not substituted.');
 return {ledger_index:ledger,validated,ledger_closed_at:null,missing,
  facts:{transaction_hash:input.hash,transaction_type:type,result:code,validated,delivered:amount,delivery_state:!validated?'UNVALIDATED':type!=='Payment'?'NOT_A_PAYMENT':!success?'NOT_SUCCESSFUL':amount?'DELIVERED':'UNKNOWN',account:typeof tx.Account==='string'&&isValidClassicAddress(tx.Account)?tx.Account:null,destination:typeof tx.Destination==='string'&&isValidClassicAddress(tx.Destination)?tx.Destination:null},
  evidence:{hash:input.hash,ledger_index:ledger,validated,TransactionType:type,TransactionResult:code,delivered_amount:amount?meta.delivered_amount:null}};
}
export function assembleTerminal(input,data,sources,now=Date.now()){
 const retrieved_at=new Date(now).toISOString();let status=!data.validated?'UNVALIDATED':data.missing.length?'PARTIAL':'VERIFIED';
 if(input.mode==='issuer'&&data.ledger_closed_at){const age=now-Date.parse(data.ledger_closed_at);if(age>300000||age< -60000)status='STALE';}
 return {schema:TERMINAL_SCHEMA,network:'XRPL Mainnet',mode:input.mode,subject:input,status,validated:data.validated,ledger_index:data.ledger_index,ledger_closed_at:data.ledger_closed_at,retrieved_at,sources,missing:data.missing,facts:data.facts,evidence:data.evidence,limitations:['Public nodes are trusted sources, not independent consensus proofs.','Issuer permissions do not prove solvency, reserves, identity, legal rights or compliance.','Currency input is context; currency issuance, supply, trust lines and liquidity are not verified here.','A validated transaction is not proof of business authorization or legal settlement.','The SHA-256 digest detects changes; it is not a digital signature.']};
}
