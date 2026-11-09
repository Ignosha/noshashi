import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const output = '/tmp/noshashi-media-validation';
await mkdir(output, { recursive: true });
const checks = [];
const check = (name, passed) => { checks.push({ name, passed: !!passed }); if (!passed) throw new Error(name); };
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = []; const youtube = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/youtube|ytimg|googlevideo/.test(r.url())) youtube.push(r.url()); });
  await page.route('**/api/**', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  // Explicit iframe fixture verifies integration/CSP, not YouTube playback.
  await page.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ contentType: 'text/html', body: '<p>TEST PLAYER — NOT A BROADCAST</p>' }));
  const response = await page.goto('http://localhost:4391/intelligence/');
  const csp = response.headers()['content-security-policy'];
  check('Only privacy-enhanced YouTube frames allowed on newsroom', csp.includes('frame-src https://www.youtube-nocookie.com') && csp.includes("script-src 'self'"));
  await page.locator('.nr-visual-desk').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('.nr-photo-grid img')].every(i => i.complete && i.naturalWidth > 0));
  check('Both real local photographs decode', await page.locator('.nr-photo-grid img').count() === 2);
  check('Photo dimensions stay within editorial layout', await page.locator('.nr-photo-lead').evaluate(e => e.getBoundingClientRect().height < 850) && await page.locator('.nr-photo-side img').evaluate(e => e.width / e.height > 1.6));
  check('Photographers credited and props identified', (await page.locator('.nr-photo-grid').textContent()).includes('Rūdolfs Klintsons') && (await page.locator('.nr-photo-grid').textContent()).includes('not actual XRP'));
  check('No third-party video requests before choice', youtube.length === 0 && await page.locator('iframe').count() === 0);
  check('Live status remains unverified, recordings labelled', (await page.locator('.nr-broadcast').textContent()).includes('No active XRPL broadcast verified') && await page.getByText('Recorded developer lesson', { exact: true }).count() === 1);
  await page.locator('[data-video-load]').first().click();
  await page.waitForFunction(() => document.querySelector('iframe'));
  check('Chosen video uses fixed privacy-enhanced source', (await page.locator('iframe').getAttribute('src')).startsWith('https://www.youtube-nocookie.com/embed/AXN9-m0uXKk?autoplay=0'));
  check('Publisher fallback stays visible while player loads', await page.getByText('Watch at source', { exact: false }).first().isVisible());
  await page.locator('[data-video-load]').nth(1).click();
  check('Only one player can remain active', await page.locator('iframe').count() === 1 && (await page.locator('iframe').getAttribute('src')).includes('Zdze88QcAq4'));
  await page.locator('[data-video-close]').nth(1).click();
  check('Closing removes player and restores keyboard focus', await page.locator('iframe').count() === 0 && await page.locator('[data-video-load]').nth(1).evaluate(e => e === document.activeElement));
  // Focused panel captures omit sticky chrome; full page capture retains the UI.
  await page.addStyleTag({ content: 'header,.site-header,[data-support-widget]{visibility:hidden!important}' });
  await page.locator('.nr-visual-desk').screenshot({ path: `${output}/photos-desktop.png` });
  await page.locator('#watch').screenshot({ path: `${output}/video-desktop.png` });
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    check(`No horizontal overflow at ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.nr-visual-desk').screenshot({ path: `${output}/photos-mobile.png` });
  await page.locator('#watch').screenshot({ path: `${output}/video-mobile.png` });
  const other = await page.request.get('http://localhost:4391/certificate/');
  check('Risk tools retain original framing restrictions', !other.headers()['content-security-policy'].includes('youtube'));
  const noJs = await browser.newPage({ javaScriptEnabled: false });
  await noJs.goto('http://localhost:4391/intelligence/');
  check('No-JS readers retain direct video and channel links', await noJs.locator('.nr-video-copy>a').count() === 2 && await noJs.locator('.nr-channel-links a').count() === 3);
  await noJs.close();
  check('No page runtime errors', errors.length === 0);
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ scope: 'Local source photographs; mocked player integration, not certified external playback.', checks }, null, 2));
}
console.log(`${checks.length} media browser checks passed. Artifacts: ${output}`);
