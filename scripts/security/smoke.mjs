import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const out = process.argv[2] || "/tmp/noshashi-security-smoke";
await mkdir(out, { recursive: true });
const fixture = JSON.parse(
  await readFile(
    new URL(
      "../../src/lib/security/__tests__/hardening.mainnet.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const address = fixture.multisig_account_info.account_data.Account;
const issuer = fixture.bitstamp_account_info.account_data.Account;
const id = "A".repeat(64);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
});
const checks = [];
const errors = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ fixture, address, issuer, id }) => {
      window.__ledger = 108000000;
      window.__changed = false;
      window.WebSocket = class {
        static OPEN = 1;
        static CONNECTING = 0;
        static CLOSED = 3;
        readyState = 0;
        onopen = null;
        onmessage = null;
        onclose = null;
        onerror = null;
        constructor() {
          setTimeout(() => {
            this.readyState = 1;
            this.onopen?.(new Event("open"));
          }, 25);
        }
        close() {
          this.readyState = 3;
          this.onclose?.(new Event("close"));
        }
        send(raw) {
          const q = JSON.parse(raw);
          let result = {};
          const credential = {
            LedgerEntryType: "Credential",
            index: "B".repeat(64),
            Issuer: issuer,
            Subject: address,
            CredentialType: "4B5943",
            Flags: 65536,
          };
          const domain = {
            LedgerEntryType: "PermissionedDomain",
            index: id,
            Owner: issuer,
            Sequence: 1,
            AcceptedCredentials: [
              { Credential: { Issuer: issuer, CredentialType: "4B5943" } },
            ],
          };
          if (q.command === "ledger")
            result = {
              ledger_index: window.__ledger,
              ledger: { ledger_index: window.__ledger, close_time: 850000000 },
              validated: true,
            };
          if (q.command === "account_objects")
            result = {
              validated: true,
              ledger_index:
                q.ledger_index === "validated"
                  ? window.__ledger
                  : q.ledger_index,
              account_objects: q.type === "credential" ? [credential] : [],
            };
          if (q.command === "ledger_entry")
            result = {
              validated: true,
              ledger_index: q.ledger_index,
              index: id,
              node: domain,
            };
          if (q.command === "account_info") {
            window.__ledger++;
            result = structuredClone(fixture.multisig_account_info);
            result.ledger_index = window.__ledger;
            if (window.__changed) result.account_data.RegularKey = issuer;
          }
          if (q.command === "account_tx")
            result = { transactions: fixture.multisig_account_tx_back };
          setTimeout(
            () =>
              this.onmessage?.({
                data: JSON.stringify({
                  id: q.id,
                  type: "response",
                  status: "success",
                  result,
                }),
              }),
            15,
          );
        }
      };
    },
    { fixture, address, issuer, id },
  );
  let timeout = true;
  await page.route("**/noshashi-ledger-registry/domains", (route) => {
    if (timeout) return;
    return route.fulfill({
      json: {
        domains: [
          {
            domain_id: id,
            owner: issuer,
            sequence: 1,
            accepted_credentials: [{ issuer, typeHex: "4B5943", type: "KYC" }],
            seen_ledger: 100,
            first_seen_at: "2026-01-01",
            removed_at: null,
          },
        ],
        status: { sweeps: [], domains: 1, credentials: 1, method: "fixture" },
      },
    });
  });
  await page.goto("http://localhost:1420/scripts/security/preview.html");
  await page.getByRole("heading", { name: /Find the control/ }).waitFor();
  await page.screenshot({
    path: out + "/security-overview-desktop.png",
    fullPage: true,
  });
  check(
    "Overview exposes implemented security workflows",
    (await page
      .getByRole("button", { name: /Signing control map/ })
      .count()) === 1,
  );
  await page
    .getByRole("navigation", { name: "Component review" })
    .getByRole("button", { name: "Signing map", exact: true })
    .click();
  await page.getByRole("button", { name: "READ CONTROLS" }).click();
  await page.getByLabel("Signer unavailability drill").waitFor();
  check(
    "Validated signing graph renders",
    await page.getByRole("img", { name: /Signing control paths/ }).isVisible(),
  );
  const boxes = page
    .getByLabel("Signer unavailability drill")
    .getByRole("checkbox");
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  check(
    "Signer-loss drill detects unreachable quorum",
    (await page.getByText(/QUORUM UNREACHABLE/).count()) === 1,
  );
  await page.screenshot({
    path: out + "/signing-map-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Component review" })
    .getByRole("button", { name: "Control changes", exact: true })
    .click();
  await page.getByRole("button", { name: "READ CONTROLS" }).click();
  await page.getByRole("button", { name: "USE CURRENT AS REFERENCE" }).click();
  await page.evaluate(() => {
    window.__changed = true;
  });
  await page.getByRole("button", { name: "READ CONTROLS" }).click();
  await page.getByText(/1 changed control field/).waitFor();
  check("Fresh key change compares against saved reference", true);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT COMPLETE EVIDENCE" }).click();
  await (await download).saveAs(out + "/controls-evidence.json");
  const evidence = JSON.parse(
    await readFile(out + "/controls-evidence.json", "utf8"),
  );
  check(
    "Evidence export preserves reference, current controls and changes",
    evidence.payload.changes[0].field === "regularKey" &&
      evidence.digest.length === 64,
  );
  const canonical=(value)=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')}}`:JSON.stringify(value??null);
  check('Exported evidence hash verifies independently in Node',createHash('sha256').update(canonical(evidence.payload)).digest('hex')===evidence.digest);
  const tampered=structuredClone(evidence.payload);tampered.current.flags++;
  check('Changing an exported control invalidates its digest',createHash('sha256').update(canonical(tampered)).digest('hex')!==evidence.digest);
  await page.screenshot({
    path: out + "/control-changes-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Component review" })
    .getByRole("button", { name: "Credential registry", exact: true })
    .click();
  await page
    .getByText(/did not respond within 8 seconds/)
    .waitFor({ timeout: 15000 });
  check("Directory timeout is actionable instead of a raw abort error", true);
  check(
    "Unavailable directory is not reported as no access",
    (await page.getByText(/Admission to other domains is unknown/).count()) ===
      1,
  );
  await page.screenshot({
    path: out + "/credential-directory-timeout.png",
    fullPage: true,
  });
  await page.getByLabel("Check a known domain ID directly").fill(id);
  await page
    .getByRole("button", { name: "CHECK DOMAIN ID", exact: true })
    .click();
  await page.getByText(/ADMITTED · ledger.*SHA-256/).waitFor();
  check("Direct domain check succeeds while directory is unavailable", true);
  timeout = false;
  await page.getByRole("button", { name: "RETRY DOMAIN DISCOVERY" }).click();
  await page.getByText(/1 admission among 1 live-checked domain/).waitFor();
  check("Directory retry completes and revalidates admission", true);
  await page.screenshot({
    path: out + "/credential-directory-recovered.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Credential read failure", exact: true })
    .click();
  await page
    .getByText("Credential objects unavailable: retry the ledger read.")
    .waitFor();
  check(
    "Held credential failure is visible",
    (await page.getByText("NO CREDENTIALS ON THIS ACCOUNT").count()) === 0,
  );
  await page
    .getByRole("button", { name: "Incident graph", exact: true })
    .click();
  check(
    "Incident graph labels attribution limits",
    await page.getByText(/not proof of stolen-fund attribution/).isVisible(),
  );
  await page.screenshot({
    path: out + "/incident-graph-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Integrated security center", exact: true })
    .click();
  const deskTab = page.getByRole("tab", { name: "SECURITY DESK", exact: true });
  await deskTab.waitFor();
  await deskTab.focus();
  await page.keyboard.press("ArrowRight");
  check(
    "Integrated tab strip supports arrow-key focus",
    await page
      .getByRole("tab", { name: "SIGNING MAP", exact: true })
      .evaluate(
        (el) =>
          document.activeElement === el &&
          el.getAttribute("aria-selected") === "true",
      ),
  );
  check(
    "Free signing map remains available in the real scene",
    await page
      .getByRole("button", { name: "READ CONTROLS", exact: true })
      .isVisible(),
  );
  await page.getByRole("tab", { name: "CONTROL CHANGES", exact: true }).click();
  await page.getByRole("region", { name: /requires an upgrade/ }).waitFor();
  check(
    "Paid control comparison respects the real free-account gate",
    (await page
      .getByRole("button", { name: "READ CONTROLS", exact: true })
      .count()) === 0,
  );
  await page.getByRole("tab", { name: "SECURITY DESK", exact: true }).click();
  await page.screenshot({
    path: out + "/integrated-security-center.png",
    fullPage: true,
  });
  await context.close();
  for (const [name, width] of [
    ["desktop", 1440],
    ["mobile", 390],
  ]) {
    const p = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("http://localhost:4326/cybersecurity/");
    await p.getByRole("heading", { name: /Know who can sign/ }).waitFor();
    check(
      name + " website has no horizontal overflow",
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p
      .getByRole("spinbutton", { name: "Highest-weight signers unavailable" })
      .fill("2");
    await p.getByRole("button", { name: /Run the local drill/ }).click();
    check(
      name + " public drill computes quorum loss",
      await p
        .getByRole("status")
        .innerText()
        .then((t) => t.includes("Quorum becomes unreachable")),
    );
    await p
      .getByRole("checkbox", { name: "Master key can sign alone" })
      .check();
    await p.getByRole("button", { name: /Run the local drill/ }).click();
    check(
      name + " lab detects direct-key bypass",
      await p
        .getByRole("status")
        .innerText()
        .then((t) => t.includes("can sign independently")),
    );
    await p.getByLabel("Signer weights, separated by commas").fill("0,1");
    await p.getByRole("button", { name: /Run the local drill/ }).click();
    check(
      name + " invalid inputs do not become a pass",
      await p
        .getByRole("status")
        .innerText()
        .then((t) => t.includes("Enter 1–8")),
    );
    await p.getByLabel("Signer weights, separated by commas").fill("1,1,1");
    await p.getByRole("button", { name: /Run the local drill/ }).click();
    await p.screenshot({
      path: out + "/cybersecurity-" + name + ".png",
      fullPage: true,
    });
    check(
      name + " no raw abort wording",
      !(await p.locator("body").innerText()).includes("AbortSignal"),
    );
    await p.close();
  }
  check("No uncaught browser errors", errors.length === 0);
  await writeFile(
    out + "/report.json",
    JSON.stringify(
      {
        scope:
          "Local component fixtures and public browser calculator; not native OS or production deployment testing.",
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(checks.length + " browser checks passed. " + out);
} finally {
  await browser.close();
}
