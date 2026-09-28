import { describe, expect, it, vi } from "vitest";
import mainnet from "@/lib/desk/__tests__/fixtures/xrpl-mainnet-107193471.json";

/*
 * NOSHX Core with no model anywhere. Ledger facts come from the recorded
 * mainnet fixture (ledger 107193471) replayed through the real readers;
 * product answers come from the committed NOSHASHI pages.
 */

const PAYMENT = mainnet.tx_payment;
const BITSTAMP = mainnet.account_info_bitstamp.account_data.Account;

vi.mock("@/lib/xrpl/client", async (original) => ({
  ...(await original<typeof import("@/lib/xrpl/client")>()),
  rpc: vi.fn(async (method: string, params: Record<string, unknown>) => {
    if (method === "tx" && params.transaction === PAYMENT.hash) return PAYMENT;
    throw Object.assign(new Error("txnNotFound"), { code: "txnNotFound" });
  }),
}));

const { extractEntities, plan } = await import("../core/plan");
const { answerWithCore, relatedScreens } = await import("../core/engine");

const pro = { has: () => true, spendFreeCheck: () => true };
const free = { has: (f: string) => f === "agent", spendFreeCheck: () => true };

describe("reading the question", () => {
  it("finds addresses, hashes and currency codes, and ignores acronyms", () => {
    const e = extractEntities(`Can the USD issuer ${BITSTAMP} freeze me? Also check ${PAYMENT.hash} for KYC and AML.`);
    expect(e.addresses).toEqual([BITSTAMP]);
    expect(e.hashes).toEqual([PAYMENT.hash.toUpperCase()]);
    expect(e.currencies).toEqual(["USD"]);
  });

  it("plans the reader each question needs", () => {
    expect(plan(`Can ${BITSTAMP} freeze or claw back my tokens?`).calls.map((c) => c.tool)).toEqual(["certify_authority"]);
    expect(plan(`Who controls ${BITSTAMP}? Is there a signer list?`).calls.map((c) => c.tool)).toEqual(["read_control_surface"]);
    expect(plan(`How deep is the USD book for ${BITSTAMP}, could I exit at size?`).calls).toEqual([
      expect.objectContaining({ tool: "read_book", input: { currency: "USD", issuer: BITSTAMP } }),
    ]);
    expect(plan(`What did ${PAYMENT.hash} deliver?`).calls.map((c) => c.tool)).toEqual(["read_settlement"]);
    expect(plan(BITSTAMP).calls.map((c) => c.tool)).toEqual(["check_address"]);
  });

  it("plans the security readers for security and theft questions, and nothing else for a stress question", () => {
    expect(plan(`Is ${BITSTAMP} secure? Could someone take it over?`).calls.map((c) => c.tool)).toEqual(["security_check"]);
    expect(plan(`My account ${BITSTAMP} was hacked and drained, can I get my XRP back?`).calls.map((c) => c.tool)).toEqual(["investigate_hack"]);
    expect(plan(`What is the recovery ratio of ${BITSTAMP} in a stress test?`).calls.map((c) => c.tool)).not.toContain("investigate_hack");
  });

  it("plans the recovery and analysis tools", () => {
    const tools = (q: string) => plan(q).calls.map((c) => c.tool);
    expect(tools(`Is any XRP stuck in escrows or reserve I could reclaim on ${BITSTAMP}?`)).toContain("find_stuck_funds");
    expect(tools(`What permissions or open offers could someone use to take value from ${BITSTAMP}? I want to revoke them`)).toEqual(["audit_exposure"]);
    expect(tools(`What else does ${BITSTAMP} hold? Give me an inventory`)).toEqual(["asset_inventory"]);
    expect(tools(`My deposit ${PAYMENT.hash} never arrived, I forgot the tag`)).toContain("deposit_help");
    expect(tools(`Map the cluster of linked accounts around ${BITSTAMP}`)).toEqual(["map_cluster"]);
    expect(tools(`Does ${BITSTAMP} really belong to the website in its domain field?`)).toEqual(["verify_domain"]);
    expect(plan("Which accounts does bitstamp.net list in its xrp-ledger.toml domain file?").calls).toEqual([
      expect.objectContaining({ tool: "verify_domain", input: { domain: "bitstamp.net" } }),
    ]);
  });

  it("explains a pasted transaction, and plans nothing from the addresses inside it", () => {
    const tx = `{"TransactionType":"SetRegularKey","Account":"${BITSTAMP}","RegularKey":"rUUs1jns6tdUQwAABDJyHMUHvdGNvNADvJ","Fee":"12","Sequence":1}`;
    const p = plan(`A site asks me to sign this, is it safe? ${tx}`);
    expect(p.calls).toEqual([expect.objectContaining({ tool: "explain_transaction", input: { transaction: tx } })]);
  });

  it("sends product and concept questions to the pages", () => {
    const p = plan("How much does the Institutional plan cost?");
    expect(p.calls).toEqual([]);
    expect(p.knowledge).toBe(true);
  });
});

describe("answering with no model", () => {
  it("reads a real payment and says what it delivered, with its ledger", async () => {
    const result = await answerWithCore(`What did ${PAYMENT.hash} deliver?`, pro);
    expect(result.text).toContain("Payment");
    expect(result.text).toContain("tesSUCCESS");
    expect(result.text).toContain(PAYMENT.meta.delivered_amount.value.slice(0, 7));
    expect(result.steps).toEqual([expect.objectContaining({ kind: "tool", name: "read_settlement", ok: true })]);
  });

  it("says when a reader needs a higher plan instead of guessing", async () => {
    const result = await answerWithCore(`What did ${PAYMENT.hash} deliver?`, free);
    expect(result.text).toMatch(/Settlement: .*Pro plan or higher.*Pricing/);
    expect(result.text).not.toContain("tesSUCCESS");
  });

  it("answers a price question from the plan catalogue, with its source", async () => {
    const result = await answerWithCore("How much does the Institutional plan cost?", free);
    expect(result.text).toContain("$4,000");
    expect(result.text).toContain("/pricing/");
    expect(result.text).not.toMatch(/SSO|SAML/);
  });

  it("defines a term from the word list or the knowledge check", async () => {
    const result = await answerWithCore("What is a destination tag?", free);
    expect(result.text).toMatch(/which customer a payment is for/);
    expect(result.text).toContain("noshashi.app/learn/");
  });

  it("names the screen that addresses a compliance need", () => {
    expect(relatedScreens("How does NOSHASHI help with the Travel Rule?").map((s) => s.name)).toContain("Exposure Analysis");
  });

  it("admits when it has nothing to go on", async () => {
    const result = await answerWithCore("zxqv wplk", free);
    expect(result.text).toMatch(/could not find that/);
  });
});
