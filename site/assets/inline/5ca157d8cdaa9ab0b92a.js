
(function(){
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  var ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}

  var status=document.getElementById("bh-status"), now=document.getElementById("bh-now"), hist=document.getElementById("bh-hist");
  if(!status)return;
  function n(v,d){if(v===null||v===undefined||!isFinite(v))return "—";return Number(v).toLocaleString("en-US",{maximumFractionDigits:d==null?0:d});}
  function pct(r){if(r===null||r===undefined)return "—";var p=r*100;return '<span class="'+(r<0.5?"bh-low":"")+'">'+p.toLocaleString("en-US",{maximumFractionDigits:1})+'%</span><span class="bh-bar" aria-hidden="true"><i style="width:'+Math.max(0,Math.min(100,p))+'%"></i></span>';}
  function get(q){return fetch("/api/book-health"+q).then(function(r){return r.json().then(function(b){if(!r.ok)throw new Error(b.error||"unreadable");return b;});});}
  get("").then(function(b){
    say(status,"Ledger "+n(b.ledger_index)+" · closed "+b.close_time.replace("T"," ").replace(".000Z"," UTC"),"");
    var h='<div class="tool-scroll"><table class="tool-table"><thead><tr><th>Book</th><th class="num">Price (per XRP)</th><th class="num">Ask quoted</th><th class="num">Ask funded</th><th class="num">Ask funded share</th><th class="num">Bid funded share</th><th>AMM pool (not counted)</th></tr></thead><tbody>';
    b.books.forEach(function(k){
      var a=k.amm, price=k.mid_xrp_per_unit?1/k.mid_xrp_per_unit:null, cur=esc(k.currency_label);
      h+='<tr><td>'+esc(k.label)+'</td><td class="num">'+n(price,price&&price<0.01?8:4)+' '+cur+'</td><td class="num">'+n(k.quoted.ask,2)+' '+cur+'</td><td class="num">'+n(k.fillable.ask,2)+' '+cur+'</td>'+
        '<td class="num">'+pct(k.fillable_ratio.ask)+'</td><td class="num">'+pct(k.fillable_ratio.bid)+'</td>'+
        '<td>'+(a?n(Number(a.xrp))+' XRP · '+n(Number(a.asset&&a.asset.value),2)+' '+esc(a.asset?a.asset.currency:""):"No pool")+'</td></tr>';
    });
    now.innerHTML=h+'</tbody></table></div><p class="tool-note">'+b.disclosures.map(esc).join(" ")+'</p>';
    history(b.books.map(function(k){return k.label;}));
  }).catch(function(e){say(status,"The ledger could not be read just now: "+e.message+" Try again shortly.","bad");});

  function history(labels){
    var days=[];for(var i=1;i<=7;i++){var d=new Date(Date.now()-i*864e5);days.push(d.toISOString().slice(0,10));}
    var head=hist.querySelector("thead tr"), body=hist.querySelector("tbody");
    days.forEach(function(d){var th=document.createElement("th");th.className="num";th.textContent=d.slice(5);head.appendChild(th);});
    labels.forEach(function(l,r){var tr=document.createElement("tr");tr.innerHTML='<td>'+esc(l)+'</td>'+days.map(function(){return '<td class="num">…</td>';}).join("");body.appendChild(tr);});
    var col=0;
    function next(){
      if(col>=days.length)return; var c=col++, d=days[c];
      get("?at="+d).then(function(b){
        b.books.forEach(function(k,r){var cell=body.rows[r]&&body.rows[r].cells[c+1];if(cell){cell.innerHTML=pct(k.fillable_ratio.ask);cell.title="Ledger "+b.ledger_index;}});
      }).catch(function(){for(var r=0;r<body.rows.length;r++)body.rows[r].cells[c+1].textContent="—";}).finally(next);
    }
    next(); next();
  }
})();
