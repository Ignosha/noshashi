/*
 * The top-level destinations: /platform/, /solutions/, /resources/,
 * /about/ and /design-partners/.
 *
 * Each page answers one question in a headline and a sentence, then
 * points at the place the detail already lives. Nothing here describes
 * a capability the code does not have: plan names come from
 * src/lib/billing/catalog.ts, and anything the catalog marks "coming
 * soon" is labelled as in development rather than sold.
 */
import { renderPage, breadcrumb } from "../api/_lib/shell.js";

const PLAN = { free: "Free", pro: "Pro", inst: "Institutional", ent: "Enterprise" };

function head(eyebrow, title, intro) {
  return `<div class="page-head"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${intro}</p></div>`;
}

function band(title, text, actions) {
  return `<section><div class="band"><div><h2>${title}</h2><p>${text}</p></div><div class="cta">${actions}</div></div></section>`;
}

const DEMO = `<a class="btn" href="/contact/?topic=institutions">Request a demo</a>`;
const TOOLS = `<a class="btn ghost" href="/#public">Explore free tools</a>`;

/* ── /platform/ ───────────────────────────────────────────────────── */
const CAPABILITIES = [
  ["ISSUER CONTROLS", "Who can freeze, claw back or gate an asset", "Reads the issuer's freeze, clawback and authorization settings and whether each right has been given up.", [PLAN.free, PLAN.pro], "/certificate/", "Check an issuer"],
  ["PAYMENT VERIFICATION", "What a payment actually delivered", "Separates the amount requested from the amount delivered, so partial payments are never credited at face value.", [PLAN.free], "/delivered/", "Verify a payment"],
  ["EXECUTABLE LIQUIDITY", "Depth you can really trade", "Counts only offers whose owners can fund them and compares that with what the book advertises.", [PLAN.free, PLAN.pro], "/book-health/", "Measure a book"],
  ["EXPOSURE", "What you hold, and who controls it", "Lists every trust line on an account and whether each issuer can still freeze it.", [PLAN.free], "/#public", "Read an account"],
  ["DECISIONS", "GO, HOLD or NO-GO against your policy", "Applies a written, versioned policy to the facts and shows the result and reason for every rule.", [PLAN.pro], "/docs/policies/", "How policies work"],
  ["EVIDENCE", "A receipt for every decision", "A SHA-256 receipt over a fixed form of the decision, plus the ledger it was read at. Signed audit exports on Institutional.", [PLAN.pro, PLAN.inst], "/docs/receipts/", "How receipts work"],
  ["SCREENING", "Deposits and withdrawals", "Flags counterfeit tokens, phishing dust, lookalike addresses and OFAC-listed senders up to three hops back.", [PLAN.ent], "/enterprise/", "Enterprise screening"],
  ["ISSUANCE SURVEILLANCE", "Who holds your tokens", "Walks an issuer's trust lines to show who holds the supply and how concentrated it is.", [PLAN.inst], "/pricing/", "See the plan"],
];

function capabilityCards() {
  return CAPABILITIES.map(([num, title, text, plans, href, go]) => `<div class="panel">
  <p class="num">${num}</p><h3>${title}</h3><p>${text}</p>
  <p class="where">${plans.map((p) => `<span class="chip ok">${p}</span>`).join("")}</p>
  <a class="go" href="${href}">${go} &rarr;</a>
</div>`).join("\n");
}

async function buildPlatform(write) {
  const body = `${head("PLATFORM", "One place to read, check and prove what is on the XRP Ledger.",
    "NOSHASHI turns public ledger data into answers you can act on and evidence you can keep.")}

<section>
  <div class="sec-head"><p class="eyebrow">Capabilities</p><h2>What it does today</h2>
    <p>Each card names the plan that includes it. Free capabilities run on this website with no account.</p></div>
  <div class="grid g2">${capabilityCards()}</div>
</section>

<section>
  <div class="sec-head"><p class="eyebrow">How it works</p><h2>From ledger data to verifiable evidence.</h2></div>
  <ol class="steps4">
    <li><p class="num">01 · READ</p><h3>Read the ledger</h3><p>Inspect the relevant XRPL data from validated ledgers.</p></li>
    <li><p class="num">02 · ANALYZE</p><h3>Run the checks</h3><p>Issuer controls, delivered amounts, fillable depth and account settings.</p></li>
    <li><p class="num">03 · VERIFY</p><h3>See the evidence</h3><p>The result, the rule behind it and the ledger it was read at.</p></li>
    <li><p class="num">04 · EXPORT</p><h3>Keep the proof</h3><p>A SHA-256 receipt and exportable evidence for review.</p></li>
  </ol>
</section>

<section>
  <div class="sec-head"><p class="eyebrow">Where it runs</p><h2>Three ways to use it</h2></div>
  <div class="grid g3">
    <a class="panel card-link" href="/#public"><p class="num">WEB TOOLS</p><h3>Free, in your browser</h3><p>Address, payment, order-book, exposure, NFT and node checks on live data.</p><span class="go">Try them &rarr;</span></a>
    <a class="panel card-link" href="/#download"><p class="num">DESKTOP APP</p><h3>macOS, Windows, Linux</h3><p>The full workstation. Free to download, read-only, and it never holds keys.</p><span class="go">Download &rarr;</span></a>
    <a class="panel card-link" href="/developers/"><p class="num">COMPLIANCE API</p><h3>From your own systems</h3><p>The same readings and rule evaluation, called over HTTPS. Included from Pro.</p><span class="go">Developer portal &rarr;</span></a>
  </div>
</section>

<section>
  <div class="sec-head"><p class="eyebrow">In development</p><h2>Not sold until it ships</h2>
    <p>These are listed in the plans as coming soon and are not part of any current offer.</p></div>
  <div class="grid g2">
    <div class="panel"><span class="chip soon">In development</span><h3>Single sign-on</h3><p>For Institutional teams.</p></div>
    <div class="panel"><span class="chip soon">In development</span><h3>Dedicated environment</h3><p>For Enterprise deployments.</p></div>
  </div>
  <p class="micro">Everything in progress is tracked publicly on the <a href="/progress/">progress page</a>.</p>
</section>

${band("Read-only by design.", "No custody. No private-key storage. No transaction signing. See exactly how in the trust centre.",
    `<a class="btn ghost" href="/trust/">Trust &amp; security</a>${DEMO}`)}`;

  await write("platform/index.html", renderPage({
    title: "Platform · NOSHASHI",
    description: "XRPL asset intelligence: issuer controls, payment verification, executable liquidity and traceable evidence, from validated ledger data.",
    path: "/platform/",
    current: "platform",
    body,
    structured: [breadcrumb("Platform", "/platform/")],
  }));
}

/* ── /solutions/ ──────────────────────────────────────────────────── */
const SOLUTIONS = [
  {
    id: "exchanges", num: "EXCHANGES & PAYMENT OPERATORS",
    title: "Credit what arrived. Reject what is fake.",
    problem: "A payment can succeed and deliver a fraction of its stated amount, and deposits can carry counterfeit tokens or phishing dust.",
    uses: [
      ["Delivered-amount checks", PLAN.free, "/delivered/"],
      ["Deposit and withdrawal screening", PLAN.ent, "/enterprise/"],
      ["Webhooks into your systems", PLAN.inst, "/developers/"],
    ],
    start: ["/delivered/", "Verify a payment"],
  },
  {
    id: "trading", num: "TRADING & LIQUIDITY TEAMS",
    title: "Size positions on depth that can fill.",
    problem: "Offers stay listed after their owners spend the funds, so books look deeper than they are.",
    uses: [
      ["Fundable versus advertised depth", PLAN.free, "/book-health/"],
      ["Redemption stress testing", PLAN.pro, "/pricing/"],
      ["Counterparty concentration and drift alerts", PLAN.pro, "/pricing/"],
    ],
    start: ["/book-health/", "Measure a book"],
  },
  {
    id: "issuers", num: "TOKEN ISSUERS & TREASURY",
    title: "Prove your controls. Know your holders.",
    problem: "Holders, exchanges and auditors want to see which powers an issuer keeps, and who holds the supply.",
    uses: [
      ["Authority certificate and issuer badge", PLAN.free, "/certificate/"],
      ["Treasury report", PLAN.free, "/treasury/"],
      ["Issuance surveillance and proof of reserves", PLAN.inst, "/pricing/"],
    ],
    start: ["/certificate/", "Check your issuer"],
  },
  {
    id: "compliance", num: "COMPLIANCE & RISK",
    title: "Decisions you can defend.",
    problem: "A decision without its evidence is hard to defend to an auditor or regulator months later.",
    uses: [
      ["Versioned policy: GO, HOLD or NO-GO", PLAN.pro, "/docs/policies/"],
      ["Receipt vault", PLAN.pro, "/docs/receipts/"],
      ["Immutable audit log, signed exports, regulator seats", PLAN.inst, "/enterprise/"],
    ],
    start: ["/contact/?topic=institutions", "Discuss your workflow"],
  },
];

async function buildSolutions(write) {
  const cards = SOLUTIONS.map((s) => `<section id="${s.id}">
  <div class="panel">
    <p class="num">${s.num}</p>
    <h2 style="font-size:clamp(20px,2.2vw,26px);margin:8px 0 8px">${s.title}</h2>
    <p>${s.problem}</p>
    <ul class="ticks">${s.uses.map(([u, plan, href]) => `<li><a href="${href}">${u}</a> <span class="chip ok">${plan}</span></li>`).join("")}</ul>
    <p class="cta" style="margin-top:18px"><a class="btn ghost" href="${s.start[0]}">${s.start[1]}</a></p>
  </div>
</section>`).join("\n");

  const body = `${head("SOLUTIONS", "Built for people who need to know.",
    "Four teams that move or hold value on the XRP Ledger, and what NOSHASHI does for each.")}

<section>
  <div class="grid g4">
    ${SOLUTIONS.map((s) => `<a class="panel card-link" href="#${s.id}"><p class="num">${s.num}</p><h3>${s.title}</h3><span class="go">See how &rarr;</span></a>`).join("\n    ")}
  </div>
</section>

${cards}

<section id="developers">
  <div class="panel">
    <p class="num">DEVELOPERS & XRPL BUSINESSES</p>
    <h2 style="font-size:clamp(20px,2.2vw,26px);margin:8px 0 8px">Build on the same readings.</h2>
    <p>Call the Compliance API from your own product. Included from Pro.</p>
    <p class="cta" style="margin-top:18px"><a class="btn ghost" href="/developers/">Developer portal</a></p>
  </div>
</section>

${band("Not sure where you fit?", "Tell us the workflow. We will show what exists today and what does not.",
    `${TOOLS}<a class="btn" href="/design-partners/">Become a design partner</a>`)}`;

  await write("solutions/index.html", renderPage({
    title: "Solutions · NOSHASHI",
    description: "NOSHASHI for XRPL exchanges and payment operators, trading desks, token issuers and treasury teams, and compliance and risk teams.",
    path: "/solutions/",
    current: "solutions",
    body,
    structured: [breadcrumb("Solutions", "/solutions/")],
  }));
}

/* ── /resources/ ──────────────────────────────────────────────────── */
const RESOURCES = [
  ["Learn", [
    ["/learn/", "Learn NOSHASHI", "A short course on reading the ledger correctly."],
    ["/guide/", "Plain-language guide", "Every term on the site, explained simply."],
    ["/misread/", "The ledger can be misread", "Real mainnet cases where a basic reading is wrong."],
  ]],
  ["Research", [
    ["/research/", "Research findings", "What we measured, how, and the ledger it came from."],
    ["/book-health/", "Book health", "Advertised against fundable depth, measured live."],
    ["/treasury/", "Treasury report", "What a treasury could really exit."],
  ]],
  ["Build", [
    ["/docs/", "Documentation", "Architecture, data, analysis engines, policies and receipts."],
    ["/developers/", "Developers & API", "The Compliance API and its endpoints."],
    ["/docs/release-notes/", "Release notes", "What changed in each build."],
  ]],
  ["Company & trust", [
    ["/trust/", "Trust & security", "What NOSHASHI can and cannot do, and how to verify it."],
    ["/status/", "Status", "Live service status and the mission log."],
    ["/progress/", "Progress", "What shipped and what is being built."],
    ["/news/", "Newsroom", "XRP and XRPL news in one place."],
    ["/brief/", "Product brief", "NOSHASHI on one page, for sharing."],
    ["/legal/", "Legal & accessibility", "Terms, privacy and accessibility."],
  ]],
];

async function buildResources(write) {
  const groups = RESOURCES.map(([title, items]) => `<section>
  <div class="sec-head"><p class="eyebrow">${title}</p></div>
  <div class="grid g3">
    ${items.map(([href, name, text]) => `<a class="panel card-link" href="${href}"><h3>${name}</h3><p>${text}</p><span class="go">Open &rarr;</span></a>`).join("\n    ")}
  </div>
</section>`).join("\n");

  const body = `${head("RESOURCES", "The detail, when you want it.",
    "Methodology, research, documentation and release history, in one place.")}
${groups}
${band("Prefer to see it working?", "The free tools run on live ledger data in your browser.", `${TOOLS}${DEMO}`)}`;

  await write("resources/index.html", renderPage({
    title: "Resources · NOSHASHI",
    description: "NOSHASHI research, methodology, documentation, release notes, trust and status, in one place.",
    path: "/resources/",
    current: "resources",
    body,
    structured: [breadcrumb("Resources", "/resources/")],
  }));
}

/* ── /about/ ──────────────────────────────────────────────────────── */
async function buildAbout(write) {
  const body = `${head("ABOUT", "Evidence over assumptions.",
    "NOSHASHI Labs builds read-only intelligence for the XRP Ledger, so the people moving value on it can see what is really there.")}

<section>
  <div class="grid g3">
    <div class="panel"><p class="num">WHAT WE BELIEVE</p><h3>Show the evidence</h3><p>An answer is only as good as what it was read from, so every answer names its ledger and its rule.</p></div>
    <div class="panel"><p class="num">HOW WE BUILD</p><h3>Read-only, always</h3><p>NOSHASHI never holds keys, signs transactions or moves funds.</p></div>
    <div class="panel"><p class="num">IN THE OPEN</p><h3>Public source code</h3><p>The code is public on GitHub, and progress and status are published on this site.</p></div>
  </div>
</section>

<section>
  <div class="sec-head"><p class="eyebrow">Where we are</p><h2>Early, and honest about it.</h2>
    <p>Builds are in beta and not code-signed yet. We are looking for a small number of design partners to test NOSHASHI against real workflows.</p></div>
  <p class="cta"><a class="btn ghost" href="/progress/">See progress</a><a class="btn ghost" href="https://github.com/Ignosha/noshashi" rel="noopener">GitHub</a></p>
</section>

${band("Talk to the founder.", "A straight answer from the person who built it.",
    `<a class="btn ghost" href="/design-partners/">Design partners</a><a class="btn" href="/contact/">Contact</a>`)}`;

  await write("about/index.html", renderPage({
    title: "About · NOSHASHI",
    description: "NOSHASHI Labs builds read-only XRPL asset intelligence: evidence from the ledger, no custody, public source code.",
    path: "/about/",
    current: "about",
    body,
    structured: [breadcrumb("About", "/about/")],
  }));
}

/* ── /design-partners/ ────────────────────────────────────────────── */
async function buildDesignPartners(write) {
  const body = `${head("DESIGN PARTNERS", "Help shape the next generation of XRPL intelligence.",
    "Work directly with the NOSHASHI team to evaluate real workflows, identify operational gaps, and help prioritize the next stage of development.")}

<section>
  <div class="grid g2">
    <div class="panel">
      <p class="num">WHAT YOU GET</p>
      <ul class="ticks">
        <li>Working sessions with the founder on your actual workflow.</li>
        <li>An honest view of what NOSHASHI does today, and what it does not.</li>
        <li>Your feedback weighed directly in what gets built next.</li>
      </ul>
    </div>
    <div class="panel">
      <p class="num">WHAT WE ASK</p>
      <ul class="ticks">
        <li>A real operational problem to test against.</li>
        <li>Agreed criteria for what success looks like.</li>
        <li>Structured feedback during the evaluation.</li>
      </ul>
    </div>
  </div>
</section>

<section>
  <div class="sec-head"><p class="eyebrow">How a pilot works</p><h2>Five steps, no surprises.</h2></div>
  <ol class="steps4 steps5">
    <li><p class="num">01</p><p>You name an operational problem.</p></li>
    <li><p class="num">02</p><p>We show the existing capability that addresses it.</p></li>
    <li><p class="num">03</p><p>We agree how success will be measured.</p></li>
    <li><p class="num">04</p><p>You test it against your current workflow.</p></li>
    <li><p class="num">05</p><p>The results decide a paid pilot, a contract or what we build next.</p></li>
  </ol>
</section>

<section id="apply">
  <div class="sec-head"><p class="eyebrow">Apply</p><h2>Tell us what you want to solve.</h2>
    <p>Five fields. A person reads every one and replies.</p></div>
  <form class="form-grid" id="partner-form" novalidate style="max-width:760px">
    <div class="form-row split">
      <div class="form-field"><label for="p-name">Name</label><input id="p-name" name="name" type="text" autocomplete="name" maxlength="120" required></div>
      <div class="form-field"><label for="p-email">Work email</label><input id="p-email" name="email" type="email" autocomplete="email" maxlength="200" required></div>
    </div>
    <div class="form-row split">
      <div class="form-field"><label for="p-org">Organization</label><input id="p-org" name="org" type="text" autocomplete="organization" maxlength="160" required></div>
      <div class="form-field"><label for="p-role">Role</label><input id="p-role" name="role" type="text" autocomplete="organization-title" maxlength="80" required></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label for="p-problem">The problem you want to solve</label><textarea id="p-problem" name="problem" maxlength="3000" required></textarea></div>
    </div>
    <div class="form-trap" aria-hidden="true"><label for="p_company">Leave this field empty</label><input id="p_company" name="company_website" type="text" tabindex="-1" autocomplete="off"></div>
    <div class="form-actions">
      <button class="btn" type="submit" id="p-send">Become a design partner</button>
      <p class="form-status" id="p-status" role="status" aria-live="polite"></p>
    </div>
  </form>
  <p class="micro">Nothing on this page is an offer. Any pilot's scope and terms are agreed in writing first.</p>
</section>`;

  await write("design-partners/index.html", renderPage({
    title: "Design partners · NOSHASHI",
    description: "Evaluate NOSHASHI against a real XRPL workflow with the team that builds it, and help set what gets built next.",
    path: "/design-partners/",
    current: "",
    body,
    scripts: `<script src="/assets/partner.js" defer></script>`,
    structured: [breadcrumb("Design partners", "/design-partners/")],
  }));
}

export async function buildRedesignPages(write) {
  await buildPlatform(write);
  await buildSolutions(write);
  await buildResources(write);
  await buildAbout(write);
  await buildDesignPartners(write);
}

export const REDESIGN_PAGES = [
  ["/platform/", "monthly", "0.9"],
  ["/solutions/", "monthly", "0.9"],
  ["/resources/", "monthly", "0.7"],
  ["/about/", "monthly", "0.6"],
  ["/design-partners/", "monthly", "0.8"],
];
