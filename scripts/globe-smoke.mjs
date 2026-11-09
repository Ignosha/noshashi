import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const output = '/tmp/noshashi-globe-validation';
await mkdir(output, { recursive: true });
const results = [];
const check = (name, ok) => { results.push({ name, passed: !!ok }); if (!ok) throw new Error(name); };
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/xrp-news?**', r => r.fulfill({ status: 503, body: '{}' }));
  await page.route('**/api/project-feed?**', r => r.fulfill({ status: 503, body: '{}' }));
  let reads = 0;
  let payload = { fetchedAt: new Date().toISOString(), sources: { ledger: true }, ledger: { node: 'xrplcluster.com', sequence: 123456, baseFeeXrp: 0.00001, peers: 21 } };
  await page.route('**/api/xrp-market', r => { reads++; return r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(payload) }); });
  await page.goto('http://localhost:4389/intelligence/');
  await page.waitForFunction(() => document.querySelector('[data-ledger-globe]').getAttribute('aria-busy') === 'false');
  check('Valid ledger survives unrelated spot-price HTTP503', (await page.locator('[data-globe-sequence]').textContent()) === '#123,456');
  check('Ledger source and cache limitation visible', (await page.locator('[data-ledger-globe]').textContent()).includes('may be cached') && (await page.locator('[data-globe-time]').textContent()).includes('xrplcluster.com'));
  check('Node fee and peers displayed', (await page.locator('[data-globe-fee]').textContent()).includes('0.00001') && (await page.locator('[data-globe-peers]').textContent()) === '21');
  const paths = page.locator('[data-globe-meridians] path').first();
  const first = await paths.getAttribute('d'); await page.waitForTimeout(200);
  check('Sphere meridians actually rotate', first !== await paths.getAttribute('d'));
  await page.locator('[data-globe-motion]').click();
  const stopped = await paths.getAttribute('d'); await page.waitForTimeout(150);
  check('Pause stops geometry updates', stopped === await paths.getAttribute('d'));
  check('Pause exposed accessibly', await page.locator('[data-globe-motion]').getAttribute('aria-pressed') === 'true');
  await page.locator('[data-globe-motion]').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.querySelector('[data-globe-motion]').disabled);
  check('Reduced-motion preference disables animation control', await page.locator('[data-globe-motion]').isDisabled());
  check('Initial read has no invented ledger-advance pulse', !await page.locator('[data-ledger-globe]').evaluate(g => g.classList.contains('nr-ledger-advanced')));
  check('Rapid refresh disabled', await page.locator('[data-globe-refresh]').isDisabled() && reads === 1);
  await page.clock.install(); await page.clock.fastForward(11000);
  payload = { ...payload, fetchedAt: new Date().toISOString(), ledger: { node: 'xrplcluster.com', sequence: 123457 } };
  await page.locator('[data-globe-refresh]').click();
  await page.waitForFunction(() => document.querySelector('[data-globe-sequence]').textContent === '#123,457');
  check('Missing optional fields never invented as zero', await page.locator('[data-globe-fee]').textContent() === 'Unavailable' && await page.locator('[data-globe-peers]').textContent() === 'Unavailable');
  payload = { ...payload, fetchedAt: new Date(Date.now() - 600000).toISOString() };
  await page.clock.fastForward(11000); await page.locator('[data-globe-refresh]').click();
  await page.waitForFunction(() => document.querySelector('[data-ledger-globe]').dataset.reading === 'stale');
  check('Old ledger readings labelled stale', (await page.locator('[data-globe-status]').textContent()).includes('Stale'));
  payload = { ...payload, sources: { ledger: false } };
  await page.clock.fastForward(11000); await page.locator('[data-globe-refresh]').click();
  await page.waitForFunction(() => document.querySelector('[data-ledger-globe]').dataset.reading === 'unavailable');
  check('Failed reading clears old sequence and values', await page.locator('[data-globe-sequence]').textContent() === 'Not read');
  // Screenshot an honest outage; synthetic success values are test-only.
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  check('No mobile horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  check('No browser runtime errors', errors.length === 0);
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ scope: 'Local preview, synthetic ledger fixtures for behavior, outage screenshots. No production ledger verification.', results }, null, 2));
}
console.log(`${results.length} globe browser checks passed. Screenshots: ${output}`);
