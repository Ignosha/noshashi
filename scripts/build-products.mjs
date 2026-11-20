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
 *   /products/            The catalogue of everything above (2026-11-20).
 *   /rippling/            The Rippling Exposure check and API (2026-11-20).
 *   /console/             The API Console: every API as a plain-language form.
 *
 * Every figure the pages show is read live by the visitor's browser from
 * NOSHASHI's public endpoints (/api/badge, /api/issuer-history); nothing
 * on them is sample data. Prices come from api/_lib/evidence-tiers.js,
 * the same table the checkout charges from.
 */

import { readFile } from "node:fs/promises";
import { renderPage, breadcrumb, ORIGIN } from "../api/_lib/shell.js";
import { EVIDENCE_TIERS } from "../api/_lib/evidence-tiers.js";
import { RIPPLING_PLANS } from "../api/_lib/rippling-keys.js";
import { writeContinuityPackage, CONTINUITY_ZIP } from "./package-continuity.mjs";
import { TUTORIALS, AUDIENCES } from "./tutorials/tutorials.mjs";

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
  ["/products/", "weekly", "0.9"],
  ["/rippling/", "weekly", "0.8"],
  ["/console/", "weekly", "0.9"],
  ["/tutorials/", "weekly", "0.8"],
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
.pv-scroll{overflow-x:auto;max-width:100%}
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

/** How Continuity works, shown above the rehearsal. Describes only what tools/continuity does. */
const CONTINUITY_SHOWCASE = `<section class="ct-show" aria-labelledby="ct-show-t">
  <h2 id="ct-show-t" class="sr-only">How Continuity works</h2>
  <ol class="ct-steps">
    <li><span class="num">01 / THE LEDGER</span><b>Read the deposit twice.</b>
      The transaction is fetched from two public Mainnet servers, s1 and s2.ripple.com, and their replies must match: validated,
      successful, and the same delivered amount, token and issuer.</li>
    <li><span class="num">02 / YOUR BOOKS</span><b>Read what you credited.</b>
      Posted credits come from your export or, with the open-source adapter, from a read-only SQLite view on your own
      machine, over loopback. They never leave the device.</li>
    <li><span class="num">03 / THE ANSWER</span><b>Exactly once, or why not.</b>
      Right token from the right issuer, the amount actually delivered, one credit. A short delivery, a token from another
      issuer, a duplicate credit or a missing one is named, and the evidence can be exported.</li>
  </ol>
  <p class="ct-note">Built for exchanges, payment firms and custodians crediting RLUSD, EUR or any issued token. XRP payments are refused with a reason.</p>
</section>`;

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
.ct-show{margin:8px 0 28px}
.ct-steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.ct-steps li{border:1px solid var(--rule);border-radius:var(--r);padding:14px 16px;font-size:13.5px;line-height:1.6;color:var(--muted)}
.ct-steps .num{display:block;font:11px "IBM Plex Mono",monospace;letter-spacing:.06em;margin-bottom:6px}
.ct-steps b{display:block;color:var(--ink);font:600 16px/1.3 "Space Grotesk",sans-serif;margin-bottom:4px}
.ct-dl{margin-top:40px;border-top:1px solid var(--rule);padding-top:28px}
.ct-dl .ct-steps{margin:18px 0}
.ct-sum{overflow-wrap:anywhere;font-size:11.5px}
</style>`;
  const pkg = await writeContinuityPackage();
  const kb = (pkg.size / 1024).toFixed(1);
  const download = `<section class="ct-dl" id="download">
  <h2>Run it on your own books</h2>
  <p>The rehearsal above checks the ledger side. To check real deposits against what your system actually posted, download
     Continuity and run it next to your accounting database. It reads your credits read-only, listens on 127.0.0.1 only,
     and sends nothing to NOSHASHI.</p>
  <p><a class="btn" href="/${CONTINUITY_ZIP}" download>Download Continuity (zip, ${kb} KB)</a>
     <a class="btn ghost" href="https://github.com/Ignosha/noshashi/tree/main/tools/continuity">Read the source</a></p>
  <ol class="ct-steps">
    <li><span class="num">01 / NEEDS</span><b>Python 3.8+ and a browser</b>macOS, Linux or Windows. Standard library only: nothing else to install, no account, no key.</li>
    <li><span class="num">02 / CONNECT</span><b>One view in your SQLite books</b><code>continuity_credits(tx_hash, amount, issuer, currency)</code>, one row per posted credit. <code>example-view.sql</code> in the zip shows how.</li>
    <li><span class="num">03 / RUN</span><b><code>./start.sh books.sqlite</code></b>Or <code>start.bat</code> on Windows. Open http://127.0.0.1:8765, paste a deposit hash, tick the adapter box, verify.</li>
  </ol>
  <p class="ct-note">SHA-256 <code class="ct-sum">${pkg.sha256}</code> (<a href="/${CONTINUITY_ZIP}.sha256">checksum file</a>).
     The zip is reproducible: <code>node scripts/package-continuity.mjs</code> in the public repository rebuilds the same bytes.
     MIT licence. Read-only; not legal, compliance, audit or accounting advice.
     Need it on Postgres or another database, or run for you? <a href="/contact/?topic=institutions">Talk to us</a>.</p>
</section>`;
  const body = (await continuityBody())
    .replace(/<h1>/, `<div class="page-head"><p class="eyebrow">Ledger Desk · Continuity</p><h1>`)
    // The intro paragraph joins the page head; the steps follow it, then the rehearsal.
    .replace(/<\/h1>\s*(<p>[\s\S]*?<\/p>)/, (_, intro) => `</h1>${intro}</div>${CONTINUITY_SHOWCASE}<section class="ct">`)
    .replace(/<button /g, '<button class="btn ghost" ')
    .replace(/<button class="btn ghost" id="verify"/, '<button class="btn" id="verify"');
  await write("continuity/index.html", renderPage({
    title: "Continuity — check an XRPL deposit was credited exactly once",
    description: "Check one issued-token deposit on the XRP Ledger against the credits your system posted for it: right token, right amount, exactly one credit. Read from two Mainnet servers; your records stay on your device.",
    path: "/continuity/",
    head: css,
    body: `${body}
</section>
${download}`,
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

/* ── /rippling/ ─────────────────────────────────────────────────── */
/*
 * The Rippling Exposure check: api/_lib/routes/rippling.js, served at
 * /api/v1/rippling. The page reads the visitor's own address live; the
 * research note quotes the sample read on 2026-11-20 as counts only, with
 * no account named.
 */
const money = (n) => (n ? `$${n.toLocaleString("en-US")} a month` : "Free");
const PLAN_ROWS = Object.values(RIPPLING_PLANS).map((p) => `
      <tr><td><b>${p.label}</b></td><td class="mono">${money(p.monthly_usd)}</td><td>${p.per_minute} a minute${p.per_day ? `, ${p.per_day} a day` : ", no daily cap"}</td>
        <td>${p.batch ? `Up to ${p.batch} accounts a call` : "—"}</td>
        <td>${p.issuer_holders ? `Up to ${p.issuer_holders.toLocaleString("en-US")} holders per issuer` : "—"}</td></tr>`).join("");

async function buildRippling(write) {
  const body = `<div class="page-head">
  <p class="eyebrow">Rippling Exposure API · free check · plans from $299 a month</p>
  <h1>Can someone swap your tokens without your signature?</h1>
  <p>On the XRP Ledger, an account that holds one currency on two trust lines (USD from two issuers, say) can have value moved
     from one line to the other by anyone's payment, at par, unless it has set NoRipple. Nothing is stolen outright: the account
     simply ends up holding a different issuer's token than the one it chose. This check reads every trust line at one validated
     ledger and tells you which currencies can be moved, how much, and the exact unsigned transactions that close it.</p>
</div>
<section>
  <form class="pv-form" id="rp-form" novalidate>
    <label for="rp-account">Public XRPL account address</label>
    <input id="rp-account" name="account" type="text" autocomplete="off" spellcheck="false" placeholder="r…" required>
    <div class="pv-actions"><button class="btn" id="rp-go" type="submit">Check rippling exposure</button>
      <span class="pv-note">A public address only. Never enter a secret, seed or recovery phrase.</span></div>
  </form>
  <p id="rp-status" role="status" class="pv-note" style="margin-top:12px">Enter an address to read it from the ledger.</p>
  <div id="rp-out" hidden>
    <div class="pv-tally">
      <div><span class="pv-note">Verdict</span><strong id="rp-verdict">—</strong></div>
      <div><span class="pv-note">Role</span><strong id="rp-role">—</strong></div>
      <div><span class="pv-note">Validated ledger</span><strong id="rp-ledger">—</strong></div>
      <div><span class="pv-note">Lines read</span><strong id="rp-lines">—</strong></div>
    </div>
    <p id="rp-summary"></p>
    <table class="pv-table"><thead><tr><th>Currency</th><th>Lines open to rippling</th><th>Held on them</th><th>Room to receive</th><th>Can move at par</th></tr></thead>
      <tbody id="rp-rows"></tbody></table>
    <ul id="rp-findings" class="pv-note" style="padding-left:18px"></ul>
    <h2 style="margin-top:24px">Unsigned fix templates</h2>
    <p class="pv-note">Review, then sign with your own wallet or signing service. NOSHASHI never signs or submits anything.</p>
    <code class="pv-code" id="rp-fixes">—</code>
    <p class="pv-note">SHA-256 receipt over the report: <code id="rp-digest">—</code></p>
  </div>

  <div class="grid g2" style="margin-top:32px">
    <div class="panel"><p class="num">WHO NEEDS IT</p>
      <p>Exchanges and custodians whose hot or cold wallets hold the same currency from several issuers; treasuries that
         hold stablecoins from more than one issuer; wallets that want to warn users before an unwanted swap; and issuers,
         whose own accounts must ripple (the check flags an issuer with DefaultRipple off, which stops holders paying each other).</p></div>
    <div class="panel"><p class="num">WHAT IT CHECKS</p>
      <p>NoRipple on this account's side of each line, the value held on each open line, and the room left under each line's
         limit, because rippling can only move value into a line that has room. Quality settings are returned with every line.
         Pages of up to 2,000 lines are read at the same ledger as the account itself.</p></div>
  </div>

  <h2 style="margin-top:32px">The API</h2>
  <code class="pv-code">curl -s "https://www.noshashi.app/api/v1/rippling?account=rYourAccount…"</code>
  <p class="pv-note">Returns <code>verdict</code> (EXPOSED, CLEAR, INCOMPLETE or UNRESOLVED), <code>exposures</code> per currency with
     <code>movable_at_par</code>, the lines at risk and whether quality settings change the rate, <code>findings</code> about
     DefaultRipple, unsigned <code>fixes</code>, the validated <code>ledger_index</code> and server, and a SHA-256 <code>receipt</code>.</p>

  <h3 style="margin-top:22px">Fleet scan (Starter and up)</h3>
  <p>Every wallet you run, in one call, with totals per currency across the fleet: hot, warm, deposit and treasury accounts.</p>
  <code class="pv-code">curl -s https://www.noshashi.app/api/v1/rippling/batch \\
  -H "Authorization: Bearer \$NOSHASHI_RIPPLING_KEY" -H "content-type: application/json" \\
  -d '{"accounts": ["rHot…", "rWarm…", "rDeposit…"]}'</code>

  <h3 style="margin-top:22px">Issuer holder scan (Desk and Institution)</h3>
  <p>For a token issuer: of your largest holders, which can have your token swapped out of their account by anyone's payment,
     and how much of it in total. Up to 200 holders per call; page on with <code>offset</code>.</p>
  <code class="pv-code">curl -s "https://www.noshashi.app/api/v1/rippling/issuer?issuer=rYourIssuer…&amp;currency=USD&amp;offset=0" \\
  -H "Authorization: Bearer \$NOSHASHI_RIPPLING_KEY"</code>

  <h2 style="margin-top:32px" id="plans">Plans</h2>
  <div class="pv-scroll" role="region" aria-label="Plans" tabindex="0"><table class="pv-table">
    <thead><tr><th>Plan</th><th>Price</th><th>Single-account checks</th><th>Fleet scan</th><th>Issuer holder scan</th></tr></thead>
    <tbody>${PLAN_ROWS}</tbody>
  </table></div>
  <p class="pv-note">Billed monthly by invoice or card; annual prepayment is 10% less. Keys are issued once the first invoice is paid.
     Per-minute limits apply to each key; monthly volume is fair use, agreed in the order. Every plan is read-only: no keys, no
     signing, no custody.</p>
  <p><a class="btn" href="mailto:institutions@noshashi.app?subject=Rippling%20Exposure%20API%20plan">Order a plan</a>
     <a class="btn ghost" href="/contact/?topic=institutions">Ask a question first</a></p>

  <h2 style="margin-top:32px" id="research">Research note: how common is it?</h2>
  <p>On 20 November 2026 we read the trust lines of twelve accounts drawn from the largest holders on the first page of
     Bitstamp's USD issuer. Five could have a currency moved between their own lines at par, from 2 to 102 units each. Seven could
     not: several held the same currency on many open lines, but none of those lines had room left under its limit, so nothing
     could ripple in. Holding a currency on several open lines is not, on its own, exposure; room to receive is what makes it so.
     No account is named here; anyone can repeat the reading with the check above.</p>
  <p>The same day an issuer holder scan of Bitstamp's USD read 279 holders on its first trust-line pages and checked the 60
     largest. Eight could have their Bitstamp USD swapped out for another issuer's USD by a third party's payment: 71.94 USD in
     all, 0.25% of the 28,686.77 USD those 60 held. Small today, and invisible to the issuer without reading each holder's lines.</p>
  <p class="pv-note">A reading of ledger facts at one ledger index. Not a security audit, legal opinion or guarantee. NOSHASHI is
     independent and not affiliated with Ripple, Bitstamp or the XRPL Foundation.</p>
</section>`;

  const script = `<script>
(function(){${COMMON}
  var f=document.getElementById("rp-form"), st=document.getElementById("rp-status"), out=document.getElementById("rp-out"), go=document.getElementById("rp-go");
  function cell(t){var td=document.createElement("td");td.textContent=t;return td;}
  function show(b){
    out.hidden=false;
    document.getElementById("rp-verdict").textContent=b.verdict;
    document.getElementById("rp-role").textContent=b.role;
    document.getElementById("rp-ledger").textContent=Number(b.ledger_index).toLocaleString("en-US");
    document.getElementById("rp-lines").textContent=b.coverage.lines_read+(b.coverage.truncated?"+":"");
    document.getElementById("rp-summary").textContent=b.summary;
    var rows=document.getElementById("rp-rows"); rows.textContent="";
    (b.exposures||[]).forEach(function(e){var tr=document.createElement("tr");
      [e.currency_display,String(e.open_lines),e.held_on_open_lines,e.receiving_room,e.exposed?e.movable_at_par:"0 (no room)"].forEach(function(v){tr.appendChild(cell(v));});
      rows.appendChild(tr);});
    if(!rows.children.length){var tr=document.createElement("tr");var td=cell("No currency is held on two or more lines open to rippling.");td.colSpan=5;tr.appendChild(td);rows.appendChild(tr);}
    var fl=document.getElementById("rp-findings"); fl.textContent="";
    (b.findings||[]).forEach(function(x){var li=document.createElement("li");li.textContent=x.detail;fl.appendChild(li);});
    document.getElementById("rp-fixes").textContent=(b.fixes&&b.fixes.length)?JSON.stringify(b.fixes,null,2):"Nothing to fix.";
    document.getElementById("rp-digest").textContent=b.receipt?b.receipt.digest:"—";
  }
  f.addEventListener("submit",function(e){
    e.preventDefault();
    var a=f.account.value.trim();
    if(!ADDRESS.test(a)){say(st,"Enter a public XRPL address. It begins with r.","bad");return;}
    go.disabled=true; say(st,"Reading every trust line at one validated ledger…","");
    fetch("/api/v1/rippling?account="+encodeURIComponent(a),{headers:{Accept:"application/json"}})
      .then(function(r){var left=r.headers.get("X-Free-Checks-Remaining");return r.json().then(function(b){if(!r.ok){if(b.upgrade&&window.NoshashiUpgrade)window.NoshashiUpgrade.show(b);throw new Error(b.error||"The ledger could not be read.");}b.__left=left;return b;});})
      .then(function(b){show(b);say(st,"Read from "+b.source+" at "+b.observed_at+"."+(b.__left!=null?" "+b.__left+" free checks left today; plans have no daily cap.":""),"");
        try{history.replaceState(null,"","?account="+encodeURIComponent(a));}catch(_){}})
      .catch(function(err){say(st,err.message,"bad");})
      .then(function(){go.disabled=false;});
  });
  try{var q=new URLSearchParams(location.search).get("account");if(q&&ADDRESS.test(q)){f.account.value=q;f.requestSubmit?f.requestSubmit():null;}}catch(e){}
})();
</script>`;

  await write("rippling/index.html", renderPage({
    title: "Rippling Exposure API — can your XRPL tokens be swapped without your signature?",
    description: "Free check and API: reads every trust line of an XRP Ledger account at one validated ledger and shows which currencies anyone's payment can move between its own lines at par, how much, and the unsigned NoRipple transactions that close it.",
    path: "/rippling/",
    head: CSS,
    body,
    scripts: `<script src="/assets/upgrade.js"></script>${script}`,
    structured: [breadcrumb("Rippling Exposure API", "/rippling/")],
  }));
}

/* ── /products/ ─────────────────────────────────────────────────── */
/*
 * The catalogue. Each entry names only what exists in this repository,
 * with the price the checkout charges or the word "free"; nothing is
 * promised that is not built.
 */
export const PRODUCTS = [
  { href: "/continuity/", name: "Continuity", tag: "Featured build · deposit reconciliation", price: "Free · download it for your own books",
    text: "Check that one issued-token deposit was credited to your customers exactly once, for the right token and amount, read from two Mainnet servers against your own posted credits." },
  { href: "/rippling/", name: "Rippling Exposure API", tag: "New · API", price: "Free check · plans from $299 to $3,500 a month",
    text: "Find the currencies anyone's payment can swap between an account's own trust lines, how much can move, and the unsigned NoRipple fixes." },
  { href: "/presign-guard/", name: "Pre-Sign Guard", tag: "Self-hosted · institutions", price: "Open source",
    text: "APPROVE, REJECT or RETRY before an XRPL transaction is signed: a Fireblocks Co-signer Callback Handler, or /v1/check for any signer." },
  { href: "/watch/", name: "Issuer Watch", tag: "Alerts", price: `${WATCH} a month per token`,
    text: "An email the moment a token's issuer switches on a freeze, enables clawback, changes its keys or its fee." },
  { href: "/verified/", name: "Verified Issuer", tag: "For token issuers", price: `${VERIFIED} a month`,
    text: "A live badge that reads the issuer's powers from the ledger, and a report every month." },
  { href: "/listing-review/", name: "Listing review", tag: "For exchanges and launchpads", price: LISTING,
    text: "A review of a token's issuer, supply and liquidity before you list it." },
  { href: "/history/", name: "Issuer history", tag: "Reader and report", price: `Free reader · ${HISTORY} report`,
    text: "Every change an issuer has made to its powers, from the ledger's own history." },
  { href: "/evidence-report/", name: "Ledger Evidence Report", tag: "Evidence for audits and partners", price: "From $250",
    text: "A PDF of issuer controls, treasury holdings and real versus advertised depth, with an evidence file and a fingerprint anyone can verify." },
  { href: "/developers/", name: "Compliance & Asset Risk APIs", tag: "Developers", price: "Prepaid checks from about $0.04",
    text: "Screening, issuer authority, settlement checks and asset risk as JSON, each answer with its ledger index and a SHA-256 receipt." },
];

async function buildProductsHub(write) {
  const cards = PRODUCTS.map((p, i) => `
    <a class="panel vx-card${i === 0 ? " vx-featured" : ""}" href="${p.href}">
      <p class="num">${String(i + 1).padStart(2, "0")} / ${p.tag.toUpperCase()}</p>
      <h2>${p.name}</h2>
      <p>${p.text}</p>
      <p class="pv-note"><b>${p.price}</b> <span aria-hidden="true">→</span></p>
    </a>`).join("");
  const body = `<div class="page-head">
  <p class="eyebrow">NOSHASHI · products for the XRP Ledger</p>
  <h1>Products that read the ledger, not the label.</h1>
  <p>Every product reads validated XRP Ledger state, returns the ledger index it read and a SHA-256 receipt, and never holds keys,
     signs or moves funds. The research behind them is published under <a href="/research/">Research</a>, and each product page says
     what it costs and what it does not do.</p>
  <p><a href="/tutorials/">Watch the video tutorials</a>: every product, recorded live on Mainnet.</p>
</div>
<section>
  <div class="vx-grid">${cards}
  </div>
  <h2 style="margin-top:36px">Buying from NOSHASHI</h2>
  <div class="grid g2">
    <div class="panel"><p class="num">FOR PROCUREMENT</p>
      <p>Read-only by design: no custody, no keys, no signing. Source code is public. Security practices, data handling and
         sub-processors are on <a href="/trust/">Trust &amp; security</a>; terms on <a href="/legal/">Legal</a>.
         Invoices and bank transfer on request.</p></div>
    <div class="panel"><p class="num">WHAT WE DO NOT CLAIM</p>
      <p>No SOC 2 report yet, no customer logos, no audit opinions. A NOSHASHI record is a reading of ledger facts at a stated
         ledger index, not legal, compliance or investment advice.</p></div>
  </div>
  <p style="margin-top:20px"><a class="btn" href="/console/">Try every API in the console</a> <a class="btn ghost" href="/contact/?topic=institutions">Talk to us</a> <a class="btn ghost" href="/research/">Read the research</a></p>
</section>`;
  const css = `${CSS}<style>
.vx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.vx-card{display:block;color:inherit;text-decoration:none;transition:border-color .2s}
.vx-card:hover,.vx-card:focus-visible{border-color:var(--ink)}
.vx-card h2{font-size:20px;margin:6px 0 8px}
.vx-featured{grid-column:1/-1;border-color:var(--ink)}
.vx-featured h2{font-size:26px}
</style>`;
  await write("products/index.html", renderPage({
    title: "Products — XRP Ledger compliance, reconciliation and evidence | NOSHASHI",
    description: "NOSHASHI's products for the XRP Ledger: Continuity deposit reconciliation, the Rippling Exposure API, Pre-Sign Guard, Issuer Watch, Verified Issuer, listing reviews, issuer history and Ledger Evidence Reports. Read-only, with a receipt for every answer.",
    path: "/products/",
    current: "products",
    head: css,
    body,
    structured: [breadcrumb("Products", "/products/")],
  }));
}

/* ── /console/ ──────────────────────────────────────────────────── */
/*
 * The API Console: every public NOSHASHI API as a plain-language form,
 * driven by site/assets/console.js. Answers are read live from the
 * visitor's browser; nothing is pre-filled except public example
 * addresses the visitor chooses to load.
 */
async function buildConsole(write) {
  const css = `<style>
.cx{display:grid;grid-template-columns:minmax(260px,330px) 1fr;gap:0;border:1px solid var(--rule);border-radius:var(--r);overflow:hidden;margin-top:8px}
.cx-side{border-right:1px solid var(--rule);padding:14px 0;max-height:none}
.cx-group{margin:14px 18px 6px;font:11px "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--faint,var(--muted))}
.cx-tool{display:block;width:100%;text-align:left;background:none;border:0;border-left:2px solid transparent;padding:10px 18px;color:var(--muted);cursor:pointer;font:inherit}
.cx-tool:hover,.cx-tool:focus-visible{color:var(--ink);background:var(--panel,rgba(255,255,255,.03))}
.cx-tool[aria-current="true"]{color:var(--ink);border-left-color:var(--ink);background:var(--panel,rgba(255,255,255,.04))}
.cx-tool-q{display:block;font-size:14px;line-height:1.35}
.cx-tool-p{display:block;font:11px "IBM Plex Mono",monospace;margin-top:3px;color:var(--faint,var(--muted))}
.cx-main{padding:22px clamp(16px,3vw,32px);min-width:0}
.cx-main h2{font-size:clamp(24px,3vw,32px);margin:4px 0 6px}
.cx-label{font:11px "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0}
.cx-form{display:grid;gap:8px;max-width:640px;margin-top:16px}
.cx-form label{font:12px "IBM Plex Mono",monospace;color:var(--muted);margin-top:6px}
.cx-form input,.cx-form textarea,.cx-keybar input{box-sizing:border-box;width:100%;padding:10px 12px;border:1px solid var(--rule);border-radius:var(--r);background:transparent;color:var(--ink);font:12.5px/1.5 "IBM Plex Mono",monospace}
.cx-form textarea{min-height:70px}
.cx-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:8px}
[data-tone="bad"]{color:var(--bad,#e5484d)}
.cx-card{margin-top:22px;border:1px solid var(--rule);border-radius:var(--r);padding:18px 20px}
.cx-pill{display:inline-block;font:600 12px "IBM Plex Mono",monospace;letter-spacing:.08em;padding:5px 10px;border:1px solid currentColor;border-radius:999px}
.cx-pill[data-tone="good"]{color:var(--good,#3fb950)}.cx-pill[data-tone="warn"]{color:var(--warn,#f5a524)}.cx-pill[data-tone="bad"]{color:var(--bad,#e5484d)}
.cx-headline{font:400 clamp(18px,2.2vw,22px)/1.35 "Instrument Serif",Georgia,serif;margin:12px 0}
.cx-facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0;margin:0;border-top:1px solid var(--rule)}
.cx-facts div{padding:10px 12px 10px 0;border-bottom:1px solid var(--rule)}
.cx-facts dt{font:11px "IBM Plex Mono",monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.cx-facts dd{margin:4px 0 0;font-size:14px;overflow-wrap:anywhere}
.cx-meaning{color:var(--muted);font-size:14px;line-height:1.6;max-width:72ch}
.cx-pre{white-space:pre-wrap;overflow:auto;max-height:360px;font:12px/1.55 "IBM Plex Mono",monospace;border:1px solid var(--rule);border-radius:var(--r);padding:12px 14px;margin:8px 0}
.cx-keybar{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;margin:18px 0 6px;max-width:720px}
.cx-steps{list-style:none;padding:0;margin:18px 0 0;display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--rule)}
.cx-steps li{padding:14px 18px 6px 0;color:var(--muted);font-size:13.5px;line-height:1.55}
.cx-steps li+li{padding-left:18px;border-left:1px solid var(--rule)}
.cx-steps b{display:block;color:var(--ink);font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:20px;margin-bottom:4px}
@media (max-width:860px){.cx{grid-template-columns:1fr}.cx-side{border-right:0;border-bottom:1px solid var(--rule)}
  .cx-steps{grid-template-columns:1fr}.cx-steps li+li{padding-left:0;border-left:0;border-top:1px solid var(--rule)}}
</style>`;
  const body = `<div class="page-head">
  <p class="eyebrow">NOSHASHI API Console · XRPL Mainnet · read-only</p>
  <h1>Ask the ledger a question. Get a plain answer.</h1>
  <p>Every NOSHASHI API in one place, without writing code. Pick a question, enter a public address, and read the answer in plain
     language. The exact JSON and the one-line command your engineers need are underneath. Nothing here can sign, move funds or
     see a private key.</p>
  <p class="pv-note">New here? <a href="/tutorials/#i4-api-console">Watch the console tutorial</a>.</p>
  <ol class="cx-steps">
    <li><b>1 · Pick a question</b>Grouped by what you are responsible for: your holdings, your token, markets, treasury, payments.</li>
    <li><b>2 · Enter a public address</b>Or press “Use an example” to load a well-known public account.</li>
    <li><b>3 · Read the answer</b>A verdict, the key facts, what it means, and a receipt you can keep.</li>
  </ol>
</div>
<section>
  <div class="cx-keybar">
    <div><label class="cx-label" for="cx-key">Paid Rippling key (optional, only for fleet and issuer scans)</label>
      <input id="cx-key" type="password" autocomplete="off" spellcheck="false" placeholder="nsh_rip_…"></div>
    <button class="btn ghost" type="button" id="cx-forget">Forget key</button>
  </div>
  <p class="pv-note">The key stays in this browser tab only and is sent only to noshashi.app's own API. Free tools need no key and no account.</p>

  <div class="cx">
    <nav class="cx-side" id="cx-nav" aria-label="Questions you can ask"></nav>
    <div class="cx-main" id="cx-main">
      <p class="cx-label" id="cx-name">—</p>
      <h2 id="cx-q">Loading the console…</h2>
      <p id="cx-explain"></p>
      <p class="pv-note"><b>Who uses it:</b> <span id="cx-who"></span></p>
      <p class="pv-note" id="cx-keynote" hidden>Needs a paid plan. <a href="/rippling/#plans">See the plans</a>.</p>
      <form class="cx-form" id="cx-form" novalidate>
        <div id="cx-fields" class="cx-form" style="margin:0"></div>
        <div class="cx-actions"><button class="btn" id="cx-run" type="submit">Run it</button>
          <button class="btn ghost" type="button" id="cx-example">Use an example</button></div>
      </form>
      <p id="cx-status" role="status" class="pv-note" style="margin-top:10px"></p>
      <noscript><p class="pv-note">The console needs JavaScript. Every endpoint is also documented on <a href="/developers/">Developers</a>.</p></noscript>

      <div id="cx-out" hidden>
        <div class="cx-card" aria-live="polite">
          <span class="cx-pill" id="cx-verdict">—</span>
          <p class="cx-headline" id="cx-headline"></p>
          <dl class="cx-facts" id="cx-facts"></dl>
          <p class="cx-meaning" id="cx-meaning"></p>
          <p class="pv-note"><code id="cx-receipt"></code></p>
        </div>
        <details style="margin-top:16px"><summary>For your engineers: the command</summary>
          <pre class="cx-pre" id="cx-curl"></pre><button class="btn ghost" type="button" id="cx-copy">Copy command</button></details>
        <details style="margin-top:10px"><summary>The full answer (JSON)</summary><pre class="cx-pre" id="cx-json" tabindex="0"></pre></details>
      </div>
    </div>
  </div>
  <p class="pv-note" style="margin-top:18px">Facts read from validated XRP Ledger state at the ledger index shown, not legal, compliance or investment
     advice. Public tools are rate limited per visitor. Want this for your team, with your own wallets saved and checked on a schedule?
     <a href="/contact/?topic=institutions">Talk to us</a>.</p>
</section>`;
  await write("console/index.html", renderPage({
    title: "API Console — ask the XRP Ledger a question, get a plain answer | NOSHASHI",
    description: "Every NOSHASHI API in one visual console: rippling exposure, fleet and issuer scans, issuer controls and history, asset risk, real market depth, treasury control and delivered payment amounts. Plain-language answers, the JSON, and the command to reproduce it. Read-only.",
    path: "/console/",
    current: "console",
    head: CSS + css,
    body,
    scripts: `<script src="/assets/upgrade.js"></script><script src="/assets/console.js"></script>`,
    structured: [breadcrumb("API Console", "/console/")],
  }));
}

/* ── /tutorials/ ────────────────────────────────────────────────── */
/*
 * Narrated screen recordings of the real site reading XRPL Mainnet,
 * made by scripts/tutorials/build.mjs (.github/workflows/tutorial-videos.yml).
 * The transcript under each video is its narration, from tutorials.mjs.
 */
async function buildTutorials(write) {
  const css = `<style>
.tu-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 6px}
.tu-group{margin-top:34px}
.tu-group>p{color:var(--muted);margin:4px 0 0}
.tu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr));gap:22px;margin-top:16px}
.tu-card{border:1px solid var(--rule);border-radius:var(--r);overflow:hidden;display:flex;flex-direction:column}
.tu-card video{display:block;width:100%;aspect-ratio:16/9;background:#0b0f0b}
.tu-body{padding:14px 18px 18px}
.tu-body h3{margin:4px 0 6px;font-size:20px}
.tu-body p{margin:0;color:var(--muted);font-size:14px;line-height:1.55}
.tu-body details{margin-top:10px;font-size:13.5px}
.tu-body details ol{padding-left:18px;color:var(--muted);line-height:1.55}
.tu-kick{font:11px "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.tu-links{margin-top:10px;font-size:13.5px}
</style>`;
  const LINKS = {
    "i1-noshashi-in-two-minutes": [["/products/", "All products"], ["/console/", "API Console"]],
    "i2-continuity": [["/continuity/", "Open Continuity"]],
    "i3-rippling-exposure": [["/rippling/", "Run the free check"], ["/rippling/#plans", "Plans"]],
    "i4-api-console": [["/console/", "Open the console"]],
    "i5-issuer-due-diligence": [["/history/", "Issuer history"], ["/watch/", "Issuer Watch"], ["/verified/", "Verified Issuer"]],
    "i6-evidence-and-presign": [["/evidence-report/", "Evidence Report"], ["/presign-guard/", "Pre-Sign Guard"]],
    "d1-first-api-call": [["/developers/", "API docs"], ["/console/", "Console"]],
    "d2-rippling-api": [["/rippling/", "Rippling API docs"], ["/rippling/#plans", "Plans and keys"]],
  };
  const card = (t, n) => {
    const said = t.steps.filter((s) => s[0] === "say").map((s) => `<li>${s[1].replace(/&/g, "&amp;").replace(/</g, "&lt;")}</li>`).join("");
    const links = (LINKS[t.id] || []).map(([h, l]) => `<a href="${h}">${l}</a>`).join(" · ");
    return `<article class="tu-card" id="${t.id}">
      <video controls playsinline preload="none" poster="/tutorials/videos/${t.id}.jpg" aria-label="${t.title}">
        <source src="/tutorials/videos/${t.id}.mp4" type="video/mp4">
        <track kind="captions" src="/tutorials/videos/${t.id}.vtt" srclang="en" label="English" default>
      </video>
      <div class="tu-body">
        <span class="tu-kick">${AUDIENCES[t.audience].label} · ${n}</span>
        <h3>${t.title}</h3>
        <p>${t.blurb}</p>
        <details><summary>Transcript</summary><ol>${said}</ol></details>
        ${links ? `<p class="tu-links">${links}</p>` : ""}
      </div>
    </article>`;
  };
  const groups = Object.entries(AUDIENCES).map(([key, a]) => {
    const list = TUTORIALS.filter((t) => t.audience === key);
    return `<section class="tu-group" id="${key}">
    <h2>${a.label}</h2><p>${a.note}</p>
    <div class="tu-grid">${list.map((t, i) => card(t, i + 1)).join("")}</div>
  </section>`;
  }).join("");
  const body = `<div class="page-head">
  <p class="eyebrow">Video tutorials · recorded live on XRPL Mainnet</p>
  <h1>See every product working, in a few minutes each.</h1>
  <p>Each video is a recording of this site reading the real XRP Ledger: no sample data, no mock screens. Results you see were read
     from a validated Mainnet ledger while the video was made, so the same check today may show newer figures. Every video has
     captions and a transcript.</p>
  <nav class="tu-tabs" aria-label="Tutorial groups"><a class="btn" href="#institutions">For institutions</a><a class="btn ghost" href="#developers">For developers</a></nav>
</div>
${groups}
<p class="pv-note" style="margin-top:28px">Want a walkthrough for your own team, on your own wallets? <a href="/contact/?topic=institutions">Talk to us</a>.</p>`;
  await write("tutorials/index.html", renderPage({
    title: "Video tutorials — every NOSHASHI product, recorded live on the XRP Ledger | NOSHASHI",
    description: "Narrated walkthroughs of Continuity, the Rippling Exposure API, the API Console, issuer due diligence, the Evidence Report and Pre-Sign Guard, recorded live on XRPL Mainnet. For institutions and developers.",
    path: "/tutorials/",
    current: "tutorials",
    head: CSS + css,
    body,
    structured: [breadcrumb("Video tutorials", "/tutorials/")],
  }));
}

export async function buildProducts(write) {
  await buildTutorials(write);
  await buildProductsHub(write);
  await buildConsole(write);
  await buildRippling(write);
  await buildPresignGuard(write);
  await buildContinuity(write);
  await buildWatch(write);
  await buildVerified(write);
  await buildListing(write);
  await buildHistory(write);
}
