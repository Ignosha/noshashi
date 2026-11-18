
(function(){
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}
  function items(v){return String(v||"").split(/[\s,]+/).map(function(s){return s.trim();}).filter(Boolean);}
  var ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

  var bf=document.getElementById("pv-badge-form"), bs=document.getElementById("pv-badge-status"), out=document.getElementById("pv-badge-out");
  bf.addEventListener("submit",function(e){
    e.preventDefault();
    var a=bf.issuer.value.trim();
    if(!ADDRESS.test(a)){say(bs,"Enter an XRP Ledger address. It begins with r.","bad");return;}
    var src="https://www.noshashi.app/api/badge?issuer="+encodeURIComponent(a)+"&style=card";
    var link="https://www.noshashi.app/certificate/?issuer="+encodeURIComponent(a);
    var html='<a href="'+link+'"><img src="'+src+'" alt="Issuer facts by NOSHASHI, read live from the XRP Ledger" width="360"></a>';
    document.getElementById("pv-badge-img").innerHTML=html;
    document.getElementById("pv-badge-html").textContent=html;
    document.getElementById("pv-badge-md").textContent="[![Issuer facts by NOSHASHI]("+src+")]("+link+")";
    document.getElementById("pv-sub-issuer").value=a;
    out.hidden=false; say(bs,"Read live from the ledger. It can take a few seconds to load.","");
  });
  var sf=document.getElementById("pv-sub-form"), ss=document.getElementById("pv-sub-status"), pay=document.getElementById("pv-sub-pay");
  sf.addEventListener("submit",function(e){
    e.preventDefault();
    var issuer=sf.issuer.value.trim(), wallets=items(sf.wallets.value);
    if(!ADDRESS.test(issuer)){say(ss,"Enter your token's issuing account. It begins with r.","bad");return;}
    if(wallets.length>3){say(ss,"Up to three team or treasury wallets.","bad");return;}
    pay.disabled=true; say(ss,"Opening secure checkout…","");
    fetch("/api/create-checkout-session",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({product:"verified-issuer",issuer:issuer,currency:sf.currency.value.trim(),wallets:wallets.join(","),organization:sf.organization.value.trim()})})
      .then(function(r){return r.json().then(function(b){if(!r.ok||!b.url)throw new Error(b.error||"Checkout could not start.");return b;});})
      .then(function(b){location.href=b.url;})
      .catch(function(err){pay.disabled=false;say(ss,err.message+" You can also email support@noshashi.app.","bad");});
  });
})();
