
(function(){
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  var ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}

  var API="https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1/noshashi-issuer-alerts";
  var out=document.getElementById("alert-out");
  function show(html){out.innerHTML='<div class="tool-out">'+html+'</div>';out.hidden=false;}

  /* Arriving from a stop link: /alerts/?unsubscribe=<token> */
  try{
    var token=new URLSearchParams(location.search).get("unsubscribe");
    if(token&&/^[0-9a-f]{48}$/.test(token)){
      show("<p>Stopping these alerts…</p>");
      fetch(API+"/unsubscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:token})})
        .then(function(r){return r.json().then(function(b){return {ok:r.ok,b:b};});})
        .then(function(x){show(x.ok?"<h2>Stopped.</h2><p>No more alerts about <span translate=\"no\">"+esc(x.b.issuer)+"</span> will be sent there.</p>":"<p>"+esc(x.b.message||"That link is not valid.")+"</p>");})
        .catch(function(){show("<p>Could not reach the server. Try the link again shortly.</p>");});
    }
  }catch(e){}

  var form=document.getElementById("alert-form"); if(!form)return;
  var issuer=document.getElementById("alert-issuer"), hook=document.getElementById("alert-webhook");
  var status=document.getElementById("alert-status"), go=document.getElementById("alert-go");
  var HOOK=/^https:\/\/(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d{15,22}\/[A-Za-z0-9_-]{30,100}$/;
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var a=(issuer.value||"").trim(), w=(hook.value||"").trim();
    if(!ADDRESS.test(a)){say(status,"That is not an XRP Ledger classic address. They begin with r.","bad");return;}
    if(!HOOK.test(w)){say(status,"Paste the whole Discord webhook URL. It starts with https://discord.com/api/webhooks/.","bad");return;}
    go.disabled=true; say(status,"Reading the issuer and sending a confirmation to your channel…","busy");
    fetch(API+"/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({issuer:a,discord_webhook:w})})
      .then(function(r){return r.json().then(function(b){return {ok:r.ok,b:b};});})
      .then(function(x){
        if(!x.ok){say(status,x.b.message||"That did not work.","bad");return;}
        say(status,"");
        hook.value="";
        show("<h2>Watching <span translate=\"no\">"+esc(a)+"</span></h2>"+
          "<p>A confirmation with the issuer's current powers was posted to your channel"+(x.b.ledger_index?" (ledger "+esc(x.b.ledger_index)+")":"")+". "+
          "The next change is posted there within about five minutes of validating.</p>");
      })
      .catch(function(){say(status,"Could not reach the server. Try again shortly.","bad");})
      .finally(function(){go.disabled=false;});
  });
})();
