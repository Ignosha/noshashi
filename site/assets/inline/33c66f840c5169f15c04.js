
(function(){
  var q=document.getElementById("tk-q"), cards=[].slice.call(document.querySelectorAll("#tk-list .tk-card"));
  if(!q)return;
  q.addEventListener("input",function(){var v=q.value.trim().toLowerCase();
    cards.forEach(function(c){c.hidden=v!==""&&c.getAttribute("data-q").indexOf(v)<0;});});
})();
