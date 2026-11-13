import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.PREVIEW_ORIGIN || 'http://localhost:4347';
const out = process.env.ARTIFACT_DIR || '/workspace/artifacts/rlusd-upgrade';
await mkdir(out,{recursive:true});
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/intelligence/rlusd/',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Read chain evidence'}).click();
  await page.waitForFunction(()=>!document.getElementById('rl-refresh').disabled,{timeout:35000});
  const text=await page.locator('#rl-status').innerText();
  if (!text.startsWith('Observation ')) throw Error('Live API did not complete: '+text);
  const actual={status:text,xrpl:await page.locator('#xrpl-value').innerText(),ethereum:await page.locator('#ethereum-value').innerText()};
  await page.screenshot({path:out+'/rlusd-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:out+'/rlusd-mobile.png',fullPage:true});
  if (await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Mobile horizontal overflow');
  // Controlled fixtures test error handling and chart interactions; never used for public screenshots.
  let counter=0;
  await page.route('**/api/rlusd',route=>{
    counter++;
    return route.fulfill({json:{observed_at:new Date().toISOString(),cached_for_seconds:0,xrpl:{status:'available',value:counter===1?'100':'98',as_of:`2026-11-13T14:0${counter}:00.000Z`,source:'test fixture',ledger_hash:String(counter).repeat(64),ledger_index:counter},ethereum:{status:'unavailable',value:null}}});
  });
  for(let i=0;i<2;i++) {await page.locator('#rl-refresh').click();await page.waitForFunction(()=>!document.getElementById('rl-refresh').disabled);}
  if(await page.locator('#ethereum-value').innerText()!=='Unavailable') throw Error('Partial chain did not abstain');
  if(!await page.locator('#rl-alert').innerText().then(s=>s.includes('review threshold reached'))) throw Error('Missing change alert');
  if(await page.locator('#xrpl-chart svg').count()!==1) throw Error('Missing observed chart');
  await page.unroute('**/api/rlusd'); await page.route('**/api/rlusd',route=>route.fulfill({status:503,body:'Unavailable'}));
  await page.locator('#rl-refresh').click();await page.waitForFunction(()=>!document.getElementById('rl-refresh').disabled);
  if(await page.locator('#xrpl-value').innerText()!=='Unavailable') throw Error('Failed request kept a current value');
  if(errors.length)throw Error(errors.join('\n'));
  await writeFile(out+'/browser-verification.json',JSON.stringify({actual,checks:['live API snapshot','desktop/mobile screenshots','mobile overflow','partial-chain abstention','exact threshold interaction','observed chart','failure clears current values','no page errors'],errors},null,2));
  console.log(JSON.stringify({actual,errors,passed:true}));
} finally {await browser.close();}
