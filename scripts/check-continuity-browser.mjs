import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = new URL(process.argv[2] ?? "http://127.0.0.1:1430/continuity/");
assert.equal(url.protocol, "http:");
assert.equal(url.hostname, "127.0.0.1", "Run the browser check against a local Continuity build");
const source = "rrrrrrrrrrrrrrrrrrrrrhoLvTp";
const destination = "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY";
const rlusdIssuer = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const rlusdCurrency = "524C555344000000000000000000000000000000";
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
  let ledgerIndex = 500;
  let destinationTagRequired = false;
  page.on("pageerror", error => errors.push(error.message));
  await page.routeWebSocket(/^wss:\/\//, socket => {
    endpoints.push(new URL(socket.url()).hostname);
    socket.onMessage(message => {
      const { id, command, account, ripple_state: trustLine } = JSON.parse(String(message));
      const reply = result => socket.send(JSON.stringify({ id, status: "success", type: "response", result }));
      const pin = { validated: true, ledger_index: ledgerIndex, ledger_hash: ledgerIndex.toString(16).padStart(64, "0") };
      if (command === "ledger") {
        ledgerRequests += 1;
        const validated = { ...pin, ledger: pin };
        if (delayLedger) {
          holdLedgerRequest = () => reply(validated);
          ledgerHeld();
        }
        else reply(endpoints.length === 1 ? {} : validated);
      } else if (command === "account_info") {
        const flags = account === destination && destinationTagRequired ? 0x00020000 : 0;
        reply({ ...pin, account_data: { LedgerEntryType: "AccountRoot", Account: account, Balance: "50000000", OwnerCount: 1, Sequence: 8, Flags: flags } });
      } else if (command === "ledger_entry") {
        assert.equal(trustLine.currency, rlusdCurrency);
        assert.equal(trustLine.accounts[0], rlusdIssuer);
        reply({ ...pin, node: { LedgerEntryType: "RippleState", Flags: 0,
          LowLimit: { issuer: trustLine.accounts[1], currency: rlusdCurrency },
          HighLimit: { issuer: rlusdIssuer, currency: rlusdCurrency } } });
      } else if (command === "fee") {
        reply({ drops: { open_ledger_fee: "10" } });
      } else if (command === "server_info") {
        reply({ info: { validated_ledger: { seq: ledgerIndex, reserve_base_xrp: 1, reserve_inc_xrp: 0.2 } } });
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

  await page.context().setOffline(false);
  delayLedger = false;
  const rlusd = { ...intent, asset: { currency: rlusdCurrency, issuer: rlusdIssuer } };
  await input.fill(JSON.stringify(rlusd));
  await run();
  await page.getByText("UNKNOWN", { exact: true }).waitFor();
  ledgerIndex = 501;
  destinationTagRequired = true;
  await run();
  await page.getByText("CHANGED", { exact: true }).waitFor();
  await page.getByText("Destination tag required · No → Yes", { exact: true }).waitFor();
  await page.getByText("NO-GO", { exact: true }).first().waitFor();
  await input.fill(JSON.stringify({ ...rlusd, requestId: "different-rlusd-intent" }));
  await run();
  await page.getByText("UNKNOWN", { exact: true }).waitFor();
  assert.equal(await page.getByText("CHANGED", { exact: true }).count(), 0, "Comparison must not carry across intents");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal page overflow at 390px");
  assert.deepEqual(errors, []);
  console.log("Continuity Chromium checks passed: malformed input, alternate provider retry, stale-result suppression, offline HOLD, same-intent RLUSD condition changes, and 390px layout.");
  await page.getByRole("link", { name: "Continuity demonstration" }).click();
  await page.waitForURL("**/continuity/demo/index.html");
} finally {
  await browser.close();
}
