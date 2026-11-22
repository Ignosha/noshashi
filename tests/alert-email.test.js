import { describe, expect, it } from "vitest";
import { alertEmailHtml, parseAlert } from "../supabase/functions/_shared/alertEmail.ts";

const issuer = "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH";
const text = [
  "NOSHASHI · issuer power change",
  `${issuer} at ledger 99000000`,
  "",
  "🔴 Clawback was enabled <now>",
  "🟢 Domain set",
  "",
  `Full reading: https://www.noshashi.app/certificate/?issuer=${issuer}`,
  "Ledger facts, not advice. Stop these alerts: https://www.noshashi.app/alerts/?unsubscribe=abc",
].join("\n");

describe("alert email", () => {
  it("parses the chat text into parts", () => {
    const a = parseAlert(text);
    expect(a.kind).toBe("issuer power change");
    expect(a.findings.map((f) => f.label)).toEqual(["HIGH", "INFO"]);
    expect(a.links).toEqual([{ label: "Full reading", url: `https://www.noshashi.app/certificate/?issuer=${issuer}` }]);
    expect(a.stop?.url).toBe("https://www.noshashi.app/alerts/?unsubscribe=abc");
  });

  it("renders escaped HTML with the reading and unsubscribe links only", () => {
    const html = alertEmailHtml(text, "Billing note.");
    expect(html).toContain("Issuer power change");
    expect(html).toContain("Clawback was enabled &lt;now&gt;");
    expect(html.match(/href=/g)).toHaveLength(2);
    expect(html).toContain("Billing note.");
  });

  it("never links a URL outside noshashi.app", () => {
    const html = alertEmailHtml("NOSHASHI · x\nr1\n\nSee: https://evil.example/x\nStop: https://evil.example/u");
    expect(html).not.toContain("href=\"https://evil");
  });
});
