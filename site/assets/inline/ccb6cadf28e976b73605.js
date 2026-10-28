
(function(){
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}
  function items(v){return String(v||"").split(/[\s,]+/).map(function(s){return s.trim();}).filter(Boolean);}

  var form=document.getElementById("rp-form"); if(!form)return;
  var out=document.getElementById("rp-out"), status=document.getElementById("rp-status");
  var printBtn=document.getElementById("rp-print"), rawBtn=document.getElementById("rp-raw");
  var LIMITS={"issuers":3,"wallets":10,"books":3};
  var ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
  var evidence=null;

  function n(v,d){if(v===null||v===undefined||v===""||!isFinite(Number(v)))return "—";return Number(v).toLocaleString("en-US",{maximumFractionDigits:d==null?2:d});}
  function pct(r){if(r===null||r===undefined||!isFinite(r))return "—";return (r*100).toLocaleString("en-US",{maximumFractionDigits:1})+"%";}
  /* A currency longer than three characters is held on the ledger as 40 hex. */
  function currencyCode(c){
    if(/^[0-9A-Fa-f]{40}$/.test(c))return c.toUpperCase();
    if(c.length===3)return c;
    var h="";for(var i=0;i<c.length;i++)h+=c.charCodeAt(i).toString(16).toUpperCase().padStart(2,"0");
    return (h+"0".repeat(40)).slice(0,40);
  }
  function label(c){
    if(!/^[0-9A-F]{40}$/i.test(c))return c;
    var s="";for(var i=0;i<40;i+=2){var b=parseInt(c.slice(i,i+2),16);if(b)s+=String.fromCharCode(b);}
    return /^[\x20-\x7e]+$/.test(s)?s:c;
  }
  function get(url){
    return fetch(url,{headers:{Accept:"application/json"}}).then(function(r){
      return r.json().catch(function(){return {};}).then(function(b){if(!r.ok)throw new Error(b.error||("HTTP "+r.status));return b;});
    });
  }
  function sha256(text){
    return crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)).then(function(buf){
      return Array.prototype.map.call(new Uint8Array(buf),function(b){return b.toString(16).padStart(2,"0");}).join("").toUpperCase();
    });
  }

  function readForm(){
    return {org:form.querySelector("#rp-org").value.trim(),issuers:items(form.querySelector("#rp-issuers").value),
            wallets:items(form.querySelector("#rp-wallets").value),books:items(form.querySelector("#rp-books").value),
            at:form.querySelector("#rp-at").value};
  }
  function check(s){
    if(!s.issuers.length&&!s.wallets.length)return "Name at least one issuing account or one wallet.";
    if(s.issuers.length>LIMITS.issuers)return "At most "+LIMITS.issuers+" issuing accounts.";
    if(s.wallets.length>LIMITS.wallets)return "At most "+LIMITS.wallets+" wallets.";
    if(s.books.length>LIMITS.books)return "At most "+LIMITS.books+" order books.";
    var bad=s.issuers.concat(s.wallets).filter(function(a){return !ADDRESS.test(a);})[0];
    if(bad)return bad+" is not an XRP Ledger classic address.";
    var badBook=s.books.filter(function(b){var p=b.split(".");return p.length!==2||!ADDRESS.test(p[1])||!/^([A-Za-z0-9]{3,20}|[0-9A-Fa-f]{40})$/.test(p[0]);})[0];
    if(badBook)return "Write each order book as CURRENCY.issuer: "+badBook;
    return "";
  }

  /* Each source keeps the exact request and the reply, for the raw file. */
  function issuerSource(issuer){
    var url="/api/authority?issuer="+encodeURIComponent(issuer)+"&walk=1";
    return get(url).catch(function(){url="/api/authority?issuer="+encodeURIComponent(issuer);return get(url);})
      .then(function(reply){return {kind:"issuer",subject:issuer,request:url,reply:reply};},
            function(err){return {kind:"issuer",subject:issuer,request:url,error:err.message};});
  }
  function treasurySource(wallets,at){
    var url="/api/treasury?wallets="+wallets.map(encodeURIComponent).join(",")+(at?"&at="+at:"");
    return get(url).then(function(reply){return {kind:"treasury",subject:wallets.join(","),request:url,reply:reply};},
                         function(err){return {kind:"treasury",subject:wallets.join(","),request:url,error:err.message};});
  }
  function bookSource(book){
    var p=book.split("."), url="/api/book?currency="+encodeURIComponent(currencyCode(p[0]))+"&issuer="+encodeURIComponent(p[1]);
    return get(url).then(function(reply){return {kind:"book",subject:book,request:url,reply:reply};},
                         function(err){return {kind:"book",subject:book,request:url,error:err.message};});
  }

  function unread(src){return '<p class="bad">Could not be read: '+esc(src.error)+'. Nothing in this section is shown as a pass.</p>';}

  function renderIssuer(src){
    var h='<h3>'+esc(src.subject)+'</h3>';
    if(src.error)return h+unread(src);
    var r=src.reply;
    h+='<p class="meta">Ledger '+n(r.ledgerIndex,0)+' · evaluated '+esc(r.evaluatedAt)+' · rules version '+esc(r.rulesVersion)+' · digest <span class="mono">'+esc(r.digest)+'</span></p>';
    h+='<div class="rp-scroll"><table><thead><tr><th>Fact</th><th>Reading</th><th>Detail</th></tr></thead><tbody>';
    (r.checks||[]).forEach(function(c){
      var cls=c.state==="INSUFFICIENT_DATA"?"na":c.passed?"ok":(c.severity==="block"?"bad":"warn");
      var word=c.state==="INSUFFICIENT_DATA"?"Not measured":c.passed?"Holds":"Does not hold";
      h+='<tr><td>'+esc(c.label)+'</td><td class="'+cls+'">'+word+'</td><td>'+esc(c.detail)+'</td></tr>';
    });
    return h+'</tbody></table></div><p class="meta">'+esc(r.disclaimer||"")+'</p>';
  }

  function renderTreasury(src,at){
    if(src.error)return unread(src);
    var r=src.reply, L=r.ledger||{};
    var h='<p class="meta">Ledger '+n(L.index,0)+' · hash <span class="mono">'+esc(L.hash)+'</span> · closed '+esc(L.close_time)+
      (at?' · last ledger to close on or before '+esc(at)+' 23:59:59 UTC':' · latest validated ledger')+' · digest <span class="mono">'+esc(r.digest)+'</span></p>';
    h+='<div class="rp-scroll"><table><thead><tr><th>Wallet</th><th class="num">Balance XRP</th><th class="num">Reserve XRP</th><th class="num">Available XRP</th><th>Who can move it</th></tr></thead><tbody>';
    (r.wallets||[]).forEach(function(w){
      if(!w.found){h+='<tr><td class="mono">'+esc(w.address)+'</td><td colspan="4" class="na">No account at this ledger.</td></tr>';return;}
      var c=w.control||{}, how=c.readable===false?'<span class="na">Not readable: not shown as safe.</span>':esc(c.summary||"");
      if(c.readable!==false){
        how+='<br><span class="meta">Master key '+(c.master_key_enabled?"enabled":"disabled")+(c.regular_key?' · regular key '+esc(c.regular_key):' · no regular key')+
          (c.signer_list?' · signer list quorum '+esc(c.signer_list.quorum)+' of total weight '+esc(c.signer_list.total_weight)+' ('+c.signer_list.signers.length+' signers)':' · no signer list')+'</span>';
      }
      h+='<tr><td class="mono">'+esc(w.address)+'</td><td class="num">'+n(w.balance_xrp,6)+'</td><td class="num">'+n(w.reserve_xrp,6)+'</td><td class="num">'+n(w.available_xrp,6)+'</td><td>'+how+'</td></tr>';
    });
    var t=r.totals||{};
    h+='<tr><th>Total ('+n(t.found,0)+' of '+n(t.wallets,0)+' found)</th><th class="num">'+n(t.balance_xrp,6)+'</th><th></th><th class="num">'+n(t.available_xrp,6)+'</th><th>Fewest keys to move a wallet: '+n(t.fewest_keys_to_move_a_wallet,0)+'</th></tr>';
    h+='</tbody></table></div>';
    if((r.books||[]).length){
      h+='<h3>Selling the holding into the main XRP books</h3><div class="rp-scroll"><table><thead><tr><th>Book</th><th class="num">Funded share of quoted</th><th class="num">Funded capacity (XRP)</th><th class="num">Share of holding sellable</th><th class="num">Average price</th><th>AMM pool (not counted)</th></tr></thead><tbody>';
      r.books.forEach(function(b){
        var s=b.sell||{}, a=b.amm;
        h+='<tr><td>'+esc(b.label)+'</td><td class="num">'+pct(s.funded_share)+'</td><td class="num">'+n(s.capacity_xrp,0)+'</td><td class="num">'+pct(s.share_of_holding_sellable)+'</td><td class="num">'+n(s.average_price,6)+'</td><td>'+
          (a?n(a.xrp,0)+' XRP · '+n(a.asset&&a.asset.value,0)+' '+esc(label(a.asset?a.asset.currency:"")):"No pool")+'</td></tr>';
      });
      h+='</tbody></table></div>';
    }
    return h+'<ul class="meta">'+(r.disclosures||[]).map(function(d){return '<li>'+esc(d)+'</li>';}).join("")+'</ul>';
  }

  function renderBook(src){
    var h='<h3>'+esc(src.subject)+'</h3>';
    if(src.error)return h+unread(src);
    var r=src.reply, cur=esc(r.currency_label||label(r.currency));
    h+='<p class="meta">XRP/'+cur+' · ledger '+n(r.ledger_index,0)+' · read '+esc(r.read_at)+' · '+esc(r.units||"")+'</p>';
    h+='<div class="rp-scroll"><table><thead><tr><th>Side</th><th class="num">Quoted ('+cur+')</th><th class="num">Funded ('+cur+')</th><th class="num">Funded share</th></tr></thead><tbody>';
    ["bid","ask"].forEach(function(side){
      h+='<tr><td>'+(side==="bid"?"Bids (buying XRP)":"Asks (selling XRP into)")+'</td><td class="num">'+n(r.quoted&&r.quoted[side])+'</td><td class="num">'+n(r.fillable&&r.fillable[side])+'</td><td class="num">'+pct(r.fillable_ratio&&r.fillable_ratio[side])+'</td></tr>';
    });
    h+='</tbody></table></div><p class="meta">Reference mid '+n(r.reference&&r.reference.mid,8)+' XRP per '+cur+'. '+(r.disclosures||[]).map(esc).join(" ")+'</p>';
    return h;
  }

  function run(){
    var s=readForm(), problem=check(s);
    if(problem){say(status,problem,"bad");return;}
    say(status,"Reading validated XRP Ledger mainnet…",""); printBtn.disabled=true; rawBtn.disabled=true;
    var jobs=s.issuers.map(issuerSource);
    if(s.wallets.length)jobs.push(treasurySource(s.wallets,s.at));
    s.books.forEach(function(b){jobs.push(bookSource(b));});
    Promise.all(jobs).then(function(sources){
      var generated=new Date().toISOString();
      evidence={report:"NOSHASHI Ledger Evidence Report",prepared_for:s.org||null,generated_at:generated,
        scope:{issuers:s.issuers,wallets:s.wallets,books:s.books,period_end:s.at||null},sources:sources};
      return sha256(JSON.stringify(evidence.sources)).then(function(digest){evidence.sources_sha256=digest;return render(s,sources,generated,digest);});
    }).catch(function(err){say(status,"The report could not be built: "+err.message,"bad");});
  }

  function render(s,sources,generated,digest){
    var issuers=sources.filter(function(x){return x.kind==="issuer";}), treasury=sources.filter(function(x){return x.kind==="treasury";})[0],
        books=sources.filter(function(x){return x.kind==="book";}), failed=sources.filter(function(x){return x.error;}).length, sec=0;
    var h='<p class="eyebrow">NOSHASHI · Ledger Evidence Report</p><h1 style="margin:4px 0 6px">'+(s.org?esc(s.org):"Ledger Evidence Report")+'</h1>'+
      '<p class="meta">Generated '+esc(generated)+' from validated XRP Ledger mainnet. SHA-256 over the raw evidence: <span class="mono">'+esc(digest)+'</span></p>';
    h+='<h2>'+(++sec)+'. Scope</h2><table><tbody>'+
      '<tr><th>Issuing accounts</th><td class="mono">'+(s.issuers.map(esc).join("<br>")||"—")+'</td></tr>'+
      '<tr><th>Treasury wallets</th><td class="mono">'+(s.wallets.map(esc).join("<br>")||"—")+'</td></tr>'+
      '<tr><th>Order books</th><td class="mono">'+(s.books.map(esc).join("<br>")||"—")+'</td></tr>'+
      '<tr><th>Period end</th><td>'+(s.at?esc(s.at)+" (treasury section; issuer and book sections are read at the latest validated ledger)":"None: every section is read at the latest validated ledger")+'</td></tr></tbody></table>';
    if(failed)h+='<p class="bad">'+failed+' of '+sources.length+' readings could not be taken. Those sections say so; read again before relying on this report.</p>';
    if(issuers.length)h+='<h2>'+(++sec)+'. Issuer controls</h2>'+issuers.map(renderIssuer).join("");
    if(treasury)h+='<h2>'+(++sec)+'. Treasury: holdings and who can move them</h2>'+renderTreasury(treasury,s.at);
    if(books.length)h+='<h2>'+(++sec)+'. Order-book depth: quoted against funded</h2>'+books.map(renderBook).join("");
    h+='<h2>'+(++sec)+'. How to re-check this report</h2><p class="meta">Each figure came from one of these public requests to https://www.noshashi.app, which read validated XRP Ledger mainnet. '+
      'The raw evidence file holds every reply exactly as received; its SHA-256 is stated above. A section read at a past period end can be re-read at the same ledger index; one read at the latest ledger shows the ledger index it was read at.</p><ul class="meta">'+
      sources.map(function(x){return '<li class="mono">'+esc(x.request)+'</li>';}).join("")+'</ul>';
    h+='<h2>'+(++sec)+'. Limitations</h2><p class="meta">A record of public ledger facts at the stated ledger indexes. Not an audit opinion, an attestation, a valuation, fair-value guidance under any accounting standard, '+
      'or a legal or compliance determination about any asset or person. Depth counts offers within 10% of each book\'s reference mid (a chosen parameter) and at most 100 offers per side; AMM pools are shown separately and not added. '+
      'NOSHASHI did not hold, sign for or move any of the accounts named.</p>';
    out.innerHTML=h; out.hidden=false;
    printBtn.disabled=false; rawBtn.disabled=false;
    say(status,failed?"Built, with "+failed+" reading(s) missing.":"Built. Print it to PDF and download the raw evidence to go with it.",failed?"bad":"");
  }

  form.addEventListener("submit",function(e){e.preventDefault();run();});
  printBtn.addEventListener("click",function(){window.print();});
  rawBtn.addEventListener("click",function(){
    if(!evidence)return;
    var blob=new Blob([JSON.stringify(evidence,null,2)],{type:"application/json"}), a=document.createElement("a");
    a.href=URL.createObjectURL(blob); a.download="noshashi-ledger-evidence-"+evidence.generated_at.slice(0,10)+".json";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
  });

  var q=new URLSearchParams(location.search);
  form.querySelector("#rp-org").value=q.get("org")||"";
  form.querySelector("#rp-issuers").value=items(q.get("issuers")).join("\n");
  form.querySelector("#rp-wallets").value=items(q.get("wallets")).join("\n");
  form.querySelector("#rp-books").value=items(q.get("books")).join("\n");
  if(/^\d{4}-\d{2}-\d{2}$/.test(q.get("at")||""))form.querySelector("#rp-at").value=q.get("at");
  if(q.get("issuers")||q.get("wallets"))run();
})();
