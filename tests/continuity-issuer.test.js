import { describe, expect, it, vi, beforeEach } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../src/lib/xrpl/client", () => ({
  rpc,
  XrplError: class extends Error {},
}));
import {
  closureOutcome,
  readIssuerClosures,
  parseClosures,
  issuerCurrencyKey,
} from "../src/lib/continuity/issuer.ts";
const issuer = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const wallet = "r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59";
const rows = [{ id: "Closure-01", wallet, closed: "2026-10-21" }];
const fact = {
  balance: "0",
  authorized: true,
  frozen: false,
  linePresent: true,
};
let marker = false;
beforeEach(() => {
  marker = false;
  rpc.mockReset().mockImplementation(async (command) => {
    if (command === "ledger")
      return { ledger_index: 123, ledger: { close_time: 848448000 } };
    if (command === "account_info")
      return {
        ledger_index: 123,
        validated: true,
        account_data: { Account: issuer, Flags: 0 },
      };
    return {
      ledger_index: 123,
      validated: true,
      account: wallet,
      lines: [
        {
          account: issuer,
          currency: "USD",
          balance: "1e-96",
          authorized: true,
          peer_authorized: false,
        },
      ],
      ...(marker ? { marker: "more" } : {}),
    };
  });
});
describe("issuer closure reads", () => {
  it("pins every read and uses the issuer's authorization side", async () => {
    const result = await readIssuerClosures(issuer, "USD", rows, 30, false);
    expect(result.rows[0].fact.authorized).toBe(false);
    expect(result.rows[0].outcome).toBe("Balance exceeds redemption window");
    expect(
      rpc.mock.calls
        .filter(([command]) => command !== "ledger")
        .every(([, params]) => params.ledger_index === 123),
    ).toBe(true);
  });
  it("refuses incomplete pagination and mismatched ledger evidence", async () => {
    marker = true;
    // Empty pages avoid triggering the separate duplicate evidence guard.
    const original = rpc.getMockImplementation();
    rpc.mockImplementation(async (command) =>
      command === "account_lines"
        ? {
            ledger_index: 123,
            validated: true,
            account: wallet,
            lines: [],
            marker: "more",
          }
        : original(command),
    );
    await expect(
      readIssuerClosures(issuer, "USD", rows, 30, false),
    ).rejects.toThrow(/pagination/);
    rpc.mockImplementation(async (command) =>
      command === "account_lines"
        ? { ledger_index: 124, validated: true, account: wallet, lines: [] }
        : original(command),
    );
    await expect(
      readIssuerClosures(issuer, "USD", rows, 30, false),
    ).rejects.toThrow(/validated ledger/);
  });
  it("matches standard currency hex and a 3-character representation", async () => {
    const key = issuerCurrencyKey("USD");
    expect(key).toHaveLength(40);
    expect(
      (await readIssuerClosures(issuer, key, rows, 30, false)).rows[0].fact
        .linePresent,
    ).toBe(true);
  });
  it("preserves case and accepts supported symbolic currency codes", async () => {
    expect(issuerCurrencyKey("usd")).not.toBe(issuerCurrencyKey("USD"));
    const original = rpc.getMockImplementation();
    rpc.mockImplementation(async (command) => {
      const result = await original(command);
      if (command === "account_lines") result.lines[0].currency = "U$D";
      return result;
    });
    expect(
      (await readIssuerClosures(issuer, "U$D", rows, 30, false)).rows[0].fact
        .linePresent,
    ).toBe(true);
  });
  it("keeps missing mappings unresolved", async () => {
    const result = await readIssuerClosures(
      issuer,
      "USD",
      [{ ...rows[0], wallet: null }],
      30,
      false,
    );
    expect(result.rows[0].outcome).toBe("Wallet evidence needed");
  });
});
describe("closure policy", () => {
  it("preserves persistent authorization and the exact deadline", () => {
    expect(closureOutcome(rows[0], fact, "2026-11-20", 30, false)).toBe(
      "Zero balance; authorization persists",
    );
    expect(
      closureOutcome(
        rows[0],
        { ...fact, balance: "100" },
        "2026-11-20",
        30,
        false,
      ),
    ).toBe("Balance exceeds redemption window");
    expect(
      closureOutcome(
        rows[0],
        { ...fact, balance: "100" },
        "2026-11-19",
        30,
        false,
      ),
    ).toBe("Within redemption window");
  });
  it("distinguishes debt, missing lines and declared freeze policy", () => {
    expect(
      closureOutcome(
        rows[0],
        { ...fact, balance: "-1" },
        "2026-11-20",
        30,
        false,
      ),
    ).toMatch(/Negative/);
    expect(
      closureOutcome(
        rows[0],
        { ...fact, linePresent: false },
        "2026-11-20",
        30,
        true,
      ),
    ).toMatch(/No trust line/);
    expect(closureOutcome(rows[0], fact, "2026-11-20", 30, true)).toMatch(
      /Freeze policy/,
    );
  });
  it("validates dates and supplied mappings", () => {
    expect(() =>
      parseClosures([{ ...rows[0], closed: "2026-02-30" }], "2026-11-20"),
    ).toThrow();
    expect(() => parseClosures([rows[0], rows[0]], "2026-11-20")).toThrow();
    expect(() =>
      parseClosures([{ ...rows[0], wallet: "unknown" }], "2026-11-20"),
    ).toThrow();
  });
});
