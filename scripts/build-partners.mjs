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
}

export const PARTNER_PAGES = [["/partners/", "monthly", "0.8"]];
