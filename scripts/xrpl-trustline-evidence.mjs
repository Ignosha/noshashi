/**
 * Offline, ledger-pinned RippleState interpretation.
 * This is research evidence, not payment authorization or consensus proof.
 */
const HEX64=/^[A-F0-9]{64}$/i;
const ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const LSF_LOW_AUTH=0x00010000;
const LSF_HIGH_AUTH=0x00020000;
const LSF_LOW_FREEZE=0x00400000;
const LSF_HIGH_FREEZE=0x00800000;
export function parsePinnedTrustLine(raw,{issuer,holder,currency,ledgerHash}={}){
 const base={schema:"noshashi.xrpl.trustline.observation.v0",status:"UNKNOWN",
  issuer:issuer??null,holder:holder??null,currency:currency??null,
  ledgerHash:typeof ledgerHash==="string"?ledgerHash.toUpperCase():null,
  trustLineFrozen:null,trustLineAuthorized:null,reasonCodes:[]};
 if(!ADDRESS.test(issuer??"")||!ADDRESS.test(holder??"")||issuer===holder||
    typeof currency!=="string"||!/^([A-Z0-9]{3}|[A-F0-9]{40})$/i.test(currency)||
    !HEX64.test(ledgerHash??""))
  return {...base,reasonCodes:["INVALID_TRUSTLINE_REQUEST"]};
 const r=raw?.result??raw;
 if(!r||typeof r!=="object"||r.status==="error"||r.error)
  return {...base,reasonCodes:["TRUSTLINE_EVIDENCE_UNAVAILABLE"]};
 if(r.validated!==true||typeof r.ledger_hash!=="string"||
    r.ledger_hash.toUpperCase()!==ledgerHash.toUpperCase())
  return {...base,reasonCodes:["PINNED_LEDGER_UNVERIFIED"]};
 const node=r.node??r.ledger_entry;
 if(!node||node.LedgerEntryType!=="RippleState"||
    !Number.isSafeInteger(node.Flags)||node.Flags<0||node.Flags>0xffffffff)
  return {...base,reasonCodes:["TRUSTLINE_ENTRY_INVALID"]};
 const low=node.LowLimit,high=node.HighLimit;
 if(!low||!high||typeof low.issuer!=="string"||typeof high.issuer!=="string"||
    low.issuer===high.issuer||
    !Number.isSafeInteger(r.ledger_index)||r.ledger_index<=0||
    ![issuer,holder].includes(low.issuer)||![issuer,holder].includes(high.issuer)||
    low.currency?.toUpperCase()!==currency.toUpperCase()||
    high.currency?.toUpperCase()!==currency.toUpperCase())
  return {...base,reasonCodes:["TRUSTLINE_IDENTITY_MISMATCH"]};
 const issuerLow=low.issuer===issuer;
 const freezeFlag=issuerLow?LSF_LOW_FREEZE:LSF_HIGH_FREEZE;
 const authFlag=issuerLow?LSF_LOW_AUTH:LSF_HIGH_AUTH;
 return {...base,status:"OBSERVED",
   trustLineFrozen:(node.Flags&freezeFlag)!==0,
   trustLineAuthorized:(node.Flags&authFlag)!==0,
   reasonCodes:[]};
}
export function corroboratePinnedTrustLine(a,b,request){
 const left=parsePinnedTrustLine(a,request),right=parsePinnedTrustLine(b,request);
 const base={schema:"noshashi.xrpl.trustline.corroborated.v0",status:"UNKNOWN",
   issuer:request?.issuer??null,holder:request?.holder??null,
   currency:request?.currency??null,
   ledgerHash:typeof request?.ledgerHash==="string"?request.ledgerHash.toUpperCase():null,
   trustLineFrozen:null,trustLineAuthorized:null,
   independentlyAuthenticated:false,reasonCodes:[]};
 if(left.status!=="OBSERVED"||right.status!=="OBSERVED")
  return {...base,reasonCodes:["TRUSTLINE_EVIDENCE_UNAVAILABLE"]};
 if(left.trustLineFrozen!==right.trustLineFrozen||
    left.trustLineAuthorized!==right.trustLineAuthorized)
  return {...base,reasonCodes:["TRUSTLINE_PROVIDER_DISAGREEMENT"]};
 return {...base,status:"CORROBORATED",
  trustLineFrozen:left.trustLineFrozen,
  trustLineAuthorized:left.trustLineAuthorized};
}
