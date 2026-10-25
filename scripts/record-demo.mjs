/*
 * Records the homepage demo video: a walkthrough of the workspace against
 * the local dev server (node scripts/dev-site.mjs), which reads XRPL mainnet
 * live. Needs Playwright with Chromium and network access to XRPL.
 *
 *   BASE=http://127.0.0.1:4321 node scripts/record-demo.mjs
 *
 * Writes a WebM to ./out. .github/workflows/demo-video.yml runs it, encodes
 * the MP4 and poster into site/assets/video and commits them.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4321";
const W = 1280, H = 720;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: "out", size: { width: W, height: H } }, colorScheme: "dark" });
await ctx.addInitScript(() => {
  window.__cap = (t) => {
    let el = document.getElementById("__cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "__cap";
      el.style.cssText = "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;max-width:86%;padding:12px 20px;border-radius:12px;background:rgba(6,12,6,.92);color:#eaf5e4;border:1px solid rgba(155,226,92,.55);font:500 18px/1.35 system-ui,sans-serif;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.5);pointer-events:none;transition:opacity .25s";
      document.documentElement.appendChild(el);
    }
    el.textContent = t; el.style.opacity = t ? "1" : "0";
  };
});
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const cap = async (t, ms = 3200) => { await page.evaluate((x) => window.__cap(x), t); await wait(ms); };
const scrollTo = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); await page.evaluate((s) => { const e = document.querySelector(s); if (e) e.scrollIntoView({ behavior: "smooth", block: "start" }); }, sel); await wait(900); };
const slowScroll = async (px, steps = 6) => { for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, px / steps); await wait(260); } };
const result = async () => { await page.waitForSelector("[data-result]:not([hidden])", { timeout: 30000 }); await wait(1200); };
const type = async (sel, text) => { await page.click(sel); await page.fill(sel, ""); await page.type(sel, text, { delay: 35 }); };

// 1. Home
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await cap("NOSHASHI reads the XRP Ledger live. Nothing here is sample data.", 3600);
await slowScroll(500); await cap("Every tool is free to open. No account, no sign-up.", 3000);

// 2. Issuer analysis: guide + Bitstamp
await page.goto(BASE + "/app/issuer/", { waitUntil: "networkidle" });
await cap("Issuer analysis: what controls an issuer keeps over its tokens.", 3400);
await cap("New here? Three steps: paste an issuer, read the controls, check the evidence.", 3800);
await type("#q", "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B");
await cap("Bitstamp's USD issuer, address published by Bitstamp.", 2400);
await page.click("form.ws-search button[type=submit]");
await result();
await cap("Read from a validated mainnet ledger just now.", 3200);
await scrollTo("[data-result]");
await cap("Can it freeze holders? Claw back balances? Require approval? Charge a transfer fee?", 4200);
await slowScroll(700, 8);
await cap("What the ledger does not show is listed too, so you know what to verify yourself.", 4400);
await slowScroll(600, 6);
await cap("Evidence: the ledger index and the raw reply, so anyone can re-check it.", 3800);

// 3. GateHub and RLUSD via the examples
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })); await wait(900);
await cap("Or press an example. GateHub:", 1800);
await page.click("[data-example='rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq']");
await result(); await scrollTo("[data-result]"); await cap("Different issuer, different controls.", 3600);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })); await wait(900);
await cap("Ripple's RLUSD stablecoin issuer:", 1800);
await page.click("[data-example='rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De']");
await result(); await scrollTo("[data-result]"); await cap("A regulated stablecoin keeps more controls. NOSHASHI shows them; it does not judge them.", 4600);

// 4. Asset intelligence on a real account
await page.goto(BASE + "/app/asset/", { waitUntil: "networkidle" });
await cap("Asset intelligence: paste any XRPL account to see what it holds and from whom.", 3600);
await type("#q", "rMZKeAt1vMjhuNCWDiB4SdzJRiymdpERw4");
await page.click("form.ws-search button[type=submit]");
await result(); await scrollTo("[data-result]");
await cap("Each holding is tied back to its issuer, so you can check that issuer next.", 4200);
await slowScroll(600, 6); await wait(1200);

// 5. Liquidity
await page.goto(BASE + "/app/liquidity/", { waitUntil: "networkidle" });
await cap("Liquidity: how much of an order book could actually fill.", 3200);
await page.click("form.ws-search button[type=submit]");
await result(); await scrollTo("[data-result]");
await cap("Advertised depth against fillable depth, at one validated ledger.", 4400);
await slowScroll(500, 5); await wait(1000);

// 6. Feedback
await page.goto(BASE + "/app/issuer/", { waitUntil: "networkidle" });
await scrollTo(".ws-tester");
await cap("Testing NOSHASHI? Tell us what was useful, confusing or missing.", 3600);
await page.click(".ws-tester [data-ctx-open='feedback']");
await wait(900);
await cap("Feedback goes privately to the founder. Email is optional. Nothing is published.", 4600);
await cap("Try it free at noshashi.app/app", 3600);

const video = page.video();
await ctx.close(); await browser.close();
console.log("VIDEO", await video.path());
