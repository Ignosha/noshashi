import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const source = await readFile(new URL('./app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('./style.css', import.meta.url), 'utf8');
const SERVICE = 'https://noshashi-operator.joshedmond18.workers.dev';
const token = 'unit-test-operator-token-at-least-32-characters';
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); };
function payload(patch = {}) {
  return { dashboard: { observedAt: '2026-11-02T15:00:00Z', pendingApprovals: 0,
    stages: [{ pipeline_stage:'RESEARCH', count:2 }], sources: [],
    revenue: { connected: true, status:'fresh_manual_snapshot', stale:false, observedAt:'2026-11-02T14:00:00Z', verifiedMonthlyRevenue:'0.00' },
    ...patch }, tasks: [], latestReport: null };
}
function fixture({ native = true, onMessage } = {}) {
  const ids = new Map(), created = [], timers = new Map(), messages = [], anchors = []; let timerId = 0;
  class Element {
    constructor(tag) { this.tagName=tag;this.children=[];this.listeners={};this.attributes={};this.hidden=false;this.disabled=false;this.value='';this.className=''; }
    set innerHTML(_) { throw new Error('unsafe DOM insertion'); }
    set outerHTML(_) { throw new Error('unsafe DOM replacement'); }
    set textContent(value) { this.text=String(value);this.children=[]; }
    get textContent() { return this.text || ''; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children=[...children];this.text=''; }
    setAttribute(name,value) { this.attributes[name]=String(value); }
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes,name) ? this.attributes[name] : null; }
    scrollIntoView(options) { this.lastScroll=options; }
    addEventListener(name, listener) { this.listeners[name]=listener; }
    focus() {}
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) ids.set(match[1],new Element(match[1]));
  for (const match of html.matchAll(/<a\b[^>]*href="(#[^"]+)"/g)) { const anchor=new Element('a');anchor.setAttribute('href',match[1]);anchors.push(anchor); }
  const sandbox = { console, Map, Promise, Date, Number, String, Object, Error, JSON,
    document:{getElementById(id){assert.ok(ids.has(id),'Missing element '+id);return ids.get(id);},createElement(tag){const element=new Element(tag);created.push(element);return element;},querySelectorAll(selector){assert.equal(selector,'a[href^="#"]');return anchors;}},
    setTimeout(callback,delay){assert.equal(delay,35000);const id=++timerId;timers.set(id,callback);return id;},
    clearTimeout(id){timers.delete(id);},
    localStorage:{setItem(){throw new Error('persistent token storage forbidden');}},
    fetch(){throw new Error('frontend network forbidden');}
  };
  sandbox.window=sandbox;
  if(native) sandbox.webkit={messageHandlers:{operator:{postMessage(message){messages.push(message);if(onMessage)onMessage(message,sandbox,ids);}}}};
  vm.runInNewContext(source,sandbox,{filename:'app.js'});
  return { ids,created,timers,messages,anchors,sandbox,reply(message,data){sandbox.operatorReceive({id:message.id,ok:true,data});} };
}

test('desktop resources require no external runtime, persistent browser credential store or frontend network',()=>{
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/form-action 'none'/);
  assert.match(html,/type="password"/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.doesNotMatch(source,/innerHTML|outerHTML|localStorage|sessionStorage|document\.cookie|fetch\(/);
  assert.doesNotMatch(html,/<(?:script|link)[^>]+(?:src|href)="https?:/);
  assert.match(html,/macOS Monterey 12\.7\.6\+/);
});

test('startup uses the native connection and leaves missing data unknown',async()=>{
  const f=fixture();assert.equal(f.messages.length,1);assert.equal(f.messages[0].action,'connection-status');
  f.reply(f.messages[0],{storedToken:false,serviceURL:SERVICE});await tick();
  assert.equal(f.ids.get('connection-panel').hidden,false);assert.equal(f.ids.get('desk').hidden,true);
  assert.equal(f.ids.get('revenue-value').textContent,'Unknown');assert.equal(f.ids.get('run').disabled,true);
});

test('operator token is cleared before the native Keychain message and never returned into the UI',async()=>{
  let saved=false;
  const f=fixture({onMessage(message,window,ids){
    if(message.action==='connection-status') window.operatorReceive({id:message.id,ok:true,data:{storedToken:saved,serviceURL:SERVICE}});
    if(message.action==='save-connection') {assert.equal(ids.get('admin-token').value,'');assert.equal(message.payload.token,token);saved=true;window.operatorReceive({id:message.id,ok:true,data:{storedToken:true,serviceURL:SERVICE}});}
    if(message.action==='status') window.operatorReceive({id:message.id,ok:true,data:payload()});
  }});await tick();f.ids.get('admin-token').value=token;
  await f.ids.get('connection-form').listeners.submit({preventDefault(){}});await tick();
  assert.equal(f.ids.get('admin-token').value,'');assert.equal(f.ids.get('desk').hidden,false);
  assert.equal(f.ids.get('revenue-value').textContent,'$0.00');
  assert.ok(!f.created.some(element=>element.textContent.includes(token)));
  assert.deepEqual(f.messages.map(m=>m.action),['connection-status','save-connection','connection-status','status']);
});

test('public-source markup stays literal text and incomplete/stale billing never becomes a current total',async()=>{
  const attack='<img src=x onerror="steal()"><script>attack()</script>';
  const status=payload({revenue:{connected:true,status:'stale_snapshot',stale:false,observedAt:'2026-11-02T14:00:00Z',verifiedMonthlyRevenue:'999.00'},sources:[{source_id:attack,last_error:'feed_http_429',last_success_at:'2026-11-01T10:00:00Z'}]});
  status.tasks=[{title:attack,kind:'research_review',evidence:{article:{url:'javascript:'+attack,title:attack}},guard:{sendAllowed:false}}];status.latestReport={status:'uncertain',text:attack};
  const f=fixture({onMessage(message,window){window.operatorReceive({id:message.id,ok:true,data:message.action==='connection-status'?{storedToken:true,serviceURL:SERVICE}:status});}});await tick();
  assert.equal(f.ids.get('revenue-value').textContent,'Unknown');assert.equal(f.ids.get('report-text').textContent,attack);
  assert.ok(f.created.some(element=>element.tagName==='h3'&&element.textContent===attack));
  assert.equal(f.created.some(element=>['script','img','iframe','a'].includes(element.tagName)),false);
  assert.match(f.ids.get('billing-state').textContent,/stale/);
  assert.equal(f.ids.get('report-state').textContent,'Delivery unconfirmed');
});

test('native timeouts are bounded, enable retry and prevent double activation',async()=>{
  const f=fixture();const timer=[...f.timers.values()][0];assert.equal(f.ids.get('connect').disabled,true);
  await f.ids.get('refresh').listeners.click();assert.equal(f.messages.length,1);
  timer();await tick();assert.equal(f.ids.get('retry').hidden,false);assert.equal(f.ids.get('connect').disabled,false);
  assert.match(f.ids.get('notice-text').textContent,/too long/);
  await f.ids.get('retry').listeners.click();assert.equal(f.messages.length,2);assert.equal(f.messages[1].action,'connection-status');
  f.reply(f.messages[0],{storedToken:true,serviceURL:SERVICE});await tick();assert.equal(f.messages.length,2,'Late timed-out replies must be ignored');
});

test('unknown native errors do not leak secret-bearing error strings and unauthorized clears private records',async()=>{
  let statusCalls=0;
  const f=fixture({onMessage(message,window){
    if(message.action==='connection-status')window.operatorReceive({id:message.id,ok:true,data:{storedToken:true,serviceURL:SERVICE}});
    if(message.action==='status'&&statusCalls++===0)window.operatorReceive({id:message.id,ok:true,data:payload()});
    else if(message.action==='status')window.operatorReceive({id:message.id,ok:false,error:{code:'unauthorized',message:'secret:'+token}});
  }});await tick();assert.equal(f.ids.get('desk').hidden,false);
  await f.ids.get('refresh').listeners.click();await tick();assert.equal(f.ids.get('desk').hidden,true);
  assert.equal(f.ids.get('revenue-value').textContent,'Unknown');assert.equal(f.ids.get('task-list').children.length,0);
  assert.ok(!f.ids.get('notice-text').textContent.includes(token));assert.match(f.ids.get('notice-text').textContent,/not accepted/);
});

test('setup action has no caller-controlled URL and read-only Stripe missing-key results are explained',async()=>{
  const f=fixture({onMessage(message,window){window.operatorReceive({id:message.id,ok:true,data:message.action==='connection-status'?{storedToken:true,serviceURL:SERVICE}:message.action==='status'?payload():{status:'runtime_key_missing'}});}});await tick();
  await f.ids.get('secure-setup').listeners.click();await tick();
  const setup=f.messages.find(message=>message.action==='open-secure-setup');assert.equal(Object.keys(setup.payload).length,0);
  await f.ids.get('billing').listeners.click();await tick();assert.match(f.ids.get('notice-text').textContent,/restricted read-only key/);
});

test('connection reports from an unexpected service fail closed',async()=>{
  const f=fixture({onMessage(message,window){window.operatorReceive({id:message.id,ok:true,data:{storedToken:true,serviceURL:'https://other.example'}});}});await tick();
  assert.equal(f.ids.get('desk').hidden,true);assert.equal(f.messages.some(message=>message.action==='status'),false);
  assert.match(f.ids.get('notice-text').textContent,/incomplete response/);
});

test('section navigation prevents fragment changes and preserves keyboard-triggered activation',()=>{
  const f=fixture();
  assert.equal(f.anchors.length,4);
  for(const link of f.anchors){
    let prevented=false;
    link.listeners.click({detail:0,preventDefault(){prevented=true;}});
    assert.equal(prevented,true);
    const target=f.ids.get(link.getAttribute('href').slice(1));
    assert.equal(target.lastScroll.block,'start');assert.equal(target.lastScroll.behavior,'auto');
    assert.equal(link.className,'nav-item active');
  }
  assert.doesNotMatch(source,/location\.hash\s*=|history\.(?:pushState|replaceState)/);
});
