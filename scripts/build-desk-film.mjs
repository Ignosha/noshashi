/** Local, silent product film. No generated market data, voice, paid service or publication. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globe } from './build-newsroom.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = '/tmp/noshashi-desk-film-20261109';
const out = path.join(root, 'site/assets/video');
await mkdir(tmp, { recursive: true }); await mkdir(out, { recursive: true });
const scenes = [
  ['INSTITUTIONAL XRPL INTELLIGENCE', 'Before the decision,<br><em>inspect the evidence.</em>', 'For treasury, custody and operations teams.'],
  ['01 / ISSUER CONTROLS', 'Who can change<br><em>the rules?</em>', 'Inspect public XRPL issuer settings. Controls do not prove reserves or legal rights.'],
  ['02 / PAYMENTS · 03 / LIQUIDITY', 'What arrived?<br><em>What is funded?</em>', 'Review delivered payments and funded book depth. A snapshot does not guarantee execution.'],
  ['NOSHASHI LABS / EARLY BETA', 'From data<br><em>to decisions.</em>', 'Try the browser demo · noshashi.app/institutional-demo/'],
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto('http://localhost:4389/intelligence/');
  for (let i = 0; i < scenes.length; i++) {
    const [label, title, dek] = scenes[i];
    await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="http://localhost:4389/assets/fonts.css"><style>*{box-sizing:border-box}body{margin:0;background:#0b0b0c;color:#ededed;font:27px Inter,sans-serif;padding:70px 95px}.top,.bottom{display:flex;justify-content:space-between;font:16px 'IBM Plex Mono',monospace;letter-spacing:3px;color:#b5b5bb;border-bottom:1px solid #414145;padding-bottom:25px}.body{display:grid;grid-template-columns:1.2fr 1fr;gap:50px;align-items:center;height:780px}h1{font:110px/1.05 'Instrument Serif',Georgia,serif;letter-spacing:-2px;margin:36px 0}em{color:#91dbb2;font-weight:400}p{font-size:27px;line-height:1.7;color:#b5b5bb;max-width:37ch}.label{font:16px 'IBM Plex Mono',monospace;letter-spacing:2px}.bottom{border-top:1px solid #414145;border-bottom:0;padding-top:25px;letter-spacing:1px;font-size:14px}.nr-globe{margin:0}.nr-globe svg{width:100%}.nr-graticule{fill:none;stroke:#a6a6ab;stroke-width:.6}.nr-route{stroke:#91dbb2;stroke-width:1.5;stroke-dasharray:5 7}.nr-orbit{stroke-dasharray:2 6}.nr-points{fill:#91dbb2}.nr-globe text{fill:#b5b5bb;font:8px monospace}.nr-globe figcaption{font:14px monospace;color:#b5b5bb}</style></head><body><div class="top"><span>NOSHASHI LABS</span><span>LEDGER DESK — ${String(i + 1).padStart(2, '0')}</span></div><div class="body"><div><span class="label">${label}</span><h1>${title}</h1><p>${dek}</p></div>${globe}</div><div class="bottom"><span>READ-ONLY · PUBLIC NODE EVIDENCE · NO KEYS OR SIGNING</span><span>ILLUSTRATION / NO LIVE FLOWS</span></div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(tmp, `scene-${i}.png`) });
  }
} finally { await browser.close(); }
await writeFile(path.join(tmp, 'frames.txt'), scenes.map((_, i) => `file '${tmp}/scene-${i}.png'\nduration 4`).join('\n') + `\nfile '${tmp}/scene-3.png'\n`);
execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'frames.txt'), '-vf', 'fps=24,fade=t=in:st=0:d=0.5,fade=t=out:st=15.5:d=0.5,format=yuv420p', '-t', '16', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-movflags', '+faststart', path.join(out, 'ledger-desk-intro.mp4')], { stdio: 'ignore' });
execFileSync('ffmpeg', ['-y', '-i', path.join(tmp, 'scene-0.png'), '-q:v', '3', path.join(out, 'ledger-desk-intro.jpg')], { stdio: 'ignore' });
console.log('Built 16-second, 1920×1080 silent editorial product film. Captions/transcript are committed separately.');
