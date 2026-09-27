import { answerWithCore } from "@/lib/noshx/core/engine";
import { plan } from "@/lib/noshx/core/plan";
import { answer as supportAnswer, CONTACT, ENTRIES } from "../../api/_lib/kb.js";
import { type ToolContext } from "@/lib/noshx/tools";
import { extendKnowledge, prewarmKnowledge } from "@/lib/noshx/knowledge";
import { containsLedgerSeed, SecretInMessageError } from "@/lib/agent/secrets";

/**
 * NOSHX on the website — the support console's engine.
 *
 * This is NOSHX Core, the same engine the desktop app runs by default,
 * built for the browser (vite.noshx-web.config.mts) into
 * site/assets/noshx/. It answers questions about NOSHASHI from the
 * published pages, and questions about an address, token or transaction
 * by reading the live ledger through the app's own read-only readers.
 * There is no language model and no server in the loop: the question
 * never leaves the visitor's browser, and the only network traffic is
 * ledger reads to the public XRPL servers the site's CSP already allows.
 *
 * The site's own support answers (api/_lib/kb.js, the same ones the
 * server console uses) are added to NOSHX's index beside the pages and
 * ranked with them, and quoted whole when they are the best match, with
 * their links.
 *
 * A visitor has no plan, so paid readers answer with what they need, and
 * address checks share the desktop app's free allowance of 10 a month,
 * counted in this browser.
 */

const FREE_CHECKS_PER_MONTH = 10;
const METER_KEY = "noshashi:web.checks";

const month = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

function readMeter(): { month: string; count: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(METER_KEY) ?? "null") as { month?: unknown; count?: unknown } | null;
    if (raw && raw.month === month() && typeof raw.count === "number" && Number.isFinite(raw.count)) {
      return { month: raw.month, count: Math.max(0, raw.count) };
    }
  } catch {
    // Storage blocked or unreadable: counted from zero for this page.
  }
  return { month: month(), count: 0 };
}

let fallbackCount = 0;
function writeMeter(count: number) {
  fallbackCount = count;
  try {
    localStorage.setItem(METER_KEY, JSON.stringify({ month: month(), count }));
  } catch {
    // Kept in memory for this page instead.
  }
}

const used = () => Math.max(readMeter().count, fallbackCount);

const context: ToolContext = {
  has: () => false,
  spendFreeCheck: () => {
    const count = used();
    if (count >= FREE_CHECKS_PER_MONTH) return false;
    writeMeter(count + 1);
    return true;
  },
  refundFreeCheck: () => writeMeter(Math.max(0, used() - 1)),
};

export type WebStep = { reader: string; ok: boolean; summary: string };
export type WebLink = { label: string; href: string };
export type WebAnswer = {
  text: string;
  steps: WebStep[];
  links: WebLink[];
  /** Follow-up questions worth offering. */
  related: string[];
  /** Where the answer came from: the support answers, the ledger, or the pages. */
  source: "support" | "ledger" | "pages" | "none" | "refused";
};

/** Titled "Support › question" so Core quotes a best match whole and its links can be found again. */
const SUPPORT_TITLE = "Support › ";
extendKnowledge(
  ENTRIES.map((entry) => ({
    title: `${SUPPORT_TITLE}${entry.q}`,
    source: "noshashi.app support",
    text: `${entry.q}\n${entry.a}`,
    // Written for exactly the questions visitors ask, so they lead a close call.
    weight: 1.25,
  }))
);

const CONTACT_LINK: WebLink = { label: "Contact the team", href: CONTACT.form };

/**
 * Core ends a page answer with "Source(s): Title · address; …". On the
 * website those become link buttons to the same pages on this site, named
 * by their section, and the line itself is dropped from the text.
 */
export function splitSources(text: string): { body: string; links: WebLink[]; support?: string } {
  const match = /\n\nSources?: ([^\n]+)/.exec(text);
  if (!match) return { body: text, links: [] };
  const links: WebLink[] = [];
  let support: string | undefined;
  for (const part of match[1].split("; ")) {
    const cut = part.lastIndexOf(" · ");
    const title = cut >= 0 ? part.slice(0, cut) : part;
    const source = cut >= 0 ? part.slice(cut + 3) : "";
    if (title.startsWith(SUPPORT_TITLE)) support = title.slice(SUPPORT_TITLE.length);
    const url = /^https:\/\/www\.noshashi\.app(\/[^\s]*)?$/.exec(source);
    if (!url) continue;
    const href = url[1] ?? "/";
    if (links.some((l) => l.href.split("#")[0] === href.split("#")[0])) continue;
    const label = (title.split(" › ").pop() ?? title).replace(/^NOSHASHI — /, "").trim();
    links.push({ label: label.length > 38 ? `${label.slice(0, 36)}…` : label, href });
  }
  return { body: text.replace(match[0], ""), links: links.slice(0, 3), support };
}

/** Answer one question. Never throws: a failure comes back as an answer that says so. */
export async function ask(question: string, onStep?: (step: WebStep) => void): Promise<WebAnswer> {
  const q = String(question ?? "").trim().slice(0, 600);
  if (!q) {
    return { text: "Ask a question about NOSHASHI, or paste an XRPL address, token id or transaction hash.", steps: [], links: [], related: [], source: "none" };
  }
  if (await containsLedgerSeed(q)) {
    return { text: new SecretInMessageError().message, steps: [], links: [], related: [], source: "refused" };
  }

  const readsLedger = plan(q).calls.length > 0;
  const steps: WebStep[] = [];
  let searched = false;
  try {
    const result = await answerWithCore(q, context, (step) => {
      if (step.kind !== "tool") return;
      if (step.name === "search_noshashi") {
        searched = step.ok;
        return;
      }
      const s = { reader: READER[step.name] ?? step.name, ok: step.ok, summary: step.summary };
      steps.push(s);
      onStep?.(s);
    });
    if (!result.facts && !searched) {
      return { text: supportAnswer(q).text, steps, links: [CONTACT_LINK], related: [], source: "none" };
    }
    // A support answer quoted whole brings its own links.
    const { body: text, links: pages, support } = splitSources(result.text);
    const entry = support ? ENTRIES.find((e) => e.q === support) : undefined;
    // A reading that points at a free page on this site ("free on the
    // website … /certificate/") gets that page as a button too.
    const inline: WebLink[] = text.includes("https://www.noshashi.app/certificate/")
      ? [{ label: "Free issuer certificate", href: "/certificate/" }]
      : [];
    const links = [...(entry?.links ?? []), ...inline, ...pages];
    return {
      text,
      steps,
      links: links.some((l) => l.href === CONTACT.form) ? links.slice(0, 4) : [...links.slice(0, 3), CONTACT_LINK],
      related: [],
      source: result.facts ? "ledger" : entry ? "support" : "pages",
    };
  } catch (error) {
    return {
      text: `NOSHX could not finish that: ${error instanceof Error ? error.message : "an unexpected error"}. Try again, or contact the team.`,
      steps,
      links: [CONTACT_LINK],
      related: [],
      source: readsLedger ? "ledger" : "none",
    };
  }
}

/** What each reader is called on the website, for the "reading…" line. */
const READER: Record<string, string> = {
  check_address: "the address",
  read_claims: "the inbox",
  read_token_rights: "the token",
  read_settlement: "the transaction",
  read_book: "the order book",
  read_provenance: "the account's origin",
  read_control_surface: "the signers",
  read_pool: "the pool",
  read_issuance: "the issuance",
  certify_authority: "the issuer",
  ledger_status: "the latest ledger",
  ledger_sync: "the public servers",
};

/** Free address checks left this month in this browser. */
export const checksLeft = () => Math.max(0, FREE_CHECKS_PER_MONTH - used());

/** Build the page index ahead of the first question. */
export const prewarm = () => prewarmKnowledge();
