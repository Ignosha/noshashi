import { describe, expect, it } from "vitest";
import fixture from "./hardening.mainnet.json";
import { assessSecurity, postureFrom, readSecurityPosture } from "../hardening";
import {
  compareControls,
  controlSnapshot,
  signingResilience,
} from "../controls";
import { outflowOf, traceFunds, type TraceReader } from "../incident";
import { minimumSigners } from "../quorum";
import tools from "../tools.json";
import { PLANS, FEATURE_CATALOG } from "@/lib/billing/catalog";
const address = fixture.multisig_account_info.account_data.Account;
const posture = () =>
  postureFrom(address, fixture.multisig_account_info, [], true);
describe("signing-path resilience", () => {
  it("does not mistake a master or regular key for enforced quorum", () => {
    const p = posture();
    p.masterEnabled = true;
    p.regularKey = fixture.bitstamp_account_info.account_data.RegularKey;
    expect(signingResilience(p, []).directPaths).toBe(2);
    expect(
      assessSecurity(p).findings.some(
        (f) => f.id === "regular-key-bypasses-quorum",
      ),
    ).toBe(true);
  });
  it("shows when unavailable signer weights destroy quorum", () => {
    const p = posture();
    expect(
      signingResilience(p, [p.signerList!.signers[0].account]).quorumReachable,
    ).toBe(true);
    expect(
      signingResilience(
        p,
        p.signerList!.signers.slice(0, 2).map((s) => s.account),
      ),
    ).toMatchObject({ quorumReachable: false, alternative: false });
  });
  it("counts weighted addresses rather than people", () => {
    expect(
      minimumSigners([{ weight: 8 }, { weight: 1 }, { weight: 1 }], 8),
    ).toBe(1);
    expect(minimumSigners([{ weight: 1 }], 2)).toBe(Infinity);
    expect(minimumSigners([{ weight: 0 }], 0)).toBe(Infinity);
  });
  it("rejects non-validated or incomplete account reads", async () => {
    await expect(
      readSecurityPosture(address, 200, async () => ({
        ...fixture.multisig_account_info,
        validated: false,
      })),
    ).rejects.toThrow("not validated");
    await expect(
      readSecurityPosture(address, 200, async () => ({
        validated: true,
        ledger_index: 10,
      })),
    ).rejects.toThrow("incomplete");
  });
  it("keeps unavailable history unknown while preserving real controls", async () => {
    const p = await readSecurityPosture(address, 200, async (command) => {
      if (command === "account_info") return fixture.multisig_account_info;
      throw Error("history unavailable");
    });
    expect(p).toMatchObject({
      historyAvailable: false,
      historyComplete: false,
      historyRead: 0,
    });
    expect(
      assessSecurity(p).findings.find((f) => f.id === "history-incomplete")
        ?.title,
    ).toContain("unavailable");
  });
});
describe("control references", () => {
  it("records changed keys and rejects cross-account or older comparisons", () => {
    const a = controlSnapshot(posture());
    const b = {
      ...a,
      ledgerIndex: a.ledgerIndex + 1,
      regularKey: fixture.bitstamp_account_info.account_data.RegularKey,
    };
    expect(compareControls(a, b).map((c) => c.field)).toEqual(["regularKey"]);
    expect(() => compareControls(a, { ...b, address: b.regularKey })).toThrow(
      "same account",
    );
    expect(() => compareControls(a, a)).toThrow("newer");
  });
  it("does not call signer ordering a change", () => {
    const a = controlSnapshot(posture());
    expect(
      compareControls(a, {
        ...a,
        ledgerIndex: a.ledgerIndex + 1,
        signers: [...a.signers].reverse(),
      }),
    ).toEqual([]);
  });
  it("fails closed on damaged local references", () => {
    const a = controlSnapshot(posture());
    expect(() =>
      compareControls({ ...a, signers: null } as never, {
        ...a,
        ledgerIndex: a.ledgerIndex + 1,
      }),
    ).toThrow("invalid");
  });
});
describe("incident evidence boundaries", () => {
  it("does not turn unavailable history into an empty successful trace", async () => {
    const reader:TraceReader={accountInfo:async()=>fixture.multisig_account_info,accountTx:async()=>{throw Error("offline");},sanctions:async()=>({})};
    const t=await traceFunds(address,{sinceLedger:1,reader});
    expect(t.nodes[0]).toMatchObject({status:"unread",truncated:true});
  });
  it("stops pagination on an empty page with a continuing marker", async () => {
    let calls=0;const reader:TraceReader={accountInfo:async()=>fixture.multisig_account_info,accountTx:async()=>{calls++;return {transactions:[],marker:"repeat"};},sanctions:async()=>({})};
    const t=await traceFunds(address,{sinceLedger:1,reader});expect(calls).toBe(1);expect(t.nodes[0].truncated).toBe(true);
  });
  it("bounds destination expansion and discloses omitted accounts", async () => {
    const reader:TraceReader={accountInfo:async()=>fixture.multisig_account_info,sanctions:async()=>({}),accountTx:async account=>({transactions:account===address?Array.from({length:50},(_,i)=>({validated:true,ledger_index:2,tx:{Account:address,Destination:`test-destination-${i}`,TransactionType:"Payment",hash:`fixture-${i}`},meta:{TransactionResult:"tesSUCCESS",delivered_amount:"2000000"}})):[]})};
    const t=await traceFunds(address,{sinceLedger:1,reader});expect(t.nodes).toHaveLength(40);expect(t.coverage).toMatchObject({accountLimit:40,omittedAccounts:11});
  });
  it("does not report escrow creation as value delivered to its destination", () => {
    expect(
      outflowOf(address, {
        validated: true,
        ledger_index: 1,
        tx: {
          Account: address,
          Destination: "other",
          TransactionType: "EscrowCreate",
          Amount: "1000000",
        },
        meta: { TransactionResult: "tesSUCCESS" },
      }),
    ).toBe(null);
  });
  it("refuses unvalidated and missing-validation payment rows", () => {
    const row = {
      tx: {
        Account: address,
        Destination: "other",
        TransactionType: "Payment",
      },
      meta: { TransactionResult: "tesSUCCESS", delivered_amount: "1000000" },
    };
    expect(outflowOf(address, row)).toBe(null);
    expect(outflowOf(address, { ...row, validated: false })).toBe(null);
    expect(outflowOf(address, { ...row, validated: true })?.amount.value).toBe(
      1,
    );
  });
});
it("security tool tiers match the existing billing grants", () => {
  for (const t of tools) {
    const plan = PLANS.find((p) => p.id === t.plan)!;
    expect(plan, t.id).toBeTruthy();
    if (t.feature) {
      expect(plan.grants, t.id).toContain(t.feature);
      expect(FEATURE_CATALOG[t.feature]?.requires, t.id).toBe(t.plan);
    }
  }
});
