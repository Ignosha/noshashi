/** Browser regression for the first investigation. Build the site and run
 * scripts/dev-site.mjs, then APP_URL=http://127.0.0.1:4321 node this file.
 * Recorded responses are unmodified public ledger receipts, never live results.
 * API/network failures are explicit test cases; no signup or contact is submitted.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const recorded = JSON.parse(await readFile(new URL('tests/fixtures/authority-comparison-2026-11-01.json', root), 'utf8'));
const records = new Map(recorded.records.map(r => [r.certificate.issuer, r]));
const rlusd = records.get('rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De').certificate;
const bitstamp = records.get('rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B').certificate;
const base = process.env.APP_URL || 'http://127.0.0.1:4321/';
const out = process.env.SHOTS_DIR || '/tmp/noshashi-first-investigation';
const modes = process.env.QA_MODES?.split(',') || ['dark', 'paper', 'mobile', 'reduced', 'no-js'];
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
 for (const mode of modes) {
  const context = await browser.newContext({ viewport: mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, javaScriptEnabled: mode !== 'no-js', reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference', acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`${mode}: ${e.message}`));
  let replyMode = 'valid', failRow = false;
  const held = [];
  await page.addInitScript(theme => localStorage.setItem('noshashi-theme', theme), mode === 'paper' ? 'light' : 'dark');
  await page.routeWebSocket('**', socket => socket.close());
  await page.route('**/*', async route => {
   const url = new URL(route.request().url());
   if (url.pathname.startsWith('/api/')) {
    const record = records.get(url.searchParams.get('issuer'));
    if (url.pathname !== '/api/authority' || !record) return route.fulfill({ status: 502, json: { error: 'Public ledger unavailable in recorded browser QA' } });
    const state = failRow && record.certificate.issuer === rlusd.issuer ? failRow : replyMode;
    if (state === 'deferred' || state === 'timeout') await new Promise(resolve => held.push(resolve));
    try {
     if (state === 'http-error') return await route.fulfill({ status: 502, json: { error: 'Public node unavailable' } });
     if (state === 'malformed') return await route.fulfill({ status: 200, contentType: 'application/json', body: '{' });
     const certificate = state === 'incomplete' ? { ...record.certificate, checks: [] } : state === 'tampered' ? { ...record.certificate, ledgerIndex: record.certificate.ledgerIndex + 1 } : record.certificate;
     return await route.fulfill({ json: certificate, headers: { 'x-vercel-cache': 'HIT', age: '19' } });
    } catch { return; } // An aborted request cannot receive its deliberately late reply.
   }
   if (url.origin !== new URL(base).origin) return route.abort();
   return route.continue();
  });
  const response = await page.goto(base, { waitUntil: 'load' });
  assert.equal(response.status(), 200);
  await page.evaluate(() => document.fonts.ready);
  assert(await page.locator('.lx-headline').isVisible());
  if (mode === 'no-js') {
   assert.equal(await page.locator('#lx-issuer-form').getAttribute('action'), '/certificate/');
   assert.equal(await page.locator('[data-lx-command]').isVisible(), false);
   assert(await page.locator('main noscript').first().isVisible());
   assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
   await page.screenshot({ path: `${out}/${mode}-hero.png` });
   console.log('PASS no-js: readable value proposition and standalone certificate fallback');
   await context.close(); continue;
  }
  await page.locator('[data-lx-command]').waitFor({ state: 'visible' });
  if (mode === 'mobile') {
   const menu = page.locator('.nav-menu-btn'); await menu.focus(); await page.keyboard.press('Enter');
   assert.equal(await menu.getAttribute('aria-expanded'), 'true');
   assert(await page.locator('#nav-panel').isVisible());
   assert(await page.locator('#nav-panel a[href="/institutional-demo/"]').isVisible());
   await page.screenshot({ path: `${out}/mobile-navigation.png` });
   await page.keyboard.press('Escape'); assert.equal(await menu.getAttribute('aria-expanded'), 'false');
   assert(await menu.evaluate(el => el === document.activeElement));
  }
  const state = () => page.locator('#lx-result').getAttribute('data-state');
  const waitState = value => page.waitForFunction(v => document.querySelector('#lx-result').dataset.state === v, value, { timeout: 26000 });
  const choose = certificate => page.locator(`[data-lx-issuer="${certificate.issuer}"]`).click();
  const submit = () => page.locator('#lx-read').click();
  // A working ledger connection is not a completed issuer investigation.
  await page.evaluate(() => dispatchEvent(new CustomEvent('noshashi:ledger', { detail: { index: 108049991 } })));
  assert.equal(await state(), 'idle');
  assert(await page.locator('#lx-download').isDisabled());
  for (const certificate of [rlusd, bitstamp]) {
   await choose(certificate); await submit(); await waitState('verified');
   assert.equal((await page.locator('[data-lx-subject]').textContent()).trim(), certificate.issuer);
   assert.equal((await page.locator('[data-lx-digest]').textContent()).trim(), certificate.digest);
   assert.equal((await page.locator('[data-lx-ledger]').textContent()).trim(), certificate.ledgerIndex.toLocaleString('en-US'));
   assert.equal((await page.locator('[data-lx-rules]').textContent()).trim(), String(certificate.rulesVersion));
   assert.match(await page.locator('[data-lx-provenance]').textContent(), /cached|stale/i);
   const pending = page.waitForEvent('download'); await page.locator('#lx-download').click();
   const download = await pending;
   assert.deepEqual(JSON.parse(await readFile(await download.path(), 'utf8')), certificate, 'Export is the identical receipt that was verified');
  }
  await choose(rlusd); await submit(); await waitState('verified');
  assert.match(await page.locator('[data-lx-findings]').textContent(), /not walked|no concentration|abstention/i);
  if (mode === 'dark') {
   for (const failure of ['http-error', 'malformed', 'incomplete', 'tampered']) {
    replyMode = failure; await submit(); await waitState('unavailable');
    assert.equal((await page.locator('[data-lx-ledger]').textContent()).trim(), '—');
    assert.equal((await page.locator('[data-lx-verdict]').textContent()).trim(), 'Not read');
    assert(await page.locator('#lx-download').isDisabled());
    assert.match(await page.locator('[data-lx-status]').textContent(), /retry|try again/i);
    if (failure === 'http-error') await page.locator('#lx-investigate').screenshot({ path: `${out}/${mode}-unavailable.png` });
   }
   replyMode = 'timeout'; const started = Date.now(); await submit(); await waitState('unavailable');
   assert(Date.now() - started < 25000, 'A non-responsive request has a bounded loading state');
   assert(await page.locator('#lx-read').isEnabled());
   held.splice(0).forEach(resolve => resolve());
   replyMode = 'valid'; await submit(); await waitState('verified');
   replyMode = 'deferred'; await submit(); await waitState('reading');
   assert.equal(await page.locator('#lx-result').getAttribute('aria-busy'), 'true');
   assert.equal(await page.locator('[data-lx-status]').getAttribute('role'), 'status');
   assert(await page.locator('#lx-download').isDisabled());
   await choose(bitstamp); held.splice(0).forEach(resolve => resolve()); await page.waitForTimeout(100);
   assert.equal(await state(), 'idle');
   assert.equal((await page.locator('[data-lx-ledger]').textContent()).trim(), '—');
   replyMode = 'valid'; await submit(); await waitState('verified');
   await page.locator('#lx-issuer').fill('invalid-address'); await submit();
   assert.equal(await page.locator('#lx-issuer').evaluate(el => el.checkValidity()), false);
   assert.equal(await state(), 'idle');
   await choose(rlusd); await submit(); await waitState('verified');
  }
  await page.locator('#rh-issuers').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('#rh-issuers tbody tr')].every(row => row.dataset.state === 'verified'));
  for (const [issuer, record] of records) {
   const row = page.locator(`#rh-issuers tr[data-issuer="${issuer}"]`);
   assert.match(await row.locator('[data-c=record]').textContent(), new RegExp(record.certificate.ledgerIndex.toLocaleString('en-US')));
  }
  if (mode === 'dark') {
   failRow = 'timeout'; const tableStarted = Date.now(); await page.locator('#rh-t1-retry').click();
   const row = page.locator(`#rh-issuers tr[data-issuer="${rlusd.issuer}"]`);
   await page.waitForFunction(issuer => document.querySelector(`#rh-issuers tr[data-issuer="${issuer}"]`).dataset.state === 'unavailable', rlusd.issuer, { timeout: 26000 });
   assert(Date.now() - tableStarted < 25000, 'Comparison loading is bounded too');
   assert.equal(await page.locator('#rh-issuers').getAttribute('aria-busy'), 'false');
   held.splice(0).forEach(resolve => resolve());
   assert.match(await row.innerText(), /not read|unavailable/i);
   failRow = false; await row.locator('[data-retry-issuer]').click();
   await page.waitForFunction(issuer => document.querySelector(`#rh-issuers tr[data-issuer="${issuer}"]`).dataset.state === 'verified', rlusd.issuer);
   await row.locator('summary').click();
   const pending = page.waitForEvent('download'); await row.locator('[data-download-issuer]').click();
   const download = await pending;
   assert.deepEqual(JSON.parse(await readFile(await download.path(), 'utf8')), rlusd);
  }
  await page.locator('#lx-result details summary').click();
  await page.locator('#rh-issuers').screenshot({ path: `${out}/${mode}-comparison.png` });
  await page.locator('#lx-investigate').screenshot({ path: `${out}/${mode}-investigation.png` });
  if (await page.locator('[data-lx-layer="0"]').isVisible()) for (const n of [1, 2, 0]) {
   const button = page.locator(`[data-lx-layer="${n}"]`); await button.focus(); await page.keyboard.press(n % 2 ? 'Enter' : 'Space');
   assert.equal(await button.getAttribute('aria-pressed'), 'true');
  }
  if (mode === 'reduced') assert.equal(await page.locator('[data-lx-plane]').first().evaluate(el => getComputedStyle(el).transform), 'none');
  await page.locator('[data-lx-view=sync]').click(); await page.locator('[data-lx-zoom]').click();
  assert(await page.locator('#lx-image-dialog').evaluate(el => el.open));
  await page.keyboard.press('Escape'); await page.locator('#lx-image-dialog').waitFor({ state: 'hidden' });
  await page.locator('[data-lx-command]').click();
  assert(await page.locator('#lx-command-search').evaluate(el => el === document.activeElement));
  await page.locator('#lx-command-search').fill('liquidity'); assert(await page.locator('[data-lx-tool]:visible').count() > 0);
  await page.keyboard.press('Escape'); await page.locator('#lx-command-dialog').waitFor({ state: 'hidden' });
  assert(await page.locator('[data-lx-command]').evaluate(el => el === document.activeElement));
  await page.clock.install(); await page.clock.fastForward(35000);
  assert.equal(await page.locator('[id*=subscribe][role=dialog]:visible, .subscribe-overlay:visible, .sub-dialog:visible').count(), 0, 'No timed signup interrupts an investigation');
  await page.evaluate(() => scrollTo(0, 0));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${mode}: no horizontal page overflow`);
  await page.screenshot({ path: `${out}/${mode}-hero.png` });
  await page.screenshot({ path: `${out}/${mode}-page.png`, fullPage: true });
  console.log(`PASS ${mode}: five/six-check receipts, exact exports, cache labels, comparison and retry, keyboard dialogs, layers, no overflow${mode === 'dark' ? ', invalid/incomplete/tampered/unavailable/timeout/late-response cases' : ''}`);
  await context.close();
 }
 for (const path of ['/', '/institutional-demo/', '/app/issuer/']) {
  const context = await browser.newContext(); const page = await context.newPage();
  page.on('pageerror', e => errors.push(`${path}: ${e.message}`));
  await page.clock.install();
  await page.routeWebSocket('**', socket => socket.close());
  await page.route('**/*', route => { const url = new URL(route.request().url());
   if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 502, json: { error: 'No live request in timed-signup regression' } });
   return url.origin === new URL(base).origin ? route.continue() : route.abort();
  });
  await page.goto(new URL(path, base).href, { waitUntil: 'load' }); await page.clock.fastForward(35000);
  assert.equal(await page.locator('.sub-dialog:visible, .subscribe-overlay:visible, [id*=subscribe][role=dialog]:visible').count(), 0, `${path}: no timed signup interrupts the workflow`);
  await context.close();
 }
 console.log('PASS active workflows: no timed signup on homepage, institutional demo or workspace');
 assert.deepEqual(errors, [], 'No browser runtime exceptions');
} finally { await browser.close(); }
