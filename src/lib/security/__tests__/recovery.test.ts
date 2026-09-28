import { describe, expect, it } from "vitest";
import { encode } from "ripple-binary-codec";
import fx from "./recovery.mainnet.json";
import hardening from "./hardening.mainnet.json";
import { readHoldings, type Holdings, type HoldingsReader } from "../objects";
import { recoveryFrom, resolveEscrowSequences } from "../recovery";
import { exposureFrom } from "../exposure";
import { inventoryFrom, priceInventory } from "../inventory";
import { diagnoseDeposit, taggedShareOf } from "../depositHelp";
import { explainSigningRequest, explainTransaction, parseTransaction } from "../signInspect";
import { linksOf, mapCluster, type ClusterReader } from "../cluster";
import { guardianAlertsFor } from "../guardian";
import { domainVerdict, normalizeDomain, tomlAccounts } from "../../../../supabase/functions/_shared/xrplEvents.ts";

/*
 * The recovery and analysis tools on recorded XRPL mainnet data (see the
 * fixture's note): Ripple's escrow wallet #03, a DEX trader, an NFT trader
 * with 39 open sell offers, an exchange that requires destination tags, a
 * real tecDST_TAG_NEEDED payment to it, an account that 56 others deleted
 * themselves into, and the xrp-ledger.toml files of ripple.com and
 * xrptoolkit.com as served the same day.
 */

type Json = Record<string, any>;
const RIPPLE_ESCROW = "rB3WNZc45gxzW31zxfXdkx8HusAhoqscPn";
const TRADER = "rBtVeRQ8NWUjco5scoivCQbUe7Lbdbb7Me";
const NFT_TRADER = "rP4pHjuJyaZ9RNVg48mMVRvGSwi7byj4BZ";
const EXCHANGE = "rBpXtXVs5b2HjApREMyrT2zhTCQ2fHwWF5";
const SWEEPER = "r344KxkFu8aBLsH1qjnKztsmzwERn696Zn";
const CLOSE = fx.ledger.ledger.close_time;

const holdings = (address: string, root: Json, objects: Json[], complete = true): Holdings => ({
  address,
  root,
  objects,
  nfts: [],
  ledgerIndex: fx.ledger.ledger.ledger_index,
  closeTime: CLOSE,
  reserveBaseXrp: fx.server_info.info.validated_ledger.reserve_base_xrp,
  reserveIncXrp: fx.server_info.info.validated_ledger.reserve_inc_xrp,
  complete,
});

/** Replays the recorded replies for Ripple's escrow wallet. */
const escrowReader: HoldingsReader = {
  async request(command, params) {
    if (command === "ledger") return fx.ledger;
    if (command === "server_info") return fx.server_info;
    if (command === "account_info" && params.account === RIPPLE_ESCROW) return fx.escrow_info;
    if (command === "account_objects" && params.account === RIPPLE_ESCROW) return { account_objects: fx.escrow_objects };
    if (command === "account_nfts") return { account_nfts: [] };
    if (command === "tx" && params.transaction === fx.escrow_create.hash) return fx.escrow_create;
    throw new Error(`not recorded: ${command} ${JSON.stringify(params)}`);
  },
};

describe("stuck funds and reserve recovery", () => {
  it("reads Ripple's escrow wallet: ten escrows maturing to itself, nothing to sign yet", async () => {
    const h = await readHoldings(RIPPLE_ESCROW, escrowReader);
    expect(h.objects).toHaveLength(10);
    const r = recoveryFrom(h, await resolveEscrowSequences(h, escrowReader));
    expect(r.balanceXrp).toBe(235.360668);
    // Base reserve 1 XRP plus 16 owned objects at 0.2 XRP.
    expect(r.lockedXrp).toBe(4.2);
    expect(r.items.every((i) => i.kind === "escrow_waiting" && i.when === "later")).toBe(true);
    expect(r.laterXrp).toBe(3_300_000_000);
    expect(r.recoverableNowXrp).toBe(0);
    // The soonest matures two and a half days after the ledger read.
    const soonest = r.items.map((i) => i.availableAt!).sort()[0];
    expect(soonest).toBe("2026-10-01T00:00:00.000Z");
    expect(r.deletion.possible).toBe(false);
    expect(r.deletion.blockers[0]).toBe("10 escrows");
  });

  it("finds the EscrowCreate sequence an EscrowFinish must name", async () => {
    const h = await readHoldings(RIPPLE_ESCROW, escrowReader);
    const sequences = await resolveEscrowSequences(h, escrowReader);
    expect(sequences["08E0D69321CDC6E2ED3D20E2DA421505C08952927B4E41E6DA31A0BF9BE07972"]).toBe(45);
  });

  it("lists a DEX trader's empty lines, unused ticket and open orders as reserve it could free", () => {
    const r = recoveryFrom(holdings(TRADER, fx.trader_info.account_data, fx.trader_objects));
    const kinds = r.items.map((i) => i.kind).sort();
    expect(kinds).toEqual(["offer_cancel", "offer_cancel", "offer_cancel", "ticket_use", "trustline_remove", "trustline_remove"]);
    // Nothing is due today: the orders are live and removing the lines is the owner's choice.
    expect(r.recoverableNowXrp).toBe(0);
    expect(r.optionalReserveXrp).toBe(1.2);
    const usdb = r.items.find((i) => i.kind === "trustline_remove" && i.title.includes("USDB"))!;
    // The trader is the high side of that line: the limit it sets names the issuer, the low side.
    expect(usdb.tx).toEqual({ TransactionType: "TrustSet", Account: TRADER, LimitAmount: { currency: "5553444200000000000000000000000000000000", issuer: "rB3y9EPnq1ZrZP3aXgfyfdXQThzdXMrLMc", value: "0" }, Flags: 0x00020000 });
    expect(r.items.find((i) => i.kind === "ticket_use")?.tx).toMatchObject({ TicketSequence: 103436520, Sequence: 0 });
    expect(r.deletion.blockers).toContain("3 trust lines with a balance");
  });

  it("frees an NFT trader's reserve from four buy offers that expired weeks ago", () => {
    const r = recoveryFrom(holdings(NFT_TRADER, fx.nft_info.account_data, fx.nft_objects, false));
    expect(r.items).toHaveLength(39);
    const now = r.items.filter((i) => i.when === "now");
    expect(now).toHaveLength(4);
    expect(now.every((i) => i.kind === "nft_offer_cancel" && i.title.startsWith("Remove an expired NFT buy offer"))).toBe(true);
    expect(r.recoverableNowXrp).toBe(0.8);
    // The 35 live sell offers free their reserve only if the trader withdraws them.
    expect(r.optionalReserveXrp).toBe(7);
    expect(r.complete).toBe(false);
  });
});

describe("exposure audit", () => {
  it("names every live sell offer a stranger can take an NFT through, and none as a giveaway", () => {
    const e = exposureFrom(holdings(NFT_TRADER, fx.nft_info.account_data, fx.nft_objects));
    // 35 sell offers; the four expired buy offers give nobody anything.
    expect(e.exposures).toHaveLength(35);
    expect(e.exposures.every((x) => x.kind === "nft_sell_offer" && x.risk === "medium")).toBe(true);
    expect(e.exposures[0].title).toMatch(/^rpx9JThQ2y37FaGeeJP7PXDUVEXY3PHZSC can take NFT /);
    expect(e.exposures[0].revoke).toMatchObject({ TransactionType: "NFTokenCancelOffer", Account: NFT_TRADER });
    // Trusting the broker lowers its offers to low risk.
    expect(exposureFrom(holdings(NFT_TRADER, fx.nft_info.account_data, fx.nft_objects), ["rpx9JThQ2y37FaGeeJP7PXDUVEXY3PHZSC"]).exposures.every((x) => x.risk === "low")).toBe(true);
  });

  it("lists an exchange's three signers, and its open orders for a trader", () => {
    const ex = exposureFrom(holdings(EXCHANGE, fx.exchange_info.account_data, fx.exchange_objects));
    expect(ex.exposures.map((x) => x.kind)).toEqual(["signer", "signer", "signer"]);
    expect(ex.exposures[0].title).toMatch(/is a signer \(weight 1 of quorum 2\)$/);
    const tr = exposureFrom(holdings(TRADER, fx.trader_info.account_data, fx.trader_objects));
    expect(tr.exposures.map((x) => x.kind)).toEqual(["dex_offer", "dex_offer", "dex_offer"]);
    expect(tr.atRiskXrp).toBe(9.098134);
  });
});

describe("asset inventory", () => {
  it("lists the trader's tokens and orders, and values its RLUSD at the live best bid", async () => {
    const inv = inventoryFrom(holdings(TRADER, fx.trader_info.account_data, fx.trader_objects));
    expect(inv.items.filter((i) => i.kind === "token").map((i) => [i.label, i.amount])).toEqual([
      ["EUROP", 4],
      ["USDC", 8.908228],
      ["RLUSD", 2.674791808739159],
    ]);
    const market: HoldingsReader = {
      async request(command, params) {
        const rlusd = (params.taker_pays as Json | undefined)?.currency === "524C555344000000000000000000000000000000" || (params.asset2 as Json | undefined)?.currency === "524C555344000000000000000000000000000000";
        if (command === "book_offers") return rlusd ? fx.rlusd_book : { offers: [] };
        if (command === "amm_info") {
          if (rlusd) return fx.rlusd_amm;
          throw new Error("actNotFound");
        }
        throw new Error(`not recorded: ${command}`);
      },
    };
    const priced = await priceInventory(inv, market);
    const rlusd = priced.items.find((i) => i.label === "RLUSD")!;
    // The best bid (9.098134 XRP for 13.589702 RLUSD) is just above the AMM pool's spot price.
    expect(rlusd.priceSource).toBe("order_book");
    expect(rlusd.valueXrp).toBeCloseTo(2.674791808739159 * (9.098134 / 13.589702), 5);
    expect(9.098134 / 13.589702).toBeGreaterThan(1609228.046184 / 2405003.610648497);
    // Nobody bids XRP for the others in this recording.
    expect(priced.items.find((i) => i.label === "USDC")?.valueXrp).toBe(0);
    expect(priced.priced).toBe(true);
  });
});

describe("wrong-deposit helper", () => {
  it("explains a real tecDST_TAG_NEEDED: nothing but the fee was spent", async () => {
    const d = await diagnoseDeposit(fx.dst_tag_tx.hash, { tx: fx.dst_tag_tx, destination: fx.exchange_info });
    expect(d.outcome).toBe("failed_nothing_lost");
    expect(d.headline).toBe("The payment failed. Your funds never left your account.");
    expect(d.explanation).toContain("requires a destination tag and none was given");
    expect(d.facts.feeXrp).toBe(0.000012);
    expect(d.steps[0]).toMatch(/destination tag/);
  });

  it("reads the exchange as custodial from its flag and from its tagged deposits", () => {
    expect(taggedShareOf(EXCHANGE, fx.exchange_tx)).toBe(1);
    expect(fx.exchange_info.account_data.Flags & 0x00020000).toBeTruthy();
  });

  it("writes the letter for a real deposit when the customer's tag was a different one", async () => {
    const row = fx.exchange_tx.find((r: Json) => r.tx.TransactionType === "Payment" && r.tx.Destination === EXCHANGE && typeof r.tx.DestinationTag === "number")!;
    const reply = { ...row.tx, meta: row.meta, ledger_index: row.ledger_index, validated: true };
    const d = await diagnoseDeposit(row.tx.hash, { tx: reply, destination: fx.exchange_info, expectedTag: row.tx.DestinationTag + 1, taggedShare: 1 }, { generatedAt: "2026-09-28T17:00:00.000Z" });
    expect(d.outcome).toBe("delivered_tag_custodial");
    expect(d.letter?.text).toContain(`Transaction hash: ${row.tx.hash}`);
    expect(d.letter?.text).toContain(`Destination tag used: ${row.tx.DestinationTag}`);
    expect(d.letter?.sha256).toMatch(/^[0-9A-F]{64}$/);
    // With the right tag there is nothing to write.
    const ok = await diagnoseDeposit(row.tx.hash, { tx: reply, destination: fx.exchange_info, expectedTag: row.tx.DestinationTag, taggedShare: 1 });
    expect(ok.outcome).toBe("delivered");
    expect(ok.letter).toBeUndefined();
  });
});

describe("pre-sign explainer", () => {
  it("decodes a real transaction's blob to the same transaction and explains it", async () => {
    const { meta: _meta, hash: _hash, ctid: _ctid, date: _date, ledger_index: _l, inLedger: _i, validated: _v, status: _s, DeliverMax, ...rest } = fx.dst_tag_tx as Json;
    // What was signed carried Amount; API v2 replies call it DeliverMax.
    const tx = { ...rest, Amount: rest.Amount ?? DeliverMax };
    const blob = encode(tx);
    const fromBlob = await explainSigningRequest(blob);
    expect(fromBlob.format).toBe("blob");
    expect(fromBlob.tx.Destination).toBe(EXCHANGE);
    expect(fromBlob.summary[0]).toBe(`Sends 0.00001 XRP from rEni1epjkJfVXMmMaDDWuz3hFe1mYnqfsk to ${EXCHANGE}.`);
    expect(fromBlob.verdict).toBe("SAFE-LOOKING");
    expect((await explainSigningRequest(JSON.stringify(tx))).summary).toEqual(fromBlob.summary);
  });

  it("warns on the real master-key disable, and refuses a key handed to someone else", () => {
    const disable = hardening.multisig_account_tx_back[0].tx;
    const e = explainTransaction(disable, "json");
    expect(e.flags.map((f) => f.id)).toContain("disable-master");
    expect(e.verdict).toBe("CAREFUL");
    // The same account's real signer list, presented for signing: it hands over control.
    const signers = explainTransaction(hardening.multisig_account_tx_back[2].tx, "json");
    expect(signers.verdict).toBe("DO NOT SIGN");
    expect(signers.summary[0]).toMatch(/^Lets 3 signers sign for rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX together \(quorum 2\)/);
  });

  it("refuses what is not a transaction", async () => {
    await expect(parseTransaction("sEdSomethingThatIsASeed")).rejects.toThrow(/Not JSON and not a hex blob/);
    await expect(parseTransaction('{"hello":1}')).rejects.toThrow(/no TransactionType/);
  });
});

describe("domain check", () => {
  it("reads the accounts ripple.com and xrptoolkit.com vouch for", () => {
    const ripple = tomlAccounts(fx.toml_ripple_com);
    expect(ripple).toHaveLength(20);
    expect(ripple).toContain(RIPPLE_ESCROW);
    // Issuers and validators are not accounts the domain claims as its own.
    expect(ripple).not.toContain("rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De");
    expect(tomlAccounts(fx.toml_xrptoolkit_com)).toEqual(["rTooLkitCksh5mQa67eaa2JaWHDBnHkpy"]);
  });

  it("verifies XRP Toolkit's account, whose Domain names the site that lists it", () => {
    const domain = Buffer.from(fx.toolkit_info.account_data.Domain, "hex").toString();
    expect(domain).toBe("xrptoolkit.com");
    expect(domainVerdict("rTooLkitCksh5mQa67eaa2JaWHDBnHkpy", normalizeDomain(domain), { text: fx.toml_xrptoolkit_com }).status).toBe("verified");
    // Anyone else writing xrptoolkit.com into their Domain is not listed.
    expect(domainVerdict(RIPPLE_ESCROW, "xrptoolkit.com", { text: fx.toml_xrptoolkit_com }).status).toBe("unverified");
    // Ripple's escrow wallet claims no domain at all, though ripple.com lists it.
    expect(fx.escrow_info.account_data).not.toHaveProperty("Domain");
  });

  it("does not read a site's HTML home page as a TOML file", () => {
    const v = domainVerdict(null, "gatehub.net", { text: fx.gatehub_net_toml_reply_start });
    expect(v.status).toBe("no_toml");
    expect(v.detail).toContain("web page");
  });

  it("only ever names a public hostname", () => {
    expect(normalizeDomain("https://www.XRPToolkit.com/path")).toBe("www.xrptoolkit.com");
    for (const bad of ["localhost", "127.0.0.1", "169.254.169.254", "intranet.internal", "printer.local", "no-dot"]) expect(normalizeDomain(bad)).toBeNull();
  });
});

describe("scam cluster mapper", () => {
  const recorded: ClusterReader = {
    async accountTx(account, forward) {
      if (account === SWEEPER) return { transactions: forward ? fx.sweeper_tx_oldest : fx.sweeper_tx_newest };
      if (account === "rL2mDm6wGTbWnULK6TJirFQJR2ytkavSiN") return { transactions: fx.swept_first_rL2m };
      if (account === "rsu9FUc3i2Di7KHGcmWMvRZUeHsK5dwneU") return { transactions: fx.swept_first_rsu9 };
      throw new Error(`not recorded: ${account}`);
    },
    async accountInfo(account) {
      if (account === SWEEPER) return fx.sweeper_info;
      if (account === "rL2mDm6wGTbWnULK6TJirFQJR2ytkavSiN" || account === "rsu9FUc3i2Di7KHGcmWMvRZUeHsK5dwneU") return null;
      // Every account that swept itself into it was deleted.
      if (fx.sweeper_tx_newest.some((r: Json) => r.tx.TransactionType === "AccountDelete" && r.tx.Account === account)) return null;
      throw new Error(`not recorded: ${account}`);
    },
    async sanctions() {
      return {};
    },
  };

  it("reads who created an account and who deleted themselves into it", () => {
    const found = linksOf(SWEEPER, [...fx.sweeper_tx_oldest, ...fx.sweeper_tx_newest]);
    expect(found.links.filter((l) => l.kind === "funded")).toEqual([
      expect.objectContaining({ from: "rHroT9qGY6bYLFo2zLW2tkHLTwMp3dY174", to: SWEEPER, xrp: 4.9925 }),
    ]);
    const swept = found.links.filter((l) => l.kind === "swept");
    // 56 in the newest page, plus its creator sweeping 946,672 XRP in on the way out.
    expect(swept).toHaveLength(57);
    expect(swept.find((l) => l.from === "rHroT9qGY6bYLFo2zLW2tkHLTwMp3dY174")?.xrp).toBe(946672.617141);
  });

  it("maps the operation from the sweeper, and caps it at the plan's account limit", async () => {
    const c = await mapCluster(SWEEPER, { depth: 2, maxAccounts: 40, reader: recorded });
    expect(c.nodes).toHaveLength(40);
    expect(c.capped).toBe(true);
    expect(c.nodes[0]).toMatchObject({ address: SWEEPER, balanceXrp: 874582.520313 });
    expect(c.nodes.find((n) => n.address === "rHroT9qGY6bYLFo2zLW2tkHLTwMp3dY174")?.depth).toBe(1);
  });

  it("from one swept account, finds who funded it and the sweeper it deleted itself into", async () => {
    const c = await mapCluster("rL2mDm6wGTbWnULK6TJirFQJR2ytkavSiN", { depth: 2, maxAccounts: 200, reader: recorded });
    expect(c.nodes[0]).toMatchObject({ address: "rL2mDm6wGTbWnULK6TJirFQJR2ytkavSiN", exists: false });
    expect(c.links).toContainEqual(expect.objectContaining({ kind: "funded", from: "rs8JaMBBjg61Bj8mC4bjdmQEeCMGqhzcCA", to: "rL2mDm6wGTbWnULK6TJirFQJR2ytkavSiN", xrp: 10 }));
    expect(c.links).toContainEqual(expect.objectContaining({ kind: "swept", from: "rL2mDm6wGTbWnULK6TJirFQJR2ytkavSiN", to: SWEEPER }));
    expect(c.nodes.find((n) => n.address === SWEEPER)).toMatchObject({ depth: 1, balanceXrp: 874582.520313 });
    // Through the sweeper, the accounts that deleted themselves into it (hop 2) and its creator.
    expect(c.nodes.filter((n) => n.depth === 2).length).toBeGreaterThan(50);
    expect(c.nodes.some((n) => n.address === "rHroT9qGY6bYLFo2zLW2tkHLTwMp3dY174")).toBe(true);
    expect(c.capped).toBe(false);
  });
});

describe("Personal Guardian", () => {
  it("alerts on the real master-key disable and signer list, and on nothing in a quiet history", () => {
    const rows = [...hardening.multisig_account_tx_back].reverse();
    const alerts = guardianAlertsFor("rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX", rows, 1000);
    expect(alerts.map((a) => a.kind)).toEqual(["keys_changed", "master_key"]);
    expect(alerts.every((a) => a.severity === "critical")).toBe(true);
    expect(alerts[1].title).toBe("Your master key was disabled");
  });

  it("alerts on a real phishing lure, a large outflow at the owner's threshold, and the deletion", () => {
    const rows = fx.swept_first_rL2m;
    const alerts = guardianAlertsFor("rL2mDm6wGTbWnULK6TJirFQJR2ytkavSiN", rows, 5);
    expect(alerts.map((a) => a.kind)).toEqual(["large_outflow", "phishing_lure", "account_deleted"]);
    // 10 drops from ra4oM7… with the memo "Fees (https://scwsystem.com)".
    expect(alerts[1].detail).toContain("ra4oM7sVAcdic5ztHihTp9KFAEWY3C2Mfp");
    expect(guardianAlertsFor("rL2mDm6wGTbWnULK6TJirFQJR2ytkavSiN", rows, 1000).map((a) => a.kind)).toEqual(["phishing_lure", "account_deleted"]);
  });
});
