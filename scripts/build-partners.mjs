/*
 * /partners/: the ways another business can carry NOSHASHI to its own
 * users. Explorers, DEXes and launchpads show issuer controls on their
 * token pages; auditors and law firms refer or order evidence for their
 * clients; wallets and communities use the address check and the bots.
 *
 * Nothing here promises a commercial term the owner has not set: referral
 * fees and volume pricing are "agreed in writing per partner", and every
 * endpoint named is one that already serves the public site.
 */

import { renderPage, breadcrumb, ORIGIN } from "../api/_lib/shell.js";

const CONTACT = "/contact/?topic=institutions";

export async function buildPartners(write) {
  const body = `<div class="page-head">
  <p class="eyebrow">Partners</p>
  <h1>Put ledger facts where your users already look.</h1>
  <p>NOSHASHI reads what XRP Ledger issuers can still do: freeze, claw back, gate holding, sign alone,
     and how much of a book can really fill. If your users pick tokens, hold them, or need to prove
     what they hold, you can give them those facts under your own roof.</p>
</div>
<section>
  <div class="grid g2">
    <div class="panel" id="explorers">
      <p class="num">EXPLORERS · DEXES · LAUNCHPADS</p>
      <h3>An issuer-controls column on every token page</h3>
      <p>Free, no key: <code>${ORIGIN}/api/authority?issuer=r…</code> returns the reading as JSON, and
         <code>${ORIGIN}/api/badge?issuer=r…</code> returns a live badge you can drop into a page as an
         image. Both are cached at the edge for five minutes and open to any origin. We ask for a visible
         "Issuer facts by NOSHASHI" link where they appear.</p>
      <p>Launchpads can offer the <a href="/evidence-report/?tier=issuer">Issuer check</a> to projects at
         listing, so holders see the same facts the platform did.</p>
      <p><a class="btn" href="${CONTACT}">Talk about an integration</a></p>
    </div>
    <div class="panel" id="auditors">
      <p class="num">AUDITORS · ACCOUNTANTS · LAW FIRMS</p>
      <h3>Ledger evidence for your clients' XRPL positions</h3>
      <p>A <a href="/evidence-report/">Ledger Evidence Report</a> records what the ledger shows for the
         addresses a client names, at the date you name: issuer controls, holdings and who can move them,
         and real against advertised depth, with a fingerprint anyone can check. It is a record of facts,
         not an opinion, so it sits alongside your own work rather than replacing it.</p>
      <p>Firms that refer clients, or order for several clients, get terms agreed in writing: a referral
         fee or volume pricing, invoice or bank transfer.</p>
      <p><a class="btn" href="${CONTACT}">Set up a firm account</a></p>
    </div>
    <div class="panel" id="wallets">
      <p class="num">WALLETS</p>
      <h3>Check an address before your user sends</h3>
      <p>The <a href="/xapp/">address check</a> runs as a mobile page: sanctions list, scam registry and the
         ledger's own flags for the destination, with nothing signed. It is built to open inside Xaman as an
         xApp, and any wallet can open it with <code>?address=r…</code>.</p>
      <p><a class="btn ghost" href="/xapp/">Try the check</a></p>
    </div>
    <div class="panel" id="communities">
      <p class="num">COMMUNITIES</p>
      <h3>Bots for Telegram and Discord</h3>
      <p>Send <code>/check r…</code> to read what an issuer can do right now, or <code>/watch r…</code> to be
         told the moment it changes: freeze, clawback, signing keys, fees. Discord channels can also get
         change alerts through a webhook. Free for three watched issuers per chat.</p>
      <p><a class="btn ghost" href="/alerts/">Set up alerts</a></p>
    </div>
  </div>
  <div class="panel" style="margin-top:14px"><p class="num">WHAT NOSHASHI NEVER DOES</p>
    <p>It never holds keys, never signs, and never asks anyone for a seed, a key or a balance. Every fact it
       shows is read from validated ledger state and names the ledger it was read at. A fact it could not
       read is shown as not read, never as a pass. There is no score and no verdict on a token.</p></div>
  <p class="tool-note" style="margin-top:14px">Developers: the same reads are in the
     <a href="/developers/">SDK and Compliance API</a>. Source: <a href="https://github.com/Ignosha/noshashi">GitHub</a>.</p>
</section>`;

  await write("partners/index.html", renderPage({
    title: "Partners — issuer facts for explorers, DEXes, auditors and wallets",
    description: "Show XRPL issuer controls on your token pages for free, refer clients for ledger evidence, or check addresses before your users send. Read-only, keyless, live from the ledger.",
    path: "/partners/",
    body,
    structured: [breadcrumb("Partners", "/partners/")],
  }));

  const become = `<div class="page-head">
  <p class="eyebrow">Become a partner</p>
  <h1>Carry ledger facts to your users, with us.</h1>
  <p>NOSHASHI is a read-only intelligence tool for the XRP Ledger. Partners put its readings where
     decisions are made: on token pages, in client files, inside wallets and in compliance stacks.
     Tell us what you run, and we will work out the simplest way to connect it.</p>
  <p><a class="btn" href="${CONTACT}">Apply to partner</a> <a class="btn ghost" href="/partners/">See how partners use it</a></p>
</div>
<section>
  <div class="grid g2">
    <div class="panel">
      <p class="num">01 · INTEGRATION PARTNERS</p>
      <h3>Explorers, DEXes, launchpads and wallets</h3>
      <p>Show issuer controls next to every token, or check a destination before a user sends. The
         <a href="/docs/api/">Asset Risk API</a> and the live badge are free and need no key.</p>
    </div>
    <div class="panel">
      <p class="num">02 · REFERRAL PARTNERS</p>
      <h3>Auditors, accountants, law firms and advisers</h3>
      <p>Refer clients who hold XRPL assets, or order <a href="/evidence-report/">Ledger Evidence Reports</a>
         for several clients at once. A referral fee or volume pricing is agreed in writing with each firm.</p>
    </div>
    <div class="panel">
      <p class="num">03 · CHANNEL PARTNERS</p>
      <h3>Consultancies, integrators and compliance vendors</h3>
      <p>Bring the <a href="/app/">workspace</a> and its receipts to banks, custodians and treasuries you
         already serve, with terms set out per partner before anything is sold.</p>
    </div>
    <div class="panel">
      <p class="num">04 · DATA AND TECHNOLOGY PARTNERS</p>
      <h3>Node operators, analytics and custody technology</h3>
      <p>Use the same reads in your own product through the <a href="/developers/">SDK and Compliance API</a>,
         with every answer carrying the ledger index it was read at.</p>
    </div>
  </div>
</section>
<section>
  <div class="grid g2">
    <div class="panel">
      <p class="num">WHAT PARTNERS GET</p>
      <ul class="proof-list">
        <li>Keyless access to issuer controls and the live badge from day one</li>
        <li>A direct line to the founder for integration questions</li>
        <li>Early access to new readings before they reach the public tools</li>
        <li>A listing on the partners page once your integration is live, if you want one</li>
      </ul>
    </div>
    <div class="panel">
      <p class="num">WHAT WE ASK</p>
      <ul class="proof-list">
        <li>A visible "Issuer facts by NOSHASHI" link wherever the readings appear</li>
        <li>Show facts as facts: with the ledger they were read at, never as a score or a rating</li>
        <li>Never present NOSHASHI as endorsing a token, an issuer or an investment</li>
      </ul>
    </div>
  </div>
</section>
<section>
  <div class="panel">
    <p class="num">HOW IT WORKS</p>
    <h3>Three steps, all remote.</h3>
    <p><b>1. Tell us what you run.</b> A short note through the <a href="${CONTACT}">contact form</a>: your
       product, your users, and where ledger facts would help them.</p>
    <p><b>2. A 30-minute call.</b> We look at your flow together and pick the lightest integration that works.</p>
    <p><b>3. Go live.</b> Any commercial terms are written down first; then you connect, and we check the
       readings render the way the ledger reports them.</p>
    <p><a class="btn" href="${CONTACT}">Apply to partner</a></p>
  </div>
  <p class="tool-note" style="margin-top:14px">NOSHASHI never holds keys, never signs, and never asks anyone for a seed,
     a key or a balance. It is not affiliated with Ripple Labs or the XRPL Foundation.</p>
</section>`;

  await write("partners/become/index.html", renderPage({
    title: "Become a partner — NOSHASHI, an XRPL intelligence tool",
    description: "Partner with NOSHASHI: show XRPL issuer controls on your token pages, refer clients for ledger evidence, or bring the read-only workspace to the institutions you serve.",
    path: "/partners/become/",
    body: become,
    structured: [breadcrumb("Become a partner", "/partners/become/")],
  }));
}

export const PARTNER_PAGES = [["/partners/", "monthly", "0.8"], ["/partners/become/", "monthly", "0.7"]];
