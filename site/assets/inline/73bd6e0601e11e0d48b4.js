
(function(){
  var raw=(location.hash||"").replace(/^#/,"")||(location.search||"").replace(/^\?/,"");
  var q=new URLSearchParams(raw);
  // Drop the tokens from the address bar and history before anything else.
  if(location.hash||location.search){try{history.replaceState(null,"",location.pathname);}catch(e){}}
  var err=q.get("error_description")||q.get("error");
  if(err){
    document.getElementById("conf-ok").hidden=true;
    document.getElementById("conf-bad").hidden=false;
    document.getElementById("conf-why").textContent=err.replace(/\+/g," ");
  }
})();
