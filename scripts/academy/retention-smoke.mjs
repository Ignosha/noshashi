import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const base = process.env.APP_URL || "http://127.0.0.1:4354",
  out = process.env.SHOTS_DIR || "/tmp/noshashi-academy-retention";
await mkdir(out, { recursive: true });
const course = JSON.parse(
    await readFile("src/lib/academy/course.json", "utf8"),
  ),
  bank = JSON.parse(
    await readFile("src/lib/academy/retention-bank.json", "utf8"),
  ).questions;
const checks = [],
  errors = [];
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),
  args: ["--no-sandbox"],
});
const canonical = (x) =>
  x && typeof x === "object" && !Array.isArray(x)
    ? "{" +
      Object.keys(x)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(x[k]))
        .join(",") +
      "}"
    : JSON.stringify(x);
async function context(width = 1440) {
  const c = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (
      m.type() === "error" &&
      /Refused to|Content Security Policy/.test(m.text())
    )
      errors.push(m.text());
  });
  await p.routeWebSocket(/wss:/, (socket) => socket.close());
  return { c, p };
}
async function answer(p, correct = true) {
  const card = p.locator(".learning-question").first(),
    id = await card.getAttribute("data-question-id"),
    q = bank.find((q) => q.id === id);
  assert.ok(q, id);
  const text =
    q.options[correct ? q.answer : (q.answer + 1) % q.options.length];
  await card.getByRole("radio", { name: text, exact: true }).check();
  return q;
}
try {
  const { c, p } = await context();
  await p.goto(base + "/academy/");
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: out + "/academy-public.png" });
  await p
    .getByRole("link", { name: /Start the 5-minute lesson/ })
    .first()
    .click();
  await p
    .getByRole("heading", { name: "One shared record", exact: true })
    .waitFor();
  assert.equal(
    await p
      .getByRole("heading", { name: "A course that works for you." })
      .count(),
    0,
  );
  await p.getByRole("button", { name: "NEXT CARD →", exact: true }).click();
  assert.match(await p.locator(".academy").innerText(), /CARD 2 OF/);
  await p.reload();
  await p
    .getByRole("heading", { name: "One shared record", exact: true })
    .waitFor();
  assert.match(await p.locator(".academy").innerText(), /CARD 2 OF/);
  checks.push(
    "Public Start opens lesson one directly; section/card resumes after refresh",
  );
  await p.getByRole("button", { name: "HOW I LEARN · READING" }).click();
  await p.getByRole("checkbox", { name: /High contrast/ }).check();
  await p.getByRole("checkbox", { name: /Focus mode/ }).check();
  await p
    .getByRole("button", { name: "BACK TO LEARNING →", exact: true })
    .click();
  await p
    .getByRole("heading", { name: "One shared record", exact: true })
    .waitFor();
  assert.ok(await p.locator(".academy-contrast").count());
  await p.screenshot({ path: out + "/lesson-desktop.png" });
  checks.push(
    "In-lesson reading/contrast/focus controls remain accessible and persist",
  );
  await p.getByRole("button", { name: /^\d\. WATCH$/ }).click();
  await p.locator("video").waitFor();
  assert.ok(await p.locator("video").evaluate((v) => v.controls));
  await p
    .locator("track")
    .evaluateAll((ts) => ts.forEach((t) => (t.track.mode = "hidden")));
  await p.waitForFunction(
    () => document.querySelector("track")?.readyState === 2,
  );
  await p
    .getByRole("button", { name: "READ THE WORDS INSTEAD", exact: true })
    .click();
  await p
    .getByRole("button", { name: "HIDE THE WORDS", exact: true })
    .waitFor();
  checks.push(
    "Existing video controls, local captions under CSP and transcript disclosure preserved",
  );
  await p.getByRole("button", { name: /^\d\. CHECK$/ }).click();
  await p.locator("input[type=radio]").first().check();
  assert.equal(await p.getByText(/Yes!|Not quite\./).count(), 0);
  await p.getByRole("button", { name: "CHECK ANSWER", exact: true }).click();
  await p.getByRole("button", { name: "NEXT QUESTION →", exact: true }).click();
  await p.reload();
  assert.match(await p.locator(".academy").innerText(), /QUESTION 2 OF 3/);
  checks.push(
    "Lesson check requires submission and preserves its exact attempt/question across refresh",
  );
  await p.getByRole("button", { name: "Course map", exact: true }).click();
  assert.ok(
    await p
      .getByRole("button", { name: /CONTINUE WHERE YOU LEFT OFF/ })
      .isVisible(),
  );
  await p.goto(base + "/academy/");
  await p.getByRole("link", { name: /Try one payment lab/ }).click();
  await p
    .getByRole("heading", { name: "Did this invoice get paid?", exact: true })
    .waitFor();
  await p.screenshot({ path: out + "/case-first-desktop.png" });
  assert.equal(
    await p.getByText("Model explanation", { exact: true }).count(),
    0,
  );
  const needed = [
    "Node-reported validated",
    "Invoice requested",
    "Metadata delivered",
    "Destination",
    "Destination tag",
    "Transaction result",
  ];
  for (const label of needed)
    await p
      .locator(".learning-evidence label")
      .filter({ has: p.getByText(label, { exact: true }) })
      .getByRole("checkbox")
      .check();
  await p.getByRole("radio", { name: /Hold full reconciliation/ }).check();
  assert.equal(await p.locator(".learning-feedback").count(), 0);
  await p.getByRole("button", { name: "CHECK CASE", exact: true }).click();
  await p
    .getByRole("heading", { name: "Evidence and decision supported." })
    .waitFor();
  await p
    .getByLabel("Your explanation", { exact: true })
    .fill(
      "The validated matching payment delivered forty dollars so the shortfall needs review.",
    );
  await p.getByRole("button", { name: "COMPARE MY EXPLANATION" }).click();
  await p.getByText("Model explanation", { exact: true }).waitFor();
  assert.match(
    await p.locator(".learning-teachback").innerText(),
    /Case completed/,
  );
  await p.reload();
  assert.match(
    await p.locator(".learning-teachback").innerText(),
    /Case completed/,
  );
  checks.push(
    "Public payment-lab entry, evidence selection/decision, hidden feedback, teach-back and completion resume",
  );
  await p.getByRole("button", {name:"Course map",exact:true}).click();
  assert.match(await p.locator(".academy").innerText(),/1\/4 CASES/);
  await p.goto(base+"/academy/app/?case=invoice");
  await p
    .getByText(
      "Optional: explore the NOSHASHI product screen or a fresh public reading",
      { exact: true },
    )
    .click();
  await p.getByRole("button", { name: "TRY FRESH MAINNET READING" }).click();
  await p
    .getByText(/Fresh lookup unavailable or timed out/)
    .waitFor({ timeout: 18000 });
  assert.match(await p.locator(".learning-evidence").innerText(), /40 USD/);
  assert.match(
    await p.locator(".learning-teachback").innerText(),
    /Case completed/,
  );
  checks.push(
    "Blocked public-node lookup leaves the recorded assessment usable",
  );
  await p
    .getByRole("button", { name: "OPEN PRODUCT SCREEN", exact: true })
    .click();
  const training = p.frameLocator(
    'iframe[title^="NOSHASHI training workstation"]',
  );
  await training
    .getByRole("img", { name: "NOSHASHI", exact: true })
    .first()
    .waitFor();
  await p.getByText("Training workstation ready.", { exact: true }).waitFor();
  checks.push(
    "Existing embedded product workstation loads through the case entry",
  );
  await p.screenshot({ path: out + "/case-desktop.png" });
  // Simulate a missed concept at a one-day boundary. No answer is revealed on selection.
  const now = Date.now();
  await p.evaluate((now) => {
    localStorage.setItem(
      "academy.retention.v1",
      JSON.stringify({
        v: 1,
        concepts: {
          "delivered-amount": {
            introducedAt: now - 8 * 86400000,
            dueAt: now - 1000,
            stage: 3,
            attempts: 2,
            correct: 2,
            lastVariant: "delivered-amount/v1",
            lastCorrect: true,
            laterAttempts: 0,
            laterCorrect: 0,
          },
        },
      }),
    );
    localStorage.removeItem("academy.review-session.v1");
  }, now);
  await p.goto(base + "/academy/app/?review=due");
  const reviewQ = await answer(p, false);
  assert.equal(reviewQ.id, "delivered-amount/v2");
  assert.equal(await p.locator(".learning-feedback").count(), 0);
  await p.getByRole("button", { name: "CHECK ANSWER", exact: true }).click();
  assert.match(
    await p.locator(".learning-feedback").innerText(),
    /Why that choice fails/,
  );
  let review = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("academy.retention.v1")),
  );
  assert.equal(review.concepts["delivered-amount"].stage, 0);
  assert.ok(
    Math.abs(
      review.concepts["delivered-amount"].dueAt - (Date.now() + 86400000),
    ) < 10000,
  );
  assert.equal(review.concepts["delivered-amount"].laterAttempts, 1);
  await p.screenshot({ path: out + "/review-feedback.png" });
  await p.evaluate(() => {
    const r = JSON.parse(localStorage.getItem("academy.retention.v1"));
    r.concepts["delivered-amount"].dueAt = Date.now() - 1;
    localStorage.setItem("academy.retention.v1", JSON.stringify(r));
    localStorage.removeItem("academy.review-session.v1");
  });
  await p.reload();
  assert.equal(
    await p.locator(".learning-question").getAttribute("data-question-id"),
    "delivered-amount/v3",
  );
  checks.push(
    "Missed recall returns sooner, rotates evidence variant and records week-later first attempts",
  );
  // Build a real earned-record shape and protect it while practicing.
  const record = {
    schema: "noshashi.academy-certificate/1",
    course: course.version,
    name: "Training learner",
    completed_on: "2026-11-13",
    lessons_passed: 21,
    lessons_total: 21,
    exam_percent: 100,
    labs_completed: 0,
    labs_total: 18,
  };
  const cert = {
    record,
    code: createHash("sha256")
      .update(canonical(record))
      .digest("hex")
      .toUpperCase(),
  };
  const old = {
    v: 1,
    style: "read",
    access: {},
    lessons: Object.fromEntries(
      course.lessons.map((l) => [
        l.id,
        { cardsSeen: 2, best: 3, tries: 1, passedAt: "2026-11-13T00:00:00Z" },
      ]),
    ),
    exam: { best: 100, tries: 1, passedAt: "2026-11-13T00:00:00Z" },
    certificate: cert,
    missed: [],
  };
  await p.evaluate((old) => {
    localStorage.setItem("academy.progress", JSON.stringify(old));
    localStorage.removeItem("academy.practice.v1");
  }, old);
  await p.goto(base + "/academy/app/?practice=1");
  await p.getByRole("button", { name: "START 25-QUESTION TEST" }).click();
  await answer(p, false);
  assert.equal(await p.locator(".learning-feedback").count(), 0);
  await p.getByRole("button", { name: "CHECK ANSWER", exact: true }).click();
  assert.ok(await p.locator(".learning-feedback").isVisible());
  await p.getByRole("button", { name: "NEXT QUESTION", exact: true }).click();
  const nextId = await p
    .locator(".learning-question")
    .getAttribute("data-question-id");
  await p.reload();
  assert.equal(
    await p.locator(".learning-question").getAttribute("data-question-id"),
    nextId,
  );
  checks.push(
    "Practice mode submits feedback explicitly and restores its exact question after reload",
  );
  await p.evaluate(() => localStorage.removeItem("academy.practice.v1"));
  await p.reload();
  await p.getByRole("radio", { name: /Exam — answers hidden/ }).check();
  await p.getByRole("checkbox", { name: /Optional 30-minute/ }).check();
  await p.getByRole("button", { name: "START 25-QUESTION TEST" }).click();
  for (let i = 0; i < 25; i++) {
    await answer(p, i < 20);
    assert.equal(await p.locator(".learning-feedback").count(), 0);
    if (i === 0)
      await p
        .getByRole("button", { name: "FLAG FOR REVIEW", exact: true })
        .click();
    if (i === 2) {
      await p.reload();
      assert.match(
        await p.locator(".learning-step").innerText(),
        /QUESTION 3 OF 25/,
      );
    }
    if (i < 24)
      await p
        .getByRole("button", { name: "NEXT QUESTION", exact: true })
        .click();
  }
  await p
    .getByRole("button", { name: "SUBMIT TEST (0 UNANSWERED)", exact: true })
    .click();
  await p.getByRole("heading", { name: "80% · 20/25", exact: true }).waitFor();
  await p.screenshot({ path: out + "/practice-results.png" });
  assert.equal(await p.locator(".learning-score tbody tr").count(), 6);
  const protectedProgress = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("academy.progress")),
  );
  assert.deepEqual(protectedProgress.certificate, cert);
  assert.deepEqual(protectedProgress.exam, old.exam);
  await p.getByRole("button", { name: "RETRY WEAK TOPICS" }).click();
  assert.match(
    await p.locator(".learning-session").innerText(),
    /WEAK-TOPIC DRILL/,
  );
  checks.push(
    "Exam answers hidden until final submission; 80% scoring, topics, flags, optional timer, weak-topic retry and certificate preservation",
  );
  await p.goto(base + "/academy/app/?map=1");
  await p.getByRole("button", { name: "MY CERTIFICATE", exact: true }).click();
  assert.match(await p.locator(".academy").innerText(), /Training learner/);
  checks.push("Existing earned certificate still opens after the upgrade");
  await c.close();
  const { c: mobile, p: m } = await context(390);
  await m.goto(base + "/academy/app/?case=invoice");
  await m.screenshot({ path: out + "/case-first-mobile.png" });
  assert.ok(
    await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await m.keyboard.press("Tab");
  await m.keyboard.press("Enter");
  let found = false;
  for (let i = 0; i < 45; i++) {
    const at = await m.evaluate(() =>
      document.activeElement?.matches(".learning-evidence input"),
    );
    if (at) {
      found = true;
      break;
    }
    await m.keyboard.press("Tab");
  }
  assert.ok(found, "Evidence reachable using only Tab");
  for (let i = 0; i < 6; i++) {
    await m.keyboard.press("Space");
    await m.keyboard.press("Tab");
  }
  await m.keyboard.press("Tab");
  await m.keyboard.press("ArrowDown");
  await m.keyboard.press("Tab");
  await m.keyboard.press("Enter");
  await m
    .getByRole("heading", { name: "Evidence and decision supported." })
    .waitFor();
  await m.screenshot({ path: out + "/case-mobile.png" });
  checks.push(
    "Phone case has no horizontal overflow and evidence/decision can be submitted by keyboard",
  );
  await mobile.close();
  const { c: locked, p: l } = await context();
  await locked.addInitScript(() => {
    Storage.prototype.getItem = function () {
      throw new DOMException("fixture storage denied", "SecurityError");
    };
    Storage.prototype.setItem = function () {
      throw new DOMException("fixture storage denied", "SecurityError");
    };
  });
  await l.goto(base + "/academy/app/?lesson=a1");
  await l.getByText(/Device storage is unavailable/).waitFor();
  await l.getByRole("button", { name: "NEXT CARD →", exact: true }).click();
  await l.getByRole("button", { name: "Course map", exact: true }).click();
  await l.getByRole("button", { name: /CONTINUE WHERE YOU LEFT OFF/ }).click();
  assert.match(await l.locator(".academy").innerText(), /CARD 2 OF/);
  checks.push(
    "Refused storage is disclosed and tab-session progress survives view changes",
  );
  await locked.close();
  const { c: damaged, p: d } = await context();
  await d.goto(base + "/academy/app/?map=1");
  await d.evaluate(() => {
    localStorage.setItem(
      "academy.analyst-cases.v1",
      JSON.stringify({
        invoice: {
          version: "analyst-cases/1",
          evidence: [],
          decision: 1,
          attempts: 0,
          teachback: { bad: true },
          submitted: false,
        },
      }),
    );
    localStorage.setItem(
      "academy.practice.v1",
      JSON.stringify({
        v: 1,
        version: "academy-retention/1",
        seed: 1,
        mode: "exam",
        at: 0,
        picked: {},
        checked: [],
        flags: [],
        topics: { bad: true },
        submitted: false,
        deadline: null,
      }),
    );
  });
  await d.goto(base + "/academy/app/?case=invoice");
  await d
    .getByRole("heading", { name: "Did this invoice get paid?", exact: true })
    .waitFor();
  await d.goto(base + "/academy/app/?practice=1");
  await d.getByRole("button", { name: "START 25-QUESTION TEST" }).waitFor();
  checks.push(
    "Malformed case/practice records fall back safely without resetting earned records",
  );
  await damaged.close();
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/report.json",
    JSON.stringify(
      {
        checks,
        errors,
        platform: "Linux / Chromium",
        scope:
          "Local preview. Simulated assessment data; public-node failure deliberately injected. No physical Mac/Monterey test.",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(checks));
} finally {
  await browser.close();
}
