/*
 * /tokens/ and one page per token: what each issuer on the XRP Ledger can
 * still do to the people holding its token, read live.
 *
 * Why these pages exist: people search "<token> XRPL" and "is <token>
 * safe" before buying, and today nothing answers with ledger facts. Each
 * page answers for one token and ends at the paid Issuer check.
 *
 * The list of tokens is data/tokens.json, taken from xrpl.to on the date
 * it names (xrpl.to asks for a visible link wherever its data is shown,
 * and the index page carries one). The list only says which tokens get a
 * page. Every fact on a page is read in the browser from validated ledger
 * state through /api/authority, /api/book and /api/badge, the same reads
 * the certificate and the badge use. Nothing is read at build time, so
 * the rendered page never claims a ledger fact it did not just read.
 *
 * The copy rules every tool page keeps hold here too: no score, no
 * verdict, an unreadable fact is "not read" and never a pass, nothing
 * asks for a key, a seed or a balance.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderPage, ORIGIN } from "../api/_lib/shell.js";
import { esc } from "../api/_lib/html.js";
import { decodeCurrency, ADDRESS_RE } from "../api/_lib/authority.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function loadTokens() {
  const raw = JSON.parse(await readFile(path.join(ROOT, "data", "tokens.json"), "utf8"));
  const seen = new Set();
  const tokens = raw.tokens.map((t) => {
    if (!ADDRESS_RE.test(t.issuer)) throw new Error(`data/tokens.json: ${t.name} has no valid issuer`);
    const slug = slugFor(t, seen);
    seen.add(slug);
    return { ...t, slug, label: decodeCurrency(t.currency) };
  });
  return { ...raw, tokens };
}

/** "RLUSD" by "Ripple" -> "rlusd-ripple"; a clash gets the issuer's first characters. */
export function slugFor(token, taken = new Set()) {
  const clean = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const name = clean(token.name) || "token";
  const by = clean(token.by);
  let slug = by && by !== name ? `${name}-${by}` : name;
  if (taken.has(slug)) slug = `${slug}-${token.issuer.slice(1, 7).toLowerCase()}`;
  return slug;
}

const CSS = `<style>
.tk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin:18px 0}
.tk-card{display:block;border:1px solid var(--rule);border-radius:var(--r);padding:14px 16px;text-decoration:none;color:inherit}
.tk-card:hover,.tk-card:focus-visible{border-color:var(--accent,currentColor)}
.tk-card b{display:block;font-size:16px}
.tk-card span{display:block;color:var(--muted);font-size:12.5px;margin-top:2px}
.tk-card code{display:block;font:11px "IBM Plex Mono",monospace;color:var(--muted);margin-top:8px;word-break:break-all}
.tk-filter{max-width:420px;margin:8px 0 4px}
.tk-facts{display:grid;gap:0;margin:8px 0;max-width:760px}
.tk-facts div{display:grid;grid-template-columns:minmax(150px,240px) 1fr;gap:14px;border-bottom:1px solid var(--rule);padding:10px 0;font-size:13.5px}
.tk-facts b{font:12px "IBM Plex Mono",monospace;letter-spacing:.04em}
.tk-facts p{margin:4px 0 0;color:var(--muted);font-size:12.5px;line-height:1.55}
.tk-id{font:12px "IBM Plex Mono",monospace;word-break:break-all;color:var(--muted)}
.tk-badge{margin:14px 0 6px;max-width:100%;height:auto}
.tk-cta{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
#tk-live h2{margin-top:28px}
.tk-note{color:var(--muted);font-size:12.5px;line-height:1.6;max-width:72ch}
.t-go{color:var(--go)} .t-hold{color:var(--hold)} .t-nogo{color:var(--nogo)} .t-unknown{color:var(--muted)}
@media (max-width:560px){.tk-facts div{grid-template-columns:1fr;gap:4px}}
</style>`;

function card(t) {
  return `<a class="tk-card" href="/tokens/${esc(t.slug)}/" data-q="${esc(`${t.label} ${t.name} ${t.by} ${t.issuer} ${t.domain}`.toLowerCase())}">
  <b translate="no">${esc(t.label)}</b><span>${esc(t.by)}${t.domain ? ` · ${esc(t.domain)}` : ""}</span>
  <code translate="no">${esc(t.issuer)}</code></a>`;
}

async function buildIndex(write, data) {
  const body = `<div class="page-head">
  <p class="eyebrow">Free · ${data.tokens.length} tokens on the XRP Ledger</p>
  <h1>What can each token's issuer still do?</h1>
  <p>Pick a token to see, read live from the XRP Ledger, whether its issuer can freeze holders,
     claw tokens back, require permission to hold, or sign alone with one key, and how much of its
     order book can really fill. No score and no verdict, just the ledger's answer.</p>
</div>
<section>
  <div class="form-field tk-filter"><label for="tk-q">Find a token</label>
    <input id="tk-q" type="search" placeholder="Name, issuer or r-address" autocomplete="off" spellcheck="false"></div>
  <div class="tk-grid" id="tk-list">${data.tokens.map(card).join("\n")}</div>
  <p class="tk-note">Not listed? Paste any issuer into the <a href="/certificate/">free certificate</a>.
     Token list: <a href="https://xrpl.to" rel="noopener">Data by xrpl.to</a>, top tokens by 24-hour volume with
     1,000 or more holders, read ${esc(data.readOn)}. Every fact on a token page is read from the ledger itself.</p>
  <p class="tk-note">Run a token project? Put a <a href="/badge/">live badge</a> on your site, or order an
     <a href="/evidence-report/?tier=issuer">Issuer check</a> to show holders, exchanges and partners.</p>
</section>`;
  const script = `<script>
(function(){
  var q=document.getElementById("tk-q"), cards=[].slice.call(document.querySelectorAll("#tk-list .tk-card"));
  if(!q)return;
  q.addEventListener("input",function(){var v=q.value.trim().toLowerCase();
    cards.forEach(function(c){c.hidden=v!==""&&c.getAttribute("data-q").indexOf(v)<0;});});
})();
</script>`;
  await write("tokens/index.html", renderPage({
    title: "XRPL tokens: what each issuer can still do, read live",
    description: `Freeze, clawback, permissioned holding, signing keys and real order-book depth for ${data.tokens.length} XRP Ledger tokens, read live from validated ledger state. Free, no account.`,
    path: "/tokens/",
    head: CSS,
    body,
    scripts: script,
    structured: [{
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "Tokens", item: `${ORIGIN}/tokens/` },
      ],
    }],
  }));
}

/* The live read, shared by every token page. Reads data-* from #tk-live. */
const TOKEN_JS = `<script>
(function(){
  var box=document.getElementById("tk-live"); if(!box)return;
  var issuer=box.getAttribute("data-issuer"), currency=box.getAttribute("data-currency");
  var facts=document.getElementById("tk-facts"), status=document.getElementById("tk-status"), depth=document.getElementById("tk-depth");
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function tone(c){return c.passed?"go":(c.severity==="block"?"nogo":"hold");}
  function word(c){
    if(/abstain/i.test(c.detail||"")&&!c.passed)return "not measured here";
    return c.passed?"yes":"no";
  }
  fetch("/api/authority?issuer="+encodeURIComponent(issuer)).then(function(r){return r.json();}).then(function(cert){
    var checks=(cert&&cert.checks)||[];
    if(!checks.length){status.textContent="The ledger could not be read just now. Nothing here is a pass. Try again in a minute.";return;}
    facts.innerHTML=checks.filter(function(c){return c.id!=="SUPPLY_CONCENTRATION";}).map(function(c){
      return '<div><span>'+esc(c.label)+'</span><span><b class="t-'+tone(c)+'">'+esc(word(c).toUpperCase())+'</b><p>'+esc(c.detail)+'</p></span></div>';
    }).join("");
    status.textContent="Read from validated ledger "+Number(cert.ledgerIndex||0).toLocaleString("en-US")+" at "+String(cert.evaluatedAt||"").replace("T"," ").slice(0,16)+" UTC.";
  }).catch(function(){status.textContent="The ledger could not be read just now. Nothing here is a pass. Try again in a minute.";});
  if(depth){
    fetch("/api/book?currency="+encodeURIComponent(currency)+"&issuer="+encodeURIComponent(issuer)).then(function(r){return r.json();}).then(function(b){
      if(!b||!b.quoted){depth.textContent="The order book could not be read just now.";return;}
      function pct(x){return x==null?"no offers in the band":Math.round(x*1000)/10+"%";}
      function n(x){return Number(x||0).toLocaleString("en-US",{maximumFractionDigits:2});}
      depth.innerHTML="Bids: "+esc(n(b.fillable.bid))+" of "+esc(n(b.quoted.bid))+" listed can fill ("+esc(pct(b.fillable_ratio.bid))+"). "+
        "Asks: "+esc(n(b.fillable.ask))+" of "+esc(n(b.quoted.ask))+" listed can fill ("+esc(pct(b.fillable_ratio.ask))+"). "+
        "Quantities in "+esc(b.currency_label)+", within 10% of the mid, DEX book only (AMM pools not included), at ledger "+esc(Number(b.ledger_index).toLocaleString("en-US"))+".";
    }).catch(function(){depth.textContent="The order book could not be read just now.";});
  }
})();
</script>`;

async function buildToken(write, t, data) {
  const who = t.by && t.by !== t.label ? `${t.label} (${t.by})` : t.label;
  const badge = `/api/badge?issuer=${encodeURIComponent(t.issuer)}&style=card`;
  const body = `<div class="page-head">
  <p class="eyebrow"><a href="/tokens/">Tokens</a> · XRP Ledger</p>
  <h1>${esc(who)}: what the issuer can still do</h1>
  <p>Read live from validated XRP Ledger state each time this page opens: whether the issuer of
     <span translate="no">${esc(t.label)}</span> can freeze holders or claw tokens back, whether holding needs its permission,
     who can sign for it, and how much of its order book can really fill.</p>
  <p class="tk-id" translate="no">Issuer ${esc(t.issuer)} · currency ${esc(t.currency)}${t.domain ? ` · claims ${esc(t.domain)}` : ""}</p>
</div>
<section id="tk-live" data-issuer="${esc(t.issuer)}" data-currency="${esc(t.currency)}">
  <img class="tk-badge" src="${esc(badge)}" alt="Live issuer badge for ${esc(t.label)}" width="360" height="120" loading="lazy">
  <h2>Issuer controls</h2>
  <p class="form-status" id="tk-status" role="status" aria-live="polite">Reading the ledger…</p>
  <div class="tk-facts" id="tk-facts"><noscript><p>This page reads the ledger in your browser. Open the
    <a href="/certificate/?issuer=${esc(t.issuer)}">certificate</a> for the same reading.</p></noscript></div>
  <h2>Order book against XRP</h2>
  <p class="tk-note" id="tk-depth">Reading the order book…</p>
  <div class="tk-cta">
    <a class="btn" href="/evidence-report/?tier=issuer">Get the Issuer check · $950</a>
    <a class="btn ghost" href="/certificate/?issuer=${esc(t.issuer)}">Full certificate, free</a>
    <a class="btn ghost" href="/badge/?issuer=${esc(t.issuer)}">Put this badge on a site</a>
    <a class="btn ghost" href="/alerts/?issuer=${esc(t.issuer)}">Alert me if it changes</a>
  </div>
  <p class="tk-note">These are ledger facts, not a rating, an audit or advice. A power the issuer has kept
     is not a sign it will use it, and one it gave up cannot come back. ${t.domain ? `The domain is what the
     token list names for it; check that the domain's own xrp-ledger.toml lists this issuer before you rely on it. ` : ""}Supply
     concentration is on the full certificate, because measuring it walks every holder line.</p>
</section>`;
  await write(`tokens/${t.slug}/index.html`, renderPage({
    title: `${who} on the XRP Ledger: freeze, clawback and issuer keys, live`,
    description: `Can the ${t.label} issuer${t.by && t.by !== t.label ? ` (${t.by})` : ""} freeze holders or claw back tokens? Read live from the XRP Ledger: issuer flags, signing keys and real order-book depth for ${t.issuer}.`,
    path: `/tokens/${t.slug}/`,
    head: CSS,
    body,
    scripts: TOKEN_JS,
    structured: [{
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "Tokens", item: `${ORIGIN}/tokens/` },
        { "@type": "ListItem", position: 3, name: who, item: `${ORIGIN}/tokens/${t.slug}/` },
      ],
    }],
  }));
}

export async function buildTokens(write) {
  const data = await loadTokens();
  await buildIndex(write, data);
  for (const t of data.tokens) await buildToken(write, t, data);
  return data.tokens.map((t) => [`/tokens/${t.slug}/`, "daily", "0.7"]);
}

export const TOKEN_INDEX_PAGES = [["/tokens/", "daily", "0.9"]];
