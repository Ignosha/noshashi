import { evaluateCase, stageFinding } from './research-case-model.js';
const root = document.getElementById('research-case');
if (root) {
  const $ = id => document.getElementById(id);
  const steps = [...root.querySelectorAll('[data-case-step]')];
  let current = 0, busy = false;
  function progress() { $('rf-progress').textContent = `Step ${current+1} of 6 · simulated investigation`; $('rf-next').textContent = current === 5 ? 'Return to step 1' : 'Next step →'; }
  function show(index) { current = index; for (let i=0;i<steps.length;i++) steps[i].open = i === current; progress(); }
  function render() {
    const report = evaluateCase($('rf-scenario').value);
    for (let i=0;i<steps.length;i++) {
      const f = stageFinding(report,i);
      root.querySelector(`[data-case-status="${i}"]`).textContent=f.status;
      root.querySelector(`[data-case-evidence="${i}"]`).textContent=f.evidence;
      root.querySelector(`[data-case-finding="${i}"]`).textContent=f.finding;
    }
    $('rf-decision').textContent=report.decision; $('rf-reason').textContent=report.reason;
    show(0); $('rf-export-status').textContent='Local sample export only. No information is sent or saved to an account.';
  }
  for (let i=0;i<steps.length;i++) steps[i].addEventListener('toggle',()=>{if(steps[i].open){current=i;progress();}});
  $('rf-controls').hidden=false; $('rf-scenario').disabled=false; $('rf-export').disabled=false;
  $('rf-next').addEventListener('click',()=>show((current+1)%6));
  $('rf-reset').addEventListener('click',()=>{$('rf-scenario').value='review';render();});
  $('rf-scenario').addEventListener('change',render);
  $('rf-export').addEventListener('click',()=>{
    if(busy)return; busy=true;
    try {
      const report=evaluateCase($('rf-scenario').value);
      const blob=new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'});
      const url=URL.createObjectURL(blob), a=document.createElement('a');
      a.href=url;a.download='NOSHASHI-SIMULATED-XRPL-001.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      $('rf-export-status').textContent='Simulated report downloaded. It contains no real transaction, signed attestation or legal clearance.';
    }catch{$('rf-export-status').textContent='Export unavailable. Read the sample findings above; no data was sent.';}
    finally{busy=false;}
  });
  progress();
}
