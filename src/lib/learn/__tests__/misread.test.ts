import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { misreadCases } from "@/lib/learn/misread";
import recorded from "@/lib/learn/misread.cases.json";

/**
 * The misread cases are recorded mainnet replies run through the app's own
 * interpreters. These tests pin what each column says, so a change to an
 * interpreter that changes a reading is seen here first — and they keep
 * the website's copy (misread.rendered.json, which the site build reads
 * because it cannot run TypeScript) identical to what the code produces.
 *
 * Regenerate the rendered copy after an intended change:
 *   UPDATE_MISREAD=1 npx vitest run src/lib/learn
 */
const RENDERED = "src/lib/learn/misread.rendered.json";

describe("each case: the obvious reading against the verified one", () => {
  const cases = Object.fromEntries(misreadCases().map((c) => [c.id, c]));

  it("delivered_amount: 100,000 XRP stated, 0.077162 XRP arrived", () => {
    expect(cases.delivered.basic.value).toBe("100,000 XRP paid");
    expect(cases.delivered.verified.value).toMatch(/^0\.077162 XRP arrived/);
    expect(cases.delivered.why).toContain("1,295,975×");
  });

  it("depth: the funded, unexpired figure is what buildSide reports, and an expired funded offer is excluded", () => {
    expect(cases.depth.basic.value).toBe("128,309.49 USD on offer");
    expect(cases.depth.verified.value).toMatch(/^42,328\.77 USD can fill — 33% .* 31 of 60 offers cannot fill at all$/);
    // Independent check on the recorded offers: funded sum minus the one
    // funded offer whose Expiration is before the ledger's close time.
    const funded = recorded.book.offers.reduce((s, [, gets, , f]) => s + Math.min(Number(f ?? gets), Number(gets)), 0);
    const expiredFunded = recorded.book.offers
      .filter(([, , , f, exp]) => exp !== null && Number(exp) < recorded.book.closeTime && Number(f ?? 1) > 0)
      .reduce((s, [, gets, , f]) => s + Math.min(Number(f ?? gets), Number(gets)), 0);
    expect(Number((funded - expiredFunded).toFixed(2))).toBe(42328.77);
  });

  it("sequence: 86,795,414 is a creation ledger, not a count", () => {
    expect(cases.sequence.basic.value).toBe("86,795,414 transactions sent");
    expect(cases.sequence.verified.value).toMatch(/^0 transactions sent/);
  });

  it("quorum: three listed, two must agree", () => {
    expect(cases.quorum.verified.value).toMatch(/^2 of 3 can sign/);
  });

  it("absent: actNotFound fails ACCOUNT_ACTIVATED rather than reading as an empty account", () => {
    expect(cases.absent.basic.value).toBe("0 XRP");
    expect(cases.absent.verified.value).toMatch(/^FAIL — .*never been funded/);
  });

  it("epoch: the same integer, thirty years apart", () => {
    expect(cases.epoch.basic.value).toBe("1996-09-24 02:42:12 UTC");
    expect(cases.epoch.verified.value).toBe("2026-09-24 02:42:12 UTC");
  });

  it("every case names a module that exists and real evidence", () => {
    for (const c of misreadCases()) {
      expect(existsSync(c.module), c.module).toBe(true);
      expect(c.evidence.ledger).toBeGreaterThan(80_000_000);
      expect(c.evidence.ref).toMatch(/^(r[1-9A-HJ-NP-Za-km-z]{24,34}|[0-9A-F]{64})$/);
    }
  });
});

describe("the website's copy", () => {
  it("is exactly what the code produces", () => {
    const current = JSON.stringify(misreadCases(), null, 2) + "\n";
    if (process.env.UPDATE_MISREAD) writeFileSync(RENDERED, current);
    expect(readFileSync(RENDERED, "utf8")).toBe(current);
  });
});

describe("the /misread/ page", () => {
  const page = readFileSync("site/misread/index.html", "utf8");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  it("shows both readings of every case, with its evidence", () => {
    for (const c of misreadCases()) {
      expect(page).toContain(esc(c.basic.value));
      expect(page).toContain(esc(c.verified.value));
      expect(page).toContain(esc(c.evidence.ref));
    }
  });

  it("is in the sitemap and the footer, and the home page links it", () => {
    expect(readFileSync("site/sitemap.xml", "utf8")).toContain("/misread/</loc>");
    expect(readFileSync("api/_lib/shell.js", "utf8")).toContain('href: "/misread/"');
    expect(readFileSync("templates/home.html", "utf8")).toContain('href="/misread/"');
  });
});
