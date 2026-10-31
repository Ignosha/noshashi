
(function(){
  var box=document.getElementById("tk-live"); if(!box)return;
  var issuer=box.getAttribute("data-issuer"), currency=box.getAttribute("data-currency");
  var facts=document.getElementById("tk-facts"), status=document.getElementById("tk-status"), depth=document.getElementById("tk-depth");
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function tone(c){return c.passed?"go":(c.severity==="block"?"nogo":"hold");}
  function word(c){
    if(/abstain/i.test(c.detail||"")&&!c.passed)return "not measured here";
    return c.passed?"yes":"no";
  }
  fetch("/api/authority?issuer="+encodeURIComponent(issuer)).then(function(r){return r.json();}).then(function(cert){
    var checks=(cert&&cert.checks)||[];
    if(!checks.length){status.textContent="The ledger could not be read just now. Nothing here is a pass. Try again in a minute.";return;}
    facts.innerHTML=checks.filter(function(c){return c.id!=="SUPPLY_CONCENTRATION";}).map(function(c){
      return '<div><span>'+esc(c.label)+'</span><span><b class="t-'+tone(c)+'">'+esc(word(c).toUpperCase())+'</b><p>'+esc(c.detail)+'</p></span></div>';
    }).join("");
    status.textContent="Read from validated ledger "+Number(cert.ledgerIndex||0).toLocaleString("en-US")+" at "+String(cert.evaluatedAt||"").replace("T"," ").slice(0,16)+" UTC.";
  }).catch(function(){status.textContent="The ledger could not be read just now. Nothing here is a pass. Try again in a minute.";});
  if(depth){
    fetch("/api/book?currency="+encodeURIComponent(currency)+"&issuer="+encodeURIComponent(issuer)).then(function(r){return r.json();}).then(function(b){
      if(!b||!b.quoted){depth.textContent="The order book could not be read just now.";return;}
      function pct(x){return x==null?"no offers in the band":Math.round(x*1000)/10+"%";}
      function n(x){return Number(x||0).toLocaleString("en-US",{maximumFractionDigits:2});}
      depth.innerHTML="Bids: "+esc(n(b.fillable.bid))+" of "+esc(n(b.quoted.bid))+" listed can fill ("+esc(pct(b.fillable_ratio.bid))+"). "+
        "Asks: "+esc(n(b.fillable.ask))+" of "+esc(n(b.quoted.ask))+" listed can fill ("+esc(pct(b.fillable_ratio.ask))+"). "+
        "Quantities in "+esc(b.currency_label)+", within 10% of the mid, DEX book only (AMM pools not included), at ledger "+esc(Number(b.ledger_index).toLocaleString("en-US"))+".";
    }).catch(function(){depth.textContent="The order book could not be read just now.";});
  }
})();
