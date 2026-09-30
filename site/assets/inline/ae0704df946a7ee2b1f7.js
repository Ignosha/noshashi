
(function(){
  var API="https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1/noshashi-xrpl-watch/protection/";
  var form=document.getElementById("prot-form"),slug=document.getElementById("prot-slug"),out=document.getElementById("prot-out"),sayEl=document.getElementById("prot-say");
  function say(t,tone){sayEl.textContent=t||"";sayEl.setAttribute("data-tone",tone||"");}
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function xrp(n){return Number(n).toLocaleString("en-US",{maximumFractionDigits:6})+" XRP";}
  function hex(buf){return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,"0");}).join("");}
  function sha(text){return crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)).then(hex);}
  /* The same canonical JSON as supabase/functions/_shared/protection.ts: sorted keys, no whitespace. */
  function canonical(v){
    if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";
    if(v&&typeof v==="object")return "{"+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+":"+canonical(v[k]);}).join(",")+"}";
    return JSON.stringify(v===undefined?null:v);
  }
  var TONE={fully_backed:"go",partially_backed:"hold",under_backed:"nogo",unproven:"unknown"};
  var WORD={fully_backed:"FULLY BACKED",partially_backed:"PARTLY BACKED",under_backed:"UNDER-BACKED",unproven:"NOT PROVEN"};
  function render(b){
    var p=b.program,l=b.latest,r=l&&l.report;
    var html='<div class="prot-status '+(l?TONE[l.status]:"unknown")+'"><span class="tag">'+(l?WORD[l.status]:"NO ATTESTATION YET")+'</span>'+
      '<h2>'+esc(p.name)+(p.institution?' · '+esc(p.institution):'')+'</h2>'+
      (r?'<p>'+xrp(r.reservesXrp)+' in '+p.reserve_addresses.length+' reserve account'+(p.reserve_addresses.length===1?'':'s')+
        (r.liabilitiesXrp!==null?' against '+xrp(r.liabilitiesXrp)+' owed to '+Number(r.customers).toLocaleString("en-US")+' customers':'')+
        (p.fund_addresses.length?'. Protection fund '+xrp(r.fundXrp)+', of which '+xrp(r.fundSecuredXrp)+' no single key can move; limit '+xrp(p.coverage_limit_xrp)+' per customer':'')+'.</p>':'')+
      '<p class="prot-mono">'+(l?'ATTESTED '+esc(l.attested_at)+' · VALIDATED LEDGER '+esc(l.ledger_index)+'<br>DIGEST '+esc(l.digest)+' <span id="prot-digest"></span>':'')+'</p>'+
      '<p class="prot-mono">'+esc(b.not_insurance)+'</p></div>';
    if(b.liabilities)html+='<div class="panel"><p class="num">PUBLISHED LIABILITIES</p><p class="prot-mono">ROOT '+esc(b.liabilities.root)+'<br>TOTAL '+xrp(b.liabilities.total_xrp)+' · '+esc(b.liabilities.customers)+' CUSTOMERS · BALANCES AS OF '+esc(b.liabilities.as_of)+'</p></div>';
    if(r){html+='<div class="panel" style="margin-top:14px"><p class="num">FINDINGS</p>';
      r.findings.forEach(function(f){html+='<div class="prot-find"><b class="'+esc(f.severity)+'">'+esc(f.severity.toUpperCase())+'</b>'+esc(f.title)+'<p>'+esc(f.detail)+'</p></div>';});
      html+='</div>';}
    html+='<div class="panel" style="margin-top:14px"><p class="num">RESERVE AND FUND ACCOUNTS</p><p class="prot-mono">'+
      p.reserve_addresses.map(function(a){return 'RESERVE '+esc(a);}).concat(p.fund_addresses.map(function(a){return 'FUND '+esc(a);})).join("<br>")+'</p></div>';
    if(b.history&&b.history.length){
      var chain=true;for(var i=0;i<b.history.length-1;i++){if(b.history[i].previous_digest!==b.history[i+1].digest)chain=false;}
      html+='<div class="panel" style="margin-top:14px"><p class="num">ATTESTATION HISTORY · '+(chain?'CHAIN INTACT':'CHAIN BROKEN')+'</p><p class="prot-mono">'+
        b.history.map(function(h){return esc(h.attested_at.slice(0,16).replace("T"," "))+' · '+esc(WORD[h.status])+(h.coverage_ratio!==null?' · '+(Number(h.coverage_ratio)*100).toFixed(2)+'%':'')+' · '+esc(h.digest.slice(0,16))+'…';}).join("<br>")+'</p></div>';
    }
    out.innerHTML=html;out.hidden=false;
    if(r)sha(canonical(r)).then(function(d){var el=document.getElementById("prot-digest");if(el)el.textContent=d.toUpperCase()===l.digest?"· RECOMPUTED IN THIS BROWSER: MATCHES":"· RECOMPUTED IN THIS BROWSER: DOES NOT MATCH";});
  }
  function load(name){
    if(!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(name)){say("A program name is lower-case letters, digits and hyphens.","bad");return;}
    say("Reading…","busy");out.hidden=true;
    fetch(API+encodeURIComponent(name)).then(function(r){return r.json().then(function(b){return {ok:r.ok,body:b};});})
      .then(function(x){if(!x.ok){say(x.body.message||"Not found.","bad");return;}say("");render(x.body);})
      .catch(function(){say("Could not reach the server. Try again shortly.","bad");});
  }
  form.addEventListener("submit",function(e){e.preventDefault();load((slug.value||"").trim().toLowerCase());});
  try{var p=new URLSearchParams(location.search).get("p");if(p){slug.value=p;load(p);}}catch(e){}

  /* Inclusion proof: the same hashing as the tree the institution built. */
  var proofSay=document.getElementById("proof-say");
  function psay(t,tone){proofSay.textContent=t;proofSay.setAttribute("data-tone",tone||"");}
  document.getElementById("proof-run").addEventListener("click",function(){
    var line,id=(document.getElementById("proof-id").value||"").trim();
    try{line=JSON.parse(document.getElementById("proof-json").value);}catch(e){psay("That is not the line from your proofs file.","bad");return;}
    var proof=line.proof||line;
    if(!proof||!proof.path||!proof.root||!proof.salt){psay("That line has no proof in it.","bad");return;}
    sha(proof.salt+"|"+id).then(function(ref){
      if(ref!==proof.ref){psay("This proof is not for that customer id.","bad");return null;}
      var node={hash:null,sum:BigInt(proof.amount)};
      return sha("noshashi-pol-leaf-v1|"+proof.ref+"|"+proof.amount).then(function(h){
        node.hash=h;
        var chain=Promise.resolve(node);
        proof.path.forEach(function(step){
          chain=chain.then(function(n){
            var s={hash:step.hash,sum:BigInt(step.sum)};
            if(s.sum<0n)throw new Error("negative");
            var L=step.side==="right"?n:s,R=step.side==="right"?s:n;
            return sha("noshashi-pol-node-v1|"+L.hash+"|"+L.sum+"|"+R.hash+"|"+R.sum).then(function(h){return {hash:h,sum:L.sum+R.sum};});
          });
        });
        return chain;
      });
    }).then(function(root){
      if(!root)return;
      var ok=root.hash===String(proof.root.hash).toLowerCase()&&root.sum.toString()===String(proof.root.sum);
      var published=document.querySelector(".prot-mono")&&out.textContent.indexOf(proof.root.hash)>=0;
      psay(ok?("Your balance of "+(Number(BigInt(proof.amount))/1e6).toLocaleString("en-US")+" XRP is counted in a tree whose root is "+proof.root.hash.slice(0,16)+"…"+(published?", the root this program published.":". Load the program above to compare it with the published root.")):"This proof does not lead to its root: your balance is not counted as stated.",ok?"ok":"bad");
    }).catch(function(){psay("A branch of the proof carries a negative total: debts could be hidden there.","bad");});
  });
})();
