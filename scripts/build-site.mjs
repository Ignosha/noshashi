#!/usr/bin/env node
/*
 * Renders the public site.
 *
 * This is the "server-side rendering" the site runs on, and the choice
 * is deliberate. The alternative — a function rendering every request —
 * buys freshness the moment a feed updates, and pays for it with a page
 * that returns 500 when an upstream RSS host is down. Rendering at
 * deploy time and refreshing in the browser gets the same content into
 * the HTML a crawler receives, with no runtime dependency on anyone
 * else's uptime, and a page that is already complete before a single
 * byte of JavaScript runs.
 *
 * What is rendered here:
 *   - the landing page, from templates/home.html
 *   - /news/, /status/, /progress/, /contact/
 *   - sitemap.xml, from the pages that actually exist
 *
 * Freshness after deploy comes from two places: /api/xrp-news and
 * /api/project-feed, which the pages poll, and the scheduled workflow
 * in .github/workflows/refresh-site.yml, which redeploys so the
 * *rendered* copy stays current for crawlers too.
 *
 * Network failure is never fatal. Every fetch is wrapped, and a failed
 * one renders the honest empty state rather than stopping the build —
 * a deploy that fails because a news site is down would be the tail
 * wagging the dog.
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getNews } from "../api/_lib/news.js";
import { getMarket } from "../api/_lib/market.js";
import { getProjectFeed, deriveStatus } from "../api/_lib/project-feed.js";
import { ENTRIES as KB } from "../api/_lib/kb.js";
import { renderPage, breadcrumb, ORGANIZATION, ORIGIN, MARK } from "../api/_lib/shell.js";
import { renderMisread } from "../api/_lib/misread.js";
import { docsSections } from "../api/_lib/docs.js";
import { esc, isoDate, ago } from "../api/_lib/html.js";
import {
  renderNews, renderNewsHead, renderLog, renderBoard, renderClock,
  renderDownloads, renderVerifyCommand, renderFaq, faqStructuredData,
  renderProgress, renderRail, renderMarket, renderMarketHead, renderMarketFoot, renderSubscribe,
} from "../api/_lib/sections.js";
import { jsonLd } from "../api/_lib/shell.js";
import { externalizeSite } from "./inline-scripts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");

const log = (...args) => console.log("[build]", ...args);

// The documentation's facts, as the code produces them (see src/lib/docs/reference.ts).
const DOCS_REF = JSON.parse(await readFile(path.join(ROOT, "src/lib/docs/reference.json"), "utf8"));

async function write(relative, html) {
  const file = path.join(SITE, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html, "utf8");
  log(`wrote site/${relative} (${(html.length / 1024).toFixed(1)} KB)`);
}

/* The questions worth answering before a download, in that order. */
const FAQ_IDS = ["what", "price", "beta", "account", "unsigned", "custody", "privacy", "billing"];
const FAQ = FAQ_IDS.map((id) => KB.find((e) => e.id === id)).filter(Boolean);

/* ── The landing page ─────────────────────────────────────────────── */
async function buildHome({ news, market, feed, status, release }) {
  let html = await readFile(path.join(ROOT, "templates", "home.html"), "utf8");
  const misread = JSON.parse(await readFile(path.join(ROOT, "src/lib/learn/misread.rendered.json"), "utf8"));

  const slots = {
    ORIGIN: ORIGIN,
    BRANDMARK: MARK,
    VERSION: release ? esc(release.tag) : "beta",
    MARKETHEAD: renderMarketHead(market),
    MARKET: renderMarket(market),
    MARKETFOOT: renderMarketFoot(market),
    NEWSHEAD: renderNewsHead(news),
    NEWS: renderNews(news, { limit: 8 }).replace('class="feed"', 'class="feed bare"'),
    DOWNLOADS: renderDownloads(release),
    VERIFYCMD: renderVerifyCommand(release),
    CLOCK: renderClock(),
    BOARD: renderBoard(status),
    LOG: renderLog(feed.entries, { limit: 5 }),
    FAQ: renderFaq(FAQ),
    SUBSCRIBE: renderSubscribe(),
    MISREAD: renderMisread(misread),
    JSONLD: jsonLd([
      ORGANIZATION,
      {
        "@type": "SoftwareApplication",
        name: "NOSHASHI",
        applicationCategory: "FinanceApplication",
        operatingSystem: "macOS, Windows, Linux",
        softwareVersion: release?.tag || undefined,
        // Stated because it is stated on the page. A release channel
        // that says "stable" in the markup and "beta" in the copy is
        // the kind of mismatch structured data exists to avoid.
        releaseNotes: "https://github.com/Ignosha/noshashi/releases",
        offers: [
          { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
          { "@type": "Offer", name: "Pro", price: "749", priceCurrency: "USD" },
          { "@type": "Offer", name: "Institutional", price: "4000", priceCurrency: "USD" },
          { "@type": "Offer", name: "Enterprise", price: "10000", priceCurrency: "USD" },
          { "@type": "Offer", name: "Strategic Infrastructure", price: "20833", priceCurrency: "USD" },
        ],
        url: `${ORIGIN}/`,
      },
      faqStructuredData(FAQ),
    ]),
  };

  for (const [name, value] of Object.entries(slots)) {
    const token = `<!--SLOT:${name}-->`;
    if (!html.includes(token)) throw new Error(`templates/home.html is missing ${token}`);
    html = html.split(token).join(value);
  }

  const leftover = html.match(/<!--SLOT:[A-Z]+-->/);
  if (leftover) throw new Error(`unfilled slot ${leftover[0]}`);

  await write("index.html", html);
}

/* ── /news/ ───────────────────────────────────────────────────────── */
async function buildNews({ news, market }) {
  const body = `<div class="page-head">
  <p class="eyebrow">XRP live</p>
  <h1>Everything XRP, in one place</h1>
  <p>Price and a week of history, the ledger the network is on right now, and headlines from
     three public feeds — read on the server and merged before this page was sent. Nothing here
     is a NOSHASHI reading: the product's verdicts come from validated ledger state, and neither
     a price nor a headline is evidence.</p>
</div>

<section>
  <div class="console" id="xrp-live">
    ${renderMarketHead(market)}
    ${renderMarket(market)}
    ${renderMarketFoot(market)}
  </div>
</section>

<section>
  <div class="section-head">
    <p class="eyebrow">Headlines</p>
    <h2>What is being written about it</h2>
  </div>
  <div class="console">
    ${renderNewsHead(news)}
    <div class="console-body flush">
      ${renderNews(news, { limit: 24, columns: true }).replace('class="feed cols"', 'class="feed cols bare"')}
    </div>
    <div class="console-foot">
      <span>RENDERED ${esc(isoDate(news.fetchedAt))} ${esc(news.fetchedAt.slice(11, 16))} UTC</span>
      <span>REFRESHES IN THIS TAB · NO ACCOUNT, NO TRACKING</span>
    </div>
  </div>
</section>

<section>
  <div class="section-head">
    <p class="eyebrow">Why this is here</p>
    <h2>Context, kept separate from signal</h2>
  </div>
  <div class="grid g2">
    <div class="panel">
      <h3>News is not a verdict</h3>
      <p>A story about an issuer is not a reading of that issuer's freeze rights, and a rally is
         not liquidity you could exit into. The product answers those from the ledger. This page
         exists so the two are in the same place without ever being the same thing.</p>
    </div>
    <div class="panel">
      <h3>How it is assembled</h3>
      <p>Google News, Cointelegraph's XRP tag and CoinDesk, read server-side. Titles are
         de-duplicated across sources, sorted by publication time, and linked back to the
         publisher. No article text is copied and no source is rewritten.</p>
    </div>
  </div>
</section>`;

  await write("news/index.html", renderPage({
    title: "XRP Live — price, ledger and headlines · NOSHASHI",
    description:
      "Live XRP price with seven days of history, the current validated XRP Ledger, and XRP headlines from Google News, Cointelegraph and CoinDesk — all rendered server-side.",
    path: "/news/",
    current: "news",
    body,
    structured: [breadcrumb("Newsroom", "/news/")],
    scripts: NEWS_REFRESH,
  }));
}

const NEWS_REFRESH = `<script>
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
          var u=/^https?:\\/\\//.test(i.url||"")?i.url:"#";
          return '<article class="feed-item"><span class="feed-meta"><span class="src" translate="no">'+
            esc(i.publisher)+"</span>"+w+'</span><a class="headline" data-i18n-live href="'+esc(u)+
            '" rel="noopener nofollow" target="_blank">'+esc(i.title)+"</a></article>";}).join("");
        if(state){state.textContent="UPDATED "+ago(d.fetchedAt);state.className="reading live";}
      }).catch(function(){});
  }
  document.addEventListener("visibilitychange",function(){if(!document.hidden)load();});
  setTimeout(load,20000);
})();
</script>`;

/* ── /status/ ─────────────────────────────────────────────────────── */
async function buildStatus({ feed, status }) {
  const notice = status.notice
    ? `<div class="download-note" style="margin-bottom:22px">
        <span class="signal" aria-hidden="true"></span>
        <span><strong style="color:var(--ink)">${esc(status.notice.title)}</strong> —
        ${esc(status.notice.body)}</span>
      </div>`
    : "";

  const body = `<div class="page-head">
  <p class="eyebrow">Status &amp; mission log</p>
  <h1>What is running, and what changed</h1>
  <p>The board reports the systems NOSHASHI actually operates. The log below it carries every
     release, maintenance window and incident. A release only appears once CI has produced an
     artifact, so the log is a record of builds rather than a list of announcements.</p>
</div>

${notice}

<section>
  ${renderClock()}
  <div style="margin-top:14px">
    ${renderBoard(status)}
  </div>
  <p class="micro">The desktop application reads public XRPL nodes directly from your machine.
     Nothing on this board can stop it working — an outage here affects this website only.</p>
</section>

<section>
  <div class="section-head">
    <p class="eyebrow">Mission log</p>
    <h2>Newest first</h2>
    <p>${
      feed.partial
        ? "The releases API did not answer when this page was rendered, so shipped releases may be missing from this list. Entries written in the repository are complete."
        : "Repository notices merged with the GitHub releases feed."
    }</p>
  </div>
  <div class="console"><div class="console-body">
    ${renderLog(feed.entries, { limit: 20 })}
  </div></div>
</section>

<section>
  ${renderSubscribe()}
</section>

<section>
  <div class="grid g2">
    <div class="panel">
      <h3>Reporting a problem</h3>
      <p>If something here is wrong, or a build does not do what this site says it does, the
         contact form reaches the people who wrote it. Vulnerabilities go to
         <a style="color:var(--brand)" href="mailto:security@noshashi.app">security@noshashi.app</a>
         first.</p>
    </div>
    <div class="panel">
      <h3>How an entry gets here</h3>
      <p>Releases arrive from the GitHub Releases API. Maintenance and incidents are committed to
         <code>site/data/updates.json</code> and reviewed like any other change. Neither can be
         posted without leaving a trace in the repository.</p>
    </div>
  </div>
</section>`;

  await write("status/index.html", renderPage({
    title: "Status and mission log · NOSHASHI",
    description:
      "Live operational status for noshashi.app, plus the full mission log: every release, maintenance window and incident, with the CI build behind each one.",
    path: "/status/",
    current: "status",
    body,
    structured: [breadcrumb("Status", "/status/")],
  }));
}

/* ── /progress/ ───────────────────────────────────────────────────── */
async function buildProgress({ feed, release, releases }) {
  const shipped = releases.length;
  const rail = renderRail([
    { label: "CURRENT BUILD", value: release?.tag || "—", note: "Beta channel, unsigned, built by CI." },
    { label: "RELEASES SHIPPED", value: String(shipped), note: `Since ${isoDate("2026-08-29T00:00:00Z")}, every one from a public commit.` },
    { label: "TESTS PASSING", value: "272", note: "On the logic that makes claims. Run with npm test." },
    { label: "ACCOUNTS REQUIRED", value: "0", note: "No sign-up exists. Nothing is held server-side." },
  ]);

  /*
   * Percentages are stated as counts, never as a feeling. Each line
   * says what the number counts, and "done" is claimed only where a
   * shipped release is the evidence.
   */
  const lines = [
    {
      title: "Adjudication engine", state: "done", percent: 100, reading: "shipped",
      note: "GO / HOLD / NO-GO against validated ledger state, with the deciding rule and a SHA-256 receipt attached. In every build on the download page.",
    },
    {
      title: "Live mainnet telemetry", state: "done", percent: 100, reading: "shipped",
      note: "Ledger sync across four public nodes, cadence measured from arrival, and the DEX-derived price used on this site's ticker.",
    },
    {
      title: "Free public tools", state: "done", percent: 100, reading: "6 of 6 tools",
      note: "Address, payment, order book, exposure, NFT and node checks, all on the landing page without an account.",
    },
    {
      title: "Public website", state: "done", percent: 100, reading: "server-rendered",
      note: "Newsroom, mission log, progress, status and contact, rendered before they are served so the content is in the HTML rather than assembled afterwards.",
    },
    {
      title: "Release signing and notarisation", state: "open", percent: 25, reading: "in progress",
      note: "Builds are reproducible from CI and hash-verified, but not yet code-signed or notarised. This is the single largest thing standing between the beta channel and a 1.0.",
    },
    {
      title: "Compliance API and webhooks", state: "open", percent: 40, reading: "institutional tier",
      note: "The verification surface exists in the product; the hosted API and webhook delivery are being built out against the institutional tier.",
    },
    {
      title: "Independent security review", state: "open", percent: 0, reading: "not started",
      note: "Stated as not started rather than left off the list. An audit that has not happened is a fact about the project, and hiding it would be the same dishonesty the product exists to argue against.",
    },
  ];

  const body = `<div class="page-head">
  <p class="eyebrow">Progress</p>
  <h1>Where this project actually is</h1>
  <p>Written the way the product reports a verdict: each line says what is counted, and anything
     unfinished says so plainly. Nothing below is aspirational — where it claims something shipped,
     the release on the download page is the evidence.</p>
</div>

<section>
  ${rail}
</section>

<section>
  <div class="section-head">
    <p class="eyebrow">Build state</p>
    <h2>Shipped, in progress, not started</h2>
    <p>Three states, and the third one is the useful one. A roadmap with no "not started" row is
       a brochure.</p>
  </div>
  ${renderProgress(lines)}
</section>

<section>
  <div class="section-head">
    <p class="eyebrow">Recent movement</p>
    <h2>The last few entries in the log</h2>
  </div>
  <div class="console"><div class="console-body">
    ${renderLog(feed.entries, { limit: 8 })}
  </div></div>
  <div class="form-actions" style="margin-top:18px">
    <a class="btn ghost" href="/status/">Full mission log</a>
    <a class="btn ghost" href="/docs/NOSHASHI_Implementation_Timeline.pdf">Implementation timeline (PDF)</a>
    <a class="btn ghost" href="https://github.com/Ignosha/noshashi/releases" rel="noopener">Releases on GitHub</a>
  </div>
</section>

<section>
  <div class="section-head">
    <p class="eyebrow">What "beta" means here</p>
    <h2>The honest version</h2>
  </div>
  <div class="grid g3">
    <div class="panel">
      <h3>What is solid</h3>
      <p>The readings. The engine is deterministic, the tests cover the logic that makes claims,
         and every number on screen came from the ledger or is not shown at all.</p>
    </div>
    <div class="panel">
      <h3>What is not</h3>
      <p>Distribution. Unsigned binaries mean your operating system will warn you, and you are
         relying on a SHA-256 check rather than a signature. That is a real gap, not a formality.</p>
    </div>
    <div class="panel">
      <h3>What that means for you</h3>
      <p>Use it to inform a decision a person is making, verify the hash, and do not make it the
         sole basis of anything carrying legal consequence. That is also true at 1.0.</p>
    </div>
  </div>
</section>`;

  await write("progress/index.html", renderPage({
    title: "Progress — what has shipped and what has not · NOSHASHI",
    description:
      "An honest build state for NOSHASHI: shipped capabilities with the releases that prove them, work in progress, and what has not been started.",
    path: "/progress/",
    current: "progress",
    body,
    structured: [breadcrumb("Progress", "/progress/")],
  }));
}

/* ── /contact/ ────────────────────────────────────────────────────── */
async function buildContact() {
  const body = `<div class="page-head">
  <p class="eyebrow">Contact</p>
  <h1>Ask a person</h1>
  <p>No account, no qualification form, no autoresponder sequence. Say what you are trying to work
     out and you will get a straight answer from somebody who built it.</p>
</div>

<section>
  <div class="grid g2" style="align-items:start">
    <form class="form-grid" id="contact-form" novalidate>
      <div class="form-row">
        <div class="form-field">
          <label for="topic">What is this about</label>
          <select id="topic" name="topic">
            <option value="support">Product support</option>
            <option value="institutions">Institutional or procurement</option>
            <option value="security">Security disclosure</option>
            <option value="privacy">Privacy and data</option>
            <option value="other">Something else</option>
          </select>
        </div>
      </div>

      <div class="form-row split">
        <div class="form-field">
          <label for="name">Your name</label>
          <input id="name" name="name" type="text" autocomplete="name" maxlength="120" required>
        </div>
        <div class="form-field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="email" maxlength="200" required>
        </div>
      </div>

      <div class="form-row split">
        <div class="form-field">
          <label for="org">Organisation <span style="text-transform:none;letter-spacing:0">(optional)</span></label>
          <input id="org" name="org" type="text" autocomplete="organization" maxlength="160">
        </div>
        <div class="form-field">
          <label for="subject">Subject</label>
          <input id="subject" name="subject" type="text" maxlength="160">
        </div>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label for="message">Message</label>
          <textarea id="message" name="message" maxlength="4000" required></textarea>
          <p class="hint">Include the build version and your platform if it is about a download.</p>
        </div>
      </div>

      <!-- Honeypot. Hidden off-screen, labelled for anything that reads
           labels, and never shown to a person. -->
      <div class="form-trap" aria-hidden="true">
        <label for="company_website">Leave this field empty</label>
        <input id="company_website" name="company_website" type="text" tabindex="-1" autocomplete="off">
      </div>

      <div class="form-actions">
        <button class="btn" type="submit" id="contact-send">Send message</button>
        <p class="form-status" id="contact-status" role="status" aria-live="polite"></p>
      </div>
    </form>

    <div style="display:grid;gap:14px">
      <div class="panel">
        <p class="num">DIRECT ROUTES</p>
        <p style="margin-bottom:12px">If you would rather not use a form, these reach the same people.</p>
        <ul class="dl-list" style="list-style:none;display:grid;gap:9px;margin:0;padding:0">
          <li><a style="color:var(--brand)" href="mailto:support@noshashi.app">support@noshashi.app</a> — product support</li>
          <li><a style="color:var(--brand)" href="mailto:institutions@noshashi.app">institutions@noshashi.app</a> — desks and procurement</li>
          <li><a style="color:var(--brand)" href="mailto:security@noshashi.app">security@noshashi.app</a> — vulnerability disclosure</li>
          <li><a style="color:var(--brand)" href="mailto:privacy@noshashi.app">privacy@noshashi.app</a> — data questions</li>
        </ul>
      </div>
      <div class="panel">
        <p class="num">WHAT HAPPENS TO THIS MESSAGE</p>
        <p>It is delivered to the team and nowhere else. There is no database behind this form and
           no analytics on this page, so the message exists in the delivery channel and in your
           sent mail. If delivery is not configured on this deployment the form says so and gives
           you the address instead of pretending to have sent it.</p>
      </div>
      <div class="panel">
        <p class="num">FASTER THAN A FORM</p>
        <p>The support console, bottom right, answers questions about pricing, downloads,
           verification and security posture straight away — and hands anything it cannot answer
           to a person.</p>
      </div>
    </div>
  </div>
</section>`;

  const script = `<script>
(function(){
  var form=document.getElementById("contact-form");
  if(!form)return;
  var status=document.getElementById("contact-status");
  var button=document.getElementById("contact-send");
  var opened=Date.now();

  /* Deep link from the site's CTAs: /contact/?topic=institutions */
  try{
    var wanted=new URLSearchParams(location.search).get("topic");
    var select=document.getElementById("topic");
    if(wanted&&select&&[].some.call(select.options,function(o){return o.value===wanted;})){
      select.value=wanted;
    }
  }catch(e){}

  function say(text,tone){status.textContent=text;status.setAttribute("data-tone",tone||"");}
  function esc(v){return String(v).replace(/[&<>"]/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}

  form.addEventListener("submit",function(event){
    event.preventDefault();
    var data=Object.fromEntries(new FormData(form).entries());
    data.elapsed=Date.now()-opened;

    button.disabled=true;
    say("Sending…","busy");

    fetch("/api/contact",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify(data)})
      .then(function(r){return r.json().then(function(b){return {ok:r.ok,body:b};});})
      .then(function(result){
        if(result.ok){
          form.reset();
          say(result.body.message||"Message sent.","good");
          return;
        }
        /* 503 means nobody has the message. Say that, and hand over the
           address that does work, rather than a generic failure. */
        if(result.body.mailto){
          /* The address is data, so the page translation leaves it be. */
          status.innerHTML=esc(result.body.error)+' Email <a translate="no" href="mailto:'+
            esc(result.body.mailto)+'">'+esc(result.body.mailto)+'</a> instead — that address works.';
          status.setAttribute("data-tone","bad");
          return;
        }
        say(result.body.error||"That did not send.","bad");
      })
      .catch(function(){
        say("Could not reach the server. Email support@noshashi.app instead.","bad");
      })
      .finally(function(){button.disabled=false;});
  });
})();
</script>`;

  await write("contact/index.html", renderPage({
    title: "Contact NOSHASHI — support, institutions, security",
    description:
      "Contact the team behind NOSHASHI: product support, institutional and procurement enquiries, security disclosure and privacy questions.",
    path: "/contact/",
    body,
    structured: [
      breadcrumb("Contact", "/contact/"),
      { "@type": "ContactPage", name: "Contact NOSHASHI", url: `${ORIGIN}/contact/` },
    ],
    scripts: script,
  }));
}

/* ── /certificate/ ────────────────────────────────────────────────── */
/*
 * The free authority certificate.
 *
 * This page is the argument, not a demo of the product. The CLARITY Act
 * turns on whether control over a network is dispersed, and the debate
 * over it runs almost entirely on assertion, because there has been no
 * ordinary way for a non-specialist to check what authority an issuer
 * has actually kept. A staffer, a journalist or a holder can answer
 * that here in one field and no account.
 *
 * It is free on purpose, and the boundary is drawn on purpose too. One
 * issuer per request, nothing stored, nothing watched, nothing
 * exported. Monitoring an issuer over time, keeping the receipts and
 * getting told the moment a flag changes are the product. Establishing
 * a fact that is already public is not something to charge for.
 *
 * Two things this page must never be allowed to imply, and the copy is
 * built around both: it is not a score, and it is not a legal finding.
 */
async function buildCertificate() {
  const body = `<div class="page-head">
  <p class="eyebrow">Free · no account</p>
  <h1>What can the issuer still do to it?</h1>
  <p>Enter an XRP Ledger issuing account. NOSHASHI reads validated ledger state and reports
     the authority that issuer has kept over the asset it issues — whether it can freeze you,
     whether it gave that power up for good, whether one key signs for it, and how
     concentrated the supply is.</p>
</div>

<section>
  <form class="cert-form" id="cert-form" novalidate>
    <div class="form-field">
      <label for="issuer">Issuing account</label>
      <input id="issuer" name="issuer" type="text" spellcheck="false" autocomplete="off"
             placeholder="r…" maxlength="40" required>
    </div>
    <div class="cert-actions">
      <button class="btn" type="submit" id="cert-run">Read the ledger</button>
      <label class="cert-walk">
        <input type="checkbox" id="cert-walk" checked>
        <span>Walk holder lines <em>slower, measures concentration</em></span>
      </label>
    </div>
    <p class="form-status" id="cert-status" role="status" aria-live="polite"></p>
  </form>

  <div id="cert-out" hidden></div>

  <div class="grid g2" style="margin-top:34px">
    <div class="panel">
      <p class="num">WHAT THIS IS NOT</p>
      <p><strong>It is not a score.</strong> There is no number out of a hundred and no grade.
         Seven questions are answered separately and left separate, because a composite invites
         an argument about the composite instead of about the facts underneath it.</p>
      <p style="margin-top:12px"><strong>It is not a legal finding.</strong> Whether a digital
         asset is “decentralised”, or is a security, is a determination for the SEC and the CFTC
         applying statutory criteria. This reports ledger facts that bear on that question. It
         does not answer it, and nothing here should be quoted as though it did.</p>
    </div>
    <div class="panel">
      <p class="num">WHEN IT REFUSES TO ANSWER</p>
      <p>If a read fails, the certificate says so and fails — it never returns a clean result
         because a request timed out. If the holder walk covers less than 95% of outstanding
         supply, no concentration figure is reported at all, high or low, because a share
         measured over two fifths of a supply describes the holders that were seen rather than
         the issuance.</p>
      <p style="margin-top:12px">An abstention is printed as an abstention. It is never
         printed as a pass.</p>
    </div>
  </div>

  <div class="panel" style="margin-top:14px">
    <p class="num">THE DIGEST</p>
    <p>Every certificate carries a SHA-256 digest over the verdict, the issuer, the currency it
       was scoped to, <strong>the ledger index</strong>, <strong>where the holder distribution
       was read from</strong>, <strong>the version of the rule set that decided it</strong>
       and every check with its result. The
       ledger index is inside the digest deliberately: the same issuer at a later ledger is a
       different assertion and does not share this one. Keep the digest and the reading can be
       shown to be the reading that was taken, months later, by anyone holding it.</p>
    <p style="margin-top:12px">The rule-set version is in there because the checks can be
       tightened. Two certificates can carry the same issuer, the same ledger and the same
       results and still be different claims, if the thresholds those results were decided
       against moved between them. Binding the version keeps the older reading readable
       instead of quietly reinterpreted under rules it was never evaluated against.</p>
    <p style="margin-top:12px">The source is in there for the same reason. A distribution read
       from the ledger and one taken from an indexer and reconciled against the ledger's
       obligations are not the same evidence, and a certificate resting on the second must not
       be able to carry the digest of one resting on the first.</p>
  </div>
</section>`;

  const head = `<style>
.cert-form{display:grid;gap:14px;max-width:620px;margin-bottom:26px}
.cert-actions{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.cert-walk{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--muted);cursor:pointer}
.cert-walk em{display:block;font-style:normal;font-size:11px;color:var(--faint)}
.cert-verdict{border:1px solid var(--rule);border-radius:var(--r);padding:22px 24px;margin-bottom:14px}
.cert-verdict .tag{font:10px "IBM Plex Mono",monospace;letter-spacing:.2em;text-transform:uppercase}
.cert-verdict h2{font-size:20px;margin:8px 0 8px;letter-spacing:-.02em;
  font-family:"IBM Plex Mono",monospace;overflow-wrap:anywhere}
.cert-verdict p{color:var(--muted);font-size:13.5px;line-height:1.62;max-width:72ch}
.cert-verdict.go{border-left:3px solid var(--go)} .cert-verdict.go .tag{color:var(--go)}
.cert-verdict.hold{border-left:3px solid var(--hold)} .cert-verdict.hold .tag{color:var(--hold)}
/* Neutral rule, not a status colour: "not established" is a statement
   about the reading, not a finding about the issuer. */
.cert-verdict.unknown{border-left:3px solid var(--muted)} .cert-verdict.unknown .tag{color:var(--muted)}
.cert-verdict.nogo{border-left:3px solid var(--nogo)} .cert-verdict.nogo .tag{color:var(--nogo)}
.cert-meta{font:10.5px "IBM Plex Mono",monospace;color:var(--faint);
  font-variant-numeric:tabular-nums;margin-top:12px;word-break:break-all;line-height:1.7}
.cert-checks{display:grid;gap:1px;background:var(--rule);border:1px solid var(--rule);
  border-radius:var(--r);overflow:hidden}
.cert-check{background:var(--surface);padding:16px 20px;display:grid;
  grid-template-columns:72px 1fr;gap:4px 14px;align-items:start}
.cert-check .mark{font:10px "IBM Plex Mono",monospace;letter-spacing:.14em;padding-top:2px}
.cert-check .mark.pass{color:var(--go)} .cert-check .mark.warn{color:var(--hold)}
.cert-check .mark.block{color:var(--nogo)}
.cert-check h3{font-size:13.5px;margin:0;letter-spacing:-.01em}
.cert-check p{grid-column:2;color:var(--muted);font-size:12.5px;line-height:1.6;margin:0;max-width:78ch}
.cert-check code{grid-column:2;font-size:10px;color:var(--faint);letter-spacing:.1em}
@media(max-width:560px){.cert-check{grid-template-columns:1fr}
  .cert-check p,.cert-check code{grid-column:1}}
</style>`;

  const script = `<script>
(function(){
  var form=document.getElementById("cert-form");
  if(!form)return;
  var status=document.getElementById("cert-status");
  var out=document.getElementById("cert-out");
  var button=document.getElementById("cert-run");
  var walk=document.getElementById("cert-walk");
  var input=document.getElementById("issuer");

  function say(text,tone){status.textContent=text;status.setAttribute("data-tone",tone||"");}
  function esc(v){return String(v).replace(/[&<>"]/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
  /* A finding's label and detail are sentences with data inside them —
     the currency code, an address. The data is marked translate="no" so
     the page translation (site/assets/i18n.js) translates the sentence
     around it and leaves the reading exactly as the ledger gave it. */
  function data(text,cert){
    var out=esc(text).replace(/(^|[^A-Za-z0-9])(r[1-9A-HJ-NP-Za-km-z]{24,34})(?![A-Za-z0-9])/g,
      function(m,pre,a){return pre+'<span translate="no">'+a+'</span>';});
    var cur=cert.currencyLabel&&String(cert.currencyLabel).split(" ")[0];
    if(cur&&/^[A-Za-z0-9]{2,20}$/.test(cur)){
      out=out.replace(new RegExp("(^|[ (])("+cur+")(?=[ .,;)]|$)","g"),
        function(m,pre,c){return pre+'<span translate="no">'+c+'</span>';});
    }
    return out;
  }

  /* Wording mirrors AUTHORITY_VERDICT_COPY in src/lib/desk/authority.ts.
     The console and this page must not describe the same verdict two
     different ways. */
  var COPY={
    "go":{cls:"go",tag:"No unilateral authority found",
      text:"On the checks run, no single party was found able to freeze, gate or unilaterally sign for this issuance at this ledger. This describes the authority observed, not the conduct of whoever holds it."},
    "hold":{cls:"hold",tag:"Authority retained, constrained",
      text:"No single party can act alone, but the issuer has kept powers that bear on a holder — a freeze it has not surrendered, a fee it sets, or a supply too concentrated or too unreadable to call dispersed."},
    "no-go":{cls:"nogo",tag:"Unilateral authority present",
      text:"A single party can act on this issuance without anyone's agreement, or the issuance could not be read well enough to say otherwise. Either way a holder's balance is not solely in the holder's control."},
    "insufficient-data":{cls:"unknown",tag:"Not established",
      text:"A source needed to reach a conclusion could not be read at this ledger, and no blocking finding was established without it. This is a statement about the reading, not about the issuer: it is not a clearance, and it is not an allegation."}
  };

  /* Provenance of the holder distribution. Printed because it is
     inside the digest: a reader recomputing the digest from what is on
     this page needs every field it binds, and because "read from the
     ledger" and "taken from an indexer and reconciled" are not the
     same evidence. */
  var SOURCE_LABEL={
    ledger:'DISTRIBUTION READ FROM LEDGER',
    indexer:'DISTRIBUTION FROM RECONCILED INDEXER',
    none:'DISTRIBUTION NOT READ'
  };

  function render(cert){
    /* An unrecognised verdict falls back to "not established", NEVER to
       no-go. The previous fallback was COPY["no-go"], which meant any
       verdict this page did not know about — including insufficient-data
       the moment it was added — rendered on a PUBLIC page as "unilateral
       authority present" about a real, named issuer. Defaulting an
       unknown to the most damaging reading is the wrong direction to
       fail, and it is a false allegation rather than a display bug. */
    var copy=COPY[cert.verdict]||COPY["insufficient-data"];
    var html='<div class="cert-verdict '+copy.cls+'">'+
      '<p class="tag">'+esc(copy.tag)+'</p>'+
      '<h2 translate="no">'+esc(cert.issuer)+'</h2>'+
      '<p>'+esc(copy.text)+'</p>'+
      '<p class="cert-meta">LEDGER '+esc(String(cert.ledgerIndex))+
        (cert.currencyLabel?' · <span translate="no">'+esc(cert.currencyLabel)+'</span>':'')+
        ' · READ <span translate="no">'+esc(new Date(cert.evaluatedAt).toLocaleString())+'</span>'+
        ' · '+esc(SOURCE_LABEL[cert.source]||'DISTRIBUTION UNSTATED')+
        /* Also inside the digest, so a reader recomputing from this page
           needs it. Printed plainly rather than hidden behind a label:
           it is the difference between two certificates that otherwise
           read identically. */
        (cert.rulesVersion ? ' · RULES v'+esc(String(cert.rulesVersion)) : '')+
        '<br>DIGEST <span translate="no">'+esc(cert.digest)+'</span></p>'+
      '</div><div class="cert-checks">';

    for(var i=0;i<cert.checks.length;i++){
      var c=cert.checks[i];
      /* CLEAR / FINDING, not YES / NO.
         YES-NO was read against the check's own label and inverted it:
         "Freeze permanently surrendered" with the flag NOT set is a
         failed check, and it printed YES — telling a reader the issuer
         had given up a power it had kept. It also had no truthful
         answer for an abstention, where the honest report is that
         nothing was measured, which is neither yes nor no. */
      /* Five states: a check that could not be answered, or does not
         apply, says so rather than borrowing CLEAR or FINDING. */
      var st=c.state==="INSUFFICIENT_DATA"||c.state==="NOT_APPLICABLE"?c.state:null;
      var mark=st?"warn":c.passed?"pass":(c.severity==="block"?"block":"warn");
      var word=st==="INSUFFICIENT_DATA"?"NO ANSWER":st==="NOT_APPLICABLE"?"DOES NOT APPLY":c.passed?"CLEAR":"FINDING";
      html+='<div class="cert-check">'+
        '<span class="mark '+mark+'">'+word+'</span>'+
        '<h3>'+data(c.label,cert)+'</h3>'+
        '<p>'+data(c.detail,cert)+'</p>'+
        '<code>'+esc(c.id)+'</code>'+
      '</div>';
    }

    out.innerHTML=html+'</div>';
    out.hidden=false;
  }

  form.addEventListener("submit",function(event){
    event.preventDefault();
    var issuer=(input.value||"").trim();
    if(!issuer){say("Enter an issuing account.","bad");return;}
    if(!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(issuer)){
      say("That is not an XRP Ledger classic address. They begin with r.","bad");return;
    }

    button.disabled=true;
    out.hidden=true;
    say(walk.checked?"Reading ledger state and walking holder lines…":"Reading ledger state…","busy");

    fetch("/api/authority?issuer="+encodeURIComponent(issuer)+(walk.checked?"&walk=1":""))
      .then(function(r){return r.json().then(function(b){return {ok:r.ok,body:b};});})
      .then(function(result){
        if(!result.ok){say(result.body.error||"That could not be read.","bad");return;}
        say("");
        render(result.body);
      })
      .catch(function(){say("Could not reach the server. Try again shortly.","bad");})
      .finally(function(){button.disabled=false;});
  });

  /* Deep link: /certificate/?issuer=r… runs on load, so a certificate
     can be linked to in an article or a memo rather than described. */
  try{
    var wanted=new URLSearchParams(location.search).get("issuer");
    if(wanted){input.value=wanted;form.requestSubmit?form.requestSubmit():form.dispatchEvent(new Event("submit",{cancelable:true}));}
  }catch(e){}
})();
</script>`;

  await write("certificate/index.html", renderPage({
    title: "Authority certificate — what an XRPL issuer can still do to your asset",
    description:
      "Free, no account. Read from validated XRP Ledger state whether an issuer can freeze you, "
      + "has surrendered that power, requires permission to hold, is controlled by one key, "
      + "charges a transfer fee, and how concentrated its supply is. Not a score, not a legal finding.",
    path: "/certificate/",
    body,
    head,
    structured: [
      breadcrumb("Authority certificate", "/certificate/"),
      {
        "@type": "WebApplication",
        name: "NOSHASHI authority certificate",
        applicationCategory: "FinanceApplication",
        url: `${ORIGIN}/certificate/`,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    ],
    scripts: script,
  }));
}

/* ── /protection/ ─────────────────────────────────────────────────── */
/*
 * Customer Asset Protection: an institution's public page. What a deposit
 * guarantee scheme gives depositors, as ledger facts a customer can check
 * without trusting the institution or NOSHASHI: the reserve accounts and
 * their balances, the protection fund and who can move it, the published
 * liabilities root, and each daily attestation hash-chained to the one
 * before. The latest attestation's digest is recomputed in the reader's
 * browser, and a customer's own inclusion proof is checked there too.
 *
 * The page must never read as insurance. It says so where the status is.
 */
async function buildProtection() {
  const api = "https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1/noshashi-xrpl-watch/protection/";
  const head = `<style>
.prot-form{display:flex;gap:10px;flex-wrap:wrap;max-width:620px;margin-bottom:22px}
.prot-form input{flex:1;min-width:220px}
.prot-status{border:1px solid var(--rule);border-radius:var(--r);padding:20px 22px;margin-bottom:14px}
.prot-status .tag{font:10px "IBM Plex Mono",monospace;letter-spacing:.2em;text-transform:uppercase}
.prot-status h2{font-size:20px;margin:8px 0}
.prot-status.go{border-left:3px solid var(--go)} .prot-status.go .tag{color:var(--go)}
.prot-status.hold{border-left:3px solid var(--hold)} .prot-status.hold .tag{color:var(--hold)}
.prot-status.nogo{border-left:3px solid var(--nogo)} .prot-status.nogo .tag{color:var(--nogo)}
.prot-status.unknown{border-left:3px solid var(--muted)} .prot-status.unknown .tag{color:var(--muted)}
.prot-mono{font:11px "IBM Plex Mono",monospace;color:var(--faint);word-break:break-all;line-height:1.7}
.prot-find{border-top:1px solid var(--rule);padding:10px 0}
.prot-find b{font:10px "IBM Plex Mono",monospace;letter-spacing:.16em;margin-right:8px}
.prot-find .critical{color:var(--nogo)} .prot-find .warn{color:var(--hold)} .prot-find .ok{color:var(--go)} .prot-find .info{color:var(--muted)}
.prot-proof textarea{width:100%;min-height:90px;font:11px "IBM Plex Mono",monospace}
</style>`;
  const body = `<div class="page-head">
  <p class="eyebrow">Customer Asset Protection</p>
  <h1>Is my balance backed?</h1>
  <p>An institution that holds its customers' XRP can prove, from the XRP Ledger, that the balances it owes are
     backed by the accounts it names, that yours is counted, and what it has set aside to make customers whole
     if it fails. NOSHASHI reads the ledger every day and publishes what it finds. Check it here; nothing below
     asks you to trust the institution or NOSHASHI.</p>
</div>

<section>
  <form class="prot-form" id="prot-form" novalidate>
    <input id="prot-slug" type="text" spellcheck="false" autocomplete="off" placeholder="Program name, e.g. acme-custody" maxlength="48" aria-label="Program name">
    <button class="btn" type="submit" id="prot-run">Show the program</button>
  </form>
  <p class="form-status" id="prot-say" role="status" aria-live="polite"></p>
  <div id="prot-out" hidden></div>

  <div class="panel prot-proof" style="margin-top:22px">
    <p class="num">CHECK THAT YOUR BALANCE IS COUNTED</p>
    <p>Your institution sends you one line of its proofs file. Paste it with your customer id. The check runs in
       this browser: your id and balance are not sent anywhere.</p>
    <input id="proof-id" type="text" placeholder="Your customer id, exactly as your institution gave it" style="margin:10px 0;width:100%">
    <textarea id="proof-json" placeholder='{"customer":"…","proof":{"ref":"…","amount":"…","path":[…],"root":{…},"salt":"…"}}'></textarea>
    <p><button class="btn ghost" type="button" id="proof-run">Check my proof</button></p>
    <p class="form-status" id="proof-say" role="status" aria-live="polite"></p>
  </div>

  <div class="grid g2" style="margin-top:14px">
    <div class="panel">
      <p class="num">WHAT THIS IS NOT</p>
      <p><strong>It is not insurance.</strong> NOSHASHI does not guarantee deposits and does not pay claims, and
         no government scheme stands behind a program shown here. It verifies and publishes what is on the ledger:
         what the institution holds, what it owes, and what it has locked away for its customers.</p>
    </div>
    <div class="panel">
      <p class="num">HOW TO READ IT</p>
      <p><strong>Backed</strong> compares the XRP in the named reserve accounts with the total the institution
         published as owed. <strong>Secured</strong> counts only protection-fund XRP no single key can move: locked in
         escrow until a date, or held under a signer list with the master key disabled.</p>
    </div>
  </div>
</section>`;
  const script = `<script>
(function(){
  var API=${JSON.stringify(api)};
  var form=document.getElementById("prot-form"),slug=document.getElementById("prot-slug"),out=document.getElementById("prot-out"),sayEl=document.getElementById("prot-say");
  function say(t,tone){sayEl.textContent=t||"";sayEl.setAttribute("data-tone",tone||"");}
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function xrp(n){return Number(n).toLocaleString("en-US",{maximumFractionDigits:6})+" XRP";}
  function hex(buf){return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,"0");}).join("");}
  function sha(text){return crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)).then(hex);}
  /* The same canonical JSON as supabase/functions/_shared/protection.ts: sorted keys, no whitespace. */
  function canonical(v){
    if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";
    if(v&&typeof v==="object")return "{"+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+":"+canonical(v[k]);}).join(",")+"}";
    return JSON.stringify(v===undefined?null:v);
  }
  var TONE={fully_backed:"go",partially_backed:"hold",under_backed:"nogo",unproven:"unknown"};
  var WORD={fully_backed:"FULLY BACKED",partially_backed:"PARTLY BACKED",under_backed:"UNDER-BACKED",unproven:"NOT PROVEN"};
  function render(b){
    var p=b.program,l=b.latest,r=l&&l.report;
    var html='<div class="prot-status '+(l?TONE[l.status]:"unknown")+'"><span class="tag">'+(l?WORD[l.status]:"NO ATTESTATION YET")+'</span>'+
      '<h2>'+esc(p.name)+(p.institution?' · '+esc(p.institution):'')+'</h2>'+
      (r?'<p>'+xrp(r.reservesXrp)+' in '+p.reserve_addresses.length+' reserve account'+(p.reserve_addresses.length===1?'':'s')+
        (r.liabilitiesXrp!==null?' against '+xrp(r.liabilitiesXrp)+' owed to '+Number(r.customers).toLocaleString("en-US")+' customers':'')+
        (p.fund_addresses.length?'. Protection fund '+xrp(r.fundXrp)+', of which '+xrp(r.fundSecuredXrp)+' no single key can move; limit '+xrp(p.coverage_limit_xrp)+' per customer':'')+'.</p>':'')+
      '<p class="prot-mono">'+(l?'ATTESTED '+esc(l.attested_at)+' · VALIDATED LEDGER '+esc(l.ledger_index)+'<br>DIGEST '+esc(l.digest)+' <span id="prot-digest"></span>':'')+'</p>'+
      '<p class="prot-mono">'+esc(b.not_insurance)+'</p></div>';
    if(b.liabilities)html+='<div class="panel"><p class="num">PUBLISHED LIABILITIES</p><p class="prot-mono">ROOT '+esc(b.liabilities.root)+'<br>TOTAL '+xrp(b.liabilities.total_xrp)+' · '+esc(b.liabilities.customers)+' CUSTOMERS · BALANCES AS OF '+esc(b.liabilities.as_of)+'</p></div>';
    if(r){html+='<div class="panel" style="margin-top:14px"><p class="num">FINDINGS</p>';
      r.findings.forEach(function(f){html+='<div class="prot-find"><b class="'+esc(f.severity)+'">'+esc(f.severity.toUpperCase())+'</b>'+esc(f.title)+'<p>'+esc(f.detail)+'</p></div>';});
      html+='</div>';}
    html+='<div class="panel" style="margin-top:14px"><p class="num">RESERVE AND FUND ACCOUNTS</p><p class="prot-mono">'+
      p.reserve_addresses.map(function(a){return 'RESERVE '+esc(a);}).concat(p.fund_addresses.map(function(a){return 'FUND '+esc(a);})).join("<br>")+'</p></div>';
    if(b.history&&b.history.length){
      var chain=true;for(var i=0;i<b.history.length-1;i++){if(b.history[i].previous_digest!==b.history[i+1].digest)chain=false;}
      html+='<div class="panel" style="margin-top:14px"><p class="num">ATTESTATION HISTORY · '+(chain?'CHAIN INTACT':'CHAIN BROKEN')+'</p><p class="prot-mono">'+
        b.history.map(function(h){return esc(h.attested_at.slice(0,16).replace("T"," "))+' · '+esc(WORD[h.status])+(h.coverage_ratio!==null?' · '+(Number(h.coverage_ratio)*100).toFixed(2)+'%':'')+' · '+esc(h.digest.slice(0,16))+'…';}).join("<br>")+'</p></div>';
    }
    out.innerHTML=html;out.hidden=false;
    if(r)sha(canonical(r)).then(function(d){var el=document.getElementById("prot-digest");if(el)el.textContent=d.toUpperCase()===l.digest?"· RECOMPUTED IN THIS BROWSER: MATCHES":"· RECOMPUTED IN THIS BROWSER: DOES NOT MATCH";});
  }
  function load(name){
    if(!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(name)){say("A program name is lower-case letters, digits and hyphens.","bad");return;}
    say("Reading…","busy");out.hidden=true;
    fetch(API+encodeURIComponent(name)).then(function(r){return r.json().then(function(b){return {ok:r.ok,body:b};});})
      .then(function(x){if(!x.ok){say(x.body.message||"Not found.","bad");return;}say("");render(x.body);})
      .catch(function(){say("Could not reach the server. Try again shortly.","bad");});
  }
  form.addEventListener("submit",function(e){e.preventDefault();load((slug.value||"").trim().toLowerCase());});
  try{var p=new URLSearchParams(location.search).get("p");if(p){slug.value=p;load(p);}}catch(e){}

  /* Inclusion proof: the same hashing as the tree the institution built. */
  var proofSay=document.getElementById("proof-say");
  function psay(t,tone){proofSay.textContent=t;proofSay.setAttribute("data-tone",tone||"");}
  document.getElementById("proof-run").addEventListener("click",function(){
    var line,id=(document.getElementById("proof-id").value||"").trim();
    try{line=JSON.parse(document.getElementById("proof-json").value);}catch(e){psay("That is not the line from your proofs file.","bad");return;}
    var proof=line.proof||line;
    if(!proof||!proof.path||!proof.root||!proof.salt){psay("That line has no proof in it.","bad");return;}
    sha(proof.salt+"|"+id).then(function(ref){
      if(ref!==proof.ref){psay("This proof is not for that customer id.","bad");return null;}
      var node={hash:null,sum:BigInt(proof.amount)};
      return sha("noshashi-pol-leaf-v1|"+proof.ref+"|"+proof.amount).then(function(h){
        node.hash=h;
        var chain=Promise.resolve(node);
        proof.path.forEach(function(step){
          chain=chain.then(function(n){
            var s={hash:step.hash,sum:BigInt(step.sum)};
            if(s.sum<0n)throw new Error("negative");
            var L=step.side==="right"?n:s,R=step.side==="right"?s:n;
            return sha("noshashi-pol-node-v1|"+L.hash+"|"+L.sum+"|"+R.hash+"|"+R.sum).then(function(h){return {hash:h,sum:L.sum+R.sum};});
          });
        });
        return chain;
      });
    }).then(function(root){
      if(!root)return;
      var ok=root.hash===String(proof.root.hash).toLowerCase()&&root.sum.toString()===String(proof.root.sum);
      var published=document.querySelector(".prot-mono")&&out.textContent.indexOf(proof.root.hash)>=0;
      psay(ok?("Your balance of "+(Number(BigInt(proof.amount))/1e6).toLocaleString("en-US")+" XRP is counted in a tree whose root is "+proof.root.hash.slice(0,16)+"…"+(published?", the root this program published.":". Load the program above to compare it with the published root.")):"This proof does not lead to its root: your balance is not counted as stated.",ok?"ok":"bad");
    }).catch(function(){psay("A branch of the proof carries a negative total: debts could be hidden there.","bad");});
  });
})();
</script>`;

  await write("protection/index.html", renderPage({
    title: "Customer Asset Protection — is my balance backed?",
    description:
      "Check, from the XRP Ledger, that an institution's customer balances are backed by the accounts it names, that yours is counted, "
      + "and what it has set aside to make customers whole. Attested daily and hash-chained. Verification, not insurance.",
    path: "/protection/",
    body,
    head,
    structured: [
      breadcrumb("Customer Asset Protection", "/protection/"),
      { "@type": "WebApplication", name: "NOSHASHI Customer Asset Protection", applicationCategory: "FinanceApplication", url: `${ORIGIN}/protection/`, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
    ],
    scripts: script,
  }));
}

/* ── /releases/1-0-14/ ────────────────────────────────────────────── */
/*
 * The 1.0.14 release in plain language, and the goal it serves. Every
 * line restates a CHANGELOG entry; nothing here is promised ahead of the
 * code. The protection features are described as verification, never as
 * insurance, as on /protection/ itself.
 */
async function buildRelease1014() {
  const card = (eyebrow, title, items) =>
    `<div class="panel"><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2><ul class="proof-list">${items.map((i) => `<li>${i}</li>`).join("")}</ul></div>`;
  const body = `<div class="page-head"><p class="eyebrow">RELEASE 1.0.14 · THE GOAL</p><h1>Make XRP safer to hold, and easier to trust.</h1><p>People and institutions holding XRP have no deposit guarantee, few ways to stop a theft in progress and no simple way to check that an exchange really holds what it owes. Release 1.0.14 answers each of those with facts read from validated XRP Ledger state, so nobody has to take anyone's word for it, including ours.</p><p><a class="btn" href="/downloads/noshashi-how-this-helps-xrp.pdf">Read the 6-page brief (PDF)</a> <a class="btn ghost" href="https://github.com/Ignosha/noshashi/releases/tag/v1.0.14" rel="noopener">Download 1.0.14</a></p></div>
<section><div class="section-head"><p class="eyebrow">01 / The goal in three lines</p><h2>What this release is for.</h2></div><div class="grid g3">
<div class="panel"><p class="eyebrow">STOP LOSSES</p><h2>Before and during an attack.</h2><p>Spot a drain as it happens, check a link or an address before you trust it, and get the transactions that save what is left.</p></div>
<div class="panel"><p class="eyebrow">PROVE BACKING</p><h2>Balances you can check.</h2><p>An institution publishes proof that customer XRP is held, and each customer checks their own balance is counted, from the ledger.</p></div>
<div class="panel"><p class="eyebrow">SHARE WHAT IS KNOWN</p><h2>One registry, reviewed.</h2><p>Scam reports backed by transaction evidence, confirmed by a reviewer who did not file them, screen deposits and withdrawals for everyone.</p></div>
</div></section>
<section><div class="section-head"><p class="eyebrow">02 / What is new, by who it helps</p><h2>In the desktop app and the public API.</h2></div><div class="grid g2">
${card("FREE · EVERYONE WHO HOLDS XRP", "Protect your own account.", [
  "<strong>Emergency kit and drainer check:</strong> is the account being drained now, and the ordered, unsigned transactions that save the most. NOSHASHI never signs and never asks for a key.",
  "<strong>Who is this?</strong> Whether an address belongs to an exchange, from a domain that vouches for it or from how it behaves.",
  "<strong>Scam registry and phishing link check:</strong> look up an address or a link seen in ledger memos, with no account.",
  "<strong>Pre-sign check, recover funds, exposure audit, deposit help, domain check</strong> and a graded <strong>account check</strong> in the Security Center.",
])}
${card("INSTITUTIONAL", "Proof of reserves.", [
  "Name the accounts that hold customer XRP and publish one root over customer balances. Only the root, the total and the count leave your machine.",
  "Each customer gets their own inclusion proof.",
  "Reserves are read every day at 06:17 UTC and recorded as an attestation, hash-chained to the one before.",
  "File scam reports with transaction evidence to the shared registry.",
])}
${card("ENTERPRISE", "Customer Asset Protection.", [
  "A protection fund with a per-customer limit. Only XRP locked in escrow, or held under a signer list with the master key disabled, counts as secured.",
  "A public page at <a href=\"/protection/\">/protection/</a> where customers check their own proof and the latest attestation is recomputed in their browser.",
  "<strong>Withdrawal screening:</strong> flags a withdrawal that would bounce, goes to a brand-new or lookalike account, or to one a sanctions listing or scam report touches up to three funding hops back.",
  "<strong>Market surveillance</strong> of the ledger's own order books.",
])}
${card("STRATEGIC", "Watched around the clock.", [
  "A signed <code>protection_alert</code> webhook when reserves fall below published liabilities or the status worsens.",
  "A <code>protection_attested</code> event for every daily attestation.",
  "The phishing link feed, as data for your own systems.",
])}
</div></section>
<section><div class="panel"><p class="eyebrow">03 / Read this before relying on it</p><h2>Verification, not insurance.</h2><p>Customer Asset Protection shows, from the ledger, what an institution holds and has set aside. NOSHASHI pays no claims, and no government scheme stands behind it. A validated XRP Ledger transaction cannot be reversed; these tools help you avoid a loss and document one, not undo it.</p></div></section>
<section><div class="panel"><p class="eyebrow">04 / Go further</p><h2>Where to start.</h2><ul class="proof-list">
<li><a href="/downloads/noshashi-how-this-helps-xrp.pdf">How NOSHASHI helps XRP</a>, the 6-page brief for beginners and investors</li>
<li><a href="/protection/">Check an institution's protection page</a></li>
<li><a href="/learn/#l23">Lesson 23: proving customer balances are backed</a></li>
<li><a href="/pricing/">Which plan includes what</a></li>
<li><a href="https://github.com/Ignosha/noshashi/blob/main/CHANGELOG.md" rel="noopener">The full changelog</a></li>
</ul></div></section>`;

  await write("releases/1-0-14/index.html", renderPage({
    title: "NOSHASHI 1.0.14 — safer to hold, easier to trust",
    description:
      "Release 1.0.14: an emergency kit for drained accounts, a shared scam registry and phishing check, withdrawal screening, "
      + "and Customer Asset Protection — proof, from the XRP Ledger, that customer XRP is backed. Verification, not insurance.",
    path: "/releases/1-0-14/",
    body,
    structured: [breadcrumb("Release 1.0.14", "/releases/1-0-14/")],
  }));
}

/* ── /auth/confirmed/ ─────────────────────────────────────────────── */
/*
 * Where the sign-up confirmation email lands. It used to redirect to the
 * home page, so someone who confirmed their address was never told it had
 * worked or that the next step happens in the desktop app. The page reads
 * only the outcome Supabase puts in the URL, never keeps the session it
 * carries, and strips the fragment at once so the tokens are not left in
 * the address bar or the history.
 */
async function buildAuthConfirmed() {
  const head = `<meta name="robots" content="noindex">
<style>
.conf{max-width:560px;margin:48px auto}
.conf h1{margin-top:6px}
.conf ol{margin:14px 0 0 18px;line-height:1.8}
.conf .bad{border-left:3px solid var(--nogo);padding-left:12px}
</style>`;
  const body = `<section class="conf"><div class="panel" id="conf-ok"><p class="eyebrow">ACCOUNT</p><h1>Your email is confirmed.</h1><p>Your NOSHASHI account is ready. Signing in happens in the desktop app, not on this website.</p><ol><li>Open the NOSHASHI app.</li><li>Go to <strong>Account</strong> and press <strong>Sign in</strong>.</li><li>Use the email and password you just registered.</li></ol><p style="margin-top:16px"><a class="btn" href="/#download">Download NOSHASHI</a> <a class="btn ghost" href="/contact/">Need help?</a></p></div>
<div class="panel bad" id="conf-bad" hidden><p class="eyebrow">ACCOUNT</p><h1>This link did not work.</h1><p id="conf-why">The link has expired or was already used.</p><p>Open the NOSHASHI app, go to <strong>Account</strong>, and sign in. If your address still needs confirming, create the account again or use <strong>Email me a one-time code instead</strong> to get a fresh link.</p><p style="margin-top:16px"><a class="btn ghost" href="/contact/">Contact support</a></p></div></section>`;
  const script = `<script>
(function(){
  var raw=(location.hash||"").replace(/^#/,"")||(location.search||"").replace(/^\\?/,"");
  var q=new URLSearchParams(raw);
  // Drop the tokens from the address bar and history before anything else.
  if(location.hash||location.search){try{history.replaceState(null,"",location.pathname);}catch(e){}}
  var err=q.get("error_description")||q.get("error");
  if(err){
    document.getElementById("conf-ok").hidden=true;
    document.getElementById("conf-bad").hidden=false;
    document.getElementById("conf-why").textContent=err.replace(/\\+/g," ");
  }
})();
</script>`;
  await write("auth/confirmed/index.html", renderPage({
    title: "Email confirmed · NOSHASHI",
    description: "Your NOSHASHI account email is confirmed. Sign in from the desktop app.",
    path: "/auth/confirmed/",
    head,
    body,
    scripts: script,
  }));
}

/* ── institutional product pages ─────────────────────────────────── */
const PRODUCT_PAGES = [
  ["enterprise", "enterprise", "NOSHASHI ENTERPRISE", "Institutional intelligence for the XRP Ledger.", "Evidence-backed intelligence, deterministic policy analysis, monitoring and reviewable adjudication.", `<section class="institutional-proof"><div class="section-head"><p class="eyebrow">01 / Operating evidence</p><h2>Make every decision reviewable.</h2><p>Enterprise brings the same validated-ledger reading used in the public certificate into a governed workflow: the observation, policy result and adjudication remain connected.</p></div><div class="grid g2"><div class="panel"><p class="eyebrow">CONSOLE</p><h2>Operate with evidence.</h2><p>Asset passports, issuer intelligence, liquidity, counterparties, policies, monitoring and audit trails.</p><ul class="proof-list"><li>Evidence attached to each policy result</li><li>Decision history suitable for second-line review</li></ul></div><div class="panel"><p class="eyebrow">PIPELINE</p><h2>Collect → Calculate → Evaluate → Adjudicate</h2><p>Deterministic policy results remain the source of truth, while teams retain the context required to act on them.</p><ul class="proof-list"><li>Validated state before interpretation</li><li>Exportable records for internal controls</li></ul></div></div></section><section><div class="panel"><p class="eyebrow">SALES</p><h2>Talk to institutional sales.</h2><p>Architecture and commercial scope are confirmed before any contracted capability is promised.</p><p><a class="btn" href="mailto:sales@noshashi.app">Contact sales</a> <a class="btn ghost" href="/trust/">Trust &amp; security</a></p></div></section>`],
  ["strategic-infrastructure", "strategic", "NOSHASHI STRATEGIC INFRASTRUCTURE", "Build your institutional XRPL intelligence layer with NOSHASHI.", "Connect validated XRPL data, intelligence, monitoring, evidence and policy infrastructure to your own systems.", `<section class="institutional-proof"><div class="section-head"><p class="eyebrow">01 / Delivery evidence</p><h2>Build on a source you can inspect.</h2><p>Strategic infrastructure connects validated XRPL observations to the systems your institution already governs. Delivery, retention and integration boundaries are explicit rather than implied.</p></div><div class="grid g2"><div class="panel"><p class="eyebrow">DATA</p><h2>Machine-readable intelligence.</h2><p>APIs, event feeds, webhooks, bulk exports and custom schemas.</p><ul class="proof-list"><li>Stable records for downstream controls</li><li>Evidence and timestamps travel with the result</li></ul></div><div class="panel"><p class="eyebrow">CAPACITY</p><h2>Contracted high-volume access.</h2><p>Capacity, retention and delivery are based on deployment requirements and commercial scope.</p><ul class="proof-list"><li>Architecture review before commitment</li><li>Scope documented against the integration</li></ul></div></div></section><section><div class="panel"><p class="eyebrow">REVIEW</p><h2>Request architecture review.</h2><p>We will map data sources, operating boundaries and delivery requirements before proposing a contracted design.</p><p><a class="btn" href="mailto:partnerships@noshashi.app">Build with NOSHASHI</a></p></div></section>`],
  // The verbs are the edge function's own list (reference.json), not a
  // roadmap: an endpoint named here is one that answers today.
  ["developers", "developers", "DEVELOPER PORTAL", "Programmable institutional intelligence.", "Call the same validated-ledger readings and rule evaluation the app runs, from your own systems.", `<div class="panel"><p class="eyebrow">REFERENCE</p><h2>Compliance API verbs</h2><p>One edge function serves every verb: <code>https://&lt;project&gt;.supabase.co/functions/v1/noshashi-verify/&lt;verb&gt;</code>.</p><ul>${DOCS_REF.verbs.map((v) => `<li><code>${esc(v.path)}</code> — ${esc(v.description)}</li>`).join("")}</ul><p>Request and response shapes, authentication, scopes and rate limits: <a href="/docs/api/">API reference</a>. Signed event delivery: <a href="/docs/webhooks/">Webhooks</a>. Everything else: <a href="/docs/">documentation</a>.</p></div>`],
];

async function buildPricingEnhancement() {
  const file = path.join(SITE, "pricing/index.html");
  let html = await readFile(file, "utf8");
  const marker = "<!-- NOSHASHI-TIER-COMPARISON -->";
  // Pricing predates the shared shell, so normalize its inline board before
  // adding the comparison. Keeping this here makes the generated page safe
  // even while the legacy committed page remains the enhancement input.
  html = html
    .replaceAll("#3A82F6", "#9BE15D")
    .replaceAll("#00E0C6", "#55D98A")
    .replaceAll("#35D49A", "#9BE15D")
    .replaceAll("#0B0F14", "#08100B")
    .replaceAll("#11161D", "#0E1911")
    .replaceAll("#1C2330", "#15251A")
    .replaceAll("#E6E8EB", "#E9F5E7")
    .replaceAll("#A3A8B3", "#A7B8A8")
    .replaceAll("#747C8B", "#718473")
    .replaceAll("#2A313C", "#263B2A")
    .replaceAll("#b69cff", "#9BE15D")
    .replace('content="dark"', 'content="dark light"');
  const css = `<style id="noshashi-tier-comparison">
    html[data-theme="light"]{--ground:#F2F8F0;--surface:#FFF;--elevated:#E5F0E2;--ink:#0B160D;--muted:#3F5843;--faint:#66806A;--rule:#C4D7C5;--brand:#247A3B;--tele:#168A55;--on-brand:#FFFFFF;--go:#247A3B}
    .hero::before{content:"";position:absolute;inset:24px -8vw auto auto;width:220px;height:150px;opacity:.28;pointer-events:none;background:radial-gradient(ellipse at 68% 36%,color-mix(in srgb,var(--brand) 42%,transparent) 0 18%,transparent 19%),radial-gradient(ellipse at 42% 65%,color-mix(in srgb,var(--tele) 30%,transparent) 0 15%,transparent 16%),radial-gradient(ellipse at 78% 76%,color-mix(in srgb,var(--brand) 24%,transparent) 0 12%,transparent 13%);border:1px solid color-mix(in srgb,var(--brand) 32%,transparent);border-radius:58% 42% 64% 36%;transform:rotate(-12deg)}
    .price{grid-template-columns:repeat(5,minmax(220px,1fr));overflow-x:auto;padding-bottom:8px}
    .price .tier{min-width:220px}
    .tier.enterprise{border-color:color-mix(in srgb,var(--tele) 55%,var(--rule))}
    .tier.enterprise .name{color:var(--tele)}
    .tier.strategic{border-color:color-mix(in srgb,var(--brand) 55%,var(--rule))}
    .tier.strategic .name{color:var(--brand)}
    .tier-compare{border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);overflow-x:auto;background:color-mix(in srgb,var(--surface) 55%,transparent)}
    .tier-compare table{min-width:1080px;width:100%;border-collapse:collapse;table-layout:fixed}
    .tier-compare th,.tier-compare td{padding:13px 12px;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top;font-size:12px}
    .tier-compare thead th{padding-top:17px;padding-bottom:15px;color:var(--ink);font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.13em;text-transform:uppercase}
    .tier-compare thead th:not(:first-child){border-left:1px solid var(--rule)}
    .tier-compare thead th:first-child{width:23%;color:var(--faint)}
    .tier-compare thead th:nth-child(4){color:var(--tele)}
    .tier-compare thead th:nth-child(5){color:var(--brand)}
    .tier-compare tbody th{color:var(--muted);font-weight:500}
    .tier-compare tbody td{color:var(--ink);border-left:1px solid var(--rule)}
    .tier-compare tbody tr:last-child th,.tier-compare tbody tr:last-child td{border-bottom:0}
    .tier-compare .group th{padding:10px 12px 7px;color:var(--brand);font-family:"IBM Plex Mono",monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;background:color-mix(in srgb,var(--ground) 70%,transparent);border-bottom:1px solid var(--rule)}
    .tier-compare .group th:not(:first-child){border-left:0}
    .tier-compare .yes{color:var(--go);font-family:"IBM Plex Mono",monospace;font-size:10px}
    .tier-compare .contracted{color:var(--tele);font-family:"IBM Plex Mono",monospace;font-size:10px}
    .tier-compare .optional{color:var(--brand);font-family:"IBM Plex Mono",monospace;font-size:10px}
    .tier-compare .limited{color:var(--hold);font-family:"IBM Plex Mono",monospace;font-size:10px}
    .tier-compare .no{color:var(--faint)}
    .tier-compare .soon{color:var(--hold);font-family:"IBM Plex Mono",monospace;font-size:10px}
    .tier-compare caption{caption-side:bottom;padding:12px;color:var(--faint);text-align:left;font-size:11px}
    .tier-compare .tier-price{font-size:13px;font-weight:700;color:var(--ink)}
    .tier-compare .tier-price small{display:block;margin-top:3px;color:var(--faint);font:10px "IBM Plex Mono",monospace;font-weight:400}
    .tier-compare .tier-link{display:inline-flex;margin-top:8px;color:inherit;text-decoration:none;border-bottom:1px solid currentColor;padding-bottom:2px}
    .tier-compare .tier-link:hover{color:var(--tele)}
    @media(max-width:900px){.price{grid-template-columns:1fr;overflow-x:visible}.price .tier{min-width:0}}
    @media(max-width:760px){.tier-compare{margin-right:calc((100vw - var(--shell))/2 * -1);margin-left:calc((100vw - var(--shell))/2 * -1);padding-left:4vw;padding-right:4vw}.tier-compare th,.tier-compare td{padding:12px 10px}}
  </style>`;
  if (!html.includes("id=\"noshashi-tier-comparison\"")) html = html.replace("</style>", `${css}</style>`);
  // Rules added after the committed page first received the block above.
  const soonRule = '.tier-compare .soon{color:var(--hold);font-family:"IBM Plex Mono",monospace;font-size:10px}';
  if (!html.includes(".tier-compare .soon{")) html = html.replace(".tier-compare .no{color:var(--faint)}", `.tier-compare .no{color:var(--faint)}\n    ${soonRule}`);
  // The committed pricing page is also the input to this enhancement. Remove
  // prior generated copies so repeated site builds remain idempotent.
  html = html.replace(/\s*<!-- NOSHASHI-TIER-COMPARISON -->[\s\S]*?(?=\s*<\/main>)/g, "");

  const cards = `<!-- NOSHASHI-TIER-CARDS -->
      <article class="tier enterprise gauge">
        <div class="bezel"><span class="id">04</span><span class="name">ENTERPRISE</span></div>
        <div class="body">
          <p class="fig" data-monthly="$10,000" data-annual="$120,000">$10,000</p>
          <p class="per" data-monthly="per month · $120,000 / year" data-annual="per year · $10,000 / month">per month · $120,000 / year</p>
          <p class="who">Institutional teams operating asset intelligence, policy, evidence and monitoring across risk, compliance and trading.</p>
          <p class="role">Contracted · architecture and commercial review</p>
          <ul class="spec">
            <li>Everything in Institutional</li>
            <li>Deposit screening: partial payments, counterfeit tokens, phishing dust, address poisoning, OFAC-listed senders and three-hop source of funds, before you credit</li>
            <li>Withdrawal screening: bounces, brand-new and hours-old destinations, lookalikes of past destinations, OFAC and the scam registry three hops back, before you sign</li>
            <li>Customer Asset Protection: a protection fund with a per-customer limit, verified on the ledger and published on a page your customers can check (verification, not insurance)</li>
            <li>Market surveillance: re-quoted orders that never fill, concentration and trades between accounts of one funder</li>
            <li>Asset passports and issuer intelligence at institutional scope</li>
            <li>Portfolio monitoring, counterparty and liquidity intelligence</li>
            <li>Deterministic policy engine, adjudication and decision history</li>
            <li>Evidence records, hashes, audit exports and review workflow</li>
            <li>Institutional API, scoped keys and webhooks</li>
            <li>Embeddable screening widget for your own site</li>
            <li>Forensic trace five hops deep, straight into an investigation case</li>
            <li>Scam cluster mapping four hops deep, 200 accounts, opened as a case</li>
            <li>Dedicated environment · coming soon</li>
            <li>Architecture review and named implementation planning</li>
          </ul>
          <div class="act"><a class="ibtn tele" href="/enterprise/">Explore Enterprise</a><p class="terms">Contracted capabilities are confirmed during technical and commercial review.</p></div>
        </div>
      </article>
      <article class="tier strategic gauge">
        <div class="bezel"><span class="id">05</span><span class="name">STRATEGIC INFRASTRUCTURE</span></div>
        <div class="body">
          <p class="fig" data-monthly="$20,833" data-annual="$250,000">$20,833</p>
          <p class="per" data-monthly="per month · $250,000 / year" data-annual="per year · $20,833 / month">per month · $250,000 / year</p>
          <p class="who">Institutions building their own XRPL intelligence layer with NOSHASHI data, events, schemas and integration support.</p>
          <p class="role">Contracted infrastructure · architecture review required</p>
          <ul class="spec">
            <li>Everything in Enterprise</li>
            <li>High-volume API capacity and contracted burst limits</li>
            <li>XRPL event feeds: watched accounts read every minute, signed webhooks, JSON/NDJSON feed and history API</li>
            <li>Custom export schemas, bulk export and event retention you set</li>
            <li>Custom data integrations for risk, custody, trading and compliance</li>
            <li>Dedicated environment · coming soon</li>
            <li>Security Guardian: signed alerts the minute a watched account's keys change or it is deleted, for a theft trail or a whole scam cluster</li>
            <li>Protection alerts: a signed webhook the day reserves fall below customer balances, and the phishing link feed as an API</li>
            <li>Strategic architecture review and integration roadmap</li>
          </ul>
          <div class="act"><a class="ibtn" href="/strategic-infrastructure/">Build with NOSHASHI</a><p class="terms">Capacity, data sources and integration scope are confirmed by contract.</p></div>
        </div>
      </article>`;
  // Remove generated Enterprise/Strategic blocks independently of the
  // surrounding section so repeated builds cannot accumulate duplicates.
  html = html
    .replace(/\s*<!-- NOSHASHI-TIER-CARDS -->/g, "")
    .replace(/\s*<article class="tier enterprise gauge">[\s\S]*?<\/article>/g, "")
    .replace(/\s*<article class="tier strategic gauge">[\s\S]*?<\/article>/g, "");
  html = html.replace(/(<article class="tier inst[\s\S]*?<\/article>)(\s*<\/div>\s*<\/section>)/, (_match, institutional, closing) => `${institutional}${cards}${closing}`);

  let section = `${marker}
  <section id="compare" class="tier-comparison">
    <div class="kicker-block">
      <p class="eyebrow">02 / Comparison</p>
      <h2>Five operating layers. One evidence standard.</h2>
      <p>Every row names the actual entitlement. Included, limited, contracted, optional and unavailable are intentionally different promises.</p>
    </div>
    <div class="tier-compare">
      <table>
        <caption>Commercial, intelligence and infrastructure entitlements. Contracted scope is confirmed during architecture review; no live integration or certification is implied.</caption>
        <thead><tr><th scope="col">Capability</th><th scope="col">Free</th><th scope="col">Pro</th><th scope="col">Institutional</th><th scope="col">Enterprise</th><th scope="col">Strategic Infrastructure</th></tr></thead>
        <tbody>
          <tr class="group"><th scope="rowgroup" colspan="6">Commercial</th></tr>
          <tr><th scope="row">Price</th><td class="tier-price">$0<small>forever</small></td><td class="tier-price">$749<small>/ seat / month · $7,490 / year</small></td><td class="tier-price">$4,000<small>/ month · $40,000 / year</small></td><td class="tier-price">$10,000<small>/ month · $120,000 / year</small></td><td class="tier-price">$20,833<small>/ month · $250,000 / year</small></td></tr>
          <tr><th scope="row">Purchase route</th><td>Download</td><td>Stripe Checkout</td><td>Contact sales</td><td><a class="tier-link" href="/enterprise/">Explore Enterprise ↗</a></td><td><a class="tier-link" href="/strategic-infrastructure/">Build with NOSHASHI ↗</a></td></tr>
          <tr><th scope="row">Commercial status</th><td class="yes">Included</td><td class="yes">Included</td><td class="contracted">Contracted</td><td class="contracted">Contracted</td><td class="contracted">Contracted</td></tr>
          <tr class="group"><th scope="rowgroup" colspan="6">Asset intelligence &amp; controls</th></tr>
          <tr><th scope="row">Asset passports</th><td class="limited">Limited</td><td class="yes">Included</td><td class="yes">Included</td><td class="contracted">Included</td><td class="contracted">Included</td></tr>
          <tr><th scope="row">Issuer controls &amp; freeze-rights</th><td class="limited">Single address</td><td class="yes">Included</td><td class="yes">Included</td><td class="contracted">Included</td><td class="contracted">Included</td></tr>
          <tr><th scope="row">Liquidity &amp; redemption stress</th><td class="no">Unavailable</td><td class="yes">On demand</td><td class="yes">Scheduled</td><td class="contracted">Contracted scope</td><td class="contracted">Contracted scope</td></tr>
          <tr><th scope="row">Counterparty intelligence</th><td class="no">Unavailable</td><td class="yes">Included</td><td class="yes">Included</td><td class="contracted">Included</td><td class="contracted">Included</td></tr>
          <tr class="group"><th scope="rowgroup" colspan="6">Account security &amp; incident response</th></tr>
          <tr><th scope="row">Account security check &amp; hardening plan</th><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td></tr>
          <tr><th scope="row">Safe send (lookalike &amp; sanctions check)</th><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td></tr>
          <tr><th scope="row">Incident response (fund trace, recovery paths, dossier)</th><td class="no">Unavailable</td><td class="yes">2 hops</td><td class="yes">2 hops</td><td class="yes">5 hops + case</td><td class="yes">5 hops + case</td></tr>
          <tr><th scope="row">Security Guardian (takeover alerts)</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="yes">Included</td></tr>
          <tr class="group"><th scope="rowgroup" colspan="6">Recovery &amp; cybersecurity analysis</th></tr>
          <tr><th scope="row">Pre-sign transaction explainer</th><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td></tr>
          <tr><th scope="row">Stuck funds &amp; reserve recovery</th><td class="limited">1 address</td><td class="yes">25 at once</td><td class="yes">500 at once</td><td class="yes">500 at once</td><td class="yes">500 at once</td></tr>
          <tr><th scope="row">Exposure audit (revoke checks, offers, channels, keys)</th><td class="limited">1 address</td><td class="yes">25 at once</td><td class="yes">500 at once</td><td class="yes">500 at once</td><td class="yes">500 at once</td></tr>
          <tr><th scope="row">Wrong-deposit helper &amp; exchange letter</th><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td></tr>
          <tr><th scope="row">Domain impersonation check (xrp-ledger.toml)</th><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td></tr>
          <tr><th scope="row">Forgotten-asset inventory</th><td class="limited">Listed</td><td class="yes">Valued in XRP</td><td class="yes">Valued in XRP</td><td class="yes">Valued in XRP</td><td class="yes">Valued in XRP</td></tr>
          <tr><th scope="row">Personal Guardian (on-device alerts)</th><td class="limited">3 addresses</td><td class="yes">50 addresses</td><td class="yes">50 addresses</td><td class="yes">50 addresses</td><td class="yes">50 + server-side</td></tr>
          <tr><th scope="row">Scam cluster mapper</th><td class="no">Unavailable</td><td class="yes">2 hops, 40 accounts</td><td class="yes">2 hops, 40 accounts</td><td class="yes">4 hops, 200 + case</td><td class="yes">4 hops, 200 + watch</td></tr>
          <tr><th scope="row">Emergency kit &amp; drainer check</th><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td></tr>
          <tr><th scope="row">Exchange attribution (who is this?)</th><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td><td class="yes">Included</td></tr>
          <tr><th scope="row">Phishing link check</th><td class="yes">Lookup</td><td class="yes">Lookup</td><td class="yes">Lookup</td><td class="yes">Lookup</td><td class="yes">Lookup + feed API</td></tr>
          <tr><th scope="row">Shared scam registry</th><td class="limited">Lookup</td><td class="limited">Lookup</td><td class="yes">Lookup + report</td><td class="yes">Lookup + report</td><td class="yes">Lookup + report</td></tr>
          <tr><th scope="row">Withdrawal screening</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="yes">Included</td><td class="yes">Included</td></tr>
          <tr><th scope="row">Market surveillance</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="yes">Included</td><td class="yes">Included</td></tr>
          <tr class="group"><th scope="rowgroup" colspan="6">Customer Asset Protection · verification, not insurance</th></tr>
          <tr><th scope="row">Proof of reserves &amp; customer inclusion proofs</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="yes">Attested daily</td><td class="yes">Attested daily</td><td class="yes">Attested daily</td></tr>
          <tr><th scope="row">Protection fund &amp; public page</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="yes">Included</td><td class="yes">Included</td></tr>
          <tr><th scope="row">Protection alerts (signed webhook)</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="yes">Included</td></tr>
          <tr class="group"><th scope="rowgroup" colspan="6">Policy, adjudication &amp; evidence</th></tr>
          <tr><th scope="row">Policy engine &amp; adjudication</th><td class="limited">Session only</td><td class="yes">10,000 verdicts</td><td class="yes">Unlimited</td><td class="contracted">Contracted scope</td><td class="contracted">Contracted scope</td></tr>
          <tr><th scope="row">Monitoring &amp; alerting</th><td class="no">Unavailable</td><td class="limited">Issuer drift</td><td class="yes">Custom logic</td><td class="contracted">Portfolio monitoring</td><td class="contracted">Event delivery</td></tr>
          <tr><th scope="row">Sanctioned-address screening (OFAC SDN)</th><td class="yes">Address check</td><td class="yes">Address check</td><td class="yes">Address check</td><td class="yes">Deposits &amp; funders</td><td class="yes">Deposits &amp; funders</td></tr>
          <tr><th scope="row">Deposit screening</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="yes">Included</td><td class="yes">Included</td></tr>
          <tr><th scope="row">Evidence &amp; audit export</th><td class="yes">CSV</td><td class="yes">CSV</td><td class="yes">Signed export</td><td class="contracted">Immutable audit</td><td class="contracted">Data delivery</td></tr>
          <tr><th scope="row">Custom schemas</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="optional">Optional</td><td class="optional">Optional</td><td class="contracted">Included in scope</td></tr>
          <tr class="group"><th scope="rowgroup" colspan="6">API &amp; delivery</th></tr>
          <tr><th scope="row">API access</th><td class="no">Unavailable</td><td>5,000 / month</td><td>100,000 / month</td><td class="contracted">Institutional API</td><td class="contracted">High-volume API</td></tr>
          <tr><th scope="row">Webhooks &amp; event feeds</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="yes">Webhooks</td><td class="contracted">Webhooks</td><td class="contracted">Event feeds</td></tr>
          <tr><th scope="row">Embedded / white-label</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="yes">Console &amp; reports</td><td class="yes">Screening widget</td><td class="yes">Screening widget</td></tr>
          <tr><th scope="row">Architecture review</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="optional">Optional</td><td class="yes">Included</td><td class="contracted">Included</td></tr>
          <tr class="group"><th scope="rowgroup" colspan="6">Governance</th></tr>
          <tr><th scope="row">Regulator access</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="yes">Included</td><td class="contracted">Included</td><td class="contracted">Contracted scope</td></tr>
          <tr class="group"><th scope="rowgroup" colspan="6">Coming soon · not offered yet</th></tr>
          <tr><th scope="row">Uptime SLA with service credits</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="soon">Coming soon</td><td class="soon">Coming soon</td><td class="soon">Coming soon</td></tr>
          <tr><th scope="row">Dedicated environment</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="soon">Coming soon</td><td class="soon">Coming soon</td></tr>
          <tr><th scope="row">Single sign-on (SAML / OIDC, SCIM)</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="soon">Coming soon</td><td class="soon">Coming soon</td><td class="soon">Coming soon</td></tr>
        </tbody>
      </table>
    </div>
  </section>`;
  const pricingTranslations = {
    "02 / Comparison": "pricing.comparison.eyebrow",
    "Five operating layers. One evidence standard.": "pricing.comparison.title",
    "Every row names the actual entitlement. Included, limited, contracted, optional and unavailable are intentionally different promises.": "pricing.comparison.body",
    "Commercial, intelligence and infrastructure entitlements. Contracted scope is confirmed during architecture review; no live integration or certification is implied.": "pricing.comparison.caption",
    "ENTERPRISE": "pricing.enterprise.name",
    "STRATEGIC INFRASTRUCTURE": "pricing.strategic.name",
    "Explore Enterprise": "pricing.enterprise.cta",
    "Build with NOSHASHI": "pricing.strategic.cta",
    "Contracted · architecture and commercial review": "pricing.enterprise.role",
    "Contracted infrastructure · architecture review required": "pricing.strategic.role",
    "Institutional teams operating asset intelligence, policy, evidence and monitoring across risk, compliance and trading.": "pricing.enterprise.who",
    "Institutions building their own XRPL intelligence layer with NOSHASHI data, events, schemas and integration support.": "pricing.strategic.who",
    "Everything in Institutional": "pricing.enterprise.institutional",
    "Everything in Enterprise": "pricing.strategic.enterprise",
  };
  for (const [text, key] of Object.entries(pricingTranslations)) {
    section = section.replaceAll(`>${text}<`, `><span data-i18n="${key}">${text}</span><`);
  }
  // The tier names are inside bezel spans and are covered by the replacement
  // above; comparison headings remain deliberately concise UI labels.
  const compareStart = html.indexOf('<section id="compare">');
  const stressStart = html.indexOf('<section id="stress">');
  if (compareStart >= 0 && stressStart > compareStart) html = html.slice(0, compareStart) + section + "\n\n  " + html.slice(stressStart);
  else html = html.replace("</main>", `${section}</main>`);
  html = html.replace(/<!-- NOSHASHI-INSTITUTIONAL-PRICING -->[\s\S]*?<\/section><\/main>/, "</main>");
  html = html.replace("Three tiers, and one of them is not a product", "Five operating layers, and one of them is not a product");
  html = html.replace("The free tier exists so you can check our arithmetic against an address you\n        already know the answer for, before any money changes hands. It is not a\n        starter plan and we do not pretend it scales into one. Pro is the working\n        tool for a desk. Institutional is the contract, the controls and the API.",
    "Free is the proof surface. Pro is the working tool for a desk. Institutional is the contract, controls and API. Enterprise adds operational evidence; Strategic Infrastructure is the contracted data plane for teams building on NOSHASHI.");
  // The pricing page predates the shared shell and never loaded the
  // translation script, so it was the one page with no language switch
  // and nothing translated. It loads it before nav.js like every other page.
  if (!html.includes('src="/assets/i18n.js"')) {
    html = html.replace('<script src="/assets/nav.js" defer></script>',
      '<script src="/assets/i18n.js" defer></script>\n<script src="/assets/nav.js" defer></script>');
  }
  await write("pricing/index.html", html);
}

async function buildProductPage([path, current, eyebrow, title, intro, content]) {
  await write(`${path}/index.html`, renderPage({
    title: `${title} · NOSHASHI`,
    description: intro,
    path: `/${path}/`,
    current,
    body: `<div class="page-head"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${intro}</p></div>${content}`,
    structured: [breadcrumb(eyebrow, `/${path}/`)],
  }));
}

/* ── /misread/ ────────────────────────────────────────────────────── */
/*
 * "The ledger can be transparent and still be misread." Rendered from
 * src/lib/learn/misread.rendered.json, which is the output of
 * misreadCases() — recorded mainnet replies run through the app's own
 * interpreters. A test keeps that file identical to what the code
 * produces, so nothing on this page is written by hand except the frame.
 */
async function buildMisread() {
  const cases = JSON.parse(await readFile(path.join(ROOT, "src/lib/learn/misread.rendered.json"), "utf8"));
  const ref = (c) =>
    /^[0-9A-F]{64}$/.test(c.evidence.ref)
      ? `<a href="https://livenet.xrpl.org/transactions/${esc(c.evidence.ref)}" rel="noopener">${esc(c.evidence.ref.slice(0, 10))}…</a>`
      : `<a href="https://livenet.xrpl.org/accounts/${esc(c.evidence.ref)}" rel="noopener">${esc(c.evidence.ref)}</a>`;
  const rows = cases
    .map(
      (c, i) => `<article class="panel mis-case" id="${esc(c.id)}">
  <p class="eyebrow">${String(i + 1).padStart(2, "0")} / ${esc(c.title)}</p>
  <div class="mis-cols">
    <div class="mis-basic"><p class="mis-k">What a basic interface sees</p><p class="mis-l">${esc(c.basic.label)}</p><p class="mis-v">${esc(c.basic.value)}</p></div>
    <div class="mis-verified"><p class="mis-k">What NOSHASHI verifies</p><p class="mis-l">${esc(c.verified.label)}</p><p class="mis-v">${esc(c.verified.value)}</p></div>
  </div>
  <p>${esc(c.why)}</p>
  <p class="mono mis-src">Ledger ${Number(c.evidence.ledger).toLocaleString("en-US")} · ${esc(c.evidence.refLabel)} ${ref(c)} · <a href="https://github.com/Ignosha/noshashi/blob/main/${esc(c.module)}">${esc(c.module)}</a></p>
</article>`
    )
    .join("\n");

  await write("misread/index.html", renderPage({
    title: "The ledger can be misread · NOSHASHI",
    description: "Six real XRPL mainnet replies read two ways: the obvious field at face value, and what NOSHASHI's own code reports for the same reply.",
    path: "/misread/",
    head: `<style>
.mis-case{margin:0 0 18px}
.mis-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:12px 0}
@media (max-width:720px){.mis-cols{grid-template-columns:1fr}}
.mis-basic,.mis-verified{border-left:2px solid var(--hold);padding:4px 0 4px 12px}
.mis-verified{border-left-color:var(--go)}
.mis-k{font:11px "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--hold)}
.mis-verified .mis-k{color:var(--go)}
.mis-l{font-size:12px;color:var(--faint);margin-top:4px}
.mis-v{font:15px "IBM Plex Mono",monospace;color:var(--ink);margin-top:2px;overflow-wrap:anywhere}
.mis-src{font-size:12px;color:var(--faint);overflow-wrap:anywhere}
</style>`,
    body: `<div class="page-head"><p class="eyebrow">THE LEDGER CAN BE TRANSPARENT AND STILL BE MISREAD</p><h1>Every field is public. Not every reading is right.</h1><p>Six replies read from XRPL mainnet, each shown two ways. The right-hand column is not written for this page: it is what NOSHASHI's own code returns for the recorded reply, and a test fails the build if the two ever disagree.</p></div>
<section>${rows}</section>
<section><div class="panel"><p class="eyebrow">How to check this</p><p>Every case links the transaction or account it was read from, at the ledger it was read at, and the module that makes the reading. Open the same object in the desktop app and it is read again on today's ledger.</p></div></section>`,
    structured: [breadcrumb("The ledger can be misread", "/misread/")],
  }));
}

/* ── /trust/ ──────────────────────────────────────────────────────── */
/*
 * Rendered from src/lib/trust/boundary.json, the same file the desktop
 * app's TRUST & SECURITY scene renders, and whose claims
 * src/lib/trust/__tests__/boundary.test.ts checks against the code. The
 * page adds layout and nothing else: no claim is written here.
 */
async function buildTrust() {
  const t = JSON.parse(await readFile(path.join(ROOT, "src/lib/trust/boundary.json"), "utf8"));
  const stages = t.stages
    .map(
      (s, i) => `<li><details${i === 0 ? " open" : ""}><summary><span class="mono">${String(i + 1).padStart(2, "0")}</span> ${esc(s.label)}<span class="trust-sum">${esc(s.summary)}</span></summary>
        <p>${esc(s.detail)}</p>
        <p class="mono trust-src">Source: ${s.where.map((w) => `<a href="https://github.com/Ignosha/noshashi/tree/main/${esc(w)}">${esc(w)}</a>`).join(" · ")}</p></details></li>`
    )
    .join("\n");
  const bounds = t.boundaries
    .map((b) => `<div class="panel"><p class="eyebrow">${esc(b.label)}</p><h3>${esc(b.claim)}</h3><p>${esc(b.basis)}</p></div>`)
    .join("");
  const flows = t.dataFlows
    .map((f) => `<tr><th scope="row">${esc(f.party)}</th><td>${esc(f.what)}</td><td>${esc(f.why)}</td></tr>`)
    .join("");
  const list = (items) => `<ul class="proof-list">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;

  const content = `
<section><div class="grid g2 trust-bounds">${bounds}</div></section>
<section><div class="section-head"><p class="eyebrow">01 / Data path</p><h2>From the ledger to the receipt.</h2><p>Every verdict follows this path. Open a stage to see what happens there and where it is implemented.</p></div>
  <ol class="trust-path qa">${stages}</ol></section>
<section><div class="section-head"><p class="eyebrow">02 / Ledger commands</p><h2>The only commands NOSHASHI sends.</h2></div>
  <div class="panel"><p class="mono">${t.readCommands.map(esc).join(" · ")}</p><p>Never sent: ${t.forbiddenCommands.map(esc).join(", ")}. A test fails the build if any of them appears in the covered code.</p></div></section>
<section><div class="section-head"><p class="eyebrow">03 / Data</p><h2>Where your data goes.</h2></div>
  <div class="table-scroll"><table class="trust-flows"><thead><tr><th scope="col">Who</th><th scope="col">What</th><th scope="col">Why</th></tr></thead><tbody>${flows}</tbody></table></div></section>
<section><div class="grid g2"><div class="panel"><p class="eyebrow">04 / Human oversight</p>${list(t.oversight)}</div>
  <div class="panel"><p class="eyebrow">05 / What this page does not claim</p>${list(t.limits)}</div></div></section>
<section><div class="panel"><p class="eyebrow">Scope</p><p>${esc(t.scope)}</p><p>Security questions or a disclosure: <a href="/contact/">contact us</a>. Institutional review: <a href="/enterprise/">Enterprise</a>.</p></div></section>`;

  await write("trust/index.html", renderPage({
    title: "Trust & security · NOSHASHI",
    description: "What NOSHASHI reads from the XRP Ledger, what it never does — no keys, no custody, no signing, no broadcast — and where your data goes.",
    path: "/trust/",
    head: `<style>
.trust-path{list-style:none;padding:0;margin:0;display:grid;gap:1px}
.trust-path summary{gap:12px}
.trust-sum{display:block;flex:1;color:var(--faint);font-size:13px;margin-left:8px}
.trust-path details p{padding:0 18px 14px;margin:0}
.trust-src{font-size:12px;color:var(--faint)}
.table-scroll{overflow-x:auto}
.trust-flows{width:100%;border-collapse:collapse;font-size:14px}
.trust-flows th,.trust-flows td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--rule)}
.trust-flows thead th{font:12px "IBM Plex Mono",monospace;color:var(--faint);letter-spacing:.08em;text-transform:uppercase}
</style>`,
    body: `<div class="page-head"><p class="eyebrow">TRUST &amp; SECURITY</p><h1>Read-only by construction.</h1><p>NOSHASHI reads the XRP Ledger and applies your rules. It holds no keys, takes no custody, signs nothing and broadcasts nothing — and the claims on this page are checked against the code by test.</p></div>${content}`,
    structured: [breadcrumb("Trust & security", "/trust/")],
  }));
}

/* ── /docs/ ────────────────────────────────────────────────────────── */
/*
 * Documentation generated from the implementation (§47). The sections and
 * their facts live in api/_lib/docs.js and src/lib/docs/reference.json;
 * this only reads the repository's own documents and writes the pages.
 */
async function buildDocs() {
  const readRepo = (p) => readFile(path.join(ROOT, p), "utf8");
  const [api, webhooks, security, changelog, siteFunctions, migrations] = await Promise.all([
    readRepo("docs/api/COMPLIANCE_API.md"),
    readRepo("docs/api/WEBHOOKS.md"),
    readRepo("SECURITY.md"),
    readRepo("CHANGELOG.md"),
    readdir(path.join(ROOT, "api")).then((names) => names.filter((n) => n.endsWith(".js")).map((n) => n.replace(/\.js$/, "")).sort()),
    readdir(path.join(ROOT, "supabase/migrations")).then((names) => names.filter((n) => n.endsWith(".sql"))),
  ]);
  const sections = docsSections(DOCS_REF, { api, webhooks, security, changelog }, { siteFunctions, migrations });
  const head = `<style>
.docs{display:grid;grid-template-columns:220px minmax(0,1fr);gap:40px;align-items:start}
.docs-nav{position:sticky;top:88px;display:grid;gap:2px;font-size:14px}
.docs-nav a{padding:6px 10px;border-left:2px solid var(--rule);color:var(--muted);text-decoration:none}
.docs-nav a[aria-current="page"]{border-left-color:var(--accent,currentColor);color:var(--ink)}
.doc-body{min-width:0;max-width:820px}
.doc-body h2{margin-top:36px}
.doc-body pre{overflow-x:auto;padding:14px;border:1px solid var(--rule);font-size:13px}
.table-scroll{overflow-x:auto}
.doc-table{width:100%;border-collapse:collapse;font-size:14px;margin:12px 0}
.doc-table th,.doc-table td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--rule)}
.doc-table thead th{font:12px "IBM Plex Mono",monospace;color:var(--faint);letter-spacing:.06em;text-transform:uppercase}
.doc-src,.doc-where{font-size:12px;color:var(--faint)}
.doc-steps li{margin-bottom:10px}
.docs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.docs-grid a{display:block;padding:16px;border:1px solid var(--rule);text-decoration:none;color:inherit}
.docs-grid a:hover{border-color:var(--ink)}
@media (max-width:860px){.docs{grid-template-columns:1fr}.docs-nav{position:static;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}}
</style>`;
  const nav = (current) =>
    `<nav class="docs-nav" aria-label="Documentation">${sections
      .map((s) => `<a href="/docs/${s.slug}/"${s.slug === current ? ' aria-current="page"' : ""}>${esc(s.title)}</a>`)
      .join("")}</nav>`;

  await write("docs/index.html", renderPage({
    title: "Documentation · NOSHASHI",
    description: "NOSHASHI documentation, generated from the implementation: architecture, XRPL data, analysis engines, AI, policies, evidence, receipts, API, webhooks, security, enterprise, troubleshooting and release notes.",
    path: "/docs/",
    head,
    body: `<div class="page-head"><p class="eyebrow">DOCUMENTATION</p><h1>How NOSHASHI works, from the code.</h1><p>Every rule, verb, event, role and screen listed in these pages is read from the implementation when the site is built, and a test fails when the two disagree.</p></div>
<section><div class="docs-grid">${sections.map((s) => `<a href="/docs/${s.slug}/"><p class="eyebrow">${esc(s.title)}</p><p>${esc(s.intro)}</p></a>`).join("")}</div></section>`,
    structured: [breadcrumb("Documentation", "/docs/")],
  }));

  for (const section of sections) {
    await write(`docs/${section.slug}/index.html`, renderPage({
      title: `${section.title} · NOSHASHI docs`,
      description: section.intro,
      path: `/docs/${section.slug}/`,
      head,
      body: `<div class="page-head"><p class="eyebrow"><a href="/docs/">DOCUMENTATION</a></p><h1>${esc(section.title)}</h1><p>${esc(section.intro)}</p></div>
<section class="docs">${nav(section.slug)}<article class="doc-body">${section.body}
<p class="doc-src mono">Generated from ${section.sources.map((p) => `<a href="https://github.com/Ignosha/noshashi/tree/main/${esc(p)}">${esc(p)}</a>`).join(" · ")}</p></article></section>`,
      structured: [breadcrumb(section.title, `/docs/${section.slug}/`)],
    }));
  }
  return sections;
}

/* ── sitemap ──────────────────────────────────────────────────────── */
async function buildSitemap(docs = []) {
  const pages = [
    ["/", "daily", "1.0"],
    ["/news/", "hourly", "0.9"],
    // High priority deliberately: this is the page the product is
    // argued from, and the only one that answers a question for
    // somebody who will never install anything.
    ["/certificate/", "weekly", "0.9"],
    ["/protection/", "weekly", "0.8"],
    ["/releases/1-0-14/", "monthly", "0.7"],
    ["/pricing/", "monthly", "0.9"],
    ["/enterprise/", "monthly", "0.9"],
    ["/trust/", "monthly", "0.8"],
    ["/misread/", "monthly", "0.8"],
    ["/strategic-infrastructure/", "monthly", "0.9"],
    ["/developers/", "monthly", "0.8"],
    ["/docs/", "monthly", "0.8"],
    ...docs.map((s) => [`/docs/${s.slug}/`, "monthly", "0.6"]),
    ["/progress/", "weekly", "0.8"],
    ["/status/", "daily", "0.8"],
    ["/learn/", "monthly", "0.9"],
    ["/guide/", "monthly", "0.8"],
    ["/research/", "monthly", "0.8"],
    ["/contact/", "monthly", "0.7"],
    ["/legal/", "monthly", "0.5"],
    ["/downloads/xrpl-edge-pack/", "monthly", "0.5"],
    ["/docs/NOSHASHI_XRPL_Edge_Lab_Brief.pdf", "monthly", "0.4"],
  ];
  const today = isoDate(new Date());
  const urls = pages
    .map(
      ([loc, freq, priority]) =>
        `  <url><loc>${ORIGIN}${loc}</loc><lastmod>${today}</lastmod>` +
        `<changefreq>${freq}</changefreq><priority>${priority}</priority></url>`
    )
    .join("\n");
  await write(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );
}

/*
 * robots.txt is generated for one reason: it names the sitemap by
 * absolute URL, and a sitemap URL on a host that redirects is the same
 * mismatch the canonical tags had. Generating it keeps the two in step.
 */
async function buildRobots() {
  await write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
}

/* ── run ──────────────────────────────────────────────────────────── */
async function main() {
  log("fetching live sources…");

  const [news, market, feed] = await Promise.all([
    getNews({ limit: 24 }).catch((error) => {
      log("news fetch failed:", error.message);
      return { items: [], sources: [], live: false, fetchedAt: new Date().toISOString() };
    }),
    getMarket().catch((error) => {
      log("market fetch failed:", error.message);
      return { spot: null, series: null, ledger: null, live: false,
               sources: { spot: false, series: false, ledger: false },
               fetchedAt: new Date().toISOString() };
    }),
    getProjectFeed({ limit: 24, root: ROOT }).catch((error) => {
      log("project feed failed:", error.message);
      return { entries: [], latestRelease: null, partial: true, fetchedAt: new Date().toISOString() };
    }),
  ]);

  const status = deriveStatus(feed.entries);
  const release = feed.latestRelease;
  const releases = feed.entries.filter((e) => e.kind === "release");

  log(
    `news: ${news.items.length} items from ${news.sources.filter((s) => s.ok).length}/${news.sources.length} sources`
  );
  log(`release: ${release ? release.tag : "unavailable"} · log entries: ${feed.entries.length}`);
  log(`status: ${status.overallWord}`);
  log(
    `market: ${market.live ? "live" : "unavailable"} · ` +
      `spot=${market.sources.spot} history=${market.sources.series} ledger=${market.sources.ledger}`
  );

  if (!release) {
    // Loud, because the download section is the page's main action and
    // it will render the fallback. Not fatal: a deploy blocked by
    // GitHub's rate limit would be worse than a page that links out.
    log("WARNING: no release metadata — the download section will link to GitHub instead.");
  }

  await buildHome({ news, market, feed, status, release });
  await buildNews({ news, market });
  await buildStatus({ feed, status });
  await buildProgress({ feed, release, releases });
  await buildContact();
  await buildCertificate();
  await buildProtection();
  await buildRelease1014();
  await buildAuthConfirmed();
  await buildPricingEnhancement();
  for (const page of PRODUCT_PAGES) await buildProductPage(page);
  await buildTrust();
  await buildMisread();
  const docs = await buildDocs();
  await buildSitemap(docs);
  await buildRobots();
  // Last: every page, generated or committed, loses its inline scripts so
  // the CSP can be script-src 'self' (scripts/inline-scripts.mjs).
  const inline = await externalizeSite(SITE);
  log(`inline scripts: ${inline.files} files for ${inline.pages} pages (${inline.removed} unused removed)`);

  log(`canonical origin: ${ORIGIN}`);
  log("done.");
}

main().catch((error) => {
  console.error("[build] FAILED:", error);
  process.exit(1);
});
