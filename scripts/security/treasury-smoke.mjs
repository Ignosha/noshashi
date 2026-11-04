import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const out = process.argv[2] || "/workspace/artifacts/noshashi-security-desk";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
});
const checks = [],
  errors = [];
const check = (name, ok) => {
  assert.ok(ok, name);
  checks.push(name);
};
const address = "rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX";
const destinations = [
  "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
  "rUUs1jns6tdUQwAABDJyHMUHvdGNvNADvJ",
  "rDS6r59hQ3X95a2jeguAdTRMvC3b5xaMan",
  "rfWPjcbY5QT2shRFY2SSQHFKPYSMzxaMaN",
  "r3LQQNg7hEdbbNK3w4ykfLRDQWAc7xAmAn",
  "r3zfz1qTMeDy69NygnNTZaGMe22DVXaMAN",
];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ address, destinations }) => {
      window.__treasuryLedger = 100;
      window.__notices = [];
      window.__nodeUnavailable = false;
      window.Notification = class {
        static permission = "granted";
        static requestPermission = async () => "granted";
        constructor(title, options) {
          window.__notices.push({ title, ...options });
        }
      };
      window.WebSocket = class {
        static OPEN = 1;
        static CONNECTING = 0;
        static CLOSED = 3;
        readyState = 0;
        constructor() {
          setTimeout(() => {
            this.readyState = 1;
            this.onopen?.(new Event("open"));
          }, 10);
        }
        close() {
          this.readyState = 3;
        }
        send(raw) {
          const q = JSON.parse(raw);
          const date = Math.floor(Date.now() / 1000) - 946684800;
          let result = {};
          if (q.command === "ledger")
            result = {
              validated: true,
              ledger_index: window.__treasuryLedger,
              ledger_hash: "B".repeat(64),
              ledger: { close_time: date },
            };
          if (q.command === "account_info")
            result = {
              validated: true,
              ledger_index: window.__treasuryLedger,
              account_data: { Account: address, Balance: "10000000000" },
            };
          if (q.command === "account_tx")
            result = {
              validated: true,
              ledger_index_min: q.ledger_index_min,
              ledger_index_max: q.ledger_index_max,
              transactions: destinations.map((destination, i) => ({
                validated: true,
                ledger_index: 101,
                hash: String(i + 1).repeat(64),
                tx_json: {
                  Account: address,
                  Destination: destination,
                  TransactionType: "Payment",
                  Amount: "400000000",
                  Fee: "12",
                  date,
                },
                meta: {
                  TransactionResult: "tesSUCCESS",
                  TransactionIndex: i,
                  delivered_amount: "400000000",
                  AffectedNodes: [
                    {
                      ModifiedNode: {
                        LedgerEntryType: "AccountRoot",
                        PreviousFields: {
                          Balance: String(
                            10000000000n - BigInt(i) * 400000012n,
                          ),
                        },
                        FinalFields: {
                          Account: address,
                          Balance: String(
                            10000000000n - BigInt(i + 1) * 400000012n,
                          ),
                        },
                      },
                    },
                  ],
                },
              })),
            };
          if(q.command === "account_tx") result.transactions = result.transactions.map(row=>{
            row.tx_json.DeliverMax=row.tx_json.Amount;delete row.tx_json.Amount;
            row.close_time_iso=new Date((row.tx_json.date+946684800)*1000).toISOString();delete row.tx_json.date;
            return row;
          });
          setTimeout(
            () =>
              this.onmessage?.({
                data: JSON.stringify(
                  window.__nodeUnavailable && q.command !== "subscribe"
                    ? {
                        id: q.id,
                        status: "error",
                        error: "notReady",
                        error_message: "Recorded node outage",
                      }
                    : { id: q.id, status: "success", type: "response", result },
                ),
              }),
            10,
          );
        }
      };
    },
    { address, destinations },
  );
  await page.route("**/auth/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.goto("http://localhost:1420/scripts/security/preview.html");
  const nav = page.getByRole("navigation", { name: "Component review" });
  await nav
    .getByRole("button", { name: "Treasury Guard", exact: true })
    .click();
  await page.getByRole("heading", { name: /Flag the movement/ }).waitFor();
  await page.getByLabel("Treasury source account").fill(address);
  await page
    .getByLabel("Single outflow limit (XRP)", { exact: true })
    .fill("1000");
  await page
    .getByLabel("Rolling outflow limit (XRP)", { exact: true })
    .fill("2000");
  await page
    .getByLabel("Split-transfer destination count", { exact: true })
    .fill("6");
  await page.getByRole("checkbox", { name: /Flag destinations/ }).uncheck();
  check(
    "Watch requires operator authorization acknowledgment",
    await page
      .getByRole("button", { name: "SAVE LOCAL WATCH AND RULES" })
      .isDisabled(),
  );
  await page.getByRole("checkbox", { name: /I operate this account/ }).check();
  await page
    .getByRole("button", { name: "SAVE LOCAL WATCH AND RULES" })
    .click();
  await page.getByText(/Watch and rules saved locally/).waitFor();
  await page
    .getByRole("button", { name: "READ WATCHES NOW", exact: true })
    .click();
  await page.getByText(/Monitoring starts/).waitFor();
  await page
    .getByRole("button", { name: "READ WATCHES NOW", exact: true })
    .waitFor({ state: "visible" });
  check(
    "Initial baseline does not fabricate past alerts",
    await page
      .getByText("No local findings recorded.", { exact: false })
      .isVisible(),
  );
  await page
    .getByRole("button", { name: "ENABLE / TEST DEVICE NOTIFICATIONS" })
    .click();
  await page.getByText(/Notification test: submitted/).waitFor();
  check(
    "Explicit notification test uses configured device only",
    await page.evaluate(
      () =>
        window.__notices.length === 1 &&
        !JSON.stringify(window.__notices).includes("rLdh"),
    ),
  );
  await page.evaluate(() => {
    window.__treasuryLedger = 101;
  });
  await page
    .getByRole("button", { name: "READ WATCHES NOW", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Window limit reached across multiple destinations",
      exact: true,
    })
    .waitFor();
  check(
    "Six-wallet split produces a review finding",
    await page
      .getByText("6 payment(s) · 6 destination(s)", { exact: false })
      .isVisible(),
  );
  check(
    "Payment alert notification submits after findings are persisted",
    await page.evaluate(
      () =>
        window.__notices.length === 2 &&
        JSON.parse(localStorage.getItem("noshashi:security.treasury.v1")).alerts
          .length === 2,
    ),
  );
  await page
    .getByRole("button", { name: "READ WATCHES NOW", exact: true })
    .click();
  await page.getByText(/Read attempt finished/).waitFor();
  check(
    "Repeated read does not duplicate native alerts",
    await page.evaluate(() => window.__notices.length === 2),
  );
  await page
    .getByRole("button", { name: "NOT RECOGNIZED — REVIEW", exact: true })
    .first()
    .click();
  check(
    "Unrecognized is a local review, without reversal claim",
    await page
      .getByText("NOT RECOGNIZED · VALIDATED PAYMENT EVIDENCE", {
        exact: false,
      })
      .isVisible(),
  );
  await page.getByRole("button", { name: "LOAD RULES", exact: true }).click();
  await page.getByLabel("Treasury unsigned proposal").fill(
    JSON.stringify({
      TransactionType: "Payment",
      Account: address,
      Destination: destinations[0],
      Amount: "1000000000",
    }),
  );
  await page
    .getByRole("button", { name: "REVIEW AGAINST SAVED RULES" })
    .click();
  await page
    .getByText("REVIEW REQUIRED — no enforced hold", { exact: true })
    .waitFor();
  check(
    "Pre-sign preview cannot pretend to enforce a hold",
    (await page.getByText(/NO STATIC RULE TRIGGERED/).count()) === 0 &&
      (await page
        .getByText("Not checked: Current balance and percentage threshold", {
          exact: true,
        })
        .isVisible()),
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "EXPORT COMPLETE LOCAL EVIDENCE" })
    .click();
  const download = await downloadPromise;
  const evidence = JSON.parse(await readFile(await download.path(), "utf8"));
  const canonical = (v) =>
    v === null || typeof v !== "object"
      ? JSON.stringify(v)
      : Array.isArray(v)
        ? "[" + v.map(canonical).join(",") + "]"
        : "{" +
          Object.keys(v)
            .sort()
            .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
            .join(",") +
          "}";
  check(
    "Export hash matches complete canonical policy/flow/review payload",
    createHash("sha256").update(canonical(evidence.evidence)).digest("hex") ===
      evidence.sha256 &&
      evidence.evidence.payload.alerts.some(
        (a) => a.review === "not_recognized",
      ),
  );
  await page.screenshot({
    path: out + "/treasury-guard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: out + "/treasury-guard-mobile.png",
    fullPage: true,
  });
  check(
    "Treasury forms and evidence fit mobile width",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.evaluate(() => {
    window.__nodeUnavailable = true;
  });
  await page
    .getByRole("button", { name: "READ WATCHES NOW", exact: true })
    .click();
  await page.getByText("READ UNAVAILABLE", { exact: true }).waitFor();
  check(
    "Node outage stays unavailable and preserves the review queue",
    await page
      .getByRole("heading", {
        name: "Window limit reached across multiple destinations",
        exact: true,
      })
      .isVisible(),
  );
  await page.evaluate(() => {
    window.__nodeUnavailable = false;
  });
  await page
    .getByRole("button", { name: "READ WATCHES NOW", exact: true })
    .click();
  await page
    .getByText("READ RETURNED — NO CLEARANCE IMPLIED", { exact: true })
    .waitFor();
  check("Retry recovers without issuing a safety clearance", true);
  await nav
    .getByRole("button", { name: "Integrated security center", exact: true })
    .click();
  await page.getByRole("tab", { name: "TREASURY GUARD", exact: true }).click();
  check(
    "Real Security Center exposes the free Treasury Guard workflow",
    await page.getByRole("heading", { name: /Flag the movement/ }).isVisible(),
  );
  check("No uncaught browser errors", errors.length === 0);
  await writeFile(
    out + "/treasury-report.json",
    JSON.stringify({ checks, errors, fixtures: true }, null, 2),
  );
  console.log(checks.length + " treasury browser checks passed");
} finally {
  await browser.close();
}
