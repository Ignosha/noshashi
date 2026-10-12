
(function(){
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  var ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}

  var form=document.getElementById("dl-form"); if(!form)return;
  var acct=document.getElementById("dl-account"), from=document.getElementById("dl-from"), to=document.getElementById("dl-to");
  var status=document.getElementById("dl-status"), out=document.getElementById("dl-out"), go=document.getElementById("dl-go");
  var STOP={end_of_history:"the account's whole history",reached_from_date:"everything from your start date",
    page_cap:"the newest 10,000 transactions only",time_budget:"as far back as could be read in the time allowed"};
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var a=(acct.value||"").trim();
    if(!ADDRESS.test(a)){say(status,"That is not an XRP Ledger classic address. They begin with r.","bad");return;}
    var q="account="+a+(from.value?"&from="+from.value:"")+(to.value?"&to="+to.value:"");
    go.disabled=true; out.hidden=true; say(status,"Reading payments from the ledger…","busy");
    fetch("/api/delivered?format=json&"+q)
      .then(function(r){return r.json().then(function(b){return {ok:r.ok,b:b};});})
      .then(function(x){
        if(!x.ok){say(status,x.b.error||"That could not be read.","bad");return;}
        say(status,"");
        var b=x.b, s=b.summary, rows=b.rows||[];
        var html='<h2>'+esc(s.payments)+' payment'+(s.payments===1?"":"s")+'</h2>'+
          '<p>Partial payments: <strong>'+esc(s.partial_payments)+'</strong> · delivered less than stated: <strong class="'+(s.delivered_less_than_stated?"t-nogo":"")+'">'+esc(s.delivered_less_than_stated)+'</strong>'+
          (s.delivered_unavailable?' · delivered amount not recorded: '+esc(s.delivered_unavailable):'')+'</p>'+
          '<p class="tool-note">'+(b.complete?"Complete: covers ":"<strong>Not complete</strong>: covers ")+esc(STOP[b.stopped_because]||b.stopped_because)+
          (b.oldest_ledger_reached?" (oldest ledger read "+esc(b.oldest_ledger_reached)+")":"")+(b.complete?".":". Narrow the dates to read further back.")+'</p>'+
          '<p><a class="btn" href="/api/delivered?'+esc(q)+'" download>Download CSV</a></p>';
        if(rows.length){
          html+='<div class="tool-scroll"><table class="tool-table"><thead><tr><th>Date (UTC)</th><th>Dir</th><th>Currency</th><th>Stated</th><th>Delivered</th><th>Partial</th><th>Tx</th></tr></thead><tbody>';
          rows.slice(0,50).forEach(function(r){
            var short=r.delivered_less_than_stated==="yes";
            html+='<tr><td>'+esc(r.date_utc.replace("T"," ").replace("Z",""))+'</td><td>'+esc(r.direction)+'</td><td translate="no">'+esc(r.currency)+'</td>'+
              '<td class="mono">'+esc(r.amount_stated)+'</td><td class="mono'+(short?" flag":"")+'">'+esc(r.amount_delivered)+'</td>'+
              '<td>'+esc(r.partial_payment)+'</td><td class="mono" translate="no">'+esc(r.tx_hash.slice(0,10))+'…</td></tr>';
          });
          html+='</tbody></table></div>'+(rows.length>50?'<p class="tool-note">First 50 shown. The CSV has all '+esc(rows.length)+'.</p>':'');
        }
        out.innerHTML='<div class="tool-out">'+html+'</div>'; out.hidden=false;
      })
      .catch(function(){say(status,"Could not reach the server. Try again shortly.","bad");})
      .finally(function(){go.disabled=false;});
  });
})();
