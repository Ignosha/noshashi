import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as read from "../../../../supabase/functions/noshashi-verify/read";
import mainnet from "./fixtures/xrpl-mainnet-107193471.json";

/**
 * The Compliance API's read verbs (supabase/functions/noshashi-verify/read.ts).
 * The module is pure, so it runs here unmodified. Each case is a reply in
 * the shape rippled returns; what is under test is how it is stated —
 * a field the ledger did not return must come back null, never a default.
 */

const ISSUER = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const source = readFileSync("supabase/functions/noshashi-verify/index.ts", "utf8");

describe("routing", () => {
  it("names each read verb and nothing else", () => {
    expect(read.readVerbOf("analyze/issuer")).toEqual({ kind: "issuer" });
    expect(read.readVerbOf("analyze/address")).toEqual({ kind: "address" });
    expect(read.readVerbOf("analyze/transaction")).toEqual({ kind: "transaction" });
    expect(read.readVerbOf("authority/check")).toBeNull();
    expect(read.readVerbOf("")).toBeNull();
    expect(read.readVerbOf("analyze/other")).toBeNull();
  });

  it("receipt digests are 64 hex characters, upper-cased as the receipts print them", () => {
    expect(read.readVerbOf(`receipts/${"ab".repeat(32)}`)).toEqual({ kind: "receipt", digest: "AB".repeat(32) });
    expect(read.readVerbOf("receipts/xyz")).toBe("bad_digest");
    expect(read.readVerbOf(`receipts/${"A".repeat(63)}`)).toBe("bad_digest");
    expect(read.readVerbOf(`receipts/${"A".repeat(64)}/extra`)).toBeNull();
  });

  it("transaction hashes are normalised, and anything else is refused", () => {
    expect(read.normaliseTxHash(` ${"c".repeat(64)} `)).toBe("C".repeat(64));
    expect(read.normaliseTxHash("C".repeat(63))).toBeNull();
    expect(read.normaliseTxHash(42)).toBeNull();
  });
});

describe("issuer controls", () => {
  it("reads every control flag, including clawback in the sign bit", () => {
    const flags = (read.LSF_REQUIRE_AUTH | read.LSF_GLOBAL_FREEZE | read.LSF_ALLOW_TRUSTLINE_CLAWBACK | read.LSF_DEFAULT_RIPPLE) >>> 0;
    const s = read.summariseIssuer(ISSUER, { Flags: flags, TransferRate: 1_002_000_000, Domain: "6578616D706C652E636F6D" }, 99_000_000);
    expect(s.controls).toEqual({
      require_auth: true,
      global_freeze: true,
      no_freeze: false,
      clawback_enabled: true,
      default_ripple: true,
      deposit_auth: false,
      master_key_disabled: false,
      transfer_fee_bps: 20,
    });
    expect(s.domain).toBe("example.com");
    expect(s.flags_raw).toBe(flags);
    expect(s.ledger_index).toBe(99_000_000);
  });

  it("no TransferRate, or the no-fee value, is 0 bps; no Domain is null", () => {
    expect(read.transferRateBps(undefined)).toBe(0);
    expect(read.transferRateBps(1_000_000_000)).toBe(0);
    expect(read.summariseIssuer(ISSUER, {}, null).domain).toBeNull();
  });

  it("uses the same flag values as the console's issuer read", () => {
    const client = readFileSync("src/lib/xrpl/client.ts", "utf8");
    for (const [name, value] of [
      ["LSF_REQUIRE_AUTH", read.LSF_REQUIRE_AUTH],
      ["LSF_GLOBAL_FREEZE", read.LSF_GLOBAL_FREEZE],
      ["LSF_NO_FREEZE", read.LSF_NO_FREEZE],
      ["LSF_DISABLE_MASTER", read.LSF_DISABLE_MASTER],
    ] as const) {
      const m = new RegExp(`const ${name} = (0x[0-9a-fA-F]+);`).exec(client);
      expect(m, name).not.toBeNull();
      expect(Number(m![1])).toBe(value);
    }
  });
});

describe("address state", () => {
  const reserves = read.reservesOf({ info: { validated_ledger: { reserve_base_xrp: 1, reserve_inc_xrp: 0.2 } } });

  it("reserve and spendable come from the live reserve figures", () => {
    const s = read.summariseAddress({
      address: ISSUER,
      accountData: { Balance: "25500000", OwnerCount: 3, Sequence: 7 },
      ledgerIndex: 5,
      credentials: [{ Issuer: "rI", CredentialType: "4B5943", Flags: 0x00010000, Expiration: 800_000_000 }],
      reserves,
    });
    expect(s.account).toMatchObject({ balance_xrp: 25.5, owner_count: 3, sequence: 7, reserve_xrp: 1.6, spendable_xrp: 23.9 });
    expect(s.credentials).toEqual([{ issuer: "rI", credential_type: "KYC", accepted: true, expires_at: new Date((800_000_000 + 946_684_800) * 1000).toISOString() }]);
  });

  it("unreadable reserve figures → reserve and spendable null, not a constant", () => {
    expect(read.reservesOf(null)).toBeNull();
    const s = read.summariseAddress({ address: ISSUER, accountData: { Balance: "1000000" }, ledgerIndex: 5, credentials: [], reserves: null });
    expect(s.account).toMatchObject({ reserve_xrp: null, spendable_xrp: null });
  });

  it("an address the ledger never funded is stated as unfunded, not as a zero balance", () => {
    expect(read.summariseAddress({ address: ISSUER, accountData: null, ledgerIndex: 5, credentials: [], reserves })).toEqual({
      address: ISSUER,
      ledger_index: 5,
      funded: false,
      account: null,
      credentials: [],
    });
  });
});

describe("transactions", () => {
  it("a validated payment: final result, delivered amount, fee in XRP", () => {
    const s = read.summariseTransaction({
      hash: "C".repeat(64),
      validated: true,
      ledger_index: 90_000_000,
      close_time_iso: "2026-09-24T00:00:00Z",
      TransactionType: "Payment",
      Account: ISSUER,
      Destination: "rDest",
      DestinationTag: 12,
      Fee: "12",
      Sequence: 4,
      meta: { TransactionResult: "tesSUCCESS", delivered_amount: { currency: "USD", value: "10.5", issuer: "rI" } },
    });
    expect(s).toMatchObject({
      validated: true,
      result: "tesSUCCESS",
      result_final: true,
      succeeded: true,
      destination_tag: 12,
      delivered_amount: { currency: "USD", value: "10.5", issuer: "rI" },
      fee_xrp: "0.000012",
    });
  });

  it("API v2 nests the transaction under tx_json", () => {
    const s = read.summariseTransaction({ hash: "D".repeat(64), validated: true, tx_json: { TransactionType: "OfferCreate", Account: ISSUER, Fee: "10" }, meta: { TransactionResult: "tecKILLED" } });
    expect(s).toMatchObject({ type: "OfferCreate", account: ISSUER, succeeded: false, destination: null });
  });

  it("an unvalidated transaction's result is provisional, and success is unknown", () => {
    const s = read.summariseTransaction({ hash: "E".repeat(64), validated: false, TransactionType: "Payment", meta: { TransactionResult: "tesSUCCESS" } });
    expect(s).toMatchObject({ result_final: false, succeeded: null, ledger_index: null });
  });

  it("amounts: drops convert exactly; rippled's 'unavailable' is passed through", () => {
    expect(read.amountOf("1000001")).toEqual({ currency: "XRP", value: "1.000001" });
    expect(read.amountOf("100000000000000000")).toEqual({ currency: "XRP", value: "100000000000" });
    expect(read.summariseTransaction({ meta: { delivered_amount: "unavailable" } }).delivered_amount).toBe("unavailable");
    expect(read.amountOf(undefined)).toBeNull();
  });
});

describe("against real mainnet replies (ledger 107193471)", () => {
  it("Bitstamp's controls agree with rippled's own account_flags reading of the same ledger", () => {
    const reply = mainnet.account_info_bitstamp;
    const s = read.summariseIssuer(reply.account_data.Account, reply.account_data, reply.ledger_index);
    const f = reply.account_flags;
    expect(s.controls).toMatchObject({
      require_auth: f.requireAuthorization,
      global_freeze: f.globalFreeze,
      no_freeze: f.noFreeze,
      clawback_enabled: f.allowTrustLineClawback,
      default_ripple: f.defaultRipple,
      deposit_auth: f.depositAuth,
      master_key_disabled: f.disableMasterKey,
    });
    // TransferRate 1001500000 → 0.15%.
    expect(s.controls.transfer_fee_bps).toBe(15);
    expect(s.domain).toBe("bitstamp.net");
  });

  it("reserve figures are the live server's, and give Bitstamp's reserve from its owner count", () => {
    const reserves = read.reservesOf(mainnet.server_info);
    expect(reserves).toEqual({ base_xrp: 1, increment_xrp: 0.2 });
    const reply = mainnet.account_info_bitstamp;
    const s = read.summariseAddress({ address: reply.account_data.Account, accountData: reply.account_data, ledgerIndex: reply.ledger_index, credentials: [], reserves });
    expect(s.account).toMatchObject({ balance_xrp: 412602.491965, owner_count: 378, reserve_xrp: 76.6, spendable_xrp: 412525.891965 });
  });

  it("a Clio payment reply: result, delivered amount, fee, and the close time from the Ripple-epoch date", () => {
    expect(read.summariseTransaction(mainnet.tx_payment)).toEqual({
      hash: "017808F0426766661E431C513918AC8FA75B744ED33DBD83E0987DC60A9C24CE",
      validated: true,
      ledger_index: 107193471,
      closed_at: "2026-09-24T01:34:10.000Z",
      type: "Payment",
      account: "rBTppNsJFvNbbwmWxfUNAkLLHcMkbmSBQQ",
      destination: "rJWhovyyd5YC6WPX32S59PYcwUUr94GZeU",
      destination_tag: null,
      result: "tesSUCCESS",
      result_final: true,
      succeeded: true,
      delivered_amount: { currency: "DIP", value: "287.022082836", issuer: "rUmZDci9VKj9BgiBCE9TsLpypERU6jJqxR" },
      fee_xrp: "0.000021",
      sequence: 86511307,
    });
  });

  it("a transaction that delivers nothing has no delivered amount rather than zero", () => {
    const s = read.summariseTransaction(mainnet.tx_offer_cancel);
    expect(s).toMatchObject({ type: "OfferCancel", destination: null, delivered_amount: null, succeeded: true, fee_xrp: "0.000012" });
  });

  it("the not-found reply carries the code the function routes on", () => {
    expect(mainnet.tx_not_found.error).toBe("txnNotFound");
    expect(source).toContain('rippleRpc("tx", { transaction: hash, binary: false }, ["txnNotFound"])');
  });
});

describe("the function wiring", () => {
  it("a key issued to an organization records its receipts as the organization's", () => {
    expect(source).toMatch(/organization_id: auth\.organizationId,/);
    expect(source).toMatch(/select\("id, account_id, organization_id, revoked_at, expires_at, scopes"\)/);
  });

  it("read verbs take the read scope, draw no credit, and are listed", () => {
    const handler = source.slice(source.indexOf("async function handleRead"), source.indexOf("async function replayStoredReceipt"));
    expect(handler).toContain('admit(request, requestId, "read")');
    expect(handler).not.toContain("consume_verification_credit");
    expect(handler).not.toMatch(/\.insert\(/);
    for (const verb of ["receipts/{digest}", "analyze/issuer", "analyze/address", "analyze/transaction"]) {
      expect(source).toContain(`"${verb}":`);
    }
  });

  it("the API reference documents every verb the function serves", () => {
    const doc = readFileSync("docs/api/COMPLIANCE_API.md", "utf8");
    const verbs = [...source.matchAll(/^  "([a-z/{}]+)":/gm)].map((m) => m[1]);
    expect(verbs).toEqual(["authority/check", "receipts/{digest}", "analyze/issuer", "analyze/address", "analyze/transaction"]);
    for (const verb of verbs) expect(doc).toContain(`\`${verb}\``);
  });

  it("adjudication still requires the verify scope", () => {
    expect(source).toContain('admit(request, requestId, "verify")');
    expect(source).toMatch(/required === "verify" \? \["verify"\] : \["verify", "read"\]/);
  });
});
