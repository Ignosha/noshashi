import { KNOWLEDGE } from "@/lib/support/knowledge";
import { PLANS } from "@/lib/billing/catalog";
import reference from "@/lib/docs/reference.json";
import { SITE, type Passage } from "./pages";

/**
 * What NOSHX knows about NOSHASHI itself.
 *
 * The published pages are the source: the Learn course, every docs page,
 * pricing, enterprise, trust, the guide, legal and the rest, read from
 * site/ when the app is built and split into sections (./pages.ts), so
 * there is no second copy to fall out of date and only their text ships.
 * The app's own help answers, plan catalogue and screen reference are
 * added beside them.
 *
 * Retrieval is BM25 over those sections: no embedding model, no network,
 * a few milliseconds per query and nothing to download, which matters on
 * an 8 GB laptop already running a local model. The retrieved passages go
 * into the prompt with their page address, so the model answers from the
 * product's own words and can say where to read more.
 */

export type { Passage } from "./pages";
export { htmlText, pageSections, learnScriptPassages } from "./pages";

export type Hit = Passage & { score: number };

/** The app's own help answers, plans and screen reference. */
export function appPassages(): Passage[] {
  const out: Passage[] = KNOWLEDGE.map((entry) => ({
    title: `Help › ${entry.question}`,
    source: "NOSHX › Support",
    text: `${entry.question}\n${entry.answer}`,
  }));

  for (const plan of PLANS) {
    out.push({
      title: `Pricing › ${plan.name}`,
      source: `${SITE}/pricing/`,
      text: `${plan.name} plan, for ${plan.audience}. Price (cost): ${plan.priceLabel} ${plan.cadence}. Includes: ${plan.features.join("; ")}.`,
    });
  }

  const scenes = (reference as { scenes: Array<{ name: string; plan: string; summary: string }> }).scenes;
  for (let i = 0; i < scenes.length; i += 6) {
    out.push({
      title: "App screens",
      source: "NOSHASHI desktop app",
      text: scenes
        .slice(i, i + 6)
        .map((scene) => `${scene.name} (${scene.plan}): ${scene.summary}`)
        .join("\n"),
    });
  }
  return out;
}

// ————— BM25 —————

const STOP = new Set(
  "a an and are as at be but by can do does for from has have how i if in is it its me my of on or our so that the their them then there these this to was we what when where which who why will with you your".split(" ")
);

/** Irregular forms, so "sent" finds "sending" and "held" finds "hold". */
const IRREGULAR: Record<string, string> = {
  sent: "send", sending: "send", sends: "send", paid: "pay", paying: "pay", bought: "buy", sold: "sell",
  held: "hold", holding: "hold", frozen: "freeze", froze: "freeze", freezing: "freeze", data: "data",
  costs: "cost", priced: "price", pricing: "price", prices: "price",
};

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) ?? [])
    .filter((t) => !STOP.has(t) && t.length > 1)
    .map((t) => IRREGULAR[t] ?? (t.length > 4 ? t.replace(/(ies|es|s|ing|ed)$/, (m) => (m === "ies" ? "y" : "")) : t));
}

type Index = {
  passages: Passage[];
  docs: Map<string, number>[];
  /** Each passage's tokens in order, space-joined, for phrase matches. */
  sequences: string[];
  lengths: number[];
  df: Map<string, number>;
  avg: number;
};

export function buildIndex(passages: Passage[]): Index {
  const docs: Map<string, number>[] = [];
  const sequences: string[] = [];
  // Each passage is tokenised once; this loop is most of the index's cost.
  for (const p of passages) {
    const title = tokens(p.title);
    const text = tokens(p.text);
    const counts = new Map<string, number>();
    // The heading counts twice: it says what the section is about.
    for (const t of title) counts.set(t, (counts.get(t) ?? 0) + 2);
    for (const t of text) counts.set(t, (counts.get(t) ?? 0) + 1);
    docs.push(counts);
    sequences.push(` ${title.join(" ")} ${text.join(" ")} `);
  }
  const lengths = docs.map((d) => [...d.values()].reduce((a, b) => a + b, 0));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avg = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
  return { passages, docs, sequences, lengths, df, avg };
}

export function search(index: Index, query: string, limit = 5): Hit[] {
  const ordered = tokens(query);
  const terms = [...new Set(ordered)];
  // Adjacent query words found together ("institutional plan") say more
  // than the same words scattered through a passage.
  const pairs = ordered.slice(1).map((t, i) => ` ${ordered[i]} ${t} `);
  if (terms.length === 0) return [];
  const n = index.passages.length;
  const k1 = 1.4;
  // Moderate length normalisation: a plan's long feature list should not
  // lose to a one-line mention of the same words.
  const b = 0.55;
  const idf = (t: string) => {
    const df = index.df.get(t) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  };
  const scored: Hit[] = [];
  index.docs.forEach((doc, i) => {
    let score = 0;
    for (const t of terms) {
      const f = doc.get(t);
      if (!f) continue;
      score += (idf(t) * f * (k1 + 1)) / (f + k1 * (1 - b + (b * index.lengths[i]) / index.avg));
    }
    for (const pair of pairs) {
      if (index.sequences[i].includes(pair)) {
        const [x, y] = pair.trim().split(" ");
        score += 0.6 * (idf(x) + idf(y));
      }
    }
    if (score > 0) scored.push({ ...index.passages[i], score: score * (index.passages[i].weight ?? 1) });
  });
  scored.sort((a, z) => z.score - a.score);
  // One passage per section heading, so five hits are five different things.
  const seen = new Set<string>();
  return scored.filter((hit) => !seen.has(hit.title) && seen.add(hit.title)).slice(0, limit);
}

let loading: Promise<Index> | null = null;
let extra: Passage[] = [];

/**
 * Add passages that only one surface carries, such as the website's own
 * support answers. Rebuilds the index on next use.
 */
export function extendKnowledge(passages: Passage[]): void {
  extra = passages;
  loading = null;
}

/**
 * Built once, on first use; later calls reuse it. The pages' passages
 * were compiled when the app was built (vite.noshx.ts), so this only
 * loads their text and indexes it.
 */
export function knowledgeIndex(): Promise<Index> {
  loading ??= import("virtual:noshx-pages").then(({ default: pages }) => buildIndex([...appPassages(), ...extra, ...pages]));
  return loading;
}

/**
 * Start building the index without waiting for it, when the browser is
 * idle, so the first question does not pay for it. Safe to call often.
 */
export function prewarmKnowledge(): void {
  if (loading) return;
  const start = () => void knowledgeIndex();
  if (typeof requestIdleCallback === "function") requestIdleCallback(start, { timeout: 1500 });
  else setTimeout(start, 0);
}

export async function searchKnowledge(query: string, limit = 5): Promise<Hit[]> {
  return search(await knowledgeIndex(), query, limit);
}

/** Retrieved passages as a prompt block, within a character budget. */
export function referenceBlock(hits: Hit[], budget: number): string {
  if (hits.length === 0) return "";
  const lines = ["NOSHASHI REFERENCE (retrieved from the product's own pages for this question; cite the source when you use it):"];
  let used = lines[0].length;
  for (const hit of hits) {
    let entry = `\n[${hit.title}] (${hit.source})\n${hit.text}`;
    if (used + entry.length > budget) {
      // The best hit is never dropped for being long: it is cut to fit, at a
      // sentence where one falls in range. Later hits that do not fit are left out.
      if (lines.length > 1) break;
      const room = budget - used - 1;
      if (room < 120) break;
      const cut = entry.slice(0, room);
      const stop = cut.lastIndexOf(". ");
      entry = (stop > room * 0.5 ? cut.slice(0, stop + 1) : cut.slice(0, room - 1)) + "…";
    }
    lines.push(entry);
    used += entry.length;
  }
  return lines.length > 1 ? lines.join("\n") : "";
}
