
(function(){
  var form=document.getElementById("contact-form");
  if(!form)return;
  var status=document.getElementById("contact-status");
  var button=document.getElementById("contact-send");
  var opened=Date.now();

  /* Deep link from the site's CTAs: /contact/?topic=institutions */
  try{
    var wanted=new URLSearchParams(location.search).get("topic");
    var select=document.getElementById("topic");
    if(wanted&&select&&[].some.call(select.options,function(o){return o.value===wanted;})){
      select.value=wanted;
    }
  }catch(e){}

  function say(text,tone){status.textContent=text;status.setAttribute("data-tone",tone||"");}
  function esc(v){return String(v).replace(/[&<>"]/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}

  form.addEventListener("submit",function(event){
    event.preventDefault();
    var data=Object.fromEntries(new FormData(form).entries());
    data.elapsed=Date.now()-opened;

    button.disabled=true;
    say("Sending…","busy");

    fetch("/api/contact",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify(data)})
      .then(function(r){return r.json().then(function(b){return {ok:r.ok,body:b};});})
      .then(function(result){
        if(result.ok){
          form.reset();
          say(result.body.message||"Message sent.","good");
          return;
        }
        /* 503 means nobody has the message. Say that, and hand over the
           address that does work, rather than a generic failure. */
        if(result.body.mailto){
          /* The address is data, so the page translation leaves it be. */
          status.innerHTML=esc(result.body.error)+' Email <a translate="no" href="mailto:'+
            esc(result.body.mailto)+'">'+esc(result.body.mailto)+'</a> instead — that address works.';
          status.setAttribute("data-tone","bad");
          return;
        }
        say(result.body.error||"That did not send.","bad");
      })
      .catch(function(){
        say("Could not reach the server. Email support@noshashi.app instead.","bad");
      })
      .finally(function(){button.disabled=false;});
  });
})();
