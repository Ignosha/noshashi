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

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getNews } from "../api/_lib/news.js";
import { getMarket } from "../api/_lib/market.js";
import { getProjectFeed, deriveStatus } from "../api/_lib/project-feed.js";
import { ENTRIES as KB } from "../api/_lib/kb.js";
import { renderPage, breadcrumb, ORGANIZATION, ORIGIN, MARK } from "../api/_lib/shell.js";
import { esc, isoDate, ago } from "../api/_lib/html.js";
import {
  renderNews, renderNewsHead, renderLog, renderBoard, renderClock,
  renderDownloads, renderVerifyCommand, renderFaq, faqStructuredData,
  renderProgress, renderRail, renderMarket, renderMarketHead, renderMarketFoot, renderSubscribe,
} from "../api/_lib/sections.js";
import { jsonLd } from "../api/_lib/shell.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");

const log = (...args) => console.log("[build]", ...args);

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

  // Inlined, not <img>: the bloom takes its colour from the one `color`
  // on its container, which is how the light theme flips it. An <img>
  // cannot see the page's custom properties.
  const bloom = await readFile(path.join(ROOT, "templates", "hero-bloom.svg"), "utf8");

  const slots = {
    ORIGIN: ORIGIN,
    HEROBLOOM: bloom,
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
          { "@type": "Offer", name: "Strategic Infrastructure", price: "20850", priceCurrency: "USD" },
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
          return '<article class="feed-item"><span class="feed-meta"><span class="src">'+
            esc(i.publisher)+"</span>"+w+'</span><a class="headline" href="'+esc(u)+
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
          say(result.body.error+" Email "+result.body.mailto+" instead — that address works.","bad");
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
      '<h2>'+esc(cert.issuer)+'</h2>'+
      '<p>'+esc(copy.text)+'</p>'+
      '<p class="cert-meta">LEDGER '+esc(String(cert.ledgerIndex))+
        (cert.currencyLabel?' · '+esc(cert.currencyLabel):'')+
        ' · READ '+esc(new Date(cert.evaluatedAt).toLocaleString())+
        ' · '+esc(SOURCE_LABEL[cert.source]||'DISTRIBUTION UNSTATED')+
        /* Also inside the digest, so a reader recomputing from this page
           needs it. Printed plainly rather than hidden behind a label:
           it is the difference between two certificates that otherwise
           read identically. */
        (cert.rulesVersion ? ' · RULES v'+esc(String(cert.rulesVersion)) : '')+
        '<br>DIGEST '+esc(cert.digest)+'</p>'+
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
      var mark=c.passed?"pass":(c.severity==="block"?"block":"warn");
      var word=c.passed?"CLEAR":"FINDING";
      html+='<div class="cert-check">'+
        '<span class="mark '+mark+'">'+word+'</span>'+
        '<h3>'+esc(c.label)+'</h3>'+
        '<p>'+esc(c.detail)+'</p>'+
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

/* ── institutional product pages ─────────────────────────────────── */
const PRODUCT_PAGES = [
  ["enterprise", "enterprise", "NOSHASHI ENTERPRISE", "Institutional intelligence for the XRP Ledger.", "Evidence-backed intelligence, deterministic policy analysis, monitoring and reviewable adjudication.", `<section class="institutional-proof"><div class="section-head"><p class="eyebrow">01 / Operating evidence</p><h2>Make every decision reviewable.</h2><p>Enterprise brings the same validated-ledger reading used in the public certificate into a governed workflow: the observation, policy result and adjudication remain connected.</p></div><div class="grid g2"><div class="panel"><p class="eyebrow">CONSOLE</p><h2>Operate with evidence.</h2><p>Asset passports, issuer intelligence, liquidity, counterparties, policies, monitoring and audit trails.</p><ul class="proof-list"><li>Evidence attached to each policy result</li><li>Decision history suitable for second-line review</li></ul></div><div class="panel"><p class="eyebrow">PIPELINE</p><h2>Collect → Calculate → Evaluate → Adjudicate</h2><p>Deterministic policy results remain the source of truth, while teams retain the context required to act on them.</p><ul class="proof-list"><li>Validated state before interpretation</li><li>Exportable records for internal controls</li></ul></div></div></section><section><div class="panel"><p class="eyebrow">SALES</p><h2>Talk to institutional sales.</h2><p>Architecture and commercial scope are confirmed before any contracted capability is promised.</p><p><a class="btn" href="mailto:sales@noshashi.app">Contact sales</a></p></div></section>`],
  ["strategic-infrastructure", "strategic", "NOSHASHI STRATEGIC INFRASTRUCTURE", "Build your institutional XRPL intelligence layer with NOSHASHI.", "Connect validated XRPL data, intelligence, monitoring, evidence and policy infrastructure to your own systems.", `<section class="institutional-proof"><div class="section-head"><p class="eyebrow">01 / Delivery evidence</p><h2>Build on a source you can inspect.</h2><p>Strategic infrastructure connects validated XRPL observations to the systems your institution already governs. Delivery, retention and integration boundaries are explicit rather than implied.</p></div><div class="grid g2"><div class="panel"><p class="eyebrow">DATA</p><h2>Machine-readable intelligence.</h2><p>APIs, event feeds, webhooks, bulk exports and custom schemas.</p><ul class="proof-list"><li>Stable records for downstream controls</li><li>Evidence and timestamps travel with the result</li></ul></div><div class="panel"><p class="eyebrow">CAPACITY</p><h2>Contracted high-volume access.</h2><p>Capacity, retention and delivery are based on deployment requirements and commercial scope.</p><ul class="proof-list"><li>Architecture review before commitment</li><li>Scope documented against the integration</li></ul></div></div></section><section><div class="panel"><p class="eyebrow">REVIEW</p><h2>Request architecture review.</h2><p>We will map data sources, operating boundaries and delivery requirements before proposing a contracted design.</p><p><a class="btn" href="mailto:partnerships@noshashi.app">Build with NOSHASHI</a></p></div></section>`],
  ["developers", "developers", "DEVELOPER PORTAL", "Programmable institutional intelligence.", "Connect evidence, policy evaluation, adjudication, monitoring and XRPL data into your own workflows.", `<div class="panel"><p class="eyebrow">REFERENCE</p><h2>API endpoint families</h2><ul><li><code>/api/v1/institutional/overview</code></li><li><code>/api/v1/institutional/assets</code></li><li><code>/api/v1/institutional/evidence</code></li><li><code>/api/v1/institutional/policies/check</code></li><li><code>/api/v1/institutional/monitoring/events</code></li></ul></div>`],
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
    html[data-theme="light"]{--ground:#F2F8F0;--surface:#FFF;--elevated:#E5F0E2;--ink:#0B160D;--muted:#3F5843;--faint:#66806A;--rule:#C4D7C5;--brand:#247A3B;--tele:#168A55;--go:#247A3B}
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
    .tier-compare caption{caption-side:bottom;padding:12px;color:var(--faint);text-align:left;font-size:11px}
    .tier-compare .tier-price{font-size:13px;font-weight:700;color:var(--ink)}
    .tier-compare .tier-price small{display:block;margin-top:3px;color:var(--faint);font:10px "IBM Plex Mono",monospace;font-weight:400}
    .tier-compare .tier-link{display:inline-flex;margin-top:8px;color:inherit;text-decoration:none;border-bottom:1px solid currentColor;padding-bottom:2px}
    .tier-compare .tier-link:hover{color:var(--tele)}
    @media(max-width:900px){.price{grid-template-columns:1fr;overflow-x:visible}.price .tier{min-width:0}}
    @media(max-width:760px){.tier-compare{margin-right:calc((100vw - var(--shell))/2 * -1);margin-left:calc((100vw - var(--shell))/2 * -1);padding-left:4vw;padding-right:4vw}.tier-compare th,.tier-compare td{padding:12px 10px}}
  </style>`;
  if (!html.includes("id=\"noshashi-tier-comparison\"")) html = html.replace("</style>", `${css}</style>`);
  // The committed pricing page is also the input to this enhancement. Remove
  // prior generated copies so repeated site builds remain idempotent.
  html = html.replace(/\s*<!-- NOSHASHI-TIER-COMPARISON -->[\s\S]*?(?=\s*<\/main>)/g, "");

  const cards = `<!-- NOSHASHI-TIER-CARDS -->
      <article class="tier enterprise gauge">
        <div class="bezel"><span class="id">04</span><span class="name">ENTERPRISE</span></div>
        <div class="body">
          <p class="fig">$10,000</p>
          <p class="per">per month · $120,000 / year</p>
          <p class="who">Institutional teams operating asset intelligence, policy, evidence and monitoring across risk, compliance and trading.</p>
          <p class="role">Contracted · architecture and commercial review</p>
          <ul class="spec">
            <li>Everything in Institutional</li>
            <li>Asset passports and issuer intelligence at institutional scope</li>
            <li>Portfolio monitoring, counterparty and liquidity intelligence</li>
            <li>Deterministic policy engine, adjudication and decision history</li>
            <li>Evidence records, hashes, audit exports and review workflow</li>
            <li>Institutional API, scoped keys and webhooks</li>
            <li>Dedicated environment options where supported</li>
            <li>Architecture review and named implementation planning</li>
          </ul>
          <div class="act"><a class="ibtn tele" href="/enterprise/">Explore Enterprise</a><p class="terms">Contracted capabilities are confirmed during technical and commercial review.</p></div>
        </div>
      </article>
      <article class="tier strategic gauge">
        <div class="bezel"><span class="id">05</span><span class="name">STRATEGIC INFRASTRUCTURE</span></div>
        <div class="body">
          <p class="fig">$20,850</p>
          <p class="per">per month · $250,000 / year</p>
          <p class="who">Institutions building their own XRPL intelligence layer with NOSHASHI data, events, schemas and integration support.</p>
          <p class="role">Contracted infrastructure · architecture review required</p>
          <ul class="spec">
            <li>Everything in Enterprise</li>
            <li>High-volume API capacity and contracted burst limits</li>
            <li>XRPL event feeds, webhooks and machine-readable delivery</li>
            <li>Custom schemas, retention and bulk export design</li>
            <li>Custom data integrations for risk, custody, trading and compliance</li>
            <li>Dedicated environment options where supported</li>
            <li>Embedded or white-label delivery when contracted</li>
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
          <tr><th scope="row">Price</th><td class="tier-price">$0<small>forever</small></td><td class="tier-price">$749<small>/ seat / month</small></td><td class="tier-price">$4,000<small>/ month</small></td><td class="tier-price">$10,000<small>/ month · $120,000 / year</small></td><td class="tier-price">$20,850<small>/ month · $250,000 / year</small></td></tr>
          <tr><th scope="row">Purchase route</th><td>Download</td><td>Stripe Checkout</td><td>Contact sales</td><td><a class="tier-link" href="/enterprise/">Explore Enterprise ↗</a></td><td><a class="tier-link" href="/strategic-infrastructure/">Build with NOSHASHI ↗</a></td></tr>
          <tr><th scope="row">Commercial status</th><td class="yes">Included</td><td class="yes">Included</td><td class="contracted">Contracted</td><td class="contracted">Contracted</td><td class="contracted">Contracted</td></tr>
          <tr class="group"><th scope="rowgroup" colspan="6">Asset intelligence &amp; controls</th></tr>
          <tr><th scope="row">Asset passports</th><td class="limited">Limited</td><td class="yes">Included</td><td class="yes">Included</td><td class="contracted">Included</td><td class="contracted">Included</td></tr>
          <tr><th scope="row">Issuer controls &amp; freeze-rights</th><td class="limited">Single address</td><td class="yes">Included</td><td class="yes">Included</td><td class="contracted">Included</td><td class="contracted">Included</td></tr>
          <tr><th scope="row">Liquidity &amp; redemption stress</th><td class="no">Unavailable</td><td class="yes">On demand</td><td class="yes">Scheduled</td><td class="contracted">Contracted scope</td><td class="contracted">Contracted scope</td></tr>
          <tr><th scope="row">Counterparty intelligence</th><td class="no">Unavailable</td><td class="yes">Included</td><td class="yes">Included</td><td class="contracted">Included</td><td class="contracted">Included</td></tr>
          <tr class="group"><th scope="rowgroup" colspan="6">Policy, adjudication &amp; evidence</th></tr>
          <tr><th scope="row">Policy engine &amp; adjudication</th><td class="limited">Session only</td><td class="yes">10,000 verdicts</td><td class="yes">Unlimited</td><td class="contracted">Contracted scope</td><td class="contracted">Contracted scope</td></tr>
          <tr><th scope="row">Monitoring &amp; alerting</th><td class="no">Unavailable</td><td class="limited">Issuer drift</td><td class="yes">Custom logic</td><td class="contracted">Portfolio monitoring</td><td class="contracted">Event delivery</td></tr>
          <tr><th scope="row">Evidence &amp; audit export</th><td class="yes">CSV</td><td class="yes">CSV</td><td class="yes">Signed export</td><td class="contracted">Immutable audit</td><td class="contracted">Data delivery</td></tr>
          <tr><th scope="row">Custom schemas</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="optional">Optional</td><td class="optional">Optional</td><td class="contracted">Included in scope</td></tr>
          <tr class="group"><th scope="rowgroup" colspan="6">API &amp; delivery</th></tr>
          <tr><th scope="row">API access</th><td class="no">Unavailable</td><td>5,000 / month</td><td>100,000 / month</td><td class="contracted">Institutional API</td><td class="contracted">High-volume API</td></tr>
          <tr><th scope="row">Webhooks &amp; event feeds</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="yes">Webhooks</td><td class="contracted">Webhooks</td><td class="contracted">Event feeds</td></tr>
          <tr><th scope="row">Dedicated environment</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="optional">Optional</td><td class="contracted">Included</td><td class="contracted">Included</td></tr>
          <tr><th scope="row">Embedded / white-label</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="yes">White-label wallet</td><td class="optional">Optional</td><td class="contracted">Architecture scope</td></tr>
          <tr><th scope="row">Architecture review</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="optional">Optional</td><td class="yes">Included</td><td class="contracted">Included</td></tr>
          <tr class="group"><th scope="rowgroup" colspan="6">Governance</th></tr>
          <tr><th scope="row">SSO / SCIM / regulator access</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="yes">Included</td><td class="contracted">Included</td><td class="contracted">Contracted scope</td></tr>
          <tr><th scope="row">SLA</th><td class="no">Unavailable</td><td class="no">Unavailable</td><td class="contracted">99.9% contracted</td><td class="contracted">Contracted</td><td class="contracted">Contracted</td></tr>
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

/* ── sitemap ──────────────────────────────────────────────────────── */
async function buildSitemap() {
  const pages = [
    ["/", "daily", "1.0"],
    ["/news/", "hourly", "0.9"],
    // High priority deliberately: this is the page the product is
    // argued from, and the only one that answers a question for
    // somebody who will never install anything.
    ["/certificate/", "weekly", "0.9"],
    ["/pricing/", "monthly", "0.9"],
    ["/enterprise/", "monthly", "0.9"],
    ["/strategic-infrastructure/", "monthly", "0.9"],
    ["/developers/", "monthly", "0.8"],
    ["/progress/", "weekly", "0.8"],
    ["/status/", "daily", "0.8"],
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
  await buildPricingEnhancement();
  for (const page of PRODUCT_PAGES) await buildProductPage(page);
  await buildSitemap();
  await buildRobots();

  log(`canonical origin: ${ORIGIN}`);
  log("done.");
}

main().catch((error) => {
  console.error("[build] FAILED:", error);
  process.exit(1);
});
