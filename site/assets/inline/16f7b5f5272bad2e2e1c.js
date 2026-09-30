
/*
 * Progressive enhancement only: without this the form still posts and
 * the endpoint still redirects to Stripe. This exists so a failure is
 * readable in place instead of a navigation to an error page.
 */
(function(){
  document.querySelectorAll(".checkout-form").forEach(function(form){
    var error=form.querySelector(".checkout-error"),button=form.querySelector("button");
    form.addEventListener("submit",function(event){
      event.preventDefault();
      if(error){error.hidden=true;error.textContent="";}
      var original=button.textContent;
      button.disabled=true;button.textContent="OPENING STRIPE…";
      var payload={};
      new FormData(form).forEach(function(value,key){payload[key]=value;});
      fetch(form.action,{
        method:"POST",
        headers:{Accept:"application/json","Content-Type":"application/json"},
        body:JSON.stringify(payload)
      })
        .then(function(r){return r.json().then(function(b){return {ok:r.ok,body:b};});})
        .then(function(result){
          if(result.ok&&result.body.url){location.href=result.body.url;return;}
          throw new Error(result.body.error||"Checkout could not start.");
        })
        .catch(function(e){
          button.disabled=false;button.textContent=original;
          if(error){error.textContent=e.message;error.hidden=false;}
        });
    });
  });
})();
