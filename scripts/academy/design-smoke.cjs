const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const base=(process.argv[2]||'http://localhost:4321').replace(/\/$/,'');
const output=path.resolve(process.argv[3]||path.join(os.tmpdir(),'noshashi-academy-design'));
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 const report={checks:[],errors:[],screenshots:[]};
 const check=(name,condition)=>{assert.ok(condition,name);report.checks.push(name)};
 try {
  for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
   const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
   const page=await context.newPage();
   page.on('pageerror',e=>report.errors.push({page:name,message:e.message}));
   page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/.test(m.text()))report.errors.push({page:name,message:m.text()})});
   await page.goto(`${base}/academy/`,{waitUntil:'networkidle'});
   check(name+' landing title',await page.locator('h1').innerText().then(t=>t.includes('Learn the ledger.')));
   check(name+' landing typography',await page.locator('h1').evaluate(e=>getComputedStyle(e).fontFamily.includes('Instrument Serif')));
   check(name+' landing has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('.ac-level summary').nth(1).click();
   check(name+' curriculum disclosure works',await page.locator('details.ac-level').nth(1).getAttribute('open')!==null);
   await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:output+'/academy-landing-'+name+'.png',fullPage:true});
   report.screenshots.push('academy-landing-'+name+'.png');
   if(name==='desktop') {
    await page.getByRole('button',{name:'Switch to light mode'}).click();
    check('landing light theme switches',await page.locator('html').getAttribute('data-theme')==='light');
    await page.screenshot({path:output+'/academy-landing-light.png',fullPage:true});
   }
   await page.goto(`${base}/academy/app/`,{waitUntil:'networkidle'});
   await page.evaluate(()=>document.fonts.ready);
   await page.getByRole('heading',{name:'A course that works for you.'}).waitFor();
   check(name+' Academy brand loads',await page.getByRole('img',{name:'Noshashi Academy',exact:true}).evaluate(e=>e.complete&&e.naturalWidth>0));
   check(name+' app has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   check(name+' app document scrolls',await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight&&getComputedStyle(document.body).overflowY!=='hidden'));
   await page.keyboard.press('Tab');
   check(name+' skip link receives keyboard focus',await page.evaluate(()=>document.activeElement.textContent.includes('Skip to the lesson')));
   await page.evaluate(()=>{document.activeElement.blur();scrollTo(0,0)});
   await page.screenshot({path:output+'/academy-app-'+name+'.png',fullPage:true});
   report.screenshots.push('academy-app-'+name+'.png');
   await page.locator('input[name="study-style"]').first().check();
   await page.getByRole('checkbox',{name:/High contrast/i}).check();
   await page.getByRole('button',{name:/^START\ LEARNING\ →$/i,exact:true}).click();
   await page.getByRole('heading',{name:'Your next chapter.'}).waitFor();
   check(name+' reading setting applied',await page.locator('.academy-contrast').count()===1);
   await page.reload({waitUntil:'networkidle'});
   await page.getByRole('heading',{name:'Your next chapter.'}).waitFor();
   check(name+' progress and settings survive reload',await page.locator('.academy-contrast').count()===1);
   await page.getByRole('button',{name:/^START:/i}).click();
   check(name+' lesson hides overview hero',await page.locator('#academy-intro-title').count()===0);
   await page.locator('track').evaluateAll(ts=>ts.forEach(t=>t.track.mode='hidden'));
   await page.waitForFunction(()=>document.querySelector('track')?.readyState===2);
   check(name+' local captions load under production CSP',await page.locator('track').first().evaluate(t=>t.readyState===2));
   await page.getByRole('button',{name:'Labs',exact:true}).click();
   check(name+' labs navigation opens',await page.locator('#main').innerText().then(t=>t.includes('lab workstation')));
   if(name==='desktop') {
    const names=await page.locator('#main button').allTextContents();
    report.labButtons=names.slice(0,4);
    await page.locator('#main li button').first().click();
    await page.getByRole('button',{name:/^EXIT\ LAB$/i,exact:true}).waitFor();
    const frame=page.frameLocator('iframe[title^="NOSHASHI lab workstation"]');
    await frame.getByRole('img',{name:/^NOSHASHI$/i,exact:true}).first().waitFor();
    check('workstation opens with the regular app seal',await frame.getByRole('img',{name:/^NOSHASHI$/i,exact:true}).first().getAttribute('src').then(s=>s.endsWith('/brand/desktop-emblem.svg')));
    await page.getByRole('button',{name:/^EXIT\ LAB$/i,exact:true}).click();
   }
   await context.close();
  }
  if(!report.errors.length)report.checks.push('No browser script/CSP errors');
  fs.writeFileSync(output+'/smoke-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  assert.equal(report.errors.length,0,'No browser script/CSP errors');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
