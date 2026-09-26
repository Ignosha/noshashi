import { VERDICT_COPY, type CounterpartyReport } from "@/lib/public/counterparty";
import type { AuthorityCertificate } from "@/lib/desk/authority";
import { controlFindings, type ControlSurface } from "@/lib/desk/control";
import { provenanceFindings, type ProvenanceReport } from "@/lib/desk/provenance";
import { bookFindings, type BookReport } from "@/lib/desk/book";
import { settlementFindings, type SettlementReport } from "@/lib/desk/settlement";
import { ammFindings, type AmmReport } from "@/lib/desk/amm";
import { issuanceFindings, type IssuanceReport } from "@/lib/desk/issuance";
import { claimFindings, type ClaimsReport } from "@/lib/desk/claims";
import { nftFindings, type NftReport } from "@/lib/desk/nft";
import { syncFindings, type SyncReport } from "@/lib/net/sync";
import { checkState } from "@/lib/policy";
import type { LedgerInfo } from "@/lib/xrpl/types";
import { runToolRaw, findTool, type ToolContext } from "../tools";
import { searchKnowledge, tokens, type Hit } from "../knowledge";
import type { NoshxStep } from "../loop";
import { plan, type Plan } from "./plan";
import reference from "@/lib/docs/reference.json";

type Scene = { name: string; plan: string; summary: string };
const SCENES = (reference as { scenes: Scene[] }).scenes;

const SCREEN_GENERIC = tokens("noshashi noshx plan plans need use screen screens help feature which tool tools we our us want get way much many cost price pay");

/** Questions that ask what to use, where, or how. */
const WHERE = /\bwhich\b|\bwhat (screen|tool|plan|should)|how (do|can|does|should) (i|we|noshashi)|\bhelp\b|\bneed\b|\buse\b|where (do|can)|feature/i;

/**
 * The screens whose own description best matches the question, with the
 * plan each needs. Taken from the app's screen reference, so it names
 * only screens that exist.
 */
export function relatedScreens(question: string, limit = 3): Scene[] {
  const terms = new Set(tokens(question));
  // Words that ask *for* a screen say nothing about which one.
  for (const generic of SCREEN_GENERIC) terms.delete(generic);
  return SCENES.map((scene) => {
    const words = tokens(`${scene.name} ${scene.name} ${scene.summary}`);
    const hits = words.filter((w) => terms.has(w)).length;
    return { scene, score: hits / Math.sqrt(words.length + 4) };
  })
    .filter((s) => s.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.scene);
}

/**
 * NOSHX Core: NOSHASHI's own answering engine.
 *
 * It uses no language model. It plans from the question (./plan.ts),
 * runs the app's read-only ledger readers, turns their reports into
 * sentences with the same findings the screens show, and answers
 * product and concept questions by choosing the most relevant sentences
 * from NOSHASHI's own pages. Everything it says is either a reading
 * stamped with its ledger index or a quotation with its source, so it
 * can be wrong only where the ledger or the pages are.
 *
 * It runs in milliseconds on any machine and needs no download.
 */

type Finding = { severity: "critical" | "warn" | "info" | "ok"; title: string; detail: string; action?: string };

const ORDER: Record<Finding["severity"], number> = { critical: 0, warn: 1, info: 2, ok: 3 };
const MARK: Record<Finding["severity"], string> = { critical: "✕", warn: "!", info: "·", ok: "✓" };

function findingsText(findings: Finding[], limit = 6): string {
  const sorted = [...findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]).slice(0, limit);
  if (sorted.length === 0) return "Nothing notable was recorded.";
  return sorted
    .map((f) => `${MARK[f.severity]} ${f.title}. ${f.detail}${f.action ? ` What to do: ${f.action}` : ""}`)
    .join("\n");
}

const stamp = (ledgerIndex?: number) => (ledgerIndex ? ` (validated ledger ${ledgerIndex.toLocaleString("en-US")})` : "");
const short = (address: string) => (address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address);

/** One reader's report, in sentences. */
export function compose(tool: string, value: unknown): string {
  switch (tool) {
    case "check_address": {
      const r = value as CounterpartyReport;
      const copy = VERDICT_COPY[r.verdict];
      return [
        `Address check for ${r.address}${stamp(r.ledgerIndex)}: ${copy.label}. ${r.headline}`,
        r.exists
          ? `Balance ${r.balanceXrp.toLocaleString("en-US")} XRP${r.domain ? `, claims the domain ${r.domain} (claimed, not verified)` : ""}${r.isIssuer ? `, issues ${r.issuedCurrencies.join(", ") || "tokens"}` : ""}.`
          : "The account does not exist on the ledger.",
        findingsText(r.findings),
        "This reports what the ledger publishes. Nothing recorded against an address is not the same as safe.",
      ].join("\n");
    }
    case "certify_authority": {
      const c = value as AuthorityCertificate;
      const checks = c.checks
        .map((check) => {
          const state = checkState(check);
          const mark = state === "PASS" ? "✓" : state === "FAIL" ? "✕" : "!";
          return `${mark} ${check.label} (${check.severity === "block" ? "blocking" : "warning"}): ${state}. ${check.detail}`;
        })
        .join("\n");
      return [
        `Authority certificate for issuer ${c.issuer}${c.currencyLabel ? ` (${c.currencyLabel})` : ""}${stamp(c.ledgerIndex)}: ${c.verdict.toUpperCase()}.`,
        checks,
        `Digest ${c.digest.slice(0, 16)}…, so anyone can re-check this reading.`,
      ].join("\n");
    }
    case "read_control_surface": {
      const c = value as ControlSurface;
      return [
        `Who controls ${c.address}${stamp(c.ledgerIndex)}: master key ${c.masterKeyEnabled ? "enabled" : "disabled"}${c.regularKey ? `, regular key ${short(c.regularKey)}` : ""}${c.signers.present ? `, signer list quorum ${c.signers.quorum} with the fewest signers that reach it being ${c.signers.minimumSigners}` : ", no signer list"}. Balance ${c.balanceXrp.toLocaleString("en-US")} XRP, ${c.reserveLockedXrp.toLocaleString("en-US")} XRP locked in reserve${c.escrowedXrp ? `, ${c.escrowedXrp.toLocaleString("en-US")} XRP in escrow` : ""}.`,
        findingsText(controlFindings(c)),
      ].join("\n");
    }
    case "read_provenance": {
      const r = value as ProvenanceReport;
      return [`Provenance of ${r.address}${r.ageDays !== undefined ? `, about ${Math.round(r.ageDays).toLocaleString("en-US")} days old` : ""}${r.fundedBy ? `, first funded by ${r.fundedBy}` : ""}:`, findingsText(provenanceFindings(r))].join("\n");
    }
    case "read_book": {
      const r = value as BookReport;
      return [`Order book${stamp(r.ledgerIndex)}:`, findingsText(bookFindings(r))].join("\n");
    }
    case "read_settlement": {
      const r = value as SettlementReport;
      return [
        `Transaction ${short(r.hash)}${stamp(r.ledgerIndex)}: ${r.transactionType}, result ${r.result}${r.validated ? "" : " (not yet validated, so nothing here is final)"}.`,
        findingsText(settlementFindings(r)),
      ].join("\n");
    }
    case "read_pool": {
      const r = value as AmmReport;
      return [`AMM pool${stamp(r.ledgerIndex)}:`, findingsText(ammFindings(r))].join("\n");
    }
    case "read_issuance": {
      const r = value as IssuanceReport;
      return [`Issuance${stamp(r.ledgerIndex)}:`, findingsText(issuanceFindings(r))].join("\n");
    }
    case "read_claims": {
      const r = value as ClaimsReport;
      return [`Tokens sent to the account${stamp(r.ledgerIndex)}:`, findingsText(claimFindings(r))].join("\n");
    }
    case "read_token_rights": {
      const r = value as NftReport;
      return ["NFT rights:", findingsText(nftFindings(r))].join("\n");
    }
    case "ledger_sync": {
      const r = value as SyncReport;
      return ["What the public servers report:", findingsText(syncFindings(r))].join("\n");
    }
    case "ledger_status": {
      const l = value as LedgerInfo;
      return `Latest validated ledger ${l.ledgerIndex.toLocaleString("en-US")}, closed ${l.closeTime}. Reference fee ${l.baseFeeXrp} XRP; the open ledger is charging ${l.openLedgerFeeXrp} XRP with ${l.queueSize} transactions queued.`;
    }
    default:
      return "";
  }
}

// ————— Answers from NOSHASHI's pages —————

function sentences(text: string): string[] {
  return text
    .replace(/^Q: .*$/m, "")
    .replace(/^A: /m, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && !/^[|·—-]/.test(s));
}

/**
 * The most relevant sentences from the best passages, kept in their
 * original order so the answer reads as the page wrote it. A passage
 * that is itself a question and answer (help, the knowledge check, the
 * word list) is quoted whole.
 */
export function answerFromPages(question: string, hits: Hit[]): string {
  if (hits.length === 0) return "";
  const terms = new Set(tokens(question));
  const top = hits[0];

  const direct = /^(Help ›|Learn NOSHASHI › Knowledge check|Pricing ›)/.test(top.title);
  if (direct) {
    const text = top.text.replace(/^Q: .*\nA: /, "");
    return `${text}\n\nSource: ${top.title} · ${top.source}`;
  }

  // Word list: answer with the matching definition.
  if (top.title.startsWith("Learn NOSHASHI › Word list")) {
    const line = top.text.split("\n").find((l) => tokens(l.split(":")[0]).some((t) => terms.has(t)));
    if (line) return `${line}\n\nSource: NOSHASHI word list · ${top.source}`;
  }

  const scored = hits.slice(0, 3).flatMap((hit, rank) =>
    sentences(hit.text).map((sentence, position) => {
      const words = tokens(sentence);
      const overlap = words.filter((w) => terms.has(w)).length;
      return { hit, sentence, position, score: overlap / Math.sqrt(words.length + 1) + (rank === 0 ? 0.3 : 0) - position * 0.01 };
    })
  );
  const chosen = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  if (chosen.length === 0) return `${top.text.slice(0, 600)}\n\nSource: ${top.title} · ${top.source}`;

  // Group by passage, in the passage's own order.
  const bySource = new Map<Hit, typeof chosen>();
  for (const c of chosen) bySource.set(c.hit, [...(bySource.get(c.hit) ?? []), c]);
  const parts: string[] = [];
  const sources: string[] = [];
  for (const [hit, picked] of bySource) {
    parts.push(picked.sort((a, b) => a.position - b.position).map((p) => p.sentence).join(" "));
    sources.push(`${hit.title} · ${hit.source}`);
  }
  return `${parts.join("\n\n")}\n\nSource${sources.length > 1 ? "s" : ""}: ${sources.join("; ")}`;
}

// ————— The engine —————

export type CoreResult = {
  text: string;
  steps: NoshxStep[];
  plan: Plan;
  /** The readings in sentences, for a language model to phrase when one is in use. */
  facts: string;
};

/**
 * Answer a question with NOSHX Core. Reader failures and plan gates are
 * said plainly in the answer; nothing is guessed to fill a gap.
 */
export async function answerWithCore(
  question: string,
  context: ToolContext,
  onStep?: (step: NoshxStep) => void
): Promise<CoreResult> {
  const p = plan(question);
  const steps: NoshxStep[] = [];
  const record = (step: NoshxStep) => {
    steps.push(step);
    onStep?.(step);
  };

  const results = await Promise.all(
    p.calls.map(async (call) => {
      const result = await runToolRaw(call.tool, call.input, context);
      // A 64-character hash that is not a transaction may be an NFT.
      if (!result.ok && call.tool === "read_settlement" && !result.gated) {
        const nft = await runToolRaw("read_token_rights", { token_id: call.input.hash }, context);
        if (nft.ok) {
          record({ kind: "tool", name: "read_token_rights", input: { token_id: call.input.hash }, ok: true, summary: "read" });
          return { call: { ...call, tool: "read_token_rights" }, result: nft };
        }
      }
      record({
        kind: "tool",
        name: call.tool,
        input: call.input,
        ok: result.ok,
        summary: result.ok ? "read" : result.error,
      });
      return { call, result };
    })
  );

  const readings: string[] = [];
  for (const { call, result } of results) {
    const screen = findTool(call.tool)?.screen ?? call.tool;
    if (result.ok) readings.push(compose(call.tool, result.value));
    else if (result.gated) {
      readings.push(
        call.tool === "certify_authority"
          ? `${screen}: ${result.error} The same six issuer checks are free on the website, without an account: https://www.noshashi.app/certificate/ (paste ${String(call.input.issuer ?? "the issuer address")}).`
          : `${screen}: ${result.error} It is available after upgrading in Pricing.`
      );
    }
    else readings.push(`${screen}: could not be read. ${result.error}`);
  }

  let pages = "";
  if (p.knowledge) {
    const hits = await searchKnowledge(question, 5).catch(() => []);
    record({ kind: "tool", name: "search_noshashi", input: { query: question.slice(0, 60) }, ok: hits.length > 0, summary: hits.length ? `${hits.length} passages` : "nothing matched" });
    pages = answerFromPages(question, hits);
    if (WHERE.test(question)) {
      const screens = relatedScreens(question);
      if (screens.length > 0) {
        pages += `${pages ? "\n\n" : ""}Where in NOSHASHI:\n${screens.map((s) => `→ ${s.name} (${s.plan}): ${s.summary}`).join("\n")}`;
      }
    }
  }

  const facts = readings.join("\n\n");
  let text = [facts, pages].filter(Boolean).join("\n\n");
  if (!text) {
    text =
      "I could not find that in NOSHASHI's pages, and the question names nothing I can read from the ledger. Name an address (r…), an issuer and currency, or a 64-character transaction hash, or ask about a NOSHASHI screen, plan or feature.";
  }
  return { text, steps, plan: p, facts };
}
