/*
 * Presses RUN IT HERE on every Academy lab step that has one, in a real
 * browser, against the live XRP Ledger (mainnet and testnet), and fails if
 * any step could not read the ledger. Run by .github/workflows/academy-live.yml
 * on a runner that can reach the public nodes; writes a JSON report.
 *
 *   node scripts/academy/live-labs.cjs http://localhost:4180/academy/app/ report.json
 */
const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const [url, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  await page.goto(url);
  // Past the first-run setup.
  await page.getByRole("radio", { name: /A bit of everything/ }).check();
  await page.getByRole("button", { name: /START LEARNING/ }).click();
  await page.getByRole("button", { name: "Labs", exact: true }).click();
  const titles = await page.locator("main ul li button span.block.text-\\[12\\.5px\\]").allInnerTexts();
  const report = [];
  for (const title of titles) {
    await page.getByText(title, { exact: true }).click();
    const steps = Number((await page.getByText(/^STEP 1 OF \d+$/).innerText()).match(/OF (\d+)/)[1]);
    for (let n = 1; n <= steps; n += 1) {
      const run = page.getByRole("button", { name: /^RUN IT HERE/ });
      if (await run.count()) {
        let entry;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          await run.click();
          await page.waitForFunction(() => !document.body.innerText.includes("READING THE LEDGER…"), null, { timeout: 120000 });
          const panel = await page.locator("[aria-live=polite]").first().innerText();
          const unreachable = /could not be reached|You are offline/.test(panel);
          entry = { lab: title, step: n, ok: !unreachable, headline: panel.replace(/\s+/g, " ").trim().slice(0, 160), attempt };
          if (!unreachable) break;
        }
        report.push(entry);
        console.log(`${entry.ok ? "LIVE" : "FAIL"}  ${title} · step ${n}: ${entry.headline}`);
      }
      if (n < steps) await page.getByRole("button", { name: /NEXT STEP/ }).click();
    }
    await page.getByRole("button", { name: /ALL LABS/ }).click();
  }
  await browser.close();
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  const failed = report.filter((r) => !r.ok);
  console.log(`${report.length - failed.length} of ${report.length} live readings succeeded`);
  if (!report.length || failed.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
