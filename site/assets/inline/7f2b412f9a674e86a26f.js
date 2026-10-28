
(function(){
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}
  function items(v){return String(v||"").split(/[\s,]+/).map(function(s){return s.trim();}).filter(Boolean);}

  var form=document.getElementById("er-form"); if(!form)return;
  var status=document.getElementById("er-status"), pay=document.getElementById("er-pay"), preview=document.getElementById("er-preview");
  var PRICES={"standard":"$2,500","quarterly":"$7,500","audit":"$10,000","test":"$0.5"}, LIMITS={"standard":{"issuers":3,"wallets":10,"books":3},"quarterly":{"issuers":3,"wallets":10,"books":3},"audit":{"issuers":6,"wallets":10,"books":6},"test":{"issuers":3,"wallets":10,"books":3}};
  // ?tier=test starts the unlisted $0.50 test purchase; the server decides
  // whether it is offered and where its report goes.
  var forced=null; try{if(new URLSearchParams(location.search).get("tier")==="test")forced="test";}catch(e){}
  function tier(){if(forced)return forced;var t=form.querySelector('input[name="tier"]:checked');return t?t.value:"standard";}
  function scope(){
    return {tier:tier(),organization:form.organization.value.trim(),issuers:items(form.issuers.value),wallets:items(form.wallets.value),
            books:items(form.books.value),period_end:form.period_end.value};
  }
  function previewUrl(){
    var s=scope(), p=new URLSearchParams();
    if(s.organization)p.set("org",s.organization); if(s.issuers.length)p.set("issuers",s.issuers.join(","));
    if(s.wallets.length)p.set("wallets",s.wallets.join(",")); if(s.books.length)p.set("books",s.books.join(","));
    if(s.period_end)p.set("at",s.period_end);
    return "/evidence-report/build/?"+p.toString();
  }
  function sync(){pay.textContent="Pay "+PRICES[tier()]+" by card";preview.href=previewUrl();}
  try{var q=new URLSearchParams(location.search).get("tier");var r=q&&form.querySelector('input[name="tier"][value="'+q.replace(/[^a-z]/g,"")+'"]');if(r)r.checked=true;}catch(e){}
  sync();
  if(forced)say(status,"Test purchase: "+PRICES.test+", one Standard report, sent to the owner's address.","");
  form.addEventListener("input",sync); form.addEventListener("change",sync);
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var s=scope(), lim=LIMITS[s.tier];
    if(!s.issuers.length&&!s.wallets.length){say(status,"Name at least one issuing account or one wallet.","bad");return;}
    if(s.issuers.length>lim.issuers||s.wallets.length>lim.wallets||s.books.length>lim.books){
      say(status,"This tier covers up to "+lim.issuers+" issuers, "+lim.wallets+" wallets and "+lim.books+" order books.","bad");return;}
    pay.disabled=true; say(status,"Opening secure checkout…","");
    fetch("/api/create-checkout-session",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({product:"evidence-report",tier:s.tier,organization:s.organization,issuers:s.issuers.join(","),
        wallets:s.wallets.join(","),books:s.books.join(","),period_end:s.period_end})})
      .then(function(r){return r.json().then(function(b){if(!r.ok||!b.url)throw new Error(b.error||"Checkout could not start.");return b;});})
      .then(function(b){location.href=b.url;})
      .catch(function(err){pay.disabled=false;say(status,err.message+" You can also email support@noshashi.app.","bad");});
  });
})();
