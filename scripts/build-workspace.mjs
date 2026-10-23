/*
 * The NOSHASHI workspace: /app/ and its tool pages.
 *
 * Two experiences, kept apart on purpose. The marketing pages (shell.js)
 * introduce NOSHASHI; the workspace is where the analysis happens. It is
 * one three-area layout — a compact sidebar, the main workspace, and a
 * context panel that opens only when there is something to show — and
 * every page in it is generated here, so routing stays the site's own
 * file routing (one directory per tool) rather than a second router.
 *
 * Every tool reads live public XRPL data through the site's existing
 * endpoints or public nodes (site/assets/workspace.js). Nothing here is
 * sample data, and only tools that exist are linked: there is no
 * watchlist or reports page because the product has neither yet.
 */
import { esc, attrUrl } from "../api/_lib/html.js";
import { MARK, ORIGIN, THEME_BOOT, jsonLd, ORGANIZATION } from "../api/_lib/shell.js";
import { demoSections } from "./build-pages.mjs";

/* Simple 1.5px line icons, drawn for NOSHASHI. 20×20, currentColor. */
const ICON = {
  overview: '<path d="M3 3h6v6H3zM11 3h6v4h-6zM11 9h6v8h-6zM3 11h6v6H3z"/>',
  asset: '<circle cx="10" cy="10" r="7"/><path d="M10 6v8M7 8.5h4.5a1.5 1.5 0 0 1 0 3H8.5a1.5 1.5 0 0 0 0 3H13"/>',
  issuer: '<path d="M10 2.5 3.5 5v4.5c0 4 2.8 6.9 6.5 8 3.7-1.1 6.5-4 6.5-8V5z"/><path d="m7.5 10 1.8 1.8 3.4-3.6"/>',
  payment: '<path d="M3 7h11l-3-3M17 13H6l3 3"/>',
  liquidity: '<path d="M3 17V9M7.5 17V5M12 17v-6M16.5 17V3"/>',
  demo: '<circle cx="10" cy="10" r="7.5"/><path d="m8.5 7 4 3-4 3z"/>',
  docs: '<path d="M5 2.5h7l3 3v12H5z"/><path d="M12 2.5v3h3M7.5 10h5M7.5 13h5"/>',
  api: '<path d="m7 6-4 4 4 4M13 6l4 4-4 4"/>',
  feedback: '<path d="M3.5 4h13v9H9l-4 3.5V13H3.5z"/>',
  settings: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>',
  help: '<circle cx="10" cy="10" r="7.5"/><path d="M8 8a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M10 14v.01"/>',
  status: '<path d="M2.5 10h3l2-5 3 10 2-5h5"/>',
  site: '<path d="M8 4H4v12h12v-4M11 3h6v6M17 3l-8 8"/>',
  collapse: '<path d="M3.5 3.5h13v13h-13zM8 3.5v13"/>',
  panel: '<path d="M3.5 3.5h13v13h-13zM12 3.5v13"/>',
  menu: '<path d="M3 5.5h14M3 10h14M3 14.5h14"/>',
  close: '<path d="m5 5 10 10M15 5 5 15"/>',
};
const icon = (name) =>
  `<svg class="ws-i" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

const TOOLS = [
  { key: "overview", href: "/app/", label: "Overview", icon: "overview" },
  { key: "asset", href: "/app/asset/", label: "Asset intelligence", icon: "asset" },
  { key: "issuer", href: "/app/issuer/", label: "Issuer analysis", icon: "issuer" },
  { key: "payment", href: "/app/payment/", label: "Payment verification", icon: "payment" },
  { key: "liquidity", href: "/app/liquidity/", label: "Liquidity analysis", icon: "liquidity" },
  { key: "demo", href: "/app/demo/", label: "Institutional demo", icon: "demo" },
];
const MORE = [
  { href: "/docs/", label: "Documentation", icon: "docs" },
  { href: "/developers/", label: "API access", icon: "api" },
];

function sidebar(current, version) {
  const link = (t) =>
    `<a class="ws-link" href="${attrUrl(t.href)}"${t.key === current ? ' aria-current="page"' : ""} title="${esc(t.label)}">${icon(t.icon)}<span>${esc(t.label)}</span></a>`;
  return `<aside class="ws-side" id="ws-side" aria-label="Workspace">
  <div class="ws-brand">
    <a class="ws-home" href="/app/" title="NOSHASHI workspace">${MARK}<span>NOSHASHI</span></a>
    <button class="ws-icon-btn ws-collapse" type="button" data-ws-collapse aria-label="Collapse sidebar" aria-expanded="true" aria-controls="ws-side">${icon("collapse")}</button>
  </div>
  <nav class="ws-nav" aria-label="Tools">
    ${TOOLS.map(link).join("\n    ")}
  </nav>
  <nav class="ws-nav ws-nav-more" aria-label="More">
    <p class="ws-sec">More</p>
    ${MORE.map(link).join("\n    ")}
    <button class="ws-link" type="button" data-ctx-open="feedback" title="Feedback">${icon("feedback")}<span>Feedback</span></button>
    <button class="ws-link" type="button" data-ctx-open="settings" title="Settings">${icon("settings")}<span>Settings</span></button>
  </nav>
  <div class="ws-foot">
    <a class="ws-link" href="/contact/" title="Help and support">${icon("help")}<span>Help &amp; support</span></a>
    <a class="ws-link" href="/status/" title="Status">${icon("status")}<span>Status · <span class="mono">${esc(version)}</span></span></a>
    <a class="ws-link" href="/" title="Back to the website">${icon("site")}<span>noshashi.app</span></a>
  </div>
</aside>`;
}

/* The context panel. One element, several views; workspace.js swaps the
   view and fills "details" from the latest result. */
function contextPanel(details) {
  return `<aside class="ws-ctx" id="ws-ctx" aria-label="Context" hidden>
  <div class="ws-ctx-head">
    <p class="ws-ctx-title" data-ctx-title>Details</p>
    <button class="ws-icon-btn" type="button" data-ctx-close aria-label="Close panel">${icon("close")}</button>
  </div>
  <div class="ws-ctx-view" data-ctx-view="details">
    <div data-ctx-details>${details || '<p class="ws-muted">Run an analysis to see its source, timestamps and method here.</p>'}</div>
  </div>
  <div class="ws-ctx-view" data-ctx-view="feedback" hidden>
    <p class="ws-muted">Wrong result, confusing wording, missing feature or a data discrepancy? Tell us. It goes privately to the founder; nothing is published.</p>
    <form class="ws-form" id="wsFeedback" novalidate>
      <label for="wsFbKind">Type</label>
      <select id="wsFbKind" name="kind"><option>Incorrect result</option><option>Confusing explanation</option><option>Missing functionality</option><option>Data discrepancy</option><option>Feature request</option></select>
      <label for="wsFbWhat">What happened</label>
      <textarea id="wsFbWhat" name="what" maxlength="1500" rows="4" required></textarea>
      <label for="wsFbEmail">Email for a reply</label>
      <input id="wsFbEmail" name="email" type="email" autocomplete="email" maxlength="200" required>
      <div class="form-trap" aria-hidden="true"><label for="wsFbTrap">Leave empty</label><input id="wsFbTrap" name="company_website" tabindex="-1" autocomplete="off"></div>
      <button class="ws-btn primary" type="submit">Send feedback</button>
      <p class="ws-status" role="status" aria-live="polite" data-fb-status></p>
    </form>
    <p class="ws-fine">The page and the last input you analyzed are attached so we can reproduce it. Never send keys or seed phrases.</p>
  </div>
  <div class="ws-ctx-view" data-ctx-view="settings" hidden>
    <p class="ws-ctx-label">Appearance</p>
    <div class="ws-seg" role="group" aria-label="Brightness">
      <button type="button" class="ws-seg-b" data-set-theme="dark">Dark</button>
      <button type="button" class="ws-seg-b" data-set-theme="light">Light</button>
    </div>
    <div class="ws-seg" role="group" aria-label="Colour">
      <button type="button" class="ws-seg-b" data-set-accent="green">Green</button>
      <button type="button" class="ws-seg-b" data-set-accent="blue">Blue</button>
    </div>
    <p class="ws-ctx-label">History</p>
    <p class="ws-muted">Recent analyses are kept in this browser only.</p>
    <button type="button" class="ws-btn" data-clear-history>Clear recent analyses</button>
  </div>
</aside>`;
}

function page({ key, path, title, crumb, description, main, details = "", ctx = true, scripts = "", version }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${esc(title)} · NOSHASHI workspace</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(ORIGIN + path)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/flower-mark-180.png">
<link rel="preload" as="font" type="font/woff2" href="/fonts/space-grotesk-500-latin.woff2" crossorigin>
<link rel="stylesheet" href="/assets/fonts.css">
<link rel="stylesheet" href="/assets/core.css">
<link rel="stylesheet" href="/assets/modules.css">
<link rel="stylesheet" href="/assets/accent.css">
<link rel="stylesheet" href="/assets/workspace.css">
<script src="/assets/accent.js"></script>
<script src="/assets/workspace-boot.js"></script>
${THEME_BOOT}
${jsonLd([ORGANIZATION])}
</head>
<body class="ws-body-root">
<div class="ws-app" data-tool="${esc(key)}">
${sidebar(key, version)}
<div class="ws-col">
  <header class="ws-top">
    <button class="ws-icon-btn ws-menu" type="button" data-ws-drawer aria-label="Open navigation" aria-controls="ws-side" aria-expanded="false">${icon("menu")}</button>
    <p class="ws-crumb"><a href="/app/">Workspace</a>${crumb ? ` <span aria-hidden="true">/</span> ${esc(crumb)}` : ""}</p>
    <div class="ws-top-actions">
      ${ctx ? `<button class="ws-icon-btn" type="button" data-ctx-open="details" aria-label="Show details panel" aria-controls="ws-ctx" aria-expanded="false" title="Details">${icon("panel")}</button>` : ""}
      <a class="ws-btn" href="/contact/?topic=institutions">Request a demo</a>
    </div>
  </header>
  <main class="ws-main" id="ws-main">
${main}
  </main>
</div>
${contextPanel(details)}
</div>
<div class="ws-scrim" data-ws-scrim hidden></div>
<script src="/assets/workspace.js" defer></script>
${scripts}
</body>
</html>`;
}

const head = (title, lede) =>
  `<h1 class="ws-title">${esc(title)}</h1>\n<p class="ws-lede">${esc(lede)}</p>`;

function method(lines) {
  return `<p class="ws-ctx-label">How this is worked out</p><ul class="ws-ctx-list">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
}

/* ── pages ────────────────────────────────────────────────────────── */
function overview(version) {
  return page({
    key: "overview", path: "/app/", title: "Overview", crumb: "", version, ctx: false,
    description: "The NOSHASHI workspace: analyze XRPL assets, verify payments and inspect liquidity from live ledger evidence.",
    main: `${head("XRPL Intelligence", "Analyze assets, verify payments, and inspect liquidity using available XRPL ledger evidence.")}
<div class="ws-actions">
  <a class="ws-btn primary" href="/app/asset/">${icon("asset")}Analyze asset</a>
  <a class="ws-btn" href="/app/payment/">${icon("payment")}Verify transaction</a>
  <a class="ws-btn" href="/app/liquidity/">${icon("liquidity")}Explore liquidity</a>
  <a class="ws-btn" href="/app/demo/">${icon("demo")}Open demo</a>
</div>

<section class="ws-sec-block" aria-labelledby="ovRecent">
  <h2 class="ws-h2" id="ovRecent">Recent analyses</h2>
  <div data-history-list>
    <div class="ws-empty">
      <p><b>Nothing analyzed yet in this browser.</b></p>
      <p>Start with an asset, an issuer or a payment. Your recent analyses will appear here.</p>
      <p class="ws-empty-actions"><a class="ws-btn" href="/app/issuer/?q=rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B">Try Bitstamp's USD issuer</a><a class="ws-btn" href="/app/liquidity/">Measure a live order book</a></p>
    </div>
  </div>
</section>

<section class="ws-sec-block" aria-labelledby="ovTools">
  <h2 class="ws-h2" id="ovTools">Tools</h2>
  <div class="ws-tool-list">
    <a class="ws-tool" href="/app/asset/">${icon("asset")}<span><b>Asset intelligence</b><small>Every token an account holds, and which issuers can freeze or claw it back.</small></span></a>
    <a class="ws-tool" href="/app/issuer/">${icon("issuer")}<span><b>Issuer analysis</b><small>An issuer's freeze, clawback, approval, fee and key settings.</small></span></a>
    <a class="ws-tool" href="/app/payment/">${icon("payment")}<span><b>Payment verification</b><small>What a payment requested against what it actually delivered.</small></span></a>
    <a class="ws-tool" href="/app/liquidity/">${icon("liquidity")}<span><b>Liquidity analysis</b><small>Advertised order-book depth against depth that can actually fill.</small></span></a>
  </div>
</section>

<section class="ws-sec-block" aria-labelledby="ovData">
  <h2 class="ws-h2" id="ovData">Data sources</h2>
  <div class="ws-table-wrap"><table class="ws-table" data-sources>
    <thead><tr><th scope="col">Source</th><th scope="col">Used for</th><th scope="col">State</th></tr></thead>
    <tbody>
      <tr><td>Public XRPL nodes</td><td>Transactions, trust lines, ledger walks</td><td data-src="node"><span class="ws-dot"></span>Checking…</td></tr>
      <tr><td>NOSHASHI read API</td><td>Issuer state, order books</td><td data-src="api"><span class="ws-dot"></span>Checking…</td></tr>
    </tbody>
  </table></div>
  <p class="ws-fine">Checked from your browser when this page loads. Full history on the <a href="/status/">status page</a>.</p>
</section>`,
  });
}

function toolPage({ key, path, crumb, title, lede, description, form, examples, details, empty }) {
  return { key, path, title: crumb, crumb, description, details,
    main: `${head(title, lede)}
${form}
${examples ? `<p class="ws-examples">${examples}</p>` : ""}
<div class="ws-empty" data-empty>${empty}</div>
<section class="ws-result" data-result aria-live="polite" hidden></section>` };
}

const PAGES = [
  toolPage({
    key: "asset", path: "/app/asset/", crumb: "Asset intelligence", title: "Asset intelligence",
    lede: "See every token an account holds and which of its issuers can freeze or claw it back.",
    description: "Read an XRPL account's trust lines and each issuer's freeze and clawback controls, live.",
    form: `<form class="ws-search" data-run="asset" novalidate>
  <label class="sr-only" for="q">XRPL account address</label>
  <input id="q" name="q" type="text" spellcheck="false" autocomplete="off" placeholder="Account address (starts with r)">
  <button class="ws-btn primary" type="submit">Analyze</button>
</form>`,
    examples: 'Example: <button type="button" class="sample" data-example="rMZKeAt1vMjhuNCWDiB4SdzJRiymdpERw4">an account with several holdings</button>',
    empty: "<p><b>Paste an account address.</b> You will get its token balances, the issuer of each, and whether that issuer can still freeze or claw the balance back.</p>",
    details: method([
      "Trust lines: <code>account_lines</code> at the latest validated ledger (first 200 lines).",
      "Issuer controls: each issuer's account flags from <a href=\"/api/issuer-state?issuer=rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B\">/api/issuer-state</a>, up to 12 issuers.",
      "A line marked frozen means the issuer has frozen that specific line.",
      "Read-only. No wallet is connected and nothing is signed.",
    ]),
  }),
  toolPage({
    key: "issuer", path: "/app/issuer/", crumb: "Issuer analysis", title: "Issuer analysis",
    lede: "Check which controls an issuer keeps over the tokens it issues.",
    description: "An XRPL issuer's freeze, clawback, authorization, transfer fee and key settings at the validated ledger.",
    form: `<form class="ws-search" data-run="issuer" novalidate>
  <label class="sr-only" for="q">Issuer address</label>
  <input id="q" name="q" type="text" spellcheck="false" autocomplete="off" placeholder="Issuer address (starts with r)">
  <button class="ws-btn primary" type="submit">Analyze</button>
</form>`,
    examples: 'Examples: <button type="button" class="sample" data-example="rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B">Bitstamp (USD)</button> · <button type="button" class="sample" data-example="rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq">GateHub</button> · <button type="button" class="sample" data-example="rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De">Ripple (RLUSD)</button>',
    empty: "<p><b>Paste an issuer address.</b> You will see whether it can freeze holders, claw back balances or require approval, and what it charges on transfers.</p>",
    details: method([
      "Source: <code>account_info</code> with signer lists at the latest validated ledger, via <code>/api/issuer-state</code>.",
      "Each control is read from the account's flags; nothing is inferred.",
      "One passing check does not make a token safe. These are the issuer's powers, not a verdict on the issuer.",
    ]),
  }),
  toolPage({
    key: "payment", path: "/app/payment/", crumb: "Payment verification", title: "Payment verification",
    lede: "Check what a payment actually delivered, not what it asked for.",
    description: "Compare an XRPL payment's Amount with its delivered_amount from the validated ledger.",
    form: `<form class="ws-search" data-run="payment" novalidate>
  <label class="sr-only" for="q">Transaction hash</label>
  <input id="q" name="q" type="text" spellcheck="false" autocomplete="off" placeholder="Transaction hash (64 hex characters)">
  <button class="ws-btn primary" type="submit">Verify</button>
</form>`,
    examples: 'No hash to hand? <button type="button" class="sample" data-find-payment>Find a real payment from the last few ledgers</button>',
    empty: "<p><b>Paste a transaction hash.</b> You will see the amount requested, the amount delivered, and whether the payment was partial.</p>",
    details: method([
      "Source: <code>tx</code> from public XRPL nodes (xrplcluster.com, xrpl.ws, xrpl.link), accepted only when <code>validated</code> is true.",
      "Delivered is <code>meta.delivered_amount</code>; requested is <code>DeliverMax</code> or <code>Amount</code>.",
      "No currency conversion is applied. Very old payments may not record a delivered amount.",
    ]),
  }),
  toolPage({
    key: "liquidity", path: "/app/liquidity/", crumb: "Liquidity analysis", title: "Liquidity analysis",
    lede: "Compare what an order book advertises with what could actually fill.",
    description: "Quoted against fillable XRPL order-book depth within 10% of mid, at one validated ledger.",
    form: `<form class="ws-search" data-run="liquidity" novalidate>
  <label class="sr-only" for="q">Trading pair</label>
  <select id="q" name="q">
    <option value="USD|rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B">XRP / USD · Bitstamp</option>
    <option value="USD|rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq">XRP / USD · GateHub</option>
    <option value="EUR|rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq">XRP / EUR · GateHub</option>
    <option value="524C555344000000000000000000000000000000|rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De">XRP / RLUSD · Ripple</option>
  </select>
  <button class="ws-btn primary" type="submit">Measure</button>
</form>`,
    examples: "",
    empty: "<p><b>Pick a pair and measure it.</b> You will see advertised depth, fillable depth on each side, and the spread, read at one validated ledger.</p>",
    details: method([
      "Source: <code>book_offers</code> both sides at one validated ledger, via <code>/api/book</code> (cached up to a minute at the edge).",
      "Fillable counts only what each offer's owner held at that ledger (<code>taker_gets_funded</code>).",
      "Within 10% of the reference mid; AMM pools are not included; up to 100 offers per side.",
    ]),
  }),
];

export async function buildWorkspace(write, { release } = {}) {
  const version = release?.tag || "beta";
  await write("app/index.html", overview(version));
  for (const p of PAGES) await write(`${p.path.slice(1)}index.html`, page({ ...p, version }));
  await write("app/demo/index.html", page({
    key: "demo", path: "/app/demo/", title: "Institutional demo", crumb: "Institutional demo", version, ctx: false,
    description: "Guided XRPL scenarios on live public data: issuer risk, payment verification and liquidity.",
    main: `${head("Institutional demo", "Guided scenarios on live public XRPL data. No wallet, no keys.")}
<p class="ws-fine">Every result below is read live when you press a button. Nothing is illustrative.</p>
<div class="ws-demo">${demoSections()}</div>`,
    scripts: `<script src="/assets/demo.js" defer></script>`,
  }));
}

export const WORKSPACE_PAGES = [
  ["/app/", "weekly", "0.8"],
  ["/app/asset/", "monthly", "0.7"],
  ["/app/issuer/", "monthly", "0.7"],
  ["/app/payment/", "monthly", "0.7"],
  ["/app/liquidity/", "monthly", "0.7"],
  ["/app/demo/", "monthly", "0.7"],
];
