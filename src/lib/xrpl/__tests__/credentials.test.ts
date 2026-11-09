import { describe, expect, it, vi } from "vitest";
import { readHeldCredentials } from "../credentials";
const account = "rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX";
const issuer = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const raw = {
  index: "A".repeat(64),
  LedgerEntryType: "Credential",
  Subject: account,
  Issuer: issuer,
  CredentialType: "4B5943",
  Flags: 65536,
  Expiration: 0,
};
const page = (objects: unknown[], marker?: unknown) => ({
  validated: true,
  ledger_index: 100,
  account_objects: objects,
  ...(marker ? { marker } : {}),
});
describe("held credential pagination", () => {
  it("pins subsequent pages and excludes credentials issued to somebody else", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        page([{ ...raw, Subject: issuer, Issuer: account }], "next"),
      )
      .mockResolvedValueOnce(page([raw]));
    const rows = await readHeldCredentials(account, "validated", request);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      credentialType: "KYC",
      expiration: 0,
      accepted: true,
    });
    expect(request.mock.calls[1][1]).toMatchObject({
      ledger_index: 100,
      marker: "next",
    });
  });
  it("does not turn incomplete, malformed, mixed-ledger or repeated pages into an empty pass", async () => {
    await expect(
      readHeldCredentials(account, "validated", async () => ({
        validated: true,
        ledger_index: 100,
      })),
    ).rejects.toThrow("omitted");
    await expect(
      readHeldCredentials(account, "validated", async () => page([{}])),
    ).rejects.toThrow("malformed");
    await expect(
      readHeldCredentials(account, 101, async () => page([])),
    ).rejects.toThrow("same validated");
    await expect(
      readHeldCredentials(account, "validated", async () => page([], "loop")),
    ).rejects.toThrow("repeated");
  });
  it("returns a real empty result and rejects an unavailable node", async () => {
    expect(
      await readHeldCredentials(account, "validated", async () => page([])),
    ).toEqual([]);
    await expect(
      readHeldCredentials(account, "validated", async () => {
        throw Error("offline");
      }),
    ).rejects.toThrow("offline");
  });
});
