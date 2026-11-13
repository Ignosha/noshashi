import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base=process.env.APP_URL||'http://127.0.0.1:4351';
const out=process.env.SHOTS_DIR||'/tmp/noshashi-refinement';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const checks=[], errors=[];
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await page.routeWebSocket('**',s=>s.close());
 await page.goto(base); await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('[data-case-step]').count(),6);
 assert.equal(await page.locator('#rf-decision').textContent(),'HOLD');
 for(let i=1;i<6;i++){await page.locator('#rf-next').click();await page.waitForTimeout(40);assert.match(await page.locator('#rf-progress').textContent(),new RegExp(`Step ${i+1} of 6`));}
 await page.locator('#rf-scenario').focus(); await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUMMARY');
 await page.locator('#rf-next').focus(); await page.keyboard.press('Tab'); assert.equal(await page.evaluate(()=>document.activeElement.id),'rf-reset');
 await page.locator('#rf-next').focus();
 assert.ok(await page.locator('#rf-next').evaluate(el=>getComputedStyle(el).outlineStyle!=='none'));
 checks.push('Six-step workflow, keyboard navigation and visible focus');
 await page.locator('#rf-scenario').selectOption('short'); assert.equal(await page.locator('#rf-decision').textContent(),'NO-GO');
 await page.locator('#rf-scenario').selectOption('unknown'); assert.equal(await page.locator('#rf-decision').textContent(),'HOLD'); assert.match(await page.locator('[data-case-evidence="1"]').textContent(),/unavailable/);
 const download=page.waitForEvent('download');await page.locator('#rf-export').click();const d=await download;const r=JSON.parse(await readFile(await d.path(),'utf8'));assert.equal(r.simulated,true);assert.equal(r.amount_matches,null);assert.equal(r.policy.legal_compliance_determined,false);
 await page.locator('#rf-reset').click();assert.equal(await page.locator('#rf-scenario').inputValue(),'review');
 checks.push('Underpayment, missing evidence, reset and actual JSON download verified');
 for(const [name,width,theme] of [['desktop',1440,'dark'],['paper',1440,'light'],['mobile',390,'dark'],['tablet',768,'light']]){
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.evaluate(()=>scrollTo(0,0));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} horizontal overflow`);
  const styles=await page.evaluate(()=>({fonts:getComputedStyle(document.querySelector('h1')).fontFamily,body:getComputedStyle(document.body).fontFamily,ground:getComputedStyle(document.body).backgroundColor,rule:getComputedStyle(document.body).getPropertyValue('--rule').trim()}));
  const baseline=JSON.parse(await readFile(`${out}/before.json`,'utf8').catch(()=> '[]')).find(x=>x.theme===theme);
  if(baseline) for(const key of ['fonts','body','ground','rule'])assert.equal(styles[key],baseline[key],`${theme} preserves ${key}`);
  await page.screenshot({path:`${out}/after-${name}.png`,fullPage:true});
  if(name==='desktop')await page.screenshot({path:`${out}/after-hero.png`});
 }
 await page.setViewportSize({width:1440,height:1000});await page.locator('#research-case').screenshot({path:`${out}/after-case.png`});
 await page.goto(`${base}/intelligence/`);await page.screenshot({path:`${out}/after-intelligence.png`,fullPage:true});
 await page.goto(`${base}/pricing/`);assert.equal(await page.locator('.rf-plan-guide').count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/after-pricing.png`,fullPage:true});
 const nojs=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});await nojs.goto(base);assert.equal(await nojs.locator('[data-case-step]').count(),6);await nojs.locator('[data-case-step]').last().locator('summary').click();assert.ok(await nojs.locator('[data-case-finding="5"]').isVisible());await nojs.close();
 checks.push('Desktop, paper, mobile, tablet and no-JavaScript rendering; no page overflow');
 assert.deepEqual(errors,[]);checks.push('No uncaught browser errors');
 await writeFile(`${out}/validation.json`,JSON.stringify({checks,errors,fixtures:'API unavailable states; no fabricated market values',newAssetsBytes:(await Promise.all(['research-case-model.js','research-case.js','research-refinement.css'].map(f=>readFile(new URL(`../site/assets/${f}`,import.meta.url))))).reduce((n,b)=>n+b.length,0)},null,2));
 console.log(JSON.stringify(checks));
}finally{await browser.close();}
