import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const base = process.argv[2] || 'http://localhost:4347';
const out = process.env.WALKTHROUGH_DIR || '/tmp/noshashi-settlement-walkthrough';
await mkdir(out, { recursive: true });
const scenes = JSON.parse(await readFile(new URL('../evaluation/walkthrough.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const overlay = async scene => page.evaluate(s => {
    document.querySelector('#walkthrough-caption')?.remove();
    const box = document.createElement('div'); box.id = 'walkthrough-caption';
    box.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:24px 60px;background:#0b130ff5;border-top:2px solid #8ed8b5;color:#fff;font:26px/1.5 system-ui;';
    const title = document.createElement('p'); title.textContent = 'NOSHASHI LABS / '+s.title; title.style.cssText = 'color:#8ed8b5;font:14px monospace;letter-spacing:.1em;margin:0 0 8px';
    const caption = document.createElement('p'); caption.textContent = s.caption; caption.style.margin='0';
    const note = document.createElement('p'); note.textContent = 'TEACHING EXPECTATIONS · PUBLIC ARCHIVED TRANSACTION · SYNTHETIC MALE NARRATION'; note.style.cssText='font:11px monospace;color:#abb7af;margin:12px 0 0';
    box.append(title,caption,note); document.body.append(box);
  }, scene);
  await page.goto(base + '/settlement-desk/evaluate/'); await page.getByRole('button', { name: '01 / Exact amount baseline' }).waitFor();
  for (const scene of scenes) {
    await page.evaluate(() => document.querySelector('#walkthrough-caption')?.remove());
    if (scene.case) { await page.getByRole('button', { name: scene.case }).click(); await page.evaluate(() => window.scrollTo(0, document.querySelector('.se-layout').getBoundingClientRect().top + scrollY - 80)); }
    if (scene.id === 'live') {
      await page.goto(base + '/settlement-desk/#evaluation=baseline');
      await page.getByText('Synthetic invoice expectation loaded', { exact: false }).waitFor();
      await page.getByRole('button', { name: 'Compare with ledger' }).click();
      await page.getByText('exact ledger match', { exact: true }).waitFor({ timeout: 20000 });
      await page.evaluate(() => window.scrollTo(0, document.querySelector('.sd-workspace').getBoundingClientRect().top + scrollY - 80));
    }
    if (scene.id === 'feedback') {
      await page.goto(base + '/settlement-desk/evaluate/'); await page.getByRole('button', { name: '01 / Exact amount baseline' }).waitFor();
      await page.evaluate(() => window.scrollTo(0, document.querySelector('.se-feedback').getBoundingClientRect().top + scrollY - 80));
    }
    await overlay(scene); await page.screenshot({ path: out + '/' + scene.id + '.png' });
  }
  await writeFile(out + '/capture.json', JSON.stringify({ viewport: '1920x1080 CSS pixels at 2x device scale', pixel_dimensions: '3840x2160', synthetic_narration: 'Kokoro am_michael, local CPU inference; not a human clone', scene_count: scenes.length, live_scene: 'Real public node query, synthetic invoice expectation matched to archived payment', publication: 'Local review only; not uploaded or published' }, null, 2));
  console.log('Captured eight actual product views at native 3840x2160, with teaching labels and a real live-node read.');
} finally { await browser.close(); }
