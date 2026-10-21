/*
 * Screenshots of the desktop app for the website, taken on live XRPL
 * mainnet.
 *
 * Runs the app's web build (`vite preview` of dist/) in Chromium, waits
 * until it is connected to mainnet, and drives four screens with real
 * inputs. Nothing is staged: if the app is not connected, or a screen
 * does not reach a real result, the script fails and writes nothing, so
 * the site never shows an offline or empty app.
 *
 * Output: site/assets/shots/<name>.webp (1440 wide) and <name>@2x.webp,
 * plus manifest.json recording the ledger and time each was read at.
 *
 *   npx vite build && npx vite preview --port 4174 &
 *   node scripts/capture-app-shots.mjs
 *
 * .github/workflows/app-screenshots.yml runs this on a GitHub runner,
 * which can reach mainnet.
 */
import { chromium } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.APP_URL || "http://localhost:4174/";
const OUT = process.env.SHOTS_DIR || "site/assets/shots";
// Bitstamp's USD issuer: a long-lived, public institutional account.
const ACCOUNT = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";

const sharp = (await import("sharp")).default;
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const text = async () => page.locator("body").innerText();
async function until(test, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await test(await text())) return;
    await page.waitForTimeout(500);
  }
  throw new Error(`Timed out waiting for ${what}`);
}
async function go(label) {
  await page.getByRole("button", { name: new RegExp(`^${label}`, "i") }).first().click();
  await page.waitForTimeout(1200);
}
function ledgerOf(body) {
  const m = body.match(/ledger ([\d,]{9,})/i) || body.match(/LGR\s+([\d,]{9,})/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

const shots = [];
async function shoot(name, alt) {
  // Let any last data render and the cursor leave the frame.
  await page.mouse.move(1430, 450);
  await page.waitForTimeout(1500);
  const body = await text();
  if (/DEGRADED|RECONNECTING|Ledger link offline/i.test(body)) throw new Error(`${name}: the app is not connected to mainnet`);
  const png = await page.screenshot({ type: "png" });
  shots.push({ name, alt, png, ledger: ledgerOf(body), at: new Date().toISOString() });
  console.log(`captured ${name} at ledger ${ledgerOf(body) ?? "?"}`);
}

await page.goto(BASE);
const start = page.getByRole("button", { name: /get started/i }).first();
await page.waitForTimeout(3000);
if (await start.count()) await start.click();
await until((b) => /CONNECTED · XRPL MAINNET/i.test(b) && /is real/i.test(b), 60_000, "a live mainnet connection");
// The getting-started card is for first runs; the screenshot shows the product.
const hide = page.getByRole("button", { name: /^hide$/i }).first();
if (await hide.count()) await hide.click();
await shoot("overview", "NOSHASHI desktop app overview, connected to XRPL mainnet, showing how much of the Bitstamp USD order book can actually fill.");

await go("VERIFICATION");
await page.getByPlaceholder(/^r…/).first().fill(ACCOUNT);
await page.getByRole("button", { name: /^1,000$/ }).first().click();
await page.getByRole("button", { name: /RUN COMPLIANCE GATE/i }).first().click();
await until((b) => !/NO EVALUATION YET/.test(b) && /\b(GO|HOLD|NO-GO)\b/.test(b), 60_000, "a gate verdict");
await shoot("verification", "Verification screen: a 1,000 XRP settlement to Bitstamp's account evaluated against a rule profile, with the verdict and its reasons.");

await go("AUDIT TRAIL");
await page.getByLabel(/Account to audit/i).fill(ACCOUNT);
await page.getByRole("button", { name: /READ HISTORY/i }).click();
await until((b) => /[1-9][\d,]* OF [\d,]+ RECORDS/i.test(b), 90_000, "audit records");
await shoot("audit", "Audit trail screen: an account's validated payment history with delivered amounts and counterparty screening.");

await go("CHECK AN ADDRESS");
await page.getByPlaceholder(/^r…$/).first().fill(ACCOUNT);
await page.getByRole("button", { name: /CHECK THIS ADDRESS/i }).click();
await page.waitForTimeout(8000);
await shoot("address", "Address check: what an XRPL account is, who controls it and what it can do, read from the ledger.");

await browser.close();
if (errors.length) console.log("page errors:", errors);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const manifest = { network: "XRPL mainnet", source: "NOSHASHI desktop app (web build)", shots: [] };
for (const s of shots) {
  await writeFile(join(OUT, `${s.name}@2x.webp`), await sharp(s.png).webp({ quality: 80 }).toBuffer());
  await writeFile(join(OUT, `${s.name}.webp`), await sharp(s.png).resize({ width: 1440 }).webp({ quality: 82 }).toBuffer());
  manifest.shots.push({ name: s.name, alt: s.alt, ledger: s.ledger, captured_at: s.at });
}
await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${shots.length} screenshots to ${OUT}`);
