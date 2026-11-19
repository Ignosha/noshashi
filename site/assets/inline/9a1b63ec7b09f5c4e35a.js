
(function(){
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}
  function items(v){return String(v||"").split(/[\s,]+/).map(function(s){return s.trim();}).filter(Boolean);}
  var ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

  var f=document.getElementById("pw-form"), st=document.getElementById("pw-status"), pay=document.getElementById("pw-pay"), check=document.getElementById("pw-check");
  f.issuer.addEventListener("input",function(){var a=f.issuer.value.trim();check.href="/certificate/"+(ADDRESS.test(a)?"?issuer="+encodeURIComponent(a):"");});
  f.addEventListener("submit",function(e){
    e.preventDefault();
    var issuer=f.issuer.value.trim();
    if(!ADDRESS.test(issuer)){say(st,"Enter the token's issuing account. It begins with r.","bad");return;}
    pay.disabled=true; say(st,"Opening secure checkout…","");
    fetch("/api/create-checkout-session",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({product:"issuer-watch",issuer:issuer,label:f.label.value.trim()})})
      .then(function(r){return r.json().then(function(b){if(!r.ok||!b.url)throw new Error(b.error||"Checkout could not start.");return b;});})
      .then(function(b){location.href=b.url;})
      .catch(function(err){pay.disabled=false;say(st,err.message+" You can also email support@noshashi.app.","bad");});
  });
  try{var q=new URLSearchParams(location.search).get("issuer");if(q&&ADDRESS.test(q)){f.issuer.value=q;check.href="/certificate/?issuer="+encodeURIComponent(q);}}catch(e){}
})();
