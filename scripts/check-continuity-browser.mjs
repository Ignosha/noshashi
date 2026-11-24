import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = new URL(process.argv[2] ?? "http://127.0.0.1:1430/continuity/");
assert.equal(url.protocol, "http:");
assert.equal(url.hostname, "127.0.0.1", "Run the browser check against a local Continuity build");
const source = "rrrrrrrrrrrrrrrrrrrrrhoLvTp";
const destination = "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
const intent = {
  schema: "noshashi.continuity.intent.v1", network: "xrpl-mainnet",
  tenantId: "synthetic-tenant", requestId: "synthetic-request", transactionType: "Payment",
  sourceAccount: source, destinationAccount: destination, asset: { currency: "XRP", issuer: null },
  amount: "100", destinationTag: null, lastLedgerSequence: 1000, signingPayloadSha256: "a".repeat(64),
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, reducedMotion: "reduce" });
  const errors = [];
  const endpoints = [];
  let holdLedgerRequest;
  let ledgerHeld;
  let delayLedger = false;
  let ledgerRequests = 0;
  page.on("pageerror", error => errors.push(error.message));
  await page.routeWebSocket(/^wss:\/\//, socket => {
    endpoints.push(new URL(socket.url()).hostname);
    socket.onMessage(message => {
      const { id, command, account } = JSON.parse(String(message));
      const reply = result => socket.send(JSON.stringify({ id, status: "success", type: "response", result }));
      if (command === "ledger") {
        ledgerRequests += 1;
        const validated = { validated: true, ledger: { ledger_index: 500, ledger_hash: "F".repeat(64) } };
        if (delayLedger) {
          holdLedgerRequest = () => reply(validated);
          ledgerHeld();
        }
        else reply(endpoints.length === 1 ? {} : validated);
      } else if (command === "account_info") {
        reply({ ledger_index: 500, validated: true, account_data: { Account: account, Balance: "50000000", OwnerCount: 1, Sequence: 8, Flags: 0 } });
      } else if (command === "fee") {
        reply({ drops: { open_ledger_fee: "10" } });
      } else if (command === "server_info") {
        reply({ info: { validated_ledger: { seq: 500, reserve_base_xrp: 1, reserve_inc_xrp: 0.2 } } });
      } else {
        assert.equal(command, "subscribe", "A fixture run must only perform expected XRPL reads");
        reply({});
      }
    });
  });

  await page.goto(url.href);
  const input = page.getByLabel("Transaction intent (JSON)");
  const run = () => page.getByRole("button", { name: "Run read-only review" }).click();
  const status = page.getByRole("status");
  await input.fill("{");
  await run();
  assert.match(await page.getByRole("alert").innerText(), /valid JSON/);
  await input.fill(JSON.stringify({ ...intent, amount: 100 }));
  await run();
  assert.match(await page.getByRole("alert").innerText(), /positive decimal string/);
  await input.fill("x".repeat(32_769));
  await run();
  assert.match(await page.getByRole("alert").innerText(), /32,768 characters/);
  assert.equal(ledgerRequests, 0, "Malformed input must not cause a network read");

  await input.fill(JSON.stringify(intent));
  await run();
  await status.filter({ hasText: /Validated ledger evidence is unavailable/ }).waitFor();
  await page.getByText("HOLD", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Retry XRPL review" }).click();
  await status.filter({ hasText: /validated ledger 500/ }).waitFor();
  assert.equal(new Set(endpoints).size, 2, "The retry should rotate to an alternate provider");
  await page.getByText("Ledger checks passed", { exact: true }).first().waitFor();
  assert.equal(await page.getByText("GO", { exact: true }).count(), 0, "Ledger checks cannot grant GO");

  delayLedger = true;
  const held = new Promise(resolve => { ledgerHeld = resolve; });
  await run();
  await status.filter({ hasText: /Reading XRPL/ }).waitFor();
  await held;
  await input.fill(JSON.stringify({ ...intent, requestId: "changed-during-read" }));
  assert.ok(holdLedgerRequest, "Review sent a pending ledger request before the edit");
  holdLedgerRequest();
  await page.getByRole("button", { name: "Run read-only review" }).waitFor();
  await page.getByText("No transaction selected").waitFor();
  assert.equal(await page.getByText("Ledger checks passed", { exact: true }).count(), 0);

  await page.context().setOffline(true);
  const beforeOffline = ledgerRequests;
  await run();
  await status.filter({ hasText: /Validated ledger evidence is unavailable/ }).waitFor();
  assert.equal(ledgerRequests, beforeOffline, "Offline review must not request live ledger evidence");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal page overflow at 390px");
  assert.deepEqual(errors, []);
  console.log("Continuity Chromium checks passed: malformed input, alternate provider retry, stale-result suppression, offline HOLD, and 390px layout.");
} finally {
  await browser.close();
}
