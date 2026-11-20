// Records the /tutorials/ videos (scripts/tutorials/tutorials.mjs) into
// site/tutorials/videos/: <id>.mp4 (H.264 + AAC), <id>.vtt and <id>.jpg.
//
//   node scripts/tutorials/build.mjs <kokoro-model-dir> [id…]
//   node scripts/tutorials/build.mjs --silent [id…]   captions only, no voice
//
// Each tutorial is a real browser session on the local preview
// (scripts/dev-site.mjs, started here unless BASE is set), reading XRPL
// Mainnet live. A step that waits for a result fails the tutorial if the
// result does not arrive, so a video never shows a screen that did not
// load. The narration is Kokoro (Apache-2.0) via scripts/learn-videos/tts.py,
// run locally: free, and no speech service is called.
//
// Needs Playwright's Chromium, ffmpeg (FFMPEG=path to override), and for
// the voice python3 with kokoro-onnx and numpy.
// .github/workflows/tutorial-videos.yml runs it on a GitHub runner.

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { TUTORIALS } from "./tutorials.mjs";
import { SPOKEN } from "../learn-videos/videos.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, "site", "tutorials", "videos");
const CACHE = path.join(ROOT, "node_modules", ".cache", "tutorial-videos");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const RATE = 24000, W = 1280, H = 720;
const args = process.argv.slice(2);
const SILENT = args[0] === "--silent";
const MODEL_DIR = SILENT ? null : args[0];
const ONLY = args.slice(1);
if (!SILENT && !MODEL_DIR) { console.error("usage: build.mjs <model-dir> [id…] | --silent [id…]"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const RLUSD = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const RLUSD_HEX = "524C555344000000000000000000000000000000";
const spoken = (s) => SPOKEN.reduce((t, [re, to]) => t.replace(re, to), s);
const pcmFile = (text) => path.join(CACHE, crypto.createHash("sha256").update("af_heart|1.0|" + text).digest("hex").slice(0, 24) + ".pcm");
const chosen = TUTORIALS.filter((t) => !ONLY.length || ONLY.includes(t.id));
const lineOf = (step) => ({ caption: step[1], said: spoken(step[2] || step[1]) });

// 1. Narration, spoken once per line and cached by its text.
if (!SILENT) {
  const jobs = chosen.flatMap((t) => t.steps.filter((s) => s[0] === "say").map((s) => {
    const { said } = lineOf(s);
    return { text: said, out: pcmFile(said) };
  }));
  fs.writeFileSync(path.join(CACHE, "jobs.json"), JSON.stringify(jobs));
  const shards = Math.max(1, Number(process.env.TTS_WORKERS) || 3);
  const codes = await Promise.all(Array.from({ length: shards }, (_, i) => new Promise((ok) =>
    spawn("python3", [path.join(ROOT, "scripts/learn-videos/tts.py"), path.join(CACHE, "jobs.json"), MODEL_DIR, `${i}/${shards}`], { stdio: "inherit" })
      .on("close", ok))));
  if (codes.some((c) => c !== 0)) process.exit(1);
}
/** How long a line takes to say, in ms: the real clip, or a reading-speed estimate when silent. */
const lineMs = (said) => SILENT ? Math.round(said.split(/\s+/).length / 2.6 * 1000) : Math.round(fs.statSync(pcmFile(said)).size / 2 / RATE * 1000);

// 2. The local preview, which applies vercel.json's headers and CSP.
let server = null;
const BASE = process.env.BASE || "http://127.0.0.1:4321";
if (!process.env.BASE) {
  server = spawn("node", [path.join(ROOT, "scripts/dev-site.mjs")], { stdio: "ignore", env: { ...process.env, PORT: "4321" } });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE + "/")).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** One JSON-RPC call to a public Mainnet server, trying the next if one fails. */
async function rpc(method, params) {
  for (const url of ["https://xrplcluster.com", "https://xrplcluster.com", "https://xrplcluster.com", "https://s2.ripple.com:51234", "https://s1.ripple.com:51234"]) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method, params: [params] }), signal: AbortSignal.timeout(15000) });
      const b = await r.json();
      if (b.result && b.result.status === "success") return b.result;
    } catch {}
    await new Promise((r) => setTimeout(r, 1500)); // public servers rate-limit bursts
  }
  throw new Error(`${method}: no public server answered`);
}

/**
 * Live steps. Continuity is shown on a real issued-token payment, RLUSD when
 * one is in the latest ledgers, read from Mainnet as the video is recorded. The posted credit stands in for the operator's books
 * and is built from that payment's own fields, as the narration says.
 */
const LIVE = {
  async "continuity-load"(page, state) {
    // The RLUSD issuer's own history is mostly order-book activity, so the
    // payment is found by reading the latest validated ledgers instead:
    // the newest successful, full (not partial) RLUSD payment of at least
    // one unit. If none is in the last 300 ledgers, the newest such
    // payment of any issued token is used; the narration does not name it.
    const usable = (t, rlusd) => {
      const m = t.metaData || t.meta || {}, d = m.delivered_amount;
      return t.TransactionType === "Payment" && m.TransactionResult === "tesSUCCESS" && !(Number(t.Flags) & 0x00020000) &&
        d && typeof d === "object" && Number(d.value) >= 1 && d.issuer !== t.Destination && t.Account !== t.Destination &&
        (!rlusd || (d.issuer === RLUSD && d.currency === RLUSD_HEX));
    };
    const latest = (await rpc("ledger", { ledger_index: "validated" })).ledger_index;
    let tx = null, fallback = null;
    for (let i = 0; i < 300 && !tx; i++) {
      const l = (await rpc("ledger", { ledger_index: latest - i, transactions: true, expand: true })).ledger;
      for (const t of l.transactions || []) {
        if (usable(t, true)) { tx = { t, ledger: l.ledger_index }; break; }
        if (!fallback && usable(t, false)) fallback = { t, ledger: l.ledger_index };
      }
    }
    const pick = tx || fallback;
    if (!pick) throw new Error("no recent issued-token payment found");
    const t = pick.t, d = (t.metaData || t.meta).delivered_amount, hash = t.hash;
    const credit = { txHash: hash, amount: d.value, issuer: d.issuer, currency: d.currency };
    state.scenario = { requirement: { destination: t.Destination, issuer: d.issuer, currency: d.currency, amount: d.value }, creditExportComplete: true, credits: [credit] };
    state.hash = hash;
    state.note = `payment ${hash} in ledger ${pick.ledger}${tx ? " (RLUSD)" : ""}`;
    await page.fill("#data", JSON.stringify(state.scenario, null, 2));
    await page.fill("#hash", hash);
  },
  async "continuity-double"(page, state) {
    const s = JSON.parse(JSON.stringify(state.scenario));
    s.credits.push({ ...s.credits[0] });
    await page.fill("#data", JSON.stringify(s, null, 2));
  },
  async "api-raw"(page) {
    await page.goto(BASE + "/api/v1/rippling?account=rPvuCxw1m8u2SWTqtRN6ZEcb1xPbU4cPFR", { waitUntil: "load" });
    await page.waitForFunction(() => /"verdict"/.test(document.body.innerText), null, { timeout: 45000 });
    await page.evaluate(() => { document.body.style.cssText = "background:#0d120d;color:#dfe9d9;font:14px/1.5 monospace;padding:24px 28px 120px"; });
  },
};

const OVERLAY = () => {
  window.__cap = (t, chip) => {
    let el = document.getElementById("__cap"), c = document.getElementById("__chip");
    if (!el) {
      el = document.createElement("div"); el.id = "__cap";
      el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;max-width:84%;padding:12px 20px;border-radius:12px;background:rgba(6,12,6,.93);color:#eaf5e4;border:1px solid rgba(155,226,92,.55);font:500 19px/1.4 system-ui,sans-serif;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.5);pointer-events:none";
      document.documentElement.appendChild(el);
      c = document.createElement("div"); c.id = "__chip";
      c.style.cssText = "position:fixed;left:18px;top:74px;z-index:2147483647;padding:6px 12px;border-radius:999px;background:rgba(6,12,6,.88);color:#b9e59a;border:1px solid rgba(155,226,92,.45);font:600 12px/1.2 ui-monospace,monospace;letter-spacing:.06em;pointer-events:none";
      document.documentElement.appendChild(c);
    }
    el.textContent = t || ""; el.style.opacity = t ? "1" : "0";
    if (chip) c.textContent = chip;
  };
};

const vttTime = (ms) => new Date(ms).toISOString().slice(11, 23);

async function record(browser, t) {
  const tmp = fs.mkdtempSync(path.join(CACHE, "rec-"));
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: "dark", recordVideo: { dir: tmp, size: { width: W, height: H } } });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  const t0 = Date.now(), cues = [], state = {};
  const chip = `NOSHASHI TUTORIAL · ${t.audience === "developers" ? "DEVELOPERS" : "INSTITUTIONS"}`;
  let caption = "";
  const recap = () => page.evaluate(([x, c]) => window.__cap && window.__cap(x, c), [caption, chip]).catch(() => {});
  try {
    for (const step of t.steps) {
      const [op, a, b] = step;
      if (op === "go") { await page.goto(BASE + a, { waitUntil: "networkidle", timeout: 45000 }); await page.waitForTimeout(700); await recap(); }
      else if (op === "say") {
        const { caption: c, said } = lineOf(step);
        caption = c; await recap();
        const ms = lineMs(said);
        cues.push({ at: Date.now() - t0, ms, caption: c, said });
        await page.waitForTimeout(Math.max(2200, ms + 450));
      }
      else if (op === "type") { await page.click(a); await page.fill(a, ""); await page.type(a, b, { delay: 28 }); }
      else if (op === "click") { await page.locator(a).first().click(); await page.waitForTimeout(500); }
      else if (op === "wait") { await page.waitForSelector(a, { state: "visible", timeout: 45000 }); await page.waitForTimeout(900); }
      else if (op === "waitText") { await page.waitForFunction(([s, re]) => { const e = document.querySelector(s); return e && new RegExp(re).test(e.textContent); }, [a, b], { timeout: 45000 }); await page.waitForTimeout(900); }
      else if (op === "scroll") { await page.evaluate((s) => { const e = document.querySelector(s); if (e) window.scrollTo({ top: Math.max(0, e.getBoundingClientRect().top + scrollY - 110), behavior: "smooth" }); }, a); await page.waitForTimeout(1000); }
      else if (op === "wheel") { for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, a / 6); await page.waitForTimeout(220); } }
      else if (op === "pause") await page.waitForTimeout(a);
      else if (op === "live") { await LIVE[a](page, state); await page.waitForTimeout(600); await recap(); }
      else throw new Error("unknown step " + op);
    }
    caption = ""; await recap(); await page.waitForTimeout(1200);
  } finally {
    await ctx.close();
  }
  const webm = await page.video().path();
  return { webm, cues, total: Date.now() - t0, note: state.note || null, tmp };
}

function encode(t, rec) {
  const mp4 = path.join(OUT, `${t.id}.mp4`);
  const enc = ["-c:v", "libx264", "-preset", "slow", "-crf", "30", "-tune", "stillimage", "-pix_fmt", "yuv420p", "-r", "15", "-movflags", "+faststart"];
  let argsFf;
  if (SILENT) argsFf = ["-y", "-loglevel", "error", "-i", rec.webm, ...enc, "-an", mp4];
  else {
    const buf = Buffer.alloc(Math.ceil((rec.total / 1000 + 1) * RATE) * 2);
    for (const c of rec.cues) fs.readFileSync(pcmFile(c.said)).copy(buf, Math.round((c.at / 1000 + 0.15) * RATE) * 2);
    const raw = path.join(rec.tmp, "voice.pcm");
    fs.writeFileSync(raw, buf);
    argsFf = ["-y", "-loglevel", "error", "-i", rec.webm, "-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", raw,
      "-map", "0:v", "-map", "1:a", ...enc, "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-shortest", mp4];
  }
  const r = spawnSync(FFMPEG, argsFf, { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed");
  const posterAt = ((rec.cues[2] || rec.cues[0]).at / 1000 + 1).toFixed(2);
  spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-ss", posterAt, "-i", rec.webm, "-frames:v", "1", "-q:v", "5", path.join(OUT, `${t.id}.jpg`)], { stdio: "inherit" });
  const vtt = ["WEBVTT", ""].concat(rec.cues.map((c, i) => {
    const end = Math.min(c.at + Math.max(2200, c.ms + 450), (rec.cues[i + 1] || { at: rec.total }).at);
    return `${i + 1}\n${vttTime(c.at)} --> ${vttTime(end)}\n${c.caption}\n`;
  }));
  fs.writeFileSync(path.join(OUT, `${t.id}.vtt`), vtt.join("\n"));
  return { id: t.id, seconds: Math.round(rec.total / 1000), recorded_at: new Date().toISOString(), voiced: !SILENT, live_note: rec.note, bytes: fs.statSync(mp4).size };
}

const browser = await chromium.launch();
const done = [], failed = [];
for (const t of chosen) {
  try {
    console.log("recording", t.id);
    const rec = await record(browser, t);
    const m = encode(t, rec);
    fs.rmSync(rec.tmp, { recursive: true, force: true });
    done.push(m);
    console.log("  ok", m.seconds + "s", (m.bytes / 1e6).toFixed(2) + " MB", m.live_note || "");
  } catch (e) {
    failed.push(t.id);
    console.error("  FAILED", t.id, e.message);
  }
}
await browser.close();
if (server) server.kill();

const manifestFile = path.join(OUT, "manifest.json");
let manifest = {};
try { manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")); } catch {}
for (const m of done) manifest[m.id] = m;
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
if (failed.length) { console.error("failed:", failed.join(" ")); process.exit(1); }
