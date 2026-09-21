#!/usr/bin/env node
/**
 * Generate site/legal/index.html from src/lib/legal.ts.
 *
 * The policies are a legal artefact and there must be exactly one copy of
 * them. Hand-transcribing 475 lines of TypeScript into HTML guarantees the
 * public page and the in-app page disagree the first time either is
 * edited — and of all the things in this project to let drift, the terms
 * a customer is bound by is the worst one.
 *
 * So this bundles the real module and renders from it. Run it whenever
 * legal.ts changes:
 *
 *   node scripts/build-legal-page.mjs
 */
import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = join(tmpdir(), `noshashi-legal-${Date.now()}.mjs`);

await build({
  entryPoints: ["src/lib/legal.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: tmp,
  logLevel: "silent",
  // brand.ts is the only import legal.ts carries; bundling it is fine.
});

const mod = await import(pathToFileURL(tmp).href);
const policies = mod.POLICIES ?? Object.values(mod).filter((v) => v?.sections);

if (!policies.length) {
  console.error("No policies found in src/lib/legal.ts — aborting rather than shipping an empty legal page.");
  process.exit(1);
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const nav = policies
  .map((p) => `<a href="#${p.id}">${esc(p.title)}</a>`)
  .join("\n        ");

const body = policies
  .map(
    (p) => `
      <article id="${p.id}" class="policy">
        <p class="eyebrow">Updated ${esc(p.updated)}</p>
        <h2>${esc(p.title)}</h2>
        <p class="summary">${esc(p.summary)}</p>
        ${p.sections
          .map(
            (s) => `
        <section>
          <h3>${esc(s.heading)}</h3>
          ${(Array.isArray(s.body) ? s.body : [s.body])
            .map((para) => `<p>${esc(para)}</p>`)
            .join("\n          ")}
        </section>`
          )
          .join("")}
      </article>`
  )
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>NOSHASHI — Legal &amp; Accessibility</title>
<meta name="description" content="Terms, privacy, accessibility statement, billing, data processing, acceptable use and regulatory disclosures for NOSHASHI.">
<link rel="canonical" href="https://noshashi.app/legal/">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{
    --ground:#0B0F14;--surface:#11161D;--elevated:#1C2330;
    --ink:#E6E8EB;--muted:#A3A8B3;--faint:#747C8B;--rule:#2A313C;
    --brand:#3A82F6;--r:10px;--shell:min(1180px,92vw);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{background:var(--ground);color:var(--ink);
    font-family:"Space Grotesk",-apple-system,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;line-height:1.65}
  a{color:var(--brand)}
  .shell{width:var(--shell);margin:0 auto}
  header{position:sticky;top:0;z-index:20;backdrop-filter:blur(12px);
    background:color-mix(in srgb,var(--ground) 82%,transparent);border-bottom:1px solid var(--rule)}
  .nav{display:flex;align-items:center;justify-content:space-between;height:62px}
  .brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink)}
  .brand span{font-weight:600;letter-spacing:.2em;font-size:14px}
  .back{font-size:12px;color:var(--muted);text-decoration:none}
  .back:hover{color:var(--ink)}
  .wrap{display:grid;grid-template-columns:250px 1fr;gap:44px;padding:56px 0 80px;align-items:start}
  aside{position:sticky;top:86px}
  aside p{font-family:"IBM Plex Mono",monospace;font-size:9.5px;letter-spacing:.2em;color:var(--faint);margin-bottom:12px}
  aside a{display:block;font-size:12.5px;color:var(--muted);text-decoration:none;padding:6px 0;border-left:2px solid transparent;padding-left:12px;transition:.14s}
  aside a:hover{color:var(--ink);border-left-color:var(--brand)}
  h1{font-size:clamp(28px,4vw,40px);letter-spacing:-.03em;margin-bottom:12px}
  .lede{color:var(--muted);font-size:15px;max-width:64ch;margin-bottom:8px}
  .policy{background:var(--surface);border:1px solid var(--rule);border-radius:var(--r);
    padding:32px;margin-bottom:18px;scroll-margin-top:86px}
  .policy h2{font-size:20px;letter-spacing:-.01em;margin:6px 0 12px}
  .policy h3{font-size:14px;margin:24px 0 8px;color:var(--ink)}
  .policy p{color:var(--muted);font-size:13.5px;max-width:76ch}
  .policy .summary{color:var(--ink);font-size:14px;padding-bottom:8px;border-bottom:1px solid var(--rule)}
  .eyebrow{font-family:"IBM Plex Mono",monospace;font-size:9.5px;letter-spacing:.2em;color:var(--faint)}
  footer{border-top:1px solid var(--rule);padding:34px 0;font-size:12px;color:var(--faint)}
  @media (max-width:900px){
    .wrap{grid-template-columns:1fr;gap:24px}
    aside{position:static}
    .policy{padding:22px}
  }
</style>
</head>
<body>
<header>
  <div class="shell nav">
    <a class="brand" href="/">
      <svg viewBox="0 0 180 180" width="24" height="24" fill="none" aria-hidden="true">
        <mask id="lm" maskUnits="userSpaceOnUse" x="0" y="0" width="180" height="180">
          <path d="M78 119C82 86 98 53 129 29 139 21 149 16 160 13 157 29 151 43 141 56 124 79 105 96 78 119Z" fill="#fff"/>
          <path d="M95 99C91 80 94 64 103 50 114 59 121 70 123 83 116 91 106 97 95 99Z" fill="#000"/>
          <circle cx="129" cy="63" r="5" fill="#000"/>
        </mask>
        <g stroke="#E6E8EB" stroke-width="7" stroke-linecap="round">
          <path d="M76 20A56 56 0 0 1 150 68"/><path d="M164 92A56 56 0 0 1 86 156"/>
        </g>
        <circle cx="151" cy="69" r="7" fill="#E6E8EB"/>
        <path d="M78 119C82 86 98 53 129 29 139 21 149 16 160 13 157 29 151 43 141 56 124 79 105 96 78 119Z" fill="#E6E8EB" mask="url(#lm)"/>
        <path d="M92 111 63 132C60 116 66 103 78 93Z" fill="#E6E8EB"/>
        <path d="M111 91 130 118C114 119 101 113 93 103Z" fill="#E6E8EB"/>
        <path d="M82 121 67 150 94 132Z" fill="#E6E8EB"/>
        <path d="M73 143 61 164 84 151Z" fill="#E6E8EB"/>
      </svg>
      <span>NOSHASHI</span>
    </a>
    <a class="back" href="/">&larr; Back to noshashi.app</a>
  </div>
</header>

<div class="shell wrap">
  <aside>
    <p>DOCUMENTS</p>
    ${nav}
  </aside>

  <main>
    <h1>Legal &amp; Accessibility</h1>
    <p class="lede">
      These are the same documents shipped inside the application, generated from the
      same source, so the two can never disagree.
    </p>
    <p class="lede" style="margin-bottom:28px">
      Questions: <a href="mailto:legal@noshashi.app">legal@noshashi.app</a> &middot;
      Accessibility: <a href="mailto:support@noshashi.app">support@noshashi.app</a>
    </p>
    ${body}
  </main>
</div>

<footer>
  <div class="shell">© 2026 NOSHASHI Labs · Generated from src/lib/legal.ts · XRPL Mainnet</div>
</footer>
</body>
</html>
`;

mkdirSync("site/legal", { recursive: true });
writeFileSync("site/legal/index.html", html);
console.log(
  `wrote site/legal/index.html — ${policies.length} policies, ${Math.round(html.length / 1024)} KB`
);
