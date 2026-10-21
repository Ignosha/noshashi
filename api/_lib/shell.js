/*
 * The document shell for every server-rendered page.
 *
 * One nav and one footer, defined once. The landing page carries its
 * own copy inline for historical reasons; when the two disagree the
 * generator in scripts/build-site.mjs rewrites the landing page's copy
 * from the lists here, so there is still a single source of truth.
 *
 * Sign-in and the workspace are deliberately absent. They were removed
 * from the product surface, and a nav link is the place a removal like
 * that is most often forgotten.
 */

import { esc, attrUrl } from "./html.js";
import { MARK } from "./brand-mark.js";

/*
 * The canonical origin.
 *
 * This has to be the host that actually returns 200. The apex
 * `noshashi.app` 308-redirects to `www`, so every canonical tag,
 * sitemap entry and JSON-LD URL naming the apex was pointing a crawler
 * at a URL that immediately redirects — the page asserting one address
 * while the server insists on another. Google resolves it, but the two
 * signals disagree and the resolution is not ours to control.
 *
 * Set PUBLIC_SITE_URL to change it. To make the bare domain canonical
 * instead, flip the primary domain in the Vercel project *and* set this
 * — changing one without the other just reverses the mismatch.
 */
export const ORIGIN = (process.env.PUBLIC_SITE_URL || "https://www.noshashi.app").replace(/\/+$/, "");

// The flower. Generated from scripts/gen-brand.mjs so the site, the
// console and the app icon cannot drift apart.
export { MARK };

// Six destinations. Everything else on the site is one click below one
// of them (see FOOTER_GROUPS), so a visitor never has to scan a dozen
// links to find where to start.
export const NAV = [
  { href: "/platform/", label: "Platform", key: "platform", i18n: "nav.platform" },
  { href: "/solutions/", label: "Solutions", key: "solutions", i18n: "nav.solutions" },
  { href: "/institutional-demo/", label: "Demo", key: "demo", i18n: "nav.demo2" },
  { href: "/#public", label: "Free tools", i18n: "nav.tools", optional: true },
  { href: "/resources/", label: "Resources", key: "resources", i18n: "nav.resources" },
  { href: "/pricing/", label: "Pricing", i18n: "nav.pricing" },
  { href: "/about/", label: "About", key: "about", i18n: "nav.about", optional: true, wide: true },
];

// The footer is the full map of the site, grouped by the same six
// destinations so a technical page is always findable without crowding
// the header.
export const FOOTER_GROUPS = [
  { title: "Platform", links: [
    { href: "/platform/", label: "Platform overview" },
    { href: "/app/", label: "Workspace" },
    { href: "/institutional-demo/", label: "Interactive demo" },
    { href: "/#public", label: "Free tools" },
    { href: "/#download", label: "Download" },
    { href: "/pricing/", label: "Pricing" },
    { href: "/developers/", label: "Developers & API" },
    { href: "/docs/", label: "Documentation" },
  ] },
  { title: "Solutions", links: [
    { href: "/solutions/#exchanges", label: "Exchanges & payments" },
    { href: "/solutions/#trading", label: "Trading & liquidity" },
    { href: "/solutions/#issuers", label: "Issuers & treasury" },
    { href: "/solutions/#compliance", label: "Compliance & risk" },
    { href: "/enterprise/", label: "Enterprise" },
    { href: "/strategic-infrastructure/", label: "Strategic infrastructure" },
  ] },
  { title: "Free tools", links: [
    { href: "/xapp/", label: "Check an address" },
    { href: "/certificate/", label: "Authority certificate" },
    { href: "/badge/", label: "Issuer badge" },
    { href: "/alerts/", label: "Issuer alerts" },
    { href: "/delivered/", label: "Delivered-amount export" },
    { href: "/treasury/", label: "Treasury report" },
    { href: "/book-health/", label: "Book health" },
  ] },
  { title: "Resources", links: [
    { href: "/resources/", label: "All resources" },
    { href: "/research/", label: "Research findings" },
    { href: "/misread/", label: "The ledger can be misread" },
    { href: "/learn/", label: "Learn NOSHASHI (course)" },
    { href: "/guide/", label: "Plain-language guide" },
    { href: "/news/", label: "Newsroom" },
    { href: "/progress/", label: "Progress & releases" },
    { href: "/status/", label: "Status" },
  ] },
  { title: "Company", links: [
    { href: "/about/", label: "About" },
    { href: "/design-partners/", label: "Design partners" },
    { href: "/contact/", label: "Contact" },
    { href: "/brief/", label: "Product brief" },
    { href: "/trust/", label: "Trust & security" },
    { href: "/legal/", label: "Legal & accessibility" },
    { href: "https://github.com/Ignosha/noshashi", label: "GitHub" },
  ] },
];

// Flat list, kept for anything that wants every footer destination.
export const FOOTER_LINKS = FOOTER_GROUPS.flatMap((g) => g.links);

/** The shared header. `current` marks the active page for a11y and style. */
export function renderHeader(current = "") {
  const links = NAV.map((item) => {
    const active = item.key && item.key === current;
    return `<a class="nav-link${item.optional ? " optional" : ""}${item.wide ? " wide" : ""}" href="${attrUrl(item.href)}"${
      active ? ' aria-current="page"' : ""
    }>${item.i18n ? `<span data-i18n="${item.i18n}">${esc(item.label)}</span>` : esc(item.label)}</a>`;
  }).join("\n      ");

  return `<header>
  <div class="shell nav">
    <a class="brand" href="/" style="color:var(--ink)">${MARK}<span>NOSHASHI</span></a>
    <nav class="nav-links" aria-label="Primary">
      ${links}
      <button class="theme-toggle" id="themeToggle" type="button" aria-label="Switch to light mode">
        <span aria-hidden="true">◐</span><span id="themeLabel" data-i18n="theme.light">LIGHT</span>
      </button>
      <button class="theme-toggle accent-toggle" type="button" data-accent-toggle aria-label="Switch to the blue theme">
        <span class="swatch" aria-hidden="true"></span><span data-accent-label>BLUE</span>
      </button>
      <a class="btn ghost" href="/contact/?topic=institutions"><span data-i18n="nav.demo">Request a demo</span></a>
      <a class="btn" href="/app/"><span data-i18n="nav.workspace">Open workspace</span></a>
    </nav>
  </div>
</header>`;
}

export function renderFooter() {
  const groups = FOOTER_GROUPS.map(
    (g) => `<div class="foot-group"><p class="foot-h">${esc(g.title)}</p>${g.links
      .map((l) => `<a href="${attrUrl(l.href)}"${l.href.startsWith("http") ? ' rel="noopener"' : ""}>${esc(l.label)}</a>`)
      .join("")}</div>`
  ).join("\n      ");
  return `<footer>
  <div class="shell foot">
    <nav class="foot-map" aria-label="Site map">
      ${groups}
    </nav>
    <p class="mono foot-legal">© ${new Date().getUTCFullYear()} NOSHASHI Labs · Read-only XRPL intelligence · No custody, no keys, no signing</p>
  </div>
</footer>`;
}

/**
 * Theme script, inlined in <head> before any paint.
 *
 * It has to run before the body renders or a visitor who chose light
 * mode gets a dark flash on every navigation. Small enough to inline,
 * and inlining is the only placement that avoids the flash.
 */
export const THEME_BOOT = `<script>
(function(){try{var t=localStorage.getItem("noshashi-theme");
if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();
</script>`;

export const THEME_TOGGLE = `<script>
(function(){
  var button=document.getElementById("themeToggle"),label=document.getElementById("themeLabel");
  if(!button)return;
  function sync(){var light=document.documentElement.getAttribute("data-theme")==="light";
    if(label)label.textContent=(window.__NOSHASHI_I18N||{})[light?"theme.dark":"theme.light"]||(light?"DARK":"LIGHT");
    button.setAttribute("aria-label",(window.__NOSHASHI_I18N||{})[light?"theme.ariaDark":"theme.ariaLight"]||(light?"Switch to dark mode":"Switch to light mode"));}
  sync();
  button.addEventListener("click",function(){
    var next=document.documentElement.getAttribute("data-theme")==="light"?"dark":"light";
    document.documentElement.setAttribute("data-theme",next);
    try{localStorage.setItem("noshashi-theme",next);}catch(e){}
    sync();});
})();
</script>`;

/**
 * Structured data.
 *
 * The reason the pages carry it at all: a crawler can read a headline
 * out of rendered HTML, but Organization and BreadcrumbList are what
 * let it connect these pages to one entity rather than treating each
 * as an orphan. Only facts already visible on the page go in here —
 * structured data that says more than the page does is cloaking.
 */
export function jsonLd(objects) {
  const graph = objects.filter(Boolean);
  if (!graph.length) return "";
  // </script> cannot appear inside a script element at any nesting.
  const json = JSON.stringify(graph.length === 1 ? graph[0] : { "@context": "https://schema.org", "@graph": graph })
    .replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

export const ORGANIZATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "NOSHASHI Labs",
  url: `${ORIGIN}/`,
  logo: `${ORIGIN}/favicon.svg`,
  description:
    "Compliance and market-intelligence tooling for the XRP Ledger. Reads validated ledger state and returns a GO, HOLD or NO-GO verdict with the evidence attached.",
  sameAs: ["https://github.com/Ignosha/noshashi"],
  contactPoint: [
    { "@type": "ContactPoint", contactType: "customer support", email: "support@noshashi.app" },
    { "@type": "ContactPoint", contactType: "sales", email: "institutions@noshashi.app" },
  ],
};

export function breadcrumb(name, path) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
      { "@type": "ListItem", position: 2, name, item: `${ORIGIN}${path}` },
    ],
  };
}

/**
 * Render a complete document.
 *
 * Everything a crawler needs is in the markup this returns: the copy,
 * the headings, the links and the structured data. No part of the page
 * waits on JavaScript to have content — script on these pages only
 * refreshes what is already there.
 */
export function renderPage({
  title,
  description,
  path,
  current = "",
  head = "",
  body,
  scripts = "",
  structured = [],
}) {
  const canonical = `${ORIGIN}${path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="NOSHASHI">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/flower-mark-180.png">
<link rel="preload" as="font" type="font/woff2" href="/fonts/space-grotesk-500-latin.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="/fonts/ibm-plex-mono-400-latin.woff2" crossorigin>
<link rel="stylesheet" href="/assets/fonts.css">
<link rel="stylesheet" href="/assets/core.css">
<link rel="stylesheet" href="/assets/modules.css">
<link rel="stylesheet" href="/assets/accent.css">
<script src="/assets/accent.js"></script>
${THEME_BOOT}
${jsonLd([ORGANIZATION, ...structured])}
${head}
</head>
<body>
${renderHeader(current)}
<main class="shell">
${body}
</main>
${renderFooter()}
<script src="/assets/i18n.js" defer></script>
<script src="/assets/nav.js" defer></script>
<script src="/assets/subscribe.js" defer></script>
<script src="/assets/chart.js" defer></script>
<script src="/assets/support.js" defer></script>
<script src="/assets/garden-field.js" defer></script>
${THEME_TOGGLE}
${scripts}
</body>
</html>`;
}
