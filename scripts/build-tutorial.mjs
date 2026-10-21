/*
 * /tutorial/: every screen in the desktop app, in the order of its
 * sidebar, with what it answers, how to use it, and the plan it needs.
 *
 * Screen names are the app's own labels (src/App.tsx SCENES), and each
 * plan is the one the app's gate asks for (src/lib/billing/catalog.ts:
 * "desk" is sold as Pro). Screenshots are real: captured from the app on
 * live mainnet by scripts/capture-app-shots.mjs, with the ledger they
 * were read at in the caption. A screen without one is shown without a
 * picture rather than with a mockup.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderPage, breadcrumb } from "../api/_lib/shell.js";
import { esc } from "../api/_lib/html.js";

const FREE = "Free";
const PRO = "Pro";
const INST = "Institutional";
const ENT = "Enterprise";

// [app label, plan, what it answers, steps, screenshot name]
const GROUPS = [
  ["overview", "Overview", "Where you start, and the live state of the ledger.", [
    ["Overview", FREE, "What NOSHASHI checks, and the ledger it is reading right now.", [
      "Check the top bar says <b>ONLINE</b> and shows the latest ledger.",
      "Read the three cards: can it move, can you sell it, can you prove it. The middle one is a live order book.",
      "Use <b>Run a gate check</b>, <b>Open the audit trail</b> or <b>Ask the agent</b> to jump straight in.",
    ], "overview"],
    ["Mission Control", FREE, "Every validated ledger as it closes, through the lens of your role.", [
      "Pick a lens at the top: Executive, Compliance, Risk, Trading or Operations.",
      "Watch ledgers, credentials and settlement paths update as each ledger closes.",
      "Press <b>Run gate check</b> to test a payment from here.",
    ], "control"],
  ]],
  ["compliance", "Compliance", "Can this payment or asset move under your rules?", [
    ["Verification", FREE, "GO, HOLD or NO-GO for a payment, before anyone signs it.", [
      "Paste the destination account and enter an amount (or tap 100, 1,000, 25,000 or 500,000).",
      "Pick a rule profile, for example US_REGULATED_DEX.",
      "Press <b>Run compliance gate</b> (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd>). Read the verdict, each rule's pass or fail, and the receipt.",
    ], "verification", "#first-check"],
    ["Ledger Watch", ENT, "Screen deposits before you credit them.", [
      "Add your deposit addresses, each with a label.",
      "Every incoming payment is judged: what really arrived, whether the token is genuine, phishing dust, and who funded the sender up to three hops back.",
      "Receive the results as signed webhooks and a feed.",
    ]],
    ["Credentials", FREE, "Which on-ledger credentials (XLS-70) an account holds.", [
      "Paste a counterparty address, and the issuer's if you know it.",
      "Press <b>Read</b>.",
      "See each credential, who issued it and whether it is still valid. Switch between Grid and Table.",
    ]],
    ["Domain Grid", FREE, "Every permissioned domain (XLS-80) on mainnet, and who qualifies.", [
      "Browse the list, or paste a domain ID or owner address and press <b>Read live</b>.",
      "Open a domain to see the credentials it requires.",
      "Paste a counterparty and press <b>Check</b> to see whether it would be admitted.",
    ], "domains"],
    ["Provenance", PRO, "How old an account is and who funded it.", [
      "Paste the account (r…).",
      "Read when it was created and who sent its first XRP.",
      "Follow the funding chain as far as the node can prove it.",
    ]],
    ["Authority", PRO, "What an asset's issuer can still do to it.", [
      "Paste the issuer (r…).",
      "Read freeze, clawback and signing powers, and how concentrated the holdings are.",
      "Keep the digest: anyone can re-check the same reading later.",
    ]],
    ["Security Center", FREE, "Protect an account, check who you are paying, and recover from a theft.", [
      "Pick a tool from the tabs along the top. Start with <b>Account check</b>: paste your own address and press <b>Check</b>.",
      "Read the grade and each finding in plain English. Fixes come as unsigned transactions you copy and sign in your own wallet.",
      "Before paying someone, use <b>Pre-sign check</b> or <b>Safe send</b>. If an account was drained, use <b>Recover funds</b> or <b>Incident response</b>. Tabs that need a paid plan say so.",
    ], "security"],
  ]],
  ["liquidity", "Liquidity", "Is there real depth to buy or sell?", [
    ["Exposure Analysis", PRO, "Freeze rights, Travel Rule scope and counterparty concentration.", [
      "Load a wallet.",
      "See which issuers could freeze what it holds.",
      "See which payments fall under the Travel Rule, and where exposure is concentrated.",
    ]],
    ["Order Book", PRO, "How much of the quoted depth can actually fill.", [
      "Enter a currency code (for example USD) and its issuer.",
      "Compare <b>quoted</b> against <b>can fill</b> on each side.",
      "Offers whose owners no longer hold the asset are not counted.",
    ]],
    ["Pool Governance", PRO, "Who controls an AMM pool's trading fee.", [
      "Paste the AMM's account (r…).",
      "See each fee vote and the share of liquidity behind it.",
      "See who holds the auction slot, and its discount, right now.",
    ]],
    ["Portfolio & Radar", PRO, "Many wallets, one rule set, failures first.", [
      "Add wallets with a label, for example Treasury · hot wallet.",
      "Each one is checked against the same rules.",
      "Failures are listed first, so you know where to look.",
    ]],
  ]],
  ["evidence", "Evidence", "Can you prove what happened?", [
    ["Audit Trail", FREE, "An account's validated history, with what each payment really delivered.", [
      "Paste the account and press <b>Read history</b>. Set the <b>Flag at or above</b> amount if you need one.",
      "Filter by All, In, Out or Flagged, or search by hash, tag or memo.",
      "Press <b>Export evidence</b> for a file with a SHA-256 manifest.",
    ], "audit"],
    ["Ledger & Policy", PRO, "Every verdict you have run, your policy, and a signed export.", [
      "Write or activate your institution's policy.",
      "Every verdict is kept on this device with the rules that produced it.",
      "Export a signed record an examiner can verify.",
    ]],
    ["Settlement", PRO, "What a transaction actually delivered, not what it asked for.", [
      "Paste the transaction hash (64 characters).",
      "Compare the requested amount with the delivered amount.",
      "Partial payments are called out, so you never credit the wrong figure.",
    ]],
  ]],
  ["issuers", "Issuers & treasury", "Who controls a treasury, and who holds your tokens?", [
    ["Control Surface", PRO, "Who can move a treasury.", [
      "Paste the treasury account.",
      "See its signers and the quorum it needs, and whether the master key is on.",
      "See how much of the balance is locked and cannot be spent.",
    ]],
    ["Issuance", INST, "Who holds an issuer's tokens.", [
      "Paste the issuer.",
      "See how concentrated holdings are, plus dormant lines and freezes.",
      "Review its enforcement history.",
    ]],
    ["Passport", ENT, "A signed, portable record of an asset's posture.", [
      "Enter the issuer.",
      "Get one signed record: authority, freeze rights, concentration and eligibility.",
      "Share it. Any counterparty can verify it without re-running the checks.",
    ]],
  ]],
  ["intelligence", "Intelligence", "Ask questions in plain English.", [
    ["NOSHX", FREE, "An assistant that reads the live ledger to answer you. Advisory only.", [
      "Type a question, paste a transaction hash, or tap a suggested question.",
      "Read the answer and the ledger reads it is based on.",
      "It runs on your device by default. You can choose another model under <b>Change runtime</b>.",
    ], "noshx"],
    ["Ledger Garden", PRO, "Follow the chain from issuer to asset to holder to transaction.", [
      "Paste an address or a transaction hash.",
      "Expand each branch. Every one is read from validated ledgers.",
      "Hand any point to NOSHX to ask about it.",
    ]],
  ]],
  ["public", "Public tools", "Free checks anyone can run.", [
    ["Check an Address", FREE, "What the ledger publishes about an account before you pay it.", [
      "Paste the address and press <b>Check this address</b>.",
      "Read <b>Things to know first</b>: freeze rights, transfer fees and the domain it claims.",
      "Free accounts get 10 checks a month.",
    ], "address"],
    ["Inbox", FREE, "What strangers have sent an account, and whether those tokens are real.", [
      "Paste the account and press <b>Read claims</b>.",
      "See each unsolicited offer and whether the token exists at all.",
      "Never act on a claim the ledger cannot back.",
    ]],
    ["Token Rights", FREE, "What an NFT's issuer can still do to it after you own it.", [
      "Paste the NFT's ID (64 characters).",
      "Press <b>Read token rights</b>.",
      "See whether the issuer can burn it, whether it can be resold, and the issuer's cut of each sale.",
    ]],
    ["Ledger Sync", FREE, "What four public nodes each report, and where they disagree.", [
      "Open the screen. Nothing to enter.",
      "Compare each node's latest ledger and timing.",
      "A node that lags is shown, so you know which reading to trust.",
    ], "sync"],
    ["Learn", FREE, "Hands-on labs and short explainers.", [
      "Pick a lab. Each one walks you through a real screen with real mainnet data.",
      "Each right answer comes back for a short review after 1, 3, 7, 16 and 35 days, so it sticks.",
      "Watch the explainers for the ideas behind the checks.",
    ], "learn"],
  ]],
  ["account", "Your account", "Plans, sign-in, security and settings.", [
    ["Pricing", FREE, "Plans, checkout and credits.", [
      "Compare Free, Pro, Institutional and Enterprise.",
      "Press <b>Get Pro</b> to subscribe. Checkout opens on Stripe in your browser.",
      "Buy credits for automated API checks.",
    ]],
    ["Account", FREE, "Your subscription, two-factor sign-in and API keys.", [
      "The app works without an account.",
      "Sign in to carry a subscription, portfolios and API keys.",
      "Turn on two-factor authentication here.",
    ]],
    ["Trust & Security", FREE, "What NOSHASHI reads, what it never does, and where your data goes.", [
      "Read each claim, for example that it never signs or broadcasts.",
      "Each one says how it is enforced and tested.",
    ]],
    ["Settings", FREE, "Appearance, accessibility and the desktop app.", [
      "Choose dark, light or system theme, and reduced motion.",
      "Set the wallet you want to watch.",
      "Turn on the menu bar HUD (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>).",
    ]],
  ]],
];

const PLAN_CLASS = { [FREE]: "free", [PRO]: "pro", [INST]: "inst", [ENT]: "ent" };
const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function shotFigure(manifest, name) {
  const shot = manifest?.shots?.find((s) => s.name === name);
  if (!shot) return "";
  const when = shot.captured_at ? new Date(shot.captured_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
  const where = shot.ledger ? `ledger ${shot.ledger.toLocaleString("en-US")}` : "XRPL mainnet";
  return `<figure class="tu-shot">
        <img src="/assets/shots/${name}.webp" srcset="/assets/shots/${name}.webp 1440w, /assets/shots/${name}@2x.webp 2880w" sizes="(min-width:1100px) 760px, 100vw"
          width="1440" height="900" alt="${esc(shot.alt)}" loading="lazy" decoding="async">
        <figcaption>Live on XRPL mainnet · ${esc(where)}${when ? ` · ${esc(when)}` : ""}</figcaption>
      </figure>`;
}

function feature(manifest, [label, plan, answers, steps, shot, more]) {
  return `<article class="tu-feature" id="${slug(label)}">
      <div class="tu-fhead"><h3>${esc(label)}</h3><span class="tu-plan ${PLAN_CLASS[plan]}">${plan}</span></div>
      <p class="tu-answers">${esc(answers)}</p>
      <ol class="tu-steps">${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
      ${more ? `<p class="tu-more"><a href="${more}">Full walkthrough &rarr;</a></p>` : ""}
      ${shot ? shotFigure(manifest, shot) : ""}
    </article>`;
}

export async function buildTutorial(write, { site }) {
  const manifest = JSON.parse(await readFile(path.join(site, "assets/shots/manifest.json"), "utf8").catch(() => "null"));
  const count = GROUPS.reduce((n, g) => n + g[3].length, 0);
  const free = GROUPS.reduce((n, g) => n + g[3].filter((f) => f[1] === FREE).length, 0);

  const toc = `<nav class="tu-toc" aria-label="On this page">
    <p class="tu-toc-h">On this page</p>
    <ol>
      <li><a href="#start">Get started</a></li>
      <li><a href="#first-check">Your first check</a></li>
      ${GROUPS.map(([id, title]) => `<li><a href="#${id}">${esc(title)}</a></li>`).join("\n      ")}
      <li><a href="#keys">Shortcuts</a></li>
      <li><a href="#questions">Questions</a></li>
    </ol>
  </nav>`;

  const body = `<div class="tu-hero">
  <p class="eyebrow">Desktop app tutorial</p>
  <h1>Learn NOSHASHI in ten minutes.</h1>
  <p>Every screen in the app, what it answers, and how to use it in three steps. ${free} of the ${count} screens are free.</p>
  <p class="cta"><a class="btn" href="/#download">Download the app</a><a class="btn ghost" href="/app/">Try it in the browser</a></p>
</div>

<div class="tu-layout">
  ${toc}
  <div class="tu-body">

  <section id="start" class="tu-section">
    <h2>Get started</h2>
    <ol class="tu-cards">
      <li><b>Install it.</b> Download for macOS, Windows or Linux. The builds are not code-signed yet. On a Mac, right-click the app and choose <b>Open</b> the first time. On Windows, choose <b>More info</b> then <b>Run anyway</b>.</li>
      <li><b>Press Get started.</b> The app connects to the XRP Ledger. The top bar reads <b>ONLINE</b> when it is live.</li>
      <li><b>Pick a view.</b> <b>Executive</b> shows the eight key screens. <b>Analyst</b> shows every tool. Switch any time at the top of the sidebar.</li>
      <li><b>Jump anywhere.</b> Press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> and type a screen, a wallet or a command.</li>
    </ol>
    <p class="tu-note">NOSHASHI only reads the ledger. It never asks for a private key or seed phrase, and it never signs anything.</p>
  </section>

  <section id="first-check" class="tu-section">
    <h2>Your first check</h2>
    <p class="tu-lede">Find out whether a payment can go ahead, before anyone signs it.</p>
    <ol class="tu-steps big">
      <li>Open <b>Verification</b> in the sidebar.</li>
      <li>Paste the account you would pay into <b>Destination account</b>.</li>
      <li>Enter the amount in XRP, or tap 100, 1,000, 25,000 or 500,000.</li>
      <li>Pick a rule profile under <b>Rule profile</b>. Each one lists the credentials it requires.</li>
      <li>Press <b>Run compliance gate</b>.</li>
    </ol>
    ${shotFigure(manifest, "verification")}
    <div class="tu-verdicts">
      <div><span class="t-go">GO</span><p>Every blocking rule passed.</p></div>
      <div><span class="t-hold">HOLD</span><p>Blocking rules passed, but an advisory rule failed. Someone should sign it off.</p></div>
      <div><span class="t-nogo">NO-GO</span><p>A blocking rule failed. Do not send it.</p></div>
    </div>
    <p>Under the verdict, each rule shows <b>Pass</b> or <b>Fail</b> with the reason. The <b>cryptographic receipt</b> (SHA-256) proves which facts and rules produced the result. Every run is kept in the <b>Session log</b>.</p>
  </section>

  ${GROUPS.map(([id, title, intro, features]) => `<section id="${id}" class="tu-section">
    <h2>${esc(title)}</h2>
    <p class="tu-lede">${esc(intro)}</p>
    ${features.map((f) => feature(manifest, f)).join("\n    ")}
  </section>`).join("\n\n  ")}

  <section id="keys" class="tu-section">
    <h2>Shortcuts</h2>
    <table class="tu-keys">
      <tbody>
        <tr><th scope="row"><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd></th><td>Search screens, wallets and commands</td></tr>
        <tr><th scope="row"><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd></th><td>Run the compliance gate on Verification</td></tr>
        <tr><th scope="row"><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>1</kbd>…<kbd>9</kbd></th><td>Jump to a screen</td></tr>
        <tr><th scope="row"><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>R</kbd></th><td>Re-read the ledger</td></tr>
        <tr><th scope="row"><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd></th><td>Show or hide the menu bar HUD</td></tr>
      </tbody>
    </table>
  </section>

  <section id="questions" class="tu-section">
    <h2>Questions</h2>
    <details><summary>Do I need a wallet, a key or an account?</summary><p>No. The app reads public ledger data. It never asks for a private key or seed phrase and never signs. An account is only needed to carry a paid plan, portfolios or API keys.</p></details>
    <details><summary>What does a screen marked Pro, Institutional or Enterprise do if I am on Free?</summary><p>It shows what it does and offers <b>Sign in</b> or <b>See plans</b>. Nothing is hidden behind a fake preview. Prices are on the <a href="/pricing/">pricing page</a>.</p></details>
    <details><summary>The top bar says DEGRADED or RECONNECTING.</summary><p>DEGRADED means one public node is behind the others. It usually clears within a few ledgers. RECONNECTING means the link dropped, and nothing is shown as live until it is back. Press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>R</kbd> to re-read.</p></details>
    <details><summary>Where is my data kept?</summary><p>Verdicts, policies and settings stay on your device. The <b>Trust &amp; Security</b> screen lists exactly what is read and where anything goes.</p></details>
    <details><summary>I am stuck.</summary><p>Open <b>NOSHX</b> and use the <b>Support</b> tab, or <a href="/contact/">contact us</a>. The <b>Learn</b> screen has hands-on labs for each part of the app.</p></details>
  </section>

  </div>
</div>`;

  await write("tutorial/index.html", renderPage({
    title: "Desktop app tutorial · NOSHASHI",
    description: "Learn the NOSHASHI desktop app in ten minutes: every screen, what it answers, how to use it in three steps, and which plan it needs.",
    path: "/tutorial/",
    current: "resources",
    head: `<link rel="stylesheet" href="/assets/tutorial.css">`,
    body,
    structured: [breadcrumb("Desktop app tutorial", "/tutorial/")],
  }));
}

export const TUTORIAL_PAGES = [["/tutorial/", "monthly", "0.8"]];
