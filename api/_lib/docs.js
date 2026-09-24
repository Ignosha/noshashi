/**
 * The documentation hub at /docs/ — fourteen sections, rendered from the
 * implementation.
 *
 * Nothing here is a second description of the product written by hand.
 * The facts come from src/lib/docs/reference.json (which a test keeps
 * equal to what the code produces: the rule set, the permission table,
 * the webhook events, the edge function's verbs, the console reference)
 * and from the repository's own reference documents, which tests keep in
 * step with the code (docs/api/COMPLIANCE_API.md, docs/api/WEBHOOKS.md,
 * SECURITY.md, CHANGELOG.md). The prose around them only says where each
 * fact comes from and how the pieces connect.
 */

import { esc } from "./html.js";

const REPO = "https://github.com/Ignosha/noshashi/tree/main";

/* ── a small Markdown renderer for the repository's own documents ──── */

function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:]|$)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      // Relative links in the repo's documents point at repository files.
      const url = /^(https?:|\/|#|mailto:)/.test(href) ? href : `${REPO}/${href.replace(/^\.\//, "")}`;
      return `<a href="${url}">${label}</a>`;
    });
}

/**
 * Headings, paragraphs, lists, fenced code and pipe tables — what the
 * repository's documents use. The first `#` title is dropped (the page
 * has its own) and the rest are shifted down one level under it.
 */
export function renderMarkdown(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let droppedTitle = false;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i += 1;
      out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      i += 1;
      if (heading[1].length === 1 && !droppedTitle) {
        droppedTitle = true;
        continue;
      }
      const level = Math.min(6, heading[1].length + 1);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(
        `<div class="table-scroll"><table class="doc-table"><thead><tr>${cells(head).map((c) => `<th scope="col">${inline(c)}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, "");
        // Continuation lines are indented under the item.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) item += ` ${lines[i++].trim()}`;
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }
    if (!line.trim() || /^(-{3,}|⸻)\s*$/.test(line)) {
      i += 1;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*\||\s*([-*]|\d+\.)\s+)/.test(lines[i])) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

/* ── building blocks ─────────────────────────────────────────────── */

const table = (head, rows) =>
  `<div class="table-scroll"><table class="doc-table"><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`)).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
const list = (items) => `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
const code = (x) => `<code>${esc(x)}</code>`;
const stage = (ref, label) => ref.stages.find((s) => s.label === label);

/** Human wording for each permission key in the app's permission table. */
export const PERMISSION_LABELS = {
  editDraft: "Edit policy drafts",
  simulate: "Simulate a draft against past verdicts",
  submit: "Submit a draft for activation",
  activate: "Activate a submitted policy (not their own)",
  requestException: "Request an exception on a verdict",
  approveException: "Decide an exception (not their own)",
  manageMembers: "Manage members",
  readAudit: "Read the audit log",
};

/** Scenes that are settings, commerce or help rather than readings of the ledger. */
const NOT_ANALYSIS = new Set(["Overview", "Agent", "Learn", "Growth", "Pricing", "Account", "Business Plan", "Legal & Accessibility", "Trust & Security", "Settings"]);
const PLANS = ["Free", "Desk", "Institution", "Enterprise"];

/* ── the fourteen sections ───────────────────────────────────────── */

/**
 * @param ref  src/lib/docs/reference.json
 * @param docs { api, webhooks, security, changelog } — the repository's documents
 * @param repo { siteFunctions: string[], migrations: string[] } — listings read at build time
 */
export function docsSections(ref, docs, repo) {
  const byPlan = PLANS.map((plan) => [plan, ref.scenes.filter((s) => s.plan === plan)]).filter(([, s]) => s.length);
  const planOf = (name) => ref.scenes.find((s) => s.name === name)?.plan;
  const rolesWith = (permission) => ref.roles.filter((r) => r.permissions.includes(permission)).map((r) => r.role);

  return [
    {
      slug: "getting-started",
      title: "Getting started",
      intro: "What NOSHASHI does, how to install it, and which screens each plan opens.",
      sources: ["src/lib/agent/context.ts"],
      body: `
<p>NOSHASHI reads the XRP Ledger's validated state, applies deterministic rules to what it reads, and shows the evidence behind every answer. It holds no keys and signs or submits nothing (see <a href="/docs/security/">Security</a>).</p>
<h2>Install</h2>
<p>Download the desktop app for macOS, Windows or Linux from the <a href="/#download">download section</a>. The free screens work without an account. Paid plans are on the <a href="/pricing/">pricing page</a>.</p>
<h2>First steps</h2>
<ol>
<li>Open <strong>Check an Address</strong> and paste any XRPL address to see what the ledger publishes about it.</li>
<li>Open <strong>Verification</strong>, describe a settlement, and read the verdict and the rule that decided it.</li>
<li>Read <a href="/docs/policies/">Policies</a> for how a verdict is decided and <a href="/docs/receipts/">Receipts</a> for how it is recorded.</li>
</ol>
<h2>Screens by plan</h2>
${byPlan.map(([plan, scenes]) => `<h3>${esc(plan)}</h3>${list(scenes.map((s) => s.name))}`).join("\n")}
<p>The list is the app's own console reference, which the in-app agent also reads, and a test keeps it in step with the screens the app has.</p>`,
    },
    {
      slug: "architecture",
      title: "Architecture",
      intro: "The parts NOSHASHI is made of, and the path every reading takes from the ledger to a receipt.",
      sources: ["src/lib/trust/boundary.json", "supabase/functions", "supabase/migrations", "api"],
      body: `
<h2>Parts</h2>
${table(["Part", "Where", "What it does"], [
  ["Desktop app", `${code("src/")} · ${code("src-tauri/")}`, "Tauri shell with a React interface. It reads the ledger directly, runs every engine and the rule set on the device, and keeps local history."],
  ["Website", `${code("site/")} · ${code("scripts/build-site.mjs")}`, "Static pages rendered at deploy time, including these docs."],
  ["Site functions", repo.siteFunctions.map(code).join(" "), "Vercel functions behind the website: market and news feeds, the project feed, contact and newsletter sign-up, the support chat, checkout and the public authority check."],
  ["Edge functions", ref.edgeFunctions.map(code).join(" "), "Supabase Edge Functions: the Compliance API, checkout and billing, policy activation, exception decisions and password screening."],
  ["Database", `${code("supabase/migrations/")} (${repo.migrations.length} migrations)`, "Postgres with row-level security: accounts, API keys and rate limits, organizations and roles, policies, exceptions, investigations, webhooks and the audit log."],
])}
<p>The repository also holds an earlier FastAPI service (${code("backend/")}) and Next.js interface (${code("frontend/")}). They are not deployed, and nothing on this site depends on them.</p>
<h2>From the ledger to the receipt</h2>
<ol class="doc-steps">${ref.stages
        .map((s) => `<li><strong>${esc(s.label)}</strong> — ${esc(s.summary)}<br><span class="doc-where mono">${s.where.map((w) => `<a href="${REPO}/${esc(w)}">${esc(w)}</a>`).join(" · ")}</span></li>`)
        .join("")}</ol>`,
    },
    {
      slug: "xrpl-data",
      title: "XRPL data",
      intro: "Which servers NOSHASHI reads from, which commands it sends, and what state it trusts.",
      sources: ["src/lib/xrpl/link.ts", "src/lib/trust/boundary.json"],
      body: `
<h2>Servers</h2>${list(ref.servers)}
<p>${esc(stage(ref, "XRPL MAINNET").detail)}</p>
<h2>Validated state only</h2><p>${esc(stage(ref, "VALIDATED STATE").detail)}</p>
<h2>Commands sent</h2><p class="mono">${ref.readCommands.map(esc).join(" · ")}</p>
<p>Never sent: ${ref.forbiddenCommands.map(code).join(", ")}. A test fails the build if any covered file sends one, or sends a command not on the list above.</p>
<h2>Normalization</h2><p>${esc(stage(ref, "NORMALIZATION").detail)}</p>
<p>The ledger can be read correctly and still be misread. <a href="/misread/">Six recorded cases</a> show a field taken at face value next to what NOSHASHI's code reports for the same reply.</p>`,
    },
    {
      slug: "analysis",
      title: "Analysis engines",
      intro: "The deterministic engines behind each screen: what each one reads and the plan it needs.",
      sources: ["src/lib/agent/context.ts", "src/lib/trust/boundary.json"],
      body: `
<p>${esc(stage(ref, "ANALYSIS").detail)}</p>
${table(["Screen", "Plan", "What it establishes"], ref.scenes.filter((s) => !NOT_ANALYSIS.has(s.name)).map((s) => [esc(s.name), esc(s.plan), esc(s.summary)]))}`,
    },
    {
      slug: "ai",
      title: "AI",
      intro: "Where the assistant runs, what it is sent, and what it is not allowed to decide.",
      sources: ["src/lib/agent/providers.ts", "src/lib/agent/secrets.ts", "src/lib/trust/boundary.json"],
      body: `
<p>The agent explains readings and answers questions about the console. Verdicts come from the rule set alone: no model output enters a decision, and the assistant cannot create, change or close an investigation. On the <strong>Ledger Garden</strong> screen (${esc(planOf("Ledger Garden") ?? "")}) a walked path, with its full addresses, hashes and evidence, can be handed to the agent as one question that asks it to use only those facts.</p>
<h2>Providers</h2>
${table(["Provider", "Runs", "Cost to you", "Key"], ref.providers.map((p) => [`<a href="${esc(p.docsUrl)}">${esc(p.name)}</a>`, p.local ? "On this device" : "Hosted", p.free ? "Free" : "Provider pricing", p.requiresKey ? "Required" : "Not needed"]))}
<p>A custom OpenAI-compatible endpoint can also be configured. ${esc(ref.limits.find((l) => /AI provider/.test(l)) ?? "")}</p>
<h2>Secrets never reach a model</h2>
<p>A message containing a valid XRPL seed, recognised by its checksum, is refused before any request is made.</p>
<h2>Oversight</h2>${list(ref.oversight)}`,
    },
    {
      slug: "policies",
      title: "Policies",
      intro: "How a verdict is decided, every rule the rule set can apply, and how institutional policies are governed.",
      sources: ["src/lib/policy.ts", "src/lib/org/governance.ts"],
      body: `
<h2>Verdicts</h2>
${table(["Verdict", "Meaning"], ref.verdicts.map((v) => [esc(v.title), esc(v.blurb)]))}
<p>A blocking failure gives NO-GO. Otherwise an evidence source that could not be read gives INSUFFICIENT DATA. Otherwise an advisory failure gives HOLD. Otherwise GO.</p>
<h2>Rules</h2>
${table(["Rule", "Check", "Severity", "Domains"], ref.rules.map((r) => [code(r.id), esc(r.label), r.severity === "block" ? "Blocking" : "Advisory", esc(r.domains.join(", "))]))}
<p>An evidence rule (${code("EVIDENCE_<SOURCE>")}, advisory) is added for each source that could not be read, so a missing reading is never treated as a pass.</p>
<h2>Reference domains</h2>
<p>These are reference fixtures with generic operator names, not real permissioned domains. On a live network the same fields are read from XLS-80 ${code("PermissionedDomain")} objects.</p>
${table(["Domain", "Requires", "Ceiling (XRP)", "Governance"], ref.domains.map((d) => [`${esc(d.code)}<br><span class="mono">${esc(d.name)}</span>`, esc(d.requirements.join(", ")), d.ceilingXrp ? d.ceilingXrp.toLocaleString("en-US") : "closed", esc(d.governance)]))}
<h2>Institutional policies</h2>
<p>An organization's policy moves from draft to pending to active. Drafts are written and simulated by ${esc(rolesWith("editDraft").join(", "))}. A pending policy is activated by ${esc(rolesWith("activate").join(", "))}, and never by the person who submitted it. The server enforces that rule, not the app. The active version is bound into every receipt it produces.</p>`,
    },
    {
      slug: "evidence",
      title: "Evidence",
      intro: "What NOSHASHI keeps with every answer, and how uncertainty is shown rather than hidden.",
      sources: ["src/lib/trust/boundary.json", "src/lib/policy.ts"],
      body: `
<h2>What is recorded</h2><p>${esc(stage(ref, "EVIDENCE").detail)}</p>
<h2>How the decision is made</h2><p>${esc(stage(ref, "DECISION").detail)}</p>
<h2>When a reading is missing</h2><p>${esc(ref.verdicts.find((v) => v.id === "insufficient-data").blurb)}</p>
<p>Every reading names the ledger index it came from. A transaction that is not yet validated is labelled as not final.</p>`,
    },
    {
      slug: "receipts",
      title: "Receipts",
      intro: "The digest that fixes a decision, and how to check it later.",
      sources: ["src/lib/policy.ts", "supabase/functions/noshashi-verify/index.ts"],
      body: `
<p>${esc(stage(ref, "CRYPTOGRAPHIC RECEIPT").detail)}</p>
<p>${esc(ref.limits.find((l) => /receipt digest/i.test(l)) ?? "")}</p>
<h2>Looking one up</h2>
${table(["Verb", "What it does"], ref.verbs.filter((v) => /receipts|authority/.test(v.path)).map((v) => [code(v.path), esc(v.description)]))}
<p>See the <a href="/docs/api/">API reference</a> for request and response shapes.</p>`,
    },
    {
      slug: "api",
      title: "API",
      intro: "The Compliance API: one edge function, every verb it serves.",
      sources: ["supabase/functions/noshashi-verify/index.ts", "docs/api/COMPLIANCE_API.md"],
      body: `
<h2>Verbs as the function lists them</h2>
${table(["Path", "Description"], ref.verbs.map((v) => [code(v.path), esc(v.description)]))}
${renderMarkdown(docs.api)}`,
    },
    {
      slug: "webhooks",
      title: "Webhooks",
      intro: "Signed deliveries of an organization's governance events.",
      sources: ["src/lib/org/webhooks.ts", "docs/api/WEBHOOKS.md"],
      body: `
<h2>Events offered in the app</h2>
${table(["Event", "Label"], ref.webhookEvents.map((e) => [code(e.id), esc(e.label)]))}
${renderMarkdown(docs.webhooks)}`,
    },
    {
      slug: "security",
      title: "Security",
      intro: "What NOSHASHI never does, where data goes, and how to report a vulnerability.",
      sources: ["src/lib/trust/boundary.json", "SECURITY.md"],
      body: `
<h2>Boundaries</h2>
${table(["Boundary", "Claim", "Why it holds"], ref.boundaries.map((b) => [esc(b.label), esc(b.claim), esc(b.basis)]))}
<h2>Where data goes</h2>
${table(["Who", "What", "Why"], ref.dataFlows.map((f) => [esc(f.party), esc(f.what), esc(f.why)]))}
<h2>What is not claimed</h2>${list(ref.limits)}
<p>The same model, with each stage's source files, is on the <a href="/trust/">Trust &amp; security</a> page.</p>
${renderMarkdown(docs.security)}`,
    },
    {
      slug: "enterprise",
      title: "Enterprise",
      intro: "Organizations, roles, four-eyes governance and the audit trail — what is built today.",
      sources: ["src/lib/org/governance.ts", "src/lib/org/webhooks.ts", "src/lib/trust/boundary.json"],
      body: `
<p>An organization shares policies, exceptions, investigations, webhooks and API receipts among its members. The server decides every permission; the table below is the same permission table the app uses to explain a refusal.</p>
<h2>Roles</h2>
${table(["Role", ...ref.permissions.map((p) => PERMISSION_LABELS[p] ?? p)], ref.roles.map((r) => [esc(r.role), ...ref.permissions.map((p) => (r.permissions.includes(p) ? "✓" : "—"))]))}
<h2>Oversight</h2>${list(ref.oversight)}
<h2>Integrations</h2>
<p>Organization API keys record receipts as the organization's (<a href="/docs/api/">API</a>). Governance events are delivered to your endpoints with a signature (<a href="/docs/webhooks/">Webhooks</a>).</p>
<p>Plans and contract terms are on the <a href="/enterprise/">Enterprise</a> and <a href="/pricing/">pricing</a> pages. ${esc(ref.limits.find((l) => /certification/.test(l)) ?? "")}</p>`,
    },
    {
      slug: "troubleshooting",
      title: "Troubleshooting",
      intro: "Answers to the questions people ask most, from the app's offline support desk.",
      sources: ["src/lib/support/knowledge.ts"],
      body: `
<div class="qa">${ref.troubleshooting.map((q) => `<details><summary>${esc(q.question)}</summary><p>${esc(q.answer)}</p></details>`).join("\n")}</div>
<p>The same answers are built into the app's Agent screen and work offline. Still stuck? <a href="/contact/">Contact support</a>.</p>`,
    },
    {
      slug: "release-notes",
      title: "Release notes",
      intro: "What changed in each release.",
      sources: ["CHANGELOG.md"],
      body: renderMarkdown(docs.changelog),
    },
  ];
}
