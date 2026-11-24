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
const LSF_LOW_DEEP_FREEZE=0x02000000;
const LSF_HIGH_DEEP_FREEZE=0x04000000;
// Three-character codes encode literal bytes. Hex letter case has no effect.
export function normalizeIssuedCurrency(currency) {
 if(typeof currency!=="string") return null;
 if(/^[A-Fa-f0-9]{40}$/.test(currency)) return currency.toUpperCase();
 if(/^[A-Za-z0-9]{3}$/.test(currency)&&currency!=="XRP") return currency;
 return null;
}
export function parsePinnedTrustLine(raw,{issuer,holder,currency,ledgerHash}={}){
 const currencyIdentity=normalizeIssuedCurrency(currency);
 const base={schema:"noshashi.xrpl.trustline.observation.v0",status:"UNKNOWN",
  issuer:issuer??null,holder:holder??null,currency:currency??null,
  ledgerHash:typeof ledgerHash==="string"?ledgerHash.toUpperCase():null,
  trustLineFrozen:null,trustLineAuthorized:null,
  issuerDeepFrozen:null,holderDeepFrozen:null,ledgerIndex:null,reasonCodes:[]};
 if(!ADDRESS.test(issuer??"")||!ADDRESS.test(holder??"")||issuer===holder||
    !currencyIdentity||
    !HEX64.test(ledgerHash??""))
  return {...base,reasonCodes:["INVALID_TRUSTLINE_REQUEST"]};
 const r=raw?.result??raw;
 if(!r||typeof r!=="object"||r.status==="error"||r.error)
  return {...base,reasonCodes:["TRUSTLINE_EVIDENCE_UNAVAILABLE"]};
 if(r.validated!==true||typeof r.ledger_hash!=="string"||
    r.ledger_hash.toUpperCase()!==ledgerHash.toUpperCase())
  return {...base,reasonCodes:["PINNED_LEDGER_UNVERIFIED"]};
 if(!Number.isSafeInteger(r.ledger_index)||r.ledger_index<=0)
  return {...base,reasonCodes:["LEDGER_INDEX_INVALID"]};
 const node=r.node??r.ledger_entry;
 if(!node||node.LedgerEntryType!=="RippleState"||
    !Number.isSafeInteger(node.Flags)||node.Flags<0||node.Flags>0xffffffff)
  return {...base,reasonCodes:["TRUSTLINE_ENTRY_INVALID"]};
 const low=node.LowLimit,high=node.HighLimit;
 if(!low||!high||typeof low.issuer!=="string"||typeof high.issuer!=="string"||
    low.issuer===high.issuer||
    ![issuer,holder].includes(low.issuer)||![issuer,holder].includes(high.issuer)||
    normalizeIssuedCurrency(low.currency)!==currencyIdentity||
    normalizeIssuedCurrency(high.currency)!==currencyIdentity)
  return {...base,reasonCodes:["TRUSTLINE_IDENTITY_MISMATCH"]};
 const issuerLow=low.issuer===issuer;
 const freezeFlag=issuerLow?LSF_LOW_FREEZE:LSF_HIGH_FREEZE;
 const authFlag=issuerLow?LSF_LOW_AUTH:LSF_HIGH_AUTH;
 return {...base,status:"OBSERVED",ledgerIndex:r.ledger_index,
   trustLineFrozen:(node.Flags&freezeFlag)!==0,
   trustLineAuthorized:(node.Flags&authFlag)!==0,
   issuerDeepFrozen:(node.Flags&(issuerLow?LSF_LOW_DEEP_FREEZE:LSF_HIGH_DEEP_FREEZE))!==0,
   holderDeepFrozen:(node.Flags&(issuerLow?LSF_HIGH_DEEP_FREEZE:LSF_LOW_DEEP_FREEZE))!==0,
   reasonCodes:[]};
}
export function corroboratePinnedTrustLine(a,b,request){
 const left=parsePinnedTrustLine(a,request),right=parsePinnedTrustLine(b,request);
 const base={schema:"noshashi.xrpl.trustline.corroborated.v0",status:"UNKNOWN",
   issuer:request?.issuer??null,holder:request?.holder??null,
   currency:request?.currency??null,
   ledgerHash:typeof request?.ledgerHash==="string"?request.ledgerHash.toUpperCase():null,
   trustLineFrozen:null,trustLineAuthorized:null,
  issuerDeepFrozen:null,holderDeepFrozen:null,ledgerIndex:null,
   independentlyAuthenticated:false,reasonCodes:[]};
 if(left.status!=="OBSERVED"||right.status!=="OBSERVED")
  return {...base,reasonCodes:["TRUSTLINE_EVIDENCE_UNAVAILABLE"]};
 if(left.ledgerIndex!==right.ledgerIndex)
  return {...base,reasonCodes:["TRUSTLINE_LEDGER_INDEX_DISAGREEMENT"]};
 if(left.trustLineFrozen!==right.trustLineFrozen||
    left.trustLineAuthorized!==right.trustLineAuthorized||
    left.issuerDeepFrozen!==right.issuerDeepFrozen||left.holderDeepFrozen!==right.holderDeepFrozen)
  return {...base,reasonCodes:["TRUSTLINE_PROVIDER_DISAGREEMENT"]};
 return {...base,status:"CORROBORATED",ledgerIndex:left.ledgerIndex,
  trustLineFrozen:left.trustLineFrozen,
  trustLineAuthorized:left.trustLineAuthorized,
  issuerDeepFrozen:left.issuerDeepFrozen,holderDeepFrozen:left.holderDeepFrozen};
}
