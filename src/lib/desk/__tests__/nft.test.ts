import { describe, it, expect } from "vitest";
import {
  decodeTokenId,
  accountIdToAddress,
  nftFindings,
  type NftReport,
  type NftRights,
} from "../nft";

/**
 * NFT rights, decoded from the token id.
 *
 * The decoding half is unusual for this codebase in that it can be checked
 * absolutely: the ids below are real, taken from live NFTokenCreateOffer
 * transactions on 2026-08-28, and every derived issuer address was
 * confirmed to resolve to a funded account on mainnet. A base58 or
 * checksum error produces an address that does not exist, so these are not
 * self-referential — they pin the decode against the ledger.
 *
 * The findings half has the familiar asymmetry. Missing a burnable flag
 * tells someone a revocable licence is property; inventing one defames an
 * issuer who gave the right up.
 */

/* Real mainnet ids and the issuers they decode to, both verified live. */
const REAL = [
  {
    id: "00081388EF7C422EF52CEB969960BEF4144D7BC3F862C4679F0C0036059EAF97",
    issuer: "r4qHM7vWeLTtWPVoEzDjT6AskpQjSmui7B",
    burnable: false,
    mutable: false,
    transferable: true,
    feePct: 5,
  },
  {
    id: "000827101941A0D12818F1C7D47E13DA0FF62C03586F780D2E6816B40612A419",
    issuer: "rsJYW5uJjfjfwGsAfrfE7nTvMTjAmgqWNc",
    burnable: false,
    mutable: false,
    transferable: true,
    feePct: 10,
  },
  {
    // flags 0x0018 — transferable AND mutable.
    id: "00182710C7DEC772B41E9496AA92D148C4FD64D239AA629847C852FD05B7EEED",
    issuer: "rKDFM3xaC3B7ijWkX4iHcMTcLFgxW2dK74",
    burnable: false,
    mutable: true,
    transferable: true,
    feePct: 10,
  },
] as const;

describe("decodeTokenId — against real mainnet tokens", () => {
  for (const t of REAL) {
    it(`decodes ${t.id.slice(0, 12)}… to its real issuer`, async () => {
      const r = await decodeTokenId(t.id);
      expect(r.issuer).toBe(t.issuer);
      expect(r.burnable).toBe(t.burnable);
      expect(r.mutable).toBe(t.mutable);
      expect(r.transferable).toBe(t.transferable);
      expect(r.transferFeePct).toBe(t.feePct);
    });
  }

  it("produces an address of the right shape", async () => {
    const r = await decodeTokenId(REAL[0].id);
    expect(r.issuer).toMatch(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/);
  });

  it("accepts lowercase and surrounding whitespace", async () => {
    const messy = `  ${REAL[0].id.toLowerCase()}  `;
    expect((await decodeTokenId(messy)).issuer).toBe(REAL[0].issuer);
  });

  it("rejects anything that is not 64 hex characters", async () => {
    for (const bad of ["", "nonsense", REAL[0].id.slice(0, 63), REAL[0].id + "A", "Z".repeat(64)]) {
      await expect(decodeTokenId(bad)).rejects.toThrow(/64 hexadecimal/);
    }
  });

  it("reads each field from its own position in the id", async () => {
    // Hand-built: flags 0x0001 (burnable), fee 0x0000, issuer all zeroes,
    // taxon 0x00000005, sequence 0x00000007.
    const id = "0001" + "0000" + "00".repeat(20) + "00000005" + "00000007";
    const r = await decodeTokenId(id);
    expect(r.burnable).toBe(true);
    expect(r.transferable).toBe(false);
    expect(r.transferFeePct).toBe(0);
    expect(r.taxon).toBe(5);
    expect(r.sequence).toBe(7);
  });

  it("reads the maximum transfer fee as 50%", async () => {
    // 50000 units of 0.001% is the protocol ceiling.
    const id = "0008" + "C350" + "00".repeat(20) + "00000000" + "00000000";
    expect((await decodeTokenId(id)).transferFeePct).toBe(50);
  });

  it("distinguishes every flag independently", async () => {
    const at = async (flagHex: string) => decodeTokenId(flagHex + "0000" + "00".repeat(20) + "0".repeat(16));
    expect((await at("0001")).burnable).toBe(true);
    expect((await at("0002")).onlyXrp).toBe(true);
    expect((await at("0008")).transferable).toBe(true);
    expect((await at("0010")).mutable).toBe(true);
    // And a flag being set must not switch on its neighbours.
    const only = await at("0001");
    expect([only.onlyXrp, only.transferable, only.mutable]).toEqual([false, false, false]);
  });
});

describe("accountIdToAddress", () => {
  it("encodes the all-zero AccountID to the known burn address", () => {
    // rrrrrrrrrrrrrrrrrrrrrhoLvTp is the canonical ACCOUNT_ZERO encoding.
    return expect(accountIdToAddress("00".repeat(20))).resolves.toBe(
      "rrrrrrrrrrrrrrrrrrrrrhoLvTp"
    );
  });
});

const rights = (over: Partial<NftRights> = {}): NftRights => ({
  tokenId: "A".repeat(64),
  issuer: "rIssuer",
  burnable: false,
  mutable: false,
  transferable: true,
  onlyXrp: false,
  transferFeePct: 0,
  taxon: 1,
  sequence: 1,
  ...over,
});

const report = (over: Partial<NftReport> = {}): NftReport => ({
  rights: rights(),
  sellOffers: [],
  buyOffers: [],
  offersUnreadable: false,
  readAt: "2026-08-28T00:00:00Z",
  ...over,
});

describe("nftFindings — rights the marketplace does not show", () => {
  it("raises CRITICAL when the issuer can destroy the token", () => {
    const f = nftFindings(report({ rights: rights({ burnable: true }) }));
    const burn = f.find((x) => x.id === "burnable");
    expect(burn?.severity).toBe("critical");
    expect(burn!.action).toMatch(/revocable licence/i);
  });

  it("states plainly when the issuer cannot destroy it", () => {
    // The reassurance has to be as explicit as the alarm, or the absence
    // of a warning is doing the work and absence is not evidence.
    expect(nftFindings(report()).find((x) => x.id === "not-burnable")?.severity).toBe("ok");
  });

  it("warns when the issuer can redirect what the token points at", () => {
    const f = nftFindings(report({ rights: rights({ mutable: true }) }));
    expect(f.find((x) => x.id === "mutable")?.severity).toBe("warn");
  });

  it("warns when the token cannot be resold at all", () => {
    const f = nftFindings(report({ rights: rights({ transferable: false }) }));
    const s = f.find((x) => x.id === "soulbound");
    expect(s?.severity).toBe("warn");
    expect(s!.action).toMatch(/comparable tokens/i);
  });

  it("escalates a heavy transfer fee and states the round-trip cost", () => {
    const light = nftFindings(report({ rights: rights({ transferFeePct: 1 }) }));
    const heavy = nftFindings(report({ rights: rights({ transferFeePct: 10 }) }));
    expect(light.find((x) => x.id === "transfer-fee")?.severity).toBe("info");
    expect(heavy.find((x) => x.id === "transfer-fee")?.severity).toBe("warn");
    expect(heavy.find((x) => x.id === "transfer-fee")!.detail).toContain("20.000%");
  });

  it("says nothing about a fee when there is none", () => {
    expect(nftFindings(report()).find((x) => x.id === "transfer-fee")).toBeUndefined();
  });
});

describe("nftFindings — offers", () => {
  it("distinguishes unreadable offer books from empty ones", () => {
    const f = nftFindings(report({ offersUnreadable: true }));
    const u = f.find((x) => x.id === "offers-unreadable");
    expect(u?.severity).toBe("warn");
    expect(u!.detail).toMatch(/not the same as none existing/i);
    // And it must not also report a count it does not have.
    expect(f.find((x) => x.id === "offers")).toBeUndefined();
  });

  it("flags offers reserved for one named account", () => {
    // An offer book with activity is not a market anyone can trade into.
    const f = nftFindings(
      report({
        buyOffers: [
          { index: "A", owner: "rBuyer", amountXrp: 45, amountRaw: "45000000", destination: "rNamed" },
        ],
      })
    );
    const d = f.find((x) => x.id === "directed-offers");
    expect(d).toBeDefined();
    expect(d!.detail).toMatch(/not the same as a market anyone can trade into/i);
  });

  it("reports an empty book as empty rather than silently", () => {
    const f = nftFindings(report());
    expect(f.find((x) => x.id === "offers")?.detail).toMatch(/Nothing is currently offered/i);
  });
});
