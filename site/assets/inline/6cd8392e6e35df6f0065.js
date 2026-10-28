
(function(){
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}
  function items(v){return String(v||"").split(/[\s,]+/).map(function(s){return s.trim();}).filter(Boolean);}

  var form=document.getElementById("er-form"); if(!form)return;
  var status=document.getElementById("er-status"), pay=document.getElementById("er-pay"), preview=document.getElementById("er-preview");
  function scope(){
    return {organization:form.organization.value.trim(),issuers:items(form.issuers.value),wallets:items(form.wallets.value),
            books:items(form.books.value),period_end:form.period_end.value};
  }
  function previewUrl(){
    var s=scope(), p=new URLSearchParams();
    if(s.organization)p.set("org",s.organization); if(s.issuers.length)p.set("issuers",s.issuers.join(","));
    if(s.wallets.length)p.set("wallets",s.wallets.join(",")); if(s.books.length)p.set("books",s.books.join(","));
    if(s.period_end)p.set("at",s.period_end);
    return "/evidence-report/build/?"+p.toString();
  }
  form.addEventListener("input",function(){preview.href=previewUrl();});
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var s=scope();
    if(!s.issuers.length&&!s.wallets.length){say(status,"Name at least one issuing account or one wallet.","bad");return;}
    pay.disabled=true; say(status,"Opening secure checkout…","");
    fetch("/api/create-checkout-session",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({product:"evidence-report",organization:s.organization,issuers:s.issuers.join(","),
        wallets:s.wallets.join(","),books:s.books.join(","),period_end:s.period_end})})
      .then(function(r){return r.json().then(function(b){if(!r.ok||!b.url)throw new Error(b.error||"Checkout could not start.");return b;});})
      .then(function(b){location.href=b.url;})
      .catch(function(err){pay.disabled=false;say(status,err.message+" You can also email support@noshashi.app.","bad");});
  });
})();
