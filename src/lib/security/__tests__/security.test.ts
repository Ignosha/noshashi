import { describe, expect, it } from "vitest";
import hardening from "./hardening.mainnet.json";
import relay from "./phishing-relay.mainnet.json";
import { assessSecurity, postureFrom } from "../hardening";
import { incidentDossier, outflowOf, recoveryOptions, traceFunds, type TraceReader } from "../incident";

/*
 * Account security and incident response on recorded XRPL mainnet data
 * (see the fixtures' notes): Bitstamp's issuer, a real 2-of-3 multisig
 * account, and a real phishing relay whose accounts pass their balance on
 * by AccountDelete after spraying 1-drop dust.
 */

const MULTISIG = "rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX";
const BITSTAMP = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const RELAY = ["rfWPjcbY5QT2shRFY2SSQHFKPYSMzxaMaN", "rDS6r59hQ3X95a2jeguAdTRMvC3b5xaMan", "r3LQQNg7hEdbbNK3w4ykfLRDQWAc7xAmAn"];
const NEXT = "r3zfz1qTMeDy69NygnNTZaGMe22DVXaMAN";

describe("account hardening", () => {
  it("reads a real 2-of-3 multisig account as well protected, and dates its key changes", () => {
    const p = postureFrom(MULTISIG, hardening.multisig_account_info, hardening.multisig_account_tx_back, true);
    expect(p.masterEnabled).toBe(false);
    expect(p.signerList).toMatchObject({ quorum: 2, minimumSigners: 2 });
    expect(p.events.map((e) => e.kind)).toEqual(["master_disabled", "flag_set", "signer_list_set"]);
    expect(p.events[0].at).toBe("2026-09-23T09:48:01.000Z");

    const a = assessSecurity(p, Date.parse("2026-09-28T00:00:00Z"));
    expect(a.findings.find((f) => f.id === "multisig")).toMatchObject({ severity: "ok", title: "At least 2 of 3 signers must agree" });
    // Changed five days before: flagged so the owner can confirm it was them.
    expect(a.findings.find((f) => f.id === "recent-key-change")?.severity).toBe("warn");
    expect(a.plan.map((s) => s.id)).toEqual(["refuse-12", "refuse-13", "refuse-14"]);
    expect(a.plan[0].tx).toEqual({ TransactionType: "AccountSet", Account: MULTISIG, SetFlag: 12 });

    // A month later the same account has nothing recent to confirm.
    const later = assessSecurity(p, Date.parse("2026-11-01T00:00:00Z"));
    expect(later.findings.some((f) => f.id === "recent-key-change")).toBe(false);
    expect(later.grade).toBe("A");
  });

  it("reads Bitstamp's issuer as one regular key with the master disabled", () => {
    const p = postureFrom(BITSTAMP, hardening.bitstamp_account_info, [], true);
    expect(p.masterEnabled).toBe(false);
    expect(p.regularKey).toBe("rUUs1jns6tdUQwAABDJyHMUHvdGNvNADvJ");
    expect(p.domain).toBe("bitstamp.net");
    const a = assessSecurity(p, Date.parse("2026-09-28T00:00:00Z"));
    expect(a.findings[0]).toMatchObject({ id: "regular-only", severity: "info" });
    expect(a.plan.some((s) => s.tx.TransactionType === "SetRegularKey" || s.tx.SetFlag === 4)).toBe(false);
  });

  it("finds the lookalike senders in a history, and plans keys for a single-key account", () => {
    // The phishing relay's own history, read as if it were a victim's: it paid rDS6… and later
    // received from nobody imitating it, so no poisoning is claimed where there is none.
    const rows = relay.rfWP_forward_104503690;
    const p = postureFrom(RELAY[0], { account_data: { Account: RELAY[0], Balance: "20000000", Flags: 0 }, ledger_index: 104503690 }, rows, true);
    expect(p.poisoning).toEqual([]);
    const a = assessSecurity(p);
    expect(a.findings[0]).toMatchObject({ id: "single-key", severity: "warn" });
    expect(a.plan[0]).toMatchObject({ id: "regular-key", tx: { TransactionType: "SetRegularKey", Account: RELAY[0] } });
    expect(a.plan[1].tx.SignerQuorum).toBe(2);
  });
});

/** Replays the recorded pages; accounts that no longer exist answer actNotFound (null). */
const recorded: TraceReader = {
  async accountTx(account, fromLedger) {
    const key = Object.keys(relay).find((k) => k.startsWith(`${account.slice(0, 4)}_forward_`) || k.startsWith(`${account.slice(0, 5)}_forward_`));
    if (!key) throw new Error(`not recorded: ${account}`);
    const rows = (relay as unknown as Record<string, Array<{ tx: { ledger_index: number } }>>)[key];
    return { transactions: rows.filter((r) => r.tx.ledger_index >= fromLedger) };
  },
  async accountInfo(account) {
    if (RELAY.includes(account)) return null;
    throw new Error(`not recorded: ${account}`);
  },
  async sanctions() {
    return {};
  },
};

describe("tracing stolen value", () => {
  it("reads an AccountDelete sweep as value leaving, with what it delivered", () => {
    const sweep = relay.rfWP_forward_104503690.find((r) => r.tx.TransactionType === "AccountDelete")!;
    expect(outflowOf(RELAY[0], sweep)).toMatchObject({ kind: "account_delete", to: RELAY[1], amount: { currency: "XRP", value: 13.025329 } });
  });

  it("follows the real relay through two sweeps, past the dust, to the next account", async () => {
    const trace = await traceFunds(RELAY[0], { sinceLedger: 104503690, depth: 2, reader: recorded });
    expect(trace.flows.map((f) => [f.from.slice(0, 5), f.to.slice(0, 5), f.kind, f.amount.value])).toEqual([
      ["rfWPj", "rDS6r", "payment", 1],
      ["rfWPj", "rDS6r", "account_delete", 13.025329],
      ["rDS6r", "r3LQQ", "payment", 1],
      ["rDS6r", "r3LQQ", "account_delete", 12.817807],
      ["r3LQQ", "r3zfz", "payment", 1],
      ["r3LQQ", "r3zfz", "account_delete", 12.616497],
    ]);
    // 1-drop payments are counted, not followed.
    expect(trace.dust.count).toBeGreaterThan(200);
    expect(trace.dust.xrp).toBeLessThan(0.001);
    const status = Object.fromEntries(trace.nodes.map((n) => [n.address, n.status]));
    expect(status).toEqual({ [RELAY[0]]: "source", [RELAY[1]]: "deleted", [RELAY[2]]: "deleted", [NEXT]: "not_followed" });
    expect(trace.nodes.find((n) => n.address === RELAY[1])?.receivedXrp).toBeCloseTo(14.025329, 6);
    // The generated vanity series: …xaMan, …xAmAn, …XaMAN.
    expect(trace.vanity).toEqual([{ ending: "aman", accounts: [RELAY[0], RELAY[1], RELAY[2], NEXT] }]);
  });

  it("says plainly that nothing reverses, and writes a dossier anyone can re-hash", async () => {
    const trace = await traceFunds(RELAY[0], { sinceLedger: 104503690, depth: 2, reader: recorded });
    const options = recoveryOptions(trace);
    expect(options[0]).toMatchObject({ id: "finality", outlook: "not_possible" });
    expect(options.find((o) => o.id === "deleted")?.detail).toMatch(/AccountDelete/);
    expect(options.some((o) => o.outlook === "possible" && o.id.startsWith("freeze-"))).toBe(false);

    const dossier = await incidentDossier(trace, options, { generatedAt: "2026-09-28T06:00:00.000Z" });
    expect(dossier.text).toContain("ACCOUNT DELETE rfWPjcbY5QT2shRFY2SSQHFKPYSMzxaMaN -> rDS6r59hQ3X95a2jeguAdTRMvC3b5xaMan: 13.025329 XRP (FDC58FAD77DF1F968A0E2BCA5BE108AFAFFAA16BC75B448306C108F2272BAB23)");
    expect(dossier.text).toContain('4 accounts share the ending "aman"');
    expect(dossier.sha256).toMatch(/^[0-9A-F]{64}$/);
    expect((await incidentDossier(trace, options, { generatedAt: "2026-09-28T06:00:00.000Z" })).sha256).toBe(dossier.sha256);
  });

  it("ends a branch at a tagged deposit and names the freeze request's evidence", async () => {
    // The first material payment, re-addressed with a destination tag: what a thief cashing out at an exchange looks like.
    const rows = relay.rfWP_forward_104503690.map((r) =>
      r.tx.TransactionType === "AccountDelete" ? { ...r, tx: { ...r.tx, DestinationTag: 4242 } } : r
    );
    const reader: TraceReader = { ...recorded, accountTx: async (a, from) => (a === RELAY[0] ? { transactions: rows.filter((r) => r.tx.ledger_index >= from) } : recorded.accountTx(a, from, 400)) };
    const trace = await traceFunds(RELAY[0], { sinceLedger: 104503690, depth: 2, reader });
    const freeze = recoveryOptions(trace).find((o) => o.id === `freeze-${RELAY[1]}`)!;
    expect(freeze.outlook).toBe("possible");
    const tagged = freeze.evidence?.find((e) => e.includes("tag 4242"));
    expect(tagged).toContain("13.025329 XRP");
    expect(tagged).toContain("FDC58FAD77DF1F968A0E2BCA5BE108AFAFFAA16BC75B448306C108F2272BAB23");
    // Nothing is followed past the service: its customers' funds are pooled.
    expect(trace.nodes.map((n) => n.address)).toEqual([RELAY[0], RELAY[1]]);
  });
});
