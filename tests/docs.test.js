/*
 * The /docs/ hub (§47): its sections, its Markdown rendering, and that the
 * built pages carry the facts the code produces rather than copy.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { docsSections, renderMarkdown, PERMISSION_LABELS } from "../api/_lib/docs.js";

const ref = JSON.parse(readFileSync("src/lib/docs/reference.json", "utf8"));
const read = (p) => readFileSync(p, "utf8");
const docs = { api: read("docs/api/COMPLIANCE_API.md"), webhooks: read("docs/api/WEBHOOKS.md"), security: read("SECURITY.md"), changelog: read("CHANGELOG.md") };
const sections = docsSections(ref, docs, { siteFunctions: ["authority"], migrations: ["a.sql"] });
const page = (slug) => read(`site/docs/${slug}/index.html`);
const html = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

describe("the sections §47 asks for", () => {
  it("are all present, in order", () => {
    expect(sections.map((s) => s.title)).toEqual([
      "Getting started", "Architecture", "XRPL data", "Analysis engines", "AI", "Policies", "Evidence",
      "Receipts", "API", "Webhooks", "Security", "Enterprise", "Troubleshooting", "Release notes",
    ]);
  });

  it("each names the files it is generated from, and they exist", () => {
    for (const s of sections) {
      expect(s.sources.length, s.slug).toBeGreaterThan(0);
      for (const p of s.sources) expect(existsSync(p), p).toBe(true);
    }
  });

  it("has a wording for every permission in the app's table", () => {
    for (const p of ref.permissions) expect(PERMISSION_LABELS[p], p).toBeTruthy();
  });
});

describe("Markdown from the repository's documents", () => {
  it("escapes HTML and renders the constructs the documents use", () => {
    const out = renderMarkdown("# Title\n\n## Part <b>\n\nA `code` and **bold** [link](docs/x.md).\n\n- one\n  more\n- two\n\n| A | B |\n|---|---|\n| `x` | y |\n\n```\n<script>\n```\n");
    expect(out).not.toContain("<h1>");
    expect(out).toContain("<h3>Part &lt;b&gt;</h3>");
    expect(out).toContain('<code>code</code> and <strong>bold</strong> <a href="https://github.com/Ignosha/noshashi/tree/main/docs/x.md">link</a>');
    expect(out).toContain("<li>one more</li>");
    expect(out).toContain("<td><code>x</code></td>");
    expect(out).toContain("<pre><code>&lt;script&gt;</code></pre>");
  });
});

describe("the built pages carry the code's facts", () => {
  it("every rule, verb, event, role and scene appears where it belongs", () => {
    for (const r of ref.rules) expect(page("policies"), r.id).toContain(r.id);
    for (const v of ref.verbs) expect(page("api"), v.path).toContain(html(v.path));
    for (const e of ref.webhookEvents) expect(page("webhooks"), e.id).toContain(e.id);
    for (const r of ref.roles) expect(page("enterprise"), r.role).toContain(`<th scope="row">${r.role}</th>`);
    for (const s of ref.scenes) expect(page("getting-started"), s.name).toContain(html(s.name));
    for (const c of ref.readCommands) expect(page("xrpl-data"), c).toContain(c);
    for (const q of ref.troubleshooting) expect(page("troubleshooting"), q.question).toContain(html(q.question));
  });

  it("says the reference domains are fixtures, not real permissioned domains", () => {
    expect(page("policies")).toContain("reference fixtures with generic operator names, not real permissioned domains");
  });

  it("release notes are the changelog", () => {
    const latest = /^## (.+)$/m.exec(docs.changelog)[1];
    expect(page("release-notes")).toContain(`<h3>${html(latest)}</h3>`);
  });

  it("every docs page is in the sitemap and the hub links them all", () => {
    const sitemap = read("site/sitemap.xml");
    const hub = read("site/docs/index.html");
    for (const s of sections) {
      expect(sitemap, s.slug).toContain(`/docs/${s.slug}/</loc>`);
      expect(hub, s.slug).toContain(`href="/docs/${s.slug}/"`);
    }
  });
});

describe("the developer portal names only endpoints that are served", () => {
  const dev = read("site/developers/index.html");
  // /api/v1/institutional/* are routes of the FastAPI service in backend/,
  // which is not deployed; the portal listed them with no host to call.
  it("lists the edge function's verbs and not the undeployed service's routes", () => {
    for (const v of ref.verbs) expect(dev, v.path).toContain(`<code>${html(v.path)}</code>`);
    expect(dev).not.toContain("/api/v1/institutional");
    expect(read("scripts/build-site.mjs")).not.toContain("/api/v1/institutional");
  });
});
