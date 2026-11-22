import { describe, expect, it } from "vitest";
import { outreachEmail, shell } from "../api/_lib/email.js";
import { renderLetter, OPT_OUT } from "../scripts/outreach-email.mjs";
import { newEntries, NEWS_KINDS } from "../scripts/send-update.mjs";

const ADDRESS = "1 Example Street, Springfield, USA";

const letter = {
  subject: "A free check for XRP Ledger tokens",
  paragraphs: [
    "For whoever looks after token listings.",
    "The free tool is at https://www.noshashi.app/tokens/. It reads the ledger <live>.",
  ],
  signoff: "Joshua Edmond",
};

describe("outreach letter", () => {
  it("always carries the postal address and the opt-out, in both parts", () => {
    const mail = renderLetter(letter, ADDRESS);
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain(ADDRESS);
      expect(part).toContain("reply");
    }
    expect(mail.text).toContain(OPT_OUT);
    expect(mail.text).toContain(ADDRESS);
    expect(mail.text.startsWith("For whoever looks after token listings.")).toBe(true);
  });

  it("leaves out the hosted logo for Gmail and escapes the text", () => {
    const { html } = renderLetter(letter, ADDRESS);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<live>");
    expect(html).toContain("&lt;live&gt;");
  });

  it("links only noshashi.app URLs, without swallowing the full stop", () => {
    const { html } = renderLetter(letter, ADDRESS);
    expect(html).toContain('href="https://www.noshashi.app/tokens/"');
    expect(html).toContain("www.noshashi.app/tokens/</a>.");
    const other = outreachEmail({ ...letter, paragraphs: ["See https://evil.example/x"] }).html;
    expect(other).not.toContain('href="https://evil.example');
  });

  it("refuses a letter without a postal address", () => {
    expect(() => renderLetter(letter, "")).toThrow(/postal address/);
  });

  it("refuses a letter without a sender's name", () => {
    expect(() => renderLetter({ ...letter, signoff: "" }, ADDRESS)).toThrow();
  });

  it("keeps the logo by default for product mail", () => {
    expect(shell({ title: "t", body: "" })).toContain("ledger-mark-180.png");
    expect(shell({ title: "t", body: "", mark: false })).not.toContain("<img");
  });
});

describe("automatic update email", () => {
  const before = [{ date: "2026-10-30T14:00:00Z", kind: "release", title: "1.0.25", body: "old", link: "/docs/release-notes/" }];

  it("sends only entries the push added, news kinds only, newest first", () => {
    const now = [
      { date: "2026-11-20T10:00:00Z", kind: "release", title: "1.0.26", body: "new", link: "/docs/release-notes/" },
      { date: "2026-11-21T10:00:00Z", kind: "milestone", title: "Evidence reports", body: "b" },
      { date: "2026-11-21T11:00:00Z", kind: "maintenance", title: "Window", body: "m" },
      { date: "2026-11-21T12:00:00Z", kind: "incident", title: "Outage", body: "i" },
      ...before,
    ];
    const out = newEntries(before, now);
    expect(out.map((e) => e.title)).toEqual(["Evidence reports", "1.0.26"]);
    expect(out[1].url).toBe("https://www.noshashi.app/docs/release-notes/");
    expect(NEWS_KINDS.has("maintenance")).toBe(false);
  });

  it("sends nothing when nothing was added", () => {
    expect(newEntries(before, before)).toEqual([]);
    expect(newEntries(before, [{ ...before[0], body: "edited" }])).toEqual([]);
  });
});
