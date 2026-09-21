/*
 * Section renderers.
 *
 * These produce the HTML fragments that appear both on the landing page
 * and on the standalone pages, so a headline row looks and behaves the
 * same wherever it is. They are pure: data in, markup out, no fetching
 * — the caller decides where the data came from, which is what lets the
 * build script and a runtime handler share them.
 *
 * Every value that originates outside this repository (a headline, a
 * publisher, a release title) goes through `esc` or `attrUrl` on the
 * way in. That is not defensive style; it is the only thing standing
 * between a public RSS feed and script execution on our own origin.
 */

import { esc, attrUrl, ago, isoDate, clamp, megabytes } from "./html.js";
import { priceChart, volumeBars } from "./charts.js";
import { money, percent, grouped } from "./market.js";

const KIND_WORD = {
  release: "RELEASE",
  maintenance: "MAINTENANCE",
  incident: "INCIDENT",
  milestone: "MILESTONE",
  note: "NOTE",
};

/** The live XRP newsroom. */
export function renderNews(news, { columns = false, limit = 8 } = {}) {
  const items = (news?.items || []).slice(0, limit);

  if (!items.length) {
    return `<div class="feed"><div class="feed-empty">
      No source answered just now, so there is nothing to show. This section stays empty rather
      than holding yesterday's headlines on screen as though they were current.
    </div></div>`;
  }

  const rows = items
    .map((item) => {
      const when = item.publishedAt
        ? `<time datetime="${esc(item.publishedAt)}">${esc(ago(item.publishedAt))}</time>`
        : "";
      return `<article class="feed-item">
      <span class="feed-meta"><span class="src">${esc(item.publisher)}</span>${when}</span>
      <a class="headline" href="${attrUrl(item.url)}" rel="noopener nofollow" target="_blank">${esc(item.title)}</a>
    </article>`;
    })
    .join("\n    ");

  const ok = (news.sources || []).filter((s) => s.ok).map((s) => s.name);
  const failed = (news.sources || []).filter((s) => !s.ok).map((s) => s.name);

  return `<div class="feed${columns ? " cols" : ""}" id="news-feed">
    ${rows}
  </div>
  <p class="feed-note" id="news-note">
    Merged from ${esc(ok.join(", ") || "no source")}${
      failed.length ? `. Not answering: ${esc(failed.join(", "))}` : ""
    }. Headlines link to the publisher and are reproduced as titles only.
    They are news about the XRP Ledger, not a NOSHASHI reading, and no verdict is implied by any of them.
  </p>`;
}

/** The newsroom's console header, carrying its own freshness. */
export function renderNewsHead(news) {
  const live = news?.live;
  return `<div class="console-head">
    <strong>XRP / XRPL NEWSROOM</strong>
    <span class="reading ${live ? "live" : "stale"}" id="news-state">${
      live ? `UPDATED ${esc(ago(news.fetchedAt))}` : "NO SOURCE ANSWERING"
    }</span>
  </div>`;
}

/** The mission log: releases and maintenance on one spine. */
export function renderLog(entries, { limit = 8 } = {}) {
  const rows = (entries || []).slice(0, limit);
  if (!rows.length) {
    return `<div class="feed"><div class="feed-empty">No entries yet.</div></div>`;
  }

  return `<div class="log" id="mission-log">
    ${rows
      .map((entry) => {
        const link = entry.url
          ? `<a class="log-link" href="${attrUrl(entry.url)}"${
              /^https?:/i.test(entry.url) ? ' rel="noopener"' : ""
            }>${/^https?:/i.test(entry.url) ? "RELEASE NOTES" : "OPEN"} →</a>`
          : "";
        return `<article class="log-entry" data-kind="${esc(entry.kind)}">
      <div class="log-meta">
        <time datetime="${esc(entry.at)}">${esc(isoDate(entry.at))}</time>
        <span class="log-kind">${esc(KIND_WORD[entry.kind] || "NOTE")}</span>
      </div>
      <h3>${esc(entry.title)}</h3>
      <p>${esc(clamp(entry.body, 300))}</p>
      ${link}
    </article>`;
      })
      .join("\n    ")}
  </div>`;
}

/** Flight-readiness rows. The one place status colour is spent. */
export function renderBoard(status) {
  return `<div class="board">
    ${(status?.rows || [])
      .map(
        (row) => `<div class="board-row">
      <span class="what"><b>${esc(row.what)}</b><span>${esc(row.detail)}</span></span>
      <span class="board-state" data-state="${esc(row.state)}"><i aria-hidden="true"></i>${esc(row.word)}</span>
    </div>`
      )
      .join("\n    ")}
  </div>`;
}

/**
 * The mission clock.
 *
 * Server-rendered with real values so the page is never blank and a
 * crawler sees numbers, then ticked in the browser. T+ is counted from
 * the first public release, which is a date in the repository rather
 * than a number chosen to look impressive.
 */
export const EPOCH = "2026-08-29T00:00:00Z";

export function renderClock(now = new Date()) {
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - Date.parse(EPOCH)) / 86_400_000));
  return `<div class="clockbar" id="mission-clock" data-epoch="${esc(EPOCH)}">
    <div><span class="label">UTC</span><span class="value live" id="clock-utc">${esc(
      now.toISOString().slice(11, 19)
    )}</span></div>
    <div><span class="label">MISSION ELAPSED</span><span class="value" id="clock-met">T+${esc(
      String(elapsedDays)
    )}d</span></div>
    <div><span class="label">SINCE FIRST RELEASE</span><span class="value">${esc(
      isoDate(EPOCH)
    )}</span></div>
  </div>`;
}

/** Progress lines. `done` is claimed only where a release proves it. */
export function renderProgress(lines) {
  return `<div class="prog">
    ${lines
      .map(
        (line) => `<div class="prog-line" data-state="${esc(line.state)}">
      <div class="prog-head"><b>${esc(line.title)}</b><span>${esc(line.reading)}</span></div>
      <div class="prog-track"><div class="prog-fill" style="width:${Math.max(
        0,
        Math.min(100, Number(line.percent) || 0)
      )}%"></div></div>
      <p class="prog-note">${esc(line.note)}</p>
    </div>`
      )
      .join("\n    ")}
  </div>`;
}

/** The four-cell fact rail. */
export function renderRail(cells) {
  return `<div class="rail">
    ${cells
      .map(
        (cell) => `<div><span class="label">${esc(cell.label)}</span><strong>${esc(
          cell.value
        )}</strong><small>${esc(cell.note)}</small></div>`
      )
      .join("\n    ")}
  </div>`;
}

/* ── Downloads ────────────────────────────────────────────────────────
   Generated from the GitHub release rather than typed in. The old
   section named v0.3.0 while the repository was on v0.3.1, with hashes
   and byte sizes to match — the exact failure mode a hand-maintained
   download page has, and a bad one here specifically, because the page
   asks people to verify a SHA-256 against a number it printed. A wrong
   number teaches them the check is noise.

   Every artifact is labelled BETA. The builds are pre-1.0 and unsigned,
   and that belongs on each one rather than only in a note underneath.
   ──────────────────────────────────────────────────────────────────── */

const PLATFORMS = [
  {
    name: "macOS",
    requirement: "11 Big Sur or later",
    detail: "Apple silicon and Intel built separately",
    primary: { match: /_aarch64\.dmg$/, label: "Download .dmg · Apple silicon" },
    alternates: [{ match: /_x64\.dmg$/, label: "Intel build (.dmg)" }],
    warning: "Not notarised, so Gatekeeper will warn: right-click › Open.",
  },
  {
    name: "Windows",
    requirement: "10 and 11 · x64",
    detail: "Built on a Windows runner",
    primary: { match: /_x64-setup\.exe$/, label: "Download .exe" },
    alternates: [{ match: /_x64_en-US\.msi$/, label: "Deploying it? The .msi" }],
    warning: "Neither build is code-signed, so SmartScreen will warn.",
  },
  {
    name: "Linux",
    requirement: "x64 · .deb, .rpm, .AppImage",
    detail: "Choose the package for your environment",
    primary: { match: /_amd64\.deb$/, label: "Download .deb" },
    alternates: [
      { match: /\.x86_64\.rpm$/, label: ".rpm" },
      { match: /_amd64\.AppImage$/, label: ".AppImage" },
    ],
    warning: "The AppImage is large because it carries its own WebKitGTK; the .deb uses yours.",
  },
];

const DOWNLOAD_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3v12"/><path d="m7 12 5 5 5-5"/><path d="M5 21h14"/></svg>`;


function shortHash(hash) {
  return hash ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : "";
}

/** The release metadata rail plus one card per platform. */
export function renderDownloads(release) {
  if (!release || !release.assets?.length) {
    return `<div class="download-note">
      <span class="signal" aria-hidden="true"></span>
      <span><strong style="color:var(--ink)">Release list unavailable.</strong> The build artifacts are
      published on GitHub; this page could not reach the releases API when it was generated.
      <a href="https://github.com/Ignosha/noshashi/releases" rel="noopener">Open the releases page →</a></span>
    </div>`;
  }

  const find = (pattern) => release.assets.find((a) => pattern.test(a.name));

  const rail = `<div class="release-rail" aria-label="Current release metadata">
      <div class="release-cell">
        <span class="label">CURRENT CHANNEL</span>
        <strong>Beta · ${esc(release.tag)}</strong>
      </div>
      <div class="release-cell">
        <span class="label">RELEASED</span>
        <strong class="mono">${esc(isoDate(release.at))}</strong>
      </div>
      <div class="release-cell">
        <span class="label">SOURCE</span>
        <strong class="mono">GitHub Actions</strong>
      </div>
      <div class="release-cell">
        <span class="label">INTEGRITY</span>
        <strong class="live">SHA-256 listed</strong>
      </div>
    </div>`;

  const cards = PLATFORMS.map((platform) => {
    const primary = find(platform.primary.match);
    if (!primary) return "";

    const alternates = platform.alternates
      .map((alt) => {
        const asset = find(alt.match);
        if (!asset) return "";
        return `<a href="${attrUrl(asset.url)}">${esc(alt.label)}</a> — ${esc(
          megabytes(asset.size)
        )}${asset.sha256 ? `, sha256 <span class="mono">${esc(shortHash(asset.sha256))}</span>` : ""}`;
      })
      .filter(Boolean);

    const hashLine = primary.sha256
      ? `<div class="hashline">
          <p class="phash mono">${esc(primary.sha256)}</p>
          <button class="copyhash" type="button" data-copy="${esc(primary.sha256)}">COPY</button>
        </div>`
      : "";

    return `<div class="plat ready">
        <span class="cap"></span>
        <div class="phead">
          <div>
            <p class="pname">${esc(platform.name)}</p>
            <p class="pver">${esc(platform.requirement)}</p>
          </div>
          <span class="availability" data-channel="beta">BETA</span>
        </div>
        <p class="pver">${esc(platform.detail)}</p>
        <a class="btn" href="${attrUrl(primary.url)}">
          ${DOWNLOAD_ICON}
          <span>${esc(platform.primary.label)} · ${esc(megabytes(primary.size))} · ${esc(release.tag)}</span>
        </a>
        ${hashLine}
        <p class="phash">${alternates.join(" and ")}${alternates.length ? ". " : ""}${esc(
      platform.warning
    )}</p>
      </div>`;
  })
    .filter(Boolean)
    .join("\n      ");

  return `${rail}

    <div class="platforms">
      ${cards}
    </div>
    <div class="download-note">
      <span class="signal" aria-hidden="true"></span>
      <span><strong style="color:var(--ink)">Operator note.</strong> Every build on this page is a
        <strong style="color:var(--hold)">beta</strong>: pre-1.0, and intentionally unsigned while the
        release pipeline is being hardened. Verify the SHA-256 value above, then follow your
        institution's software admission process before deployment.</span>
    </div>`;
}

/** The two commands that check a download, naming the real files. */
export function renderVerifyCommand(release) {
  const dmg = release?.assets?.find((a) => /_aarch64\.dmg$/.test(a.name))?.name || "NOSHASHI.dmg";
  const exe = release?.assets?.find((a) => /_x64-setup\.exe$/.test(a.name))?.name || "NOSHASHI-setup.exe";
  return `<pre class="cmd mono">shasum -a 256 ${esc(dmg)}   # macOS / Linux
certutil -hashfile ${esc(exe)} SHA256   # Windows</pre>`;
}

/**
 * Questions, drawn from the support console's knowledge base.
 *
 * One source for both surfaces. A visitor who reads the page and a
 * visitor who asks the console get the same sentences, and there is no
 * second copy to go stale.
 */
export function renderFaq(entries) {
  const rows = entries
    .map(
      (entry) => `<details>
      <summary>${esc(entry.q)}</summary>
      <div class="answer">${esc(entry.a)}${
        entry.links?.length
          ? `<br><br>${entry.links
              .map((l) => `<a href="${attrUrl(l.href)}">${esc(l.label)} →</a>`)
              .join(" · ")}`
          : ""
      }</div>
    </details>`
    )
    .join("\n    ");
  return `<div class="qa">\n    ${rows}\n  </div>`;
}

/** FAQPage structured data for exactly the questions rendered above. */
export function faqStructuredData(entries) {
  return {
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.q,
      acceptedAnswer: { "@type": "Answer", text: entry.a },
    })),
  };
}

/* ── XRP live panel ───────────────────────────────────────────────────
   Price, volume and network state in one console. The rules that shape
   it are DESIGN.md's, and two are worth naming because a market panel
   is where they are most often broken:

   1. The 24-hour change is NOT coloured green or red. Status colour is
      spent on GO/HOLD/NO-GO and nothing else here is a verdict. The
      direction is carried by a glyph and a signed number, so it also
      survives a reader who cannot separate the two hues.
   2. Nothing is estimated. A source that did not answer leaves its cell
      reading "—", and the panel says which sources answered.
   ──────────────────────────────────────────────────────────────────── */


export function renderMarketHead(market) {
  const live = Boolean(market?.live);
  return `<div class="console-head">
    <strong>XRP · LIVE MARKET AND NETWORK</strong>
    <span class="reading ${live ? "live" : "stale"}" id="xrp-state">${
      live ? `UPDATED ${esc(ago(market.fetchedAt))}` : "NO SOURCE ANSWERING"
    }</span>
  </div>`;
}

export function renderMarket(market) {
  const spot = market?.spot;
  const series = market?.series;
  const ledger = market?.ledger;

  if (!spot && !series) {
    return `<div class="console-body"><div class="chart-empty">
      No market source answered when this page was rendered. Nothing is shown rather than a
      figure carried over from the last successful read.
    </div></div>`;
  }

  const up = Number.isFinite(spot?.change24h) && spot.change24h >= 0;
  const change = Number.isFinite(spot?.change24h)
    ? `<span class="xrp-change" data-dir="${up ? "up" : "down"}">
         <span aria-hidden="true">${up ? "▲" : "▼"}</span>
         <span id="xrp-change">${esc(percent(spot.change24h))}</span> over 24h
       </span>`
    : "";

  return `<div class="console-body">
    <div class="xrp-top">
      <div class="xrp-quote">
        <span class="label">XRP / USD · SPOT</span>
        <strong id="xrp-price">${esc(money(spot?.price))}</strong>
        ${change}
      </div>
      <p class="chart-q">Where has XRP traded this week?</p>
    </div>

    ${series ? priceChart(series.prices) : ""}

    ${
      series && series.volumes?.length
        ? `<p class="chart-q vol">How much actually changed hands?</p>${volumeBars(series.volumes)}`
        : ""
    }
  </div>

  <div class="rail bare">
    <div><span class="label">MARKET CAP</span><strong>${esc(money(spot?.marketCap))}</strong>
      <small>Reported across tracked venues.</small></div>
    <div><span class="label">24H VOLUME</span><strong>${esc(money(spot?.volume24h))}</strong>
      <small>Reported, not fillable. The book is the fillable number.</small></div>
    <div><span class="label">VALIDATED LEDGER</span><strong>${esc(grouped(ledger?.sequence))}</strong>
      <small>${ledger ? `Read from ${esc(ledger.node)}.` : "Node did not answer."}</small></div>
    <div><span class="label">BASE FEE</span><strong>${
      Number.isFinite(ledger?.baseFeeXrp) ? esc(`${ledger.baseFeeXrp} XRP`) : "—"
    }</strong><small>${
      Number.isFinite(ledger?.peers) ? `${esc(String(ledger.peers))} peers on that node.` : "Peer count unavailable."
    }</small></div>
  </div>`;
}

/** What the panel is and is not, stated under it. */
export function renderMarketFoot(market) {
  const ok = [];
  const missing = [];
  (market?.sources?.spot ? ok : missing).push("spot");
  (market?.sources?.series ? ok : missing).push("history");
  (market?.sources?.ledger ? ok : missing).push("ledger");
  return `<div class="console-foot">
    <span>READ SERVER-SIDE · ${esc(ok.join(", ").toUpperCase() || "NOTHING")} ANSWERING${
      missing.length ? ` · ${esc(missing.join(", ").toUpperCase())} UNAVAILABLE` : ""
    }</span>
    <span>MARKET DATA, NOT A VERDICT</span>
  </div>`;
}

/* ── Subscribe ────────────────────────────────────────────────────────
   One field, stated plainly. The copy says what arrives and how often,
   because "subscribe to our newsletter" is a promise nobody can check
   and this product's whole argument is that its claims are checkable.
   ──────────────────────────────────────────────────────────────────── */
export function renderSubscribe({ compact = false } = {}) {
  return `<div class="subscribe${compact ? " compact" : ""}">
    <div class="subscribe-copy">
      <p class="num" data-i18n="sub.title">PRODUCT UPDATES</p>
      <p data-i18n="sub.body">An email when a build ships or a capability lands — drawn from the same mission log
         this page publishes, so an email cannot claim something the site does not.
         No schedule, no digest, one click to leave.</p>
    </div>
    <form class="subscribe-form" id="subscribe-form" novalidate>
      <label class="sr-only" for="subscribe-email">Your email address</label>
      <input id="subscribe-email" name="email" type="email" autocomplete="email"
             maxlength="200" placeholder="you@institution.com" data-i18n="sub.placeholder" required>
      <button class="btn" type="submit" id="subscribe-send" data-i18n="sub.button">Subscribe</button>
      <div class="form-trap" aria-hidden="true">
        <label for="subscribe_company">Leave empty</label>
        <input id="subscribe_company" name="company_website" type="text" tabindex="-1" autocomplete="off">
      </div>
      <p class="form-status" id="subscribe-status" role="status" aria-live="polite"></p>
    </form>
  </div>`;
}
