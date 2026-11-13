import { change } from './rlusd-math.js';
const samples = { xrpl: [], ethereum: [] };
const $ = id => document.getElementById(id);
function alerts() {
  const threshold = Number($('rl-threshold').value);
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 10000) { $('rl-alert').textContent = 'Enter an integer from 1 to 10000 basis points.'; return; }
  const messages = [];
  for (const chain of Object.keys(samples)) {
    const [a,b] = samples[chain].slice(-2);
    if (!b) continue;
    const c = change(a.value,b.value,threshold);
    messages.push(`${chain === 'xrpl' ? 'XRPL obligations' : 'Ethereum totalSupply'}: ${c.direction}; ${c.triggered === null ? 'percentage unavailable from zero baseline' : c.triggered ? 'review threshold reached' : 'below threshold'}. Interval ${a.as_of} → ${b.as_of}.`);
  }
  $('rl-alert').textContent = messages.join(' ') || 'Requires two distinct observations from the same chain.';
}
function render(chain) {
  const values = samples[chain];
  const list = $(chain+'-history'); list.replaceChildren();
  for (const v of values) { const li = document.createElement('li'); li.textContent = `${v.as_of}: ${v.value} RLUSD · ${v.ledger_index || v.block_number}`; list.append(li); }
  if (values.length < 2) return;
  const series = values.map(v => ({ t: Date.parse(v.as_of), n: Number(v.value) }));
  const low = Math.min(...series.map(v=>v.n)), high = Math.max(...series.map(v=>v.n));
  const t0 = series[0].t, t1 = series.at(-1).t;
  if (![low,high,t0,t1].every(Number.isFinite) || t1 <= t0) return;
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 400 130'); svg.setAttribute('role','img');
  svg.setAttribute('aria-label',`${chain} session observations, ${values.length} samples. Minimum ${low}, maximum ${high} RLUSD. Exact values in sample list.`);
  const line = document.createElementNS(ns,'polyline');
  line.setAttribute('points',series.map(v=>`${10+(v.t-t0)/(t1-t0)*380},${high===low?65:110-(v.n-low)/(high-low)*90}`).join(' '));
  svg.append(line);
  const caption = document.createElement('p'); caption.className='rl-meta'; caption.textContent = `Session observations only · range ${low.toLocaleString('en-US')}–${high.toLocaleString('en-US')} RLUSD · ${values[0].as_of} → ${values.at(-1).as_of}. Line joins samples, not continuous monitoring. Chart coordinates rounded; sample list is exact.`;
  $(chain+'-chart').replaceChildren(svg,caption);
}
$('rl-threshold').addEventListener('input',alerts);
$('rl-refresh').addEventListener('click', async () => {
  $('rl-refresh').disabled = true; $('rl-status').textContent = 'Reading pinned chain snapshots…';
  try {
    const response = await fetch('/api/rlusd',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(29000)});
    if (!response.ok) throw new Error('Source unavailable');
    const report = await response.json();
    for (const chain of Object.keys(samples)) {
      const r = report[chain];
      const usable = r?.status === 'available' && /^\d+(?:\.\d+)?$/.test(r.value) && Number.isFinite(Date.parse(r.as_of));
      $(chain+'-value').textContent = usable ? `${r.value} RLUSD` : 'Unavailable';
      const stale = usable && Date.now()-Date.parse(r.as_of)>15*60000;
      $(chain+'-meta').textContent = usable ? `${stale?'STALE · ':''}Ledger time ${r.as_of} · fetched ${report.observed_at} · ${r.source} · ${r.ledger_hash || r.block_hash} · ${r.limitation}` : 'Source unavailable. No zero, estimate or prior value is substituted. Session history is retained separately.';
      if (usable) {
        const key = r.ledger_hash || r.block_hash;
        if (!samples[chain].some(v=>v.key===key) && (!samples[chain].length || Date.parse(r.as_of)>Date.parse(samples[chain].at(-1).as_of))) samples[chain].push({...r,key});
        samples[chain] = samples[chain].slice(-24); render(chain);
      }
    }
    $('rl-status').textContent = `Observation ${report.observed_at}. Cached for ${report.cached_for_seconds}s; source reads shared for up to five minutes. Refresh manually for another observation. No 24-hour change established.`;
    alerts();
  } catch { $('rl-status').textContent = 'Could not read evidence. Existing samples are historical session observations, not a current reading.'; for (const chain of Object.keys(samples)) { $(chain+'-value').textContent='Unavailable'; $(chain+'-meta').textContent='Latest request failed. Previous samples are retained separately.'; } }
  finally { $('rl-refresh').disabled = false; }
});
