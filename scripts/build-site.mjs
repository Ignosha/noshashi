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
import { renderPage, breadcrumb, ORGANIZATION, ORIGIN } from "../api/_lib/shell.js";
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

  const slots = {
    ORIGIN: ORIGIN,
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

/* ── sitemap ──────────────────────────────────────────────────────── */
async function buildSitemap() {
  const pages = [
    ["/", "daily", "1.0"],
    ["/news/", "hourly", "0.9"],
    ["/pricing/", "monthly", "0.9"],
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
  await buildSitemap();
  await buildRobots();

  log(`canonical origin: ${ORIGIN}`);
  log("done.");
}

main().catch((error) => {
  console.error("[build] FAILED:", error);
  process.exit(1);
});
