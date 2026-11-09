import { readLedgerSnapshot, meridianPaths } from './ledger-globe-core.mjs';

for (const globe of document.querySelectorAll('[data-ledger-globe]')) {
  const motion = globe.querySelector('[data-globe-motion]');
  const refresh = globe.querySelector('[data-globe-refresh]');
  const status = globe.querySelector('[data-globe-status]');
  const sequence = globe.querySelector('[data-globe-sequence]');
  const fee = globe.querySelector('[data-globe-fee]');
  const peers = globe.querySelector('[data-globe-peers]');
  const stamp = globe.querySelector('[data-globe-time]');
  const group = globe.querySelector('[data-globe-meridians]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false, snapshot = null, busy = false, lastAttempt = -Infinity;
  let angle = 0, lastFrame = 0, frame = 0;
  const visible = () => !document.hidden && globe.getBoundingClientRect().bottom > 0 && globe.getBoundingClientRect().top < innerHeight;
  const paths = Array.from({ length: 12 }, () => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    group.append(path); return path;
  });
  const draw = () => meridianPaths(angle).forEach((p, i) => { paths[i].setAttribute('d', p.d); paths[i].style.opacity = String(p.opacity); });
  const animate = time => {
    frame = 0;
    if (paused || reduced.matches || !visible()) return;
    if (time - lastFrame >= 50) { // At most20 visual updates/sec; one turn in~100seconds.
      angle += Math.min(time - (lastFrame || time), 100) * Math.PI / 50000;
      lastFrame = time; draw();
    }
    frame = requestAnimationFrame(animate);
  };
  const syncMotion = () => {
    cancelAnimationFrame(frame); frame = 0; lastFrame = 0;
    const running = !paused && !reduced.matches;
    globe.dataset.motion = running && visible() ? 'running' : 'paused';
    motion.disabled = reduced.matches;
    motion.textContent = reduced.matches ? 'Reduced motion on' : paused ? 'Resume motion' : 'Pause motion';
    motion.setAttribute('aria-pressed', String(paused || reduced.matches));
    if (running && visible()) frame = requestAnimationFrame(animate);
  };
  const ageLabel = (force = false) => {
    if (!snapshot || busy && !force) return;
    const stale = Date.now() - Date.parse(snapshot.fetchedAt) > 300000;
    globe.dataset.reading = stale ? 'stale' : 'available';
    status.textContent = stale ? 'Stale node snapshot — refresh required' : 'Public-node snapshot · may be cached';
  };
  const load = async () => {
    if (busy || Date.now() - lastAttempt < 10000) return;
    busy = true; lastAttempt = Date.now(); refresh.disabled = true;
    globe.setAttribute('aria-busy', 'true'); status.textContent = 'Reading validated-ledger snapshot…';
    const controller = new AbortController(); const deadline = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/xrp-market', { signal: controller.signal, credentials: 'omit' });
      // This existing endpoint returns503 when spot-price fetching fails. Ledger
      // availability is separate and must pass its own complete schema checks.
      if (![200, 503].includes(response.status)) throw new Error('Unavailable');
      const next = readLedgerSnapshot(await response.json());
      if (!next) throw new Error('Incomplete ledger reading');
      const advanced = snapshot && !next.stale && next.sequence > snapshot.sequence;
      snapshot = next;
      sequence.textContent = `#${next.sequence.toLocaleString('en-US')}`;
      fee.textContent = next.baseFeeXrp === null ? 'Unavailable' : `${next.baseFeeXrp} XRP`;
      peers.textContent = next.peers === null ? 'Unavailable' : String(next.peers);
      stamp.textContent = `Node read ${new Date(next.fetchedAt).toLocaleString()} · xrplcluster.com`;
      ageLabel(true);
      if (advanced && !paused && !reduced.matches) {
        // One emphasis only for an observed advancing index, never a timer heartbeat.
        globe.classList.remove('nr-ledger-advanced');
        void globe.offsetWidth;
        globe.classList.add('nr-ledger-advanced');
      }
    } catch {
      snapshot = null; globe.dataset.reading = 'unavailable';
      sequence.textContent = 'Not read'; fee.textContent = 'Unavailable'; peers.textContent = 'Unavailable';
      stamp.textContent = 'Source: xrplcluster.com via /api/xrp-market';
      status.textContent = 'Ledger reading unavailable · try again';
      globe.classList.remove('nr-ledger-advanced');
    } finally {
      clearTimeout(deadline); busy = false; globe.setAttribute('aria-busy', 'false');
      // Bound manual retries as well as background reads.
      setTimeout(() => { refresh.disabled = false; }, Math.max(0, 10000 - (Date.now() - lastAttempt)));
    }
  };
  motion.hidden = false; refresh.hidden = false;
  motion.addEventListener('click', () => { paused = !paused; syncMotion(); });
  refresh.addEventListener('click', load);
  reduced.addEventListener('change', syncMotion);
  const observe = new IntersectionObserver(() => { syncMotion(); if (visible() && Date.now() - lastAttempt >= 120000) void load(); });
  observe.observe(globe);
  document.addEventListener('visibilitychange', () => { syncMotion(); if (visible() && Date.now() - lastAttempt >= 120000) void load(); });
  setInterval(() => { ageLabel(); if (visible() && Date.now() - lastAttempt >= 120000) void load(); }, 30000);
  draw(); syncMotion(); void load();
}
