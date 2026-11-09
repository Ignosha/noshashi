import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const out = process.argv[2] || "/workspace/artifacts/noshashi-security-desk";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
});
const checks = [],
  errors = [];
const check = (n, v) => {
  assert.ok(v, n);
  checks.push(n);
};
let record = null,
  tamper = false;
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/rest/v1/rpc/treasury_*", async (route) => {
    const method = route.request().url().split("/").pop(),
      p = route.request().postDataJSON();
    let data = { ok: false, code: "UNKNOWN" };
    if (method === "treasury_request_review") {
      record = {
        id: "00000000-0000-4000-8000-0000000000e5",
        organization_id: p.p_org,
        requested_by: "00000000-0000-4000-8000-0000000000e1",
        proposal_text: p.p_proposal,
        proposal: JSON.parse(p.p_proposal),
        proposal_hash: createHash("sha256").update(p.p_proposal).digest("hex"),
        policy: p.p_policy,
        evidence: p.p_evidence,
        status: "pending",
        effective_status: "pending",
        requested_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 900000).toISOString(),
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
      };
      data = {
        ok: true,
        id: record.id,
        proposalHash: record.proposal_hash,
        expiresAt: record.expires_at,
      };
    }
    if (method === "treasury_list_reviews")
      data = {
        ok: true,
        records: record
          ? [
              tamper
                ? { ...record, proposal: { ...record.proposal, Amount: "999" } }
                : record,
            ]
          : [],
      };
    if (method === "treasury_decide_review") {
      record = {
        ...record,
        status: p.p_decision,
        effective_status: p.p_decision,
        review_note: p.p_note,
        reviewed_by: "00000000-0000-4000-8000-0000000000e2",
      };
      data = { ok: true, scope: "review_record_only", status: p.p_decision };
    }
    if (method === "treasury_cancel_review") {
      record = {
        ...record,
        status: "cancelled",
        effective_status: "cancelled",
      };
      data = { ok: true, scope: "review_record_only" };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("http://localhost:1420/scripts/security/preview.html");
  await page
    .getByRole("button", { name: "Organization reviews", exact: true })
    .click();
  await page
    .getByRole("heading", { name: /different authorized account/ })
    .waitFor();
  check(
    "MFA is required before desktop review submission",
    await page
      .getByRole("button", { name: "REQUEST INDEPENDENT REVIEW" })
      .isDisabled(),
  );
  await page.getByRole("checkbox", { name: "Fixture MFA satisfied" }).check();
  await page
    .getByRole("button", { name: "REQUEST INDEPENDENT REVIEW" })
    .click();
  await page
    .getByRole("heading", { name: "PENDING · review record only" })
    .waitFor();
  check(
    "Requester cannot accept their own proposal",
    (await page
      .getByRole("button", { name: "ACCEPT REVIEW RECORD" })
      .count()) === 0,
  );
  await page
    .getByRole("button", { name: "Fixture reviewer", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I inspected this exact proposal/ })
    .check();
  await page
    .getByLabel("Review note (10–2,000 characters, no secrets)")
    .fill("Reviewed exact proposal and remaining integration limitations.");
  await page.getByRole("button", { name: "ACCEPT REVIEW RECORD" }).click();
  await page
    .getByRole("heading", { name: "APPROVED · review record only" })
    .waitFor();
  check(
    "Independent desktop decision remains a review record, not execution",
    await page
      .getByText("Review approved. No signing authorization was issued.", {
        exact: true,
      })
      .isVisible(),
  );
  await page.screenshot({
    path: out + "/organization-review-desktop.png",
    fullPage: true,
  });
  tamper = true;
  await page
    .getByRole("button", { name: "REFRESH ORGANIZATION REVIEWS" })
    .click();
  await page.getByRole("alert").waitFor();
  check(
    "Changed proposal fails digest/payload verification",
    await page
      .getByRole("alert")
      .innerText()
      .then((t) => t.includes("verification failed")),
  );
  tamper = false;
  await page
    .getByRole("button", { name: "Fixture requester", exact: true })
    .click();
  await page
    .getByRole("button", { name: "REFRESH ORGANIZATION REVIEWS" })
    .click();
  await page.getByRole("button", { name: "CANCEL REVIEW RECORD" }).click();
  await page
    .getByRole("heading", { name: "CANCELLED · review record only" })
    .waitFor();
  check(
    "A review can be cancelled without a reversal claim",
    await page
      .getByText("Review cancelled. This does not reverse any payment.", {
        exact: true,
      })
      .isVisible(),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: out + "/organization-review-mobile.png",
    fullPage: true,
  });
  check(
    "Organization review fits mobile width",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  check("No uncaught review UI errors", errors.length === 0);
  await writeFile(
    out + "/organization-review-report.json",
    JSON.stringify({ checks, errors, fixtures: true }, null, 2),
  );
  console.log(checks.length + " organization review browser checks passed");
} finally {
  await browser.close();
}
