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
      "Press Cmd+Shift+X from anywhere, or click the rocket in the macOS menu bar. The HUD shows one thing at a glance — whether this wallet can settle right now — and the menu bar itself carries a live ticker with the gate state and current ledger height. It needs the desktop app; the browser build has no menu bar.",
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
