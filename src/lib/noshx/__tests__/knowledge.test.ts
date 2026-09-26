import { describe, expect, it } from "vitest";
import { buildIndex, knowledgeIndex, pageSections, referenceBlock, search, searchKnowledge } from "../knowledge";
import { runTool } from "../tools";

/*
 * NOSHX answers product questions from the product's own pages. These
 * tests run the real index over the committed site pages and the app's
 * own catalogue, so a page that stops saying something, or a price that
 * changes, shows up here rather than in a customer's answer.
 */

describe("the NOSHASHI knowledge base", () => {
  it("indexes the course, the docs, pricing and the app's own sources", async () => {
    const index = await knowledgeIndex();
    const sources = new Set(index.passages.map((p) => p.source.replace(/#.*$/, "")));
    for (const page of ["/learn/", "/docs/api/", "/docs/security/", "/pricing/", "/enterprise/", "/trust/", "/legal/"]) {
      expect([...sources].some((s) => s.endsWith(page)), page).toBe(true);
    }
    expect(index.passages.some((p) => p.title.startsWith("Help ›"))).toBe(true);
    expect(index.passages.some((p) => p.title.startsWith("Learn NOSHASHI › Word list"))).toBe(true);
  });

  it("finds a plan's price from the catalogue", async () => {
    const [top] = await searchKnowledge("How much does the Institutional plan cost?", 5);
    expect(top.title).toBe("Pricing › INSTITUTIONAL");
    expect(top.text).toContain("$4,000");
  });

  it("finds the lesson that explains a concept", async () => {
    const [top] = await searchKnowledge("What is funded depth versus listed depth?", 3);
    expect(top.title).toMatch(/Listed depth versus funded depth/);
    expect(top.source).toContain("/learn/");
  });

  it("answers privacy questions from the legal page", async () => {
    const hits = await searchKnowledge("privacy policy what data is collected", 5);
    expect(hits.some((hit) => hit.source.includes("/legal/"))).toBe(true);
  });

  it("returns nothing rather than noise for an empty question", async () => {
    expect(await searchKnowledge("the and of", 5)).toEqual([]);
  });

  it("keeps the prompt block inside its budget", async () => {
    const hits = await searchKnowledge("authority certificate freeze clawback", 5);
    const block = referenceBlock(hits, 1500);
    expect(block.length).toBeLessThanOrEqual(1500);
    expect(block).toContain("NOSHASHI REFERENCE");
  });

  it("is reachable as a NOSHX tool on every plan", async () => {
    const result = await runTool("search_noshashi", { query: "webhook signature" }, { has: () => false, spendFreeCheck: () => false });
    expect(result.ok).toBe(true);
    expect(result.content).toContain("/docs/webhooks/");
  });
});

describe("page parsing", () => {
  it("splits at headings, drops navigation and scripts, and keeps anchors", () => {
    const html = `<html><head><title>T</title></head><body><nav>Home Pricing</nav>
      <h2 id="a">First &amp; best</h2><p>${"Alpha sentence. ".repeat(4)}</p><script>var x = 1;</script>
      <h2>Second</h2><table><tr><td>Plan</td><td>$1</td></tr></table><p>${"Beta words here. ".repeat(4)}</p></body></html>`;
    const sections = pageSections("/x/site/demo/index.html", html);
    expect(sections.map((s) => s.title)).toEqual(["T › First & best", "T › Second"]);
    expect(sections[0].source).toBe("https://www.noshashi.app/demo/#a");
    expect(sections.map((s) => s.text).join(" ")).not.toMatch(/Home Pricing|var x/);
    expect(sections[1].text).toContain("Plan | $1");
  });

  it("ranks a passage whose heading names the subject above one that mentions it", () => {
    const index = buildIndex([
      { title: "Escrow", source: "a", text: "Funds locked until a time passes or a condition is met." },
      { title: "Payments", source: "b", text: "Paths, destination tags and escrow are payment tools." },
    ]);
    expect(search(index, "escrow", 2).map((hit) => hit.source)).toEqual(["a", "b"]);
  });
});
