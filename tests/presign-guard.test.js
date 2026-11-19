/*
 * Pre-Sign Guard (tools/presign-guard/). Every request and ledger reply
 * here is real:
 *  - the signed tx_sign_request and response in Fireblocks' "Basic Callback
 *    Handler example", with the public key Fireblocks published for them;
 *  - the extraParameters example in the Fireblocks XRP SDK README, whose
 *    hash is recomputed here from the payload;
 *  - XRP Ledger Mainnet and Testnet replies captured 2026-11-19
 *    (tests/fixtures/presign-guard/*.json), including simulate on two
 *    servers for a payment to Bitstamp with and without its required tag.
 * Keys for the end-to-end test are generated per run; none is committed.
 */
import { describe, it, expect, afterAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import codec from "ripple-binary-codec";
import { activationOf } from "../supabase/functions/_shared/xrplEvents.ts";
import { checks, decide, extract, extractDirect, loadPolicy, signingHash, simulationFindings, ticker, xrpToDrops, canonical, sha256 } from "../tools/presign-guard/guard.ts";
import { forSimulation, simulationFrom } from "../tools/presign-guard/ledger.ts";
import { publicKey, privateKey, signJwt, verifyJwt } from "../tools/presign-guard/jwt.ts";
import { auditLog, checkSettings, decideRequest, handler, verifyAuditLog } from "../tools/presign-guard/server.ts";

const fixture = (name) => readFileSync(new URL(`./fixtures/presign-guard/${name}`, import.meta.url), "utf8");
const docsKey = publicKey(fixture("fireblocks-docs-public-key.txt"));
const docsRequest = fixture("fireblocks-docs-request.jwt").trim();
const docsResponse = fixture("fireblocks-docs-response.jwt").trim();
const main = JSON.parse(fixture("mainnet-bitstamp.json"));
const sdk = JSON.parse(fixture("testnet-fireblocks-sdk.json"));
const examplePolicy = JSON.parse(readFileSync(new URL("../tools/presign-guard/policy.example.json", import.meta.url), "utf8"));

const BITSTAMP = "rrpNnNLKrartuEqfJGpqyDwPj1AFPg9vn1";
const GENESIS = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const RLUSD_ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";

const policy = (over = {}) =>
  loadPolicy({ ...examplePolicy, mode: "enforce", sourceAccounts: [], knownDestinations: [], xrplAssets: ["XRP", "XRP_TEST"], ...over });

/** The payment both servers simulated: 1 XRP to Bitstamp, fee 10 (no tag) or 12 (tag 1). */
const payment = (tag) => ({ TransactionType: "Payment", Account: GENESIS, Destination: BITSTAMP, Amount: "1000000", Fee: tag === undefined ? "10" : "12", Sequence: 44196, SigningPubKey: "", ...(tag === undefined ? {} : { DestinationTag: tag }) });

/** Mainnet facts for a payment to Bitstamp, as gather() would assemble them from the captured replies. */
function bitstampFacts(sims) {
  const hop0 = activationOf(BITSTAMP, main.account_tx_first_destination.transactions[0]);
  return {
    ledgerIndex: main.ledger.ledger_index,
    reserveBaseXrp: main.server_info.info.validated_ledger.reserve_base_xrp,
    destinationInfo: main.account_info_destination,
    chain: [hop0, { account: String(hop0.fundedBy), fundedBy: null, activatedLedger: null }],
    sanctions: {},
    threats: {},
    issuers: {},
    simulations: [simulationFrom("https://s1.ripple.com:51234/", sims.s1), simulationFrom("https://s2.ripple.com:51234/", sims.s2)],
  };
}

const sdkRequest = (over = {}) => ({ requestId: "sdk-example", txId: "sdk-example", operation: "RAW", asset: "XRP_TEST", extraParameters: structuredClone(sdk.extraParameters), ...over });

describe("JWTs, against Fireblocks' own signed example", () => {
  it("verifies the Co-signer request Fireblocks published", () => {
    const payload = verifyJwt(docsRequest, docsKey);
    expect(payload).toMatchObject({ txId: "9c794cee-7e27-46c9-9e9a-ed68295ff06b", requestId: "9c794cee-7e27-46c9-9e9a-ed68295ff06b", asset: "ETH", destAddress: "0x5dC69B1Fbb13Bafd09af88a782F0F285772Ad5f8" });
  });
  it("verifies the handler response Fireblocks published", () => {
    expect(verifyJwt(docsResponse, docsKey)).toMatchObject({ action: "REJECT", rejectionReason: "Logic returned false" });
  });
  it("refuses a changed payload, alg none, and another key", () => {
    const [h, p, s] = docsRequest.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), destAddress: "0x0000000000000000000000000000000000000000" })).toString("base64url");
    expect(() => verifyJwt(`${h}.${forged}.${s}`, docsKey)).toThrow(/signature/);
    const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    expect(() => verifyJwt(`${none}.${p}.`, docsKey)).toThrow(/algorithm/);
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey;
    expect(() => verifyJwt(docsRequest, other)).toThrow(/signature/);
  });
  it("signs responses RS256 with an RSA key and ES256 with a P-256 key", () => {
    for (const pair of [generateKeyPairSync("rsa", { modulusLength: 2048 }), generateKeyPairSync("ec", { namedCurve: "prime256v1" })]) {
      const token = signJwt({ action: "APPROVE", requestId: "r1" }, pair.privateKey);
      expect(verifyJwt(token, pair.publicKey)).toEqual({ action: "APPROVE", requestId: "r1" });
    }
  });
});

describe("what is about to be signed", () => {
  it("leaves another chain's asset to policy.otherAssets", () => {
    const eth = verifyJwt(docsRequest, docsKey);
    expect(extract(eth, policy()).kind).toBe("other");
  });

  it("recomputes the Fireblocks XRP SDK example's signing hash from its payload", () => {
    expect(signingHash(sdk.extraParameters.unhashedTxPayload)).toBe(sdk.extraParameters.rawMessageData.messages[0].content);
    const ex = extract(sdkRequest(), policy());
    expect(ex).toMatchObject({ kind: "xrpl", source: "unhashedTxPayload", signingHash: "4147FCCCB874E67DDB05C3D353972EFA21DC0D18F6F0B3768C22AFDAAEEC10E7" });
    expect(ex.kind === "xrpl" && ex.findings).toEqual([]);
  });

  it("refuses when the payload shown is not what the hash signs", () => {
    const req = sdkRequest();
    req.extraParameters.unhashedTxPayload.Destination = BITSTAMP;
    const ex = extract(req, policy());
    expect(ex.kind === "xrpl" && ex.findings.map((f) => f.id)).toContain("hash_mismatch");
  });

  it("reads rawTx with or without the signing prefix, and refuses one that disagrees with the payload", () => {
    const p = sdk.extraParameters.unhashedTxPayload;
    const blob = codec.encodeForSigning(p);
    for (const raw of [blob, blob.slice(8)]) {
      const ex = extract({ asset: "XRP_TEST", rawTx: [{ rawTx: raw, payload: signingHash(p) }] }, policy());
      expect(ex).toMatchObject({ kind: "xrpl", source: "rawTx", signingHash: signingHash(p), findings: [] });
    }
    const other = codec.encodeForSigning({ ...p, Sequence: p.Sequence + 1 });
    const ex = extract(sdkRequest({ rawTx: [{ rawTx: other, payload: signingHash({ ...p, Sequence: p.Sequence + 1 }) }] }), policy());
    expect(ex.kind === "xrpl" && ex.findings.map((f) => f.id)).toContain("conflicting_payloads");
  });

  it("compares Fireblocks' destination, tag and amount with the signed transaction", () => {
    const tx = payment(1);
    const blob = codec.encodeForSigning(tx);
    const base = { asset: "XRP", rawTx: [{ rawTx: blob, payload: signingHash(tx) }], destAddress: BITSTAMP, amountStr: "1.000000", destinations: [{ dstTag: "1" }] };
    expect(extract(base, policy()).kind === "xrpl" && extract(base, policy()).findings).toEqual([]);
    const ids = (req) => { const e = extract(req, policy()); return e.kind === "xrpl" ? e.findings.map((f) => f.id) : []; };
    expect(ids({ ...base, destAddress: GENESIS })).toContain("destination_mismatch");
    expect(ids({ ...base, amountStr: "2" })).toContain("amount_mismatch");
    expect(ids({ ...base, destinations: [{ dstTag: "2" }] })).toContain("tag_mismatch");
  });

  it("falls back to Fireblocks' fields when no bytes are visible, and can refuse that", () => {
    const req = { asset: "XRP", destAddress: BITSTAMP, amountStr: "1", destinations: [{ dstTag: "7" }] };
    const loose = extract(req, policy({ requireExactTransaction: false }));
    expect(loose).toMatchObject({ kind: "xrpl", source: "fields", signingHash: null, tx: { Destination: BITSTAMP, Amount: "1000000", DestinationTag: 7 } });
    expect(loose.kind === "xrpl" && loose.findings[0]).toMatchObject({ id: "transaction_not_visible", severity: "warn" });
    const strict = extract(req, policy({ requireExactTransaction: true }));
    expect(strict.kind === "xrpl" && strict.findings[0].severity).toBe("critical");
  });

  it("converts XRP strings to drops exactly", () => {
    expect(xrpToDrops("0.010000000000000000")).toBe("10000");
    expect(xrpToDrops("1")).toBe("1000000");
    expect(xrpToDrops("0.0000001")).toBeNull();
    expect(xrpToDrops("-1")).toBeNull();
  });
});

describe("the checks, on Mainnet replies", () => {
  it("refuses the payment to Bitstamp without a tag: screening and both servers agree it would fail", () => {
    const tx = payment();
    const findings = checks(tx, bitstampFacts(main.simulate_no_tag), policy());
    const ids = findings.map((f) => f.id);
    expect(ids).toContain("will_fail_tag");
    expect(findings.find((f) => f.id === "would_fail")).toMatchObject({ severity: "critical", title: expect.stringContaining("tecDST_TAG_NEEDED") });
    const d = decide({ requestId: "r", txId: "t", asset: "XRP" }, findings, policy(), { seen: { signingHash: signingHash(tx), source: "rawTx" }, ledgerIndex: main.ledger.ledger_index, policyHash: "p", decidedAt: "2026-11-19T17:51:38Z", tx });
    expect(d.action).toBe("REJECT");
    expect(d.rejectionReason).toMatch(/requires a tag.*tecDST_TAG_NEEDED/);
  });

  it("approves the same payment with its tag, which both servers would apply", () => {
    const tx = payment(1);
    const findings = checks(tx, bitstampFacts(main.simulate_with_tag_fee_12), policy());
    expect(findings.filter((f) => f.severity !== "info")).toEqual([]);
    expect(findings.find((f) => f.id === "simulated_ok")?.detail).toMatch(/tesSUCCESS .*108437068/);
    expect(decide({}, findings, policy(), { seen: null, ledgerIndex: 1, policyHash: "p", decidedAt: "x", tx }).action).toBe("APPROVE");
  });

  it("refuses what hands the account to someone else", () => {
    const facts = bitstampFacts(main.simulate_with_tag_fee_12);
    for (const tx of [
      { TransactionType: "SetRegularKey", Account: GENESIS, RegularKey: BITSTAMP },
      { TransactionType: "SignerListSet", Account: GENESIS, SignerQuorum: 1 },
      { TransactionType: "AccountSet", Account: GENESIS, SetFlag: 4 },
    ]) {
      const ids = checks(tx, facts, policy({ allowedTypes: ["Payment", "SetRegularKey", "SignerListSet", "AccountSet"] })).map((f) => f.id);
      expect(ids).toContain("key_change");
    }
    const allowed = checks({ TransactionType: "SetRegularKey", Account: GENESIS, RegularKey: BITSTAMP }, facts, policy({ allowedTypes: ["SetRegularKey"], allowKeyChanges: true }));
    expect(allowed.map((f) => f.id)).not.toContain("key_change");
    expect(checks({ TransactionType: "AMMDeposit", Account: GENESIS }, facts, policy()).map((f) => f.id)).toContain("type_not_allowed");
  });

  it("refuses an RLUSD that is not Ripple's, and an account that is not yours", () => {
    const facts = { ...bitstampFacts(main.simulate_with_tag_fee_12), issuers: { rhsMZjNb4ehEHdfLbMCRBnwMr7XAnicnVS: sdk.account_info_issuer, [RLUSD_ISSUER]: main.account_info_rlusd_issuer } };
    const p = policy({ allowedTypes: ["TrustSet"], acceptedIssuers: { RLUSD: [RLUSD_ISSUER] }, sourceAccounts: ["rpbkpPF8PrPuMN8NgEVkCsJDCWwP9KePFq"] });
    const fake = checks({ TransactionType: "TrustSet", Account: GENESIS, LimitAmount: { currency: "524C555344000000000000000000000000000000", issuer: "rhsMZjNb4ehEHdfLbMCRBnwMr7XAnicnVS", value: "1000" } }, facts, p).map((f) => f.id);
    expect(fake).toEqual(expect.arrayContaining(["counterfeit_issuer", "unknown_source"]));
    const real = checks({ TransactionType: "TrustSet", Account: "rpbkpPF8PrPuMN8NgEVkCsJDCWwP9KePFq", LimitAmount: { currency: "524C555344000000000000000000000000000000", issuer: RLUSD_ISSUER, value: "1000" } }, facts, p);
    expect(real.filter((f) => f.severity === "critical")).toEqual([]);
    expect(ticker("524C555344000000000000000000000000000000")).toBe("RLUSD");
  });

  it("refuses a token whose issuer has frozen it (the live RLUSD issuer, with Global Freeze set on a copy)", () => {
    const frozen = structuredClone(main.account_info_rlusd_issuer);
    frozen.account_data.Flags |= 0x00400000;
    const facts = { ...bitstampFacts(main.simulate_with_tag_fee_12), issuers: { [RLUSD_ISSUER]: frozen } };
    const ids = checks({ TransactionType: "TrustSet", Account: GENESIS, LimitAmount: { currency: "524C555344000000000000000000000000000000", issuer: RLUSD_ISSUER, value: "1" } }, facts, policy({ allowedTypes: ["TrustSet"], acceptedIssuers: { RLUSD: [RLUSD_ISSUER] } })).map((f) => f.id);
    expect(ids).toContain("issuer_frozen");
    const live = checks({ TransactionType: "TrustSet", Account: GENESIS, LimitAmount: { currency: "524C555344000000000000000000000000000000", issuer: RLUSD_ISSUER, value: "1" } }, { ...facts, issuers: { [RLUSD_ISSUER]: main.account_info_rlusd_issuer } }, policy({ allowedTypes: ["TrustSet"], acceptedIssuers: { RLUSD: [RLUSD_ISSUER] } })).map((f) => f.id);
    expect(live).not.toContain("issuer_frozen");
  });

  it("an unread sanctions list or issuer is RETRY, never a pass", () => {
    const facts = { ...bitstampFacts(main.simulate_with_tag_fee_12), sanctions: null };
    const findings = checks(payment(1), facts, policy());
    expect(decide({}, findings, policy(), { seen: null, ledgerIndex: 1, policyHash: "p", decidedAt: "x" }).action).toBe("RETRY");
  });
});

describe("simulation", () => {
  it("one server refusing to autofill a fee under load is not two answers: RETRY", () => {
    const sims = [simulationFrom("s1", { engine_result: "tesSUCCESS", ledger_index: 1 }), { server: "s2", error: `${main.simulate_autofill_fee_under_load.s2.error}: ${main.simulate_autofill_fee_under_load.s2.error_message}` }];
    expect(simulationFindings(sims)[0]).toMatchObject({ id: "simulation_unavailable", severity: "retry" });
  });
  it("servers that disagree are RETRY", () => {
    const sims = [simulationFrom("s1", main.simulate_no_tag.s1), simulationFrom("s2", main.simulate_with_tag_fee_12.s2)];
    expect(simulationFindings(sims)[0].id).toBe("simulation_disagrees");
  });
  it("a tel answer (the SDK example on Testnet: telCAN_NOT_QUEUE) is noted, not refused", () => {
    const sims = [simulationFrom("a", sdk.simulate), simulationFrom("b", sdk.simulate)];
    expect(simulationFindings(sims)[0]).toMatchObject({ id: "simulation_transient", severity: "info" });
  });
  it("simulates the transaction unsigned", () => {
    expect(forSimulation({ ...payment(), TxnSignature: "AB", hash: "CD" })).toEqual(payment());
  });
});

describe("decisions and receipts", () => {
  it("observe mode approves and records what enforce would have done", () => {
    const findings = checks(payment(), bitstampFacts(main.simulate_no_tag), policy());
    const d = decide({ requestId: "r" }, findings, policy({ mode: "observe" }), { seen: null, ledgerIndex: 1, policyHash: "p", decidedAt: "x" });
    expect(d).toMatchObject({ action: "APPROVE", enforced: "REJECT" });
    expect(d.rejectionReason).toBeUndefined();
  });
  it("the receipt hash is the SHA-256 of the canonical receipt", () => {
    const d = decide({ requestId: "r" }, [], policy(), { seen: null, ledgerIndex: 1, policyHash: "p", decidedAt: "x" });
    expect(d.receiptHash).toBe(sha256(canonical(d.receipt)));
    expect(canonical({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });
  it("refuses to start on a policy with a missing field or a bad address", () => {
    const { onReview: _drop, ...missing } = examplePolicy;
    expect(() => loadPolicy(missing)).toThrow(/onReview/);
    expect(() => loadPolicy({ ...examplePolicy, knownDestinations: ["rNOTANADDRESS"] })).toThrow(/invalid address/);
  });
});

describe("the Callback Handler, end to end over HTTP", () => {
  const cosigner = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const handlerKeys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const dir = mkdtempSync(join(tmpdir(), "presign-guard-"));
  const logPath = join(dir, "audit.jsonl");
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const deps = (p) => ({
    policy: p,
    policyHash: sha256(JSON.stringify(p)),
    cosignerKey: cosigner.publicKey,
    handlerKey: handlerKeys.privateKey,
    gather: async (tx) => bitstampFacts(tx.DestinationTag === undefined ? main.simulate_no_tag : main.simulate_with_tag_fee_12),
    log: auditLog(logPath),
    now: () => new Date("2026-11-19T18:00:00Z"),
  });

  async function call(d, path, body) {
    const server = createServer(handler(d));
    await new Promise((r) => server.listen(0, "127.0.0.1", () => r()));
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", body });
      return { status: res.status, text: await res.text() };
    } finally {
      server.close();
    }
  }

  /** A tx_sign_request as the XRP SDK sends it, signed by the (generated) Co-signer key. */
  const request = (tx) => signJwt({ requestId: "req-1", txId: "tx-1", operation: "RAW", asset: "XRP", extraParameters: { rawMessageData: { messages: [{ content: signingHash(tx) }] }, unhashedTxPayload: tx } }, cosigner.privateKey);

  it("answers REJECT, signed, for the untagged payment, with the receipt in the reason", async () => {
    const r = await call(deps(policy()), "/v2/tx_sign_request", request(payment()));
    expect(r.status).toBe(200);
    const answer = verifyJwt(r.text, handlerKeys.publicKey);
    expect(answer).toMatchObject({ action: "REJECT", requestId: "req-1" });
    expect(String(answer.rejectionReason)).toMatch(/tecDST_TAG_NEEDED.*\[receipt [0-9a-f]{16}\]/);
  });

  it("answers APPROVE for the tagged payment", async () => {
    const r = await call(deps(policy()), "/v2/tx_sign_request", request(payment(1)));
    expect(verifyJwt(r.text, handlerKeys.publicKey)).toEqual({ action: "APPROVE", requestId: "req-1" });
  });

  it("answers 401 to a request not signed by the Co-signer, and logs it", async () => {
    const forged = signJwt({ requestId: "x" }, generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey);
    expect((await call(deps(policy()), "/v2/tx_sign_request", forged)).status).toBe(401);
  });

  it("answers config changes from the policy", async () => {
    const r = await call(deps(policy({ configChanges: "ignore" })), "/v2/config_change_sign_request", signJwt({ requestId: "cfg-1", type: "ADD_USER" }, cosigner.privateKey));
    expect(verifyJwt(r.text, handlerKeys.publicKey)).toEqual({ action: "IGNORE", requestId: "cfg-1" });
  });

  it("an unreadable ledger is RETRY", async () => {
    const d = { ...deps(policy()), gather: async () => { throw new Error("timeout"); } };
    expect((await decideRequest({ requestId: "r", asset: "XRP", extraParameters: { rawMessageData: { messages: [{ content: signingHash(payment(1)) }] }, unhashedTxPayload: payment(1) } }, d)).action).toBe("RETRY");
  });

  it("keeps an audit log whose hash chain shows an edited line", () => {
    const text = readFileSync(logPath, "utf8");
    expect(text.trim().split("\n").length).toBeGreaterThanOrEqual(4);
    expect(verifyAuditLog(text)).toBeNull();
    const lines = text.trim().split("\n");
    const edited = JSON.parse(lines[0]);
    edited.kind = "edited";
    lines[0] = JSON.stringify(edited);
    writeFileSync(join(dir, "edited.jsonl"), lines.join("\n") + "\n");
    expect(verifyAuditLog(readFileSync(join(dir, "edited.jsonl"), "utf8"))).toBe(1);
  });

  it("loads the example policy file", () => {
    expect(loadPolicy(examplePolicy).mode).toBe("observe");
    expect(privateKey(handlerKeys.privateKey.export({ type: "pkcs8", format: "pem" })).asymmetricKeyType).toBe("ec");
  });
});

describe("POST /v1/check, for signing systems other than Fireblocks", () => {
  const dir = mkdtempSync(join(tmpdir(), "presign-check-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const TOKEN = "t".repeat(40);

  const deps = (check, over = {}) => ({
    policy: policy(),
    policyHash: "p",
    cosignerKey: null,
    handlerKey: null,
    gather: async (tx) => bitstampFacts(tx.DestinationTag === undefined ? main.simulate_no_tag : main.simulate_with_tag_fee_12),
    log: auditLog(join(dir, "audit.jsonl")),
    now: () => new Date("2026-11-19T20:00:00Z"),
    check,
    ...over,
  });

  async function post(d, path, body, headers = {}) {
    const server = createServer(handler(d));
    await new Promise((r) => server.listen(0, "127.0.0.1", () => r()));
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
      const text = await res.text();
      return { status: res.status, body: text.startsWith("{") ? JSON.parse(text) : text };
    } finally {
      server.close();
    }
  }

  it("reads tx_json and tx_blob (with or without the signing prefix) as the same transaction", () => {
    const tx = payment(1);
    const blob = codec.encodeForSigning(tx);
    const fromJson = extractDirect({ tx_json: tx });
    expect(fromJson.seen).toMatchObject({ source: "tx_json", signingHash: signingHash(tx) });
    for (const b of [blob, blob.slice(8)]) expect(extractDirect({ tx_blob: b }).seen?.signingHash).toBe(signingHash(tx));
    expect(extractDirect({ tx_json: tx, signingHash: "00".repeat(32) }).findings.map((f) => f.id)).toContain("hash_mismatch");
  });

  it("refuses an already-signed transaction (Bitstamp's real activation payment from ledger 244032)", () => {
    const signed = main.account_tx_first_destination.transactions[0].tx;
    expect(extractDirect({ tx_json: signed }).findings.map((f) => f.id)).toContain("already_signed");
  });

  it("answers REJECT for the untagged payment, with the reason, findings and receipt", async () => {
    const r = await post(deps({ token: null }), "/v1/check", { tx_json: payment(), requestId: "wd-123" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ action: "REJECT", enforced: "REJECT", signingHash: signingHash(payment()), receipt: { requestId: "wd-123", seenFrom: "tx_json" } });
    expect(r.body.reason).toMatch(/tecDST_TAG_NEEDED/);
    expect(r.body.receiptHash).toBe(sha256(canonical(r.body.receipt)));
  });

  it("answers APPROVE for the tagged payment sent as a blob", async () => {
    const r = await post(deps({ token: null }), "/v1/check", { tx_blob: codec.encodeForSigning(payment(1)) });
    expect(r.body).toMatchObject({ action: "APPROVE", ledgerIndex: main.ledger.ledger_index, receipt: { seenFrom: "tx_blob" } });
  });

  it("requires the bearer token when one is set, and answers 400 to a body that is not JSON", async () => {
    expect((await post(deps({ token: TOKEN }), "/v1/check", { tx_json: payment(1) })).status).toBe(401);
    expect((await post(deps({ token: TOKEN }), "/v1/check", { tx_json: payment(1) }, { authorization: "Bearer wrong" })).status).toBe(401);
    expect((await post(deps({ token: TOKEN }), "/v1/check", { tx_json: payment(1) }, { authorization: `Bearer ${TOKEN}` })).body.action).toBe("APPROVE");
    expect((await post(deps({ token: null }), "/v1/check", "not json")).status).toBe(400);
  });

  it("is off unless enabled, and the Fireblocks routes are off without their keys", async () => {
    expect((await post(deps(null), "/v1/check", { tx_json: payment(1) })).status).toBe(404);
    expect((await post(deps({ token: null }), "/v2/tx_sign_request", "x.y.z")).status).toBe(404);
  });

  it("never listens beyond loopback without a token", () => {
    expect(checkSettings({ listen: { host: "0.0.0.0", port: 1 } })).toBeNull();
    expect(checkSettings({ listen: { host: "127.0.0.1", port: 1 }, check: { enabled: true } })).toEqual({ token: null });
    expect(() => checkSettings({ listen: { host: "0.0.0.0", port: 1 }, check: { enabled: true } })).toThrow(/beyond loopback/);
    process.env.PRESIGN_TEST_SHORT = "short";
    expect(() => checkSettings({ listen: { host: "0.0.0.0", port: 1 }, check: { enabled: true, tokenEnv: "PRESIGN_TEST_SHORT" } })).toThrow(/32 characters/);
    process.env.PRESIGN_TEST_TOKEN = TOKEN;
    expect(checkSettings({ listen: { host: "0.0.0.0", port: 1 }, check: { enabled: true, tokenEnv: "PRESIGN_TEST_TOKEN" } })).toEqual({ token: TOKEN });
  });

  it("an unreadable ledger is RETRY here too", async () => {
    const r = await post(deps({ token: null }, { gather: async () => { throw new Error("timeout"); } }), "/v1/check", { tx_json: payment(1) });
    expect(r.body.action).toBe("RETRY");
  });
});

describe("transactions copied from a ledger reply", () => {
  it("drop API-only fields, so Bitstamp's activation payment hashes to its real transaction hash", async () => {
    const { withoutApiFields } = await import("../tools/presign-guard/guard.ts");
    const reply = main.account_tx_first_destination.transactions[0].tx;
    const tx = withoutApiFields(reply);
    expect(Object.keys(tx)).not.toContain("ctid");
    expect(tx.Amount).toBe("2000000000");
    // The ledger's own transaction ID is SHA-512Half of "TXN\0" + the signed blob.
    const { createHash } = await import("node:crypto");
    const id = createHash("sha512").update(Buffer.from("54584E00" + codec.encode(tx), "hex")).digest().subarray(0, 32).toString("hex").toUpperCase();
    expect(id).toBe(reply.hash);
  });
});

describe("simulation under load (live run, 2026-11-19, ledger 108439461)", () => {
  it("a fee-only refusal is simulated again at the open-ledger fee, and the fee is noted", () => {
    // What check.ts printed for the tagged payment to Bitstamp at a 12-drop fee:
    // both servers first answered telCAN_NOT_QUEUE, then tesSUCCESS at 5041 drops.
    const sims = ["https://s1.ripple.com/", "https://xrplcluster.com/"].map((server, i) => ({
      server, engineResult: "tesSUCCESS", ledgerIndex: 108439462 + i, feeRaised: { from: "12", to: "5041", firstAnswer: "telCAN_NOT_QUEUE" },
    }));
    const f = simulationFindings(sims);
    expect(f.map((x) => x.id)).toEqual(["fee_below_open_ledger", "simulated_ok"]);
    expect(f[0].detail).toMatch(/12 drops.*telCAN_NOT_QUEUE.*5041 drops/);
  });
  it("the fee-only answers are the ones that get a second simulation", async () => {
    const { FEE_ONLY } = await import("../tools/presign-guard/ledger.ts");
    expect(FEE_ONLY.has(sdk.simulate.engine_result)).toBe(true); // telCAN_NOT_QUEUE, from Testnet
    expect(FEE_ONLY.has(main.simulate_no_tag.s1.engine_result)).toBe(false); // tecDST_TAG_NEEDED
  });
});
