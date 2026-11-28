import { readFile } from "node:fs/promises";
import { renderPage, breadcrumb } from "../api/_lib/shell.js";
import { RIPPLING_PLANS } from "../api/_lib/rippling-keys.js";
import { WATCH_MONTHLY_CENTS } from "../api/create-checkout-session.js";

const plans = Object.entries(RIPPLING_PLANS).filter(([id]) => id !== "free");

const catalog = [
  { name: "Destination Preflight", group: "Payments · before sending", description: "Check an XRP recipient for a required destination tag, deposit authorization, or an XRP preference before you send.", endpoint: "GET /api/v1/destination-preflight", tool: "destination-preflight" },
  { name: "Payment Receipt", group: "Payments · after settlement", description: "Use a transaction hash to see what reached the destination and save a digest of the evidence.", endpoint: "GET /api/v1/payment-receipt", tool: "payment-receipt" },
  { name: "Asset Risk", group: "Treasury · pre-trade", description: "Check the issuer’s controls and see how much of a position its XRP order book can fill.", endpoint: "GET /api/v1/asset-risk", tool: "asset-risk" },
  { name: "Rippling Exposure", group: "Wallets · single account", description: "Check one wallet for balances linked through trust lines with rippling enabled.", endpoint: "GET /api/v1/rippling", tool: "rippling" },
  { name: "Rippling Fleet", group: "Custody · paid API", description: "Check multiple wallets in one request. Starter covers up to 25 wallets per scan.", endpoint: "POST /api/v1/rippling/batch", href: "#plans", action: "Compare paid plans" },
  { name: "Issuer State", group: "Issuers · ledger evidence", description: "Read an issuer’s AccountRoot and signer list from a validated ledger.", endpoint: "GET /api/issuer-state", tool: "issuer-state" },
  { name: "Payment Review", group: "Payments · reconciliation", description: "Compare an actual payment with the amount, asset and recipient your team expected.", endpoint: "POST /api/settlement-check", href: "/settlement-desk/", action: "Open settlement check" },
];

export async function buildMarketplace(write) {
  const receiptModule = await readFile(new URL("../api/_lib/asset-risk-receipt.js", import.meta.url), "utf8");
  await write("assets/asset-risk-receipt.mjs", receiptModule);
  const body = `<div class="page-head">
  <p class="eyebrow">NOSHASHI · XRPL developer marketplace</p>
  <h1>XRPL APIs for payments, wallets and treasury.</h1>
  <p>Check a payment destination, verify what arrived, or test a wallet for rippling exposure. Try a public check and copy the API call into your workflow.</p>
  <nav class="mp-actions" aria-label="Marketplace sections">
    <a class="btn" href="#api-catalog">Browse APIs</a>
    <a class="btn ghost" href="#plans">See plans from $299/month</a>
    <a class="btn ghost" href="/docs/api/">API reference</a>
  </nav>
</div>
<section id="api-catalog" class="mp-section mp-catalog" aria-labelledby="shelf-title">
  <div class="mp-shelf-heading">
    <h2 id="shelf-title">API catalog</h2>
    <div class="mp-shelf-controls" hidden>
      <button type="button" class="btn ghost" id="mp-prev" aria-controls="mp-shelf">Previous</button>
      <button type="button" class="btn ghost" id="mp-next" aria-controls="mp-shelf">Next</button>
    </div>
  </div>
  <div class="mp-shelf" id="mp-shelf" tabindex="0" role="region" aria-label="Horizontally scrollable API catalog">
    ${catalog.map((item) => `<article class="mp-api-card">
      <p class="mp-api-group">${item.group}</p>
      <h3>${item.name}</h3>
      <p>${item.description}</p>
      <code>${item.endpoint}</code>
      ${item.tool ? `<a class="btn ghost" href="#lab" data-mp-tool="${item.tool}">Try ${item.name}</a>` : `<a class="btn ghost" href="${item.href}">${item.action}</a>`}
    </article>`).join("")}
  </div>
</section>
<section id="plans" class="mp-section" aria-labelledby="plans-title">
  <h2 id="plans-title">Rippling Exposure API plans</h2>
  <p>Choose a monthly plan for fleet scans. Claim your API key after Stripe confirms card payment, or request an invoice for manual setup.</p>
  <div id="mp-checkout-return" class="panel mp-form" hidden>
    <h3>Your Rippling API key</h3>
    <p id="mp-key-status" role="status"></p>
    <button type="button" class="btn ghost" id="mp-key-claim" hidden>Claim API key</button>
    <label for="mp-issued-key" id="mp-issued-key-label" hidden>Copy and save your API key securely</label>
    <input id="mp-issued-key" type="password" readonly autocomplete="off" spellcheck="false" hidden>
    <button type="button" class="btn ghost" id="mp-key-copy" hidden>Copy API key</button>
  </div>
  <p id="mp-checkout-status" role="status"></p>
  <p><a href="mailto:institutions@noshashi.app?subject=Recover%20my%20Rippling%20API%20key">Need help recovering a purchased key?</a></p>
  <div class="mp-grid mp-plans">${plans.map(([id, plan]) => `
    <article class="panel">
      <h3>${plan.label}</h3>
      <p>${{ starter: "For wallet teams checking a small fleet.", desk: "For larger fleets and token issuer reviews.", institution: "For custody and issuer teams with broader coverage." }[id]}</p>
      <p class="mp-price">$${plan.monthly_usd.toLocaleString("en-US")} <small>/ month</small></p>
      <ul>
        <li>${plan.per_minute} checks per minute</li>
        <li>${plan.batch} wallets per fleet scan</li>
        ${plan.issuer_holders ? `<li>Up to ${plan.issuer_holders.toLocaleString("en-US")} holders per issuer</li>` : ""}
      </ul>
      <button class="btn" type="button" data-mp-checkout="${id}" hidden>Buy ${plan.label}</button>
      <a class="btn ghost" href="mailto:institutions@noshashi.app?subject=${encodeURIComponent(`Rippling Exposure API: ${plan.label} plan`)}">Request ${plan.label} invoice</a>
    </article>`).join("")}</div>
  <p><a href="/rippling/#plans">See Rippling API requests and plan limits</a></p>
</section>
<section id="lab" class="mp-section" aria-labelledby="lab-title">
  <h2 id="lab-title">Live API workbench</h2>
  <p>Enter a public XRPL address or transaction hash. Copy the request into your integration.</p>
  <div class="mp-grid mp-lab">
    <form class="panel mp-form" id="mp-request">
      <label for="mp-tool">API</label>
      <select id="mp-tool">
        ${catalog.filter((item) => item.tool).map((item) => `<option value="${item.tool}">${item.name}</option>`).join("")}
      </select>
      <div class="mp-fields" id="mp-account-fields">
        <label for="mp-address" id="mp-address-label">Destination account</label>
        <input id="mp-address" required pattern="r[1-9A-HJ-NP-Za-km-z]{24,34}" autocomplete="off" spellcheck="false" value="rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B">
      </div>
      <div class="mp-fields" id="mp-tag-fields">
        <label for="mp-tag">Destination tag (optional)</label>
        <input id="mp-tag" type="number" step="1" min="0" max="4294967295">
      </div>
      <div class="mp-fields" id="mp-hash-fields" hidden>
        <label for="mp-hash">Transaction hash</label>
        <input id="mp-hash" disabled required maxlength="64" pattern="[0-9a-fA-F]{64}" autocomplete="off" spellcheck="false">
      </div>
      <fieldset id="mp-asset" hidden disabled>
        <legend>Issued asset</legend>
        <label for="mp-currency">Currency code</label>
        <input id="mp-currency" required maxlength="40" value="USD" spellcheck="false">
        <label for="mp-size">Exit size in token units (optional)</label>
        <input id="mp-size" type="number" step="any" min="0" max="1000000000000000" value="1000">
      </fieldset>
      <button class="btn" type="submit">Run live check</button>
    </form>
    <div class="panel">
      <label for="mp-language">Request format</label>
      <select id="mp-language"><option value="curl">cURL</option><option value="js">JavaScript</option><option value="python">Python</option></select>
      <pre><code id="mp-code"></code></pre>
      <button class="btn ghost" type="button" id="mp-copy">Copy request</button>
      <p id="mp-copy-status" role="status"></p>
      <h3>Response</h3>
      <p id="mp-response-status" role="status">Run a check to see the API response.</p>
      <pre id="mp-result" hidden></pre>
      <div class="mp-actions">
        <button class="btn ghost" type="button" id="mp-download" hidden>Download JSON</button>
        <a id="mp-verify-result" href="#verify" hidden>Check this receipt</a>
      </div>
    </div>
  </div>
  <noscript><p>JavaScript is required for the workbench. You can call these endpoints using the <a href="/developers/">developer examples</a>.</p></noscript>
</section>
<section id="verify" class="mp-section" aria-labelledby="verify-title">
  <h2 id="verify-title">Ledger receipt checker</h2>
  <p>Paste an Asset Risk, Destination Preflight, or Payment Receipt response to check whether its contents match its SHA-256 receipt. This runs in your browser. To detect tampering by someone who can also rewrite the receipt, compare against a digest you saved separately.</p>
  <form class="panel mp-form" id="mp-receipt">
    <label for="mp-json">API response JSON</label>
    <textarea id="mp-json" rows="6" required spellcheck="false"></textarea>
    <label for="mp-digest">Previously saved SHA-256 digest (optional)</label>
    <input id="mp-digest" pattern="[0-9a-fA-F]{64}" maxlength="64" spellcheck="false" autocomplete="off">
    <button class="btn" type="submit">Check receipt</button>
    <p id="mp-receipt-status" role="status"></p>
  </form>
</section>
<section id="catalog" class="mp-section" aria-labelledby="catalog-title">
  <h2 id="catalog-title">Reports and monitoring</h2>
  <div class="mp-grid">
    <article class="panel"><h3>Issuer Watch</h3><p>Subscribe for email alerts when an issuer changes ledger settings such as freeze rights, keys or fees.</p><a class="btn" href="/watch/">Subscribe for $${WATCH_MONTHLY_CENTS / 100}/month</a></article>
    <article class="panel"><h3>Ledger Evidence Report</h3><p>Order a report covering the public issuer or wallet activity you select.</p><a class="btn ghost" href="/evidence-report/">View reports and buy</a></article>
  </div>
</section>
<section class="mp-section" aria-labelledby="feedback-title">
  <h2 id="feedback-title">Building something on XRPL?</h2>
  <p>Tell us which ledger check you want to integrate and how often you need it.</p>
  <div class="mp-actions"><a class="btn" href="/contact/?topic=institutions">Request an integration walkthrough</a><button id="mp-share" class="btn ghost" type="button">Copy marketplace link</button></div>
  <p id="mp-share-status" role="status"></p>
</section>`;

  await write("marketplace/index.html", renderPage({
    title: "XRPL API Marketplace | NOSHASHI",
    description: "Try live XRP Ledger APIs, verify Asset Risk receipts, integrate payment reconciliation, and compare NOSHASHI fleet scanning and monitoring plans.",
    path: "/marketplace/",
    current: "marketplace",
    head: '<link rel="stylesheet" href="/assets/marketplace.css">',
    body,
    scripts: '<script type="module" src="/assets/marketplace.mjs"></script>',
    structured: [breadcrumb("API Marketplace", "/marketplace/")],
  }));
}
