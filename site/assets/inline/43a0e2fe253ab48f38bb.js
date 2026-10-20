
(function(){
  var out=document.getElementById("br-live-text"); if(!out)return;
  function n(v){return Number(v).toLocaleString("en-US",{maximumFractionDigits:0});}
  fetch("/api/book?currency=USD&issuer=rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B")
    .then(function(r){return r.ok?r.json():Promise.reject();})
    .then(function(b){
      var q=b.quoted&&b.quoted.ask, f=b.fillable&&b.fillable.ask;
      if(!(q>0)){out.textContent="The ask side had no offers within the band at ledger "+n(b.ledger_index)+".";return;}
      out.textContent="At ledger "+n(b.ledger_index)+", the ask side of XRP/USD.Bitstamp quoted "+n(q)+" USD. Of that, "+n(f)+
        " USD ("+(f/q*100).toLocaleString("en-US",{maximumFractionDigits:1})+"%) was held by the accounts making the offers. The rest could not fill.";
    })
    .catch(function(){out.textContent="The live reading could not be loaded just now. The raw reading link below fetches it directly.";});
})();
