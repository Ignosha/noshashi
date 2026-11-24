"use strict";
/* Static, explicitly synthetic demonstration. No network or credential access. */
const H="A".repeat(64);
const scenarios=Object.freeze({
  unchanged:{title:"Unchanged controls",ledgerResult:"tesSUCCESS (illustrative)",ledger:"90,000,000 (synthetic)",sources:"Synthetic fixture only",classification:"SIMULATED / NOT VERIFIED",change:"No modeled change",reason:"EXTERNAL_APPROVAL_REQUIRED"},
  freeze:{title:"Issuer freeze after approval",ledgerResult:"tesSUCCESS (illustrative)",ledger:"90,000,001 (synthetic)",sources:"Synthetic fixture only",classification:"SIMULATED / NOT VERIFIED",change:"IssuerGlobalFreeze: false → true",reason:"MATERIAL_APPROVAL_DRIFT"},
  missing:{title:"Evidence unavailable",ledgerResult:"UNKNOWN",ledger:"UNKNOWN",sources:"No corroborated providers",classification:"SIMULATED / UNKNOWN",change:"Cannot compare",reason:"INDEPENDENT_EVIDENCE_UNAVAILABLE"},
});
let selected="unchanged";
const $=id=>document.getElementById(id);
function payload(scenario){
 const s=scenarios[scenario];
 return {schema:"noshashi.case-review.demo.v0",scenario,synthetic:true,network:"xrpl-mainnet",
 transactionHash:H,ledgerResult:s.ledgerResult,ledgerIndex:s.ledger,
 evidenceSources:s.sources,evidenceClassification:s.classification,
 verdict:"HOLD",authorizationGranted:false,controlEvidenceAuthenticated:false,
 changedControl:s.change,reasonCodes:[s.reason],receipt:null,
 notice:"Illustrative fixture only. No XRPL RPC call, signed receipt, or customer policy authentication."};
}
function render(){
 const s=scenarios[selected];
 $("hash").textContent=H.slice(0,12)+"…"+H.slice(-10)+" (fixture)";
 $("tx-status").textContent=s.ledgerResult;
 $("ledger").textContent=s.ledger;
 $("sources").textContent=s.sources;
 $("classification").textContent=s.classification;
 $("change").textContent=s.change;
 $("reason").textContent=s.reason;
 $("receipt-label").textContent=selected==="missing"?
   "No receipt: transaction evidence unavailable.":
   "No authenticated receipt in the static preview; real backend research digest is a separate local module.";
 $("case-json").textContent=JSON.stringify(payload(selected),null,2);
 document.querySelectorAll("[data-scenario]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.scenario===selected)));
}
document.querySelectorAll("[data-scenario]").forEach(button=>button.addEventListener("click",()=>{
 if(Object.hasOwn(scenarios,button.dataset.scenario)){selected=button.dataset.scenario;render();}
}));
$("export-case").addEventListener("click",()=>{
 const blob=new Blob([JSON.stringify(payload(selected),null,2)+"\n"],{type:"application/json"});
 const url=URL.createObjectURL(blob);
 const link=document.createElement("a");
 link.href=url;link.download="noshashi-synthetic-case-"+selected+".json";
 link.click();
 URL.revokeObjectURL(url);
});
render();
