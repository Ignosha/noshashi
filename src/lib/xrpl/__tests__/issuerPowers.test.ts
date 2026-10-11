import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { alertText, describePowers, diffPowers, DISCORD_WEBHOOK_RE, powersFrom } from "../../../../supabase/functions/_shared/issuerPowers.ts";

/*
 * The issuer-alert rules, on three real issuers read from mainnet on
 * 2026-10-11 (tests/fixtures/README.md). Changes are made by editing one
 * field of a real reading, the way a single AccountSet or SetRegularKey
 * would, so every other field stays what the ledger said.
 */
const read = (name: string) => JSON.parse(readFileSync(`tests/fixtures/${name}`, "utf8")).result;
const solo = read("issuer-state-solo-107586973.json");
const bitstamp = read("issuer-state-bitstamp-107586973.json");
const rlusd = read("issuer-state-rlusd-107586974.json");

const withData = (r: any, patch: Record<string, unknown>) => ({ ...r, account_data: { ...r.account_data, ...patch } });

describe("powersFrom on real issuers", () => {
  it("reads SOLO: blackholed, freeze surrendered, 0.01% fee", () => {
    const p = powersFrom(solo)!;
    expect(p.noFreeze).toBe(true);
    expect(p.masterDisabled).toBe(true);
    expect(p.regularKey).toBe("rrrrrrrrrrrrrrrrrrrrBZbvji");
    expect(p.signers).toEqual([]);
    expect(p.transferRateBps).toBe(1);
    expect(p.clawback).toBe(false);
    expect(p.domain).toBe("sologenic.com");
  });

  it("reads Bitstamp USD: one regular key, freeze kept, 0.15% fee", () => {
    const p = powersFrom(bitstamp)!;
    expect(p.regularKey).toBe("rUUs1jns6tdUQwAABDJyHMUHvdGNvNADvJ");
    expect(p.noFreeze).toBe(false);
    expect(p.transferRateBps).toBe(15);
    expect(p.domain).toBe("bitstamp.net");
  });

  it("reads RLUSD: clawback enabled, 26 weighted signers, quorum 25", () => {
    const p = powersFrom(rlusd)!;
    expect(p.clawback).toBe(true);
    expect(p.signers).toHaveLength(26);
    expect(p.signerQuorum).toBe(25);
    expect(p.signers).toContain("r4atrYAjm91GTB4qsDARjQQJPTi5svSEm:24");
    expect(p.regularKey).toBeNull();
    expect(describePowers(p)).toContain("signer list, quorum 25 of 26");
  });

  it("agrees with the server's own account_flags on every issuer", () => {
    for (const r of [solo, bitstamp, rlusd]) {
      const p = powersFrom(r)!;
      expect(p.noFreeze).toBe(r.account_flags.noFreeze);
      expect(p.globalFreeze).toBe(r.account_flags.globalFreeze);
      expect(p.clawback).toBe(r.account_flags.allowTrustLineClawback);
      expect(p.requireAuth).toBe(r.account_flags.requireAuthorization);
      expect(p.masterDisabled).toBe(r.account_flags.disableMasterKey);
    }
  });
});

describe("diffPowers", () => {
  it("reports nothing when nothing changed", () => {
    for (const r of [solo, bitstamp, rlusd]) expect(diffPowers(powersFrom(r), powersFrom(r))).toEqual([]);
  });

  it("puts a global freeze first, as critical", () => {
    const before = powersFrom(bitstamp)!;
    const after = powersFrom(withData(bitstamp, { Flags: bitstamp.account_data.Flags | 0x00400000, TransferRate: 1002000000 }))!;
    const changes = diffPowers(before, after);
    expect(changes[0]).toMatchObject({ field: "globalFreeze", severity: "critical" });
    expect(changes.find((c) => c.field === "transferRateBps")?.text).toContain("from 0.15% to 0.20%");
  });

  it("catches a key rotation", () => {
    const after = powersFrom(withData(bitstamp, { RegularKey: "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz" }))!;
    const [change] = diffPowers(powersFrom(bitstamp), after);
    expect(change).toMatchObject({ field: "regularKey", severity: "critical" });
    expect(change.text).toContain("rUUs1jns6tdUQwAABDJyHMUHvdGNvNADvJ to rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz");
  });

  it("catches one signer's weight changing, which a headcount would miss", () => {
    const entries = rlusd.account_data.signer_lists[0].SignerEntries.map((e: any, i: number) =>
      i === 0 ? { SignerEntry: { ...e.SignerEntry, SignerWeight: 25 } } : e);
    const after = powersFrom(withData(rlusd, { signer_lists: [{ ...rlusd.account_data.signer_lists[0], SignerEntries: entries }] }))!;
    const [change] = diffPowers(powersFrom(rlusd), after);
    expect(change).toMatchObject({ field: "signers", severity: "critical" });
  });

  it("never reports a change against an unreadable signer list", () => {
    const unreadable = { ...powersFrom(rlusd)!, signers: null, signerQuorum: null };
    expect(diffPowers(unreadable, powersFrom(rlusd))).toEqual([]);
    expect(diffPowers(null, powersFrom(rlusd))).toEqual([]);
  });
});

describe("delivery", () => {
  it("writes an alert a person can act on", () => {
    const after = powersFrom(withData(rlusd, { Flags: rlusd.account_data.Flags | 0x00400000 }))!;
    const text = alertText(rlusd.account_data.Account, 107586975, diffPowers(powersFrom(rlusd), after), "https://www.noshashi.app/alerts/?unsubscribe=x");
    expect(text).toContain("at ledger 107586975");
    expect(text).toContain("Global freeze turned ON");
    expect(text).toContain("/certificate/?issuer=rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De");
    expect(text).toContain("unsubscribe");
  });

  it("only ever posts to a real Discord webhook URL", () => {
    expect(DISCORD_WEBHOOK_RE.test("https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789ABCD")).toBe(true);
    for (const bad of [
      "http://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789ABCD",
      "https://discord.com.evil.example/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789ABCD",
      "https://169.254.169.254/latest/meta-data",
      "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789ABCD?x=@",
    ]) expect(DISCORD_WEBHOOK_RE.test(bad)).toBe(false);
  });
});
