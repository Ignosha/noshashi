/*
 * The website runs no inline script: its CSP is script-src 'self', and the
 * build moves every inline <script> to /assets/inline/ (scripts/inline-scripts.mjs).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { externalizeInlineScripts, inlineScriptCount } from "../scripts/inline-scripts.mjs";

const csp = JSON.parse(readFileSync("vercel.json", "utf8"))
  .headers.find((h) => h.source === "/(.*)")
  .headers.find((h) => h.key === "Content-Security-Policy").value;
const directive = (name) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";

function pages(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? pages(full) : name.endsWith(".html") ? [full] : [];
  });
}

describe("the website's Content-Security-Policy", () => {
  it("allows scripts from the site itself and nothing inline", () => {
    expect(directive("script-src")).toBe("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
});

describe("moving inline scripts out", () => {
  it("replaces an inline script with a same-origin file of the same content, in place", () => {
    const { html, files } = externalizeInlineScripts('<p>a</p><script>var x=1;</script><p>b</p>');
    expect(files.size).toBe(1);
    const [[name, body]] = [...files];
    expect(body).toBe("var x=1;");
    expect(html).toBe(`<p>a</p><script src="/assets/inline/${name}"></script><p>b</p>`);
  });

  it("keeps attributes, and leaves data blocks, external scripts and empty tags alone", () => {
    const src = [
      '<script type="module">import "./x.js";</script>',
      '<script type="application/ld+json">{"a":1}</script>',
      '<script type="application/json" id="d">{"b":2}</script>',
      '<script src="/assets/nav.js" defer></script>',
      "<script></script>",
    ].join("");
    const { html, files } = externalizeInlineScripts(src);
    expect(files.size).toBe(1);
    expect(html).toContain('<script type="module" src="/assets/inline/');
    expect(html).toContain('<script type="application/ld+json">{"a":1}</script>');
    expect(html).toContain('<script type="application/json" id="d">{"b":2}</script>');
    expect(html).toContain('<script src="/assets/nav.js" defer></script>');
    expect(inlineScriptCount(html)).toBe(0);
  });

  it("names a file by its content, so the same script is one file", () => {
    const a = externalizeInlineScripts("<script>1</script>");
    const b = externalizeInlineScripts("<script>1</script><script>1</script>");
    expect([...a.files.keys()]).toEqual([...b.files.keys()]);
  });
});

describe("the committed website", () => {
  const all = pages("site");

  it("has no inline script left on any page", () => {
    const offenders = all.filter((p) => inlineScriptCount(readFileSync(p, "utf8")) > 0);
    expect(offenders).toEqual([]);
  });

  it("has every externalized script it refers to", () => {
    const missing = [];
    for (const p of all) {
      for (const m of readFileSync(p, "utf8").matchAll(/\/assets\/inline\/([0-9a-f]{20}\.js)/g)) {
        if (!existsSync(path.join("site/assets/inline", m[1]))) missing.push(`${p} → ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
