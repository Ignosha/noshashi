
(function(){
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  var ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}

  var F="https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1";
  var form=document.getElementById("xa-form"); if(!form)return;
  var input=document.getElementById("xa-address"), status=document.getElementById("xa-status");
  var out=document.getElementById("xa-out"), go=document.getElementById("xa-go");
  function get(url){return fetch(url).then(function(r){return r.json().then(function(b){return {ok:r.ok,status:r.status,b:b};});});}
  function row(label,text,tone){return '<div><span>'+esc(label)+'</span><b class="t-'+tone+'">'+esc(text)+'</b></div>';}
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var a=(input.value||"").trim();
    if(!ADDRESS.test(a)){say(status,"That is not an XRP Ledger classic address. They begin with r.","bad");return;}
    go.disabled=true; out.hidden=true; say(status,"Checking…","busy");
    var unknown={ok:false,b:{}};
    Promise.all([
      get(F+"/noshashi-xrpl-watch/sanctions?addresses="+a).catch(function(){return unknown;}),
      get(F+"/noshashi-xrpl-watch/threats?addresses="+a).catch(function(){return unknown;}),
      get("/api/issuer-state?issuer="+a).catch(function(){return unknown;})
    ]).then(function(r){
      var sanc=r[0], thr=r[1], st=r[2], rows="", worst="go";
      function bump(t){var o={go:0,unknown:1,hold:2,nogo:3};if(o[t]>o[worst])worst=t;}
      /* Each source is read on its own. One that failed is "not checked", never "clear". */
      if(!sanc.ok){rows+=row("Sanctions (OFAC SDN)","not checked","unknown");bump("unknown");}
      else{var hit=(sanc.b.hits||[]).length>0;
        rows+=row("Sanctions (OFAC SDN)",hit?"LISTED":"not listed",hit?"nogo":"go");if(hit)bump("nogo");}
      if(!thr.ok){rows+=row("Scam registry","not checked","unknown");bump("unknown");}
      else{var bad=(thr.b.hits||[]).length>0;
        rows+=row("Scam registry",bad?"REPORTED":"no reports",bad?"nogo":"go");if(bad)bump("nogo");}
      if(st.status===404){rows+=row("On the ledger","not activated","hold");bump("hold");}
      else if(!st.ok){rows+=row("On the ledger","not read","unknown");bump("unknown");}
      else{var d=(st.b.result||{}).account_data||{};var flags=Number(d.Flags||0)>>>0;
        rows+=row("On the ledger","activated","go");
        if(flags&0x00020000){rows+=row("Destination tag","REQUIRED","hold");bump("hold");}
        if(flags&0x01000000){rows+=row("Deposit authorization","on (it must pre-approve you)","hold");bump("hold");}
        if(d.Domain){var dom="";try{dom=decodeURIComponent(d.Domain.replace(/../g,"%$&"));}catch(x){dom=d.Domain;}
          rows+=row("Claims domain",dom,"unknown");}
      }
      var head={go:"Nothing found",hold:"Check before sending",nogo:"Do not send",unknown:"Could not check everything"}[worst];
      out.innerHTML='<div class="tool-out"><h2 class="t-'+worst+'">'+esc(head)+'</h2>'+
        '<p class="tool-note" translate="no" style="word-break:break-all">'+esc(a)+'</p><div class="tool-facts">'+rows+'</div>'+
        '<p class="tool-note">Sending tokens it issued? <a href="/certificate/?issuer='+esc(a)+'">See what the issuer can still do</a>.</p></div>';
      out.hidden=false; say(status,"");
    }).finally(function(){go.disabled=false;});
  });
  try{var q=new URLSearchParams(location.search).get("address");if(q){input.value=q;form.requestSubmit?form.requestSubmit():form.dispatchEvent(new Event("submit",{cancelable:true}));}}catch(e){}
})();
