/** Local website QA with recorded, unmodified mainnet fixtures.
 * Start a static site server, then:
 * CHROME_PATH=/usr/bin/chromium APP_URL=http://127.0.0.1:4186 node scripts/verify-web-experience.mjs
 * No request reaches production. Captured fixture dates remain visible in the UI.
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const bitstamp = JSON.parse(
  await readFile(
    new URL("tests/fixtures/authority-bitstamp-107585800.json", root),
    "utf8",
  ),
);
const solo = JSON.parse(
  await readFile(
    new URL("tests/fixtures/authority-solo-107585799.json", root),
    "utf8",
  ),
);
const manifest = JSON.parse(
  await readFile(new URL("site/assets/shots/manifest.json", root), "utf8"),
);
const shotLedger = (name) =>
  manifest.shots
    .find((shot) => shot.name === name)
    .ledger.toLocaleString("en-US");
const base = process.env.APP_URL || "http://127.0.0.1:4186/";
const out = process.env.SHOTS_DIR || "/tmp/noshashi-web-experience";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ["--no-sandbox"],
});
const errors = [];
try {
  for (const mode of process.env.QA_MODES
    ? process.env.QA_MODES.split(",")
    : ["dark", "paper", "mobile", "reduced", "no-js"]) {
    const context = await browser.newContext({
      viewport:
        mode === "mobile"
          ? { width: 390, height: 844 }
          : { width: 1440, height: 1000 },
      javaScriptEnabled: mode !== "no-js",
      reducedMotion: mode === "reduced" ? "reduce" : "no-preference",
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${mode}: ${e.message}`));
    let responseMode = "valid",
      release = null;
    await page.addInitScript(
      (theme) => localStorage.setItem("noshashi-theme", theme),
      mode === "paper" ? "light" : "dark",
    );
    await page.routeWebSocket("**", (socket) => socket.close());
    await page.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname.startsWith("/api/")) {
        const certificate = [bitstamp, solo].find(
          (c) => c.issuer === u.searchParams.get("issuer"),
        );
        if (u.pathname !== "/api/authority" || !certificate)
          return route.fulfill({
            status: 502,
            json: { error: "Public ledger unavailable in local QA" },
          });
        const state = responseMode;
        if (state === "deferred")
          await new Promise((resolve) => {
            release = resolve;
          });
        if (state === "http-error")
          return route.fulfill({ status: 502, json: { error: "unavailable" } });
        const reply =
          state === "tampered"
            ? { ...certificate, ledgerIndex: certificate.ledgerIndex + 1 }
            : state === "incomplete"
              ? { ...certificate, checks: [] }
              : certificate;
        try {
          return await route.fulfill({ json: reply });
        } catch {
          return;
        }
      }
      if (u.origin !== new URL(base).origin) return route.abort();
      return route.continue();
    });
    await page.goto(base, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    assert(await page.locator(".lx-headline").isVisible());
    if (mode === "no-js") {
      assert.equal(await page.locator("[data-lx-command]").isVisible(), false);
      assert.equal(
        await page.locator("#lx-issuer-form").getAttribute("action"),
        "/certificate/",
      );
      assert(await page.locator(".lx-investigation noscript").isVisible());
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      console.log(
        "PASS no-js: readable hero, explanation and standalone tool fallback",
      );
      await context.close();
      continue;
    }
    await page.locator("[data-lx-command]").waitFor({ state: "visible" });
    for (const index of mode === "mobile" ? [] : [1, 2, 0]) {
      const button = page.locator(`[data-lx-layer="${index}"]`);
      await button.focus();
      await page.keyboard.press(index % 2 ? "Enter" : "Space");
      assert.equal(await button.getAttribute("aria-pressed"), "true");
      assert.equal(
        await page.locator(".lx-layer-controls [aria-pressed=true]").count(),
        1,
      );
      assert.equal(
        await page
          .locator(`[data-lx-plane="${index}"]`)
          .getAttribute("data-active"),
        "",
      );
    }
    if (mode === "reduced")
      assert.equal(
        await page
          .locator("[data-lx-plane]")
          .first()
          .evaluate((el) => getComputedStyle(el).transform),
        "none",
      );
    await page.evaluate(() => scrollTo(0, 0));
    await page.locator(".rh-title-k").click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${mode}-hero.png` });
    const preset = (certificate) =>
      page.locator(`[data-lx-issuer="${certificate.issuer}"]`);
    const state = () => page.locator("#lx-result").getAttribute("data-state");
    const waitState = (value) =>
      page.waitForFunction(
        (v) => document.getElementById("lx-result").dataset.state === v,
        value,
      );
    await preset(bitstamp).click();
    await page.locator("#lx-read").click();
    await waitState("verified");
    assert.equal(
      await page.locator("[data-lx-digest]").textContent(),
      bitstamp.digest,
    );
    assert.equal(
      await page.locator("[data-lx-ledger]").textContent(),
      "107,585,800",
    );
    assert.equal(
      await page.locator("[data-lx-check=NOT_GLOBALLY_FROZEN]").textContent(),
      "Yes",
    );
    await page
      .locator("#lx-investigate")
      .screenshot({ path: `${out}/${mode}-investigation.png` });
    const downloading = page.waitForEvent("download");
    await page.locator("#lx-download").click();
    const download = await downloading;
    assert.deepEqual(
      JSON.parse(await readFile(await download.path(), "utf8")),
      bitstamp,
    );
    assert.equal(
      await page.locator("[data-lx-step=keep]").getAttribute("data-complete"),
      "",
    );
    await preset(solo).click();
    assert.equal(await state(), "idle");
    assert(await page.locator("#lx-download").isDisabled());
    assert.equal(
      await page
        .locator("[data-lx-check=NOT_GLOBALLY_FROZEN]")
        .getAttribute("title"),
      null,
    );
    for (const failure of ["http-error", "tampered", "incomplete"]) {
      responseMode = failure;
      await page.locator("#lx-read").click();
      await waitState("unavailable");
      assert.equal(
        await page.locator("[data-lx-verdict]").textContent(),
        "Not read",
      );
      assert.equal(await page.locator("[data-lx-ledger]").textContent(), "—");
      assert(await page.locator("#lx-download").isDisabled());
    }
    responseMode = "valid";
    await page.locator("#lx-read").click();
    await waitState("verified");
    assert.equal(
      await page.locator("[data-lx-digest]").textContent(),
      solo.digest,
    );
    if (mode === "dark") {
      await preset(bitstamp).click();
      responseMode = "deferred";
      await page.locator("#lx-read").click();
      await waitState("reading");
      await page.waitForFunction(
        () => document.getElementById("lx-read").disabled,
      );
      await preset(solo).click();
      if (release) release();
      await page.waitForTimeout(100);
      assert.equal(await state(), "idle");
      assert(await page.locator("#lx-download").isDisabled());
      responseMode = "valid";
      await page.locator("#lx-read").click();
      await waitState("verified");
      assert.equal(
        await page.locator("[data-lx-digest]").textContent(),
        solo.digest,
      );
      await page.locator("#lx-issuer").fill("not-an-address");
      await page.locator("#lx-read").click();
      assert.equal(
        await page.locator("#lx-issuer").evaluate((el) => el.checkValidity()),
        false,
      );
      assert.equal(await state(), "idle");
    }
    await page.locator("[data-lx-view=audit]").click();
    assert(
      (await page.locator("#lx-product-caption").textContent()).includes(
        shotLedger("audit"),
      ),
    );
    await page.locator("[data-lx-view=sync]").click();
    assert(
      (await page.locator("#lx-product-image").getAttribute("src")).includes(
        "sync.webp",
      ),
    );
    await page.locator("[data-lx-zoom]").click();
    assert(await page.locator("#lx-image-dialog").evaluate((el) => el.open));
    assert(
      (await page.locator("#lx-image-dialog p").textContent()).includes(
        shotLedger("sync"),
      ),
    );
    await page.keyboard.press("Escape");
    await page.locator("#lx-image-dialog").waitFor({ state: "hidden" });
    assert.equal(
      await page.locator("#lx-image-dialog").evaluate((el) => el.open),
      false,
    );
    await page.locator("[data-lx-command]").click();
    assert(await page.locator("#lx-command-dialog").evaluate((el) => el.open));
    assert.equal(
      await page
        .locator("#lx-command-search")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.locator("#lx-command-search").fill("liquidity");
    assert.equal(await page.locator("[data-lx-tool]:visible").count(), 2);
    await page.locator("#lx-command-search").fill("zz-no-tool");
    assert(await page.locator("[data-lx-empty]").isVisible());
    await page.keyboard.press("Escape");
    await page.locator("#lx-command-dialog").waitFor({ state: "hidden" });
    assert.equal(
      await page.locator("#lx-command-dialog").evaluate((el) => el.open),
      false,
    );
    assert.equal(
      await page
        .locator("[data-lx-command]")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Control+k");
    assert(await page.locator("#lx-command-dialog").evaluate((el) => el.open));
    await page.keyboard.press("Escape");
    await page.evaluate(() => scrollTo(0, 0));
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${mode}: no horizontal overflow`,
    );
    const finder = await page.locator("[data-lx-command]").boundingBox(),
      support = await page.locator(".support-launch").boundingBox();
    if (support)
      assert(
        finder.x + finder.width < support.x ||
          finder.y + finder.height < support.y ||
          support.y + support.height < finder.y,
        "Tool finder does not overlap support",
      );
    console.log(
      `PASS ${mode}: keyboard layers, verified record, exact download, clear-on-change, failures/retry, recorded tour, dialogs and search`,
    );
    await context.close();
  }
  assert.deepEqual(errors, [], "No browser runtime errors");
} finally {
  await browser.close();
}
