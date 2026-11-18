
(function(){
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}
  function items(v){return String(v||"").split(/[\s,]+/).map(function(s){return s.trim();}).filter(Boolean);}
  var ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

  var f=document.getElementById("hi-form"), st=document.getElementById("hi-status"), out=document.getElementById("hi-out"), run=document.getElementById("hi-run");
  function render(h){
    var t=h.tally||{}, ev=h.events||[];
    var html='<div class="pv-tally">'+
      '<div><strong>'+(t.freezes||0)+'</strong>holders frozen</div>'+
      '<div><strong>'+(t.clawbacks||0)+'</strong>clawbacks</div>'+
      '<div><strong>'+(t.key_changes||0)+'</strong>key or signer changes</div>'+
      '<div><strong>'+(t.power_changes||0)+'</strong>changes to its powers</div></div>';
    if(!ev.length){html+='<p>No authority change by this issuer was found in the transactions read.</p>';}
    else{
      html+='<table class="pv-table"><thead><tr><th>Date (UTC)</th><th>What happened</th><th>Ledger</th></tr></thead><tbody>';
      ev.slice().reverse().forEach(function(e){
        html+='<tr><td class="mono">'+esc(String(e.date||"").slice(0,10))+'</td><td data-sev="'+esc(e.severity)+'">'+esc(e.summary)+
          '</td><td class="mono"><a href="https://livenet.xrpl.org/transactions/'+encodeURIComponent(e.hash||"")+'">'+esc(e.ledger_index)+'</a></td></tr>';
      });
      html+='</tbody></table>';
    }
    html+='<p class="pv-note" style="margin-top:12px">'+esc((h.coverage&&h.coverage.note)||"")+' Read '+esc(h.read_at||"")+'.</p>';
    out.innerHTML=html; out.hidden=false;
  }
  function go(a){
    run.disabled=true; out.hidden=true; say(st,"Reading the ledger… a long history can take ten seconds.","");
    fetch("/api/issuer-history?issuer="+encodeURIComponent(a),{headers:{Accept:"application/json"}})
      .then(function(r){return r.json().then(function(b){if(!r.ok)throw new Error(b.error||"The ledger could not be read.");return b;});})
      .then(function(h){render(h);say(st,"","");try{history.replaceState(null,"","?issuer="+encodeURIComponent(a));}catch(e){}})
      .catch(function(err){say(st,err.message,"bad");})
      .then(function(){run.disabled=false;});
  }
  f.addEventListener("submit",function(e){e.preventDefault();var a=f.issuer.value.trim();
    if(!ADDRESS.test(a)){say(st,"Enter an XRP Ledger address. It begins with r.","bad");return;} go(a);});
  try{var q=new URLSearchParams(location.search).get("issuer");if(q&&ADDRESS.test(q)){f.issuer.value=q;go(q);}}catch(e){}
})();
