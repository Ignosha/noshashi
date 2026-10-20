/*
 * /brief/ — the product brief: what NOSHASHI fixes on the XRP Ledger, how
 * it earns, and every feature in the current build.
 *
 * The data is exported so tests/brief.test.js can hold it to its sources:
 * every screen in the app's navigation (src/App.tsx) has a row here, and
 * every price matches the billing catalogue that drives checkout
 * (src/lib/billing/catalog.ts). A brief that lists a screen the app does
 * not have, or a price checkout does not charge, fails the build.
 *
 * The one figure on the page is read live in the browser from /api/book,
 * with its ledger index, so the brief never quotes a stale number.
 */

import { renderPage, breadcrumb } from "../api/_lib/shell.js";
import { esc } from "../api/_lib/html.js";

const BITSTAMP = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";

/** The ledger's problems, what NOSHASHI does about each, and where. */
export const PROBLEMS = [
  {
    problem: "Holders cannot see what an issuer can still do to a token",
    detail: "An issuer can keep the power to freeze a balance, claw it back, or require its approval to hold the token at all. A wallet shows none of this.",
    answer: "Reads the issuer's own account flags and signer list from validated ledger state and states each power plainly, with the ledger index it was read at and a digest anyone can recompute.",
    where: ["Authority certificate", "Issuer badge", "Issuer alerts", "AUTHORITY", "EXPOSURE ANALYSIS"],
  },
  {
    problem: "Order books advertise depth that nobody can fill",
    detail: "An offer stays on the book at its full size after its owner has spent the money behind it. Depth summed from the advertised sizes can be many times what would actually trade.",
    answer: "Counts only what each offer's owner still holds (taker_gets_funded), within a stated band around the mid, and shows quoted and fillable side by side.",
    where: ["ORDER BOOK", "Treasury report", "EXPOSURE ANALYSIS"],
  },
  {
    problem: "A payment can deliver far less than it says",
    detail: "A partial payment can state 1,000,000 USD and deliver 0.000001 USD. Tools that record the stated amount record money that never arrived.",
    answer: "Reads the delivered amount the ledger recorded, flags partial payments, and screens deposits on what arrived before they are credited.",
    where: ["SETTLEMENT", "LEDGER WATCH", "Delivered-amount export"],
  },
  {
    problem: "Counterfeit tokens, phishing dust and lookalike addresses",
    detail: "Anyone can issue a token called USD. A drop of dust can carry a link. An address can be made to match the first and last characters of a real one.",
    answer: "Flags a familiar ticker whose issuer owes nothing, dust carrying a link, lookalike addresses, and senders funded by a sanctioned account up to three hops back.",
    where: ["LEDGER WATCH", "CHECK AN ADDRESS", "INBOX", "SECURITY CENTER", "PROVENANCE"],
  },
  {
    problem: "Who can move an account is easy to misread",
    detail: "A signer list is a weighted vote, not a headcount. A regular key signs alone. An account with no usable key cannot move at all.",
    answer: "Lists every route to a signature (master key, regular key, signer list counted by weight) and leads with the weakest, which is the one an auditor has to rely on.",
    where: ["CONTROL SURFACE", "Treasury report"],
  },
  {
    problem: "A compliance check is a private log nobody else can verify",
    detail: "When a firm says it checked a counterparty, there is usually no way to prove the check ran, on what data, or under which rules.",
    answer: "Every verdict is GO, HOLD or NO-GO with the rule that decided it, sealed in a SHA-256 receipt over the ledger index, the rules and the policy version, and written to an append-only audit log.",
    where: ["VERIFICATION", "LEDGER & POLICY", "AUDIT TRAIL"],
  },
  {
    problem: "One public server can be wrong",
    detail: "Public XRPL servers lag, rate-limit and occasionally disagree. A reading from one server is only as good as that server.",
    answer: "Reads only validated ledgers, compares several public servers, and issues no GO when the sources it needs do not agree.",
    where: ["LEDGER SYNC", "MISSION CONTROL"],
  },
  {
    problem: "New compliance primitives are hard to read",
    detail: "XLS-70 credentials and XLS-80 permissioned domains decide who may transact, but their state lives in raw ledger objects.",
    answer: "Resolves credential acceptance, expiry and revocation from ledger flags, and shows what each domain requires and how far a wallet is from meeting it.",
    where: ["CREDENTIALS", "DOMAIN GRID"],
  },
  {
    problem: "Regulatory scoping is done by hand",
    detail: "Travel Rule thresholds and counterparty concentration are worked out in spreadsheets, after the fact.",
    answer: "Marks which settlements cross the Travel Rule (FATF R.16) threshold in a chosen jurisdiction and lack counterparty data, and scores concentration with the Herfindahl-Hirschman Index.",
    where: ["EXPOSURE ANALYSIS", "PORTFOLIO & RADAR"],
  },
];

/** Plans as checkout sells them (src/lib/billing/catalog.ts). */
export const PLANS = [
  { id: "operator", name: "Free", price: "Free", cadence: "forever", annual: null, buyer: "Developers, analysts and individual holders", gets: "The desktop console, unlimited gate checks by a person, the on-device agent, CSV export and every free tool on this site." },
  { id: "desk", name: "Pro", price: "$749", cadence: "per seat / month", annual: "$7,490 / year", buyer: "Trading desks and analyst teams", gets: "Portfolios, alerts, the receipt vault, issuer analysis, an institutional policy, stress testing, incident response and the Compliance API with 5,000 verifications a month." },
  { id: "institution", name: "Institutional", price: "$4,000", cadence: "per month", annual: "$40,000 / year", buyer: "Regulated firms and exchange compliance teams", gets: "Everything in Pro, plus 100,000 API verifications a month, webhooks, regulator seats, Travel Rule scoping, offline adjudication, signed exports, the immutable audit log, bulk monitoring, custom alerts and proof of reserves." },
  { id: "enterprise", name: "Enterprise", price: "$10,000", cadence: "per month", annual: "$120,000 / year", buyer: "Large exchanges, banks and custodians", gets: "Everything in Institutional, plus deposit and withdrawal screening, asset passports, forensic trace, market surveillance, Customer Asset Protection and the embeddable screening widget." },
  { id: "strategic", name: "Strategic Infrastructure", price: "$20,833", cadence: "per month", annual: "$250,000 / year", buyer: "Institutions building their own XRPL data layer", gets: "Everything in Enterprise, plus XRPL event feeds, custom schemas and bulk export, protection monitoring, the phishing link feed and Security Guardian." },
];

/** Every paid feature, with the plan that first includes it (FEATURE_CATALOG in the catalogue). */
export const PAID_FEATURES = [
  ["Multi-wallet portfolios", "desk", "Watch a book of accounts at once, with a live gate verdict on each."],
  ["Drift and expiry alerts", "desk", "Know when a domain tightens or a credential is about to lapse."],
  ["Receipt vault", "desk", "Every verdict stored, searchable and exportable months later."],
  ["Issuer freeze-rights analysis", "desk", "Which balances an issuer can immobilise without notice."],
  ["Counterparty concentration", "desk", "How much of the book rests on one counterparty, by the HHI index."],
  ["Persistent adjudication ledger", "desk", "Every verdict kept on disk for when an examiner asks."],
  ["Institutional policy", "desk", "Your own versioned thresholds, simulated against past verdicts before activation and named in every receipt."],
  ["Issuer drift monitor", "desk", "Re-reads every issuer you hold and alerts when its flags change."],
  ["Authority certificate", "desk", "Seven questions about an issuance, answered at a named ledger index and digested."],
  ["Compliance API", "desk", "Your own systems ask the gate the same question through API keys."],
  ["Redemption stress testing", "desk", "What the book would realise as cash across DEX and AMM, with frozen balances discounted."],
  ["Incident response", "desk", "For a drained account: what changed, where the value went hop by hop, the real recovery paths, and a dossier."],
  ["Asset recovery suite", "desk", "Stuck-funds and exposure scans across many addresses, valuation at the live bid, and the scam cluster mapper."],
  ["Offline adjudication", "institution", "Adjudicate on a segregated network from captured validated state."],
  ["Signed audit export", "institution", "A SHA-256 digest over the exact bytes of every export."],
  ["Travel Rule scoping", "institution", "Transfers over the FATF R.16 threshold that lack counterparty data."],
  ["Webhooks", "institution", "Revocation, drift and alert events pushed into your systems."],
  ["Regulator seats", "institution", "Scoped, time-boxed read-only access for an examiner."],
  ["Immutable audit log", "institution", "Append-only record of who changed what, and when."],
  ["Bulk portfolio monitoring", "institution", "Unlimited watched wallets with scheduled stress runs."],
  ["Custom alert logic", "institution", "Your own triggers over measured facts, sent where you choose."],
  ["Proof of reserves", "institution", "A Merkle sum tree built on your machine, with reserve accounts attested daily from the ledger."],
  ["Shared scam registry", "institution", "Reviewed scam reports that screen deposits and withdrawals for every organization."],
  ["Single sign-on (coming soon)", "institution", "Not available yet; sign-in is by email, password and two-factor authentication."],
  ["Asset passports", "enterprise", "A signed, portable record of an asset's posture any counterparty can verify."],
  ["Forensic trace", "enterprise", "Incident response at investigator depth: five hops, custodial landings and sanctioned addresses named."],
  ["Customer Asset Protection", "enterprise", "A protection fund verified on the ledger, with a public page customers can check. Verification, not insurance."],
  ["Withdrawal screening", "enterprise", "Every outbound payment checked before it is signed, including lookalike and sanctioned destinations."],
  ["Market surveillance", "enterprise", "An issuer's order-book history read for manipulation indicators, with the transactions behind each."],
  ["Embeddable screening widget", "enterprise", "One script tag that lets customers check an address is really yours before they pay."],
  ["Deposit screening", "enterprise", "Every incoming payment judged before it is credited, on what actually arrived."],
  ["Dedicated environment (coming soon)", "enterprise", "Not offered yet; scoped per contract after architecture review."],
  ["Protection monitoring", "strategic", "A signed alert when reserves fall below customer balances."],
  ["Phishing link feed", "strategic", "Every domain advertised in XRPL micro-payment memos, read every minute, as an API feed."],
  ["Security Guardian", "strategic", "A signed alert within a minute of a watched account's keys or signer list changing."],
  ["XRPL event feeds", "strategic", "Up to 100 accounts read every minute, as signed webhooks and a JSON/NDJSON feed with history."],
  ["Custom schemas & bulk export", "strategic", "Your own record shapes and retention from 7 days to 10 years."],
];

/** Prepaid API verifications (CREDIT_PACKS in the catalogue). */
export const PACKS = [
  { id: "credits-10k", checks: "10,000", price: "$450", unit: "$0.045 each" },
  { id: "credits-50k", checks: "50,000", price: "$2,000", unit: "$0.040 each" },
  { id: "credits-250k", checks: "250,000", price: "$8,750", unit: "$0.035 each" },
];

/** Every screen in the desktop app, in the navigation's own sections (src/App.tsx). */
export const FEATURE_GROUPS = [
  { section: "OVERVIEW", items: [
    ["OVERVIEW", "What NOSHASHI is, what it does, and what is coming."],
    ["MISSION CONTROL", "Live mainnet telemetry and the wallet gate."],
  ] },
  { section: "COMPLIANCE", items: [
    ["VERIFICATION", "Run a settlement through the compliance gate and get GO, HOLD or NO-GO with the deciding rule."],
    ["LEDGER WATCH", "Screen deposits before you credit them; watch accounts every minute with signed webhooks and a feed."],
    ["CREDENTIALS", "The XLS-70 credential registry: acceptance, expiry and revocation read from the ledger."],
    ["DOMAIN GRID", "XLS-80 permissioned domains: what each requires and how far a wallet is from it."],
    ["PROVENANCE", "Account age and funding source: who this counterparty came from."],
    ["AUTHORITY", "What the issuer of an asset can still do to it, digested so the reading can be re-checked."],
    ["SECURITY CENTER", "Harden an account against takeover, catch lookalike addresses, and investigate a drained account."],
  ] },
  { section: "LIQUIDITY", items: [
    ["EXPOSURE ANALYSIS", "Issuer freeze rights, Travel Rule scope and counterparty concentration."],
    ["ORDER BOOK", "How much quoted depth is backed by someone who still holds the asset."],
    ["POOL GOVERNANCE", "Who votes an AMM's fee, on what share of liquidity, and who holds the discount."],
    ["PORTFOLIO & RADAR", "Multi-wallet surveillance, the compliance radar and scheduled stress monitoring."],
  ] },
  { section: "EVIDENCE", items: [
    ["AUDIT TRAIL", "Wallet history with compliance metadata, exportable to CSV."],
    ["LEDGER & POLICY", "Adjudication history, the institution's own policy, and signed export."],
    ["SETTLEMENT", "What a transaction actually delivered, not what it requested."],
  ] },
  { section: "ISSUERS & TREASURY", items: [
    ["CONTROL SURFACE", "Who can move a treasury: signers, quorum, master key and locked reserve."],
    ["ISSUANCE", "Holder concentration and enforcement history for any issuance."],
    ["PASSPORT", "A signed, portable record of an asset's posture: authority, freeze rights and concentration."],
  ] },
  { section: "INTELLIGENCE", items: [
    ["NOSHX", "A compliance agent that reads the live ledger with the app's own read-only tools, on its own engine or a model you choose."],
    ["LEDGER GARDEN", "Walk issuer, asset, holder, transaction and evidence, then ask the agent."],
  ] },
  { section: "PUBLIC TOOLS", items: [
    ["CHECK AN ADDRESS", "Read what the ledger publishes about any account before you pay it."],
    ["INBOX", "Unsolicited claims addressed to an account, and whether the tokens exist."],
    ["TOKEN RIGHTS", "What an NFT's issuer can still do to it after you own it."],
    ["LEDGER SYNC", "What four public nodes each report, and where they disagree."],
    ["LEARN", "Hands-on labs with spaced review, plus short animated explainers."],
  ] },
  { section: "ACCOUNT AND SETTINGS", items: [
    ["PRICING", "Plans, checkout and verification credits."],
    ["ACCOUNT", "Subscription, two-factor authentication and API keys."],
    ["TRUST & SECURITY", "What NOSHASHI reads, what it never does, and where data goes."],
    ["LEGAL & ACCESSIBILITY", "Policies, the accessibility statement and contact routes."],
    ["SETTINGS", "Appearance, accessibility, wallet and desktop integration."],
  ] },
];

/** What runs underneath the screens. */
export const PLATFORM = [
  ["SHA-256 receipts", "Every verdict hashed over a canonical body, so an auditor can prove a check ran and was not edited."],
  ["Local adjudication ledger", "Every verdict written to disk on the operator's machine; it survives a restart and never leaves it."],
  ["Operator-owned policy", "Concentration limits, reserve headroom, Travel Rule thresholds and freeze handling, versioned and editable."],
  ["Offline adjudication", "Capture validated state while connected and adjudicate on a segregated network, with the capture's age on every verdict."],
  ["Organizations and roles", "Owner, admin, analyst, compliance, risk, reviewer, auditor and viewer roles, plus API and regulator seats, enforced by the database, with four-eyes approval: a policy is never activated by its author."],
  ["Regulator seats", "A read-only seat for an examiner for 1 to 180 days, ended by itself and recorded in the audit log."],
  ["Compliance API and signed webhooks", "Scoped API keys, the same verdicts and receipts as the console, and events such as deposit_screened and custom_alert."],
  ["XRPL event feeds", "Watched accounts read every minute, delivered by webhook or pulled as JSON, NDJSON or CSV, with a history endpoint."],
  ["Append-only audit log", "Every export with its SHA-256, every verdict, setting change, scheduled run and fired alert."],
  ["White-label reports", "The organization's name and colour on the console, exported audit files and passports."],
  ["Two-factor sign-in", "On every account; API keys never enter the app window."],
  ["Binary integrity check", "Hashes the running app so an operator can confirm it was not altered after download. Free on every plan."],
  ["Menu bar residency", "The gate verdict one keystroke away on macOS, with native notifications."],
  ["Desktop on macOS, Windows and Linux", "Built in public by CI from the source on GitHub."],
];

/** The free tools on this site (each a page or an endpoint that answers today). */
export const WEB_TOOLS = [
  ["/certificate/", "Authority certificate", "What an issuer can still do, for any XRPL issuer, with a recomputable digest."],
  ["/badge/", "Issuer badge", "A live badge for a token page that links to the certificate."],
  ["/alerts/", "Issuer alerts", "A Discord message when an issuer's powers change."],
  ["/delivered/", "Delivered-amount export", "Every payment's stated and delivered amounts in a CSV, partial payments flagged."],
  ["/treasury/", "Treasury report", "Period-end holdings, who can move them, and what funded offers could absorb. Prints to PDF."],
  ["/xapp/", "Check an address", "Screen an address before you pay it, from any phone browser."],
  ["/developers/", "Public JSON endpoints", "/api/authority, /api/book, /api/issuer-state, /api/delivered and /api/treasury, free and without a key."],
  ["/learn/", "Learn NOSHASHI", "A free course on reading the ledger the way the product does."],
];

/** Not in the build yet. Stated so nobody has to ask. */
export const NOT_YET = [
  ["Selective disclosure proofs", "Proving one predicate (accredited, not sanctioned) without revealing the credential behind it. In progress."],
  ["Code signing and notarisation", "Builds are reproducible and hash-verified, but not yet signed. In progress."],
  ["Uptime SLA, single sign-on and dedicated environments", "Marked coming soon on every plan until they are funded."],
  ["SOC 2 report and independent security review", "Policies, a control map and an internal assessment exist; no SOC 2 report is held and no outside review has run."],
  ["JavaScript SDK on npm", "The SDK is in the repository (packages/sdk) and not yet published."],
];

const where = (list) => list.map((w) => `<span class="br-where">${esc(w)}</span>`).join(" ");

export async function buildBrief(write) {
  const problems = PROBLEMS.map(
    (p) => `<tr><th scope="row">${esc(p.problem)}<span class="br-detail">${esc(p.detail)}</span></th>
      <td>${esc(p.answer)}</td><td>${where(p.where)}</td></tr>`,
  ).join("");

  const plans = PLANS.map(
    (p) => `<tr><th scope="row">${esc(p.name)}</th><td class="br-price">${esc(p.price)}<small>${esc(p.cadence)}${p.annual ? ` · ${esc(p.annual)}` : ""}</small></td>
      <td>${esc(p.buyer)}</td><td>${esc(p.gets)}</td></tr>`,
  ).join("");

  const packs = PACKS.map((p) => `<tr><td>${esc(p.checks)} checks</td><td class="br-price">${esc(p.price)}</td><td>${esc(p.unit)}</td></tr>`).join("");

  const groups = FEATURE_GROUPS.map(
    (g) => `<div class="panel"><p class="num">${esc(g.section)}</p><dl class="br-list">${g.items
      .map(([name, what]) => `<dt>${esc(name)}</dt><dd>${esc(what)}</dd>`)
      .join("")}</dl></div>`,
  ).join("");

  const planName = Object.fromEntries(PLANS.map((p) => [p.id, p.name]));
  const paid = ["desk", "institution", "enterprise", "strategic"]
    .map((id) => `<div class="panel"><p class="num">FROM ${esc(planName[id].toUpperCase())}</p><dl class="br-list">${PAID_FEATURES.filter((f) => f[1] === id)
      .map(([name, , what]) => `<dt>${esc(name)}</dt><dd>${esc(what)}</dd>`)
      .join("")}</dl></div>`)
    .join("");

  const platform = PLATFORM.map(([name, what]) => `<dt>${esc(name)}</dt><dd>${esc(what)}</dd>`).join("");
  const web = WEB_TOOLS.map(([href, name, what]) => `<dt><a href="${esc(href)}">${esc(name)}</a></dt><dd>${esc(what)}</dd>`).join("");
  const notYet = NOT_YET.map(([name, what]) => `<dt>${esc(name)}</dt><dd>${esc(what)}</dd>`).join("");

  const body = `<div class="page-head">
  <p class="eyebrow">Product brief · beta</p>
  <h1>NOSHASHI: proof for every decision made on the XRP Ledger.</h1>
  <p>NOSHASHI is a read-only compliance and risk layer for the XRP Ledger. Before money moves it
     answers three questions: can this move under our policy, is there enough real liquidity to
     exit at the price we mark, and can we prove later why we said yes. It reads validated ledger
     state, never holds keys and never signs anything.</p>
  <p><a class="btn ghost" href="#problems">How it solves XRPL's problems</a>
     <a class="btn ghost" href="#revenue">Revenue model</a>
     <a class="btn ghost" href="#features">Every feature in the build</a></p>
</div>

<section id="problems">
  <div class="section-head">
    <p class="eyebrow">01</p>
    <h2>How it solves XRPL's problems</h2>
    <p>Each of these is a property of the ledger itself, not a bug in it. They become problems when a
       wallet, a spreadsheet or a compliance file reads the ledger the easy way.</p>
  </div>
  <div class="table-scroll"><table class="br-table"><thead><tr><th scope="col">The problem</th><th scope="col">What NOSHASHI does</th><th scope="col">Where</th></tr></thead>
    <tbody>${problems}</tbody></table></div>
  <div class="tool-out br-live" id="br-live" aria-live="polite">
    <p class="num">LIVE FROM MAINNET</p>
    <p id="br-live-text">Reading the XRP/USD.Bitstamp order book from the latest validated ledger…</p>
    <p class="br-small">Within 10% of the reference mid (a chosen parameter). DEX order book only; AMM pools are not included. At most 100 offers per side.
      <a href="/api/book?currency=USD&amp;issuer=${BITSTAMP}">Raw reading</a></p>
  </div>
</section>

<section id="revenue">
  <div class="section-head">
    <p class="eyebrow">02</p>
    <h2>Revenue model</h2>
    <p>NOSHASHI earns three ways: subscriptions by plan, prepaid API checks, and annual contracts for
       Enterprise and Strategic Infrastructure. The free tools on this site bring people in. Every paid
       plan sells proof that a check was done properly, never the customer's data.</p>
  </div>
  <div class="table-scroll"><table class="br-table"><thead><tr><th scope="col">Plan</th><th scope="col">Price</th><th scope="col">Who buys it</th><th scope="col">What they pay for</th></tr></thead>
    <tbody>${plans}</tbody></table></div>
  <div class="grid g2" style="margin-top:22px">
    <div class="panel"><p class="num">PREPAID API CHECKS</p>
      <p>For systems that call the Compliance API beyond their plan's allowance. A check run by a person in the console is never billed.</p>
      <div class="table-scroll"><table class="br-table br-compact"><tbody>${packs}</tbody></table></div></div>
    <div class="panel"><p class="num">HOW THE MODEL HOLDS TOGETHER</p>
      <p>The fee attaches to automation and to institutions, not to people checking an address. Annual
         prepay is the monthly price times ten for Pro and Institutional. Enterprise and Strategic are
         priced by the year. NOSHASHI holds no keys and no funds, so it never earns from custody, spreads
         or order flow.</p></div>
  </div>
  <p class="tool-note" style="margin-top:14px">Full plan comparison: <a href="/pricing/">pricing</a>. Prices are in US dollars and exclude tax.</p>
</section>

<section id="features">
  <div class="section-head">
    <p class="eyebrow">03</p>
    <h2>Every feature in the build</h2>
    <p>Every screen in the desktop app, grouped as the app groups them; every paid feature with the
       plan that includes it; what runs underneath; the free tools on this site; and what is not built yet.</p>
  </div>
  <h3 style="margin-top:8px">Every screen in the desktop app</h3>
  <div class="grid g2">${groups}</div>
  <h3 style="margin-top:28px">Every paid feature, by the plan that first includes it</h3>
  <div class="grid g2">${paid}</div>
  <h3 style="margin-top:28px">Underneath, free on this site, and not built yet</h3>
  <div class="grid g2">
    <div class="panel"><p class="num">UNDERNEATH EVERY SCREEN</p><dl class="br-list">${platform}</dl></div>
    <div class="panel"><p class="num">FREE ON THIS SITE, NO ACCOUNT</p><dl class="br-list">${web}</dl>
      <p class="num" style="margin-top:22px">NOT IN THE BUILD YET</p><dl class="br-list">${notYet}</dl></div>
  </div>
  <p class="tool-note" style="margin-top:14px">Source code, releases and the changelog are public on
    <a href="https://github.com/Ignosha/noshashi" rel="noopener">GitHub</a>. Build state, counted rather than claimed: <a href="/progress/">progress</a>.</p>
</section>`;

  const head = `<style>
.table-scroll{overflow-x:auto;max-width:100%}
.br-table{width:100%;border-collapse:collapse;font-size:14px}
.br-table th,.br-table td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--rule)}
.br-table thead th{font:12px "IBM Plex Mono",monospace;color:var(--faint);letter-spacing:.08em;text-transform:uppercase}
.br-table tbody th{font-weight:600;min-width:200px}
.br-detail{display:block;font-weight:400;color:var(--muted);font-size:13px;margin-top:6px;line-height:1.5}
.br-where{display:inline-block;font:11px "IBM Plex Mono",monospace;border:1px solid var(--rule);border-radius:var(--r);padding:2px 6px;margin:0 4px 4px 0;white-space:nowrap}
.br-price{white-space:nowrap;font-weight:600}
.br-price small{display:block;font-weight:400;color:var(--muted);font-size:12px}
.br-compact td{padding:6px 8px;font-size:13px}
.br-list{margin:0;display:grid;gap:4px}
.br-list dt{font-weight:600;margin-top:10px}
.br-list dd{margin:0;color:var(--muted);font-size:13.5px;line-height:1.55}
.tool-out{border:1px solid var(--rule);border-radius:var(--r);padding:18px 20px;margin:20px 0}
.br-small,.tool-note{color:var(--muted);font-size:12.5px;line-height:1.6}
</style>`;

  const script = `<script>
(function(){
  var out=document.getElementById("br-live-text"); if(!out)return;
  function n(v){return Number(v).toLocaleString("en-US",{maximumFractionDigits:0});}
  fetch("/api/book?currency=USD&issuer=${BITSTAMP}")
    .then(function(r){return r.ok?r.json():Promise.reject();})
    .then(function(b){
      var q=b.quoted&&b.quoted.ask, f=b.fillable&&b.fillable.ask;
      if(!(q>0)){out.textContent="The ask side had no offers within the band at ledger "+n(b.ledger_index)+".";return;}
      out.textContent="At ledger "+n(b.ledger_index)+", the ask side of XRP/USD.Bitstamp quoted "+n(q)+" USD. Of that, "+n(f)+
        " USD ("+(f/q*100).toLocaleString("en-US",{maximumFractionDigits:1})+"%) was held by the accounts making the offers. The rest could not fill.";
    })
    .catch(function(){out.textContent="The live reading could not be loaded just now. The raw reading link below fetches it directly.";});
})();
</script>`;

  await write("brief/index.html", renderPage({
    title: "Product brief — how NOSHASHI solves XRPL's problems, how it earns, and every feature",
    description: "NOSHASHI's product brief: the XRP Ledger problems it solves, its revenue model and prices, and every feature in the current build, including what is not built yet.",
    path: "/brief/",
    head,
    body,
    structured: [breadcrumb("Product brief", "/brief/")],
    scripts: script,
  }));
}

export const BRIEF_PAGES = [["/brief/", "monthly", "0.9"]];
