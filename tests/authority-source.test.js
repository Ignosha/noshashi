import { afterEach, describe, expect, it, vi } from "vitest";
import { readAuthoritySurface, certificateFrom } from "../api/_lib/authority.js";

const ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const snapshot = () => ({
  validated: true,
  ledger_index: 108049990,
  account_data: {
    Account: ISSUER,
    Flags: 0x00400000 | 0x00100000,
    TransferRate: 1001500000,
  },
  signer_lists: [{
    SignerQuorum: 2,
    SignerEntries: [
      { SignerEntry: { Account: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", SignerWeight: 1 } },
      { SignerEntry: { Account: "rGm7WCVp9gb4jZHWTEtGUr4dd74z2XuWhE", SignerWeight: 1 } },
    ],
  }],
});
const reply = (result) => new Response(JSON.stringify({ result }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("public issuer authority source snapshot", () => {
  it("uses one validated account_info result for controls and posture", async () => {
    const calls = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      calls.push(JSON.parse(options.body));
      // A second call would see different controls at the next ledger.
      return reply(calls.length === 1 ? snapshot() : {
        ...snapshot(), ledger_index: 108049991,
        account_data: { Account: ISSUER, Flags: 0 },
      });
    }));
    const surface = await readAuthoritySurface(ISSUER);
    expect(calls).toEqual([{
      method: "account_info",
      params: [{ account: ISSUER, ledger_index: "validated", signer_lists: true }],
    }]);
    expect(surface.ledgerIndex).toBe(108049990);
    expect(surface.unreadable).toEqual([]);
    expect(surface.posture.globalFreeze).toBe(true);
    expect(surface.control.masterKeyEnabled).toBe(false);
    expect(surface.control.signers.minimumSigners).toBe(2);
    expect(surface.posture.transferRateBps).toBe(15);
    expect(surface.issuance).toBeNull();
    const certificate = await certificateFrom(surface);
    expect(certificate.ledgerIndex).toBe(108049990);
    expect(certificate.rulesVersion).toBe(2);
    expect(certificate.checks.find(c => c.id === "NOT_GLOBALLY_FROZEN").passed).toBe(false);
    expect(certificate.checks.find(c => c.id === "SUPPLY_CONCENTRATION").state).toBe("INSUFFICIENT_DATA");
  });

  it("accepts the v1 nested signer-list location without another read", async () => {
    const info = snapshot();
    info.account_data.signer_lists = info.signer_lists;
    delete info.signer_lists;
    const fetcher = vi.fn(async () => reply(info));
    vi.stubGlobal("fetch", fetcher);
    const surface = await readAuthoritySurface(ISSUER);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(surface.unreadable).toEqual([]);
    expect(surface.control.signers.minimumSigners).toBe(2);
  });

  it.each([
    ["unvalidated reply", { validated: false }],
    ["missing validation", { validated: undefined }],
    ["missing ledger", { ledger_index: undefined }],
    ["current ledger only", { ledger_index: undefined, ledger_current_index: 108049991 }],
    ["empty account", { account_data: {} }],
    ["another issuer", { account_data: { Account: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", Flags: 0 } }],
    ["missing flags", { account_data: { Account: ISSUER } }],
    ["malformed signer list", { signer_lists: [{}] }],
    ["null signer list", { signer_lists: [null] }],
    ["missing signer weights", { signer_lists: [{ SignerQuorum: 2, SignerEntries: [{ SignerEntry: { Account: ISSUER } }] }] }],
    ["unreadable transfer rate", { account_data: { Account: ISSUER, Flags: 0, TransferRate: "unknown" } }],
  ])("does not turn %s into a successful authority claim", async (_name, override) => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ ...snapshot(), ...override })));
    const surface = await readAuthoritySurface(ISSUER);
    expect(surface.control).toBeNull();
    expect(surface.posture).toBeNull();
    expect(surface.ledgerIndex).toBe(0);
    expect(surface.unreadable).not.toEqual([]);
    const certificate = await certificateFrom(surface);
    expect(certificate.verdict).not.toBe("go");
    expect(certificate.checks).toMatchObject([{ id: "AUTHORITY_READABLE", passed: false }]);
  });

  it("keeps unavailable data unreadable after exhausting node fallbacks", async () => {
    const fetcher = vi.fn(async () => { throw new Error("node unavailable"); });
    vi.stubGlobal("fetch", fetcher);
    const surface = await readAuthoritySurface(ISSUER);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(surface.unreadable).toEqual(["control: node unavailable"]);
    expect((await certificateFrom(surface)).checks).toMatchObject([{ id: "AUTHORITY_READABLE", passed: false }]);
  });

  it("withholds the source claim when signer lists were not answered", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ ...snapshot(), signer_lists: undefined })));
    const certificate = await certificateFrom(await readAuthoritySurface(ISSUER));
    expect(certificate.ledgerIndex).toBe(0);
    expect(certificate.checks).toMatchObject([{ id: "AUTHORITY_READABLE", passed: false }]);
  });
});
