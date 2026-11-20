import { describe, it, expect } from "vitest";
import { forecastAccess, compareDomainRules } from "../src/lib/continuity/access.ts";
import { sampleAccounts, sampleDomain, sampleTime } from "../src/lib/continuity/sample.ts";

const input = (account = sampleAccounts[0]) => ({ ...account, domain: sampleDomain, closeTime: sampleTime, horizonDays: 7 });

describe("Continuity access forecasts", () => {
  it("retains access when a second qualifying credential outlives the horizon", () => {
    expect(forecastAccess(input()).outcome).toBe("Access survives horizon");
    expect(forecastAccess({ ...input(), horizonDays: 21 }).lossAt).toBe(new Date((sampleTime + 20 * 86400 + 946684800) * 1000).toISOString());
  });
  it("reports the last qualifying expiry at the exact horizon boundary", () => {
    expect(forecastAccess({ ...input(sampleAccounts[1]), horizonDays: 3 }).outcome).toBe("Access expires within horizon");
  });
  it("keeps an accepted credential with no expiry eligible", () => {
    expect(forecastAccess({ ...input(sampleAccounts[2]), horizonDays: 365 }).lossAt).toBeNull();
  });
  it("excludes pending credentials and credentials held by another account", () => {
    const value = input(sampleAccounts[1]);
    expect(forecastAccess({ ...value, credentials: value.credentials.map(c => ({ ...c, accepted: false })) }).now.admitted).toBe(false);
    expect(forecastAccess({ ...value, account: "Other desk" }).now.admitted).toBe(false);
  });
  it("preserves domain owner access even without credentials", () => {
    const value = { ...input(), account: sampleDomain.owner, credentials: [] };
    expect(forecastAccess(value).future.basis).toBe("owner");
    expect(compareDomainRules(value, [sampleDomain.accepted[1]]).outcome).toBe("Access unchanged");
  });
  it("distinguishes current exclusion from future expiry", () => {
    expect(forecastAccess({ ...input(), credentials: [] }).outcome).toBe("No qualifying access at snapshot");
  });
  it("compares rule removals at snapshot time", () => {
    expect(compareDomainRules(input(sampleAccounts[1]), [sampleDomain.accepted[1]]).outcome).toBe("Would lose access");
    expect(compareDomainRules(input(), [sampleDomain.accepted[1]]).outcome).toBe("Access unchanged");
  });
  it("rejects invalid horizons, empty rule scenarios and foreign rules", () => {
    for (const horizonDays of [0, NaN, 2.5, 366]) expect(() => forecastAccess({ ...input(), horizonDays })).toThrow();
    expect(() => compareDomainRules(input(), [])).toThrow();
    expect(() => compareDomainRules(input(), [{ issuer: "Other", typeHex: "00", type: null }])).toThrow();
  });
});
