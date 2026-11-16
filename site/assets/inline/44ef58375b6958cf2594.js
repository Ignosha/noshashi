
(function(){
  var form=document.getElementById("cert-form");
  if(!form)return;
  var status=document.getElementById("cert-status");
  var out=document.getElementById("cert-out");
  var button=document.getElementById("cert-run");
  var input=document.getElementById("issuer");
  var assetInput=document.getElementById("asset");

  function say(text,tone){status.textContent=text;status.setAttribute("data-tone",tone||"");}
  function esc(v){return String(v).replace(/[&<>"]/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
  function data(text){
    return esc(text).replace(/(^|[^A-Z0-9])(G[A-Z2-7]{55})(?![A-Z0-9])/g,
      function(m,pre,a){return pre+'<span translate="no">'+a+'</span>';});
  }

  /* Same wording as the XRP Ledger certificate (and
     AUTHORITY_VERDICT_COPY in src/lib/desk/authority.ts). */
  var COPY={
    "go":{cls:"go",tag:"No unilateral authority found",
      text:"On the checks run, no single party was found able to freeze, claw back, gate or unilaterally sign for this issuance at this ledger. This describes the authority observed, not the conduct of whoever holds it."},
    "hold":{cls:"hold",tag:"Authority retained, constrained",
      text:"No single party can act alone, but the issuer has kept powers that bear on a holder: a freeze or clawback it can use or switch back on, or approval over who may hold."},
    "no-go":{cls:"nogo",tag:"Unilateral authority present",
      text:"A single party can act on this issuance without anyone's agreement, or the issuer could not be read well enough to say otherwise. Either way a holder's balance is not solely in the holder's control."},
    "insufficient-data":{cls:"unknown",tag:"Not established",
      text:"A source needed to reach a conclusion could not be read at this ledger, and no blocking finding was established without it. This is a statement about the reading, not about the issuer: it is not a clearance, and it is not an allegation."}
  };

  function render(cert){
    var copy=COPY[cert.verdict]||COPY["insufficient-data"];
    var a=cert.asset;
    var html='<div class="cert-verdict '+copy.cls+'">'+
      '<p class="tag">'+esc(copy.tag)+'</p>'+
      '<h2 translate="no">'+esc(cert.issuer)+'</h2>'+
      '<p>'+esc(copy.text)+'</p>'+
      '<p class="cert-meta">STELLAR LEDGER '+esc(String(cert.ledgerIndex))+
        (a?' · <span translate="no">'+esc(a.code)+'</span> · '+esc(Number(a.trustLinesAuthorized).toLocaleString())+' AUTHORIZED TRUST LINES':'')+
        (cert.homeDomain?' · <span translate="no">'+esc(cert.homeDomain)+'</span>':'')+
        ' · READ <span translate="no">'+esc(new Date(cert.evaluatedAt).toLocaleString())+'</span>'+
        ' · SOURCE HORIZON'+
        (cert.rulesVersion?' · RULES v'+esc(String(cert.rulesVersion)):'')+
        '<br>DIGEST <span translate="no">'+esc(cert.digest)+'</span></p>'+
      '</div><div class="cert-checks">';
    for(var i=0;i<cert.checks.length;i++){
      var c=cert.checks[i];
      var mark=c.passed?"pass":(c.severity==="block"?"block":"warn");
      html+='<div class="cert-check">'+
        '<span class="mark '+mark+'">'+(c.passed?"CLEAR":"FINDING")+'</span>'+
        '<h3>'+data(c.label)+'</h3>'+
        '<p>'+data(c.detail)+'</p>'+
        '<code>'+esc(c.id)+'</code>'+
      '</div>';
    }
    out.innerHTML=html+'</div>';
    out.hidden=false;
  }

  form.addEventListener("submit",function(event){
    event.preventDefault();
    var issuer=(input.value||"").trim().toUpperCase();
    var asset=(assetInput.value||"").trim();
    if(!issuer){say("Enter an issuing account.","bad");return;}
    if(!/^G[A-Z2-7]{55}$/.test(issuer)){
      say("That is not a Stellar account ID. They are 56 characters and begin with G.","bad");return;
    }
    if(asset&&!/^[A-Za-z0-9]{1,12}$/.test(asset)){say("An asset code is 1 to 12 letters or digits.","bad");return;}
    button.disabled=true;
    out.hidden=true;
    say("Reading the Stellar network…","busy");
    fetch("/api/stellar/authority?issuer="+encodeURIComponent(issuer)+(asset?"&asset="+encodeURIComponent(asset):""))
      .then(function(r){return r.json().then(function(b){return {ok:r.ok,body:b};});})
      .then(function(result){
        if(!result.ok){say(result.body.error||"That could not be read.","bad");return;}
        say("");
        render(result.body);
      })
      .catch(function(){say("Could not reach the server. Try again shortly.","bad");})
      .finally(function(){button.disabled=false;});
  });

  /* Deep link: /stellar/?issuer=G…&asset=CODE runs on load. */
  try{
    var q=new URLSearchParams(location.search);
    if(q.get("asset"))assetInput.value=q.get("asset");
    if(q.get("issuer")){input.value=q.get("issuer");form.requestSubmit?form.requestSubmit():form.dispatchEvent(new Event("submit",{cancelable:true}));}
  }catch(e){}
})();
