
(function(){
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  var ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}

  var form=document.getElementById("tr-form"); if(!form)return;
  var wl=document.getElementById("tr-wallets"), at=document.getElementById("tr-at");
  var status=document.getElementById("tr-status"), out=document.getElementById("tr-out"), go=document.getElementById("tr-go");
  function n(v,d){if(v===null||v===undefined||v==="")return "—";var x=Number(v);if(!isFinite(x))return "—";
    return x.toLocaleString("en-US",{maximumFractionDigits:d==null?2:d,minimumFractionDigits:0});}
  function pct(v){return v===null||v===undefined?"—":(v*100).toLocaleString("en-US",{maximumFractionDigits:1})+"%";}
  function short(a){return esc(a.slice(0,8))+"…"+esc(a.slice(-6));}
  function render(b,q){
    var L=b.ledger, T=b.totals;
    var h='<h2>Treasury report · ledger '+n(L.index,0)+'</h2>'+
      '<p class="tr-meta">Ledger closed '+esc(L.close_time)+(b.period_end?' · last ledger on or before '+esc(b.period_end):' · latest validated')+
      '<br>Ledger hash '+esc(L.hash)+'<br>Report digest (SHA-256) '+esc(b.digest)+' · rules v'+esc(b.rules_version)+
      '<br>Read '+esc(b.read_at)+' from validated XRP Ledger mainnet</p>'+
      '<div class="tr-actions"><button class="btn" type="button" id="tr-print">Print or save as PDF</button>'+
      '<a class="btn ghost" href="/api/treasury?'+esc(q)+'" target="_blank" rel="noopener">JSON</a>'+
      '<a class="btn ghost" href="/api/treasury?'+esc(q)+'&format=raw" target="_blank" rel="noopener">Raw ledger replies</a>'+
      '<a class="btn ghost" href="/treasury/?'+esc(q)+'">Link to this report</a></div>';

    h+='<h2 style="margin-top:18px">Holdings</h2><div class="tool-scroll"><table class="tool-table"><thead><tr><th>Wallet</th><th class="num">Balance XRP</th><th class="num">Reserve XRP</th><th class="num">Available XRP</th><th>Who can move it</th></tr></thead><tbody>';
    b.wallets.forEach(function(w){
      var c=w.control, tone=c.keys_needed===1?"t-nogo":c.keys_needed?"t-go":"t-unknown";
      h+='<tr><td class="mono" translate="no" title="'+esc(w.address)+'">'+esc(w.address)+'</td>'+
        (w.found?'<td class="num">'+n(w.balance_xrp,6)+'</td><td class="num">'+n(w.reserve_xrp,6)+'</td><td class="num">'+n(w.available_xrp,6)+'</td>'
          :'<td colspan="3">Not found at this ledger</td>')+
        '<td class="'+tone+'">'+esc(c.summary)+'</td></tr>';
    });
    h+='<tr><th>Total ('+n(T.found,0)+' of '+n(T.wallets,0)+' found)</th><th class="num">'+n(T.balance_xrp,6)+'</th><th></th><th class="num">'+n(T.available_xrp,6)+'</th><th>'+
      (T.fewest_keys_to_move_a_wallet===1?'<span class="t-nogo">At least one wallet moves on a single key</span>':T.fewest_keys_to_move_a_wallet?'Every wallet needs at least '+n(T.fewest_keys_to_move_a_wallet,0)+' keys':'')+'</th></tr></tbody></table></div>';
    if(b.reserves)h+='<p class="tool-note">Reserve at this ledger: '+n(b.reserves.base_xrp,6)+' XRP base plus '+n(b.reserves.increment_xrp,6)+' XRP per owned object.</p>';

    var signers=b.wallets.filter(function(w){return w.control.signer_list;});
    if(signers.length){
      h+='<h2 style="margin-top:18px">Signer lists</h2>';
      signers.forEach(function(w){var s=w.control.signer_list;
        h+='<p class="tool-note"><span class="mono" translate="no">'+short(w.address)+'</span>: quorum '+n(s.quorum,0)+' of total weight '+n(s.total_weight,0)+
          ' across '+n(s.signers.length,0)+' signers; the fewest who can reach it is <strong>'+n(s.minimum_signers,0)+'</strong>.'+
          (w.control.master_key_enabled?' The master key is also enabled and signs alone.':'')+(w.control.regular_key?' A regular key is also set and signs alone.':'')+'</p>';});
    }

    h+='<h2 style="margin-top:18px">What the dollar books could absorb</h2>'+
      '<p class="tool-note">Selling the whole '+n(T.balance_xrp,0)+' XRP into each book on its own, taking only funded offers within 10% of that book\'s mid.</p>'+
      '<div class="tool-scroll"><table class="tool-table"><thead><tr><th>Book</th><th class="num">Mid (per XRP)</th><th class="num">Funded share of quoted</th><th class="num">XRP absorbable</th><th class="num">Share of holding</th><th class="num">Average price</th><th>AMM pool (not counted)</th></tr></thead><tbody>';
    b.books.forEach(function(k){var s=k.sell, a=k.amm;
      h+='<tr><td>'+esc(k.label)+'</td><td class="num">'+n(k.mid_price,4)+'</td><td class="num'+(s.funded_share!==null&&s.funded_share<0.5?' flag':'')+'">'+pct(s.funded_share)+'</td>'+
        '<td class="num">'+n(s.capacity_xrp,0)+'</td><td class="num">'+pct(s.share_of_holding_sellable)+'</td><td class="num">'+n(s.average_price,4)+'</td>'+
        '<td>'+(a?n(a.xrp,0)+' XRP / '+n(a.asset&&a.asset.value,0)+' '+esc(a.asset?a.asset.currency:"")+(a.asset_frozen?' <span class="flag">frozen</span>':''):'No pool')+'</td></tr>';
    });
    h+='</tbody></table></div>';
    h+='<h2 style="margin-top:18px">Method and limits</h2><ol>'+b.disclosures.map(function(d){return '<li>'+esc(d)+'</li>';}).join("")+'</ol>'+
      '<p class="tr-meta">Reproduce: GET https://www.noshashi.app/api/treasury?'+esc(q)+'</p>';
    out.innerHTML='<div class="tool-out tr-out">'+h+'</div>'; out.hidden=false;
    var p=document.getElementById("tr-print"); if(p)p.addEventListener("click",function(){window.print();});
  }
  function run(){
    var list=(wl.value||"").split(/[\s,]+/).filter(Boolean);
    if(!list.length){say(status,"Enter at least one wallet address.","bad");return;}
    if(list.length>10){say(status,"At most 10 wallets per report.","bad");return;}
    for(var i=0;i<list.length;i++){if(!ADDRESS.test(list[i])){say(status,list[i].slice(0,40)+" is not an XRP Ledger classic address. They begin with r.","bad");return;}}
    var q="wallets="+list.join(",")+(at.value?"&at="+at.value:"");
    go.disabled=true; out.hidden=true; say(status,at.value?"Finding the ledger for that date and reading it…":"Reading the latest validated ledger…","busy");
    fetch("/api/treasury?"+q)
      .then(function(r){return r.json().then(function(b){return {ok:r.ok,b:b};});})
      .then(function(x){if(!x.ok){say(status,x.b.error||"That could not be read.","bad");return;} say(status,""); render(x.b,q);})
      .catch(function(){say(status,"Could not reach the server. Try again shortly.","bad");})
      .finally(function(){go.disabled=false;});
  }
  form.addEventListener("submit",function(e){e.preventDefault();run();});
  var params=new URLSearchParams(location.search);
  if(params.get("wallets")){wl.value=params.get("wallets").split(",").join("\n"); if(/^\d{4}-\d{2}-\d{2}$/.test(params.get("at")||""))at.value=params.get("at"); run();}
})();
