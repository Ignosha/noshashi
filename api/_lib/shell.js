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

export const MARK = `<svg viewBox="0 0 180 180" width="24" height="24" fill="none" aria-hidden="true">
<mask id="nm" maskUnits="userSpaceOnUse" x="0" y="0" width="180" height="180">
<path d="M78 119C82 86 98 53 129 29 139 21 149 16 160 13 157 29 151 43 141 56 124 79 105 96 78 119Z" fill="#fff"/>
<path d="M95 99C91 80 94 64 103 50 114 59 121 70 123 83 116 91 106 97 95 99Z" fill="#000"/>
<circle cx="129" cy="63" r="5" fill="#000"/></mask>
<g stroke="currentColor" stroke-width="7" stroke-linecap="round">
<path d="M76 20A56 56 0 0 1 150 68"/><path d="M164 92A56 56 0 0 1 86 156"/></g>
<circle cx="151" cy="69" r="7" fill="currentColor"/>
<path d="M78 119C82 86 98 53 129 29 139 21 149 16 160 13 157 29 151 43 141 56 124 79 105 96 78 119Z" fill="currentColor" mask="url(#nm)"/>
<path d="M92 111 63 132C60 116 66 103 78 93Z" fill="currentColor"/>
<path d="M111 91 130 118C114 119 101 113 93 103Z" fill="currentColor"/>
<path d="M82 121 67 150 94 132Z" fill="currentColor"/>
<path d="M73 143 61 164 84 151Z" fill="currentColor"/></svg>`;

export const NAV = [
  { href: "/#public", label: "Free tools" },
  { href: "/news/", label: "Newsroom", key: "news" },
  { href: "/progress/", label: "Progress", key: "progress" },
  { href: "/status/", label: "Status", key: "status", optional: true },
  { href: "/research/", label: "Findings", optional: true },
  { href: "/guide/", label: "XRP guide", optional: true },
  { href: "/#download", label: "Download" },
  { href: "/pricing/", label: "Pricing" },
];

export const FOOTER_LINKS = [
  { href: "/contact/", label: "Contact" },
  { href: "/news/", label: "Newsroom" },
  { href: "/progress/", label: "Progress" },
  { href: "/status/", label: "Status" },
  { href: "/research/", label: "Findings" },
  { href: "/guide/", label: "Plain-language guide" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/legal/", label: "Legal & accessibility" },
  { href: "https://github.com/Ignosha/noshashi", label: "GitHub" },
];

/** The shared header. `current` marks the active page for a11y and style. */
export function renderHeader(current = "") {
  const links = NAV.map((item) => {
    const active = item.key && item.key === current;
    return `<a class="nav-link${item.optional ? " optional" : ""}" href="${attrUrl(item.href)}"${
      active ? ' aria-current="page"' : ""
    }>${esc(item.label)}</a>`;
  }).join("\n      ");

  return `<header>
  <div class="shell nav">
    <a class="brand" href="/" style="color:var(--ink)">${MARK}<span>NOSHASHI</span></a>
    <nav class="nav-links" aria-label="Primary">
      ${links}
      <button class="theme-toggle" id="themeToggle" type="button" aria-label="Switch to light mode">
        <span aria-hidden="true">◐</span><span id="themeLabel">LIGHT</span>
      </button>
      <a class="btn ghost" href="/contact/">Contact</a>
      <a class="btn" href="/#download">Download beta</a>
    </nav>
  </div>
</header>`;
}

export function renderFooter() {
  const links = FOOTER_LINKS.map(
    (l) => `<a href="${attrUrl(l.href)}">${esc(l.label)}</a>`
  ).join("\n      ");
  return `<footer>
  <div class="shell foot">
    <p class="mono">© ${new Date().getUTCFullYear()} NOSHASHI Labs · XRPL Mainnet · All builds BETA</p>
    <div class="foot-links">
      ${links}
    </div>
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
    if(label)label.textContent=light?"DARK":"LIGHT";
    button.setAttribute("aria-label",light?"Switch to dark mode":"Switch to light mode");}
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
<link rel="preload" as="font" type="font/woff2" href="/fonts/space-grotesk-500-latin.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="/fonts/ibm-plex-mono-400-latin.woff2" crossorigin>
<link rel="stylesheet" href="/assets/fonts.css">
<link rel="stylesheet" href="/assets/core.css">
<link rel="stylesheet" href="/assets/modules.css">
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
<script src="/assets/nav.js" defer></script>
<script src="/assets/subscribe.js" defer></script>
<script src="/assets/chart.js" defer></script>
<script src="/assets/support.js" defer></script>
${THEME_TOGGLE}
${scripts}
</body>
</html>`;
}
