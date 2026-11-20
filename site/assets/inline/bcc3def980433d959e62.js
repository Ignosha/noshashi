
(function(){
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}
  function items(v){return String(v||"").split(/[\s,]+/).map(function(s){return s.trim();}).filter(Boolean);}
  var ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

  var f=document.getElementById("rp-form"), st=document.getElementById("rp-status"), out=document.getElementById("rp-out"), go=document.getElementById("rp-go");
  function cell(t){var td=document.createElement("td");td.textContent=t;return td;}
  function show(b){
    out.hidden=false;
    document.getElementById("rp-verdict").textContent=b.verdict;
    document.getElementById("rp-role").textContent=b.role;
    document.getElementById("rp-ledger").textContent=Number(b.ledger_index).toLocaleString("en-US");
    document.getElementById("rp-lines").textContent=b.coverage.lines_read+(b.coverage.truncated?"+":"");
    document.getElementById("rp-summary").textContent=b.summary;
    var rows=document.getElementById("rp-rows"); rows.textContent="";
    (b.exposures||[]).forEach(function(e){var tr=document.createElement("tr");
      [e.currency_display,String(e.open_lines),e.held_on_open_lines,e.receiving_room,e.exposed?e.movable_at_par:"0 (no room)"].forEach(function(v){tr.appendChild(cell(v));});
      rows.appendChild(tr);});
    if(!rows.children.length){var tr=document.createElement("tr");var td=cell("No currency is held on two or more lines open to rippling.");td.colSpan=5;tr.appendChild(td);rows.appendChild(tr);}
    var fl=document.getElementById("rp-findings"); fl.textContent="";
    (b.findings||[]).forEach(function(x){var li=document.createElement("li");li.textContent=x.detail;fl.appendChild(li);});
    document.getElementById("rp-fixes").textContent=(b.fixes&&b.fixes.length)?JSON.stringify(b.fixes,null,2):"Nothing to fix.";
    document.getElementById("rp-digest").textContent=b.receipt?b.receipt.digest:"—";
  }
  f.addEventListener("submit",function(e){
    e.preventDefault();
    var a=f.account.value.trim();
    if(!ADDRESS.test(a)){say(st,"Enter a public XRPL address. It begins with r.","bad");return;}
    go.disabled=true; say(st,"Reading every trust line at one validated ledger…","");
    fetch("/api/v1/rippling?account="+encodeURIComponent(a),{headers:{Accept:"application/json"}})
      .then(function(r){return r.json().then(function(b){if(!r.ok)throw new Error(b.error||"The ledger could not be read.");return b;});})
      .then(function(b){show(b);say(st,"Read from "+b.source+" at "+b.observed_at+".","");
        try{history.replaceState(null,"","?account="+encodeURIComponent(a));}catch(_){}})
      .catch(function(err){say(st,err.message,"bad");})
      .then(function(){go.disabled=false;});
  });
  try{var q=new URLSearchParams(location.search).get("account");if(q&&ADDRESS.test(q)){f.account.value=q;f.requestSubmit?f.requestSubmit():null;}}catch(e){}
})();
