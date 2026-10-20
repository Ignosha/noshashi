import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A large issuer (Bitstamp) on a public server: gateway_balances can time
 * out while account_info and the paged account_lines walk still answer.
 * That one read used to fail the whole issuer screen.
 */

const BITSTAMP = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const calls: string[] = [];
let gatewayFails = true;

vi.mock("@/lib/xrpl/client", async (original) => {
  const actual = await original<typeof import("@/lib/xrpl/client")>();
  return {
    ...actual,
    rpc: vi.fn(async (command: string) => {
      calls.push(command);
      if (command === "account_info") {
        return { account_data: { Account: BITSTAMP, Flags: 0 }, ledger_index: 107785930 };
      }
      if (command === "gateway_balances") {
        if (gatewayFails) throw new actual.XrplError("Timed out: gateway_balances");
        return { obligations: { USD: "300" } };
      }
      if (command === "account_lines") {
        return {
          lines: [
            { account: "rA", currency: "USD", balance: "-200", limit_peer: "1000" },
            { account: "rB", currency: "USD", balance: "-100", limit_peer: "1000" },
          ],
        };
      }
      if (command === "account_objects") return { account_objects: [] };
      if (command === "server_info") return {};
      throw new actual.XrplError(`not faked: ${command}`, "unknownCmd");
    }),
    fetchIssuerPosture: vi.fn(async () => ({
      address: BITSTAMP,
      noFreeze: false,
      globalFreeze: false,
      requireAuth: false,
      masterDisabled: true,
      transferRateBps: 15,
    })),
  };
});

const { readIssuance, issuanceFindings } = await import("../issuance");
const { readAuthoritySurface, authorityChecks } = await import("../authority");
const { timeoutFor } = await import("@/lib/xrpl/link");

beforeEach(() => {
  calls.length = 0;
  gatewayFails = true;
});

describe("issuer survey when gateway_balances fails", () => {
  it("still returns the walked holders instead of throwing", async () => {
    const report = await readIssuance(BITSTAMP);
    expect(report.obligationsError).toMatch(/Timed out/);
    expect(report.linesWalked).toBe(2);
    expect(report.currencies.map((c) => c.currency)).toEqual(["USD"]);
    // No denominator: coverage is 0, so no concentration is measurable.
    expect(report.currencies[0].coverage).toBe(0);
  });

  it("says so as a finding", async () => {
    const findings = issuanceFindings(await readIssuance(BITSTAMP));
    expect(findings.some((f) => f.id === "obligations-unreadable")).toBe(true);
  });

  it("measures coverage as before when it answers", async () => {
    gatewayFails = false;
    const report = await readIssuance(BITSTAMP);
    expect(report.obligationsError).toBeUndefined();
    expect(report.currencies[0].coverage).toBe(1);
  });
});

describe("authority certificate", () => {
  it("never passes concentration when the supply could not be read", async () => {
    const surface = await readAuthoritySurface(BITSTAMP, { walkSupply: true });
    expect(surface.issuance).toBeNull();
    expect(surface.unreadable.some((u) => u.startsWith("issuance: outstanding supply unreadable"))).toBe(true);
    const concentration = authorityChecks(surface).find((c) => c.id === "SUPPLY_CONCENTRATION");
    expect(concentration?.passed).toBe(false);
    expect(concentration?.state).toBe("INSUFFICIENT_DATA");
  });

  it("reuses a walk already in flight rather than starting a second", async () => {
    gatewayFails = false;
    const walk = readIssuance(BITSTAMP);
    await readAuthoritySurface(BITSTAMP, { walkSupply: true, issuance: walk });
    expect(calls.filter((c) => c === "gateway_balances")).toHaveLength(1);
  });
});

describe("timeouts", () => {
  it("gives the trust-line scans longer than ordinary reads", () => {
    expect(timeoutFor("gateway_balances")).toBeGreaterThan(timeoutFor("account_info"));
    expect(timeoutFor("account_lines")).toBeGreaterThan(timeoutFor("account_info"));
  });
});
