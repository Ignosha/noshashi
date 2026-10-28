/*
 * Runs every Academy lab in a real browser against the live XRP Ledger and
 * fails if any step could not be done. Run by .github/workflows/academy-live.yml
 * on a runner that can reach the public nodes; writes a JSON report.
 *
 *   node scripts/academy/live-labs.cjs http://localhost:4180/academy/app/ report.json
 *
 * NOSHASHI labs run in the lab workstation (the training copy of NOSHASHI
 * inside the Academy). For each step this presses OPEN ... ON THE
 * WORKSTATION, and where the screen does not read the handed-over value by
 * itself, presses the screen's own action button, the way a trainee would.
 * A step passes when the workstation reports its screen opened and, where
 * the step has a value, that the ledger answered a read of it. The testnet
 * lab keeps its practice bench, so its steps press RUN IT HERE.
 */
const { chromium } = require("playwright");
const fs = require("fs");

/** The action buttons NOSHASHI's screens use to read what was typed in. */
const ACTION = /^(CHECK|READ|RUN|VERIFY|TRACE|INSPECT|LOOK UP|ANALY[SZ]E|SEND|ASK|SCAN|CERTIFY|GENERATE|EVALUATE|SCREEN)/i;

async function objectives(page) {
  const items = await page.locator('section[aria-labelledby="ws-objectives"] li').allInnerTexts();
  return items.map((t) => ({ label: t.replace(/:\s*(done|not done yet)\s*$/i, "").replace(/^[✓○]\s*/, "").trim(), met: /: done\s*$/i.test(t) }));
}

async function waitFor(page, test, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await test()) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

/** Press the screen's own action button (the first enabled one), as a trainee would. Returns its label. */
async function pressAction(frame) {
  const buttons = frame.locator("main button:visible");
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const b = buttons.nth(i);
    const text = ((await b.innerText().catch(() => "")) || "").trim();
    if (ACTION.test(text) && (await b.isEnabled().catch(() => false))) {
      await b.click().catch(() => undefined);
      return text;
    }
  }
  return null;
}

async function workstationLab(page, title, report) {
  const frame = page.frameLocator('iframe[title^="NOSHASHI lab workstation"]');
  const steps = await page.locator('nav[aria-label="Steps"] button').count();
  for (let n = 1; n <= steps; n += 1) {
    await page.locator('nav[aria-label="Steps"] button').nth(n - 1).click();
    const open = page.getByRole("button", { name: /ON THE WORKSTATION$/ });
    await open.waitFor({ state: "visible" });
    await waitFor(page, () => open.isEnabled(), 60000);
    await open.click();
    const reads = (o) => o.find((x) => /^Read /.test(x.label));
    const met = async () => {
      const o = await objectives(page);
      return o[0]?.met && (!reads(o) || reads(o).met);
    };
    let done = await waitFor(page, met, 20000);
    let pressed = null;
    if (!done && reads(await objectives(page))) {
      // Type the step's values where the screen asks for them (by the
      // field's label, else into the first empty field), as a trainee
      // pastes them, then press the screen's own button.
      const rows = page.locator("#ws-instructions code[title]");
      for (let i = 0; i < (await rows.count()); i += 1) {
        const value = await rows.nth(i).getAttribute("title");
        const label = ((await rows.nth(i).locator("xpath=preceding-sibling::span[1]").innerText().catch(() => "")) || "").trim();
        const byLabel = label ? frame.getByLabel(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")) : null;
        if (byLabel && (await byLabel.count()) === 1) {
          await byLabel.fill(value).catch(() => undefined);
          continue;
        }
        const inputs = frame.locator("main input[type=text]:visible, main input:not([type]):visible, main textarea:visible");
        for (let j = 0; j < (await inputs.count()); j += 1) {
          if (!(await inputs.nth(j).inputValue().catch(() => "x"))) {
            await inputs.nth(j).fill(value).catch(() => undefined);
            break;
          }
        }
      }
      pressed = await pressAction(frame);
      done = await waitFor(page, met, 90000);
      // A public node that times out is answered the way a trainee would: press again.
      if (!done && /Timed out/i.test((await frame.locator("main").innerText().catch(() => "")) || "")) {
        pressed = (await pressAction(frame)) ?? pressed;
        done = await waitFor(page, met, 90000);
      }
    }
    const o = await objectives(page);
    const blocked = await page.getByRole("alert").innerText().catch(() => "");
    const entry = {
      lab: title,
      step: n,
      ok: !!o[0]?.met && (!reads(o) || reads(o).met) && !blocked,
      objectives: o,
      pressed,
      blocked: blocked || undefined,
    };
    if (!entry.ok) entry.screen = ((await frame.locator("main").innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 400);
    report.push(entry);
    console.log(`${entry.ok ? "LIVE" : "FAIL"}  ${title} · step ${n}: ${o.map((x) => `${x.met ? "✓" : "○"} ${x.label}`).join(" · ")}${pressed ? ` (pressed ${pressed})` : ""}`);
    if (!entry.ok) console.log(`      ${entry.blocked ? `refused: ${entry.blocked} · ` : ""}screen: ${entry.screen}`);
  }
  await page.getByRole("button", { name: "EXIT LAB" }).click();
}

async function benchLab(page, title, report) {
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

(async () => {
  const [url, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url);
  // Past the first-run setup.
  await page.getByRole("radio", { name: /A bit of everything/ }).check();
  await page.getByRole("button", { name: /START LEARNING/ }).click();
  await page.getByRole("button", { name: "Labs", exact: true }).click();
  const titles = await page.locator("main ul li button span.block.text-\\[12\\.5px\\]").allInnerTexts();
  const report = [];
  for (const title of titles) {
    await page.getByText(title, { exact: true }).click();
    if (await page.getByText("LAB WORKSTATION · NOSHASHI TRAINING COPY").count()) await workstationLab(page, title, report);
    else await benchLab(page, title, report);
  }
  await browser.close();
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  const failed = report.filter((r) => !r.ok);
  console.log(`${report.length - failed.length} of ${report.length} lab steps done live`);
  if (!report.length || failed.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
