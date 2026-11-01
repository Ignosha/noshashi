/** Verify the desktop UI through its web preview; never signs or submits a transaction.
 * APP_URL=http://localhost:1420 CHROME_PATH=/usr/bin/chromium node scripts/verify-ledger-desk.mjs
 * Screenshots are local review artifacts, not published marketing assets.
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const base = process.env.APP_URL || "http://localhost:1420/";
const out = process.env.SHOTS_DIR || "/tmp/noshashi-ledger-desk";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ["--no-sandbox"],
});
const errors = [];
try {
  for (const variant of [
    { name: "dark", width: 1440, height: 1000, theme: "dark", scale: 1 },
    { name: "paper", width: 1440, height: 1000, theme: "light", scale: 1 },
    { name: "laptop", width: 1024, height: 768, theme: "dark", scale: 1 },
    { name: "scaled", width: 1440, height: 1000, theme: "light", scale: 1.25 },
    {
      name: "reduced",
      width: 1280,
      height: 900,
      theme: "dark",
      scale: 1,
      reduced: true,
    },
    {
      name: "contrast",
      width: 1280,
      height: 900,
      theme: "dark",
      scale: 1,
      contrast: true,
    },
  ]) {
    if (process.env.SCENE_SWEEP_ONLY) continue;
    const context = await browser.newContext({
      viewport: { width: variant.width, height: variant.height },
      reducedMotion: variant.reduced ? "reduce" : "no-preference",
    });
    const page = await context.newPage();
    page.on("pageerror", (error) =>
      errors.push(`${variant.name}: ${error.message}`),
    );
    await page.addInitScript((v) => {
      const settings = {
        "console.onboarded": true,
        "onboarding.guideDismissed": true,
        "appearance.theme": v.theme,
        "appearance.textScale": v.scale,
        "appearance.highContrast": Boolean(v.contrast),
        "appearance.motion": v.reduced ? "reduced" : "system",
      };
      for (const [key, value] of Object.entries(settings))
        localStorage.setItem("noshashi:" + key, JSON.stringify(value));
    }, variant);
    await page.goto(base);
    await page.locator("#desk-home-title").waitFor();
    await page
      .getByRole("status", { name: "Opening the Ledger Desk", exact: true })
      .waitFor({ state: "detached" });
    await page.evaluate(() => document.fonts.ready);
    const contrast = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const sample = document.createElement("span");
      document.body.append(sample);
      const luminance = (token) => {
        sample.style.color = `hsl(${root.getPropertyValue(token)})`;
        const rgb = getComputedStyle(sample)
          .color.match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number)
          .map((v) => v / 255)
          .map((v) =>
            v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
          );
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      const pairs = [
        "--foreground",
        "--muted-foreground",
        "--faint",
        "--status-go",
        "--status-hold",
        "--status-no-go",
      ].map((token) => [token, "--card"]);
      const results = pairs.map(([ink, ground]) => {
        const a = luminance(ink),
          b = luminance(ground);
        return {
          ink,
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        };
      });
      sample.remove();
      return results;
    });
    for (const { ink, ratio } of contrast)
      assert(
        ratio >= 4.5,
        `${variant.name}: ${ink} contrast ${ratio.toFixed(2)}:1`,
      );

    assert.equal(
      await page
        .locator(".desk-sidebar")
        .evaluate((el) => Math.round(el.getBoundingClientRect().left)),
      0,
      "sidebar starts at the window edge",
    );
    assert(await page.locator("#desk-home-title").isVisible());
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${variant.name}: page overflow`,
    );
    const hero = await page.locator("#desk-home-title").boundingBox();
    const main = await page.locator("main").boundingBox();
    assert(
      hero.x >= main.x,
      `${variant.name}: heading is not clipped behind sidebar`,
    );
    assert.equal(
      await page
        .locator("#desk-home-title")
        .evaluate((el) =>
          getComputedStyle(el).fontFamily.includes("Instrument Serif"),
        ),
      true,
    );
    for (const [index, label] of [
      "Authority",
      "Liquidity",
      "Evidence",
    ].entries()) {
      const button = page.getByRole("button", {
        name: new RegExp(`0${index + 1} ${label}`),
      });
      await button.focus();
      await page.keyboard.press(index % 2 ? "Space" : "Enter");
      assert.equal(await button.getAttribute("aria-pressed"), "true");
      assert.equal(
        await page
          .locator('.desk-layer-controls [aria-pressed="true"]')
          .count(),
        1,
      );
      assert(
        await page
          .getByRole("button", {
            name: new RegExp(`Open ${label.toLowerCase()}`),
          })
          .isVisible(),
      );
    }
    if (variant.reduced)
      assert.equal(
        await page
          .locator(".desk-instrument-layer")
          .first()
          .evaluate((el) => getComputedStyle(el).transform),
        "none",
      );
    await page.locator(".desk-layer-controls button").first().click();
    await page.locator(".desk-home").evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({ path: `${out}/${variant.name}-overview.png` });
    await page
      .getByRole("button", { name: "VERIFICATION", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Verification", exact: true })
      .waitFor();
    const input = page.getByLabel("AMOUNT (XRP)", { exact: true });
    await input.fill("1000");
    assert.equal(await input.inputValue(), "1000");
    await page.screenshot({ path: `${out}/${variant.name}-verification.png` });
    await page
      .getByRole("button", { name: "Open command palette", exact: true })
      .first()
      .click();
    assert(await page.getByRole("dialog").isVisible());
    assert.equal(
      await page
        .getByLabel("Search commands", { exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
      "command field receives focus",
    );
    await page.keyboard.press("Shift+Tab");
    assert(
      await page
        .getByRole("dialog")
        .evaluate((el) => el.contains(document.activeElement)),
      "keyboard focus remains in dialog",
    );
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("aria-label"),
      ),
      "Open command palette",
      "focus returns to the opener",
    );
    console.log(
      `PASS ${variant.name}: typography, unclipped layout, keyboard diagram, verification form, command palette`,
    );
    await context.close();
  }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`first-run: ${error.message}`));
  await page.goto(base);
  await page
    .getByRole("button", { name: "Open the Ledger Desk", exact: false })
    .waitFor();
  assert(
    await page
      .getByRole("heading", { name: "Intelligence. With evidence." })
      .isVisible(),
  );
  await page
    .getByRole("button", { name: "Open the Ledger Desk", exact: false })
    .click();
  await page.locator("#desk-home-title").waitFor();
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("noshashi:console.onboarded"),
    ),
    "true",
  );
  console.log(
    "PASS first-run: welcome screen enters workstation and persists onboarding",
  );
  await page
    .locator(".desk-sidebar")
    .getByRole("radio", { name: "ANALYST", exact: true })
    .click();
  const navLabels = await page
    .locator('nav[aria-label="Primary"] button')
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")),
    );
  for (const label of navLabels) {
    await page
      .locator('nav[aria-label="Primary"]')
      .getByRole("button", { name: label, exact: true })
      .click();
    await page.waitForTimeout(350);
    const content = await page.locator("main").innerText();
    assert(content.trim().length > 0, `${label}: nonempty screen`);
    assert(!content.includes("FAILED TO RENDER"), `${label}: no render error`);
  }
  console.log(
    `PASS navigation: ${navLabels.length} Analyst destinations, including entitlement gates`,
  );
  await page.getByRole("button", { name: "SETTINGS", exact: true }).click();
  await page.waitForTimeout(500);
  assert(
    !(await page.locator("main").innerText()).includes("FAILED TO RENDER"),
  );
  console.log("PASS settings: appearance and preference controls render");
  await context.close();
  assert.deepEqual(errors, [], "No browser runtime errors");
} finally {
  await browser.close();
}
