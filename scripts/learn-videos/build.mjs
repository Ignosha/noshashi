// Builds the Learn page's narrated explainers into site/learn/videos/:
// <id>.mp4 (H.264 + AAC), <id>.vtt (captions) and <id>.jpg (poster).
//
//   node scripts/learn-videos/build.mjs <model-dir> [video-id…]
//
// Needs: Playwright's Chromium, python3 with kokoro-onnx and numpy
// (pip install kokoro-onnx), and ffmpeg (FFMPEG=path, or the one
// imageio-ffmpeg ships). <model-dir> holds kokoro-v1.0.int8.onnx and
// voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx releases.
// Everything is free and runs locally; no service is called.
//
// Frames are rendered deterministically: the page exposes seek(scene, t)
// and each frame is a screenshot at that time, so the picture always
// matches the narration it was timed against.

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { SPOKEN, VIDEOS } from "./videos.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const SITE = path.join(ROOT, "site");
const OUT = path.join(SITE, "learn", "videos");
const CACHE = path.join(ROOT, "node_modules", ".cache", "learn-videos");
const MODEL_DIR = process.argv[2];
const ONLY = process.argv.slice(3);
const FPS = 24, W = 1280, H = 720, RATE = 24000;
const LEAD = 0.7, GAP = 0.45, TAIL = 1.0;

if (!MODEL_DIR) { console.error("usage: build.mjs <model-dir> [video-id…]"); process.exit(1); }
const FFMPEG = process.env.FFMPEG ||
  spawnSync("python3", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"]).stdout.toString().trim();
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const spoken = (s) => SPOKEN.reduce((t, [re, to]) => t.replace(re, to), s);
const beatFile = (text) => path.join(CACHE, crypto.createHash("sha256").update("af_heart|1.0|" + text).digest("hex").slice(0, 24) + ".pcm");

// 1. Narration: every beat of every chosen video, spoken once and cached.
const videos = VIDEOS.filter((v) => !ONLY.length || ONLY.includes(v.id));
const jobs = videos.flatMap((v) => v.scenes.flatMap((s) => s.say.map((t) => ({ text: spoken(t), out: beatFile(spoken(t)) }))));
fs.writeFileSync(path.join(CACHE, "jobs.json"), JSON.stringify(jobs));
// Kokoro uses about one core per process, so the lines are split across
// parallel workers.
const SHARDS = Math.max(1, Number(process.env.TTS_WORKERS) || 3);
const codes = await Promise.all(Array.from({ length: SHARDS }, (_, i) => new Promise((ok) =>
  spawn("python3", [path.join(HERE, "tts.py"), path.join(CACHE, "jobs.json"), MODEL_DIR, `${i}/${SHARDS}`], { stdio: "inherit" })
    .on("close", ok))));
if (codes.some((c) => c !== 0)) process.exit(1);

// 2. Timeline: where each beat starts, from the real length of its audio.
function timeline(video) {
  let t = 0;
  const scenes = video.scenes.map((s) => {
    const start = t, beats = [];
    let local = LEAD;
    for (const text of s.say) {
      const secs = fs.statSync(beatFile(spoken(text))).size / 2 / RATE;
      beats.push({ at: local, secs, text });
      local += secs + GAP;
    }
    const dur = local - GAP + TAIL;
    t += dur;
    return { start, dur, beats };
  });
  return { scenes, total: t };
}

function audio(video, tl) {
  const buf = Buffer.alloc(Math.ceil(tl.total * RATE) * 2 + 4);
  tl.scenes.forEach((s) => s.beats.forEach((b) => {
    fs.readFileSync(beatFile(spoken(b.text))).copy(buf, Math.round((s.start + b.at) * RATE) * 2);
  }));
  return buf;
}

const stamp = (t) => {
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
};
function captions(tl) {
  const cues = [];
  tl.scenes.forEach((s) => s.beats.forEach((b) => {
    // Long beats are split at sentence ends so a cue fits on two lines.
    const parts = b.text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g).map((p) => p.trim()).filter(Boolean);
    const total = parts.reduce((n, p) => n + p.length, 0);
    let at = s.start + b.at;
    for (const p of parts) {
      const d = b.secs * (p.length / total);
      cues.push(`${stamp(at)} --> ${stamp(at + d)}\n${p}`);
      at += d;
    }
  }));
  return "WEBVTT\n\n" + cues.map((c, i) => `${i + 1}\n${c}`).join("\n\n") + "\n";
}

// 3. Pictures: one page holding every scene of a video, driven by seek().
function page(video, tl) {
  const logo = fs.readFileSync(path.join(SITE, "favicon.svg"), "utf8");
  const scenes = video.scenes.map((s, i) => `
    <section class="scene" id="s${i}">
      <p class="kick">${s.kick}</p>
      <h1>${s.title}</h1>
      <div class="body">${s.body}</div>
    </section>`).join("");
  const at = JSON.stringify(tl.scenes.map((s) => ({ dur: s.dur, beats: s.beats.map((b) => b.at) })));
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/fonts.css">
<style>
  :root{--ground:#08100B;--surface:#0E1911;--elevated:#15251A;--ink:#E9F5E7;--muted:#A7B8A8;--faint:#718473;--rule:#263B2A;--brand:#9BE15D;--tele:#55D98A;--go:#9BE15D;--hold:#E7C766;--nogo:#FF7B7B}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:var(--ground);color:var(--ink);font-family:"Space Grotesk",sans-serif;-webkit-font-smoothing:antialiased}
  body::before{content:"";position:absolute;inset:0;background:radial-gradient(900px 500px at 88% -10%,rgba(155,225,93,.10),transparent 60%),radial-gradient(700px 420px at -10% 110%,rgba(85,217,138,.07),transparent 60%)}
  .chrome{position:absolute;left:72px;right:72px;top:34px;display:flex;justify-content:space-between;align-items:center;font-family:"IBM Plex Mono",monospace;font-size:12px;letter-spacing:.2em;color:var(--faint)}
  .chrome .b{display:flex;gap:12px;align-items:center;color:var(--ink);font-family:"Space Grotesk";font-weight:600;letter-spacing:.24em;font-size:14px}
  .chrome svg{width:30px;height:30px}
  .scene{position:absolute;left:72px;right:72px;top:104px;bottom:48px;opacity:0;display:flex;flex-direction:column}
  .kick{font-family:"IBM Plex Mono",monospace;font-size:13px;letter-spacing:.22em;color:var(--brand)}
  h1{font-size:44px;line-height:1.1;letter-spacing:-.025em;margin:14px 0 26px;max-width:1000px;font-weight:600}
  #s0 h1{font-size:64px;margin-top:120px}
  .sub{font-size:24px;color:var(--muted);max-width:900px}
  .body{flex:1}
  [data-at]{opacity:0}
  .cards{display:grid;gap:18px}.cards.two{grid-template-columns:1fr 1fr}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .c{background:var(--surface);border:1px solid var(--rule);border-radius:12px;padding:22px 24px}
  .c i{font-style:normal;font-family:"IBM Plex Mono",monospace;color:var(--brand);font-size:14px;display:block;margin-bottom:6px}
  .c b{display:block;font-size:24px;margin-bottom:8px;font-weight:600}.grid3 .c b,.grid2 .c b{font-size:20px}
  .c span{color:var(--muted);font-size:18px;line-height:1.45}.grid3 .c span,.grid2 .c span{font-size:16px}
  .note{margin-top:24px;font-size:20px;color:var(--muted);border-left:3px solid var(--tele);padding:6px 0 6px 16px;max-width:1040px}
  .note b{color:var(--ink)}
  .big{font-size:34px;margin-top:26px;color:var(--muted)}.big b{color:var(--ink)}
  .url{margin-top:34px;font-family:"IBM Plex Mono",monospace;font-size:22px;color:var(--brand);letter-spacing:.04em}
  .mono{font-family:"IBM Plex Mono",monospace}
  .addr{font-size:22px;margin-bottom:22px;color:var(--ink)}.addr small{display:block;font-size:14px;color:var(--faint);margin-top:4px;letter-spacing:.1em}
  .verdicts{display:grid;gap:12px}
  .v{display:flex;gap:26px;align-items:center;background:var(--surface);border:1px solid var(--rule);border-radius:12px;padding:16px 24px}
  .v b{font-family:"IBM Plex Mono",monospace;font-size:26px;min-width:140px}.v span{font-size:20px;color:var(--muted)}
  .go b,b.go,.go{color:var(--go)}.hold b,b.hold,.hold{color:var(--hold)}.nogo b,b.nogo,.nogo{color:var(--nogo)}.ok{color:var(--go)}
  .v.go b{color:var(--go)}.v.hold b{color:var(--hold)}.v.nogo b{color:var(--nogo)}
  .chips{margin-top:22px;display:flex;gap:10px;flex-wrap:wrap}
  .chips em{font-style:normal;font-family:"IBM Plex Mono",monospace;font-size:14px;border:1px solid var(--rule);border-radius:99px;padding:6px 14px;color:var(--muted)}
  .receipt{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .receipt div{background:var(--surface);border:1px solid var(--rule);border-radius:12px;padding:18px 22px}
  .receipt span{display:block;font-family:"IBM Plex Mono",monospace;font-size:12px;letter-spacing:.18em;color:var(--brand);margin-bottom:6px}
  .receipt b{font-size:22px;font-weight:500}
  .list{list-style:none;display:grid;gap:12px;max-width:1080px}
  .list li{font-size:22px;color:var(--ink);background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:14px 20px}
  .list.two{grid-template-columns:1fr 1fr}.list.two li{font-size:19px}
  .list em{font-style:normal;font-family:"IBM Plex Mono",monospace;font-size:12px;letter-spacing:.14em;margin-right:12px}
  .t{border-collapse:collapse;width:100%;font-size:19px}
  .t th{text-align:left;font-family:"IBM Plex Mono",monospace;font-size:12px;letter-spacing:.16em;color:var(--faint);font-weight:400;padding:0 18px 10px 0}
  .t td{padding:11px 18px 11px 0;border-top:1px solid var(--rule);color:var(--muted);vertical-align:top}
  .t td:first-child{color:var(--ink);font-weight:600;white-space:nowrap}
  .t.num td:not(:first-child){font-family:"IBM Plex Mono",monospace;font-size:17px}
  .t tr.okrow td:first-child{color:var(--go)}.t tr.midrow td:first-child{color:var(--hold)}.t tr.badrow td:first-child{color:var(--nogo)}
  .btn{font-family:"IBM Plex Mono",monospace;font-size:13px;letter-spacing:.08em;color:var(--ink);border:1px solid var(--brand);border-radius:6px;padding:3px 9px;margin-right:6px;white-space:nowrap}
  .flowrow{display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:20px;margin-bottom:24px}
  .flowrow span{background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:12px 18px}
  .flowrow span.hi{border-color:var(--brand);color:var(--brand)}.flowrow span.ok{border-color:var(--go);color:var(--go)}
  .flowrow i{font-style:normal;color:var(--faint);font-family:"IBM Plex Mono",monospace;font-size:16px}
  .weights{display:flex;gap:14px;align-items:center;margin-bottom:24px}
  .w{width:64px;height:64px;border-radius:50%;border:2px solid var(--rule);display:grid;place-items:center;font-family:"IBM Plex Mono",monospace;font-size:24px;color:var(--muted)}
  .w.on{border-color:var(--brand);color:var(--brand);background:rgba(155,225,93,.08)}
  .weights b{margin-left:16px;font-size:24px;font-weight:500}
  .bars{display:grid;gap:16px;max-width:1100px}
  .bar{position:relative;height:58px;border:1px solid var(--rule);border-radius:10px;overflow:hidden;background:var(--surface)}
  .bar .fill{position:absolute;left:0;top:0;bottom:0;width:0;background:rgba(155,225,93,.28);border-right:2px solid var(--brand)}
  .bar .fill.hold{background:rgba(231,199,102,.22);border-right-color:var(--hold)}
  .bar b{position:relative;display:block;padding:16px 20px;font-size:20px;font-weight:500}
  .book{display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:16px;align-items:stretch;margin-top:10px}
  .book div{border:1px solid var(--rule);border-radius:12px;padding:40px 24px;text-align:center;background:var(--surface)}
  .book b{display:block;font-size:30px;margin-bottom:8px}.book span{color:var(--muted);font-size:18px}
  .book .bid b{color:var(--go)}.book .ask b{color:var(--nogo)}.book .mid{border-color:var(--brand)}
</style></head><body>
<div class="chrome"><div class="b">${logo}NOSHASHI</div><div>LEARN · ${video.title.toUpperCase().slice(0, 60)}</div></div>
${scenes}
<script>
  var T = ${at};
  var ease = function(x){ x = Math.min(1, Math.max(0, x)); return 1 - Math.pow(1 - x, 3); };
  window.seek = function(si, t){
    var sig = [];
    T.forEach(function(s, i){
      var el = document.getElementById("s" + i);
      if (i !== si) { el.style.opacity = 0; return; }
      var o = Math.min(ease(t / 0.35), ease((s.dur - t) / 0.3));
      el.style.opacity = o; sig.push(o.toFixed(3));
      el.querySelectorAll("[data-at]").forEach(function(x){
        var k = Number(x.getAttribute("data-at")), p = ease((t - (s.beats[k] - 0.15)) / 0.45);
        x.style.opacity = p; x.style.transform = "translateY(" + ((1 - p) * 12).toFixed(2) + "px)";
        sig.push(p.toFixed(3));
        x.querySelectorAll(".fill").forEach(function(f){
          var q = ease((t - s.beats[k]) / 0.9);
          f.style.width = "calc(" + getComputedStyle(f).getPropertyValue("--f") + " * " + q.toFixed(3) + ")";
          sig.push(q.toFixed(3));
        });
      });
    });
    return si + ":" + sig.join(",");
  };
</script></body></html>`;
}

const types = { ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".html": "text/html" };
const pages = new Map();
const server = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split("?")[0]);
  if (pages.has(p)) { r.setHeader("content-type", "text/html"); return r.end(pages.get(p)); }
  const f = path.join(SITE, p);
  if (!f.startsWith(SITE) || !fs.existsSync(f)) { r.statusCode = 404; return r.end(); }
  r.setHeader("content-type", types[path.extname(f)] || "application/octet-stream");
  fs.createReadStream(f).pipe(r);
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });

for (const video of videos) {
  const tl = timeline(video);
  pages.set(`/__video/${video.id}.html`, page(video, tl));
  const pcm = path.join(CACHE, video.id + ".pcm");
  fs.writeFileSync(pcm, audio(video, tl));
  fs.writeFileSync(path.join(OUT, video.id + ".vtt"), captions(tl));

  const tab = await browser.newPage({ viewport: { width: W, height: H } });
  await tab.goto(`http://127.0.0.1:${port}/__video/${video.id}.html`, { waitUntil: "networkidle" });
  await tab.evaluate(() => document.fonts.ready);

  // Poster: the title scene once everything on it has appeared.
  const s0 = tl.scenes[0];
  await tab.evaluate(([t]) => window.seek(0, t), [s0.dur / 2]);
  fs.writeFileSync(path.join(OUT, video.id + ".jpg"), await tab.screenshot({ type: "jpeg", quality: 82 }));

  const mp4 = path.join(OUT, video.id + ".mp4");
  const ff = spawn(FFMPEG, ["-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", pcm,
    "-c:v", "libx264", "-preset", "slow", "-tune", "stillimage", "-crf", "24", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k", "-ar", "48000", "-shortest", "-movflags", "+faststart", mp4], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, no) => ff.on("close", (c) => (c === 0 ? ok() : no(new Error("ffmpeg exited " + c)))));

  const frames = Math.ceil(tl.total * FPS);
  let last = null, lastSig = "", shots = 0;
  for (let f = 0; f < frames; f++) {
    const t = f / FPS;
    let si = tl.scenes.findIndex((s) => t < s.start + s.dur);
    if (si < 0) si = tl.scenes.length - 1;
    const sig = await tab.evaluate(([i, lt]) => window.seek(i, lt), [si, t - tl.scenes[si].start]);
    if (sig !== lastSig || !last) { last = await tab.screenshot({ type: "jpeg", quality: 90 }); lastSig = sig; shots++; }
    if (!ff.stdin.write(last)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await done;
  await tab.close();
  fs.rmSync(pcm);
  const mb = (fs.statSync(mp4).size / 1048576).toFixed(1);
  console.log(`${video.id}: ${tl.total.toFixed(1)}s, ${frames} frames (${shots} rendered), ${mb} MB`);
}

await browser.close();
server.close();

// The page reads durations from here, so it never states a stale length.
const manifest = VIDEOS.map((v) => {
  const vtt = path.join(OUT, v.id + ".vtt");
  if (!fs.existsSync(vtt)) return null;
  const endings = [...fs.readFileSync(vtt, "utf8").matchAll(/--> (\d\d):(\d\d):(\d\d)\.(\d\d\d)/g)];
  const e = endings[endings.length - 1];
  const secs = Math.round(+e[1] * 3600 + +e[2] * 60 + +e[3] + +e[4] / 1000 + TAIL);
  return { id: v.id, title: v.title, blurb: v.blurb, lesson: v.lesson, secs };
}).filter(Boolean);
fs.writeFileSync(path.join(OUT, "videos.json"), JSON.stringify(manifest, null, 2) + "\n");
