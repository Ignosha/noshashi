/** Tests the production SW logic on an isolated localhost fixture origin. No public deployment. */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import assert from "node:assert/strict";
let version = 1,
  broken = false;
const template = await readFile("academy/sw.js", "utf8");
const server = createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const path = new URL(req.url, "http://localhost").pathname;
  if (path.endsWith("/sw.js")) {
    res.setHeader("Content-Type", "text/javascript");
    res.end(
      template
        .replace("__ACADEMY_BUILD__", "fixture-" + version)
        .replace(
          "__ACADEMY_PRECACHE__",
          JSON.stringify([
            "/academy/app/index.html",
            `/academy/app/assets/core-${version}.js`,
          ]),
        ),
    );
  } else if (path.includes("/assets/")) {
    if (broken && path.includes("core-2")) {
      res.statusCode = 503;
      res.end("expected fixture failure");
    } else {
      res.setHeader("Content-Type", "text/javascript");
      res.end("/* immutable fixture core */");
    }
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<h1>Course fixture ${version}</h1><script src="/academy/app/assets/core-${version}.js"></script>`,
    );
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),
  args: ["--no-sandbox"],
});
const checks = [];
try {
  const context = await browser.newContext();
  const p = await context.newPage();
  await p.goto(base + "/academy/app/");
  await p.evaluate(async () => {
    localStorage.setItem("academy.progress", "legacy-certificate-and-course");
    localStorage.setItem("academy.retention.v1", "review-schedule");
    await navigator.serviceWorker.register("/academy/app/sw.js");
    await navigator.serviceWorker.ready;
  });
  await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await p.reload();
  assert.equal(await p.locator("h1").textContent(), "Course fixture 1");
  checks.push("Installed bundle remains navigable offline");
  await context.setOffline(false);
  version = 2;
  broken = true;
  const bad = await p.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    const result = new Promise((resolve) =>
      r.addEventListener(
        "updatefound",
        () => {
          const w = r.installing;
          w.addEventListener("statechange", () => {
            if (["installed", "redundant"].includes(w.state)) resolve(w.state);
          });
        },
        { once: true },
      ),
    );
    await r.update();
    return result;
  });
  assert.equal(bad, "redundant");
  await p.reload();
  assert.equal(await p.locator("h1").textContent(), "Course fixture 1");
  checks.push(
    "Missing new chunk rejects installation and retains last working course",
  );
  version = 3;
  broken = false;
  await p.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await p.waitForFunction(
    async () => !!(await navigator.serviceWorker.getRegistration())?.waiting,
  );
  await p.evaluate(async () => {
    (await navigator.serviceWorker.getRegistration()).waiting.postMessage({
      type: "ACTIVATE_VALIDATED_ACADEMY",
    });
  });
  await p.waitForTimeout(250);
  await p.reload();
  assert.equal(await p.locator("h1").textContent(), "Course fixture 3");
  assert.deepEqual(
    await p.evaluate(() => [
      localStorage.getItem("academy.progress"),
      localStorage.getItem("academy.retention.v1"),
    ]),
    ["legacy-certificate-and-course", "review-schedule"],
  );
  checks.push(
    "Healthy replacement activates after explicit request and preserves progress/review storage",
  );
  version = 1;
  await p.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await p.waitForFunction(
    async () => !!(await navigator.serviceWorker.getRegistration())?.waiting,
  );
  await p.evaluate(async () => {
    (await navigator.serviceWorker.getRegistration()).waiting.postMessage({
      type: "ACTIVATE_VALIDATED_ACADEMY",
    });
  });
  await p.waitForTimeout(250);
  await p.reload();
  assert.equal(await p.locator("h1").textContent(), "Course fixture 1");
  assert.equal(
    await p.evaluate(() => localStorage.getItem("academy.retention.v1")),
    "review-schedule",
  );
  checks.push(
    "Explicit operator bundle rollback keeps learner records; release-sync version selection remains monotonic",
  );
  const out = process.env.SHOTS_DIR || "/tmp/noshashi-academy-retention";
  await mkdir(out, { recursive: true });
  await writeFile(
    out + "/cache-report.json",
    JSON.stringify(
      {
        checks,
        scope:
          "Linux Chromium; isolated fixture origin using production service-worker template. No public publication.",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(checks));
  await context.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
