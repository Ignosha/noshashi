#!/usr/bin/env node
/**
 * The translation catalogue: every English sentence the site can show.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/build-site.mjs
 *   node scripts/extract-i18n.mjs [--live <dir>]
 *
 * Writes site/data/i18n/text/catalog.json, the list of keys every
 * site/data/i18n/text/<lang>.json has to translate
 * (src/lib/__tests__/i18n-catalog.test.ts fails CI on a gap).
 *
 * How it sees "everything": each page is opened in Chromium with the
 * real site/assets/i18n.js set to a language whose catalogue is empty,
 * so every unit misses and the engine records it — keyed exactly as the
 * engine will later look it up. The engine's MutationObserver records
 * text that scripts write after load too, so the extractor also drives
 * the page: opens the support console and the phone menu, flips the
 * billing period, and runs every free tool through each branch its
 * code has, answering the tools' ledger requests from the scenarios
 * below. Those answers exist only to reach each sentence a tool can
 * print; nothing here is shown to anyone.
 *
 * --live <dir> adds pages saved from production (the market section
 * needs data this build environment cannot reach), read the same way.
 *
 * Strings no page can be made to show here (server messages, the
 * support knowledge base) are added from their source.
 */
import { createServer } from "node:http";
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { ENTRIES, answer } from "../api/_lib/kb.js";
import { certificateFrom } from "../api/_lib/authority.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const OUT = join(SITE, "data/i18n/text/catalog.json");
const liveIndex = process.argv.indexOf("--live");
const LIVE = liveIndex > 0 ? resolve(process.argv[liveIndex + 1]) : null;
const LANG = "xx";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".webp": "image/webp", ".woff2": "font/woff2", ".pdf": "application/pdf",
};

/* ── Pages ────────────────────────────────────────────────────────── */

async function pages(dir, base = "/") {
  const out = [];
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    if ((await stat(full)).isDirectory()) {
      if (name === "data" || name === "assets" || name === "fonts" || name === "docs") continue;
      out.push(...(await pages(full, `${base}${name}/`)));
    } else if (name === "index.html") out.push(base);
  }
  return out;
}

/* ── Server: the built site, plus the API answers the pages ask for. ─ */

let apiAnswer = null; // (path, body) => { status, json } for the current step

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let body = "";
  for await (const chunk of req) body += chunk;
  if (url.pathname === "/api/locale") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ suggested: "en", languages: [{ code: "en", native: "English" }] }));
  }
  if (url.pathname.startsWith("/api/")) {
    const a = apiAnswer ? await apiAnswer(url, body) : null;
    res.writeHead(a ? a.status : 404, { "content-type": "application/json" });
    return res.end(JSON.stringify(a ? a.json : {}));
  }
  let path = url.pathname;
  let root = SITE;
  if (path.startsWith("/__live/")) { root = LIVE; path = path.slice(7); }
  if (path.endsWith("/")) path += "index.html";
  try {
    let data = await readFile(join(root, path));
    // A page saved from production predates the markup that marks its
    // third-party and data text; mark it the same way the build now does.
    if (root === LIVE && path.endsWith(".html")) {
      data = String(data)
        .replace(/class="src"/g, 'class="src" translate="no"')
        .replace(/class="headline"/g, 'class="headline" data-i18n-live')
        .replace(/sha256 <span class="mono">/g, 'sha256 <span class="mono" translate="no">')
        .replace(/<p class="phash mono">/g, '<p class="phash mono" translate="no">')
        .replace(/(<article class="log-entry" data-kind="release">[\s\S]*?)<h3>([\s\S]*?)<p>/g,
          '$1<h3 data-i18n-live>$2<p data-i18n-live>');
    }
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const keys = new Map(); // key → Set of pages

function add(list, where) {
  for (const k of list) {
    if (!k || !/[A-Za-z]/.test(k.replace(/<\/?\d+\/?>/g, ""))) continue;
    if (!keys.has(k)) keys.set(k, new Set());
    keys.get(k).add(where);
  }
}

async function open(path, { width = 1440, height = 900, setup } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript((lang) => {
    try { localStorage.setItem("noshashi-lang", lang); } catch (e) {}
  }, LANG);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`  [${path}] ${e.message}`));
  // Routes have to exist before the page opens its sockets.
  if (setup) await setup(page);
  await page.goto(ORIGIN + path, { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.lang === "xx", null, { timeout: 10000 });
  await page.waitForTimeout(300);
  return { page, context };
}

/* Clicks go through the DOM rather than the pointer: the subscribe
   dialog and the language bar sit over parts of the page by design. */
const click = (page, sel) => page.$eval(sel, (el) => el.click()).catch(() => {});

async function harvest(page, where) {
  await page.waitForTimeout(250);
  add(await page.evaluate(() => window.__NOSHASHI_I18N_MISSING()), where);
}

/* ── Every page, as served. ───────────────────────────────────────── */

for (const path of await pages(SITE)) {
  const { page, context } = await open(path);
  await harvest(page, path);
  // The support console builds itself on open.
  if (await page.$(".support-launch")) {
    await click(page, ".support-launch");
    await harvest(page, path);
  }
  // Pricing: the annual figures and note only exist after the switch.
  if (await page.$("#cadence-annual")) { await click(page, "#cadence-annual"); await harvest(page, path); }
  await context.close();
  console.log(`read ${path}`);
}

// The phone menu is assembled by nav.js below 920px.
{
  const { page, context } = await open("/status/", { width: 390, height: 844 });
  await click(page, ".nav-menu-btn");
  await harvest(page, "menu");
  await context.close();
}

if (LIVE) {
  for (const path of await pages(LIVE)) {
    const { page, context } = await open(`/__live${path}`);
    await harvest(page, `live${path}`);
    await context.close();
    console.log(`read live ${path}`);
  }
}

/* ── The free tools, through every branch. ────────────────────────── */

const ADDR = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const ADDR2 = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const ADDR3 = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const HASH = "A".repeat(64);
const USD = (value, issuer = ADDR2) => ({ currency: "USD", issuer, value: String(value) });
const rpcOk = (result) => ({ result });
const rpcErr = (error) => ({ result: { error, status: "error" } });

/* One scenario answers each rpc method; `null` makes the node fail. */
let rpcScenario = {};

async function withRpc(page) {
  await page.route(/https:\/\/(xrplcluster\.com|xrpl\.ws|xrpl\.link)\/?$/, async (route) => {
    let method = "", params = {};
    try {
      const body = JSON.parse(route.request().postData() || "{}");
      method = body.method;
      params = (body.params || [])[0] || {};
    } catch {}
    const handler = rpcScenario[method];
    const out = typeof handler === "function" ? handler(params) : handler;
    if (out === undefined || out === null) return route.abort();
    return route.fulfill({ status: 200, contentType: "application/json",
      headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(out) });
  });
}

async function runForm(page, { input, value, submit, out, wait = 2500 }) {
  if (input) await page.fill(input, value);
  await click(page, submit);
  await page.waitForFunction(
    (sel) => { const el = document.querySelector(sel); return el && !el.hidden && !el.querySelector(".spin"); },
    out, { timeout: wait }
  ).catch(() => {});
  await page.waitForTimeout(200);
}

{
  const { page, context } = await open("/", { setup: withRpc });
  const where = "tools";

  /* Address check. */
  const acct = (Flags, extra = {}) => rpcOk({ account_data: { Account: ADDR, Flags, ...extra }, ledger_index: 90000000 });
  const signers = (quorum, weights) => rpcOk({ account_objects: [{ SignerQuorum: quorum,
    SignerEntries: weights.map((w) => ({ SignerEntry: { Account: ADDR3, SignerWeight: w } })) }] });
  const address = [
    { account_info: acct(0x00400000 | 0x00020000, { Domain: "6578616D706C652E636F6D" }),
      gateway_balances: rpcOk({ obligations: { USD: "1000", EUR: "5", BTC: "1", ETH: "2" } }),
      account_objects: signers(2, [2, 1]) },
    { account_info: rpcOk({ account_data: { Flags: 0x80000000, TransferRate: 1002000000 } }),
      gateway_balances: rpcOk({ obligations: { USD: "10" } }),
      account_objects: signers(2, [1, 1]) },
    { account_info: acct(0x00100000, { TransferRate: 1000000000 }),
      gateway_balances: rpcOk({}), account_objects: rpcOk({ account_objects: [] }) },
    { account_info: acct(0x00200000, { TransferRate: 4294967295 }),
      gateway_balances: null, account_objects: rpcOk({ account_objects: [] }) },
    { account_info: rpcErr("actNotFound") },
    { account_info: rpcErr("actMalformed") },
    { account_info: rpcErr("invalidParams") },
    { account_info: rpcErr("tooBusy") },
    { account_info: null },
  ];
  await runForm(page, { input: "#addr", value: "hello", submit: "#checkBtn", out: "#checkOut" });
  await harvest(page, where);
  for (const s of address) {
    rpcScenario = s;
    await runForm(page, { input: "#addr", value: ADDR, submit: "#checkBtn", out: "#checkOut", wait: 6000 });
    await harvest(page, where);
  }

  /* The payment tool lives on a tab. */
  await click(page, '.tab[aria-controls="pane-pay"]');
  const tx = (tx_json, meta) => rpcOk({ tx_json, meta });
  const pay = (Amount, meta, Flags = 0) => tx({ TransactionType: "Payment", Amount, Flags }, meta);
  const payments = [
    tx({ TransactionType: "OfferCreate" }, { TransactionResult: "tesSUCCESS" }),
    pay("1000000", { TransactionResult: "tesSUCCESS", delivered_amount: "unavailable" }),
    pay("1000000", { TransactionResult: "tecPATH_DRY" }),
    pay("1000000000000", { TransactionResult: "tesSUCCESS", delivered_amount: "1000" }, 0x00020000),
    pay(USD(100), { TransactionResult: "tesSUCCESS", delivered_amount: USD(50) }, 0x00020000),
    pay("5000000", { TransactionResult: "tesSUCCESS", delivered_amount: "5000000" }),
    pay("5000000", { TransactionResult: "tesSUCCESS" }),
    rpcErr("txnNotFound"),
    rpcErr("invalidTransaction"),
    null,
  ];
  await runForm(page, { input: "#txh", value: "123", submit: "#payBtn", out: "#payOut" });
  await harvest(page, where);
  for (const p of payments) {
    rpcScenario = { tx: p };
    await runForm(page, { input: "#txh", value: HASH, submit: "#payBtn", out: "#payOut", wait: 6000 });
    await harvest(page, where);
  }
  // Walking back for a partial payment: once with none, once with one.
  rpcScenario = { ledger_current: rpcOk({ ledger_current_index: 1000 }),
    ledger: rpcOk({ ledger: { transactions: [] } }) };
  await runForm(page, { submit: "#findPartial", out: "#payOut", wait: 15000 });
  await harvest(page, where);
  rpcScenario = { ledger_current: rpcOk({ ledger_current_index: 1000 }),
    ledger: rpcOk({ ledger: { transactions: [{ hash: HASH,
      tx_json: { TransactionType: "Payment", Amount: "1000000", Flags: 0x00020000 },
      meta: { TransactionResult: "tesSUCCESS", delivered_amount: "1000" } }] } }) };
  await runForm(page, { submit: "#findPartial", out: "#payOut", wait: 15000 });
  await harvest(page, where);

  /* Order book. */
  await click(page, '.tab[aria-controls="pane-book"]');
  const offer = (gets, funded) => ({ TakerGets: USD(gets), TakerPays: String(gets * 2000000),
    ...(funded === undefined ? {} : { taker_gets_funded: USD(funded) }) });
  const books = [
    rpcOk({ offers: [offer(100), offer(50)], ledger_index: 90000001 }),
    rpcOk({ offers: [offer(100), offer(100, 40), offer(100)], ledger_current_index: 90000002 }),
    rpcOk({ offers: [offer(100, 1), offer(100, 2)] }),
    rpcOk({ offers: [] }),
    rpcErr("tooBusy"),
    null,
  ];
  for (const b of books) {
    rpcScenario = { book_offers: b };
    await runForm(page, { submit: "#bookBtn", out: "#bookOut", wait: 6000 });
    await harvest(page, where);
  }

  /* Exposure. */
  await click(page, '.tab[aria-controls="pane-exp"]');
  const line = (balance, account, extra = {}) => ({ account, balance: String(balance), currency: "USD", ...extra });
  const issuers = (map) => (params) => (params.account in map ? map[params.account] : null);
  const noFreeze = rpcOk({ account_data: { Flags: 0x00200000 } });
  const canFreeze = rpcOk({ account_data: { Flags: 0 } });
  const exposures = [
    { account_lines: rpcOk({ lines: [] }) },
    { account_lines: rpcOk({ lines: [line(-5, ADDR2)] }) },
    { account_lines: rpcOk({ lines: [line(-5, ADDR2), line(-3, ADDR3)] }) },
    { account_lines: rpcOk({ lines: [line(10, ADDR2, { freeze_peer: true }), line(20, ADDR2), line(5, ADDR3), line(-1, ADDR)] }),
      account_info: issuers({ [ADDR2]: noFreeze, [ADDR3]: canFreeze }) },
    { account_lines: rpcOk({ lines: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => line(n, n % 2 ? ADDR2 : ADDR3))
        .concat([line(-1, ADDR), line(-2, ADDR)]) }),
      account_info: issuers({ [ADDR2]: canFreeze }) },
    { account_lines: rpcOk({ lines: [line(7, ADDR2)] }), account_info: issuers({ [ADDR2]: noFreeze }) },
    { account_lines: rpcOk({ lines: [line(7, ADDR2)] }), account_info: issuers({ [ADDR2]: canFreeze }) },
    { account_lines: rpcOk({ lines: [line(7, ADDR2, { freeze_peer: true }), line(8, ADDR3, { freeze_peer: true })] }),
      account_info: issuers({ [ADDR2]: canFreeze, [ADDR3]: canFreeze }) },
    { account_lines: rpcErr("actNotFound") },
    { account_lines: rpcErr("tooBusy") },
    { account_lines: null },
  ];
  await runForm(page, { input: "#expAddr", value: "nope", submit: "#expBtn", out: "#expOut" });
  await harvest(page, where);
  for (const e of exposures) {
    rpcScenario = e;
    await runForm(page, { input: "#expAddr", value: ADDR, submit: "#expBtn", out: "#expOut", wait: 6000 });
    await harvest(page, where);
  }

  /* NFT ids: flags, fee, issuer, taxon, sequence. */
  await click(page, '.tab[aria-controls="pane-nft"]');
  const nft = (flags, fee) => flags.toString(16).padStart(4, "0") + fee.toString(16).padStart(4, "0") +
    "B5F762798A53D543A014CAF8B297CFF8F2F937E8" + "00000001" + "00000002";
  await runForm(page, { input: "#nftId", value: "abc", submit: "#nftBtn", out: "#nftOut" });
  await harvest(page, where);
  for (const [flags, fee, info] of [
    [0x0001 | 0x0008, 500, rpcOk({ account_data: {} })],
    [0x0008 | 0x0010 | 0x0002, 0, rpcErr("actNotFound")],
    [0, 0, null],
  ]) {
    rpcScenario = { account_info: info };
    await runForm(page, { input: "#nftId", value: nft(flags, fee), submit: "#nftBtn", out: "#nftOut", wait: 6000 });
    await harvest(page, where);
  }
  await context.close();
}

/* The node comparison and the live ticker speak WebSocket. */
{
  let plan = {};
  const { page, context } = await open("/", { setup: (p) => p.routeWebSocket(/^wss:\/\//, (ws) => {
    const host = new URL(ws.url()).host;
    ws.onMessage((message) => {
      let m = {};
      try { m = JSON.parse(message); } catch {}
      if (m.command !== "ledger") return;
      const answer = plan[host];
      if (!answer) return ws.close();
      ws.send(JSON.stringify({ id: m.id, result: { ledger: { ledger_index: answer[0], ledger_hash: answer[1] } } }));
    });
  }) });
  await click(page, '.tab[aria-controls="pane-node"]');
  const H1 = "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789";
  const H2 = "123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0";
  const all = (a, b, c, d) => ({ "xrplcluster.com": a, "xrpl.ws": b, "s1.ripple.com": c, "s2.ripple.com": d });
  for (const p of [
    all([100, H1], [100, H1], [100, H1], [100, H1]),
    all([100, H1], [101, H2], [100, H1], [100, H1]),
    all([100, H1], [102, H2], [100, H1], [100, H1]),
    all([100, H1], [100, H2], [100, H1], [100, H1]),
    all([100, H1], null, [100, H1], null),
    all(null, null, null, null),
  ]) {
    plan = p;
    await runForm(page, { submit: "#nodeBtn", out: "#nodeOut", wait: 12000 });
    await harvest(page, "tools");
  }
  await context.close();
}

/* ── Forms that talk to this site's own API. ─────────────────────── */

async function formRun(path, answers, fill, submit, status) {
  const { page, context } = await open(path);
  for (const a of answers) {
    apiAnswer = () => a;
    await fill(page);
    await click(page, submit);
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return el && el.textContent.trim() && !/…$/.test(el.textContent.trim());
    }, status, { timeout: 4000 }).catch(() => {});
    await harvest(page, path);
  }
  apiAnswer = null;
  await context.close();
}

await formRun("/contact/", [
  { status: 200, json: { ok: true, message: "Message sent. You will get a reply at the address you gave." } },
  { status: 503, json: { error: "This form has no working delivery channel, so the message was not sent.", mailto: "support@noshashi.app" } },
  { status: 429, json: { error: "Too many messages from this address. Try again shortly." } },
], async (page) => {
  await page.fill("#name", "A reader");
  await page.fill("#email", "reader@example.com");
  await page.fill("#message", "A question about the product.");
  await page.evaluate(() => { window.__opened = 0; });
}, "#contact-send", "#contact-status");

const certSurfaces = [
  { unreadable: ["account_info: actNotFound"], posture: null, control: null },
  { unreadable: [], posture: null, control: null },
  { unreadable: [], posture: { noFreeze: true, globalFreeze: false, requireAuth: false, transferRateBps: 0 },
    control: { signers: { present: true, minimumSigners: 3, quorum: 5, unilateralSigners: [] }, masterKeyEnabled: false, regularKey: null },
    issuance: null },
  { unreadable: ["issuance: timeout"], posture: { noFreeze: false, globalFreeze: true, requireAuth: true, transferRateBps: 20 },
    control: { signers: { present: true, minimumSigners: 1, quorum: 2, unilateralSigners: [ADDR3] }, masterKeyEnabled: true, regularKey: null },
    issuance: null },
  { unreadable: [], posture: { noFreeze: true, globalFreeze: false, requireAuth: false, transferRateBps: 0 },
    control: { signers: { present: false, unreadable: "timeout" }, masterKeyEnabled: false, regularKey: null },
    issuance: { source: "ledger", currencies: [] } },
  { unreadable: [], posture: { noFreeze: true, globalFreeze: false, requireAuth: false, transferRateBps: 0 },
    control: { signers: { present: false }, masterKeyEnabled: false, regularKey: "rrrrrrrrrrrrrrrrrrrrBZbvji" },
    issuance: { source: "ledger", currencies: [{ currency: "USD", outstanding: 1000, coverage: 0.5 }] } },
  { unreadable: [], posture: { noFreeze: false, globalFreeze: false, requireAuth: false, transferRateBps: 0 },
    control: { signers: { present: false }, masterKeyEnabled: true, regularKey: ADDR3 },
    issuance: { source: "indexer", sourceName: "an indexer", currencies: [{ currency: "USD", outstanding: 1000,
      coverage: 1, hhi: 4000, holders: 120, topHolderPct: 40, topFivePct: 70 }] } },
  { unreadable: [], posture: { noFreeze: true, globalFreeze: false, requireAuth: false, transferRateBps: 0 },
    control: { signers: { present: false }, masterKeyEnabled: true, regularKey: null },
    issuance: { source: "ledger", currencies: [{ currency: "USD", outstanding: 1000, coverage: 0.99,
      hhi: 500, holders: 300, topHolderPct: 5, topFivePct: 20 }] } },
  { unreadable: [], posture: { noFreeze: true, globalFreeze: false, requireAuth: false, transferRateBps: 0 },
    control: { signers: { present: false }, masterKeyEnabled: false, regularKey: null },
    issuance: { source: "ledger", currencies: [{ currency: "USD", outstanding: 1000, coverage: 0.99,
      hhi: 500, holders: 300, topHolderPct: 5, topFivePct: 20 }] } },
  { unreadable: ["lines: timeout"], posture: { noFreeze: true, globalFreeze: false, requireAuth: false, transferRateBps: 0 },
    control: { signers: { present: false }, masterKeyEnabled: false, regularKey: null }, issuance: null },
];
const certs = [];
for (const s of certSurfaces) {
  certs.push({ status: 200, json: await certificateFrom({ issuer: ADDR, ledgerIndex: 90000000,
    readAt: "2026-09-23T12:00:00.000Z", issuance: null, ...s }) });
}
certs.push({ status: 502, json: { error: "Could not reach a public XRPL node. Try again shortly." } });
certs.push({ status: 400, json: { error: "That is not an XRPL classic address. They begin with r." } });
await formRun("/certificate/", certs, async (page) => {
  await page.fill("#issuer", ADDR);
}, "#cert-run", "#cert-out h2, #cert-status");
{
  const { page, context } = await open("/certificate/");
  for (const v of ["", "nope"]) {
    await page.fill("#issuer", v);
    await click(page, "#cert-run");
    await harvest(page, "/certificate/");
  }
  await page.$eval("#cert-walk", (el) => { el.checked = true; }).catch(() => {});
  apiAnswer = () => new Promise(() => {});
  await page.fill("#issuer", ADDR);
  await click(page, "#cert-run");
  await harvest(page, "/certificate/");
  apiAnswer = null;
  await context.close();
}

await formRun("/status/", [
  { status: 200, json: { ok: true, message: "Subscribed. Check your inbox." } },
  { status: 200, json: { ok: true, message: "Subscribed." } },
  { status: 200, json: { ok: true, message: "You're on the list." } },
  { status: 400, json: { error: "That does not look like an email address." } },
  { status: 503, json: { error: "The update list is not configured on this deployment yet, so nothing was saved." } },
  { status: 429, json: { error: "Too many attempts. Try again shortly." } },
  { status: 502, json: { error: "That did not save. Try again shortly." } },
  { status: 502, json: { error: "That did not save. Try again, or email support@noshashi.app." } },
], async (page) => {
  await page.fill("#subscribe-email", "reader@example.com");
}, "#subscribe-send", "#subscribe-status");

/* The support console: the reference answers, as the console renders them. */
{
  const { page, context } = await open("/status/");
  await click(page, ".support-launch");
  const replies = ENTRIES.map((e) => ({ reply: e.a, links: e.links || [], related: [], grounded: true, lang: "en" }));
  const fallback = answer("zzqx unrelated");
  replies.push({ reply: fallback.text, links: fallback.links, related: [], grounded: false, lang: "en" });
  replies.push({ reply: "That is more questions than this console will take in a minute. Try again shortly, or send it to the team.",
    links: [{ label: "Contact the team", href: "/contact/" }] });
  for (const r of replies) {
    apiAnswer = () => ({ status: 200, json: r });
    await page.fill("#ns-input", "question");
    await page.$eval("#ns-form", (f) => f.requestSubmit());
    await page.waitForTimeout(150);
  }
  apiAnswer = () => ({ status: 200, json: { reply: "", related: ENTRIES.map((e) => e.q) } });
  await page.fill("#ns-input", "question");
  await page.$eval("#ns-form", (f) => f.requestSubmit());
  await page.waitForTimeout(150);
  await harvest(page, "support");
  // Every question can come back as a suggestion button.
  add(await page.evaluate((qs) => qs.map((q) => window.__NOSHASHI_I18N_KEY(q)), ENTRIES.map((e) => e.q)), "support");
  apiAnswer = null;
  await context.close();
}

/* ── Strings no page here can be made to show. ───────────────────── */
{
  const { page, context } = await open("/status/");
  const plain = [
    // Relative times (api/_lib/html.js ago() and the in-page copies).
    "just now", "5m ago", "5h ago", "5d ago", "5mo ago", "5y ago",
    "UPDATED just now", "UPDATED 5m ago", "UPDATED 5h ago", "UPDATED 5d ago", "UPDATED 5mo ago", "UPDATED 5y ago",
    // The live ticker's states, and the pricing page's ledger age.
    "LIVE", "OFFLINE", "RECONNECTING", "5s ago",
    // Checkout (api/create-checkout-session.js and the page's own).
    "OPENING STRIPE…", "Checkout could not start.",
    "Too many checkout attempts. Try again in a minute.",
    "Card checkout is not configured on this deployment yet. Email support@noshashi.app and a subscription will be set up directly.",
    "Stripe did not respond. Try again, or email support@noshashi.app.",
    "Stripe declined the checkout request. The error has been logged.",
    // Contact validation (api/contact.js), every combination it can send.
    ...[["a name"], ["a valid email address"], ["a message of at least a few words"],
      ["a name", "a valid email address"], ["a name", "a message of at least a few words"],
      ["a valid email address", "a message of at least a few words"],
      ["a name", "a valid email address", "a message of at least a few words"]]
      .map((p) => `Please add ${p.join(", ")}.`),
    "That could not be read.", "Could not reach the server. Try again shortly.",
    "Could not reach the server. Email support@noshashi.app instead.", "That did not send.",
    "Pass ?issuer= an XRPL classic address.",
    // The support console's own fallbacks.
    "That did not get through. Email support@noshashi.app and it will reach a person.",
    "The console could not be reached. The contact form does not depend on it.",
  ];
  add(await page.evaluate((list) => list.map((s) => window.__NOSHASHI_I18N_KEY(s)), plain), "source");
  add([
    // The newsroom note when sources answer (the build here reaches none).
    "Merged from <0/>. Headlines link to the publisher and are reproduced as titles only. They are news about the XRP Ledger, not a NOSHASHI reading, and no verdict is implied by any of them.",
    "Merged from <0/>. Not answering: <1/>. Headlines link to the publisher and are reproduced as titles only. They are news about the XRP Ledger, not a NOSHASHI reading, and no verdict is implied by any of them.",
  ], "source");
  await context.close();
}

await browser.close();
server.close();

const sorted = [...keys.keys()].sort((a, b) => a.localeCompare(b));
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(sorted, null, 1) + "\n");
console.log(`wrote ${OUT.replace(ROOT + "/", "")}: ${sorted.length} keys`);
