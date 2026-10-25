/*
 * Records the homepage demo video: a walkthrough of the workspace against
 * the local dev server (node scripts/dev-site.mjs), which reads XRPL mainnet
 * live. Needs Playwright with Chromium and network access to XRPL.
 *
 *   BASE=http://127.0.0.1:4321 node scripts/record-demo.mjs
 *
 * Writes a WebM and cues.json (when each line starts) to ./out. .github/workflows/demo-video.yml runs it, encodes
 * the MP4 and poster into site/assets/video and commits them.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

/*
 * Each line is [caption on screen, text the narrator reads]. The spoken
 * form spells out what a voice would misread (XRPL, RLUSD, the URL).
 */
const LINES = {
  l01: ["NOSHASHI reads the XRP Ledger live. Nothing here is sample data.", "Noshashi reads the X R P Ledger live. Nothing here is sample data."],
  l02: ["Every tool is free to open. No account, no sign-up.", "Every tool is free to open. No account, no sign-up."],
  l03: ["Issuer analysis: what controls an issuer keeps over its tokens.", "Issuer analysis, what controls an issuer keeps over its tokens."],
  l04: ["New here? Three steps: paste an issuer, read the controls, check the evidence.", "New here? Three steps: paste an issuer, read the controls, check the evidence."],
  l05: ["Bitstamp's USD issuer, address published by Bitstamp.", "Bitstamp's U S D issuer, address published by Bitstamp."],
  l06: ["Read from a validated mainnet ledger just now.", "Read from a validated mainnet ledger just now."],
  l07: ["Can it freeze holders? Claw back balances? Require approval? Charge a transfer fee?", "Can it freeze holders? Claw back balances? Require approval? Charge a transfer fee?"],
  l08: ["What the ledger does not show is listed too, so you know what to verify yourself.", "What the ledger does not show is listed too, so you know what to verify yourself."],
  l09: ["Evidence: the ledger index and the raw reply, so anyone can re-check it.", "Evidence: the ledger index and the raw reply, so anyone can re-check it."],
  l10: ["Or press an example. GateHub:", "Or press an example. GateHub:"],
  l11: ["Different issuer, different controls.", "Different issuer, different controls."],
  l12: ["Ripple's RLUSD stablecoin issuer:", "Ripple's R L U S D stablecoin issuer:"],
  l13: ["A regulated stablecoin keeps more controls. NOSHASHI shows them; it does not judge them.", "A regulated stablecoin keeps more controls. Noshashi shows them; it does not judge them."],
  l14: ["Asset intelligence: paste any XRPL account to see what it holds and from whom.", "Asset intelligence: paste any X R P L account to see what it holds and from whom."],
  l15: ["Each holding is tied back to its issuer, so you can check that issuer next.", "Each holding is tied back to its issuer, so you can check that issuer next."],
  l16: ["Liquidity: how much of an order book could actually fill.", "Liquidity: how much of an order book could actually fill."],
  l17: ["Advertised depth against fillable depth, at one validated ledger.", "Advertised depth against fillable depth, at one validated ledger."],
  l18: ["Testing NOSHASHI? Tell us what was useful, confusing or missing.", "Testing Noshashi? Tell us what was useful, confusing or missing."],
  l19: ["Feedback goes privately to the founder. Email is optional. Nothing is published.", "Feedback goes privately to the founder. Email is optional. Nothing is published."],
  l20: ["Try it free at noshashi.app/app", "Try it free at noshashi dot app, slash app"],
};

// `--lines` prints the narration script for the voice step, then exits.
if (process.argv.includes("--lines")) {
  console.log(JSON.stringify(Object.fromEntries(Object.entries(LINES).map(([id, [, said]]) => [id, said]))));
  process.exit(0);
}

// NARRATION points at the folder of synthesized clips; durations.json
// holds each clip's length in ms, so a caption stays up until its line
// has been read. Without it the video is captions only.
let spoken = {};
try { spoken = JSON.parse(readFileSync(`${process.env.NARRATION}/durations.json`, "utf8")); } catch {}

const { chromium } = await import("playwright");

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
// The recording starts with the page; cue times are measured from here.
const t0 = Date.now();
const cues = [];
const wait = (ms) => page.waitForTimeout(ms);
const cap = async (id, ms = 3200) => {
  await page.evaluate((x) => window.__cap(x), LINES[id][0]);
  cues.push({ id, at: Date.now() - t0 });
  await wait(Math.max(ms, (spoken[id] || 0) + 400));
};
const scrollTo = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); await page.evaluate((s) => { const e = document.querySelector(s); if (e) e.scrollIntoView({ behavior: "smooth", block: "start" }); }, sel); await wait(900); };
const slowScroll = async (px, steps = 6) => { for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, px / steps); await wait(260); } };
const result = async () => { await page.waitForSelector("[data-result]:not([hidden])", { timeout: 30000 }); await wait(1200); };
const type = async (sel, text) => { await page.click(sel); await page.fill(sel, ""); await page.type(sel, text, { delay: 35 }); };

// 1. Home
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await cap("l01", 3600);
await slowScroll(500); await cap("l02", 3000);

// 2. Issuer analysis: guide + Bitstamp
await page.goto(BASE + "/app/issuer/", { waitUntil: "networkidle" });
await cap("l03", 3400);
await cap("l04", 3800);
await type("#q", "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B");
await cap("l05", 2400);
await page.click("form.ws-search button[type=submit]");
await result();
await cap("l06", 3200);
await scrollTo("[data-result]");
await cap("l07", 4200);
await slowScroll(700, 8);
await cap("l08", 4400);
await slowScroll(600, 6);
await cap("l09", 3800);

// 3. GateHub and RLUSD via the examples
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })); await wait(900);
await cap("l10", 1800);
await page.click("[data-example='rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq']");
await result(); await scrollTo("[data-result]"); await cap("l11", 3600);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })); await wait(900);
await cap("l12", 1800);
await page.click("[data-example='rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De']");
await result(); await scrollTo("[data-result]"); await cap("l13", 4600);

// 4. Asset intelligence on a real account
await page.goto(BASE + "/app/asset/", { waitUntil: "networkidle" });
await cap("l14", 3600);
await type("#q", "rMZKeAt1vMjhuNCWDiB4SdzJRiymdpERw4");
await page.click("form.ws-search button[type=submit]");
await result(); await scrollTo("[data-result]");
await cap("l15", 4200);
await slowScroll(600, 6); await wait(1200);

// 5. Liquidity
await page.goto(BASE + "/app/liquidity/", { waitUntil: "networkidle" });
await cap("l16", 3200);
await page.click("form.ws-search button[type=submit]");
await result(); await scrollTo("[data-result]");
await cap("l17", 4400);
await slowScroll(500, 5); await wait(1000);

// 6. Feedback
await page.goto(BASE + "/app/issuer/", { waitUntil: "networkidle" });
await scrollTo(".ws-tester");
await cap("l18", 3600);
await page.click(".ws-tester [data-ctx-open='feedback']");
await wait(900);
await cap("l19", 4600);
await cap("l20", 3600);

const video = page.video();
await ctx.close(); await browser.close();
console.log("VIDEO", await video.path());
mkdirSync("out", { recursive: true });
writeFileSync("out/cues.json", JSON.stringify(cues));
