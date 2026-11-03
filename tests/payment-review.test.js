import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseBatch,
  reviewRows,
  batchPayload,
  reviewCsv,
} from "../supabase/functions/_shared/paymentReview.ts";
import { digest } from "../supabase/functions/noshashi-verify/payment.ts";
import { handle } from "../supabase/functions/noshashi-payment-review/handler.ts";
import { importPayments } from "../src/portal/input.ts";
import {
  parseCsv,
  verifyReceipt,
  main,
} from "../packages/cli/bin/noshashi-review.mjs";

const vector = JSON.parse(
  readFileSync("tests/fixtures/payment-verify-vectors.json", "utf8"),
).vectors[0];
const entry = JSON.parse(
  readFileSync("tests/fixtures/account-tx-solo-107587061.json", "utf8"),
).transactions[0];
const input = () => ({
  rows: [{ hash: vector.hash, invoice: structuredClone(vector.invoice) }],
});
const rpcResult = { ...entry, validated: true };
const fetchGood = vi.fn(
  async () =>
    new Response(JSON.stringify({ result: rpcResult }), {
      headers: { "Content-Type": "application/json" },
    }),
);
const authId = "a0000000-0000-0000-0000-000000000001";
const runId = "b0000000-0000-0000-0000-000000000001";
function services({
  user = { id: authId, mfaRequired: false },
  claim = { id: runId, replay: false },
  tables = {},
  rpcError = null,
} = {}) {
  const calls = [];
  const db = {
    rpc: vi.fn(async (name, args) => {
      calls.push({ name, args });
      return {
        data:
          name === "payment_review_begin"
            ? claim
            : name === "payment_review_tier"
              ? "operator"
              : null,
        error: rpcError,
      };
    }),
    from(table) {
      const filters = [];
      const chain = {};
      for (const name of [
        "select",
        "eq",
        "is",
        "contains",
        "order",
        "limit",
        "insert",
        "update",
      ])
        chain[name] = (...args) => {
          filters.push({ name, args });
          return chain;
        };
      const finish = () => {
        calls.push({ table, filters });
        return { data: tables[table] ?? null, error: null };
      };
      chain.maybeSingle = async () => finish();
      chain.single = async () => finish();
      chain.then = (ok, bad) => Promise.resolve(finish()).then(ok, bad);
      return chain;
    },
  };
  return {
    admin: { schema: () => db },
    user: vi.fn(async () => user),
    billing: vi.fn(async () => ({ url: "https://checkout.stripe.com/test" })),
    fetcher: fetchGood,
    calls,
    db,
  };
}
function req(
  path = "runs",
  method = "POST",
  body = input(),
  token = "jwt",
  key = "batch-001",
) {
  return new Request(
    `https://example.test/functions/v1/noshashi-payment-review/${path}`,
    {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      ...(method === "GET"
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    },
  );
}
describe("Payment Review evidence", () => {
  it("matches a real invoice and keeps full evidence and ledger context", async () => {
    const result = await reviewRows(parseBatch(input()), fetchGood);
    expect(result.reports[0].status).toBe("VERIFIED");
    expect(result.reports[0].ledger_index).toBeGreaterThan(0);
    expect(result.reports[0].delivered_amount.value).toBe("0.067791435856414");
    expect(result.reports[0].evidence_digest).toBe(
      await digest(result.reports[0].evidence),
    );
    expect(verifyReceipt({ result }).valid).toBe(true);
  });
  it("rejects incomplete policy, malformed amounts and duplicate transaction use within a batch", () => {
    for (const invoice of [
      {},
      { ...vector.invoice, expected_amount: 1 },
      { ...vector.invoice, expected_amount: "0" },
      { ...vector.invoice, asset: { kind: "issued", currency: "USD" } },
    ]) {
      expect(() =>
        parseBatch({ rows: [{ hash: vector.hash, invoice }] }),
      ).toThrow();
    }
    expect(() =>
      parseBatch({ rows: [...input().rows, ...input().rows] }),
    ).toThrow(/only once/);
    expect(() => parseBatch({ rows: [] })).toThrow();
  });
  it("holds unavailable data and never substitutes requested amounts", async () => {
    const fail = vi.fn(async () => {
      throw new Error("Unavailable");
    });
    const result = await reviewRows(parseBatch(input()), fail);
    expect(result.reports[0].status).toBe("HOLD");
    expect(result.reports[0].delivered_amount).toBeNull();
    expect(
      result.reports[0].evidence.observed.every((x) => x.status === "failed"),
    ).toBe(true);
  });
  it("rejects an invoice mismatch from the same real payment", async () => {
    const raw = input();
    raw.rows[0].invoice.destination = "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq";
    const r = await reviewRows(parseBatch(raw), fetchGood);
    expect(r.reports[0].status).toBe("REJECTED");
  });
  it("binds idempotency to the whole invoice scope and canonicalizes hash case", async () => {
    const a = input(),
      b = input();
    b.rows[0].invoice.expected_amount = "20";
    expect(await digest(batchPayload(parseBatch(a)))).not.toBe(
      await digest(batchPayload(parseBatch(b))),
    );
    a.rows[0].hash = a.rows[0].hash.toLowerCase();
    expect(parseBatch(a)[0].hash).toBe(vector.hash);
  });
  it("detects both batch tampering and changed row evidence", async () => {
    const result = await reviewRows(parseBatch(input()), fetchGood);
    result.reports[0].status = "HOLD";
    expect(() => verifyReceipt({ result })).toThrow(/Batch/);
    result.digest = await digest({
      schema: result.schema,
      network: result.network,
      reports: result.reports,
    });
    result.reports[0].evidence.invoice.expected_amount = "99";
    result.digest = await digest({
      schema: result.schema,
      network: result.network,
      reports: result.reports,
    });
    expect(() => verifyReceipt({ result })).toThrow(/Row/);
  });
  it("exports spreadsheet cells safely", () => {
    expect(
      reviewCsv([
        { invoice_id: '=HYPERLINK("bad")', transaction_hash: vector.hash },
      ]),
    ).toContain("'=HYPERLINK");
  });
});
describe("Account and API boundary", () => {
  it("denies unauthenticated, expired sessions and incomplete MFA", async () => {
    expect(
      (await handle(req("runs", "GET", null, ""), services())).status,
    ).toBe(401);
    expect((await handle(req(), services({ user: null }))).status).toBe(401);
    expect(
      (
        await handle(
          req(),
          services({ user: { id: authId, mfaRequired: true } }),
        )
      ).status,
    ).toBe(403);
  });
  it.each([
    { revoked_at: "2026-01-01", scopes: ["payment_review"] },
    { expires_at: "2020-01-01", scopes: ["payment_review"] },
    { scopes: ["verify"] },
  ])("denies revoked, expired and wrong-scope keys", async (key) => {
    const s = services({
      tables: { api_keys: { id: runId, account_id: authId, ...key } },
    });
    expect(
      (await handle(req("runs", "GET", null, "nsh_review_secret"), s)).status,
    ).toBe(401);
  });
  it("does not let an API key change billing", async () => {
    const s = services({
      tables: {
        api_keys: { id: runId, account_id: authId, scopes: ["payment_review"] },
      },
    });
    expect(
      (await handle(req("checkout", "POST", {}, "nsh_review_secret"), s))
        .status,
    ).toBe(403);
    expect(s.billing).not.toHaveBeenCalled();
  });
  it("uses server ownership when retrieving private runs", async () => {
    const s = services();
    expect((await handle(req(`runs/${runId}`, "GET"), s)).status).toBe(404);
    const call = s.calls.find((c) => c.table === "payment_review_runs");
    expect(call.filters).toContainEqual({
      name: "eq",
      args: ["account_id", authId],
    });
  });
  it("rejects a changed idempotency payload without making a ledger request", async () => {
    const s = services({ claim: { error: "idempotency_conflict" } });
    s.fetcher = vi.fn();
    expect((await handle(req(), s)).status).toBe(409);
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it("returns an existing processing claim and never starts another request", async () => {
    const s = services({
      claim: { id: runId, replay: true, status: "processing" },
    });
    s.fetcher = vi.fn();
    expect((await handle(req(), s)).status).toBe(202);
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it("fails closed on private database errors", async () => {
    const s = services({ rpcError: { message: "private details" } });
    s.fetcher = vi.fn();
    const r = await handle(req(), s);
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("private details");
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it("saves the complete report and only charges available reads", async () => {
    const s = services();
    const r = await handle(req(), s);
    expect(r.status).toBe(201);
    expect((await r.json()).result.reports[0].evidence).toBeTruthy();
    expect(
      s.db.rpc.mock.calls.find((c) => c[0] === "payment_review_finish")[1]
        .p_charge,
    ).toBe(1);
  });
  it("rejects malformed and oversized input before reservation", async () => {
    const s = services();
    expect((await handle(req("runs", "POST", "{oops"), s)).status).toBe(400);
    expect(
      (await handle(req("runs", "POST", "x".repeat(65537)), s)).status,
    ).toBe(413);
    expect(s.db.rpc).not.toHaveBeenCalled();
  });
});
describe("Browser and CLI import parity", () => {
  const text =
    "hash,invoice_id,destination,expected_amount,currency,issuer,destination_tag\r\n" +
    vector.hash +
    ',"invoice, one",' +
    vector.invoice.destination +
    ",0.067791435856414,534F4C4F00000000000000000000000000000000," +
    vector.invoice.asset.issuer +
    ",0\r\n";
  it("preserves exact decimals, quoted CSV and tag zero across both clients", () => {
    expect(parseCsv(text)).toEqual(importPayments(text, "csv"));
    expect(parseCsv(text).rows[0].invoice.destination_tag).toBe(0);
    expect(parseCsv(text).rows[0].invoice.expected_amount).toBe(
      "0.067791435856414",
    );
  });
  it("rejects malformed CSV and unsafe transport", async () => {
    expect(() => parseCsv(text + '"oops')).toThrow();
    expect(() => importPayments("hash,hash\n1,2", "csv")).toThrow();
    await expect(
      main(["usage"], {
        NOSHASHI_REVIEW_API: "http://example.com",
        NOSHASHI_REVIEW_KEY: "nsh_review_x",
      }),
    ).rejects.toThrow(/HTTPS/);
  });
});
