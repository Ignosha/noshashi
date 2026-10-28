
(function(){
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}
  function items(v){return String(v||"").split(/[\s,]+/).map(function(s){return s.trim();}).filter(Boolean);}

  var form=document.getElementById("vf-form"); if(!form)return;
  var input=document.getElementById("vf-digest"), status=document.getElementById("vf-status"), out=document.getElementById("vf-out");
  function run(){
    var d=(input.value||"").trim();
    if(!/^[0-9A-Fa-f]{64}$/.test(d)){say(status,"A SHA-256 is 64 hexadecimal characters.","bad");return;}
    say(status,"Checking…",""); out.innerHTML="";
    fetch("https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1/noshashi-evidence-report/verify?digest="+d).then(function(r){return r.json();}).then(function(b){
      if(!b.found){say(status,"No report with this digest was issued by NOSHASHI.","bad");return;}
      say(status,"Issued by NOSHASHI.","");
      var rows=[["Report",b.reference],["Prepared for",b.organization||"—"],["Tier",b.tier],["Period end",b.period_end||"None (latest ledger)"],["Generated",b.generated_at],["Sent",b.sent_at]];
      var h='<table class="tool-table" style="width:100%;max-width:680px;border-collapse:collapse;font-size:13px"><tbody>';
      rows.forEach(function(r){h+='<tr><th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--rule)">'+esc(r[0])+'</th><td style="padding:6px 8px;border-bottom:1px solid var(--rule)">'+esc(r[1])+'</td></tr>';});
      Object.keys(b.ledger_indexes||{}).forEach(function(k){h+='<tr><th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--rule)">Ledger</th><td style="padding:6px 8px;border-bottom:1px solid var(--rule);font:11px IBM Plex Mono,monospace;word-break:break-all">'+esc(b.ledger_indexes[k])+' · '+esc(k)+'</td></tr>';});
      out.innerHTML=h+'</tbody></table>';
    }).catch(function(){say(status,"Verification could not be reached. Try again shortly.","bad");});
  }
  form.addEventListener("submit",function(e){e.preventDefault();run();});
  var q=new URLSearchParams(location.search).get("digest"); if(q){input.value=q;run();}
})();
