/*
 * The support console's knowledge base.
 *
 * Every entry is a fact that is also stated somewhere a visitor can
 * check — a price on /pricing/, a hash on the download section, a claim
 * in SECURITY.md. The bot is not allowed a private set of facts: if an
 * answer here and the page disagree, the page is right and this file is
 * a bug.
 *
 * Two answering modes are built on this, in `api/support-chat.js`:
 *
 *   - Retrieval. Always available, no key, no network, deterministic.
 *     Scores the question against these entries and returns the best
 *     match verbatim.
 *   - Claude. Used when ANTHROPIC_API_KEY is configured. The same
 *     entries go into the system prompt as the only permitted source,
 *     and the model is instructed to hand off rather than guess.
 *
 * The product's whole argument is that it does not invent figures. A
 * support bot that invents one would undo that argument, so both modes
 * end at the same place when they do not know: the contact form.
 */

export const CONTACT = {
  support: "support@noshashi.app",
  institutions: "institutions@noshashi.app",
  security: "security@noshashi.app",
  privacy: "privacy@noshashi.app",
  form: "/contact/",
};

export const ENTRIES = [
  {
    id: "what",
    keywords: ["what", "noshashi", "do", "product", "about", "purpose", "explain", "is"],
    q: "What does NOSHASHI do?",
    a: "NOSHASHI reads validated XRP Ledger state and answers two questions from it at the same moment: whether a transfer is permitted under the rules you configured, and whether you could actually exit the position. It returns a GO, HOLD or NO-GO verdict with the evidence attached. It is informational tooling — it never holds, signs or moves an asset.",
    links: [{ label: "The thesis", href: "/#thesis" }],
  },
  {
    id: "advice",
    // Deliberately narrow keywords. Anything as generic as "should" or
    // "buy" would pull ordinary questions ("should I download the beta")
    // into a refusal, which is a worse failure than the one it prevents.
    keywords: ["worth", "predict", "prediction", "forecast", "invest", "investing",
               "investment", "profit", "portfolio", "bullish", "bearish", "moon",
               "pump", "dump", "hodl", "rally", "target"],
    q: "Will XRP go up? Should I buy?",
    a: "That is outside what this tool does, and outside what anyone here will tell you. NOSHASHI reports whether a transfer is permitted under the rules you configured and whether you could actually exit the position. It does not forecast a price, and nothing it produces is investment, legal, regulatory or tax advice.",
    links: [{ label: "What it actually does", href: "/#thesis" }, { label: "Legal", href: "/legal/" }],
  },
  {
    id: "price",
    keywords: ["price", "pricing", "cost", "costs", "much", "free", "tier", "plan", "plans", "seat", "pay", "expensive", "cheap"],
    q: "What does it cost?",
    a: "The console is free forever, including unlimited GO/HOLD/NO-GO checks, live mainnet telemetry and 10 address checks a month. Pro is $749 per seat per month and adds unlimited address checks, exit-liquidity and freeze-rights analysis, the persistent adjudication ledger and 5,000 API verifications. Institutional is $4,000 a month and adds Travel Rule scoping, signed audit export, offline adjudication and 100,000 API verifications.",
    links: [{ label: "Full pricing", href: "/pricing/" }],
  },
  {
    id: "download",
    keywords: ["download", "install", "mac", "macos", "windows", "linux", "dmg", "exe", "deb", "rpm", "appimage", "msi", "platform", "get"],
    q: "How do I download it?",
    a: "Builds for macOS (Apple silicon and Intel), Windows (.exe and .msi) and Linux (.deb, .rpm, .AppImage) are on the download section, produced by GitHub Actions from a public commit. Every artifact lists its SHA-256 so you can verify it before running it.",
    links: [{ label: "Downloads", href: "/#download" }],
  },
  {
    id: "beta",
    keywords: ["beta", "stable", "release", "channel", "production", "ready", "version", "pre-release"],
    q: "Is this production-ready?",
    a: "No — every build on this site is labelled BETA. It is pre-1.0, the binaries are not code-signed or notarised yet, and the release pipeline is still being hardened. Treat it as an evaluation build: verify the SHA-256, run it through your own software admission process, and do not make it the sole basis of a decision carrying legal consequence.",
    links: [{ label: "Downloads", href: "/#download" }, { label: "Status", href: "/status/" }],
  },
  {
    id: "unsigned",
    keywords: ["gatekeeper", "smartscreen", "unsigned", "unidentified", "developer", "warn", "blocked", "notarised", "notarized", "signature"],
    q: "macOS or Windows blocks the app — is that expected?",
    a: "Yes. The builds are not code-signed or notarised while the release pipeline is being hardened, so macOS reports an unidentified developer and Windows SmartScreen warns. On macOS, right-click the app and choose Open the first time. Verify the SHA-256 published next to the download first — that check is what actually tells you the file is the one CI built.",
    links: [{ label: "Verify a download", href: "/#download" }],
  },
  {
    id: "verify",
    keywords: ["verify", "hash", "sha256", "sha-256", "checksum", "integrity", "tamper", "authentic"],
    q: "How do I verify a download?",
    a: "Each artifact's SHA-256 is printed next to it. Run `shasum -a 256 <file>` on macOS or Linux, or `certutil -hashfile <file> SHA256` on Windows, and compare. The application also hashes its own running binary under Settings › Binary integrity, on every tier — verifying that we are not malicious is not a paid feature.",
    links: [{ label: "Downloads", href: "/#download" }],
  },
  {
    id: "account",
    keywords: ["account", "sign", "signup", "login", "register", "dashboard", "workspace", "password"],
    q: "Do I need an account?",
    a: "No. There are no accounts on this site — sign-in and the hosted workspace were withdrawn. The application runs on your machine and reads public ledger state directly, so there is no server-side state to log into. A paid subscription is managed through Stripe and does not create a website login.",
    links: [{ label: "Security posture", href: "/#security" }],
  },
  {
    id: "privacy",
    keywords: ["privacy", "data", "telemetry", "analytics", "tracking", "collect", "gdpr", "store", "egress"],
    q: "What data do you collect?",
    a: "Without an account there is no server-side state: no analytics, no telemetry, no crash reporting. The compliance agent runs on your own machine with zero egress. Secrets are held by the OS keychain rather than by the app. Typefaces are self-hosted, so opening a page does not announce you to a font CDN.",
    links: [{ label: "Security posture", href: "/#security" }, { label: "Legal", href: "/legal/" }],
  },
  {
    id: "custody",
    keywords: ["custody", "funds", "wallet", "sign", "transaction", "broadcast", "hold", "money", "safe"],
    q: "Can it move my funds?",
    a: "No, and it cannot be made to. NOSHASHI has no signing path and no custody: it reads ledger state and reports on it. It is not a bank, broker-dealer, money services business, money transmitter, qualified custodian or registered investment adviser, and nothing it produces is legal, regulatory, tax or investment advice.",
    links: [{ label: "Legal", href: "/legal/" }],
  },
  {
    id: "billing",
    keywords: ["refund", "cancel", "billing", "invoice", "stripe", "card", "renew", "charge", "payment", "unsubscribe", "subscription", "subscribe"],
    q: "How do billing, cancellation and refunds work?",
    a: "Payments run entirely through Stripe — no card data ever reaches NOSHASHI. Subscriptions renew automatically until cancelled and can be cancelled at any time, taking effect at the end of the period already paid for. A first charge is fully refundable within 14 days if no paid capability was used.",
    links: [{ label: "Pricing", href: "/pricing/" }],
  },
  {
    id: "pro",
    keywords: ["pro", "upgrade", "unlock", "exit", "liquidity", "freeze", "concentration", "api", "webhook", "institutional", "enterprise"],
    q: "What do the paid tiers add?",
    a: "Pro adds unlimited address checks, exit-liquidity analysis (freeze risk × depth × concentration), settlement forensics, order-book integrity, counterparty provenance, issuer freeze-rights and XLS-77 deep-freeze analysis, a 10,000-verdict persistent ledger and 5,000 API verifications. Institutional adds issuance surveillance, Travel Rule (FATF R.16) scoping, signed audit export with a SHA-256 chain of custody, offline adjudication on segregated networks, and regulator read-only seats.",
    links: [{ label: "Compare tiers", href: "/pricing/" }],
  },
  {
    id: "network",
    keywords: ["xrpl", "xrp", "ledger", "mainnet", "testnet", "network", "node", "rippled", "chain"],
    q: "Which network does it read?",
    a: "XRPL mainnet only — no testnet path exists in the build. It reads public nodes directly (xrplcluster.com, s1/s2.ripple.com and others) and compares several so a single node's view is never taken on trust.",
    links: [{ label: "Free tools", href: "/#public" }],
  },
  {
    id: "news",
    keywords: ["news", "headlines", "feed", "market", "latest", "happening", "story"],
    q: "Where do the headlines come from?",
    a: "The newsroom merges three public RSS feeds — Google News, Cointelegraph's XRP tag and CoinDesk — server-side, de-duplicates them and stamps each with its publisher and age. Headlines are reproduced as a title and a link back to the publisher. They are news, not a NOSHASHI reading, and no verdict is implied by anything appearing there.",
    links: [{ label: "Newsroom", href: "/news/" }],
  },
  {
    id: "status",
    keywords: ["status", "down", "outage", "maintenance", "incident", "broken", "uptime", "working", "progress", "roadmap", "next", "eta", "soon", "release", "shipping", "timeline", "update"],
    q: "Is something broken, and what are you working on?",
    a: "The status page carries the live board and the mission log — every shipped release, plus any maintenance window or incident. Releases appear there only when CI has actually produced an artifact, so the log is evidence rather than an announcement. The progress page sets out what has shipped and what is next.",
    links: [{ label: "Status", href: "/status/" }, { label: "Progress", href: "/progress/" }],
  },
  {
    id: "source",
    keywords: ["source", "code", "github", "open", "repo", "audit", "test", "review"],
    q: "Can I read the source?",
    a: "Yes. Every build on the download page was produced by CI from a public commit, and the logic that makes claims carries 272 tests. The repository is public on GitHub.",
    links: [{ label: "GitHub", href: "https://github.com/Ignosha/noshashi" }],
  },
  {
    id: "contact",
    keywords: ["contact", "email", "human", "sales", "talk", "reach", "help", "support", "someone"],
    q: "How do I reach a person?",
    a: `The contact form reaches the team directly. For specific routes: ${CONTACT.support} for product support, ${CONTACT.institutions} for institutional enquiries, ${CONTACT.security} for vulnerability reports and ${CONTACT.privacy} for data questions.`,
    links: [{ label: "Contact form", href: "/contact/" }],
  },
];

const STOPWORDS = new Set(
  "a an the is are was were be been do does did can could would should i you it this that of for to in on at by with my your our we us and or if how what when where why not no yes please tell me about".split(" ")
);

function tokenise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Score a question against the base.
 *
 * A keyword hit is worth more than an incidental word appearing in the
 * answer body, and a hit on the entry's own question line more still —
 * "how much does pro cost" should reach pricing, not the entry that
 * merely contains the word "cost" in a sentence.
 */
export function search(question) {
  const tokens = tokenise(question);
  if (!tokens.length) return [];

  return ENTRIES.map((entry) => {
    const keywords = new Set(entry.keywords);
    const questionTokens = new Set(tokenise(entry.q));
    const bodyTokens = new Set(tokenise(entry.a));

    let score = 0;
    for (const token of tokens) {
      if (keywords.has(token)) score += 3;
      else if (questionTokens.has(token)) score += 2;
      else if (bodyTokens.has(token)) score += 0.5;
      // A prefix match catches "pricing" against "price", "installs"
      // against "install" — cheap stemming without a stemmer.
      else if ([...keywords].some((k) => k.startsWith(token) || token.startsWith(k))) score += 1.5;
    }
    return { entry, score };
  })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * The threshold below which "I don't know" is the honest answer.
 *
 * Set at exactly one solid keyword hit. Scores are deliberately *not*
 * normalised by question length: dividing by the token count punished
 * every question phrased as a sentence, so "how much does pro cost"
 * scored below a threshold that a bare "cost" cleared — the opposite of
 * the behaviour wanted, since the longer question is the clearer one.
 * Incidental body-word matches are worth 0.5 and so cannot reach this
 * on their own, which is what actually keeps the floor honest.
 */
export const CONFIDENT = 3;

/** The deterministic answer. Never invents; hands off when unsure. */
export function answer(question) {
  const hits = search(question);
  const best = hits[0];

  if (!best || best.score < CONFIDENT) {
    return {
      grounded: false,
      text:
        "I can answer questions about pricing, downloads and verification, what the paid tiers add, privacy and security posture, billing, and the XRPL data the product reads. I don't have a confident answer to that one — rather than guess, send it to the team and you'll get a real answer.",
      links: [{ label: "Contact the team", href: CONTACT.form }],
      matched: hits.slice(0, 3).map((h) => h.entry.id),
    };
  }

  // Offer the runners-up as follow-ups only when they are genuinely close.
  const related = hits
    .slice(1, 3)
    .filter((h) => h.score > CONFIDENT * 0.8)
    .map((h) => h.entry.q);

  return {
    grounded: true,
    text: best.entry.a,
    links: best.entry.links || [],
    related,
    matched: [best.entry.id],
  };
}

/** The KB as the only permitted source for the model-backed mode. */
export function asPromptContext() {
  return ENTRIES.map(
    (e) =>
      `### ${e.q}\n${e.a}${
        e.links?.length ? `\nLinks: ${e.links.map((l) => `${l.label} — ${l.href}`).join("; ")}` : ""
      }`
  ).join("\n\n");
}
