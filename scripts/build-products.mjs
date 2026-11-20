/*
 * The pages for three products added on 2026-11-18:
 *
 *   /verified/            Verified Issuer: the live badge, free, and the
 *                         $49/month subscription (a report every month).
 *   /verified/subscribed/ Where Stripe returns a new subscriber.
 *   /listing-review/      The $750 Listing review, for exchanges and
 *                         launchpads deciding whether to list a token.
 *   /history/             The free issuer history reader, and the $250
 *                         Issuer history report.
 *   /watch/               Issuer Watch, $19 a month: an email the moment a
 *                         token's issuer changes a power (added 2026-11-19).
 *   /watch/subscribed/    Where Stripe returns a new watcher.
 *   /continuity/          Continuity: one issued-token deposit checked against
 *                         its posted credits. Built from the operator copy in
 *                         tools/continuity/ so the two never drift.
 *   /presign-guard/       Pre-Sign Guard: the Fireblocks Co-signer Callback
 *                         Handler in tools/presign-guard/ (added 2026-11-19).
 *
 * Every figure the pages show is read live by the visitor's browser from
 * NOSHASHI's public endpoints (/api/badge, /api/issuer-history); nothing
 * on them is sample data. Prices come from api/_lib/evidence-tiers.js,
 * the same table the checkout charges from.
 */

import { readFile } from "node:fs/promises";
import { renderPage, breadcrumb, ORIGIN } from "../api/_lib/shell.js";
import { EVIDENCE_TIERS } from "../api/_lib/evidence-tiers.js";

const usd = (cents) => `$${(cents / 100).toLocaleString("en-US")}`;
const VERIFIED = usd(EVIDENCE_TIERS.verified.cents);
const LISTING = usd(EVIDENCE_TIERS.listing.cents);
const HISTORY = usd(EVIDENCE_TIERS.history.cents);

/** Issuer Watch, $19 a month; the checkout charges WATCH_MONTHLY_CENTS in api/create-checkout-session.js. */
const WATCH = "$19";

export const PRODUCT_SALES_PAGES = [
  ["/watch/", "weekly", "0.8"],
  ["/verified/", "weekly", "0.8"],
  ["/listing-review/", "monthly", "0.7"],
  ["/history/", "weekly", "0.7"],
  ["/continuity/", "monthly", "0.6"],
  ["/presign-guard/", "monthly", "0.6"],
];

const CSS = `<style>
.pv-form{display:grid;gap:14px;max-width:640px}
.pv-form textarea{min-height:56px;font:12px "IBM Plex Mono",monospace}
.pv-note{color:var(--muted);font-size:12.5px;line-height:1.6;max-width:72ch}
.pv-actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.pv-price{font:600 30px/1.1 "Space Grotesk",sans-serif;margin:6px 0 4px}
.pv-badge{min-height:40px;margin:12px 0}
.pv-badge img{max-width:100%;height:auto}
.pv-code{display:block;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.55 "IBM Plex Mono",monospace;
  border:1px solid var(--rule);border-radius:var(--r);padding:12px 14px;margin:8px 0}
.pv-table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}
.pv-table th,.pv-table td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--rule);vertical-align:top}
.pv-table td.mono{font-family:"IBM Plex Mono",monospace;white-space:nowrap}
.pv-tally{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:14px 0}
.pv-tally div{border:1px solid var(--rule);border-radius:var(--r);padding:12px 14px}
.pv-tally strong{display:block;font:600 24px/1.1 "Space Grotesk",sans-serif}
[data-sev="power_used"]{color:var(--bad,#e5484d)}
[data-sev="key_change"]{color:var(--warn,#f5a524)}
</style>`;

const COMMON = `
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}
  function items(v){return String(v||"").split(/[\\s,]+/).map(function(s){return s.trim();}).filter(Boolean);}
  var ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
`;

/* ── /verified/ ─────────────────────────────────────────────────── */
async function buildVerified(write) {
  const body = `<div class="page-head">
  <p class="eyebrow">For token projects · badge free · Verified ${VERIFIED}/month</p>
  <h1>Show your holders what your issuer can't do.</h1>
  <p>Your holders want to know whether you can freeze their tokens, take them back, or decide who may hold.
     The ledger already answers that. The NOSHASHI badge reads it live and shows it on your own site,
     with the ledger it was read at, so holders don't have to take your word for it.</p>
</div>
<section>
  <h2>1. Get your badge (free)</h2>
  <form class="pv-form" id="pv-badge-form" novalidate>
    <div class="form-field"><label for="pv-issuer">Your token's issuing account</label>
      <input id="pv-issuer" name="issuer" type="text" spellcheck="false" autocomplete="off" placeholder="r…" maxlength="35"></div>
    <div class="pv-actions"><button class="btn" type="submit">Show my badge</button></div>
    <p class="form-status" id="pv-badge-status" role="status" aria-live="polite"></p>
  </form>
  <div id="pv-badge-out" hidden>
    <div class="pv-badge" id="pv-badge-img"></div>
    <p class="pv-note">Paste this where you want it to appear. The image re-reads the ledger every five minutes, and clicking it opens the full certificate.</p>
    <code class="pv-code" id="pv-badge-html"></code>
    <p class="pv-note">Markdown, for a README or a forum post:</p>
    <code class="pv-code" id="pv-badge-md"></code>
  </div>

  <h2 style="margin-top:36px">2. Verified Issuer</h2>
  <div class="grid g2">
    <div class="panel"><p class="num">VERIFIED ISSUER</p>
      <p class="pv-price">${VERIFIED}<span style="font-size:14px;font-weight:500"> / month</span></p>
      <p>For one token. Cancel any time.</p>
      <ul class="pv-note" style="padding-left:18px">
        <li>A report every month, emailed to you, read from the XRP Ledger: your issuer's controls, up to three team or treasury wallets and your order book, with a fingerprint anyone can check.</li>
        <li>Something to show holders, exchanges and partners that is new each month, not a screenshot from launch day.</li>
        <li>Keep the free badge on your site; the monthly report is the record behind it.</li>
      </ul>
    </div>
    <div class="panel"><p class="num">WHAT IT IS NOT</p>
      <p>It is not an endorsement, an audit or a rating, and NOSHASHI does not vouch for your project. Every
         report states ledger facts at a ledger number, including the ones you might rather it didn't. A
         power you have kept is reported as kept.</p>
      <p>NOSHASHI never asks for keys, seeds or access to your accounts: everything is public ledger state.</p>
    </div>
  </div>

  <form class="pv-form" id="pv-sub-form" novalidate style="margin-top:20px">
    <div class="form-field"><label for="pv-sub-issuer">Issuing account</label>
      <input id="pv-sub-issuer" name="issuer" type="text" spellcheck="false" autocomplete="off" placeholder="r…" maxlength="35"></div>
    <div class="form-field"><label for="pv-sub-currency">Currency code (optional, adds your order book)</label>
      <input id="pv-sub-currency" name="currency" type="text" spellcheck="false" autocomplete="off" placeholder="SOLO" maxlength="40"></div>
    <div class="form-field"><label for="pv-sub-wallets">Team or treasury wallets (optional, up to 3)</label>
      <textarea id="pv-sub-wallets" name="wallets" spellcheck="false" placeholder="r…, one per line"></textarea></div>
    <div class="form-field"><label for="pv-sub-org">Project name</label>
      <input id="pv-sub-org" name="organization" type="text" maxlength="120" placeholder="As it should appear on the report"></div>
    <div class="pv-actions"><button class="btn" type="submit" id="pv-sub-pay">Subscribe for ${VERIFIED} a month</button></div>
    <p class="form-status" id="pv-sub-status" role="status" aria-live="polite"></p>
    <p class="pv-note">The first report is emailed to the address you pay with, usually within minutes. Subject to the
       <a href="/legal/report-terms/">Terms of Sale</a>. Questions: <a href="mailto:support@noshashi.app">support@noshashi.app</a>.</p>
  </form>
</section>`;

  const script = `<script>
(function(){${COMMON}
  var bf=document.getElementById("pv-badge-form"), bs=document.getElementById("pv-badge-status"), out=document.getElementById("pv-badge-out");
  bf.addEventListener("submit",function(e){
    e.preventDefault();
    var a=bf.issuer.value.trim();
    if(!ADDRESS.test(a)){say(bs,"Enter an XRP Ledger address. It begins with r.","bad");return;}
    var src="${ORIGIN}/api/badge?issuer="+encodeURIComponent(a)+"&style=card";
    var link="${ORIGIN}/certificate/?issuer="+encodeURIComponent(a);
    var html='<a href="'+link+'"><img src="'+src+'" alt="Issuer facts by NOSHASHI, read live from the XRP Ledger" width="360"></a>';
    document.getElementById("pv-badge-img").innerHTML=html;
    document.getElementById("pv-badge-html").textContent=html;
    document.getElementById("pv-badge-md").textContent="[![Issuer facts by NOSHASHI]("+src+")]("+link+")";
    document.getElementById("pv-sub-issuer").value=a;
    out.hidden=false; say(bs,"Read live from the ledger. It can take a few seconds to load.","");
  });
  var sf=document.getElementById("pv-sub-form"), ss=document.getElementById("pv-sub-status"), pay=document.getElementById("pv-sub-pay");
  sf.addEventListener("submit",function(e){
    e.preventDefault();
    var issuer=sf.issuer.value.trim(), wallets=items(sf.wallets.value);
    if(!ADDRESS.test(issuer)){say(ss,"Enter your token's issuing account. It begins with r.","bad");return;}
    if(wallets.length>3){say(ss,"Up to three team or treasury wallets.","bad");return;}
    pay.disabled=true; say(ss,"Opening secure checkout…","");
    fetch("/api/create-checkout-session",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({product:"verified-issuer",issuer:issuer,currency:sf.currency.value.trim(),wallets:wallets.join(","),organization:sf.organization.value.trim()})})
      .then(function(r){return r.json().then(function(b){if(!r.ok||!b.url)throw new Error(b.error||"Checkout could not start.");return b;});})
      .then(function(b){location.href=b.url;})
      .catch(function(err){pay.disabled=false;say(ss,err.message+" You can also email support@noshashi.app.","bad");});
  });
})();
</script>`;

  await write("verified/index.html", renderPage({
    title: `Verified Issuer — show holders what your XRPL issuer can't do (badge free, ${VERIFIED}/month)`,
    description: `A free live badge for your token's site showing what your XRP Ledger issuer can and cannot do, read from the ledger. Verified Issuer, ${VERIFIED} a month: a fresh ledger report every month.`,
    path: "/verified/",
    head: CSS,
    body,
    scripts: script,
    structured: [breadcrumb("Verified Issuer", "/verified/")],
  }));

  await write("verified/subscribed/index.html", renderPage({
    title: "You're subscribed — Verified Issuer",
    description: "Your Verified Issuer subscription is active. Your first report is on its way.",
    path: "/verified/subscribed/",
    head: `<meta name="robots" content="noindex">`,
    body: `<div class="page-head"><p class="eyebrow">Verified Issuer</p><h1>You're subscribed.</h1>
  <p>Your first report is being read from the XRP Ledger now and will arrive at the email you paid with, usually within
     minutes. A new one follows every month while the subscription is active.</p></div>
<section><p>Add the badge to your site from <a href="/verified/">the Verified page</a> if you haven't yet. To change or cancel,
  use the link in your Stripe receipt or email <a href="mailto:support@noshashi.app">support@noshashi.app</a>.</p></section>`,
  }));
}

/* ── /listing-review/ ───────────────────────────────────────────── */
async function buildListing(write) {
  const body = `<div class="page-head">
  <p class="eyebrow">For exchanges and launchpads · ${LISTING} per token</p>
  <h1>Listing review: what a token's issuer can do, and what it has done.</h1>
  <p>Before you list a token on the XRP Ledger, your listing team has to answer the same questions every time.
     Can the issuer freeze your users' balances? Claw them back? Has it ever? Who controls the team wallets?
     How much of the order book can actually fill? The Listing review answers each one from the ledger, in one
     document your team can file.</p>
</div>
<section>
  <div class="grid g2">
    <div class="panel"><p class="num">ISSUER CONTROLS</p>
      <p>Freeze, global freeze, clawback, approval to hold, transfer fee, and how many keys it takes to act for the issuer.</p></div>
    <div class="panel"><p class="num">WHAT THE ISSUER HAS DONE</p>
      <p>Every freeze, unfreeze, clawback, key change, signer-list change and change of powers the issuer has made, with dates and ledger numbers. If the history is too long to read in full, the report says so.</p></div>
    <div class="panel"><p class="num">TEAM AND TREASURY WALLETS</p>
      <p>Up to three wallets: what each holds, what is free to move, and how many keys it takes to move it.</p></div>
    <div class="panel"><p class="num">REAL DEPTH</p>
      <p>Advertised against funded depth on the token's XRP order book, within 10% of the market price. AMM pools are shown separately.</p></div>
  </div>
  <div class="panel" style="margin-top:14px"><p class="num">FORMAT</p>
    <p>A PDF and a print copy, emailed within minutes of payment, with the raw ledger replies it was built from and a SHA-256
       fingerprint anyone can check at <a href="/evidence-report/verify/">noshashi.app/evidence-report/verify</a>. A record of
       ledger facts at a stated ledger, not a listing recommendation, an audit opinion or legal advice.</p></div>
  <div class="pv-actions" style="margin-top:20px">
    <a class="btn" href="/evidence-report/?tier=listing#order">Order a Listing review (${LISTING})</a>
    <a class="btn btn-quiet" href="/history/">See an issuer's history free</a>
  </div>
  <p class="pv-note" style="margin-top:14px">Reviewing several tokens a month? Volume pricing and invoicing are agreed in writing:
     <a href="/contact/?topic=institutions">get in touch</a>.</p>
</section>`;

  await write("listing-review/index.html", renderPage({
    title: `Listing review — XRPL token due diligence for exchanges and launchpads (${LISTING})`,
    description: `One document per token, read from the XRP Ledger: issuer controls and their full history, team wallets and who can move them, and real order-book depth. ${LISTING}, emailed in minutes.`,
    path: "/listing-review/",
    head: CSS.replace("</style>", ".btn-quiet{background:transparent;color:var(--ink);border:1px solid var(--rule)}</style>"),
    body,
    structured: [breadcrumb("Listing review", "/listing-review/")],
  }));
}

/* ── /history/ ──────────────────────────────────────────────────── */
async function buildHistory(write) {
  const body = `<div class="page-head">
  <p class="eyebrow">Free · no account</p>
  <h1>What has this issuer done with its powers?</h1>
  <p>The certificate tells you what an XRP Ledger issuer can do today. This tells you what it has done: every time it
     froze or unfroze a holder, took tokens back, changed its keys or signers, or changed its own powers.
     Read live from validated ledgers.</p>
</div>
<section>
  <form class="pv-form" id="hi-form" novalidate>
    <div class="form-field"><label for="hi-issuer">Issuing account</label>
      <input id="hi-issuer" name="issuer" type="text" spellcheck="false" autocomplete="off" placeholder="r…" maxlength="35"></div>
    <div class="pv-actions"><button class="btn" type="submit" id="hi-run">Read the history</button></div>
    <p class="form-status" id="hi-status" role="status" aria-live="polite"></p>
  </form>
  <div id="hi-out" hidden></div>
  <div class="panel" style="margin-top:28px"><p class="num">NEED IT ON FILE?</p>
    <p>The <a href="/evidence-report/?tier=history#order">Issuer history report</a> (${HISTORY}) puts this history and the
       issuer's current controls in a PDF with the raw ledger replies and a fingerprint anyone can check. Exchanges and
       launchpads usually want the <a href="/listing-review/">Listing review</a> (${LISTING}), which adds team wallets and
       order-book depth.</p></div>
  <p class="pv-note" style="margin-top:14px">Only transactions the issuer itself sent and that succeeded are listed. An account
     with a long history is read from its first 200 and last 800 transactions, and the page says when anything in between was
     not read. Developers: <code>${ORIGIN}/api/issuer-history?issuer=r…</code> returns the same reading as JSON.</p>
</section>`;

  const script = `<script>
(function(){${COMMON}
  var f=document.getElementById("hi-form"), st=document.getElementById("hi-status"), out=document.getElementById("hi-out"), run=document.getElementById("hi-run");
  function render(h){
    var t=h.tally||{}, ev=h.events||[];
    var html='<div class="pv-tally">'+
      '<div><strong>'+(t.freezes||0)+'</strong>holders frozen</div>'+
      '<div><strong>'+(t.clawbacks||0)+'</strong>clawbacks</div>'+
      '<div><strong>'+(t.key_changes||0)+'</strong>key or signer changes</div>'+
      '<div><strong>'+(t.power_changes||0)+'</strong>changes to its powers</div></div>';
    if(!ev.length){html+='<p>No authority change by this issuer was found in the transactions read.</p>';}
    else{
      html+='<table class="pv-table"><thead><tr><th>Date (UTC)</th><th>What happened</th><th>Ledger</th></tr></thead><tbody>';
      ev.slice().reverse().forEach(function(e){
        html+='<tr><td class="mono">'+esc(String(e.date||"").slice(0,10))+'</td><td data-sev="'+esc(e.severity)+'">'+esc(e.summary)+
          '</td><td class="mono"><a href="https://livenet.xrpl.org/transactions/'+encodeURIComponent(e.hash||"")+'">'+esc(e.ledger_index)+'</a></td></tr>';
      });
      html+='</tbody></table>';
    }
    html+='<p class="pv-note" style="margin-top:12px">'+esc((h.coverage&&h.coverage.note)||"")+' Read '+esc(h.read_at||"")+'.</p>';
    out.innerHTML=html; out.hidden=false;
  }
  function go(a){
    run.disabled=true; out.hidden=true; say(st,"Reading the ledger… a long history can take ten seconds.","");
    fetch("/api/issuer-history?issuer="+encodeURIComponent(a),{headers:{Accept:"application/json"}})
      .then(function(r){return r.json().then(function(b){if(!r.ok)throw new Error(b.error||"The ledger could not be read.");return b;});})
      .then(function(h){render(h);say(st,"","");try{history.replaceState(null,"","?issuer="+encodeURIComponent(a));}catch(e){}})
      .catch(function(err){say(st,err.message,"bad");})
      .then(function(){run.disabled=false;});
  }
  f.addEventListener("submit",function(e){e.preventDefault();var a=f.issuer.value.trim();
    if(!ADDRESS.test(a)){say(st,"Enter an XRP Ledger address. It begins with r.","bad");return;} go(a);});
  try{var q=new URLSearchParams(location.search).get("issuer");if(q&&ADDRESS.test(q)){f.issuer.value=q;go(q);}}catch(e){}
})();
</script>`;

  await write("history/index.html", renderPage({
    title: "Issuer history — every freeze, clawback and key change an XRPL issuer has made",
    description: "Free: see what an XRP Ledger token issuer has done with its powers. Every freeze, unfreeze, clawback, key change and signer change, read live from validated ledgers.",
    path: "/history/",
    head: CSS,
    body,
    scripts: script,
    structured: [breadcrumb("Issuer history", "/history/")],
  }));
}

/* ── /watch/ ────────────────────────────────────────────────────── */
async function buildWatch(write) {
  const body = `<div class="page-head">
  <p class="eyebrow">Issuer Watch · ${WATCH} a month per token</p>
  <h1>Know the moment a token's issuer changes the rules.</h1>
  <p>An XRP Ledger issuer can switch on a freeze, enable clawback, start requiring approval to hold, hand its keys to someone
     else or raise its transfer fee, at any time and without telling anyone. Issuer Watch checks the issuer every five minutes
     and emails you as soon as one of those changes lands on the ledger.</p>
</div>
<section>
  <div class="grid g2">
    <div class="panel"><p class="num">WHAT YOU ARE TOLD ABOUT</p>
      <ul class="pv-note" style="padding-left:18px">
        <li>A freeze on every holder (global freeze) switched on or off</li>
        <li>Clawback enabled: the issuer can take tokens back</li>
        <li>Approval now required to hold the token</li>
        <li>A new key, a removed key or a new signer list</li>
        <li>A changed transfer fee</li>
        <li>Freeze given up for good, or the issuer's domain changed</li>
      </ul></div>
    <div class="panel"><p class="num">HOW IT WORKS</p>
      <p>Pay ${WATCH} a month by card. The issuer is read from validated ledgers every five minutes. When a power changes you
         get one email saying what changed, at which ledger, with a link to the full reading. A reading that fails is retried,
         never reported as a change.</p>
      <p class="pv-note">Read-only: NOSHASHI never asks for keys or access. Facts from the ledger, not advice. Cancel any time.</p></div>
  </div>

  <form class="pv-form" id="pw-form" novalidate style="margin-top:20px">
    <div class="form-field"><label for="pw-issuer">The token's issuing account</label>
      <input id="pw-issuer" name="issuer" type="text" spellcheck="false" autocomplete="off" placeholder="r…" maxlength="35"></div>
    <div class="form-field"><label for="pw-label">A name for it (optional, shown in your emails)</label>
      <input id="pw-label" name="label" type="text" maxlength="60" placeholder="SOLO"></div>
    <div class="pv-actions"><button class="btn" type="submit" id="pw-pay">Watch it for ${WATCH} a month</button>
      <a class="btn ghost" id="pw-check" href="/certificate/">See its powers now, free</a></div>
    <p class="form-status" id="pw-status" role="status" aria-live="polite"></p>
    <p class="pv-note">Alerts go to the email address you pay with. One token per subscription; subscribe again to watch another.
       Prefer Discord or Telegram? Free alerts for up to three tokens are on <a href="/alerts/">the alerts page</a>.
       Questions: <a href="mailto:support@noshashi.app">support@noshashi.app</a>.</p>
  </form>
</section>`;

  const script = `<script>
(function(){${COMMON}
  var f=document.getElementById("pw-form"), st=document.getElementById("pw-status"), pay=document.getElementById("pw-pay"), check=document.getElementById("pw-check");
  f.issuer.addEventListener("input",function(){var a=f.issuer.value.trim();check.href="/certificate/"+(ADDRESS.test(a)?"?issuer="+encodeURIComponent(a):"");});
  f.addEventListener("submit",function(e){
    e.preventDefault();
    var issuer=f.issuer.value.trim();
    if(!ADDRESS.test(issuer)){say(st,"Enter the token's issuing account. It begins with r.","bad");return;}
    pay.disabled=true; say(st,"Opening secure checkout…","");
    fetch("/api/create-checkout-session",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({product:"issuer-watch",issuer:issuer,label:f.label.value.trim()})})
      .then(function(r){return r.json().then(function(b){if(!r.ok||!b.url)throw new Error(b.error||"Checkout could not start.");return b;});})
      .then(function(b){location.href=b.url;})
      .catch(function(err){pay.disabled=false;say(st,err.message+" You can also email support@noshashi.app.","bad");});
  });
  try{var q=new URLSearchParams(location.search).get("issuer");if(q&&ADDRESS.test(q)){f.issuer.value=q;check.href="/certificate/?issuer="+encodeURIComponent(q);}}catch(e){}
})();
</script>`;

  await write("watch/index.html", renderPage({
    title: `Issuer Watch — an email when an XRPL issuer changes its powers (${WATCH}/month)`,
    description: `Get an email the moment an XRP Ledger token's issuer switches on a freeze, enables clawback, requires approval, changes its keys or its fee. Checked every five minutes. ${WATCH} a month.`,
    path: "/watch/",
    head: CSS,
    body,
    scripts: script,
    structured: [breadcrumb("Issuer Watch", "/watch/")],
  }));

  await write("watch/subscribed/index.html", renderPage({
    title: "You're watching — Issuer Watch",
    description: "Your Issuer Watch subscription is active.",
    path: "/watch/subscribed/",
    head: `<meta name="robots" content="noindex">`,
    body: `<div class="page-head"><p class="eyebrow">Issuer Watch</p><h1>You're watching.</h1>
  <p>The issuer is checked every five minutes from now on. You'll get an email at the address you paid with the moment one of its
     powers changes. No email means nothing has changed.</p></div>
<section><p>See the issuer's powers right now on <a href="/certificate/">the certificate page</a>. To cancel, reply to any
  alert or email <a href="mailto:support@noshashi.app">support@noshashi.app</a>.</p></section>`,
  }));
}

/* ── /continuity/ ───────────────────────────────────────────────── */
const CONTINUITY_DIR = new URL("../tools/continuity/", import.meta.url);

/** The markup between the BODY markers of the operator copy, shared with this page. */
export async function continuityBody() {
  const html = await readFile(new URL("continuity.html", CONTINUITY_DIR), "utf8");
  const m = html.match(/<!--BODY-->([\s\S]*?)<!--\/BODY-->/);
  if (!m) throw new Error("tools/continuity/continuity.html has no BODY markers");
  return m[1].trim();
}

async function buildContinuity(write) {
  const script = await readFile(new URL("continuity.js", CONTINUITY_DIR), "utf8");
  await write("assets/continuity.js", script);
  const css = `<style>
.ct textarea,.ct input[type=text],.ct pre{box-sizing:border-box;width:100%;padding:12px 14px;border:1px solid var(--rule);
  border-radius:var(--r);background:var(--panel,transparent);color:var(--ink);font:12px/1.55 "IBM Plex Mono",monospace}
.ct pre{white-space:pre-wrap;overflow:auto;min-height:120px}
.ct label{display:block;margin:14px 0 6px;font:12px "IBM Plex Mono",monospace;color:var(--muted)}
.ct p label{display:inline;margin:0}
.ct button{margin:4px 8px 4px 0}
.ct-note{color:var(--muted);font-size:13px;line-height:1.6;max-width:72ch}
</style>`;
  const body = (await continuityBody())
    .replace(/<h1>/, `<div class="page-head"><p class="eyebrow">Ledger Desk · Continuity</p><h1>`)
    .replace(/<\/h1>/, "</h1></div><section class=\"ct\">")
    .replace(/<button /g, '<button class="btn ghost" ')
    .replace(/<button class="btn ghost" id="verify"/, '<button class="btn" id="verify"');
  await write("continuity/index.html", renderPage({
    title: "Continuity — check an XRPL deposit was credited exactly once",
    description: "Check one issued-token deposit on the XRP Ledger against the credits your system posted for it: right token, right amount, exactly one credit. Read from two Mainnet servers; your records stay on your device.",
    path: "/continuity/",
    head: css,
    body: `${body}
<p class="ct-note">Run it next to your own accounting database with
  <a href="https://github.com/Ignosha/noshashi/tree/main/tools/continuity">tools/continuity</a>
  (Python 3, standard library only, read-only, loopback only).</p>
</section>`,
    scripts: `<script src="/assets/continuity.js"></script>`,
    structured: [breadcrumb("Continuity", "/continuity/")],
  }));
}

/* ── /presign-guard/ ────────────────────────────────────────────── */
/*
 * The page for tools/presign-guard/, the Fireblocks API Co-signer Callback
 * Handler. It describes what the code does and nothing it has not done:
 * no prices, no pilots, no customers. Everything on it is checked in
 * tests/presign-guard.test.js against Fireblocks' published examples and
 * captured XRP Ledger replies.
 */
async function buildPresignGuard(write) {
  const SRC = "https://github.com/Ignosha/noshashi/tree/main/tools/presign-guard";
  const body = `<div class="page-head">
  <p class="eyebrow">Pre-Sign Guard · for institutions signing on the XRP Ledger</p>
  <h1>Check every XRPL transaction before it is signed.</h1>
  <p>Pre-Sign Guard runs on your servers and answers APPROVE, REJECT or RETRY before a signature. On Fireblocks it is a
     Callback Handler the API Co-signer asks before it signs. On anything else (your own HSM or wallet service, a custodian
     without an approval hook, a script) you ask it yourself, just before signing. NOSHASHI never sees a request, a key or a
     decision, and the guard itself cannot sign anything.</p>
</div>
<section>
  <table class="pv-table">
    <thead><tr><th>Before a signature it checks</th><th>And refuses</th></tr></thead>
    <tbody>
      <tr><td>That the bytes being signed are the transaction Fireblocks shows: the signing hash is recomputed, and the destination, tag and amount compared</td>
          <td>A transaction whose destination, tag or amount was swapped</td></tr>
      <tr><td>Who controls the account afterwards</td>
          <td>A new regular key, a new signer list, account deletion or disabling the master key, unless your policy allows it</td></tr>
      <tr><td>The destination</td>
          <td>OFAC-listed and reported addresses up to three funding hops back, lookalikes of your known destinations, a missing required tag</td></tr>
      <tr><td>Every token amount, by issuer address</td>
          <td>A ticker from an issuer you don't accept (a counterfeit RLUSD), or a token whose issuer has frozen it</td></tr>
      <tr><td>The ledger's own answer: the transaction is simulated on two servers run by different operators</td>
          <td>Anything the ledger would refuse, before the fee is spent</td></tr>
    </tbody>
  </table>
  <p class="pv-note" style="margin-top:14px">A fact it cannot read (a server, the sanctions list, an issuer) is answered RETRY, never a pass.
     Every answer gets a SHA-256 receipt in an audit log where each line's hash covers the one before.</p>

  <div class="grid g2" style="margin-top:20px">
    <div class="panel"><p class="num">ALONGSIDE WHAT YOU RUN</p>
      <p>Keep Fireblocks Policy for who may move what, and your KYT or AML provider for risk scores. Pre-Sign Guard adds the
         XRP Ledger checks those don't make: the signed bytes, key changes, issuers by address, freeze state and the
         ledger's own verdict.</p></div>
    <div class="panel"><p class="num">ROLL IT OUT SAFELY</p>
      <p>Start in observe mode: it approves everything and logs what it would have refused. Read a week of decisions, tune the
         policy, then switch to enforce. Ask Fireblocks Support to enable <code>rawTx</code> so plain XRP transfers carry
         their exact bytes.</p></div>
  </div>

  <h2 style="margin-top:32px">Not on Fireblocks? Ask before you sign.</h2>
  <p>Send the unsigned transaction to the guard's <code>/v1/check</code> endpoint and sign only on <code>APPROVE</code>. It runs the
     same checks and returns the findings, the validated ledger it read and a SHA-256 receipt, and logs the decision.</p>
  <code class="pv-code">curl -s https://guard.internal:8443/v1/check \\
  -H "Authorization: Bearer $GUARD_TOKEN" -H "content-type: application/json" \\
  -d '{"tx_json": { …the unsigned transaction… }, "requestId": "withdrawal-1234"}'</code>
  <p class="pv-note">Or from a terminal: <code>node --experimental-strip-types tools/presign-guard/check.ts policy.json tx.json</code>.
     The endpoint is off until you enable it, and beyond your own machine it needs a bearer token.</p>
  <table class="pv-table">
    <thead><tr><th>Checked live, 19 November 2026 (ledger 108,439,461)</th><th>Answer</th><th>What the ledger said</th></tr></thead>
    <tbody>
      <tr><td>1 XRP to Bitstamp, no destination tag</td><td class="mono">REJECT</td>
          <td><code>tecDST_TAG_NEEDED</code> on s1.ripple.com and xrplcluster.com</td></tr>
      <tr><td>The same payment with its tag</td><td class="mono">APPROVE</td>
          <td><code>tesSUCCESS</code> on both, with a note that the 12-drop fee was below the network's 5,041 drops at that moment</td></tr>
    </tbody>
  </table>

  <p style="margin-top:20px"><a class="btn" href="${SRC}">Read the code and setup guide</a>
     <a class="btn ghost" href="mailto:institutions@noshashi.app?subject=Pre-Sign%20Guard">Talk to us about deploying it</a></p>
  <p class="pv-note">Open source, Node 22 or later, no new dependencies. XRP Ledger transactions only; other assets get the answer
     your policy sets. It reads ledger facts at signing time and is not legal or compliance advice. Fireblocks is a trademark
     of its owner; NOSHASHI is not affiliated with or endorsed by Fireblocks.</p>
</section>`;

  await write("presign-guard/index.html", renderPage({
    title: "Pre-Sign Guard — XRPL checks before a transaction is signed",
    description: "Self-hosted, open-source checks before an XRP Ledger transaction is signed: a Fireblocks API Co-signer Callback Handler, or a /v1/check endpoint for any signing system. Refuses swapped destinations, key changes, counterfeit tokens and sanctioned destinations, and simulates each transaction on two servers.",
    path: "/presign-guard/",
    head: CSS,
    body,
    structured: [breadcrumb("Pre-Sign Guard", "/presign-guard/")],
  }));
}

export async function buildProducts(write) {
  await buildPresignGuard(write);
  await buildContinuity(write);
  for (const file of ["index.html", "review.css", "review.js", "desk.js", "browser.js"]) {
    const contents = await readFile(new URL("../src/continuity/" + file, import.meta.url), "utf8");
    await write("continuity-preview/" + file, contents);
  }
  await buildWatch(write);
  await buildVerified(write);
  await buildListing(write);
  await buildHistory(write);
}
