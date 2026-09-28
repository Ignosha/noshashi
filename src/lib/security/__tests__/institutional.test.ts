import { describe, expect, it } from "vitest";
import fx from "./recovery.mainnet.json";
import inst from "./institutional.mainnet.json";
import relay from "./phishing-relay.mainnet.json";
import hardening from "./hardening.mainnet.json";
import type { Holdings } from "../objects";
import { emergencyKit } from "../emergency";
import { drainerPatterns } from "../drainer";
import { attributeFrom } from "../attribution";
import { fillsOf, surveil } from "../surveillance";
import { activationOf, screenWithdrawal, type ThreatEntry } from "../../../../supabase/functions/_shared/xrplEvents.ts";

/*
 * The institutional tools on recorded XRPL mainnet data: the emergency kit
 * for a DEX trader, an NFT trader and an exchange; drainer patterns in a
 * real phishing relay's history; attribution of an exchange, a domain-
 * claiming account and a token issuer; order-book surveillance of the EUROP
 * and RLUSD issuers' histories; and withdrawal screening against a real
 * exchange, a deleted account and a real relay.
 */

type Json = Record<string, any>;
const TRADER = "rBtVeRQ8NWUjco5scoivCQbUe7Lbdbb7Me";
const NFT_TRADER = "rP4pHjuJyaZ9RNVg48mMVRvGSwi7byj4BZ";
const EXCHANGE = "rBpXtXVs5b2HjApREMyrT2zhTCQ2fHwWF5";
const SWEEPER = "r344KxkFu8aBLsH1qjnKztsmzwERn696Zn";
const TOOLKIT = "rTooLkitCksh5mQa67eaa2JaWHDBnHkpy";
const RELAY = { first: "rfWPjcbY5QT2shRFY2SSQHFKPYSMzxaMaN", second: "rDS6r59hQ3X95a2jeguAdTRMvC3b5xaMan", third: "r3LQQNg7hEdbbNK3w4ykfLRDQWAc7xAmAn" };
const MAKER = "rURtT5MMFzSUR54MAq9MKfzBoezTBZbKns";

const holdings = (address: string, root: Json, objects: Json[], complete = true): Holdings => ({
  address,
  root,
  objects,
  nfts: [],
  ledgerIndex: fx.ledger.ledger.ledger_index,
  closeTime: fx.ledger.ledger.close_time,
  reserveBaseXrp: fx.server_info.info.validated_ledger.reserve_base_xrp,
  reserveIncXrp: fx.server_info.info.validated_ledger.reserve_inc_xrp,
  complete,
});

describe("emergency kit", () => {
  it("moves the DEX trader's three tokens and spendable XRP out before cancelling its orders and changing the key", () => {
    const kit = emergencyKit(holdings(TRADER, fx.trader_info.account_data, fx.trader_objects), { cold: TOOLKIT });
    expect(kit.sweepsEverything).toBe(false);
    expect(kit.steps.map((s) => s.id.split("-")[0])).toEqual(["token", "token", "token", "sweep", "offer", "offer", "offer", "rotate"]);
    expect(kit.steps.slice(0, 3).map((s) => s.title)).toEqual([
      `Send the 4 EUROP to ${TOOLKIT}`,
      `Send the 8.908228 USDC to ${TOOLKIT}`,
      `Send the 2.674792 RLUSD to ${TOOLKIT}`,
    ]);
    const sweep = kit.steps[3];
    expect(sweep.why).toContain("3 trust lines with a balance");
    // 24.085382 XRP less 1 XRP base and 9 objects at 0.2, less the eight steps' fees.
    expect(sweep.tx.Amount).toBe(String(21_285_382 - 8 * 5_000));
    expect(kit.steps.every((s) => s.tx.Account === TRADER && s.tx.Fee === "5000")).toBe(true);
    expect(kit.tickets).toBeNull();
  });

  it("on tickets, leaves the reserve of the tickets still unused when the XRP payment lands", () => {
    const kit = emergencyKit(holdings(TRADER, fx.trader_info.account_data, fx.trader_objects), { cold: TOOLKIT, useTickets: true, feeDrops: 12 });
    expect(kit.tickets).toEqual({ TransactionType: "TicketCreate", Account: TRADER, TicketCount: 8, Fee: "12" });
    expect(kit.steps.every((s) => s.tx.Sequence === 0 && /^<ticket \d from the TicketCreate>$/.test(s.tx.TicketSequence))).toBe(true);
    // Step 4 of 8: tickets 4 to 8 still exist when it lands, 0.2 XRP each; nine fees of 12 drops.
    expect(kit.steps[3].tx.Amount).toBe(String(21_285_382 - 9 * 12 - 5 * 200_000));
  });

  it("cancels the NFT trader's 35 sell offers first, and does not gamble on AccountDelete with objects it did not read", () => {
    // The recorded read of this account took only its NFT offers; its 2,563 owned objects include NFT pages.
    const kit = emergencyKit(holdings(NFT_TRADER, fx.nft_info.account_data, fx.nft_objects, false), { cold: TOOLKIT, newRegularKey: TOOLKIT });
    expect(kit.steps[0]).toMatchObject({ id: "nft-offers-0", title: "Cancel 35 NFT sell offers", tx: { TransactionType: "NFTokenCancelOffer" } });
    expect(kit.steps[0].tx.NFTokenOffers).toHaveLength(35);
    expect(kit.sweepsEverything).toBe(false);
    expect(kit.steps.some((s) => s.tx.TransactionType === "AccountDelete")).toBe(false);
    expect(kit.steps.map((s) => s.id).slice(-2)).toEqual(["rotate", "disable-master"]);
    expect(kit.steps[kit.steps.length - 1].tx).toMatchObject({ TransactionType: "AccountSet", SetFlag: 4 });
  });

  it("sweeps an account with no blockers in one AccountDelete, paying the owner-reserve fee", () => {
    const kit = emergencyKit(holdings(SWEEPER, fx.sweeper_info.account_data, []), { cold: TOOLKIT });
    expect(kit.sweepsEverything).toBe(true);
    expect(kit.steps).toHaveLength(1);
    expect(kit.steps[0].tx).toEqual({ TransactionType: "AccountDelete", Account: SWEEPER, Destination: TOOLKIT, Fee: "200000" });
    expect(kit.steps[0].why).toContain("874,582.52 XRP");
  });

  it("refuses a cold account that is the compromised one", () => {
    expect(() => emergencyKit(holdings(TRADER, fx.trader_info.account_data, fx.trader_objects), { cold: TRADER })).toThrow(/different account/);
  });
});

describe("drainer patterns", () => {
  it("recognises the relay that sprayed 1-drop payments at 99 accounts, then deleted itself into the next account", () => {
    const patterns = drainerPatterns(RELAY.second, relay.rDS6_forward_104503719);
    expect(patterns).toHaveLength(1);
    const [p] = patterns;
    expect(p.id).toBe("spray_then_sweep");
    // A hundredth bounced with tecDST_TAG_NEEDED and does not count.
    expect(p.title).toBe(`99 dust payments to 99 accounts, then the account deleted itself into ${RELAY.third}`);
    expect(p.fromLedger).toBe(104503728);
    expect(p.toLedger).toBe(104504301);
    expect(p.evidence).toHaveLength(3);
  });

  it("does not call five dust payments a spray", () => {
    expect(drainerPatterns(RELAY.first, relay.rfWP_forward_104503690)).toEqual([]);
  });

  it("does not call a signer list followed by a small payment a drain", () => {
    const multisig = hardening.multisig_account_info.account_data.Account;
    expect(hardening.multisig_account_tx_back.map((r: Json) => (r.tx_json ?? r.tx).TransactionType)).toContain("SignerListSet");
    expect(drainerPatterns(multisig, hardening.multisig_account_tx_back)).toEqual([]);
  });

  it("finds nothing in the history of the account 56 others deleted themselves into", () => {
    expect(drainerPatterns(SWEEPER, [...fx.sweeper_tx_newest, ...fx.sweeper_tx_oldest])).toEqual([]);
  });
});

describe("exchange attribution", () => {
  it("reads the exchange as a custodial service by behaviour: it requires tags, and every deposit read carried one", () => {
    const a = attributeFrom(EXCHANGE, fx.exchange_info, fx.exchange_tx, null);
    expect(a).toMatchObject({ kind: "custodial_service", confidence: "behaviour", name: null });
    expect(a.evidence).toEqual(["It requires a destination tag on every incoming payment.", "100% of the incoming payments read carried a destination tag."]);
  });

  it("names the toolkit's domain as verified only when the domain check verified it", () => {
    const verified = attributeFrom(TOOLKIT, fx.toolkit_info, [], { status: "verified", domain: "xrptoolkit.com", detail: "xrptoolkit.com lists this account in its xrp-ledger.toml." } as never);
    expect(verified).toMatchObject({ name: "xrptoolkit.com", confidence: "verified" });
    const unchecked = attributeFrom(TOOLKIT, fx.toolkit_info, [], null);
    expect(unchecked).toMatchObject({ name: "xrptoolkit.com", confidence: "claimed" });
    expect(unchecked.advice).toContain("never through a link found on the ledger");
  });

  it("reads the USDB issuer as an issuer claiming its Brazilian domain", () => {
    const obligations = Object.values(inst.usdb_gateway.obligations as Record<string, string>).reduce((n, v) => n + Number(v), 0);
    const a = attributeFrom(inst.usdb_info.account_data.Account, inst.usdb_info, [], null, obligations);
    expect(a).toMatchObject({ kind: "issuer", name: "tokens.brazacripto.com.br", confidence: "claimed" });
  });

  it("says so when the account has been deleted", () => {
    expect(attributeFrom(RELAY.first, null, [], null)).toMatchObject({ kind: "not_found", confidence: "none" });
  });
});

describe("market surveillance", () => {
  it("finds one account re-quoting EUROP 171 times with nothing filled, and supplying all the order activity", () => {
    const r = surveil("rMkEuRii9w9uBMQDnWV5AA43gvYZR9JxVK", inst.europ_tx);
    expect(r.transactions).toBe(200);
    expect(r.ledgers).toEqual({ from: 107297925, to: 107298261 });
    expect(r.traders[0]).toEqual({ account: MAKER, placed: 171, replaced: 142, cancelled: 29, filledAsMaker: 0, tookAsTaker: 0 });
    expect(r.fills).toEqual([]);
    expect(r.findings.map((f) => f.id)).toEqual([`quote-churn-${MAKER}`, "concentration"]);
    expect(r.findings[1].title).toBe("One account supplied 100% of the order activity");
  });

  it("finds the one RLUSD trade in the history read, and no manipulation indicators", () => {
    const r = surveil("rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", inst.rlusd_tx);
    expect(r.fills).toEqual([{ hash: "0750EC467F09451CB84EF49B511A717550B3751D0C883FEA7827248812B9F8DA", ledger: 107298301, taker: "rai4ovpdYhkdSNMNgX9hJkBRMwXf7nkyTJ", maker: "rH7HTzEYV497didW1A7CYhP7Nz3TZ2ovzR" }]);
    expect(r.findings.map((f) => f.id)).toEqual(["nothing"]);
  });

  it("flags the trade when both sides were funded by the same account", () => {
    const [fill] = inst.rlusd_tx.flatMap((row) => fillsOf(row));
    const funder = inst.rurt_first[0].tx.Account;
    const r = surveil("rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", inst.rlusd_tx, { [fill.maker]: funder, [fill.taker]: funder });
    expect(r.findings.find((f) => f.id === "self-cluster-trades")?.accounts.sort()).toEqual([fill.maker, fill.taker].sort());
  });

  it("does not count a cancelled order as a trade", () => {
    const cancels = inst.europ_tx.filter((row) => row.tx.TransactionType === "OfferCancel");
    expect(cancels.length).toBe(29);
    expect(cancels.flatMap((row) => fillsOf(row))).toEqual([]);
  });
});

describe("withdrawal screening", () => {
  const base = { currentLedger: fx.exchange_info.ledger_index, reserveBaseXrp: 1 };

  it("holds a withdrawal to the exchange without a tag: it would bounce with tecDST_TAG_NEEDED", () => {
    const r = screenWithdrawal({ ...base, destination: EXCHANGE, destinationTag: null, amountXrp: 50, destinationInfo: fx.exchange_info, chain: [] });
    expect(r.verdict).toBe("hold");
    expect(r.findings.map((f) => f.id)).toEqual(["will_fail_tag"]);
  });

  it("clears the same withdrawal with a tag, and notes a first withdrawal to a new destination", () => {
    const r = screenWithdrawal({ ...base, destination: EXCHANGE, destinationTag: 1, amountXrp: 50, destinationInfo: fx.exchange_info, chain: [], previousDestinations: [TOOLKIT] });
    expect(r.verdict).toBe("clear");
    expect(r.findings.map((f) => f.id)).toEqual(["first_withdrawal_here"]);
  });

  it("holds 0.5 XRP to a deleted account: below the reserve it cannot be recreated", () => {
    const r = screenWithdrawal({ ...base, destination: RELAY.first, destinationTag: null, amountXrp: 0.5, destinationInfo: null, chain: [] });
    expect(r).toMatchObject({ verdict: "hold", findings: [{ id: "will_fail_reserve" }] });
  });

  it("holds a withdrawal to a relay the scam registry confirmed", () => {
    const entry: ThreatEntry = { address: RELAY.second, reports: 1, categories: ["phishing"], firstConfirmed: "2026-09-28T00:00:00Z" };
    const r = screenWithdrawal({ ...base, destination: RELAY.second, destinationTag: null, amountXrp: 25, destinationInfo: null, chain: [{ account: RELAY.second, fundedBy: RELAY.first, activatedLedger: 104503719 }], threats: { [RELAY.second]: entry } });
    expect(r.verdict).toBe("hold");
    expect(r.findings.map((f) => f.id)).toEqual(["new_destination_account", "reported_hop_0"]);
  });

  it("reads the market maker's account, created 1.48 million ledgers earlier, as not fresh", () => {
    const hop = activationOf(MAKER, inst.rurt_first[0]);
    expect(hop).toMatchObject({ account: MAKER, fundedBy: "rBuZfn1m4tA6znziHsRp9AyC1M3qg6rgbF", activatedLedger: 105817757 });
    const r = screenWithdrawal({ destination: MAKER, destinationTag: null, amountXrp: 10, destinationInfo: inst.rurt_info, chain: [hop], currentLedger: inst.usdb_lines_ledger, reserveBaseXrp: 1 });
    expect(r).toEqual({ verdict: "clear", findings: [] });
    const young = screenWithdrawal({ destination: MAKER, destinationTag: null, amountXrp: 10, destinationInfo: inst.rurt_info, chain: [hop], currentLedger: 105817757 + 900, reserveBaseXrp: 1 });
    expect(young.findings.map((f) => f.id)).toEqual(["fresh_destination"]);
    expect(young.findings[0].title).toBe("The destination is about 1 hour old");
  });

  it("marks an internal transfer", () => {
    const r = screenWithdrawal({ ...base, destination: EXCHANGE, destinationTag: 7, amountXrp: 50, destinationInfo: fx.exchange_info, chain: [], ownAddresses: [EXCHANGE] });
    expect(r.findings.map((f) => f.id)).toEqual(["own_address"]);
  });
});
