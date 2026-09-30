
(function(){
  var form=document.getElementById("cert-form");
  if(!form)return;
  var status=document.getElementById("cert-status");
  var out=document.getElementById("cert-out");
  var button=document.getElementById("cert-run");
  var walk=document.getElementById("cert-walk");
  var input=document.getElementById("issuer");

  function say(text,tone){status.textContent=text;status.setAttribute("data-tone",tone||"");}
  function esc(v){return String(v).replace(/[&<>"]/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
  /* A finding's label and detail are sentences with data inside them —
     the currency code, an address. The data is marked translate="no" so
     the page translation (site/assets/i18n.js) translates the sentence
     around it and leaves the reading exactly as the ledger gave it. */
  function data(text,cert){
    var out=esc(text).replace(/(^|[^A-Za-z0-9])(r[1-9A-HJ-NP-Za-km-z]{24,34})(?![A-Za-z0-9])/g,
      function(m,pre,a){return pre+'<span translate="no">'+a+'</span>';});
    var cur=cert.currencyLabel&&String(cert.currencyLabel).split(" ")[0];
    if(cur&&/^[A-Za-z0-9]{2,20}$/.test(cur)){
      out=out.replace(new RegExp("(^|[ (])("+cur+")(?=[ .,;)]|$)","g"),
        function(m,pre,c){return pre+'<span translate="no">'+c+'</span>';});
    }
    return out;
  }

  /* Wording mirrors AUTHORITY_VERDICT_COPY in src/lib/desk/authority.ts.
     The console and this page must not describe the same verdict two
     different ways. */
  var COPY={
    "go":{cls:"go",tag:"No unilateral authority found",
      text:"On the checks run, no single party was found able to freeze, gate or unilaterally sign for this issuance at this ledger. This describes the authority observed, not the conduct of whoever holds it."},
    "hold":{cls:"hold",tag:"Authority retained, constrained",
      text:"No single party can act alone, but the issuer has kept powers that bear on a holder — a freeze it has not surrendered, a fee it sets, or a supply too concentrated or too unreadable to call dispersed."},
    "no-go":{cls:"nogo",tag:"Unilateral authority present",
      text:"A single party can act on this issuance without anyone's agreement, or the issuance could not be read well enough to say otherwise. Either way a holder's balance is not solely in the holder's control."},
    "insufficient-data":{cls:"unknown",tag:"Not established",
      text:"A source needed to reach a conclusion could not be read at this ledger, and no blocking finding was established without it. This is a statement about the reading, not about the issuer: it is not a clearance, and it is not an allegation."}
  };

  /* Provenance of the holder distribution. Printed because it is
     inside the digest: a reader recomputing the digest from what is on
     this page needs every field it binds, and because "read from the
     ledger" and "taken from an indexer and reconciled" are not the
     same evidence. */
  var SOURCE_LABEL={
    ledger:'DISTRIBUTION READ FROM LEDGER',
    indexer:'DISTRIBUTION FROM RECONCILED INDEXER',
    none:'DISTRIBUTION NOT READ'
  };

  function render(cert){
    /* An unrecognised verdict falls back to "not established", NEVER to
       no-go. The previous fallback was COPY["no-go"], which meant any
       verdict this page did not know about — including insufficient-data
       the moment it was added — rendered on a PUBLIC page as "unilateral
       authority present" about a real, named issuer. Defaulting an
       unknown to the most damaging reading is the wrong direction to
       fail, and it is a false allegation rather than a display bug. */
    var copy=COPY[cert.verdict]||COPY["insufficient-data"];
    var html='<div class="cert-verdict '+copy.cls+'">'+
      '<p class="tag">'+esc(copy.tag)+'</p>'+
      '<h2 translate="no">'+esc(cert.issuer)+'</h2>'+
      '<p>'+esc(copy.text)+'</p>'+
      '<p class="cert-meta">LEDGER '+esc(String(cert.ledgerIndex))+
        (cert.currencyLabel?' · <span translate="no">'+esc(cert.currencyLabel)+'</span>':'')+
        ' · READ <span translate="no">'+esc(new Date(cert.evaluatedAt).toLocaleString())+'</span>'+
        ' · '+esc(SOURCE_LABEL[cert.source]||'DISTRIBUTION UNSTATED')+
        /* Also inside the digest, so a reader recomputing from this page
           needs it. Printed plainly rather than hidden behind a label:
           it is the difference between two certificates that otherwise
           read identically. */
        (cert.rulesVersion ? ' · RULES v'+esc(String(cert.rulesVersion)) : '')+
        '<br>DIGEST <span translate="no">'+esc(cert.digest)+'</span></p>'+
      '</div><div class="cert-checks">';

    for(var i=0;i<cert.checks.length;i++){
      var c=cert.checks[i];
      /* CLEAR / FINDING, not YES / NO.
         YES-NO was read against the check's own label and inverted it:
         "Freeze permanently surrendered" with the flag NOT set is a
         failed check, and it printed YES — telling a reader the issuer
         had given up a power it had kept. It also had no truthful
         answer for an abstention, where the honest report is that
         nothing was measured, which is neither yes nor no. */
      /* Five states: a check that could not be answered, or does not
         apply, says so rather than borrowing CLEAR or FINDING. */
      var st=c.state==="INSUFFICIENT_DATA"||c.state==="NOT_APPLICABLE"?c.state:null;
      var mark=st?"warn":c.passed?"pass":(c.severity==="block"?"block":"warn");
      var word=st==="INSUFFICIENT_DATA"?"NO ANSWER":st==="NOT_APPLICABLE"?"DOES NOT APPLY":c.passed?"CLEAR":"FINDING";
      html+='<div class="cert-check">'+
        '<span class="mark '+mark+'">'+word+'</span>'+
        '<h3>'+data(c.label,cert)+'</h3>'+
        '<p>'+data(c.detail,cert)+'</p>'+
        '<code>'+esc(c.id)+'</code>'+
      '</div>';
    }

    out.innerHTML=html+'</div>';
    out.hidden=false;
  }

  form.addEventListener("submit",function(event){
    event.preventDefault();
    var issuer=(input.value||"").trim();
    if(!issuer){say("Enter an issuing account.","bad");return;}
    if(!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(issuer)){
      say("That is not an XRP Ledger classic address. They begin with r.","bad");return;
    }

    button.disabled=true;
    out.hidden=true;
    say(walk.checked?"Reading ledger state and walking holder lines…":"Reading ledger state…","busy");

    fetch("/api/authority?issuer="+encodeURIComponent(issuer)+(walk.checked?"&walk=1":""))
      .then(function(r){return r.json().then(function(b){return {ok:r.ok,body:b};});})
      .then(function(result){
        if(!result.ok){say(result.body.error||"That could not be read.","bad");return;}
        say("");
        render(result.body);
      })
      .catch(function(){say("Could not reach the server. Try again shortly.","bad");})
      .finally(function(){button.disabled=false;});
  });

  /* Deep link: /certificate/?issuer=r… runs on load, so a certificate
     can be linked to in an article or a memo rather than described. */
  try{
    var wanted=new URLSearchParams(location.search).get("issuer");
    if(wanted){input.value=wanted;form.requestSubmit?form.requestSubmit():form.dispatchEvent(new Event("submit",{cancelable:true}));}
  }catch(e){}
})();
