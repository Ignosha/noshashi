import { chromium } from 'playwright';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
const base=process.argv[2]||'http://localhost:4393';
const out=process.env.REVIEW_SMOKE_DIR||'/tmp/noshashi-payment-review-smoke';await mkdir(out,{recursive:true});
const fixture=JSON.parse(await readFile(path.join(out,'fixture-run.json'),'utf8'));
const input=await readFile(path.join(out,'fixture-input.json'),'utf8');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const results=[];const errors=[];const check=(name,ok)=>{if(!ok)throw new Error(name);results.push({name,passed:true});};
page.on('pageerror',e=>errors.push(e.message));
let failRun=false,processing=false,keys=[],attempts=[];
const user={id:'a0000000-0000-0000-0000-000000000001',aud:'authenticated',role:'authenticated',email:'tester@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{},factors:[]};
const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,aud:'authenticated',role:'authenticated',aal:'aal1',amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}],exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)})}.test-signature`;
await page.route('https://xiurbiwuwcfowqnpmwki.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;let status=200,data={};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'}});
  if(p.includes('/auth/v1/token'))data={access_token:token,refresh_token:'local-test-refresh',expires_in:3600,token_type:'bearer',user};
  else if(p.includes('/auth/v1/user'))data=user;
  else if(p.includes('/auth/v1/logout'))data={};
  else if(p.endsWith('/usage'))data={tier:'operator',plan:{name:'Free',monthly:0,records:25,batch:5},used:1,period_start:'2026-11-01'};
  else if(p.endsWith('/runs')&&req.method()==='GET')data={runs:[{id:fixture.id,status:'completed',records:1,created_at:'2026-11-03T12:00:00Z'}]};
  else if(p.endsWith('/runs')&&req.method()==='POST'){
    attempts.push(req.headers()['idempotency-key']);
    if(failRun){status=503;data={error:'Private storage is unavailable. Retry later with the same request key.'};}
    else if(processing){status=202;data={id:fixture.id,status:'processing'};}
    else{status=201;data=fixture;}
  }else if(p.endsWith('/runs/'+fixture.id))data=fixture;
  else if(p.endsWith('/keys')){
    if(req.method()==='POST'){keys=[{id:fixture.id,name:'Server integration',prefix:'nsh_review_test',expires_at:'2027-02-01T00:00:00Z',revoked_at:null}];data={key:'nsh_review_LOCAL_TEST_ONLY_NOT_A_REAL_KEY'};}
    else if(req.method()==='DELETE'){keys=keys.map(k=>({...k,revoked_at:'2026-11-03T12:00:00Z'}));data={revoked:true};}
    else data={keys};
  }else if(p.endsWith('/checkout')||p.endsWith('/portal'))data={url:'https://checkout.stripe.com/local-test-only'};
  else {status=404;data={error:'Unknown local mock route '+p};}
  return route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
});
async function screenshot(name){await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});await page.evaluate(()=>{if(document.getElementById('smoke-banner'))return;const el=document.createElement('div');el.id='smoke-banner';el.textContent='LOCAL TEST / RECORDED LEDGER FIXTURE · ACCOUNT & BILLING MOCKED';el.style.cssText='padding:9px 4vw;border-bottom:1px solid #666;font:10px monospace;color:#ddd;background:#252a28';document.body.prepend(el);});await page.screenshot({path:path.join(out,name),fullPage:true});}
try{
  await page.goto(base+'/developers/portal/');await page.getByRole('heading',{name:'From payment list to clear evidence.'}).waitFor();
  check('Portal stylesheet loads',(await page.request.get(base+'/assets/payment-portal/main.css')).status()===200);
  check('Logged-out review requires account',await page.getByRole('button',{name:'Review payments →',exact:true}).isDisabled());
  await screenshot('portal-desktop-signin.png');
  await page.setViewportSize({width:390,height:844});await screenshot('portal-mobile-signin.png');
  check('Mobile has no page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Plans & billing'}).click();check('Current software price is visible',await page.getByText('$749 / seat / month',{exact:true}).isVisible());
  await page.getByRole('button',{name:/Review payments$/}).click();
  await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('LocalTestOnly-Password!42');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByText('Free / 1 OF 25 RECORDS',{exact:true}).waitFor();check('Existing account sign-in and usage work',true);
  await page.getByLabel('Payment list (JSON)').fill(input);await page.getByRole('button',{name:'Review payments →',exact:true}).click();
  await page.getByText('Receipt hashes match the exact saved evidence.',{exact:true}).waitFor();check('Browser verifies batch and row receipt hashes',true);
  check('Payment result and ledger shown',await page.getByText('VERIFIED',{exact:true}).isVisible());
  await screenshot('portal-mobile-result.png');
  await page.setViewportSize({width:1440,height:1000});await screenshot('portal-desktop-result.png');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export full JSON'}).click();const download=await downloadPromise;await download.saveAs(path.join(out,'browser-export.json'));check('Complete JSON export includes evidence',!!JSON.parse(await readFile(path.join(out,'browser-export.json'),'utf8')).result.reports[0].evidence);
  await page.getByRole('button',{name:'Run history'}).click();await page.getByRole('button',{name:'Open run'}).click();await page.getByRole('heading',{name:'The reading, row by row.'}).waitFor();check('Saved historical run reopens',true);
  await page.getByRole('button',{name:'API keys'}).click();await page.getByRole('button',{name:'Create scoped key'}).click();await page.getByLabel('New secret API key').waitFor();check('Key shown once',true);await page.getByRole('button',{name:'Hide key'}).click();check('Raw key can be hidden',await page.getByLabel('New secret API key').count()===0);await page.getByRole('button',{name:'Revoke',exact:true}).click();await page.getByText(/Revoked/).waitFor();check('Revocation updates the account view',true);
  await page.getByRole('button',{name:'API & CLI'}).click();check('CLI and HTTP examples available',await page.getByText('Safe retries',{exact:true}).isVisible());await screenshot('portal-api.png');
  await page.getByRole('button',{name:/Review payments$/}).click();failRun=true;await page.getByRole('button',{name:'Review payments →',exact:true}).click();await page.getByRole('alert').waitFor();check('Unavailable service has a useful error',await page.getByRole('alert').innerText().then(t=>t.includes('Private storage')));
  const retryResponse=page.waitForResponse(r=>r.url().endsWith('/runs')&&r.request().method()==='POST');await page.getByRole('button',{name:'Retry same request'}).click();await retryResponse;check('Retry preserves request ID',attempts.at(-1)===attempts.at(-2));
  failRun=false;processing=true;await page.getByRole('button',{name:'Retry same request'}).click();await page.getByText(/This run is processing/).waitFor();check('Processing response is bounded and is not shown as passed',true);
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();check('Sign-out removes private result',await page.getByRole('heading',{name:'The reading, row by row.'}).count()===0);
  await page.keyboard.press('Tab');check('Keyboard focus is visible',await page.evaluate(()=>{const el=document.activeElement;return el&&getComputedStyle(el).outlineStyle!=='none';}));
  check('No uncaught browser errors',errors.length===0);
  await writeFile(path.join(out,'smoke-report.json'),JSON.stringify({scope:'Local mocked account/billing and recorded real-ledger fixture. Not a production launch check.',checks:results,errors},null,2));
  console.log(`${results.length} browser checks passed. Screenshots: ${out}`);
}finally{await browser.close();}
