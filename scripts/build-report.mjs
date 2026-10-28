/*
 * The Ledger Evidence Report, in three tiers (api/_lib/evidence-tiers.js),
 * built and emailed automatically once Stripe confirms the payment.
 *
 *   /evidence-report/          the tiers, what it is and is not, and the order form
 *   /evidence-report/ordered/  where Stripe returns a buyer after paying
 *   /evidence-report/build/    the same report assembled in the browser (preview)
 *   /evidence-report/verify/   confirm a report by its SHA-256
 *
 * Every figure in the report is read live from the same free endpoints
 * the public tools use (/api/authority, /api/treasury, /api/book), at the
 * ledger index each one states. Delivery is
 * supabase/functions/noshashi-evidence-report; the buyer pays for the
 * report being prepared, delivered on schedule and verifiable, not for
 * data that is otherwise hidden, and the page says so.
 *
 * Copy rules the whole site keeps: no score, no legal or accounting
 * finding, an unreadable fact is never shown as a pass, and nothing here
 * asks for a key, a seed or a balance.
 */

import { renderPage, breadcrumb } from "../api/_lib/shell.js";
import { EVIDENCE_TIERS, DEFAULT_TIER } from "../api/_lib/evidence-tiers.js";

const FUNCTIONS = "https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1";
const usd = (cents) => `$${(cents / 100).toLocaleString("en-US")}`;
const FROM = usd(EVIDENCE_TIERS.standard.cents);
/** The builder previews the largest scope any tier allows. */
const REPORT_LIMITS = Object.values(EVIDENCE_TIERS).reduce(
  (m, t) => ({ issuers: Math.max(m.issuers, t.limits.issuers), wallets: Math.max(m.wallets, t.limits.wallets), books: Math.max(m.books, t.limits.books) }),
  { issuers: 0, wallets: 0, books: 0 }
);
const NOINDEX = `<meta name="robots" content="noindex">`;

/** A real, public scope: Ripple's RLUSD issuer and the Bitstamp USD book. */
const SAMPLE =
  "/evidence-report/build/?issuers=rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De&wallets=rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De&books=USD.rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B&org=Sample%20(public%20accounts)";

const CSS = `<style>
.er-form{display:grid;gap:14px;max-width:680px}
.er-form textarea{min-height:64px;font:12px "IBM Plex Mono",monospace}
.er-list{margin:8px 0 0;padding-left:18px;line-height:1.7}
.er-note{color:var(--muted);font-size:12.5px;line-height:1.6;max-width:72ch}
.er-actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.btn-quiet{background:transparent;color:var(--ink);border:1px solid var(--rule)}
.er-tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:12px 0}
.er-tier{display:block;border:1px solid var(--rule);border-radius:var(--r);padding:16px 18px;cursor:pointer}
.er-tier:has(input:checked){border-color:var(--ink)}
.er-tier input{margin-right:8px}
.er-tier .num{margin:0 0 4px}
.er-tier strong{display:block;font:600 26px/1.15 "Space Grotesk",sans-serif;margin:4px 0 8px}
.er-tier p{margin:0;font-size:13px;line-height:1.55}
</style>`;

const COMMON_JS = `
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function say(el,text,tone){el.textContent=text;el.setAttribute("data-tone",tone||"");}
  function items(v){return String(v||"").split(/[\\s,]+/).map(function(s){return s.trim();}).filter(Boolean);}
`;

const TIER_COPY = {
  standard: "One report, at your period end or today. Up to 3 issuers, 10 wallets and 3 order books.",
  quarterly: "A report now, then one the day after each of the next four quarter-ends. Same scope as Standard.",
  audit: "A report now, then one the day after each of the next twelve month-ends. Up to 6 issuers, 10 wallets and 6 order books.",
};

/* ── /evidence-report/ ────────────────────────────────────────────── */
async function buildSales(write) {
  const tiers = Object.entries(EVIDENCE_TIERS)
    .filter(([, t]) => !t.hidden)
    .map(([key, t]) => `<label class="er-tier"><p class="num"><input type="radio" name="tier" value="${key}"${key === DEFAULT_TIER ? " checked" : ""}>${t.name.toUpperCase()}</p>
      <strong>${usd(t.cents)}</strong><p>${TIER_COPY[key]}</p></label>`)
    .join("\n      ");
  const body = `<div class="page-head">
  <p class="eyebrow">Report · from ${FROM}</p>
  <h1>Ledger Evidence Report</h1>
  <p>For a company that holds XRP or issues on the XRP Ledger, and has to show an auditor, a board or a
     counterparty what the ledger says. Name your accounts and pay; the report is read from validated XRP
     Ledger mainnet and emailed to you, with every fact stamped with the ledger index it was read at.</p>
</div>
<section>
  <div class="grid g2">
    <div class="panel"><p class="num">ISSUER CONTROLS</p>
      <p>For each issuing account: whether it kept the power to freeze holders, whether a freeze is on now,
         whether holding needs the issuer's permission, how many keys must sign, and supply concentration
         where it can be measured.</p></div>
    <div class="panel"><p class="num">WHO CAN MOVE THE TREASURY</p>
      <p>For each wallet, at your period end or today: balance, reserve and what is available, and how
         many keys it takes to move it. That count comes from summed signer weights, the master key and
         any regular key, not a headcount.</p></div>
    <div class="panel"><p class="num">DEPTH THAT CAN ACTUALLY FILL</p>
      <p>Quoted against funded depth within 10% of mid on the books you name, plus how much of the XRP
         held could be sold into the main books. AMM pools are shown separately, not added.</p></div>
    <div class="panel"><p class="num">EVIDENCE ANYONE CAN RE-CHECK</p>
      <p>Each report carries its findings in plain language, every ledger reply it was built from, and a
         SHA-256 over them. Your auditor can confirm the report on this site by that digest, and re-read every
         figure without trusting us.</p></div>
  </div>

  <h2 style="margin-top:32px">How it is delivered</h2>
  <ul class="er-list">
    <li>Emailed to the address you pay with, usually within minutes of payment: the report (open it in a browser, print to PDF) and the raw evidence file.</li>
    <li>Quarterly and Audit support reports arrive by email the day after each period end, read at the last ledger of that day.</li>
    <li>An invoice from Stripe with your billing address and tax ID.</li>
    <li>If a reading cannot be taken, the report is not sent with a gap: it is retried, and if it still cannot be read you hear from us and are refunded for that report.</li>
  </ul>

  <h2 style="margin-top:32px">What it is not</h2>
  <p class="er-note">A record of ledger facts at a stated ledger index, generated automatically. It is not an audit opinion, an
     attestation, a valuation, fair-value guidance under any accounting standard, or a legal or compliance determination
     about any asset or person. NOSHASHI never asks for keys, seeds, balances or customer data: everything in the report
     is public ledger state for the addresses you name.</p>
  <p class="er-note">Every figure comes from NOSHASHI's free public tools (<a href="/certificate/">certificate</a>,
     <a href="/treasury/">treasury report</a>, <a href="/book-health/">book health</a>), and you can run them yourself.
     The report is for teams who want it assembled, delivered on schedule and verifiable for the file.
     <a href="${SAMPLE}">See a live sample</a> built from public accounts.</p>

  <h2 style="margin-top:32px" id="order">Order</h2>
  <form class="er-form" id="er-form" novalidate>
    <fieldset style="border:0;padding:0;margin:0"><legend class="num">CHOOSE A TIER</legend>
      <div class="er-tiers">
      ${tiers}
      </div>
    </fieldset>
    <div class="form-field"><label for="er-org">Organization</label>
      <input id="er-org" name="organization" type="text" maxlength="120" autocomplete="organization" placeholder="Company name, as it should appear on the report"></div>
    <div class="form-field"><label for="er-issuers">Issuing accounts</label>
      <textarea id="er-issuers" name="issuers" spellcheck="false" placeholder="r…, one per line"></textarea></div>
    <div class="form-field"><label for="er-wallets">Treasury wallets (up to 10)</label>
      <textarea id="er-wallets" name="wallets" spellcheck="false" placeholder="r…, one per line"></textarea></div>
    <div class="form-field"><label for="er-books">Order books (optional)</label>
      <textarea id="er-books" name="books" spellcheck="false" placeholder="CURRENCY.issuer, for example USD.rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"></textarea></div>
    <div class="form-field" style="max-width:220px"><label for="er-at">Period end for the first report (optional, UTC)</label>
      <input id="er-at" name="period_end" type="date"></div>
    <p class="er-note">Name at least one issuing account or one wallet. Addresses only: never send keys or seeds. The report goes to the email you enter at checkout.</p>
    <div class="er-actions">
      <button class="btn" type="submit" id="er-pay">Pay ${FROM} by card</button>
      <a class="btn btn-quiet" id="er-preview" href="/evidence-report/build/">Preview this scope free</a>
    </div>
    <p class="form-status" id="er-status" role="status" aria-live="polite"></p>
  </form>
  <p class="er-note" style="margin-top:14px">Paying by bank transfer, against a purchase order, or after a vendor form? Email
     <a href="mailto:support@noshashi.app?subject=Ledger%20Evidence%20Report">support@noshashi.app</a> and an invoice will be
     sent instead. Received a report? <a href="/evidence-report/verify/">Confirm it is authentic</a>.
     Buying is subject to the <a href="/legal/report-terms/">Terms of Sale</a>.</p>
</section>`;

  const prices = Object.fromEntries(Object.entries(EVIDENCE_TIERS).map(([k, t]) => [k, usd(t.cents)]));
  const limits = Object.fromEntries(Object.entries(EVIDENCE_TIERS).map(([k, t]) => [k, t.limits]));
  const script = `<script>
(function(){${COMMON_JS}
  var form=document.getElementById("er-form"); if(!form)return;
  var status=document.getElementById("er-status"), pay=document.getElementById("er-pay"), preview=document.getElementById("er-preview");
  var PRICES=${JSON.stringify(prices)}, LIMITS=${JSON.stringify(limits)};
  // ?tier=test starts the unlisted $0.50 test purchase; the server decides
  // whether it is offered and where its report goes.
  var forced=null; try{if(new URLSearchParams(location.search).get("tier")==="test")forced="test";}catch(e){}
  function tier(){if(forced)return forced;var t=form.querySelector('input[name="tier"]:checked');return t?t.value:"${DEFAULT_TIER}";}
  function scope(){
    return {tier:tier(),organization:form.organization.value.trim(),issuers:items(form.issuers.value),wallets:items(form.wallets.value),
            books:items(form.books.value),period_end:form.period_end.value};
  }
  function previewUrl(){
    var s=scope(), p=new URLSearchParams();
    if(s.organization)p.set("org",s.organization); if(s.issuers.length)p.set("issuers",s.issuers.join(","));
    if(s.wallets.length)p.set("wallets",s.wallets.join(",")); if(s.books.length)p.set("books",s.books.join(","));
    if(s.period_end)p.set("at",s.period_end);
    return "/evidence-report/build/?"+p.toString();
  }
  function sync(){pay.textContent="Pay "+PRICES[tier()]+" by card";preview.href=previewUrl();}
  try{var q=new URLSearchParams(location.search).get("tier");var r=q&&form.querySelector('input[name="tier"][value="'+q.replace(/[^a-z]/g,"")+'"]');if(r)r.checked=true;}catch(e){}
  sync();
  if(forced)say(status,"Test purchase: "+PRICES.test+", one Standard report, sent to the owner's address.","");
  form.addEventListener("input",sync); form.addEventListener("change",sync);
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var s=scope(), lim=LIMITS[s.tier];
    if(!s.issuers.length&&!s.wallets.length){say(status,"Name at least one issuing account or one wallet.","bad");return;}
    if(s.issuers.length>lim.issuers||s.wallets.length>lim.wallets||s.books.length>lim.books){
      say(status,"This tier covers up to "+lim.issuers+" issuers, "+lim.wallets+" wallets and "+lim.books+" order books.","bad");return;}
    pay.disabled=true; say(status,"Opening secure checkout…","");
    fetch("/api/create-checkout-session",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({product:"evidence-report",tier:s.tier,organization:s.organization,issuers:s.issuers.join(","),
        wallets:s.wallets.join(","),books:s.books.join(","),period_end:s.period_end})})
      .then(function(r){return r.json().then(function(b){if(!r.ok||!b.url)throw new Error(b.error||"Checkout could not start.");return b;});})
      .then(function(b){location.href=b.url;})
      .catch(function(err){pay.disabled=false;say(status,err.message+" You can also email support@noshashi.app.","bad");});
  });
})();
</script>`;

  await write("evidence-report/index.html", renderPage({
    title: `Ledger Evidence Report — XRP Ledger facts your auditor can re-check (from ${FROM})`,
    description: `Report for companies holding XRP or issuing on the XRP Ledger, from ${FROM}: issuer controls, who can move each wallet, and quoted versus funded depth, read from validated mainnet, ledger-stamped, emailed automatically, one-off, quarterly or monthly.`,
    path: "/evidence-report/",
    head: CSS,
    body,
    structured: [breadcrumb("Ledger Evidence Report", "/evidence-report/")],
    scripts: script,
  }));
}

/* ── /evidence-report/ordered/ ────────────────────────────────────── */
async function buildOrdered(write) {
  const body = `<div class="page-head">
  <p class="eyebrow">Payment received</p>
  <h1>Thank you. Your Ledger Evidence Report is on its way.</h1>
  <p>Stripe is emailing your receipt and invoice now. The report is being read from the XRP Ledger and will
     arrive at the email you paid with, usually within minutes. Quarterly and Audit support reports follow by
     email the day after each period end.</p>
</div>
<section>
  <div class="grid g2">
    <div class="panel"><p class="num">NOT ARRIVED WITHIN THE HOUR?</p>
      <p>Check your spam folder for mail from noshashi.app, then write to
         <a href="mailto:support@noshashi.app?subject=Ledger%20Evidence%20Report">support@noshashi.app</a>.
         A report whose readings could not all be taken is retried rather than sent with a gap.</p></div>
    <div class="panel"><p class="num">FOR YOUR AUDITOR</p>
      <p>Every report states a SHA-256. Anyone can confirm it was issued by NOSHASHI, unaltered, on the
         <a href="/evidence-report/verify/">verification page</a>.</p></div>
  </div>
</section>`;

  await write("evidence-report/ordered/index.html", renderPage({
    title: "Ledger Evidence Report — payment received",
    description: "Your Ledger Evidence Report order is confirmed.",
    path: "/evidence-report/ordered/",
    head: NOINDEX,
    body,
  }));
}

/* ── /evidence-report/verify/ ─────────────────────────────────────── */
async function buildVerify(write) {
  const body = `<div class="page-head">
  <p class="eyebrow">Ledger Evidence Report · verification</p>
  <h1>Confirm a report is authentic</h1>
  <p>Every Ledger Evidence Report states a SHA-256 over the raw evidence it was built from. Enter it here to see
     whether NOSHASHI issued a report with that digest, to whom and when. To check the report was not altered, compute the
     SHA-256 of the evidence file sent with it (for example <code>shasum -a 256 file.json</code>) and compare.</p>
</div>
<section>
  <form class="er-form" id="vf-form" novalidate>
    <div class="form-field"><label for="vf-digest">SHA-256 stated on the report</label>
      <input id="vf-digest" type="text" spellcheck="false" autocomplete="off" maxlength="64" placeholder="64 hexadecimal characters"></div>
    <div class="er-actions"><button class="btn" type="submit">Verify</button></div>
    <p class="form-status" id="vf-status" role="status" aria-live="polite"></p>
  </form>
  <div id="vf-out"></div>
</section>`;

  const script = `<script>
(function(){${COMMON_JS}
  var form=document.getElementById("vf-form"); if(!form)return;
  var input=document.getElementById("vf-digest"), status=document.getElementById("vf-status"), out=document.getElementById("vf-out");
  function run(){
    var d=(input.value||"").trim();
    if(!/^[0-9A-Fa-f]{64}$/.test(d)){say(status,"A SHA-256 is 64 hexadecimal characters.","bad");return;}
    say(status,"Checking…",""); out.innerHTML="";
    fetch("${FUNCTIONS}/noshashi-evidence-report/verify?digest="+d).then(function(r){return r.json();}).then(function(b){
      if(!b.found){say(status,"No report with this digest was issued by NOSHASHI.","bad");return;}
      say(status,"Issued by NOSHASHI.","");
      var rows=[["Report",b.reference],["Prepared for",b.organization||"—"],["Tier",b.tier],["Period end",b.period_end||"None (latest ledger)"],["Generated",b.generated_at],["Sent",b.sent_at]];
      var h='<table class="tool-table" style="width:100%;max-width:680px;border-collapse:collapse;font-size:13px"><tbody>';
      rows.forEach(function(r){h+='<tr><th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--rule)">'+esc(r[0])+'</th><td style="padding:6px 8px;border-bottom:1px solid var(--rule)">'+esc(r[1])+'</td></tr>';});
      Object.keys(b.ledger_indexes||{}).forEach(function(k){h+='<tr><th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--rule)">Ledger</th><td style="padding:6px 8px;border-bottom:1px solid var(--rule);font:11px IBM Plex Mono,monospace;word-break:break-all">'+esc(b.ledger_indexes[k])+' · '+esc(k)+'</td></tr>';});
      out.innerHTML=h+'</tbody></table>';
    }).catch(function(){say(status,"Verification could not be reached. Try again shortly.","bad");});
  }
  form.addEventListener("submit",function(e){e.preventDefault();run();});
  var q=new URLSearchParams(location.search).get("digest"); if(q){input.value=q;run();}
})();
</script>`;

  await write("evidence-report/verify/index.html", renderPage({
    title: "Verify a Ledger Evidence Report",
    description: "Confirm a NOSHASHI Ledger Evidence Report by the SHA-256 it states: whether it was issued, to whom and when.",
    path: "/evidence-report/verify/",
    head: CSS,
    body,
    scripts: script,
  }));
}

/* ── /legal/report-terms/ ─────────────────────────────────────────── */
async function buildTerms(write) {
  const updated = "October 28, 2026";
  const section = (title, ...paras) => `<h2 style="margin-top:28px">${title}</h2>${paras.map((p) => `<p>${p}</p>`).join("")}`;
  const body = `<div class="page-head">
  <p class="eyebrow">Legal · last updated ${updated}</p>
  <h1>Terms of Sale: Ledger Evidence Report</h1>
  <p>These terms apply when you buy a Ledger Evidence Report from NOSHASHI. They are written to be read, not skimmed past.
     If anything here is unclear, write to <a href="mailto:support@noshashi.app">support@noshashi.app</a> before you buy.</p>
</div>
<section class="er-note" style="max-width:76ch;font-size:14px;color:var(--ink)">
  ${section("1. Who you are buying from",
    "NOSHASHI, operated by Joshua Edmond, 2445 Dunn Ave, Apt 1119, Jacksonville, FL 32218, United States. Payment is taken by Stripe; NOSHASHI never receives or stores your card details.")}
  ${section("2. What you are buying",
    "A report of public facts read from the XRP Ledger for the addresses and order books you name when you order: Standard (one report), Quarterly (a report at purchase and at each of the next four quarter-ends) or Audit support (a report at purchase and at each of the next twelve month-ends). The scope is fixed at purchase. Each report is a PDF with an evidence file and a fingerprint (SHA-256) that anyone can check on our verification page.")}
  ${section("3. What the report is not",
    "The report records ledger facts at the ledger numbers it states. It is not an audit opinion, an attestation or assurance engagement, a valuation, fair-value guidance under any accounting standard, investment, legal or tax advice, or a determination that any asset, issuer or person is or is not compliant with any law. It should not be the only basis for a financial, legal or investment decision.",
    "You may share the report with your auditors, advisers, board and regulators. NOSHASHI accepts no duty of care to anyone other than you, the buyer, by reason of that sharing.")}
  ${section("4. How the report is made",
    "Reports are generated automatically from validated XRP Ledger mainnet through public ledger servers, using the methods stated in each report: for example, order-book depth counts offers within 10% of the market price and at most 100 offers on each side, and AMM pools are shown separately. A figure is accurate to the ledger at the stated ledger number; the ledger changes continuously afterwards. A reading that cannot be taken is never shown as a pass.")}
  ${section("5. Delivery",
    "Reports are emailed to the address you pay with, usually within minutes of payment, and scheduled reports the day after each period end. If a report cannot be built because the ledger cannot be read for your scope, we retry, and if it still cannot be built we tell you and refund that report.")}
  ${section("6. Refunds and cancellation",
    "If a report is not delivered, or materially fails to match this description, tell us within 14 days of delivery and we will correct it or refund it. You may cancel Quarterly or Audit support at any time; we refund the reports not yet delivered, pro rata to the price paid. Delivered reports are otherwise non-refundable, because they are digital records produced for you.")}
  ${section("7. Liability",
    "To the extent the law allows, NOSHASHI's total liability arising from an order is limited to the amount you paid for that order, and NOSHASHI is not liable for indirect, consequential or lost-profit losses. Nothing in these terms limits liability that cannot be limited by law.")}
  ${section("8. Your information",
    "To deliver and verify reports we keep the order's scope (the public addresses you named), the organization name you gave, your email address and each report's fingerprint. Anyone holding a report's fingerprint can see, on the verification page, the report reference, organization name, plan and dates. We do not sell this information. Payment data is handled by Stripe under its own terms.")}
  ${section("9. Prices and taxes",
    "Prices are in US dollars. Where sales tax, VAT or similar applies, it is added at checkout or invoiced as required. Stripe issues an invoice for every payment.")}
  ${section("10. Law",
    "These terms are governed by the laws of the State of Florida, USA. Questions or complaints: <a href='mailto:support@noshashi.app'>support@noshashi.app</a>.")}
</section>`;

  await write("legal/report-terms/index.html", renderPage({
    title: "Terms of Sale — Ledger Evidence Report",
    description: "The terms that apply when you buy a NOSHASHI Ledger Evidence Report: what it is and is not, delivery, refunds, liability and your information.",
    path: "/legal/report-terms/",
    body,
    structured: [breadcrumb("Terms of Sale: Ledger Evidence Report", "/legal/report-terms/")],
  }));
}

/* ── /evidence-report/build/ ──────────────────────────────────────── */
async function buildBuilder(write) {
  const head = NOINDEX + `<style>
.rp{max-width:900px}
.rp h2{font-size:18px;margin:30px 0 8px;border-bottom:1px solid var(--rule);padding-bottom:6px}
.rp h3{font-size:14px;margin:18px 0 6px}
.rp table{width:100%;border-collapse:collapse;font-size:12.5px;margin:6px 0 10px}
.rp th,.rp td{border-bottom:1px solid var(--rule);padding:6px 8px;text-align:left;vertical-align:top}
.rp td.num,.rp th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.rp .mono{font:11px "IBM Plex Mono",monospace;word-break:break-all}
.rp .meta{color:var(--muted);font-size:12px;line-height:1.6}
.rp .ok{color:var(--go)} .rp .warn{color:var(--hold)} .rp .bad{color:var(--nogo)} .rp .na{color:var(--muted)}
.rp-scroll{overflow-x:auto;max-width:100%}
.rp-form{display:grid;gap:12px;max-width:680px;margin-bottom:22px}
.rp-form textarea{min-height:48px;font:12px "IBM Plex Mono",monospace}
@media print{
  header,footer,nav,.no-print,.page-head{display:none!important}
  body{background:#fff!important;color:#000!important}
  .rp{max-width:none} .rp a{color:#000;text-decoration:none}
  .rp h2{break-after:avoid} .rp table{break-inside:auto} .rp tr{break-inside:avoid}
}
</style>`;

  const body = `<div class="page-head no-print">
  <p class="eyebrow">Ledger Evidence Report · builder</p>
  <h1>Build the report from live ledger data</h1>
  <p>Name the accounts, read them, then print to PDF and download the raw evidence. Every figure is read now,
     from validated XRP Ledger mainnet, through NOSHASHI's public endpoints.</p>
</div>
<section>
  <form class="rp-form no-print" id="rp-form" novalidate>
    <div class="form-field"><label for="rp-org">Prepared for</label><input id="rp-org" type="text" maxlength="120"></div>
    <div class="form-field"><label for="rp-issuers">Issuing accounts (up to ${REPORT_LIMITS.issuers})</label><textarea id="rp-issuers" spellcheck="false"></textarea></div>
    <div class="form-field"><label for="rp-wallets">Treasury wallets (up to ${REPORT_LIMITS.wallets})</label><textarea id="rp-wallets" spellcheck="false"></textarea></div>
    <div class="form-field"><label for="rp-books">Order books, CURRENCY.issuer (up to ${REPORT_LIMITS.books})</label><textarea id="rp-books" spellcheck="false"></textarea></div>
    <div class="form-field" style="max-width:220px"><label for="rp-at">Period end for the treasury section (UTC)</label><input id="rp-at" type="date"></div>
    <div class="er-actions" style="display:flex;gap:12px;flex-wrap:wrap">
      <button class="btn" type="submit">Read the ledger</button>
      <button class="btn" type="button" id="rp-print" disabled>Print or save as PDF</button>
      <button class="btn" type="button" id="rp-raw" disabled>Download raw evidence (JSON)</button>
    </div>
    <p class="form-status" id="rp-status" role="status" aria-live="polite"></p>
  </form>
  <article class="rp" id="rp-out" hidden></article>
</section>`;

  const script = `<script>
(function(){${COMMON_JS}
  var form=document.getElementById("rp-form"); if(!form)return;
  var out=document.getElementById("rp-out"), status=document.getElementById("rp-status");
  var printBtn=document.getElementById("rp-print"), rawBtn=document.getElementById("rp-raw");
  var LIMITS=${JSON.stringify(REPORT_LIMITS)};
  var ADDRESS=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
  var evidence=null;

  function n(v,d){if(v===null||v===undefined||v===""||!isFinite(Number(v)))return "—";return Number(v).toLocaleString("en-US",{maximumFractionDigits:d==null?2:d});}
  function pct(r){if(r===null||r===undefined||!isFinite(r))return "—";return (r*100).toLocaleString("en-US",{maximumFractionDigits:1})+"%";}
  /* A currency longer than three characters is held on the ledger as 40 hex. */
  function currencyCode(c){
    if(/^[0-9A-Fa-f]{40}$/.test(c))return c.toUpperCase();
    if(c.length===3)return c;
    var h="";for(var i=0;i<c.length;i++)h+=c.charCodeAt(i).toString(16).toUpperCase().padStart(2,"0");
    return (h+"0".repeat(40)).slice(0,40);
  }
  function label(c){
    if(!/^[0-9A-F]{40}$/i.test(c))return c;
    var s="";for(var i=0;i<40;i+=2){var b=parseInt(c.slice(i,i+2),16);if(b)s+=String.fromCharCode(b);}
    return /^[\\x20-\\x7e]+$/.test(s)?s:c;
  }
  function get(url){
    return fetch(url,{headers:{Accept:"application/json"}}).then(function(r){
      return r.json().catch(function(){return {};}).then(function(b){if(!r.ok)throw new Error(b.error||("HTTP "+r.status));return b;});
    });
  }
  function sha256(text){
    return crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)).then(function(buf){
      return Array.prototype.map.call(new Uint8Array(buf),function(b){return b.toString(16).padStart(2,"0");}).join("").toUpperCase();
    });
  }

  function readForm(){
    return {org:form.querySelector("#rp-org").value.trim(),issuers:items(form.querySelector("#rp-issuers").value),
            wallets:items(form.querySelector("#rp-wallets").value),books:items(form.querySelector("#rp-books").value),
            at:form.querySelector("#rp-at").value};
  }
  function check(s){
    if(!s.issuers.length&&!s.wallets.length)return "Name at least one issuing account or one wallet.";
    if(s.issuers.length>LIMITS.issuers)return "At most "+LIMITS.issuers+" issuing accounts.";
    if(s.wallets.length>LIMITS.wallets)return "At most "+LIMITS.wallets+" wallets.";
    if(s.books.length>LIMITS.books)return "At most "+LIMITS.books+" order books.";
    var bad=s.issuers.concat(s.wallets).filter(function(a){return !ADDRESS.test(a);})[0];
    if(bad)return bad+" is not an XRP Ledger classic address.";
    var badBook=s.books.filter(function(b){var p=b.split(".");return p.length!==2||!ADDRESS.test(p[1])||!/^([A-Za-z0-9]{3,20}|[0-9A-Fa-f]{40})$/.test(p[0]);})[0];
    if(badBook)return "Write each order book as CURRENCY.issuer: "+badBook;
    return "";
  }

  /* Each source keeps the exact request and the reply, for the raw file. */
  function issuerSource(issuer){
    var url="/api/authority?issuer="+encodeURIComponent(issuer)+"&walk=1";
    return get(url).catch(function(){url="/api/authority?issuer="+encodeURIComponent(issuer);return get(url);})
      .then(function(reply){return {kind:"issuer",subject:issuer,request:url,reply:reply};},
            function(err){return {kind:"issuer",subject:issuer,request:url,error:err.message};});
  }
  function treasurySource(wallets,at){
    var url="/api/treasury?wallets="+wallets.map(encodeURIComponent).join(",")+(at?"&at="+at:"");
    return get(url).then(function(reply){return {kind:"treasury",subject:wallets.join(","),request:url,reply:reply};},
                         function(err){return {kind:"treasury",subject:wallets.join(","),request:url,error:err.message};});
  }
  function bookSource(book){
    var p=book.split("."), url="/api/book?currency="+encodeURIComponent(currencyCode(p[0]))+"&issuer="+encodeURIComponent(p[1]);
    return get(url).then(function(reply){return {kind:"book",subject:book,request:url,reply:reply};},
                         function(err){return {kind:"book",subject:book,request:url,error:err.message};});
  }

  function unread(src){return '<p class="bad">Could not be read: '+esc(src.error)+'. Nothing in this section is shown as a pass.</p>';}

  function renderIssuer(src){
    var h='<h3>'+esc(src.subject)+'</h3>';
    if(src.error)return h+unread(src);
    var r=src.reply;
    h+='<p class="meta">Ledger '+n(r.ledgerIndex,0)+' · evaluated '+esc(r.evaluatedAt)+' · rules version '+esc(r.rulesVersion)+' · digest <span class="mono">'+esc(r.digest)+'</span></p>';
    h+='<div class="rp-scroll"><table><thead><tr><th>Fact</th><th>Reading</th><th>Detail</th></tr></thead><tbody>';
    (r.checks||[]).forEach(function(c){
      var cls=c.state==="INSUFFICIENT_DATA"?"na":c.passed?"ok":(c.severity==="block"?"bad":"warn");
      var word=c.state==="INSUFFICIENT_DATA"?"Not measured":c.passed?"Holds":"Does not hold";
      h+='<tr><td>'+esc(c.label)+'</td><td class="'+cls+'">'+word+'</td><td>'+esc(c.detail)+'</td></tr>';
    });
    return h+'</tbody></table></div><p class="meta">'+esc(r.disclaimer||"")+'</p>';
  }

  function renderTreasury(src,at){
    if(src.error)return unread(src);
    var r=src.reply, L=r.ledger||{};
    var h='<p class="meta">Ledger '+n(L.index,0)+' · hash <span class="mono">'+esc(L.hash)+'</span> · closed '+esc(L.close_time)+
      (at?' · last ledger to close on or before '+esc(at)+' 23:59:59 UTC':' · latest validated ledger')+' · digest <span class="mono">'+esc(r.digest)+'</span></p>';
    h+='<div class="rp-scroll"><table><thead><tr><th>Wallet</th><th class="num">Balance XRP</th><th class="num">Reserve XRP</th><th class="num">Available XRP</th><th>Who can move it</th></tr></thead><tbody>';
    (r.wallets||[]).forEach(function(w){
      if(!w.found){h+='<tr><td class="mono">'+esc(w.address)+'</td><td colspan="4" class="na">No account at this ledger.</td></tr>';return;}
      var c=w.control||{}, how=c.readable===false?'<span class="na">Not readable: not shown as safe.</span>':esc(c.summary||"");
      if(c.readable!==false){
        how+='<br><span class="meta">Master key '+(c.master_key_enabled?"enabled":"disabled")+(c.regular_key?' · regular key '+esc(c.regular_key):' · no regular key')+
          (c.signer_list?' · signer list quorum '+esc(c.signer_list.quorum)+' of total weight '+esc(c.signer_list.total_weight)+' ('+c.signer_list.signers.length+' signers)':' · no signer list')+'</span>';
      }
      h+='<tr><td class="mono">'+esc(w.address)+'</td><td class="num">'+n(w.balance_xrp,6)+'</td><td class="num">'+n(w.reserve_xrp,6)+'</td><td class="num">'+n(w.available_xrp,6)+'</td><td>'+how+'</td></tr>';
    });
    var t=r.totals||{};
    h+='<tr><th>Total ('+n(t.found,0)+' of '+n(t.wallets,0)+' found)</th><th class="num">'+n(t.balance_xrp,6)+'</th><th></th><th class="num">'+n(t.available_xrp,6)+'</th><th>Fewest keys to move a wallet: '+n(t.fewest_keys_to_move_a_wallet,0)+'</th></tr>';
    h+='</tbody></table></div>';
    if((r.books||[]).length){
      h+='<h3>Selling the holding into the main XRP books</h3><div class="rp-scroll"><table><thead><tr><th>Book</th><th class="num">Funded share of quoted</th><th class="num">Funded capacity (XRP)</th><th class="num">Share of holding sellable</th><th class="num">Average price</th><th>AMM pool (not counted)</th></tr></thead><tbody>';
      r.books.forEach(function(b){
        var s=b.sell||{}, a=b.amm;
        h+='<tr><td>'+esc(b.label)+'</td><td class="num">'+pct(s.funded_share)+'</td><td class="num">'+n(s.capacity_xrp,0)+'</td><td class="num">'+pct(s.share_of_holding_sellable)+'</td><td class="num">'+n(s.average_price,6)+'</td><td>'+
          (a?n(a.xrp,0)+' XRP · '+n(a.asset&&a.asset.value,0)+' '+esc(label(a.asset?a.asset.currency:"")):"No pool")+'</td></tr>';
      });
      h+='</tbody></table></div>';
    }
    return h+'<ul class="meta">'+(r.disclosures||[]).map(function(d){return '<li>'+esc(d)+'</li>';}).join("")+'</ul>';
  }

  function renderBook(src){
    var h='<h3>'+esc(src.subject)+'</h3>';
    if(src.error)return h+unread(src);
    var r=src.reply, cur=esc(r.currency_label||label(r.currency));
    h+='<p class="meta">XRP/'+cur+' · ledger '+n(r.ledger_index,0)+' · read '+esc(r.read_at)+' · '+esc(r.units||"")+'</p>';
    h+='<div class="rp-scroll"><table><thead><tr><th>Side</th><th class="num">Quoted ('+cur+')</th><th class="num">Funded ('+cur+')</th><th class="num">Funded share</th></tr></thead><tbody>';
    ["bid","ask"].forEach(function(side){
      h+='<tr><td>'+(side==="bid"?"Bids (buying XRP)":"Asks (selling XRP into)")+'</td><td class="num">'+n(r.quoted&&r.quoted[side])+'</td><td class="num">'+n(r.fillable&&r.fillable[side])+'</td><td class="num">'+pct(r.fillable_ratio&&r.fillable_ratio[side])+'</td></tr>';
    });
    h+='</tbody></table></div><p class="meta">Reference mid '+n(r.reference&&r.reference.mid,8)+' XRP per '+cur+'. '+(r.disclosures||[]).map(esc).join(" ")+'</p>';
    return h;
  }

  function run(){
    var s=readForm(), problem=check(s);
    if(problem){say(status,problem,"bad");return;}
    say(status,"Reading validated XRP Ledger mainnet…",""); printBtn.disabled=true; rawBtn.disabled=true;
    var jobs=s.issuers.map(issuerSource);
    if(s.wallets.length)jobs.push(treasurySource(s.wallets,s.at));
    s.books.forEach(function(b){jobs.push(bookSource(b));});
    Promise.all(jobs).then(function(sources){
      var generated=new Date().toISOString();
      evidence={report:"NOSHASHI Ledger Evidence Report",prepared_for:s.org||null,generated_at:generated,
        scope:{issuers:s.issuers,wallets:s.wallets,books:s.books,period_end:s.at||null},sources:sources};
      return sha256(JSON.stringify(evidence.sources)).then(function(digest){evidence.sources_sha256=digest;return render(s,sources,generated,digest);});
    }).catch(function(err){say(status,"The report could not be built: "+err.message,"bad");});
  }

  function render(s,sources,generated,digest){
    var issuers=sources.filter(function(x){return x.kind==="issuer";}), treasury=sources.filter(function(x){return x.kind==="treasury";})[0],
        books=sources.filter(function(x){return x.kind==="book";}), failed=sources.filter(function(x){return x.error;}).length, sec=0;
    var h='<p class="eyebrow">NOSHASHI · Ledger Evidence Report</p><h1 style="margin:4px 0 6px">'+(s.org?esc(s.org):"Ledger Evidence Report")+'</h1>'+
      '<p class="meta">Generated '+esc(generated)+' from validated XRP Ledger mainnet. SHA-256 over the raw evidence: <span class="mono">'+esc(digest)+'</span></p>';
    h+='<h2>'+(++sec)+'. Scope</h2><table><tbody>'+
      '<tr><th>Issuing accounts</th><td class="mono">'+(s.issuers.map(esc).join("<br>")||"—")+'</td></tr>'+
      '<tr><th>Treasury wallets</th><td class="mono">'+(s.wallets.map(esc).join("<br>")||"—")+'</td></tr>'+
      '<tr><th>Order books</th><td class="mono">'+(s.books.map(esc).join("<br>")||"—")+'</td></tr>'+
      '<tr><th>Period end</th><td>'+(s.at?esc(s.at)+" (treasury section; issuer and book sections are read at the latest validated ledger)":"None: every section is read at the latest validated ledger")+'</td></tr></tbody></table>';
    if(failed)h+='<p class="bad">'+failed+' of '+sources.length+' readings could not be taken. Those sections say so; read again before relying on this report.</p>';
    if(issuers.length)h+='<h2>'+(++sec)+'. Issuer controls</h2>'+issuers.map(renderIssuer).join("");
    if(treasury)h+='<h2>'+(++sec)+'. Treasury: holdings and who can move them</h2>'+renderTreasury(treasury,s.at);
    if(books.length)h+='<h2>'+(++sec)+'. Order-book depth: quoted against funded</h2>'+books.map(renderBook).join("");
    h+='<h2>'+(++sec)+'. How to re-check this report</h2><p class="meta">Each figure came from one of these public requests to https://www.noshashi.app, which read validated XRP Ledger mainnet. '+
      'The raw evidence file holds every reply exactly as received; its SHA-256 is stated above. A section read at a past period end can be re-read at the same ledger index; one read at the latest ledger shows the ledger index it was read at.</p><ul class="meta">'+
      sources.map(function(x){return '<li class="mono">'+esc(x.request)+'</li>';}).join("")+'</ul>';
    h+='<h2>'+(++sec)+'. Limitations</h2><p class="meta">A record of public ledger facts at the stated ledger indexes. Not an audit opinion, an attestation, a valuation, fair-value guidance under any accounting standard, '+
      'or a legal or compliance determination about any asset or person. Depth counts offers within 10% of each book\\'s reference mid (a chosen parameter) and at most 100 offers per side; AMM pools are shown separately and not added. '+
      'NOSHASHI did not hold, sign for or move any of the accounts named.</p>';
    out.innerHTML=h; out.hidden=false;
    printBtn.disabled=false; rawBtn.disabled=false;
    say(status,failed?"Built, with "+failed+" reading(s) missing.":"Built. Print it to PDF and download the raw evidence to go with it.",failed?"bad":"");
  }

  form.addEventListener("submit",function(e){e.preventDefault();run();});
  printBtn.addEventListener("click",function(){window.print();});
  rawBtn.addEventListener("click",function(){
    if(!evidence)return;
    var blob=new Blob([JSON.stringify(evidence,null,2)],{type:"application/json"}), a=document.createElement("a");
    a.href=URL.createObjectURL(blob); a.download="noshashi-ledger-evidence-"+evidence.generated_at.slice(0,10)+".json";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
  });

  var q=new URLSearchParams(location.search);
  form.querySelector("#rp-org").value=q.get("org")||"";
  form.querySelector("#rp-issuers").value=items(q.get("issuers")).join("\\n");
  form.querySelector("#rp-wallets").value=items(q.get("wallets")).join("\\n");
  form.querySelector("#rp-books").value=items(q.get("books")).join("\\n");
  if(/^\\d{4}-\\d{2}-\\d{2}$/.test(q.get("at")||""))form.querySelector("#rp-at").value=q.get("at");
  if(q.get("issuers")||q.get("wallets"))run();
})();
</script>`;

  await write("evidence-report/build/index.html", renderPage({
    title: "Ledger Evidence Report — builder",
    description: "Builds a Ledger Evidence Report from live XRP Ledger data.",
    path: "/evidence-report/build/",
    head,
    body,
    scripts: script,
  }));
}

export async function buildReport(write) {
  await buildSales(write);
  await buildOrdered(write);
  await buildVerify(write);
  await buildTerms(write);
  await buildBuilder(write);
}

/** The builder and the receipt are noindex and left out. */
export const REPORT_PAGES = [
  ["/evidence-report/", "monthly", "0.8"],
  ["/evidence-report/verify/", "monthly", "0.5"],
  ["/legal/report-terms/", "yearly", "0.3"],
];
