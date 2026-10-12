/*
 * The free tools that sell the paid ones: the issuer badge, issuer alerts,
 * the delivered-amount export, and the mobile screening page Xaman opens
 * as an xApp. Rendered at build time like every other page
 * (scripts/build-site.mjs calls buildTools), and every number on them is
 * read live in the browser from the same endpoints the SDK uses.
 *
 * Copy rules the whole site keeps, and these pages too: no score, no
 * legal finding, an unreadable fact is never shown as a pass, and nothing
 * here asks for a key, a seed or a balance.
 */

import { renderPage, breadcrumb, ORIGIN } from "../api/_lib/shell.js";

const FUNCTIONS = "https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1";

/* Shared by every tool page's script: escaping and the address shape. */
const COMMON_JS = `
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  var ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}
`;

const TOOL_CSS = `<style>
.tool-form{display:grid;gap:14px;max-width:640px;margin-bottom:22px}
.tool-row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
.tool-row .form-field{flex:1 1 260px}
.tool-out{border:1px solid var(--rule);border-radius:var(--r);padding:20px 22px;margin:14px 0}
.tool-out h2{font-size:16px;margin:0 0 10px}
.tool-snip{font:11.5px "IBM Plex Mono",monospace;background:var(--surface);border:1px solid var(--rule);
  border-radius:var(--r);padding:12px 14px;white-space:pre-wrap;word-break:break-all;margin:6px 0 12px;user-select:all}
.tool-preview{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start;margin:6px 0 16px}
.tool-preview img{max-width:100%;height:auto}
.tool-table{width:100%;border-collapse:collapse;font-size:12.5px}
.tool-table th,.tool-table td{border-bottom:1px solid var(--rule);padding:6px 8px;text-align:left;vertical-align:top}
.tool-table td.mono{font:11px "IBM Plex Mono",monospace;word-break:break-all}
.tool-table .flag{color:var(--nogo);font-weight:600}
.tool-scroll{overflow-x:auto;max-width:100%}
.tool-facts{display:grid;gap:6px;margin:8px 0}
.tool-facts div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--rule);padding:6px 0;font-size:13px}
.tool-facts b{font:11px "IBM Plex Mono",monospace;letter-spacing:.08em}
.t-go{color:var(--go)} .t-hold{color:var(--hold)} .t-nogo{color:var(--nogo)} .t-unknown{color:var(--muted)}
.tool-note{color:var(--muted);font-size:12.5px;line-height:1.6;max-width:72ch}
</style>`;

/* ── /badge/ ──────────────────────────────────────────────────────── */
async function buildBadge(write) {
  const body = `<div class="page-head">
  <p class="eyebrow">Free · for issuers and listing sites</p>
  <h1>Show holders what the issuer can still do.</h1>
  <p>A live badge for a token page, a README or an exchange listing. It reads the issuer's account
     from validated XRP Ledger state every five minutes. It shows whether one key signs for it,
     whether it kept the power to freeze, and what fee it charges, with the ledger it was read at.
     Each badge links to the full certificate.</p>
</div>
<section>
  <form class="tool-form" id="badge-form" novalidate>
    <div class="tool-row">
      <div class="form-field"><label for="badge-issuer">Issuing account</label>
        <input id="badge-issuer" type="text" spellcheck="false" autocomplete="off" placeholder="r…" maxlength="40" required></div>
      <div class="form-field" style="flex:0 0 140px"><label for="badge-theme">Theme</label>
        <select id="badge-theme"><option value="light">Light</option><option value="dark">Dark</option></select></div>
      <button class="btn" type="submit">Make the badge</button>
    </div>
    <p class="form-status" id="badge-status" role="status" aria-live="polite"></p>
  </form>
  <div id="badge-out" hidden></div>
  <div class="grid g2" style="margin-top:28px">
    <div class="panel"><p class="num">WHAT IT SHOWS</p>
      <p>Ledger facts, each on its own: who can sign, freeze, global freeze, permissioned holding and
         transfer fee. There is no score and no overall verdict. Supply concentration is left off,
         because measuring it means walking every holder line, which is too slow for an image. The
         certificate it links to measures it.</p></div>
    <div class="panel"><p class="num">WHEN IT CANNOT READ</p>
      <p>If the ledger cannot be read, the badge turns grey and says "unreadable". It never shows
         green for an issuer it did not read. The colour is the most serious finding shown: red when
         one key signs alone or a global freeze is on, amber for a retained power or a fee.</p></div>
  </div>
  <p class="tool-note" style="margin-top:18px">Want to know the moment any of this changes?
     <a href="/alerts/">Issuer alerts</a> post to Discord or Telegram.</p>
</section>`;

  const script = `<script>
(function(){${COMMON_JS}
  var form=document.getElementById("badge-form"); if(!form)return;
  var input=document.getElementById("badge-issuer"), theme=document.getElementById("badge-theme");
  var status=document.getElementById("badge-status"), out=document.getElementById("badge-out");
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var issuer=(input.value||"").trim();
    if(!ADDRESS.test(issuer)){say(status,"That is not an XRP Ledger classic address. They begin with r.","bad");return;}
    say(status,"");
    var t=theme.value==="dark"?"&theme=dark":"";
    var base="${ORIGIN}/api/badge?issuer="+issuer+t;
    var flat=base, card=base+"&style=card", link="${ORIGIN}/certificate/?issuer="+issuer;
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
</script>`;

  await write("badge/index.html", renderPage({
    title: "Issuer authority badge — live XRPL facts for a token page",
    description: "Free live badge for XRP Ledger issuers: who signs, whether freeze is retained, transfer fee, read from validated ledger state every five minutes. Markdown and HTML embed codes.",
    path: "/badge/",
    head: TOOL_CSS,
    body,
    structured: [breadcrumb("Issuer badge", "/badge/")],
    scripts: script,
  }));
}

/* ── /alerts/ ─────────────────────────────────────────────────────── */
async function buildAlerts(write) {
  const body = `<div class="page-head">
  <p class="eyebrow">Free for up to 3 issuers per channel</p>
  <h1>Know the moment an issuer's powers change.</h1>
  <p>A freeze switched on, a new key that signs alone, clawback enabled, a fee raised. Each one is a
     single transaction, visible on the ledger the instant it validates. Few holders notice until the
     power is used. NOSHASHI reads every watched issuer every five minutes and posts any change to
     your Discord channel or Telegram chat.</p>
</div>
<section>
  <div class="grid g2">
    <div class="panel">
      <p class="num">DISCORD</p>
      <form class="tool-form" id="alert-form" novalidate style="margin:8px 0 0">
        <div class="form-field"><label for="alert-issuer">Issuing account to watch</label>
          <input id="alert-issuer" type="text" spellcheck="false" autocomplete="off" placeholder="r…" maxlength="40" required></div>
        <div class="form-field"><label for="alert-webhook">Discord channel webhook URL</label>
          <input id="alert-webhook" type="url" spellcheck="false" autocomplete="off" placeholder="https://discord.com/api/webhooks/…" required></div>
        <button class="btn" type="submit" id="alert-go">Watch this issuer</button>
        <p class="form-status" id="alert-status" role="status" aria-live="polite"></p>
      </form>
      <p class="tool-note">To get the webhook URL in Discord, open Server Settings, then Integrations,
         then Webhooks. Choose New Webhook, pick the channel and click Copy Webhook URL. The confirmation
         and every alert go only to that channel, and the stop link is in each message.</p>
    </div>
    <div class="panel">
      <p class="num">TELEGRAM</p>
      <p>Message the NOSHASHI bot:</p>
      <div class="tool-snip">/watch r…
/unwatch r…
/list</div>
      <p class="tool-note" id="tg-link">The bot reads only public ledger state. It never asks for
         keys, seeds or balances. Anyone who asks for those in its name is not NOSHASHI.</p>
    </div>
  </div>
  <div id="alert-out" hidden></div>
  <div class="panel" style="margin-top:14px"><p class="num">WHAT COUNTS AS A CHANGE</p>
    <p>Global freeze on or off. Clawback enabled. Regular key set, changed or removed. Signer list or
       quorum changed. Master key disabled or re-enabled. Permissioned holding switched on or off.
       Transfer fee changed. Freeze permanently surrendered. Domain changed. Each alert names the ledger
       it was read at and links to the full certificate. If the ledger could not be read, that round is
       skipped. A failed read is never reported as a change.</p></div>
  <p class="tool-note" style="margin-top:14px">Need more than three issuers, a shared team feed or signed
     webhooks into your own systems? Event feeds are part of the
     <a href="/strategic-infrastructure/">Strategic plan</a>.</p>
</section>`;

  const script = `<script>
(function(){${COMMON_JS}
  var API="${FUNCTIONS}/noshashi-issuer-alerts";
  var out=document.getElementById("alert-out");
  function show(html){out.innerHTML='<div class="tool-out">'+html+'</div>';out.hidden=false;}

  /* Arriving from a stop link: /alerts/?unsubscribe=<token> */
  try{
    var token=new URLSearchParams(location.search).get("unsubscribe");
    if(token&&/^[0-9a-f]{48}$/.test(token)){
      show("<p>Stopping these alerts…</p>");
      fetch(API+"/unsubscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:token})})
        .then(function(r){return r.json().then(function(b){return {ok:r.ok,b:b};});})
        .then(function(x){show(x.ok?"<h2>Stopped.</h2><p>No more alerts about <span translate=\\"no\\">"+esc(x.b.issuer)+"</span> will be sent there.</p>":"<p>"+esc(x.b.message||"That link is not valid.")+"</p>");})
        .catch(function(){show("<p>Could not reach the server. Try the link again shortly.</p>");});
    }
  }catch(e){}

  var form=document.getElementById("alert-form"); if(!form)return;
  var issuer=document.getElementById("alert-issuer"), hook=document.getElementById("alert-webhook");
  var status=document.getElementById("alert-status"), go=document.getElementById("alert-go");
  var HOOK=/^https:\\/\\/(discord\\.com|discordapp\\.com|ptb\\.discord\\.com|canary\\.discord\\.com)\\/api\\/webhooks\\/\\d{15,22}\\/[A-Za-z0-9_-]{30,100}$/;
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var a=(issuer.value||"").trim(), w=(hook.value||"").trim();
    if(!ADDRESS.test(a)){say(status,"That is not an XRP Ledger classic address. They begin with r.","bad");return;}
    if(!HOOK.test(w)){say(status,"Paste the whole Discord webhook URL. It starts with https://discord.com/api/webhooks/.","bad");return;}
    go.disabled=true; say(status,"Reading the issuer and sending a confirmation to your channel…","busy");
    fetch(API+"/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({issuer:a,discord_webhook:w})})
      .then(function(r){return r.json().then(function(b){return {ok:r.ok,b:b};});})
      .then(function(x){
        if(!x.ok){say(status,x.b.message||"That did not work.","bad");return;}
        say(status,"");
        hook.value="";
        show("<h2>Watching <span translate=\\"no\\">"+esc(a)+"</span></h2>"+
          "<p>A confirmation with the issuer's current powers was posted to your channel"+(x.b.ledger_index?" (ledger "+esc(x.b.ledger_index)+")":"")+". "+
          "The next change is posted there within about five minutes of validating.</p>");
      })
      .catch(function(){say(status,"Could not reach the server. Try again shortly.","bad");})
      .finally(function(){go.disabled=false;});
  });
})();
</script>`;

  await write("alerts/index.html", renderPage({
    title: "Issuer alerts — Discord and Telegram, when an XRPL issuer's powers change",
    description: "Free alerts when an XRP Ledger issuer turns on a freeze, enables clawback, changes its signing keys or signer list, or raises its transfer fee. Read every five minutes from validated ledger state.",
    path: "/alerts/",
    head: TOOL_CSS,
    body,
    structured: [breadcrumb("Issuer alerts", "/alerts/")],
    scripts: script,
  }));
}

/* ── /delivered/ ──────────────────────────────────────────────────── */
async function buildDelivered(write) {
  const body = `<div class="page-head">
  <p class="eyebrow">Free · CSV for your records</p>
  <h1>What did each payment actually deliver?</h1>
  <p>An XRP Ledger payment states one amount and can deliver far less: "1,000,000 USD" that arrived
     as 0.000001 USD is a real, repeatedly used trick. Wallet histories, tax tools and spreadsheets
     that record the stated amount record money that never arrived. This export puts the stated and
     delivered amounts side by side for every payment and flags the partial ones.</p>
</div>
<section>
  <form class="tool-form" id="dl-form" novalidate>
    <div class="form-field"><label for="dl-account">Account</label>
      <input id="dl-account" type="text" spellcheck="false" autocomplete="off" placeholder="r…" maxlength="40" required></div>
    <div class="tool-row">
      <div class="form-field"><label for="dl-from">From (UTC)</label><input id="dl-from" type="date"></div>
      <div class="form-field"><label for="dl-to">To (UTC)</label><input id="dl-to" type="date"></div>
      <button class="btn" type="submit" id="dl-go">Read payments</button>
    </div>
    <p class="form-status" id="dl-status" role="status" aria-live="polite"></p>
  </form>
  <div id="dl-out" hidden></div>
  <div class="grid g2" style="margin-top:28px">
    <div class="panel"><p class="num">WHAT IS IN THE FILE</p>
      <p>One row per successful payment into or out of the account. Each row has the date, ledger,
         hash, direction, counterparty, destination tag and currency (name and raw code), plus the
         issuer, the <strong>stated</strong> amount, the <strong>delivered</strong> amount, the
         partial-payment flag, whether less arrived than was stated, and the fee on outgoing
         payments. Amounts are exact decimals and never rounded through a float.</p></div>
    <div class="panel"><p class="num">WHAT IT WILL NOT DO</p>
      <p>It never fills in a missing delivered amount with the stated one. Payments validated before
         20 January 2014 have no delivered amount on the ledger and say "unavailable". If a long
         history is cut short, the page says so and names the oldest ledger reached. A partial file
         is never presented as a whole one. This is a record of ledger facts, not tax advice.</p></div>
  </div>
</section>`;

  const script = `<script>
(function(){${COMMON_JS}
  var form=document.getElementById("dl-form"); if(!form)return;
  var acct=document.getElementById("dl-account"), from=document.getElementById("dl-from"), to=document.getElementById("dl-to");
  var status=document.getElementById("dl-status"), out=document.getElementById("dl-out"), go=document.getElementById("dl-go");
  var STOP={end_of_history:"the account's whole history",reached_from_date:"everything from your start date",
    page_cap:"the newest 10,000 transactions only",time_budget:"as far back as could be read in the time allowed"};
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var a=(acct.value||"").trim();
    if(!ADDRESS.test(a)){say(status,"That is not an XRP Ledger classic address. They begin with r.","bad");return;}
    var q="account="+a+(from.value?"&from="+from.value:"")+(to.value?"&to="+to.value:"");
    go.disabled=true; out.hidden=true; say(status,"Reading payments from the ledger…","busy");
    fetch("/api/delivered?format=json&"+q)
      .then(function(r){return r.json().then(function(b){return {ok:r.ok,b:b};});})
      .then(function(x){
        if(!x.ok){say(status,x.b.error||"That could not be read.","bad");return;}
        say(status,"");
        var b=x.b, s=b.summary, rows=b.rows||[];
        var html='<h2>'+esc(s.payments)+' payment'+(s.payments===1?"":"s")+'</h2>'+
          '<p>Partial payments: <strong>'+esc(s.partial_payments)+'</strong> · delivered less than stated: <strong class="'+(s.delivered_less_than_stated?"t-nogo":"")+'">'+esc(s.delivered_less_than_stated)+'</strong>'+
          (s.delivered_unavailable?' · delivered amount not recorded: '+esc(s.delivered_unavailable):'')+'</p>'+
          '<p class="tool-note">'+(b.complete?"Complete: covers ":"<strong>Not complete</strong>: covers ")+esc(STOP[b.stopped_because]||b.stopped_because)+
          (b.oldest_ledger_reached?" (oldest ledger read "+esc(b.oldest_ledger_reached)+")":"")+(b.complete?".":". Narrow the dates to read further back.")+'</p>'+
          '<p><a class="btn" href="/api/delivered?'+esc(q)+'" download>Download CSV</a></p>';
        if(rows.length){
          html+='<div class="tool-scroll"><table class="tool-table"><thead><tr><th>Date (UTC)</th><th>Dir</th><th>Currency</th><th>Stated</th><th>Delivered</th><th>Partial</th><th>Tx</th></tr></thead><tbody>';
          rows.slice(0,50).forEach(function(r){
            var short=r.delivered_less_than_stated==="yes";
            html+='<tr><td>'+esc(r.date_utc.replace("T"," ").replace("Z",""))+'</td><td>'+esc(r.direction)+'</td><td translate="no">'+esc(r.currency)+'</td>'+
              '<td class="mono">'+esc(r.amount_stated)+'</td><td class="mono'+(short?" flag":"")+'">'+esc(r.amount_delivered)+'</td>'+
              '<td>'+esc(r.partial_payment)+'</td><td class="mono" translate="no">'+esc(r.tx_hash.slice(0,10))+'…</td></tr>';
          });
          html+='</tbody></table></div>'+(rows.length>50?'<p class="tool-note">First 50 shown. The CSV has all '+esc(rows.length)+'.</p>':'');
        }
        out.innerHTML='<div class="tool-out">'+html+'</div>'; out.hidden=false;
      })
      .catch(function(){say(status,"Could not reach the server. Try again shortly.","bad");})
      .finally(function(){go.disabled=false;});
  });
})();
</script>`;

  await write("delivered/index.html", renderPage({
    title: "Delivered-amount export — what each XRPL payment actually delivered",
    description: "Free CSV of an XRP Ledger account's payments with stated and delivered amounts side by side and partial payments flagged. Exact decimals, read from validated ledger state. Not tax advice.",
    path: "/delivered/",
    head: TOOL_CSS,
    body,
    structured: [breadcrumb("Delivered-amount export", "/delivered/")],
    scripts: script,
  }));
}

/* ── /xapp/ ───────────────────────────────────────────────────────── */
/*
 * The screening page Xaman opens as an xApp (and that works in any phone
 * browser). Before sending to an address: is it sanctioned, reported as a
 * scam, activated, and, if it issues tokens, what can it do to holders.
 * It never asks to sign anything and reads no account of the user's.
 */
async function buildXapp(write) {
  const body = `<div class="page-head">
  <p class="eyebrow">Before you send</p>
  <h1>Check the address first.</h1>
  <p>Paste the address you are about to send to. NOSHASHI checks it against the US Treasury
     sanctions list and the scam registry, and reads it from the ledger. Nothing is signed and
     nothing about your own account is read.</p>
</div>
<section>
  <form class="tool-form" id="xa-form" novalidate>
    <div class="form-field"><label for="xa-address">Destination address</label>
      <input id="xa-address" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="r…" maxlength="40" required></div>
    <button class="btn" type="submit" id="xa-go">Check</button>
    <p class="form-status" id="xa-status" role="status" aria-live="polite"></p>
  </form>
  <div id="xa-out" hidden></div>
  <p class="tool-note">A clear result means nothing was found in these sources at this moment. It
     does not mean the recipient is trustworthy. Lookalike addresses copy the first and last few
     characters of one you know. Compare the whole address, every time.</p>
</section>`;

  const script = `<script>
(function(){${COMMON_JS}
  var F="${FUNCTIONS}";
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
</script>`;

  await write("xapp/index.html", renderPage({
    title: "Check an address before you send — XRPL sanctions and scam check",
    description: "Free: before sending XRP or tokens, check the destination against the OFAC sanctions list and the scam registry, and read it from the XRP Ledger. Nothing is signed.",
    path: "/xapp/",
    head: TOOL_CSS,
    body,
    structured: [breadcrumb("Check an address", "/xapp/")],
    scripts: script,
  }));
}

export async function buildTools(write) {
  await buildBadge(write);
  await buildAlerts(write);
  await buildDelivered(write);
  await buildXapp(write);
}

export const TOOL_PAGES = [
  ["/badge/", "monthly", "0.8"],
  ["/alerts/", "monthly", "0.8"],
  ["/delivered/", "monthly", "0.8"],
  ["/xapp/", "monthly", "0.6"],
];
