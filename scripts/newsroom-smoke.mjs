import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { renderArticle, renderNewsroom } from './build-newsroom.mjs';
import { approveArticle, publishArticle, publicManifest } from '../api/_lib/editorial.js';
const base = process.env.APP_URL || 'http://localhost:4389';
const output = '/tmp/noshashi-intelligence-validation';
await mkdir(output, { recursive: true });
const results = []; const check = (name, ok) => { results.push({ name, passed: !!ok }); if (!ok) throw new Error(name); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // Explicit outage fixtures: no fabricated news appears in screenshots.
  await page.route('**/api/xrp-market', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/xrp-news?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/project-feed?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto(`${base}/intelligence/`);
  await page.waitForFunction(() => [...document.querySelectorAll('[data-auto-feed]')].every(x => x.getAttribute('aria-busy') === 'false'));
  check('Outages finish with retry, no endless loading', await page.locator('[data-auto-feed] button:visible').count() === 2);
  check('No horizontal overflow at desktop', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('Reduced motion disables network motion', await page.locator('.nr-route').first().evaluate(el => getComputedStyle(el).animationName === 'none'));
  await page.locator('input[type="search"]').focus(); await page.keyboard.type('missing');
  check('Search status accessible', (await page.locator('[data-results]').textContent()).includes('0 articles'));
  check('Visible keyboard focus', await page.locator('input[type="search"]').evaluate(el => getComputedStyle(el).outlineStyle !== 'none'));
  await page.locator('[data-filters]').evaluate(form => form.reset());
  await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    check(`No horizontal overflow at ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/${width === 390 ? 'mobile' : 'tablet'}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole('button', { name: /menu/i }).first();
  if (await menu.count()) {
    await menu.click();
    check('Mobile menu opens accessibly', await menu.getAttribute('aria-expanded') === 'true');
    await page.keyboard.press('Escape');
    check('Mobile menu closes with Escape', await menu.getAttribute('aria-expanded') === 'false');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => document.documentElement.dataset.theme = 'light');
  await page.screenshot({ path: `${output}/light.png`, fullPage: true });
  await page.locator('video').evaluate(v => v.load());
  await page.waitForFunction(() => document.querySelector('video').readyState >= 1);
  check('Real product film metadata loads', await page.locator('video').evaluate(v => v.videoWidth === 1920 && v.duration === 16));
  check('Captions and text transcript available', await page.locator('track[kind="captions"]').count() === 1 && await page.locator('#film-transcript').count() === 1);
  const now = new Date().toISOString();
  const fixture = { slug: 'test-only', title: 'TEST ONLY — payment evidence', state: 'NEEDS REVIEW', category: 'Payments', eventDate: null, reportedAt: now, updatedAt: now, summary: 'Synthetic browser fixture, not real news.', simple: ['Simple test text.'], professional: ['Professional test text.'], relevance: 'Test only.', limitations: 'Not actual reporting.', workflows: ['payment'], sources: [{ id: 'test', title: 'Test source', publisher: 'Example', url: 'https://example.com/', checkedAt: now, primary: true }], claims: [{ text: 'Test statement.', evidence: 'INFERRED', sourceIds: ['test'] }] };
  const article = publicManifest([publishArticle(approveArticle(fixture, 'test-owner', now), now)])[0];
  await page.route('**/__test-article/', route => route.fulfill({ contentType: 'text/html', body: renderArticle(article) }));
  await page.goto(`${base}/__test-article/`);
  check('Simple mode starts visible', await page.locator('[data-reading="simple"]').isVisible());
  await page.getByRole('button', { name: 'Professional mode', exact: true }).click();
  check('Professional mode switches accessibly', await page.locator('[data-reading="professional"]').isVisible() && !await page.locator('[data-reading="simple"]').isVisible());
  const noJs = await browser.newPage({ javaScriptEnabled: false });
  await noJs.route('**/__test-article/', route => route.fulfill({ contentType: 'text/html', body: renderArticle(article) }));
  await noJs.goto(`${base}/__test-article/`);
  check('Both modes readable without JS', await noJs.locator('[data-reading="simple"]').isVisible() && await noJs.locator('[data-reading="professional"]').isVisible());
  await noJs.close();
  let attempts = 0;
  await page.unroute('**/api/xrp-news?**');
  await page.route('**/api/xrp-news?**', route => {
    attempts++;
    return route.fulfill({ status: attempts === 1 ? 503 : 200, contentType: 'application/json', body: attempts === 1 ? '{}' : JSON.stringify({ items: [{ title: '<script>UNTRUSTED TEST</script>', url: 'https://example.com/', publisher: 'TEST FIXTURE', publishedAt: null }], fetchedAt: now }) });
  });
  await page.goto(`${base}/intelligence/`);
  await page.locator('[data-auto-feed="news"] button').click();
  await page.waitForFunction(() => document.querySelector('[data-auto-feed="news"] li'));
  check('Retry retrieves results', attempts === 2);
  check('Untrusted headline stays inert text', await page.locator('[data-auto-feed="news"] script').count() === 0 && (await page.locator('[data-auto-feed="news"] a').textContent()).includes('<script>'));
  check('Unknown date labelled', (await page.locator('[data-auto-feed="news"] li').textContent()).includes('source date unknown'));
  await page.route('**/__test-edition/', route => route.fulfill({ contentType: 'text/html', body: renderNewsroom([article]) }));
  await page.goto(`${base}/__test-edition/`);
  await page.getByLabel('Search articles').fill('not present');
  check('Search hides nonmatching published fixture', !await page.locator('[data-story]').isVisible());
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.waitForFunction(() => !document.querySelector('[data-story]').hidden);
  check('Reset restores fixture', await page.locator('[data-story]').isVisible());
  for (const route of ['/institutional-demo/', '/certificate/', '/delivered/', '/book-health/', '/app/', '/contact/', '/news/', '/progress/']) {
    const res = await page.request.get(`${base}${route}`);
    check(`Preserved route ${route}`, res.status() === 200);
  }
  check('No browser runtime errors', errors.length === 0);
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ scope: 'Local preview. Explicit outage/synthetic fixtures for feed and article interactions; no live risk-tool result certification.', results }, null, 2));
}
console.log(`${results.length} browser checks passed. Screenshots: ${output}`);
