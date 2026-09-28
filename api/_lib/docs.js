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
  manageSeats: "Grant and revoke examiner seats",
  setBrand: "Set the white-label brand",
  recordAudit: "Record exports, alerts and scheduled runs",
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
<h2>NOSHX</h2>
<p>NOSHX is the agent on the NOSHX screen. It answers a question by reading the live ledger through the app's own read-only tools (issuer authority, order-book depth, settlements, control surfaces, provenance, pools, issuance, the address check, claims, NFT rights and ledger status), then explains what it read. It cannot sign, submit or move anything. Each tool carries the same plan requirement as the screen it mirrors, and address checks on the Free plan count against the same monthly allowance. Its reasoning is the chosen model's; its figures come from the ledger. A model that cannot call tools answers from the state it is given, and says so.</p>
<p>NOSHX also answers questions about NOSHASHI itself: its screens, features, plans and prices, and what these documentation pages, the Learn course, pricing, trust and legal pages say. Those pages are indexed inside the app (keyword search, no extra model and no network), the passages that match a question are given to the model with their addresses, and NOSHX can search them again as a tool. With no model running, the support desk answers from the same pages.</p>
<h2 id="noshx-core">NOSHX Core</h2>
<p>By default NOSHX runs on NOSHX Core, NOSHASHI's own engine, which uses no language model. It reads the question for what NOSHASHI can act on (addresses, transaction hashes, currency codes) and what is being asked about them, runs the matching read-only readers, and writes the answer from their reports with the findings the screens show. Product and compliance questions are answered with the most relevant sentences from these pages, with their sources, and questions about what to use name the screens that fit and the plan each needs. Core runs inside the app: nothing you ask is sent anywhere, only the ledger reads go to the public XRPL servers.</p>
<p>The support console on noshashi.app is NOSHX Core too, running in the visitor's browser. It answers from the website's support answers and these pages, reads an address, NFT id or transaction from the live ledger when a question names one, and hands anything it cannot answer to the contact form. A visitor has no plan, so paid readers say which plan they need; address checks count against the same free allowance of 10 a month, kept in that browser.</p>
<p>A language model is optional. A model that cannot call tools is given Core's readings to answer from; with failover on, a model that fails falls back to Core. Local requests use a fixed 8K context. Deep reasoning, off by default, lets a model think before answering; a model without a thinking mode is asked again without it.</p>
<h2 id="training-noshx">Training NOSHX</h2>
<p>NOSHX's own language model is trained from NOSHASHI's own content with the free kit in <a href="https://github.com/Ignosha/noshashi/tree/main/scripts/noshx-model">scripts/noshx-model</a>. The training data is the in-app help, the Learn course's knowledge check and word list, the plan catalogue, the screen reference and every section of these pages. A Google Colab notebook fine-tunes IBM's Granite 4.0 1B (Apache 2.0 licence) on a free T4 GPU and exports a 4-bit file of about 1 GB, which answers quickly on a laptop's CPU and leaves most of an 8 GB laptop's memory free. Microsoft's Phi-4-mini-instruct (MIT licence, about 2.5 GB) is an option in the notebook when better writing matters more than speed. Add the model to Ollama with <code>ollama create noshx -f Modelfile</code> and choose it in the runtime panel. The model learns NOSHASHI's facts and voice; live ledger facts still come from NOSHX Core's readers at the time of the question.</p>
<p>The runtime can be switched at any time between a local model and a hosted one; each provider remembers its own endpoint and model. With failover on, a runtime that cannot be reached is replaced for that answer by the last one that worked, and the answer says which.</p>
<h2 id="support-tickets">Support tickets</h2>
<p>Signed-in customers open a ticket from NOSHX › TICKETS › NEW TICKET, with a subject, a topic, a priority and a description, and optionally the app version and platform. Each ticket gets a reference such as NSH-1042. NOSHASHI support replies in the same thread; the customer is emailed about a reply, and support is emailed about a new ticket or a customer's reply. A ticket reads WAITING ON SUPPORT until support answers, then SUPPORT REPLIED; either side can mark it RESOLVED, and a customer's reply reopens it.</p>
<p>Tickets are held in NOSHASHI's database with row level security: a customer can read only their own tickets, and only support staff can read every ticket. Messages cannot be edited or deleted by anyone. Every write goes through a server function that checks who is writing, and a ticket or reply containing an XRPL secret seed is refused in the app before it is sent. At most 10 tickets a day can be opened from one account.</p>
<h2>Where API keys go</h2>
<p>A provider key is kept in the operating system keyring. In the desktop app, model requests are made by the app itself rather than by its window: the key goes from the keyring to the provider's own host over TLS, and the window can store, check or clear a key but never read one back. A key for a named provider is only ever sent to that provider's API host, a custom endpoint must use HTTPS, and local runtimes never receive a key.</p>
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
      intro: "Organizations, roles, four-eyes governance, examiner seats, white-label, monitoring, deposit screening, event feeds and the audit trail — what is built today.",
      sources: ["src/lib/org/governance.ts", "src/lib/org/webhooks.ts", "src/lib/xrpl/ledgerWatch.ts", "supabase/functions/_shared/xrplEvents.ts", "src/lib/trust/boundary.json"],
      body: `
<p>An organization shares policies, exceptions, investigations, webhooks and API receipts among its members. The server decides every permission; the table below is the same permission table the app uses to explain a refusal.</p>
<h2>Roles</h2>
${table(["Role", ...ref.permissions.map((p) => PERMISSION_LABELS[p] ?? p)], ref.roles.map((r) => [esc(r.role), ...ref.permissions.map((p) => (r.permissions.includes(p) ? "✓" : "—"))]))}
<h2>Oversight</h2>${list(ref.oversight)}
<h2 id="regulator-seats">Regulator seats</h2>
<p>An owner, admin or compliance member can give an examiner a read-only seat for 1 to 180 days (Institutional and above). The examiner signs in with their own NOSHASHI account and reads the organization's policies, exceptions, investigations and audit log; every write the server offers refuses them. The seat stops working at its end date without anyone acting, because membership itself honours the expiry, and each visit is written to the audit log (at most once every 30 minutes). Granting, extending and revoking a seat are audit entries too.</p>
<h2 id="white-label">White-label console and reports</h2>
<p>An owner or admin can set the organization's display name and accent colour. Members then see that name at the top of the console, credited as running on NOSHASHI, and it is printed on the reports they export: "Prepared for …" on the signed audit export and the asset passport PDF. NOSHASHI holds no keys, so there is no wallet to brand; what carries the brand is the record.</p>
<h2 id="audit-log">What the audit log records</h2>
<p>The server records governance itself: policy drafts, submissions and activations, exceptions and their decisions, investigations, webhooks, members, seats and the brand. A member's workstation adds what only it sees, under the member's own identity: every file exported (name, size and SHA-256), every verdict recorded, changes to the monitoring schedule and alert rules, each scheduled stress run, and each custom alert that fired. Examiners and viewers read the log and cannot add to it. Nothing in it can be edited or deleted by anyone.</p>
<h2 id="monitoring">Scheduled monitoring and custom alerts</h2>
<p>PORTFOLIO &amp; RADAR › MONITOR re-runs the redemption stress test for every wallet in the book every 1 to 24 hours while the app is open, with the same readers and model as the Risk screen, and keeps the last 30 readings per wallet. Alert rules test those readings (recovery ratio, freezable share, days to exit, trapped value, mark value, frozen and freezable positions) with conditions joined by ALL or ANY, scoped to every wallet or chosen ones, with a cooldown. A rule sends to the console, a desktop notification, or the organization's webhooks as the signed event <code>custom_alert</code>. A figure that could not be measured never triggers a rule.</p>
<h2 id="deposit-screening">Deposit screening (Enterprise)</h2>
<p>ADJUDICATION › LEDGER WATCH screens an incoming payment before it is credited, read live from the ledger. It credits what actually arrived (<code>delivered_amount</code>; a partial payment that asks for 100,000 XRP and delivers 0.077 is credited 0.077), holds a familiar ticker whose issuer owes nothing as counterfeit, flags a drop of dust whose memo carries a link as a phishing lure, notes a missing destination tag, the issuer's freeze and clawback rights and your Travel Rule threshold, and reads who created the sender, who created them and who created them, checking all three against the organization's deny list. The verdict is clear, review or hold, with the amount to credit; a fact that could not be read holds the deposit rather than passing it. Watched deposit addresses are screened by the server every minute, without the app open.</p>
<h2 id="event-feeds">XRPL event feeds (Strategic)</h2>
<p>An organization can watch up to 100 accounts. The server reads each one's new validated transactions every minute and records payments, trust-line freezes and changes, account settings and issuer flag changes, offers, checks, escrows, clawbacks, NFT and AMM activity; another party's trade that only rippled through the account is recorded as such, not as the account's own act. Every event goes to the organization's webhooks as <code>xrpl_event</code> (and <code>deposit_screened</code> for screened deposits), and can be pulled from <code>GET /functions/v1/noshashi-xrpl-watch/events</code> as JSON, NDJSON or CSV with an organization key; <code>POST …/history</code> reads any account over any ledger range the same way, for backfill.</p>
<h2 id="custom-schemas">Custom schemas, bulk export and retention (Strategic)</h2>
<p>An export schema names the fields you want (a dotted path such as <code>data.delivered.value</code>) and the column to write each under, for ledger events or the audit log, in CSV, NDJSON or JSON. The same schema shapes a bulk export saved from the console and the feed API (<code>?schema=&lt;id&gt;</code>), which your systems pull on their own schedule. Ledger events are kept for the number of days you set, from 7 to 3,650; the audit log is never removed.</p>
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
