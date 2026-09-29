import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import fx from "./fixtures/replay-bitstamp-107305907.json";
import { DOMAIN_REGISTRY, receiptCanonical, runPolicy } from "@/lib/policy";
import type { AccountInfo } from "@/lib/xrpl/types";
import { receiptToEntry } from "../ledger";
import { verifyEntry } from "../evidence";
import { institutionalReport } from "../report";

/**
 * The report's verification instructions must work with a standard tool:
 * SHA-256 over the canonical bytes it prints equals the receipt digest.
 * Built from Bitstamp's real state at ledger 107,305,907.
 */

const d = fx.account_data;
const account: AccountInfo = { address: d.Account, balanceXrp: (Number(d.Balance) / 1e6).toFixed(2), sequence: d.Sequence, ownerCount: d.OwnerCount };
const reserve = { baseXrp: 1, incXrp: 0.2 };

describe("institutional report", async () => {
  const receipt = await runPolicy({ account, credentials: [], domain: DOMAIN_REGISTRY[0], amountXrp: 25, reserve });
  const entry = receiptToEntry(receipt, { domainCode: DOMAIN_REGISTRY[0].code, ledgerIndex: fx.ledger_index });
  const html = institutionalReport({ entry, verification: await verifyEntry(entry), now: new Date("2026-09-29T11:00:00Z") });

  it("prints canonical bytes whose plain SHA-256 is the receipt digest", () => {
    const canonical = receiptCanonical({ ...receipt });
    expect(createHash("sha256").update(canonical, "utf8").digest("hex").toUpperCase()).toBe(entry.digest);
    const printed = html.match(/<pre>(\{[\s\S]*?\})<\/pre>/)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'");
    expect(printed).toBe(canonical);
  });

  it("states the decision, the ledger it was read at and the re-verification", () => {
    expect(html).toContain(entry.verdict === "no-go" ? "NO-GO" : entry.verdict.toUpperCase());
    expect(html).toContain("107,305,907");
    expect(html).toContain("Verified: the SHA-256 recomputed from the record equals the stored digest.");
  });

  it("escapes what it prints", () => {
    const hostile = institutionalReport({ entry: { ...entry, label: "<script>alert(1)</script>" }, verification: { state: "verified", digest: entry.digest } });
    expect(hostile).not.toContain("<script>alert(1)</script>");
    expect(hostile).toContain("&lt;script&gt;");
  });
});
