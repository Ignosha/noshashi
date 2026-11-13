import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.APP_URL||'http://127.0.0.1:4352',out=process.env.SHOTS_DIR||'/tmp/noshashi-readiness-v2';
await mkdir(out,{recursive:true});const checks=[],errors=[];
const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const p=await b.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});p.on('pageerror',e=>errors.push(e.message));await p.routeWebSocket('**',s=>s.close());
 let freshness='current';
 await p.route('**/api/**',route=>{
  const url=route.request().url();if(url.includes('/api/xrp-news')||url.includes('/api/project-feed')){
   if(freshness==='error')return route.fulfill({status:503,json:{}});
   const at=freshness==='stale'?'2020-01-01T00:00:00Z':freshness==='unknown'?null:new Date().toISOString();
   return route.fulfill({json:{items:[],entries:[],fetchedAt:at,partial:freshness==='partial'}});
  }
  if(url.includes('/api/book-health'))return route.fulfill({json:{ledger_index:1,close_time:'2020-01-01T00:00:00Z',read_at:new Date().toISOString(),books:[],disclosures:['TEST FIXTURE ONLY']}});
  return route.fulfill({status:503,json:{error:'Explicit QA outage'}});
 });
 for(const [name,path]of Object.entries({home:'/',status:'/status/',progress:'/progress/',intelligence:'/intelligence/',pricing:'/pricing/',trust:'/trust/',docs:'/docs/release-notes/',accounts:'/docs/accounts/'})){
  await p.goto(base+path);await p.evaluate(()=>document.fonts.ready);assert.equal(await p.locator('h1').count(),1,name);assert.ok(await p.locator('meta[name="description"]').count(),name);
  if(name==='home')assert.equal(await p.locator('.rf-pillars article').count(),4);
  if(['home','status','progress','trust','docs'].includes(name)){assert.equal(await p.locator('.release-record').count(),1,name);await p.locator('.release-record summary').click();assert.match(await p.locator('.release-record').textContent(),/UNKNOWN/);}
  if(name==='status')assert.doesNotMatch(await p.locator('main').textContent(),/READ LIVE|UNAFFECTED|OPERATIONAL/);
  await p.screenshot({path:`${out}/after-${name}.png`,fullPage:true});
  await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} mobile overflow`);await p.screenshot({path:`${out}/after-${name}-mobile.png`,fullPage:true});await p.setViewportSize({width:1440,height:1000});
 }
 checks.push('Eight pages: desktop/mobile, metadata, preserved table overflow and one release record');
 for(const state of ['stale','unknown','partial','error']){freshness=state;await p.goto(base+'/intelligence/');await p.waitForFunction(()=>[...document.querySelectorAll('[data-auto-feed]')].every(x=>x.getAttribute('aria-busy')==='false'));const text=await p.locator('[data-auto-feed="news"]').textContent();assert.match(text,state==='stale'?/STALE/:state==='unknown'?/UNKNOWN/:state==='partial'?/Partial coverage/:/unavailable/);assert.ok(await p.locator('[data-auto-feed="news"] button').isVisible());}
 checks.push('News empty, stale, unknown, partial and failed-source states remain explicit and retryable');
 await p.goto(base+'/book-health/');await p.waitForFunction(()=>document.querySelector('#bh-status').textContent.includes('STALE'));checks.push('Liquidity flags stale ledger close time, even with fresh response time');
 await p.goto(base+'/pricing/');await p.locator('#cadence-annual').click();assert.equal(await p.locator('#cadence-annual').getAttribute('aria-pressed'),'true');assert.match(await p.locator('main').textContent(),/7,490/);await p.locator('#cadence-monthly').click();assert.match(await p.locator('main').textContent(),/749/);checks.push('Existing monthly/annual pricing control works without billing requests');
 await p.goto(base+'/contact/?topic=institutions');const form=p.locator('#contact-form');assert.ok(await form.count());assert.equal(await form.evaluate(f=>f.checkValidity()),false);checks.push('Demo contact form has native required-field validation; no mail submitted');
 assert.deepEqual(errors,[]);await writeFile(`${out}/browser-results.json`,JSON.stringify({checks,errors,scope:'Local preview; feed and stale-liquidity fixtures are explicitly synthetic. Real public ledger evidence is recorded separately.'},null,2));console.log(JSON.stringify(checks));
}finally{await b.close();}
