import { describe, expect, it } from "vitest";
import cases from "./deposit.cases.json";
import {
  activationOf,
  classifyTransaction,
  containsLink,
  DEFAULT_EVENT_TYPES,
  issuerFactsFrom,
  memosOf,
  normalizeTx,
  sanitizeDepositConfig,
  screenDeposit,
  lookalikeOf,
  type Amount,
  type DepositConfig,
  type XrplEvent,
} from "../deposit";
import misread from "../../learn/misread.cases.json";

const CONFIG: DepositConfig = { acceptedIssuers: {}, denylist: [], requireTag: true, travelRuleXrp: 0, trustedCounterparties: [] };

function classifyCase(c: { watched: string; tx: Record<string, unknown>; meta: Record<string, unknown> }): XrplEvent[] {
  return classifyTransaction(c.tx, c.meta, c.watched, Number(c.tx.ledger_index));
}

/** An incoming payment of a token, for the issuer rules; the rest of it is the real phishing case. */
function tokenDeposit(delivered: Amount): XrplEvent {
  const [event] = classifyCase(cases.phishingDust);
  return { ...event, data: { ...event.data, amount: delivered, delivered, memos: [] } };
}

describe("classifyTransaction on recorded mainnet transactions", () => {
  it("reads a 1-drop payment with a link in its memo as payment_in, memo decoded as UTF-8", () => {
    const [event] = classifyCase(cases.phishingDust);
    expect(event.type).toBe("payment_in");
    expect(event.counterparty).toBe("rfWPjcbY5QT2shRFY2SSQHFKPYSMzxaMaN");
    expect(event.ledgerIndex).toBe(104503230);
    expect(event.data.delivered).toEqual({ currency: "XRP", issuer: null, value: 0.000001 });
    expect((event.data.memos as string[])[0]).toBe("🎁 You have been sent a free XRP GIFT worth $116,000! Visit - XAMAN.LA - to claim it.");
  });

  it("does not report someone else's payment that rippled through the account as the account's own", () => {
    const events = classifyCase(cases.rippledThrough);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("rippled_through");
    expect(events[0].counterparty).toBe("rogue5HnPRSszD9CWGSUz8UGHMVwSSKF6");
    expect(DEFAULT_EVENT_TYPES).not.toContain("rippled_through");
  });

  it("reads Bitstamp freezing a holder's BTC line as trustline_frozen, with Bitstamp as counterparty", () => {
    const events = classifyCase(cases.issuerFreeze);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "trustline_frozen", counterparty: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", result: "tesSUCCESS" });
    expect(events[0].data.freeze).toBe(true);
  });

  it("reads the recorded partial payment as a self payment that delivered 0.077162 of 100,000 XRP asked", () => {
    const reply = misread.partialPayment.reply as Record<string, any>;
    const { tx, meta, ledgerIndex } = normalizeTx(reply);
    const [event] = classifyTransaction(tx, meta, reply.Account, ledgerIndex);
    expect(event.type).toBe("payment_self");
    expect(event.data).toMatchObject({ partial: true, amount: { value: 100000 }, delivered: { value: 0.077162 } });
  });

  it("normalizes an API v2 row (tx_json beside hash and ledger_index)", () => {
    const { tx, ledgerIndex } = normalizeTx({ tx_json: { TransactionType: "Payment" }, hash: "AB", ledger_index: 7 });
    expect(tx.hash).toBe("AB");
    expect(ledgerIndex).toBe(7);
  });
});

describe("screenDeposit", () => {
  const readAt = cases.readAtLedger;
  const phishingChain = [activationOf("rfWPjcbY5QT2shRFY2SSQHFKPYSMzxaMaN", cases.phishingDust.senderFirstTx)];

  it("holds the phishing dust for review: dust with a link, no tag, and a sender created 99 ledgers earlier", () => {
    const [event] = classifyCase(cases.phishingDust);
    const result = screenDeposit({ event, config: CONFIG, issuer: null, chain: phishingChain, currentLedger: 104503230 });
    expect(result.verdict).toBe("review");
    expect(result.findings.map((f) => f.id)).toEqual(["phishing_dust", "no_destination_tag", "new_sender"]);
    expect(result.findings[0].detail).toContain("XAMAN.LA");
    expect(result.credit).toEqual({ currency: "XRP", issuer: null, value: 0.000001 });
  });

  it("ages the sender at the ledger it paid in, not the ledger the screening runs at", () => {
    const [event] = classifyCase(cases.phishingDust);
    const result = screenDeposit({ event, config: { ...CONFIG, requireTag: false }, issuer: null, chain: phishingChain, currentLedger: readAt });
    expect(result.findings.map((f) => f.id)).toEqual(["phishing_dust", "new_sender"]);
    // Created in 104503131, paid in 104503230: 99 ledgers, about 6.6 minutes.
    expect(result.findings[1].title).toBe("The sender was about 7 minutes old when it paid");
  });

  it("credits what a partial payment delivered, never its Amount", () => {
    const reply = misread.partialPayment.reply as Record<string, any>;
    const { tx, meta, ledgerIndex } = normalizeTx(reply);
    const [event] = classifyTransaction(tx, meta, reply.Account, ledgerIndex);
    const result = screenDeposit({ event, config: { ...CONFIG, requireTag: false }, issuer: null, chain: [], currentLedger: readAt });
    expect(result.credit?.value).toBe(0.077162);
    const partial = result.findings.find((f) => f.id === "partial_payment");
    expect(partial?.title).toBe("Partial payment: credit 0.077162 XRP, not 100,000 XRP");
    expect(partial?.detail).toContain("1,295,975x");
  });

  it("does not credit a payment that failed", () => {
    const [event] = classifyCase(cases.phishingDust);
    const result = screenDeposit({ event: { ...event, result: "tecPATH_DRY" }, config: CONFIG, issuer: null, chain: [], currentLedger: readAt });
    expect(result).toMatchObject({ verdict: "hold", credit: null });
  });

  it("holds a familiar ticker from an issuer that owes nothing as counterfeit", () => {
    const issuer = issuerFactsFrom(cases.owesNothing.accountInfo, cases.owesNothing.gatewayBalances, "USD");
    expect(issuer).toEqual({ obligations: 0, globalFreeze: false, noFreeze: false, clawback: false });
    const event = tokenDeposit({ currency: "USD", issuer: cases.owesNothing.address, value: 5000 });
    const result = screenDeposit({ event, config: { ...CONFIG, requireTag: false }, issuer, chain: [], currentLedger: readAt });
    expect(result.verdict).toBe("hold");
    expect(result.credit).toBeNull();
    expect(result.findings[0].id).toBe("counterfeit");
  });

  it("accepts Bitstamp USD it has approved, noting only that Bitstamp can freeze it", () => {
    const issuer = issuerFactsFrom(cases.bitstamp.accountInfo, cases.bitstamp.gatewayBalances, "USD");
    expect(issuer?.obligations).toBeCloseTo(7977614.658695161, 3);
    const event = tokenDeposit({ currency: "USD", issuer: cases.bitstamp.address, value: 250 });
    const config = sanitizeDepositConfig({ acceptedIssuers: { usd: [cases.bitstamp.address] }, requireTag: false });
    const chain = [activationOf(cases.bitstamp.address, cases.bitstamp.firstTx)];
    const result = screenDeposit({ event, config, issuer, chain, currentLedger: readAt });
    expect(result.verdict).toBe("clear");
    expect(result.findings.map((f) => f.id)).toEqual(["freezable"]);
  });

  it("flags real Bitstamp USD as not accepted when the institution accepts another issuer", () => {
    const issuer = issuerFactsFrom(cases.bitstamp.accountInfo, cases.bitstamp.gatewayBalances, "USD");
    const event = tokenDeposit({ currency: "USD", issuer: cases.bitstamp.address, value: 250 });
    const config = sanitizeDepositConfig({ acceptedIssuers: { USD: ["rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq"] }, requireTag: false });
    const result = screenDeposit({ event, config, issuer, chain: [], currentLedger: readAt });
    expect(result.findings.map((f) => f.id)).toContain("issuer_not_accepted");
    expect(result.verdict).toBe("review");
  });

  it("holds a token whose issuer could not be read, rather than passing it", () => {
    const event = tokenDeposit({ currency: "USD", issuer: cases.bitstamp.address, value: 1 });
    const result = screenDeposit({ event, config: { ...CONFIG, requireTag: false }, issuer: null, chain: [], currentLedger: readAt });
    expect(result.findings.map((f) => f.id)).toContain("issuer_unknown");
    expect(result.verdict).toBe("review");
  });

  it("holds funds whose sender was funded, two hops back, by an account on the deny list", () => {
    const [event] = classifyCase(cases.phishingDust);
    const chain = [
      activationOf("rfWPjcbY5QT2shRFY2SSQHFKPYSMzxaMaN", cases.phishingDust.senderFirstTx),
      { account: "rMma1HTuf5Nihma4FDT1mxNsWvr4fxaman", fundedBy: null, activatedLedger: null },
    ];
    const config = { ...CONFIG, requireTag: false, denylist: ["rMma1HTuf5Nihma4FDT1mxNsWvr4fxaman"] };
    const result = screenDeposit({ event, config, issuer: null, chain, currentLedger: readAt });
    const hit = result.findings.find((f) => f.id === "denylist_hop_1");
    expect(result.verdict).toBe("hold");
    expect(hit?.detail).toBe("rfWPjcbY5QT2shRFY2SSQHFKPYSMzxaMaN ← rMma1HTuf5Nihma4FDT1mxNsWvr4fxaman: rMma1HTuf5Nihma4FDT1mxNsWvr4fxaman is on this organization's deny list.");
  });
});

describe("activationOf", () => {
  it("reads who created Bitstamp's account and when", () => {
    expect(activationOf(cases.bitstamp.address, cases.bitstamp.firstTx)).toEqual({
      account: cases.bitstamp.address,
      fundedBy: "r49nVgaYSDuU7GEQh4mF1nyjsXSVRcUHsr",
      activatedLedger: 242756,
    });
  });

  it("says nothing about age when the earliest transaction a server holds did not create the account", () => {
    const hop = activationOf("rEDtyWDqWs9q1aZY82bjoetpADy7iviqhz", { tx: cases.issuerFreeze.tx, meta: cases.issuerFreeze.meta, ledger_index: 22905411 });
    expect(hop).toEqual({ account: "rEDtyWDqWs9q1aZY82bjoetpADy7iviqhz", fundedBy: null, activatedLedger: null });
  });
});

describe("helpers", () => {
  it("finds links in memos", () => {
    expect(containsLink("Visit - XAMAN.LA - to claim it.")).toBe(true);
    expect(containsLink("https://example.com/x")).toBe(true);
    expect(containsLink("Invoice 2231 paid in full")).toBe(false);
  });

  it("drops memos that are not text", () => {
    expect(memosOf({ Memos: [{ Memo: { MemoData: "zz" } }, { Memo: {} }] })).toEqual(["zz"]);
    expect(memosOf({})).toEqual([]);
  });

  it("sanitizes a stored deposit configuration", () => {
    expect(
      sanitizeDepositConfig({ acceptedIssuers: { usd: ["rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", "nope"], "bad code!": ["x"] }, denylist: ["x", "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"], travelRuleXrp: -3 })
    ).toEqual({ acceptedIssuers: { USD: ["rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"] }, denylist: ["rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"], requireTag: true, travelRuleXrp: 0, trustedCounterparties: [] });
  });

  it("finds an address that imitates a known one at both ends, and nothing else", () => {
    const bitstamp = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
    // Same first five and last four characters, different account.
    const imitation = "rvYAfK8pQeW2mTzN4sHuXcJbLdR3s59B";
    expect(lookalikeOf(imitation, [bitstamp])).toBe(bitstamp);
    expect(lookalikeOf(bitstamp, [bitstamp])).toBeNull();
    expect(lookalikeOf("rfWPjcbY5QT2shRFY2SSQHFKPYSMzxaMaN", [bitstamp])).toBeNull();
  });
});

describe("sanctions and address poisoning", () => {
  // The one XRP address on the OFAC SDN list as read from treasury.gov
  // (sdn_comments.csv, entry 33854), as noshashi.sanctioned_addresses holds it.
  const CHATEX = {
    address: "rnXyVQzgxZe7TR1EPzTkGj2jxH4LMJYh66",
    list: "OFAC SDN",
    entityNumber: 33854,
    entityName: "CHATEX",
    program: "CYBER2",
    sourceUrl: "https://www.treasury.gov/ofac/downloads/sdn_comments.csv",
  };
  const [event] = classifyCase(cases.phishingDust);
  const sender = "rfWPjcbY5QT2shRFY2SSQHFKPYSMzxaMaN";

  it("holds a deposit whose funder is on the SDN list, and credits nothing", () => {
    const chain = [
      { account: sender, fundedBy: CHATEX.address, activatedLedger: 104503131 },
      { account: CHATEX.address, fundedBy: null, activatedLedger: null },
    ];
    const result = screenDeposit({ event, config: { ...CONFIG, requireTag: false }, issuer: null, chain, currentLedger: cases.readAtLedger, sanctions: { [CHATEX.address]: CHATEX } });
    expect(result.verdict).toBe("hold");
    expect(result.credit).toBeNull();
    const hit = result.findings.find((f) => f.id === "sanctioned_hop_1");
    expect(hit).toMatchObject({ severity: "critical", title: "Funded 1 hop back by an address on the OFAC SDN list: CHATEX" });
    expect(hit?.detail).toContain("entry 33854, program CYBER2");
    expect(hit?.detail).toContain("treasury.gov");
  });

  it("flags a dust sender imitating one of the organization's addresses as address poisoning", () => {
    const imitated = sender.slice(0, 5) + "Kq8pZ2mTzN4sHuXcJbLdR3s" + sender.slice(-4);
    const result = screenDeposit({ event, config: { ...CONFIG, requireTag: false, trustedCounterparties: [imitated] }, issuer: null, chain: [], currentLedger: cases.readAtLedger });
    expect(result.findings.find((f) => f.id === "address_poisoning")).toMatchObject({ severity: "critical" });
    expect(result.verdict).toBe("hold");
  });

  it("says nothing about sanctions or poisoning when neither applies", () => {
    const result = screenDeposit({ event, config: { ...CONFIG, requireTag: false }, issuer: null, chain: [], currentLedger: cases.readAtLedger, sanctions: {} });
    expect(result.findings.some((f) => f.id.startsWith("sanctioned_") || f.id === "address_poisoning")).toBe(false);
  });
});
