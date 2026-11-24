/**
 * XRPL account-root control evidence research parser.
 * Interprets destination-tag, global-freeze and RequireAuth flags from
 * AccountRoot at a requested validated ledger hash.
 * Callers must corroborate responses from independent providers separately.
 */
const HEX64=/^[A-F0-9]{64}$/i;
const ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const LSF_REQUIRE_DEST_TAG=0x00020000;
const LSF_GLOBAL_FREEZE=0x00400000;
const LSF_REQUIRE_AUTH=0x00040000;
export function parsePinnedAccountRoot(raw,{account,ledgerHash}={}) {
  const base={schema:"noshashi.xrpl.account-root.research.v0",status:"UNKNOWN",
    account:typeof account==="string"?account:null,
    ledgerHash:typeof ledgerHash==="string"?ledgerHash.toUpperCase():null,
    requireDestinationTag:null,globalFreeze:null,requireAuth:null,ledgerIndex:null,reasonCodes:[]};
  if(typeof account!=="string"||!ADDRESS.test(account)||
     typeof ledgerHash!=="string"||!HEX64.test(ledgerHash))
    return {...base,reasonCodes:["INVALID_PINNED_REQUEST"]};
  const r=raw?.result??raw;
  if(!r||typeof r!=="object"||r.status==="error"||r.error)
    return {...base,reasonCodes:["ACCOUNT_ROOT_UNAVAILABLE"]};
  // A provider must explicitly report the requested ledger hash; no latest
  // ledger fallback and no assumption that a response is validated.
  if(r.validated!==true||typeof r.ledger_hash!=="string"||
     r.ledger_hash.toUpperCase()!==ledgerHash.toUpperCase())
    return {...base,reasonCodes:["PINNED_LEDGER_UNVERIFIED"]};
  if(!Number.isSafeInteger(r.ledger_index)||r.ledger_index<=0)
    return {...base,reasonCodes:["LEDGER_INDEX_INVALID"]};
  const root=r.account_data;
  if(!root||root.LedgerEntryType!=="AccountRoot"||
     root.Account!==account||!Number.isSafeInteger(root.Flags)||
     root.Flags<0||root.Flags>0xffffffff)
    return {...base,reasonCodes:["ACCOUNT_ROOT_INVALID"]};
  return {...base,status:"OBSERVED",ledgerIndex:r.ledger_index,
    requireDestinationTag:(root.Flags&LSF_REQUIRE_DEST_TAG)!==0,
    globalFreeze:(root.Flags&LSF_GLOBAL_FREEZE)!==0,
    requireAuth:(root.Flags&LSF_REQUIRE_AUTH)!==0,
    reasonCodes:[]};
}
export function corroboratePinnedAccountRoot(a,b,request){
  const left=parsePinnedAccountRoot(a,request),right=parsePinnedAccountRoot(b,request);
  const base={schema:"noshashi.xrpl.account-root.corroborated.v0",
    status:"UNKNOWN",account:request?.account??null,
    ledgerHash:request?.ledgerHash?.toUpperCase?.()??null,
    requireDestinationTag:null,globalFreeze:null,requireAuth:null,ledgerIndex:null,reasonCodes:[],
    sourceCount:2,independentlyAuthenticated:false};
  if(left.status!=="OBSERVED"||right.status!=="OBSERVED")
    return {...base,reasonCodes:["PINNED_ACCOUNT_EVIDENCE_UNAVAILABLE"]};
  if(left.ledgerIndex!==right.ledgerIndex)
    return {...base,reasonCodes:["ACCOUNT_ROOT_LEDGER_INDEX_DISAGREEMENT"]};
  if(left.requireDestinationTag!==right.requireDestinationTag || left.globalFreeze!==right.globalFreeze || left.requireAuth!==right.requireAuth)
    return {...base,reasonCodes:["ACCOUNT_ROOT_PROVIDER_DISAGREEMENT"]};
  return {...base,status:"CORROBORATED",ledgerIndex:left.ledgerIndex,
    requireDestinationTag:left.requireDestinationTag,globalFreeze:left.globalFreeze,requireAuth:left.requireAuth};
}
