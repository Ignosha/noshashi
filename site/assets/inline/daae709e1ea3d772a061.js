
(function(){
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  var ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}

  var form=document.getElementById("badge-form"); if(!form)return;
  var input=document.getElementById("badge-issuer"), theme=document.getElementById("badge-theme");
  var status=document.getElementById("badge-status"), out=document.getElementById("badge-out");
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var issuer=(input.value||"").trim();
    if(!ADDRESS.test(issuer)){say(status,"That is not an XRP Ledger classic address. They begin with r.","bad");return;}
    say(status,"");
    var t=theme.value==="dark"?"&theme=dark":"";
    var base="https://www.noshashi.app/api/badge?issuer="+issuer+t;
    var flat=base, card=base+"&style=card", link="https://www.noshashi.app/certificate/?issuer="+issuer;
    out.innerHTML='<div class="tool-out"><h2>Preview</h2>'+
      '<div class="tool-preview"><img alt="XRPL issuer authority badge" src="/api/badge?issuer='+esc(issuer)+esc(t)+'">'+
      '<img alt="XRPL issuer authority card" src="/api/badge?issuer='+esc(issuer)+esc(t)+'&amp;style=card"></div>'+
      '<h2>Markdown (README, GitHub)</h2><div class="tool-snip">'+esc("[![XRPL issuer authority]("+flat+")]("+link+")")+'</div>'+
      '<h2>HTML (token page, listing)</h2><div class="tool-snip">'+esc('<a href="'+link+'"><img src="'+card+'" alt="XRPL issuer authority, read live by NOSHASHI" width="340"></a>')+'</div>'+
      '<h2>Image URL</h2><div class="tool-snip">'+esc(flat)+'</div>'+
      '<p class="tool-note">The image is re-read at most every five minutes and served from the edge, so a badge on a busy page costs nothing extra.</p></div>';
    out.hidden=false;
  });
  try{var q=new URLSearchParams(location.search).get("issuer");if(q){input.value=q;form.requestSubmit?form.requestSubmit():form.dispatchEvent(new Event("submit",{cancelable:true}));}}catch(e){}
})();
