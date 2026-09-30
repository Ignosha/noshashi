import { CONTACT } from "@/lib/brand";

/**
 * The offline support brain.
 *
 * A support bot that only works once you have installed a model runtime
 * is not support. This answers the questions people actually ask using
 * scored keyword matching over a curated base — no AI, no network, no
 * account, and it works on the free tier the moment the app opens. The
 * language model, when present, is an upgrade rather than a dependency.
 */

export type Answer = {
  id: string;
  question: string;
  answer: string;
  /** Weighted terms; a match on several beats a match on one. */
  keywords: string[];
  /** Offers to run the diagnostics panel when the issue is mechanical. */
  suggestsDiagnostics?: boolean;
};

export const KNOWLEDGE: Answer[] = [
  {
    id: "ticket",
    question: "How do I contact support or open a ticket?",
    answer:
      "Open NOSHX, choose TICKETS, then NEW TICKET. Give it a subject, a topic and a priority, and describe what happened; the app version and platform are attached unless you untick them. Support replies in the same thread, and you are emailed when they do. Tickets are private to you and NOSHASHI support, and you need to be signed in. From the Support chat, OPEN A TICKET WITH SUPPORT carries your question into a new ticket. Never paste a secret key or seed: a ticket that contains one is refused before it is sent.",
    keywords: ["support", "ticket", "contact", "help", "human", "person", "email", "issue", "bug", "report", "problem"],
  },
  {
    id: "labs",
    question: "How do I learn to use NOSHASHI?",
    answer:
      "Open LEARN and choose Hands-on labs. Each lab takes you through a real screen: TAKE ME TO opens it with a real mainnet address or token already filled in, the step says what to look for, and one question checks what you saw. Every question you answer right joins your review deck and comes back a day later, then after 3, 7, 16 and 35 days; a missed one comes back tomorrow. REVIEW on the Labs page shows what is due. There are seven labs: checking an address, NFT rights, the inbox, the verification gate, ledger sync, NOSHX, and multi-signature treasuries (that one needs Pro for its screen). Progress is kept on this device.",
    keywords: ["learn", "lab", "labs", "tutorial", "training", "course", "how", "use", "onboarding", "review", "practice", "quiz", "remember"],
  },
  {
    id: "coming-soon",
    question: "Is there an uptime SLA, single sign-on or a dedicated environment?",
    answer:
      "Not yet. All three are coming soon. No plan includes an uptime SLA today, and NOSHASHI does not promise an uptime figure. Sign-in is by email and password with two-factor authentication until single sign-on (SAML or OIDC) arrives. Every organization uses the shared service, kept apart by row-level security, until dedicated environments are offered.",
    keywords: ["sla", "uptime", "availability", "guarantee", "sso", "saml", "oidc", "scim", "single", "sign-on", "dedicated", "environment", "isolated", "private", "coming", "soon"],
  },
  {
    id: "regulator-seat",
    question: "How do I give an examiner or regulator access?",
    answer:
      "In an organization on Institutional or above, an owner, admin or compliance member opens POLICY › MEMBERS › REGULATOR SEATS, enters the examiner's email (they need their own NOSHASHI account) and chooses 7, 30, 90 or 180 days. The examiner can read the organization's policies, exceptions, investigations and audit trail and cannot change anything. The seat ends on its date without anyone acting, can be revoked at any time, and every visit the examiner makes is written to the audit trail.",
    keywords: ["regulator", "examiner", "auditor", "seat", "read-only", "readonly", "access", "supervisor", "inspection"],
  },
  {
    id: "monitoring",
    question: "How do I monitor my book on a schedule and set my own alerts?",
    answer:
      "Open PORTFOLIO & RADAR › MONITOR (Institutional). Turn the schedule on, choose every 1, 4, 6, 12 or 24 hours and a scenario, and every wallet in the book is stress-tested with the same model as the Risk screen while the app is open. Under ALERT RULES, create a rule from conditions such as recovery ratio below 60% or freezable share above 25%, joined by ALL or ANY, for every wallet or chosen ones, and send it to the console, a desktop notification or your organization's webhooks (event custom_alert). Runs and alerts are recorded in the organization's audit log.",
    keywords: ["monitor", "monitoring", "schedule", "scheduled", "alert", "alerts", "rule", "rules", "threshold", "stress", "notify", "webhook"],
  },
  {
    id: "deposit-screening",
    question: "How do I screen deposits before crediting them?",
    answer:
      "Open ADJUDICATION › LEDGER WATCH (Enterprise). Paste the transaction hash and your deposit address, set your accepted issuers, deny list, whether a destination tag is required and your Travel Rule threshold, and press SCREEN. NOSHASHI reads the payment live: it credits what actually arrived (never the Amount of a partial payment), holds a familiar ticker whose issuer owes nothing as counterfeit, flags dust carrying a link as phishing, and traces who funded the sender three hops back against your deny list. Add the address under WATCHED ACCOUNTS and every incoming payment is screened by the server within a minute, sent to your webhooks as deposit_screened.",
    keywords: ["deposit", "deposits", "screen", "screening", "credit", "partial", "counterfeit", "phishing", "dust", "kyt", "source of funds", "deny list", "travel rule", "exchange"],
  },
  {
    id: "self-repair",
    question: "Something is not working. Can NOSHX fix it?",
    answer:
      "Tell NOSHX what is wrong (\"it is not working, fix it\") or press SELF-REPAIR in the Support panel. NOSHX checks the mainnet link and reconnects to another public server if it is dropped or silent, compares this computer's clock with the ledger's, renews an expiring sign-in, checks the NOSHASHI server, re-reads your plan, looks at your watched accounts, removes damaged saved settings, checks the help index and whether a newer version is out. It repairs what it can and says what is left and how to fix it. Say \"open a ticket with this report\" to send the report to support, or \"post the report to NSH-1042\" to add it to a ticket.",
    keywords: ["broken", "not working", "fix", "repair", "self-repair", "diagnose", "troubleshoot", "disconnected", "error", "slow", "stuck", "clock", "signed out"],
    suggestsDiagnostics: true,
  },
  {
    id: "noshx-tickets",
    question: "Can NOSHX read, answer and act on my tickets for me?",
    answer:
      "Yes, when you are signed in. To open one yourself, see How do I contact support. Ask NOSHX \"show my tickets\" for the list, \"show NSH-1042\" to read a thread with the answer NOSHASHI's own pages give, \"reply to NSH-1042: …\" to add a message, \"resolve NSH-1042\" or \"reopen NSH-1042\", and \"open a ticket: …\" to start one with your app version attached. NOSHX changes a ticket only when your own message asks it to. Support staff can also ask \"answer NSH-1042\" for a reply drafted from the pages, and \"answer NSH-1042 and send it\" to post it.",
    keywords: ["nsh", "reply", "resolve", "reopen", "noshx", "agent", "status", "thread", "draft"],
  },
  {
    id: "sanctions",
    question: "Does NOSHASHI check the OFAC sanctions list?",
    answer:
      "Yes. Every day NOSHASHI reads the US Treasury's Specially Designated Nationals list (sdn.csv and sdn_comments.csv from treasury.gov) and keeps every XRP Ledger address it names, with the entry number, name and program. Check an Address says when an address is listed, with its source; deposit screening holds a deposit whose sender, or any account that funded it up to three hops back, is listed, and never credits it; the website widget's address check shows it too. An address that is not on the list is not thereby cleared: the list names only addresses OFAC has published.",
    keywords: ["sanctions", "sanctioned", "ofac", "sdn", "treasury", "blacklist", "blocked", "screening", "aml", "list"],
  },
  {
    id: "address-poisoning",
    question: "What is address poisoning and does NOSHASHI catch it?",
    answer:
      "An attacker creates an address whose first and last characters match one you use, then sends you a tiny payment so it appears in your history next to the real one, hoping you copy it into a withdrawal. Deposit screening flags any sender that starts and ends like one of your watched addresses or your trusted counterparties (set them in the deposit rules), and holds it when it arrived as dust. The website widget's VERIFY ADDRESS check tells your customers whether the address they are about to pay is really yours or a lookalike.",
    keywords: ["poisoning", "lookalike", "look-alike", "similar address", "vanity", "copy", "history", "scam", "fake address"],
  },
  {
    id: "embed-widget",
    question: "Can I put NOSHASHI's checks on my own website?",
    answer:
      "Yes, on Enterprise and Strategic. In ADJUDICATION › LEDGER WATCH › WEBSITE WIDGET, create a widget: choose its checks (verify that an address is really your deposit address, check any address against the ledger and the OFAC list, and deposit status by transaction hash), pick your deposit address, and list the exact sites it may appear on. Paste the two-line snippet into your page. The widget holds no key, answers only on the sites you list, and never tells a customer why a deposit is under review.",
    keywords: ["embed", "widget", "website", "white-label", "customer", "snippet", "script", "iframe", "integrate", "site"],
  },
  {
    id: "account-security",
    question: "How do I make my XRP Ledger account harder to hack?",
    answer:
      "Open SECURITY CENTER › ACCOUNT CHECK (free) and enter your address, never your seed. NOSHASHI grades the account A to F from what the ledger shows: who can sign (master key, regular key, signer list and its real quorum), recent key and settings changes, address-poisoning attempts against you, and the doors strangers can use (NFT offers, checks, payment channels). The hardening plan lists unsigned transactions (for example, sign with a regular key on a hardware wallet, or require two of three signers for a treasury, and refuse unsolicited NFT offers) for you to review and sign in your own wallet. NOSHASHI never signs and never asks for a key.",
    keywords: ["secure", "security", "hack", "hacked", "protect", "harden", "seed", "regular key", "multisig", "signer", "takeover", "wallet", "safe"],
  },
  {
    id: "hacked-account",
    question: "My account was hacked or drained. Can I get my XRP back?",
    answer:
      "A validated XRP Ledger transaction cannot be reversed by anyone: not validators, not Ripple, not NOSHASHI, and anyone offering a paid 'recovery' is running a second scam. Do this now: move whatever is left to a new account created on a device that never held the old seed, and report it to the police (in the US, ic3.gov; in the UK, Action Fraud). Then open SECURITY CENTER › INCIDENT RESPONSE (Pro and above): it shows the key changes before the theft, follows the value hop by hop past the dust thieves spray, says where it is now, and lists the recovery paths that exist. If it reached an exchange with a destination tag, the exchange can freeze it; if it was an issued token, the issuer may freeze or claw it back. Send them the SHA-256 dossier it writes.",
    keywords: ["hacked", "stolen", "drained", "lost", "recover", "reverse", "scam", "theft", "thief", "compromised", "get back", "refund", "police"],
  },
  {
    id: "security-guardian",
    question: "Can NOSHASHI alert us if one of our accounts is being taken over?",
    answer:
      "Yes, on Strategic. Watch the accounts in LEDGER WATCH; the server reads them every minute, and when one's regular key or signer list changes, its master key is disabled or re-enabled, or it is deleted, your webhooks receive a signed security_alert within a minute. A takeover almost always starts with the thief adding a key of their own, so this is the earliest warning the ledger gives. SECURITY CENTER › GUARDIAN lists these events, and INCIDENT RESPONSE can watch every account in a theft trail in one click.",
    keywords: ["alert", "guardian", "takeover", "monitor", "keys changed", "webhook", "security_alert", "watch", "notify"],
  },
  {
    id: "personal-guardian",
    question: "Can I get an alert on my own computer if my wallet is being taken over?",
    answer:
      "Yes, free. In SECURITY CENTER › GUARDIAN, add your own addresses under PERSONAL GUARDIAN (3 on Free, 50 on Pro and above). While NOSHASHI is open it reads them every minute and raises a native notification when a new regular key or signer list appears, the master key is switched, the account is deleted, more than your threshold of XRP leaves, or a dust payment or NFT offer with a link arrives. The addresses and alerts stay on your device. For accounts that must be watched when no one has the app open, Strategic's server-side Guardian sends signed webhooks.",
    keywords: ["notification", "alert me", "personal", "my wallet", "desktop", "guardian", "outflow", "notify", "monitor my"],
  },
  {
    id: "pre-sign-check",
    question: "A website asks me to sign a transaction. How do I know what it does?",
    answer:
      "Paste it into SECURITY CENTER › PRE-SIGN CHECK (free), as JSON or as the hex blob the site shows. It is decoded on your device and explained in plain words, with a verdict: SAFE-LOOKING, CAREFUL or DO NOT SIGN. DO NOT SIGN is given for what empties accounts: a SetRegularKey or SignerListSet that hands signing to someone else, an AccountDelete, an NFT sell offer for zero, or an OFAC-listed or lookalike destination. A transaction is not a secret; a seed is, and no legitimate site ever asks for one.",
    keywords: ["sign", "signing", "blob", "transaction", "approve", "wallet prompt", "what does this do", "decode", "phishing", "claim", "airdrop"],
  },
  {
    id: "recover-funds",
    question: "Is any of my XRP stuck, and can I get my reserve back?",
    answer:
      "Open SECURITY CENTER › RECOVER FUNDS (free for one address). It reads everything the account owns and lists what comes back. That covers escrows that have matured and are waiting for someone to finish them, and expired escrows and payment channels that return to you when closed. It also covers checks written to you that you never cashed. The owner reserve (0.2 XRP each) locked by empty trust lines, old orders, NFT offers, preauthorisations and unused tickets is listed too. Each item comes with the unsigned transaction that releases it, and the scan says what AccountDelete would return if you closed the account. Pro values every other holding in XRP and scans 25 addresses at once; Institutional scans 500.",
    keywords: ["stuck", "reserve", "escrow", "payment channel", "check", "reclaim", "unlock", "recover", "trust line", "accountdelete", "forgotten", "free up"],
  },
  {
    id: "exposure-audit",
    question: "How do I revoke permissions on my XRP Ledger account?",
    answer:
      "The XRP Ledger has no token allowances, but it has standing permissions that let someone else take value: checks you wrote, NFT sell offers (a zero-price one gives the NFT away), funded payment channels, open orders, deposit preauthorisations, a regular key, signers and an authorised NFT minter. SECURITY CENTER › EXPOSURE AUDIT (free) lists every one on your account with its risk and the unsigned transaction that revokes it.",
    keywords: ["revoke", "approval", "approvals", "permission", "allowance", "exposure", "open offer", "nft offer", "check", "cancel"],
  },
  {
    id: "deposit-help",
    question: "I sent XRP to an exchange and it never arrived. What happened?",
    answer:
      "Paste the transaction hash into SECURITY CENTER › DEPOSIT HELP (free). If the payment failed (for example tecDST_TAG_NEEDED), only the fee was spent and the amount is still in your account. If it succeeded without the destination tag, or with the wrong one, the funds are in the exchange's pooled account: only the exchange can credit them, and it usually will when given the facts. NOSHASHI writes that letter, with the hash, ledger, amount, tags and a SHA-256, for you to send from your logged-in account. A payment to a private wallet can only be returned by its owner.",
    keywords: ["deposit", "never arrived", "missing", "destination tag", "forgot tag", "wrong tag", "exchange", "credited", "lost deposit", "memo"],
  },
  {
    id: "domain-check",
    question: "How can I tell if an account really belongs to the company it claims?",
    answer:
      "An account's Domain field is a claim anyone can write. It is proven only when that website lists the account back in its /.well-known/xrp-ledger.toml. SECURITY CENTER › DOMAIN CHECK (free) reads the file and tells you VERIFIED, UNVERIFIED (treat it as impersonation) or that no file exists. Given a domain instead, it shows which accounts the domain vouches for and whether each names it back.",
    keywords: ["domain", "toml", "xrp-ledger.toml", "impersonation", "fake exchange", "official", "verify", "belongs", "real account"],
  },
  {
    id: "scam-cluster",
    question: "Can NOSHASHI find the other accounts a scammer uses?",
    answer:
      "Yes, on Pro and above. SECURITY CENTER › SCAM CLUSTERS starts from one known scam account. It finds who funded it, the accounts it created, and where it swept its balance when it deleted itself. It also groups accounts that share a vanity ending or a memo. Exchanges end a branch, so their customers are not pulled in, and every link names its transaction. Pro maps two hops and 40 accounts. Enterprise maps four hops and 200, and opens the report as an investigation case. Strategic watches the whole cluster server-side.",
    keywords: ["cluster", "scammer", "network", "related accounts", "linked", "operation", "drainer", "vanity", "same person"],
  },
  {
    id: "event-feeds",
    question: "How do I get XRPL events into my own systems?",
    answer:
      "On the Strategic plan, add accounts under ADJUDICATION › LEDGER WATCH › WATCHED ACCOUNTS. The server reads each one every minute from validated ledgers and sends every event (payments, trust-line freezes, settings and issuer flag changes, clawbacks and more) to your organization's webhooks as xrpl_event, signed. You can also pull them: GET /functions/v1/noshashi-xrpl-watch/events with an organization API key, as JSON, NDJSON or CSV, cursor-paged, optionally in one of your own export schemas; POST /history backfills any ledger range.",
    keywords: ["event", "events", "feed", "feeds", "stream", "watch", "webhook", "ndjson", "backfill", "history", "schema", "export", "retention"],
  },
  {
    id: "no-go",
    question: "Why did my check come back NO-GO?",
    answer:
      "NO-GO means at least one blocking rule failed, and the Verification scene names which one. In practice it is almost always one of three things: the account holds none of the XLS-70 credentials the target domain requires (most mainnet accounts hold none yet), the transfer exceeds the domain's per-settlement ceiling, or the balance does not clear the XRPL owner reserve of 1 XRP plus 0.2 XRP per owned object. Open the verdict and read the row marked BLOCK — the detail line states the exact number that failed.",
    keywords: ["no-go", "nogo", "refused", "blocked", "failed", "why", "verdict", "denied"],
  },
  {
    id: "hold",
    question: "What is the difference between HOLD and NO-GO?",
    answer:
      "NO-GO means a blocking rule failed and the settlement is refused. HOLD means every blocking rule passed but an advisory one did not — most often the account publishes no Domain attestation, or the target domain is under governance review. HOLD is 'a human should look at this', not 'this is forbidden'.",
    keywords: ["hold", "difference", "advisory", "warn", "meaning", "versus", "vs"],
  },
  {
    id: "no-credentials",
    question: "Why does my wallet show no credentials?",
    answer:
      "Because it genuinely holds none. XLS-70 credentials are ledger objects that an issuer creates and the subject then accepts; they do not exist until someone issues one. An empty registry on mainnet is the normal state today, not a bug or a sync failure. Any domain rule that requires a credential will correctly read NO-GO until one is issued and accepted.",
    keywords: ["credential", "credentials", "empty", "none", "missing", "registry", "xls-70", "xls70"],
  },
  {
    id: "offline",
    question: "The console says OFFLINE or DEGRADED.",
    answer:
      "The console holds one WebSocket to a public XRPL node and rotates across three endpoints with exponential backoff. OFFLINE almost always means outbound WebSocket traffic on port 443 is being blocked — a corporate proxy, a VPN, or a strict firewall. Run the diagnostics below and use Reconnect; if it still fails, try without the VPN.",
    keywords: ["offline", "degraded", "disconnected", "connection", "reconnect", "network", "websocket"],
    suggestsDiagnostics: true,
  },
  {
    id: "change-wallet",
    question: "How do I change which wallet is being watched?",
    answer:
      "Settings → Wallet. Paste any XRPL classic address and press LOAD. It must start with r and be 25–35 characters. The console is read-only: it never asks for a seed, a private key or a signature, and it cannot move funds.",
    keywords: ["change", "wallet", "address", "switch", "watch", "different", "another"],
  },
  {
    id: "export",
    question: "How do I export an audit trail?",
    answer:
      "Audit Trail → EXPORT CSV. It writes every record currently matching your filters, with the compliance metadata attached, into your Downloads folder. The file is plain CSV, so it opens directly in Excel, Numbers or a spreadsheet your accountant already uses.",
    keywords: ["export", "csv", "audit", "download", "accountant", "tax", "report", "trail"],
  },
  {
    id: "menubar",
    question: "How do I open the menu bar HUD?",
    answer:
      "Press Cmd+Shift+X from anywhere, or click the flower in the macOS menu bar. The HUD shows one thing at a glance — whether this wallet can settle right now — and the menu bar itself carries a live ticker with the gate state and current ledger height. It needs the desktop app; the browser build has no menu bar.",
    keywords: ["menu", "menubar", "hud", "tray", "icon", "shortcut", "cmd", "toggle", "ticker"],
  },
  {
    id: "secrets",
    question: "Where are my API keys and secrets stored?",
    answer:
      "In the macOS Keychain, through the OS keyring — never in a preferences file, never in browser storage, and never in a log. Compliance API keys you issue are stored only as a SHA-256 hash, shown once at creation, and cannot be recovered afterwards by you or by us. Model-provider keys are scoped per provider so revoking one does not disturb another.",
    keywords: ["key", "keys", "secret", "secrets", "keychain", "store", "stored", "api", "safe", "security"],
  },
  {
    id: "billing",
    question: "How do I cancel or get a refund?",
    answer:
      "Account → Manage Billing opens Stripe's own portal; cancelling takes two clicks, needs no email and no phone call, and access continues to the end of the period you already paid for. Full refund within 14 days of a first subscription charge if you have not used a paid capability, and unused verification credits are refundable pro rata within 30 days.",
    keywords: ["cancel", "refund", "billing", "subscription", "unsubscribe", "money", "charge", "stripe", "payment"],
  },
  {
    id: "free",
    question: "What do I get without paying?",
    answer:
      "The whole console. Live mainnet telemetry, unlimited gate checks, the credential registry, the domain grid, the audit trail with CSV export, the on-device AI agent and the menu bar HUD are all free forever, with no account required. Paid plans add multi-wallet portfolios, drift and expiry alerting, receipt anchoring and the Compliance API — capabilities a desk needs, not a paywall on the basics.",
    keywords: ["free", "cost", "price", "pay", "tier", "plan", "trial", "included"],
  },
  {
    id: "agent-setup",
    question: "The AI agent says no runtime is detected.",
    answer:
      "The agent defaults to a local model so your prompts never leave the machine. Install Ollama, run `ollama serve`, then `ollama pull hermes3`, and press RE-DETECT. LM Studio, llama.cpp, Jan and vLLM are detected automatically too. You can instead point it at Claude, OpenAI, Groq or any OpenAI-compatible endpoint by adding a key in the runtime panel. Support answers like this one work with no runtime at all.",
    keywords: ["agent", "ai", "runtime", "ollama", "model", "llm", "detect", "claude", "install"],
    suggestsDiagnostics: true,
  },
  {
    id: "privacy",
    question: "What data do you collect about me?",
    answer:
      "Without an account: nothing. No analytics, no telemetry, no crash reporting, no advertising identifiers, and no server of ours receives your usage. With an account we hold your email, subscription state, any wallet addresses you add to a portfolio, and verification records. Passwords are bcrypt-hashed by our auth provider and we never see them. The full list is in Legal → Data Processing.",
    keywords: ["privacy", "data", "collect", "tracking", "telemetry", "gdpr", "personal", "information"],
  },
  {
    id: "gatekeeper",
    question: "macOS says the app cannot be opened.",
    answer:
      "The build is not yet notarized by Apple, so Gatekeeper warns on first launch. Right-click the app and choose Open, then Open again — you only do this once. Notarization requires an Apple Developer account and is on the roadmap.",
    keywords: ["gatekeeper", "damaged", "unidentified", "developer", "open", "install", "blocked", "macos", "warning"],
  },
  {
    id: "is-it-advice",
    question: "Can I rely on a verdict legally?",
    answer:
      "No, and we will not pretend otherwise. A GO means the rules you configured passed — it is not legal advice, not a regulatory determination, and it does not discharge an obligation you owe a regulator. The receipt proves a check ran against a stated rule set at a stated time. Anything with legal consequence needs your compliance officer and qualified counsel.",
    keywords: ["legal", "advice", "rely", "compliance", "regulator", "lawyer", "liability", "guarantee"],
  },
];

export type Match = { answer: Answer; score: number };

/**
 * Score the base against a question. Whole-word hits count double, so
 * "cancel my plan" beats a passing mention of "plan" elsewhere.
 */
export function findAnswers(query: string, limit = 3): Match[] {
  const text = query.toLowerCase();
  if (text.trim().length === 0) return [];
  const words = new Set(text.split(/[^a-z0-9]+/).filter(Boolean));

  return KNOWLEDGE.map((answer) => {
    let score = 0;
    for (const keyword of answer.keywords) {
      if (words.has(keyword)) score += 2;
      else if (text.includes(keyword)) score += 1;
    }
    return { answer, score };
  })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** What the bot says when nothing in the base is close enough. */
export function fallbackAnswer(query: string): string {
  return [
    `I do not have a confident answer for “${query.trim()}”.`,
    "",
    "Two things that will help:",
    "• Run the diagnostics — most mechanical problems (link, wallet, reserve, runtime) are found and fixed there.",
    `• Email ${CONTACT.support} and a person will reply within ${CONTACT.responseTarget}. Include what you were doing and what you expected.`,
    "",
    "If you install a local model runtime, I can also reason about your live ledger state instead of matching against a fixed knowledge base.",
  ].join("\n");
}
