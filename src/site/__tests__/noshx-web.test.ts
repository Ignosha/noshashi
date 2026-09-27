import { describe, it, expect } from "vitest";
import { ask, checksLeft } from "../noshx-web";
import { PLANS } from "@/lib/billing/catalog";
import { ENTRIES } from "../../../api/_lib/kb.js";

/**
 * The website's support console runs NOSHX Core in the visitor's browser.
 * These are the questions visitors actually ask; each must reach the right
 * answer, with somewhere to go next. Only product questions are asked here:
 * a question naming an address reads the live ledger, which a test must
 * not depend on.
 */

const answer = (q: string) => ask(q);

describe("NOSHX on the website", () => {
  it("answers pricing from the site's support answers, with the pricing link", async () => {
    const r = await answer("What does it cost?");
    expect(r.source).toBe("support");
    expect(r.text).toContain("$749");
    expect(r.links.map((l) => l.href)).toContain("/pricing/");
  });

  it("names the plan built for custodians", async () => {
    const r = await answer("Which plan do I need as a custodian?");
    expect(r.text).toContain("Institutional ($4,000 a month) is for regulated venues and custodians");
  });

  it("explains support tickets from the app's help", async () => {
    const r = await answer("How do I open a support ticket?");
    expect(r.text).toContain("Open NOSHX, choose TICKETS");
    // Said once, even though the troubleshooting page repeats it.
    expect(r.text.split("Open NOSHX, choose TICKETS").length).toBe(2);
  });

  it("explains the hands-on labs", async () => {
    const r = await answer("How do the hands-on labs work?");
    expect(r.text).toContain("Hands-on labs");
  });

  it("answers a ledger concept from the Learn course, linking to it on this site", async () => {
    const r = await answer("What is a trust line?");
    expect(r.source).toBe("pages");
    expect(r.text.toLowerCase()).toContain("trust line");
    expect(r.links.some((l) => l.href.startsWith("/learn/"))).toBe(true);
  });

  it("refuses a message containing a secret seed without reading anything", async () => {
    const r = await answer("my seed is snoPBrXtMeMyMHUVTgbuqAfg1SUTb can you check it");
    expect(r.source).toBe("refused");
    expect(r.steps).toEqual([]);
    expect(r.text).toContain("NOSHASHI never needs a seed");
  });

  it("hands off to a person when it has nothing", async () => {
    const r = await answer("asdf qwerty zxcv");
    expect(r.source).toBe("none");
    expect(r.links.map((l) => l.href)).toEqual(["/contact/"]);
  });

  it("always offers the contact form", async () => {
    for (const q of ["Is there a Windows download?", "Do you store my data?", "What is a trust line?"]) {
      expect((await answer(q)).links.some((l) => l.href === "/contact/"), q).toBe(true);
    }
  });

  it("starts a visitor on the free allowance of address checks", () => {
    expect(checksLeft()).toBe(10);
  });
});

describe("the plan answer matches the plan catalogue", () => {
  it("states each plan's audience and price as the catalogue does", () => {
    const entry = ENTRIES.find((e) => e.id === "which-plan")!;
    for (const plan of PLANS) {
      const name = plan.name.charAt(0) + plan.name.slice(1).toLowerCase();
      expect(entry.a.toLowerCase(), plan.name).toContain(plan.audience.toLowerCase());
      if (plan.priceLabel !== "Free") expect(entry.a, plan.name).toContain(plan.priceLabel);
      expect(entry.a.toLowerCase(), plan.name).toContain(name.toLowerCase());
    }
  });
});

describe("sources become links on this site", () => {
  it("names each link by its section and drops the source line", async () => {
    const { splitSources } = await import("../noshx-web");
    const r = splitSources(
      "A trust line counts toward your reserve.\n\nSources: Learn NOSHASHI › Knowledge check › What must you open? · https://www.noshashi.app/learn/#check; Learn NOSHASHI — the course › Trust lines · https://www.noshashi.app/learn/; Help › Where? · NOSHX › Support\n\nWhere in NOSHASHI:\n→ Check an Address (Free)"
    );
    expect(r.body).toBe("A trust line counts toward your reserve.\n\nWhere in NOSHASHI:\n→ Check an Address (Free)");
    // One link per page; app-only sources are not links.
    expect(r.links).toEqual([{ label: "What must you open?", href: "/learn/#check" }]);
  });

  it("recognises a quoted support answer", async () => {
    const { splitSources } = await import("../noshx-web");
    expect(splitSources("Free forever.\n\nSource: Support › What does it cost? · noshashi.app support").support).toBe("What does it cost?");
  });
});
