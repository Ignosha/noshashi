import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { encode } from "ripple-binary-codec";
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
const address = "rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX",
  hash = "A".repeat(64);
const binary = encode({
  LedgerEntryType: "AccountRoot",
  Account: address,
  Flags: 0,
  Sequence: 1,
  Balance: "1000000",
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ binary, hash }) => {
      window.WebSocket = class {
        static OPEN = 1;
        readyState = 0;
        constructor() {
          setTimeout(() => {
            this.readyState = 1;
            this.onopen?.();
          }, 5);
        }
        send(text) {
          const q = JSON.parse(text);
          const result =
            q.command === "ledger"
              ? {
                  validated: true,
                  ledger_hash: hash,
                  ledger_index: 123,
                  ledger: {
                    close_time: Math.floor(Date.now() / 1000) - 946684800,
                  },
                }
              : {
                  validated: true,
                  ledger_hash: hash,
                  ledger_index: 123,
                  node_binary: binary,
                };
          setTimeout(
            () =>
              this.onmessage?.({ data: JSON.stringify({ id: q.id, result }) }),
            5,
          );
        }
        close() {
          this.readyState = 3;
        }
      };
    },
    { binary, hash },
  );
  let metadata = [];
  let unavailable = false;
  await page.route("https://api.osv.dev/**", async (route) => {
    metadata.push(route.request().postDataJSON());
    if (unavailable) return route.fulfill({ status: 503, body: "unavailable" });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ vulns: [{ id: "GHSA-example" }] }] }),
    });
  });
  await page.route("https://api.osv.dev/v1/vulns/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "GHSA-example",
        modified: "2026-11-01T00:00:00Z",
        summary: "Recorded advisory fixture, not a live package claim.",
        references: [{ url: "https://example.com/advisory" }],
      }),
    }),
  );
  await page.route("**/rest/v1/rpc/security_network_lookup", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        reports: [],
        evaluatedAt: new Date().toISOString(),
        limitation: "No report is not clearance.",
      }),
    }),
  );
  await page.goto("http://localhost:1420/scripts/security/preview.html");
  const nav = page.getByRole("navigation", { name: "Component review" });
  await nav
    .getByRole("button", { name: "Software exposure", exact: true })
    .click();
  await page
    .getByLabel("Software inventory JSON")
    .fill(
      JSON.stringify([
        {
          id: "private-label",
          name: "xrpl",
          version: "4.0.0",
          workflow: "Private workflow",
        },
      ]),
    );
  check(
    "Advisory requests require explicit consent",
    (await page
      .getByRole("button", { name: "CHECK EXPOSURE", exact: true })
      .isDisabled()) && metadata.length === 0,
  );
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "CHECK EXPOSURE", exact: true })
    .click();
  await page.getByRole("heading", { name: /GHSA-example/ }).waitFor();
  check(
    "OSV receives no workflow labels or asset IDs",
    !JSON.stringify(metadata).includes("Private") &&
      !JSON.stringify(metadata).includes("private-label"),
  );
  await page.screenshot({
    path: out + "/software-exposure-desktop.png",
    fullPage: true,
  });
  unavailable = true;
  await page
    .getByRole("button", { name: "CHECK EXPOSURE", exact: true })
    .click();
  await page.getByRole("alert").waitFor();
  check(
    "Unavailable advisory service is an error, not a pass",
    (await page.getByRole("alert").innerText()).includes("unknown"),
  );
  await nav
    .getByRole("button", { name: "Response notebook", exact: true })
    .click();
  await page.getByRole("button", { name: "CREATE READINESS NOTEBOOK" }).click();
  await page
    .getByLabel("Notebook passphrase")
    .fill("A separate long notebook passphrase");
  await page
    .getByLabel("Response owner role", { exact: true })
    .fill("Treasury lead");
  await page
    .getByLabel("Backup response role", { exact: true })
    .fill("Risk lead");
  await page
    .getByLabel("Official custodian or wallet-provider contact page")
    .fill("https://example.com/contact");
  await page
    .getByRole("button", { name: "SAVE ENCRYPTED ON THIS DEVICE" })
    .click();
  await page
    .getByText("Encrypted notebook saved and read back", { exact: false })
    .waitFor();
  check(
    "Persisted notebook contains no plaintext role or passphrase",
    await page.evaluate(() =>
      Object.values(localStorage).every(
        (v) =>
          !v.includes("Treasury lead") &&
          !v.includes("A separate long notebook passphrase"),
      ),
    ),
  );
  await page.screenshot({
    path: out + "/response-notebook-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "LOCK NOTEBOOK", exact: true })
    .click();
  await page
    .getByLabel("Notebook passphrase")
    .fill("An incorrect long passphrase");
  await page.getByRole("button", { name: "UNLOCK NOTEBOOK" }).click();
  await page.getByRole("alert").waitFor();
  check(
    "Wrong notebook passphrase fails closed",
    (await page.getByRole("alert").innerText()).includes("integrity"),
  );
  await page
    .getByLabel("Notebook passphrase")
    .fill("A separate long notebook passphrase");
  await page.getByRole("button", { name: "UNLOCK NOTEBOOK" }).click();
  await page.getByLabel("Response owner role", { exact: true }).waitFor();
  check(
    "Encrypted notebook unlocks with matching passphrase",
    (await page
      .getByLabel("Response owner role", { exact: true })
      .inputValue()) === "Treasury lead",
  );
  await nav
    .getByRole("button", { name: "Treasury scenarios", exact: true })
    .click();
  await page.getByRole("button", { name: /MODEL|RUN/ }).click();
  await page
    .getByRole("group", { name: "custodian-a", exact: true })
    .getByRole("checkbox", { name: "Assume compromised" })
    .check();
  await page
    .getByRole("group", { name: "custodian-a", exact: true })
    .getByRole("checkbox", { name: "Assume unavailable" })
    .check();
  check(
    "Shared custodian scenario separates compromise and outage",
    (await page
      .getByText("Scenario could authorize", { exact: true })
      .isVisible()) &&
      (await page
        .getByText("No modeled authorization path remains", { exact: true })
        .isVisible()),
  );
  await page.screenshot({
    path: out + "/treasury-scenarios-desktop.png",
    fullPage: true,
  });
  await nav
    .getByRole("button", { name: "Node comparison", exact: true })
    .click();
  await page.getByLabel("Integrity account address").fill(address);
  await page.getByRole("button", { name: "COMPARE NODE EVIDENCE" }).click();
  await page
    .getByRole("heading", { name: "AGREED · endpoint claims" })
    .waitFor();
  check(
    "Same-scope endpoint comparison completes",
    await page
      .getByText(/three endpoints do not establish three independent/)
      .isVisible(),
  );
  await page.screenshot({
    path: out + "/ledger-comparison-desktop.png",
    fullPage: true,
  });
  await nav
    .getByRole("button", { name: "Reviewed sharing", exact: true })
    .click();
  await page.getByLabel("Network lookup addresses").fill(address);
  await page.getByRole("button", { name: "READ REVIEWED REPORTS" }).click();
  await page.getByText(/0 reviewed indicator/).waitFor();
  check(
    "Empty report lookup is explicitly not a clearance",
    await page.getByText(/No report is not a clearance/).isVisible(),
  );
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await nav.getByRole("button", { name: "Overview", exact: true }).click();
    await page.screenshot({
      path: out + `/security-introduction-${viewport.width}.png`,
      fullPage: true,
    });
    check(
      `Security overview fits ${viewport.width}px`,
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.goto(
      "http://localhost:4326/cybersecurity/#institutional-security",
    );
    await page
      .getByRole("heading", { name: "Prepare. Compare. Respond." })
      .waitFor();
    await page.locator("#institutional-security").screenshot({ path: out + `/website-security-section-${viewport.width}.png` });
    await page.screenshot({
      path: out + `/website-security-introduction-${viewport.width}.png`,
      fullPage: true,
    });
    check(
      `Website introduction fits ${viewport.width}px`,
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.goto("http://localhost:1420/scripts/security/preview.html");
  }
  check("No uncaught browser errors", errors.length === 0);
  await writeFile(
    out + "/enterprise-report.json",
    JSON.stringify({ checks, errors, fixtures: true }, null, 2),
  );
  console.log(checks.length + " enterprise browser checks passed");
} finally {
  await browser.close();
}
