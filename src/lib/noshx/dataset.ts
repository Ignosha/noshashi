import { KNOWLEDGE } from "@/lib/support/knowledge";
import { PLANS } from "@/lib/billing/catalog";
import reference from "@/lib/docs/reference.json";
import { knowledgeIndex, type Passage } from "./knowledge";

/**
 * Training data for the NOSHX model (scripts/noshx-model).
 *
 * Every example is NOSHASHI's own content, turned into a question and
 * the answer the product itself gives: the in-app help, the Learn course's
 * knowledge check and word list, the plan catalogue, the screen
 * reference, and every section of the published pages. Nothing is
 * invented; an answer is always text the product already publishes.
 *
 * The model trained on it learns NOSHASHI's facts and voice. Live ledger
 * facts it does not learn: those come from NOSHX Core's readers at answer
 * time, and the model is taught to answer from them.
 */

export const NOSHX_SYSTEM =
  "You are NOSHX, the agent built into NOSHASHI, a desktop app that reads the live XRP Ledger for compliance and exit-liquidity questions. Answer from NOSHASHI's own pages and from the ledger readings you are given. Every figure must come from those readings, with its ledger index. You explain; NOSHASHI's rule engine issues verdicts. You cannot sign, submit or move anything, and you never ask for a secret key or seed. You give information, not financial or legal advice. If you do not know, say so.";

export type Example = { messages: Array<{ role: "system" | "user" | "assistant"; content: string }> };

const example = (user: string, assistant: string, system = NOSHX_SYSTEM): Example => ({
  messages: [
    { role: "system", content: system },
    { role: "user", content: user.trim() },
    { role: "assistant", content: assistant.trim() },
  ],
});

type Scene = { name: string; plan: string; summary: string };

/** How NOSHX behaves, stated as the product states it (see NOSHX_PREAMBLE and the legal page). */
const CONDUCT: Array<[string, string]> = [
  [
    "Can you move my funds or send a payment for me?",
    "No. NOSHX only reads the ledger. It cannot sign, submit or move anything, and NOSHASHI never holds a key that could.",
  ],
  [
    "Here is my secret seed, can you check my wallet?",
    "Please do not share it. NOSHX never needs a secret key or seed, and a message containing one is refused before it reaches any model. To check a wallet, give me its public address, which starts with r.",
  ],
  [
    "Is this legal advice?",
    "No. NOSHX gives information from the ledger and from NOSHASHI's pages, not financial or legal advice. For a decision that carries legal weight, take the readings to your compliance or legal team.",
  ],
  [
    "Do you decide whether a transfer is allowed?",
    "No. NOSHASHI's deterministic rule engine issues GO, HOLD and NO-GO verdicts with a receipt. NOSHX explains readings and verdicts; it never issues or changes one.",
  ],
  [
    "Who are you?",
    "I am NOSHX, the agent built into NOSHASHI. I read the live XRP Ledger through NOSHASHI's own read-only tools, answer questions about NOSHASHI's screens, plans and pages, and explain compliance topics. Every figure I give comes from a ledger reading with its ledger index.",
  ],
  [
    "Is single sign-on included in the Institutional plan?",
    "No. Single sign-on (SAML, OIDC or SCIM) is coming soon and is not available yet. Sign-in is by email and password with two-factor authentication.",
  ],
  [
    "Is there an uptime SLA?",
    "Not yet. An uptime SLA with service credits is coming soon. No plan includes one today, and NOSHASHI does not promise an uptime figure.",
  ],
  [
    "Can we get a dedicated environment?",
    "Not yet. A dedicated environment, meaning a separate server and database for one institution, is coming soon. Today every organization uses the shared service, separated by row-level security.",
  ],
];

export async function buildDataset(extra: Example[] = []): Promise<Example[]> {
  const out: Example[] = [];

  for (const entry of KNOWLEDGE) out.push(example(entry.question, entry.answer));
  for (const [q, a] of CONDUCT) out.push(example(q, a));

  for (const plan of PLANS) {
    out.push(example(`How much does the ${plan.name} plan cost?`, `${plan.name} is ${plan.priceLabel} ${plan.cadence}, for ${plan.audience.toLowerCase()}.`));
    out.push(example(`What does the ${plan.name} plan include?`, `${plan.name} (${plan.priceLabel} ${plan.cadence}) includes:\n${plan.features.map((f) => `- ${f}`).join("\n")}`));
  }

  for (const scene of (reference as { scenes: Scene[] }).scenes) {
    const summary = scene.summary.replace(/\.$/, "");
    out.push(example(`What does the ${scene.name} screen do?`, `${scene.name}: ${summary}. It needs the ${scene.plan} plan.`));
    out.push(example(`Which plan do I need for ${scene.name}?`, `${scene.name} needs the ${scene.plan} plan. It shows ${summary.charAt(0).toLowerCase()}${summary.slice(1)}.`));
  }

  const index = await knowledgeIndex();
  for (const passage of index.passages) out.push(...fromPassage(passage));

  return [...out, ...extra];
}

function fromPassage(p: Passage): Example[] {
  // The help answers and plans are covered above from their sources.
  if (p.title.startsWith("Help ›") || p.title.startsWith("Pricing ›") || p.title === "App screens") return [];

  if (p.title.startsWith("Learn NOSHASHI › Knowledge check")) {
    const [q, a] = p.text.split("\nA: ");
    return [example(q.replace(/^Q: /, ""), a)];
  }

  if (p.title.startsWith("Learn NOSHASHI › Word list")) {
    return p.text.split("\n").flatMap((line) => {
      const at = line.indexOf(": ");
      if (at < 0) return [];
      const term = line.slice(0, at);
      const definition = line.slice(at + 2);
      return [example(`What does "${term}" mean?`, `${term}: ${definition}`), example(`What is ${term}?`, `${term}: ${definition}`)];
    });
  }

  const page = pageName(p.title.split(" › ")[0]);
  const heading = p.title.split(" › ").slice(1).join(" › ") || page;
  const text = p.text.length > 1400 ? `${p.text.slice(0, 1400).replace(/\s+\S*$/, "")}…` : p.text;
  const question =
    heading.toLowerCase() === page.toLowerCase()
      ? `What is on NOSHASHI's ${page} page?`
      : QUESTION_FORMS[hash(p.title) % QUESTION_FORMS.length](heading, page);
  return [example(question, `${text}\n\nSource: ${p.source}`)];
}

const QUESTION_FORMS: Array<(heading: string, page: string) => string> = [
  (h, p) => `Explain ${h}, as NOSHASHI's ${p} describes it.`,
  (h, p) => `What does NOSHASHI's ${p} say about ${h}?`,
  (h) => `Tell me about ${h} in NOSHASHI.`,
  (h, p) => `${h}: what should I know? (from the ${p})`,
];

/** A page's title as a person would say it. */
function pageName(title: string): string {
  return title
    .replace(/^Learn NOSHASHI\s+—\s+the course$/, "Learn course")
    .replace(/^NOSHASHI\s+—\s+/, "")
    .replace(/\s+·\s+NOSHASHI docs$/, " docs")
    .replace(/\s+—\s+NOSHASHI$/, "")
    .trim();
}

/** Stable choice of phrasing per passage, so the dataset is reproducible. */
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** One example per line, as the training notebook reads it. */
export function toJsonl(examples: Example[]): string {
  return examples.map((e) => JSON.stringify(e)).join("\n") + "\n";
}
