
(function(){
  var button=document.getElementById("themeToggle"),label=document.getElementById("themeLabel");
  if(!button)return;
  function sync(){var light=document.documentElement.getAttribute("data-theme")==="light";
    if(label)label.textContent=(window.__NOSHASHI_I18N||{})[light?"theme.dark":"theme.light"]||(light?"DARK":"LIGHT");
    button.setAttribute("aria-label",(window.__NOSHASHI_I18N||{})[light?"theme.ariaDark":"theme.ariaLight"]||(light?"Switch to dark mode":"Switch to light mode"));}
  sync();
  button.addEventListener("click",function(){
    var next=document.documentElement.getAttribute("data-theme")==="light"?"dark":"light";
    document.documentElement.setAttribute("data-theme",next);
    try{localStorage.setItem("noshashi-theme",next);}catch(e){}
    sync();});
})();
