import { describe, it, expect } from "vitest";
import mainnet from "@/lib/desk/__tests__/fixtures/xrpl-mainnet-107193471.json";
import { parseLedgerClose, LEDGER_SERVERS } from "../ledgerStream";
import { ledgerRingStrength } from "../field";
import { readFileSync } from "node:fs";

describe("the landing pond is driven by ledger closes", () => {
  it("reads a ledgerClosed stream message and nothing else", () => {
    // The shape rippled sends on the ledger stream, at the recorded ledger.
    const message = JSON.stringify({ type: "ledgerClosed", ledger_index: mainnet.server_info.info.validated_ledger.seq, txn_count: 57, fee_base: 10 });
    expect(parseLedgerClose(message)).toEqual({ index: 107193471, txnCount: 57 });
    expect(parseLedgerClose(JSON.stringify({ type: "transaction" }))).toBeNull();
    expect(parseLedgerClose(JSON.stringify({ result: { ledger_index: 1 }, status: "success" }))).toBeNull();
    expect(parseLedgerClose("not json")).toBeNull();
  });

  it("a busier ledger rings harder, an empty one still rings faintly, and none rings past full strength", () => {
    expect(ledgerRingStrength(0)).toBe(0.3);
    expect(ledgerRingStrength(20)).toBeLessThan(ledgerRingStrength(200));
    expect(ledgerRingStrength(400)).toBe(1);
    expect(ledgerRingStrength(5000)).toBe(1);
    expect(ledgerRingStrength(Number.NaN)).toBe(0.3);
  });

  it("connects only to servers the website's content security policy allows, the same ones the app reads", () => {
    const csp = readFileSync("vercel.json", "utf8");
    const link = readFileSync("src/lib/xrpl/link.ts", "utf8");
    for (const server of LEDGER_SERVERS) {
      expect(csp, server).toContain(server);
      expect(link, server).toContain(`"${server}"`);
    }
  });
});
