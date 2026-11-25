import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:1430/continuity/demo/");
if (base.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(base.hostname)) {
  throw new Error("Rehearse against a loopback build of Continuity.");
}
const screenshotDirectory = process.argv[3];
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
const sha = value => createHash("sha256").update(canonical(value)).digest("hex").toUpperCase();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce" });
  const external = [];
  const errors = [];
  await context.route("**/*", route => {
    const origin = new URL(route.request().url()).origin;
    if (origin === base.origin) return route.continue();
    external.push(origin);
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  const screenshot = async name => {
    if (screenshotDirectory) await page.screenshot({ path: join(screenshotDirectory, `${name}.png`), fullPage: true });
  };
  await page.goto(base.href);
  await page.getByRole("heading", { name: "Continuity demonstration" }).waitFor();
  await testRelativeWorkspaceLink(page);
  await page.goto(base.href);
  await context.setOffline(true);

  await page.getByRole("button", { name: "Run payment review" }).click();
  await page.getByText("tesSUCCESS", { exact: true }).waitFor();
  await page.getByText("HOLD · No invoice supplied", { exact: true }).waitFor();
  assert.equal(await page.getByText("0.067791435856414 SOLO", { exact: true }).count(), 2);
  await page.getByRole("button", { name: "Verify receipt digest" }).click();
  await page.getByText("Digest matches", { exact: true }).waitFor();
  const [download] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: "Export receipt JSON" }).click(),
  ]);
  const receipt = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(receipt.evidenceDigest, sha(receipt.evidence));
  assert.equal(receipt.evidence.paymentEvidenceDigest, sha(receipt.evidence.payment));
  await screenshot("01-recorded-payment-and-receipt");

  await page.getByRole("button", { name: "RLUSD intelligence" }).click();
  await page.getByText("rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", { exact: true }).waitFor();
  await page.getByText("Unknown in this snapshot", { exact: true }).waitFor();
  await screenshot("02-rlusd-issuer");

  await page.getByRole("button", { name: "Wallet handoff" }).click();
  await page.getByRole("button", { name: "Assess simulated intent" }).click();
  await page.getByText("HOLD", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Simulate new tag requirement" }).click();
  await page.getByText("NO-GO", { exact: true }).waitFor();
  await page.getByText("The destination now requires a tag. This intent has none.", { exact: true }).waitFor();
  await screenshot("03-wallet-handoff-tag-change");

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(external, [], "No external request should be made in the offline demo");
  assert.deepEqual(errors, [], "No page error should occur");
  console.log("Continuity browser rehearsal passed: local navigation, offline historical review, independent receipt digest, RLUSD issuer, simulated tag-change HOLD/NO-GO, and narrow layout.");
} finally {
  await browser.close();
}

async function testRelativeWorkspaceLink(page) {
  const next = new URL("../index.html", base).href;
  const link = page.getByRole("link", { name: "Continuity workspace" });
  assert.equal(new URL(await link.getAttribute("href"), base).href, next);
  await Promise.all([page.waitForURL(next), link.click()]);
  await page.locator("#root > *").first().waitFor();
}
