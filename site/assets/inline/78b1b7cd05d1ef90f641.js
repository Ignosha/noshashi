
(function(){
  var feed=document.getElementById("news-feed"),state=document.getElementById("news-state");
  if(!feed)return;
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function ago(iso){var t=Date.parse(iso);if(!isFinite(t))return"";
    var s=Math.max(0,Math.round((Date.now()-t)/1000));if(s<90)return"just now";
    var m=Math.round(s/60);if(m<60)return m+"m ago";var h=Math.round(m/60);
    if(h<24)return h+"h ago";var d=Math.round(h/24);if(d<30)return d+"d ago";
    var mo=Math.round(d/30);return mo<12?mo+"mo ago":Math.round(mo/12)+"y ago";}
  function load(){
    fetch("/api/xrp-news?limit=24",{headers:{Accept:"application/json"}})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(d){
        if(!d||!d.items||!d.items.length)return;
        feed.innerHTML=d.items.map(function(i){
          var w=i.publishedAt?'<time datetime="'+esc(i.publishedAt)+'">'+esc(ago(i.publishedAt))+"</time>":"";
          var u=/^https?:\/\//.test(i.url||"")?i.url:"#";
          return '<article class="feed-item"><span class="feed-meta"><span class="src" translate="no">'+
            esc(i.publisher)+"</span>"+w+'</span><a class="headline" data-i18n-live href="'+esc(u)+
            '" rel="noopener nofollow" target="_blank">'+esc(i.title)+"</a></article>";}).join("");
        if(state){state.textContent="UPDATED "+ago(d.fetchedAt);state.className="reading live";}
      }).catch(function(){});
  }
  document.addEventListener("visibilitychange",function(){if(!document.hidden)load();});
  setTimeout(load,20000);
})();
