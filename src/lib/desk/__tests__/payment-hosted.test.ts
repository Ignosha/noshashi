import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import * as pay from "../../../../supabase/functions/noshashi-verify/payment";

/**
 * The hosted API's payment rules (supabase/functions/noshashi-verify/payment.ts)
 * against the vectors the Rust engine wrote (tests/fixtures/payment-verify-vectors.json,
 * checked on that side by verify::tests::t36_shared_vectors). Same status,
 * reason, findings, difference, decision key and evidence digest, or the
 * two implementations have drifted.
 */

type Read = { source: string; observed_at: string; fixture?: number; failed?: string; result?: unknown };
type Vector = {
  name: string;
  hash: string;
  network: pay.Network;
  reads: Read[];
  invoice: unknown;
  prior_invoice: string | null;
  evaluated_at: string;
  expected: Record<string, unknown>;
};

const vectors = JSON.parse(readFileSync("tests/fixtures/payment-verify-vectors.json", "utf8")) as { vectors: Vector[] };
const entries = (JSON.parse(readFileSync("tests/fixtures/account-tx-solo-107587061.json", "utf8")) as { transactions: unknown[] }).transactions;

function readsOf(v: Vector): pay.SourceRead[] {
  return v.reads.map((r) => {
    if (r.fixture !== undefined) return pay.observe(r.source, r.observed_at, entries[r.fixture] as never);
    if (r.failed !== undefined) return { status: "failed", source: r.source, observed_at: r.observed_at, error: r.failed };
    return pay.observe(r.source, r.observed_at, r.result as never);
  });
}

describe("shared vectors with the Rust engine", () => {
  it("has the full set", () => {
    expect(vectors.vectors.length).toBeGreaterThanOrEqual(30);
  });
  for (const v of vectors.vectors) {
    it(v.name, async () => {
      const invoice = v.invoice === null ? null : pay.parseInvoice(v.invoice);
      expect(typeof invoice).not.toBe("string");
      const report = await pay.verify({
        requestedHash: v.hash,
        network: v.network,
        reads: readsOf(v),
        invoice: invoice as pay.InvoicePolicy | null,
        priorInvoice: v.prior_invoice,
        evaluatedAt: v.evaluated_at,
      });
      expect({
        status: report.status,
        reason_code: report.reason_code,
        findings: report.findings.map((f) => f.code),
        amount_difference: report.amount_difference,
        decision_key: report.decision_key,
        evidence_digest: report.evidence_digest,
      }).toEqual(v.expected);
      // The digest is over the evidence served with the report.
      expect(await pay.digest(report.evidence)).toBe(report.evidence_digest);
    });
  }
});

describe("canonical digest", () => {
  it("matches the Rust parity vector (t35)", async () => {
    const record = { schema: "noshashi.xrpl-payment-evidence/1", b: [1, true, null, 'Zürich "quoted" \n'], a: { z: "161.1605415577872", y: 107587014 } };
    expect(await pay.digest(record)).toBe("ACA86C389009899CF9FCCC15EA4E175A57571075388F5EEB4FFC98E5767A2766");
  });
});

describe("exact decimals", () => {
  // Deterministic pseudo-random cases checked against BigInt arithmetic at a
  // fixed scale, the same property the Rust engine checks against i128.
  let seed = 0x5eed;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
  const scaled = (d: pay.Decimal, scale: number) => {
    const shift = d.exponent + scale;
    const n = d.digits ? BigInt(d.digits + "0".repeat(shift)) : 0n;
    return d.negative ? -n : n;
  };
  it("compares, adds and subtracts like integers", () => {
    for (let i = 0; i < 3000; i += 1) {
      const a = BigInt(next()) * (next() % 2 ? 1n : -1n) * BigInt(next() % 1000);
      const b = BigInt(next()) * (next() % 2 ? 1n : -1n);
      const da = pay.parseDecimal(`${a < 0n ? "-" : ""}${(a < 0n ? -a : a).toString().padStart(10, "0").replace(/(\d{6})$/, ".$1")}`);
      const db = pay.parseDecimal(`${b < 0n ? "-" : ""}${(b < 0n ? -b : b).toString().padStart(10, "0").replace(/(\d{6})$/, ".$1")}`);
      expect(scaled(da, 6)).toBe(a);
      expect(scaled(db, 6)).toBe(b);
      expect(pay.compare(da, db)).toBe(a < b ? -1 : a > b ? 1 : 0);
      expect(scaled(pay.add(da, db), 6)).toBe(a + b);
      expect(scaled(pay.sub(da, db), 6)).toBe(a - b);
      expect(pay.parseDecimal(pay.toPlain(da))).toEqual(da);
    }
  });
  it("keeps sub-drop and 16-digit token precision", () => {
    expect(pay.toPlain(pay.sub(pay.parseDecimal("1.064341457864214"), pay.parseDecimal("1.064341457878901")))).toBe("-0.000000000014687");
    expect(pay.toPlain(pay.add(pay.parseDecimal("0.1"), pay.parseDecimal("0.2")))).toBe("0.3");
    expect(pay.toDrops(pay.parseDecimal("125.5"))).toBe(125_500_000n);
    expect(() => pay.toDrops(pay.parseDecimal("0.0000001"))).toThrow(/precision/);
    expect(() => pay.decimalFromDrops("100000000000000001")).toThrow(/range/);
    expect(() => pay.decimalFromIou("1.2345678901234567")).toThrow(/precision/);
  });
});

describe("invoice input", () => {
  it("refuses money as a JSON number", () => {
    expect(pay.parseInvoice({ invoice_id: "A", destination: "r1", asset: { kind: "xrp" }, expected_amount: 125.5 })).toMatch(/never a JSON number/);
  });
  it("refuses an unknown asset kind and a tag above u32", () => {
    expect(pay.parseInvoice({ invoice_id: "A", destination: "r1", asset: { kind: "mpt" }, expected_amount: "1" })).toMatch(/asset/);
    expect(pay.parseInvoice({ invoice_id: "A", destination: "r1", asset: { kind: "xrp" }, expected_amount: "1", destination_tag: 2 ** 32 })).toMatch(/tag/);
  });
  it("normalises amounts the way the Rust engine serialises them", () => {
    const p = pay.parseInvoice({ invoice_id: "A", destination: "r1", asset: { kind: "xrp" }, expected_amount: "125.50" });
    expect(pay.invoiceJson(p as pay.InvoicePolicy)).toEqual({
      invoice_id: "A",
      destination: "r1",
      destination_tag: null,
      asset: { kind: "xrp" },
      expected_amount: "125.5",
      underpayment_tolerance: null,
      allow_partial_payment: false,
      hold_overpayment: false,
    });
  });
});

describe("transport, against a local HTTP server", () => {
  const HASH = "F3B8B18E6AEFDCEA3388D0B0932820C4F10F4849847E7989876FA9CD19687A70";
  const fast = { ...pay.LIMITS, requestTimeoutMs: 300, baseBackoffMs: 5, maxRetryAfterMs: 20 };
  let server: Server | null = null;
  let hits = 0;

  async function serve(handler: RequestListener): Promise<pay.Endpoint> {
    if (server) await new Promise((r) => server!.close(r));
    hits = 0;
    server = createServer((req, res) => {
      hits += 1;
      handler(req, res);
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    return { name: "local", operator: "test", url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` };
  }
  afterAll(() => server?.close());

  it("reads a good reply end to end", async () => {
    const entry = entries[2] as Record<string, unknown>;
    const ep = await serve((_q, s) => s.end(JSON.stringify({ result: { ...entry, hash: HASH } })));
    const { read, stats } = await pay.fetchTx(ep, HASH, fast);
    expect(read.status).toBe("observed");
    expect(stats.attempts).toBe(1);
  });
  it("retries a 429 and then gives up", async () => {
    const ep = await serve((_q, s) => {
      s.writeHead(429, { "retry-after": "0" });
      s.end();
    });
    const { read, stats } = await pay.fetchTx(ep, HASH, fast);
    expect(read).toMatchObject({ status: "failed", error: "rate limited (HTTP 429)" });
    expect(stats.attempts).toBe(3);
    expect(hits).toBe(3);
  });
  it("does not retry a 403", async () => {
    const ep = await serve((_q, s) => {
      s.writeHead(403);
      s.end();
    });
    const { read } = await pay.fetchTx(ep, HASH, fast);
    expect(read).toMatchObject({ status: "failed", error: "HTTP 403" });
    expect(hits).toBe(1);
  });
  it("stops reading an oversized body", async () => {
    const ep = await serve((_q, s) => s.end("x".repeat(2048)));
    const { read } = await pay.fetchTx(ep, HASH, { ...fast, maxBodyBytes: 1024 });
    expect(read).toMatchObject({ status: "failed" });
    expect((read as { error: string }).error).toMatch(/1024-byte limit/);
  });
  it("refuses malformed JSON and a compressed body", async () => {
    let ep = await serve((_q, s) => s.end("{not json"));
    expect((await pay.fetchTx(ep, HASH, fast)).read).toMatchObject({ error: "response is not valid JSON" });
    ep = await serve((_q, s) => {
      s.writeHead(200, { "content-encoding": "br" });
      s.end("??");
    });
    expect((await pay.fetchTx(ep, HASH, fast)).read).toMatchObject({ status: "failed" });
  });
  it("times out a silent node", async () => {
    const ep = await serve(() => undefined);
    const { read, stats } = await pay.fetchTx(ep, HASH, { ...fast, maxAttempts: 1 });
    expect(read).toMatchObject({ status: "failed", error: "timed out" });
    expect(stats.attempts).toBe(1);
  });
  it("allowlists two operators per network, never a caller URL", () => {
    expect(pay.independent("mainnet", 2).map((e) => e.operator)).toEqual(["XRPL Labs", "Ripple"]);
    expect(pay.independent("testnet", 2).map((e) => e.operator)).toEqual(["Ripple", "XRPL Labs"]);
  });
});

describe("signed exports", () => {
  it("signs a report so a third party can check it with the public key alone", async () => {
    // A throwaway key made for this test; the service's key is a secret and never appears here.
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    const key = await pay.importSigningKey(btoa(String.fromCharCode(...pkcs8)));
    const v = vectors.vectors[0];
    const report = await pay.verify({
      requestedHash: v.hash,
      network: v.network,
      reads: readsOf(v),
      invoice: pay.parseInvoice(v.invoice) as pay.InvoicePolicy,
      priorInvoice: null,
      evaluatedAt: v.evaluated_at,
    });
    const sig = await pay.signReport(report, key, "2026-10-26T12:00:01.000Z");
    expect(sig.key_id).toMatch(/^[0-9A-F]{16}$/);
    expect(await pay.checkSignature(sig, key.publicJwk, report.evidence)).toBe(true);
    // Altered evidence, or a statement edited after signing, fails.
    const altered = JSON.parse(JSON.stringify(report.evidence));
    altered.derived.status = "REJECTED";
    expect(await pay.checkSignature(sig, key.publicJwk, altered)).toBe(false);
    expect(await pay.checkSignature({ ...sig, payload: sig.payload.replace("VERIFIED", "REJECTED") }, key.publicJwk, report.evidence)).toBe(false);
  });
});

// Live mainnet: the hosted rules and transport against the real ledger,
// from two operators. Run by .github/workflows/verify-engine.yml (job
// `live`) with NOSHASHI_LIVE=1; skipped elsewhere, so a public node having
// a bad minute never fails an ordinary test run.
describe.runIf(process.env.NOSHASHI_LIVE === "1")("live mainnet", () => {
  it("verifies the real CSC partial payment from XRPL Labs and Ripple", async () => {
    const hash = "F3B8B18E6AEFDCEA3388D0B0932820C4F10F4849847E7989876FA9CD19687A70";
    const { reads, stats } = await pay.readSources(hash, "mainnet", true);
    const invoice = pay.parseInvoice({
      invoice_id: "LIVE-CSC-1",
      destination: "rogue5HnPRSszD9CWGSUz8UGHMVwSSKF6",
      asset: { kind: "issued", currency: "CSC", issuer: "rCSCManTZ8ME9EoLrSHHYKW8PPwWMgkwr" },
      expected_amount: "162.6994990013102",
    }) as pay.InvoicePolicy;
    const report = await pay.verify({ requestedHash: hash, network: "mainnet", reads, invoice, priorInvoice: null, evaluatedAt: new Date().toISOString() });
    console.log(JSON.stringify({ stats, status: report.status, reason: report.reason_code, ledger: report.ledger_index, delivered: report.delivered_amount, sources: report.sources }));
    expect(report.sources).toEqual(["xrplcluster.com", "s2.ripple.com"]);
    expect(report.reason_code).toBe("PARTIAL_NOT_PERMITTED");
    expect(report.ledger_index).toBe(107587014);
    expect(report.delivered_amount?.value).toBe("161.1605415577872");
  }, 90_000);
});
