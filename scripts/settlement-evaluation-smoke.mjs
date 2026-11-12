import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const base = process.argv[2] || 'http://localhost:4347', out = process.env.EVALUATION_SMOKE_DIR || '/tmp/noshashi-evaluation-smoke';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [], posts = []; page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.goto(base + '/settlement-desk/evaluate/');
  await page.getByRole('button', { name: '01 / Exact amount baseline' }).waitFor();
  await page.screenshot({ path: out + '/evaluation-desktop.png', fullPage: true });
  for (const [name, result] of [['02 / Less than expected', 'underpayment'], ['03 / Wrong invoice tag', 'destination tag mismatch'], ['04 / Evidence unavailable', 'delivered amount unavailable'], ['05 / One payment, two invoices', 'Duplicate transaction reference — reconcile manually; do not credit twice.']]) {
    await page.getByRole('button', { name }).click();
    await page.getByRole('heading', { name: result, exact: true }).waitFor();
  }
  await page.getByRole('combobox', { name: 'What would your reviewer do? (optional)' }).selectOption('Reconcile invoice allocation');
  await page.getByRole('button', { name: '02 / Less than expected' }).click();
  await page.getByRole('combobox', { name: 'What would your reviewer do? (optional)' }).selectOption('Investigate a discrepancy');
  await page.getByRole('textbox', { name: 'Workflow or team (optional)' }).fill('TEST FIXTURE - operations');
  await page.getByRole('combobox', { name: 'Does this add useful evidence?' }).selectOption('Somewhat');
  await page.getByRole('combobox', { name: 'Does your existing system already do this?' }).selectOption('Partly');
  await page.getByRole('textbox', { name: 'What helped, or what was missing?' }).fill('TEST FIXTURE: need reviewer allocation notes.');
  await page.getByRole('combobox', { name: 'Preferred next step' }).selectOption('Share more workflow feedback');
  const wait = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download my feedback' }).click(); const download = await wait;
  await download.saveAs(out + '/feedback-test.json'); const feedback = JSON.parse(await readFile(out + '/feedback-test.json', 'utf8'));
  assert.equal(feedback.answers.usefulness, 'Somewhat'); assert.equal(feedback.case_assessments['reused-payment'], 'Reconcile invoice allocation'); assert.equal(feedback.case_assessments['short-delivery'], 'Investigate a discrepancy'); assert.equal(posts.length, 0);
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: out + '/evaluation-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Load this expectation in the live desk →' }).click();
  await page.getByText('Synthetic invoice expectation loaded for a public archived transaction.', { exact: false }).waitFor();
  assert.equal(await page.locator('[name=invoice_id]').inputValue(), 'SYNTHETIC-SHORT');
  assert.equal(posts.length, 0, 'A teaching case must never auto-submit a live check');
  // A deliberate real-node check of the teaching expectation, not a real invoice.
  await page.getByRole('button', { name: 'Compare with ledger' }).click();
  await page.getByText('underpayment', { exact: true }).waitFor({ timeout: 20000 });
  assert.equal(posts.length, 1); await page.screenshot({ path: out + '/live-teaching-expectation.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Passed: five labeled cases, retained assessments, local feedback download without POST, mobile layout, explicit live check and synthetic-expectation warning.');
} finally { await browser.close(); }
