import { afterEach, describe, expect, it, vi } from "vitest";
import { accountDomainReading } from "../accountDomains";
import {
  directoryDomains,
  type DomainEntry,
  type CredentialEntry,
} from "../registry";
const account = "rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX";
const domain: DomainEntry = {
  domainId: "A".repeat(64),
  owner: "issuer",
  sequence: 1,
  accepted: [{ issuer: "issuer", typeHex: "4B5943", type: "KYC" }],
  previousTxnId: null,
  previousTxnLedger: null,
};
const cred: CredentialEntry = {
  credentialId: "B".repeat(64),
  subject: account,
  issuer: "issuer",
  typeHex: "4B5943",
  type: "KYC",
  accepted: true,
  expiration: null,
  uri: null,
  previousTxnId: null,
  previousTxnLedger: null,
};
const io = () => ({
  validatedLedger: vi.fn(async () => ({
    index: 100,
    closeTime: 10,
    closeIso: "2000-01-01T00:00:10Z",
  })),
  credentialsOf: vi.fn(async () => [] as CredentialEntry[]),
  domainsOwnedBy: vi.fn(async () => [] as DomainEntry[]),
  directoryDomains: vi.fn(async () => ({
    domains: [{ ...domain, seenLedger: 90, firstSeenAt: "", removedAt: null }],
    status: { sweeps: [], domains: 1, credentials: 1, method: "sweep" },
  })),
  readDomain: vi.fn(async () => domain as DomainEntry | null),
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("account domain admission", () => {
  it("avoids the external directory when no held credentials exist", async () => {
    const r = io();
    r.domainsOwnedBy.mockResolvedValue([{ ...domain, owner: account }]);
    const v = await accountDomainReading(account, r);
    expect(v.domains).toHaveLength(1);
    expect(r.directoryDomains).not.toHaveBeenCalled();
  });
  it("preserves live owned domains when discovery times out and allows retry", async () => {
    const r = io();
    r.credentialsOf.mockResolvedValue([cred]);
    r.directoryDomains.mockRejectedValueOnce(Error("directory unavailable"));
    expect((await accountDomainReading(account, r)).directoryError).toBe(
      "directory unavailable",
    );
    const v = await accountDomainReading(account, r);
    expect(v.directoryError).toBe(null);
    expect(r.readDomain).toHaveBeenCalledWith(domain.domainId, 100);
  });
  it("rechecks directory candidates live and does not retain deleted domains", async () => {
    const r = io();
    r.credentialsOf.mockResolvedValue([cred]);
    r.readDomain.mockResolvedValue(null);
    expect((await accountDomainReading(account, r)).domains).toEqual([]);
  });
  it("does not hide failed credential reads as no credentials", async () => {
    const r = io();
    r.credentialsOf.mockRejectedValue(Error("node offline"));
    await expect(accountDomainReading(account, r)).rejects.toThrow("offline");
  });
  it("replaces the raw abort error with a bounded actionable timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, { signal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener("abort", () =>
              reject(new DOMException("signal aborted", "AbortError")),
            ),
          ),
      ),
    );
    const assertion =
      expect(directoryDomains()).rejects.toThrow("within 8 seconds");
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
  });
});
