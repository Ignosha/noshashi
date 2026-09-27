// Renders the NOSHASHI 15-second ad to MP4 (1080x1920, 30 fps, H.264 + AAC).
//
//   node scripts/ad/render.mjs [out.mp4]
//
// Frames are drawn deterministically by ad.html's seek(t) and screenshotted
// one by one; the soundtrack comes from music.py. Needs Playwright's
// Chromium, python3 with numpy, and ffmpeg (FFMPEG=path, or the one
// imageio-ffmpeg ships). Everything is free and runs locally.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[2] || path.join(HERE, "noshashi-ad.mp4"));
const FPS = 30, DUR = 15, W = 1080, H = 1920;
const FFMPEG = process.env.FFMPEG ||
  spawnSync("python3", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"]).stdout.toString().trim();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "noshashi-ad-"));
const wav = path.join(tmp, "music.wav");
const music = spawnSync("python3", [path.join(HERE, "music.py"), wav], { stdio: "inherit" });
if (music.status !== 0) process.exit(1);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ["--allow-file-access-from-files"],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(HERE, "ad.html")).href);
await page.evaluate(() => window.ready);

const ff = spawn(FFMPEG, [
  "-y", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
  "-i", wav,
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-profile:v", "high",
  "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
  OUT,
], { stdio: ["pipe", "inherit", "inherit"] });

const frames = FPS * DUR;
for (let f = 0; f < frames; f++) {
  await page.evaluate((t) => window.seek(t), f / FPS);
  const png = await page.screenshot({ type: "png" });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 60 === 0) process.stdout.write(`frame ${f}/${frames}\n`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${OUT}`);
