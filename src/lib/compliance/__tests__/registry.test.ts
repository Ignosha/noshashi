import { describe, expect, it } from "vitest";
import deposit from "@/lib/xrpl/__tests__/deposit.cases.json";
import {
  admission,
  credentialFromEntry,
  credentialStatus,
  domainFromEntry,
  expiringWithin,
  hexToText,
  textToHex,
  type CredentialEntry,
  type DomainEntry,
} from "../../../../supabase/functions/_shared/ledgerRegistry.ts";
import { canonical } from "../registry";

/**
 * The admission rule and the entry readers.
 *
 * The readers are checked against real mainnet replies. The rule is checked
 * against entries in the exact XLS-80 / XLS-70 ledger shape; the registry
 * sweep records real domains and credentials as it finds them, and those
 * become fixtures here once it has.
 */

describe("entry readers", () => {
  it("decodes a real memo's hex as text, and refuses bytes that are not text", () => {
    const memo = (deposit as Record<string, any>).phishingDust.tx.Memos[0].Memo;
    expect(hexToText(memo.MemoType)).toBe("text/plain");
    expect(hexToText(memo.MemoData)).toContain("XAMAN.LA");
    expect(hexToText("00FF10")).toBeNull();
    expect(hexToText(textToHex("KYC_LEVEL_1"))).toBe("KYC_LEVEL_1");
  });

  it("reads only its own entry type: a real AccountRoot is neither a domain nor a credential", () => {
    const root = { LedgerEntryType: "AccountRoot", Account: "rBpXtXVs5b2HjApREMyrT2zhTCQ2fHwWF5", index: "0".repeat(64) };
    expect(domainFromEntry(root)).toBeNull();
    expect(credentialFromEntry(root)).toBeNull();
  });
});

const ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const OWNER = "rBpXtXVs5b2HjApREMyrT2zhTCQ2fHwWF5";
const SUBJECT = "rEni1epjkJfVXMmMaDDWuz3hFe1mYnqfsk";
const KYC = textToHex("KYC");
const AML = textToHex("AML_CLEARED");
const NOW = 843_960_000; // a mainnet close time, 2026-09-29

const domain = domainFromEntry({
  LedgerEntryType: "PermissionedDomain",
  Owner: OWNER,
  Sequence: 17,
  AcceptedCredentials: [{ Credential: { Issuer: ISSUER, CredentialType: KYC } }, { Credential: { Issuer: ISSUER, CredentialType: AML } }],
  PreviousTxnID: "A".repeat(64),
  PreviousTxnLgrSeq: 107_300_000,
  index: "B".repeat(64),
}) as DomainEntry;

function cred(type: string, flags: number, expiration?: number, subject = SUBJECT): CredentialEntry {
  return credentialFromEntry({
    LedgerEntryType: "Credential",
    Subject: subject,
    Issuer: ISSUER,
    CredentialType: type,
    Flags: flags,
    ...(expiration !== undefined ? { Expiration: expiration } : {}),
    index: (type + String(flags) + String(expiration ?? "")).padEnd(64, "0").slice(0, 64).replace(/[^0-9A-F]/g, "0"),
  }) as CredentialEntry;
}

describe("admission (rippled accountInDomain)", () => {
  it("shapes the domain: owner, accepted credentials decoded", () => {
    expect(domain.owner).toBe(OWNER);
    expect(domain.accepted.map((a) => a.type)).toEqual(["KYC", "AML_CLEARED"]);
  });

  it("admits the owner with no credential at all", () => {
    const r = admission(domain, OWNER, [], NOW);
    expect(r).toMatchObject({ admitted: true, basis: "owner" });
  });

  it("admits a holder of one accepted, unexpired credential", () => {
    const r = admission(domain, SUBJECT, [cred(KYC, 0x10000, NOW + 86_400)], NOW);
    expect(r.admitted).toBe(true);
    expect(r.basis).toBe("credential");
    expect(r.lines.map((l) => l.status)).toEqual(["valid", "not_held"]);
  });

  it("refuses a credential the subject has not accepted, or that has expired", () => {
    expect(admission(domain, SUBJECT, [cred(KYC, 0)], NOW).admitted).toBe(false);
    expect(admission(domain, SUBJECT, [cred(KYC, 0x10000, NOW)], NOW).lines[0].status).toBe("expired");
    expect(admission(domain, SUBJECT, [cred(KYC, 0x10000, NOW)], NOW).admitted).toBe(false);
  });

  it("ignores a matching credential held by someone else", () => {
    expect(admission(domain, SUBJECT, [cred(KYC, 0x10000, undefined, OWNER)], NOW).admitted).toBe(false);
  });

  it("warns ahead of expiry and not after it", () => {
    const soon = cred(AML, 0x10000, NOW + 10 * 86_400);
    expect(credentialStatus(soon, NOW)).toBe("valid");
    expect(expiringWithin(soon, NOW, 30)).toBe(true);
    expect(expiringWithin(soon, NOW, 5)).toBe(false);
    expect(expiringWithin(cred(AML, 0x10000, NOW - 1), NOW, 30)).toBe(false);
  });
});

describe("canonical JSON for digests", () => {
  it("does not depend on key order", () => {
    expect(canonical({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(canonical({ a: [2, { c: 4, d: 3 }], b: 1 }));
  });
});
