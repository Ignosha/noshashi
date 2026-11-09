/* Progressive enhancement: every article and both reading modes exist without JS. */
(() => {
  const form = document.querySelector('[data-filters]');
  if (form) {
    const cards = [...document.querySelectorAll('[data-story]')];
    const run = () => {
      const q = form.elements.q.value.trim().toLocaleLowerCase();
      const category = form.elements.category.value;
      let count = 0;
      for (const card of cards) {
        card.hidden = !!(category && card.dataset.category !== category || q && !card.textContent.toLocaleLowerCase().includes(q));
        if (!card.hidden) count++;
      }
      document.querySelector('[data-results]').textContent = `${count} article${count === 1 ? '' : 's'} shown`;
      document.querySelector('[data-no-results]').hidden = count > 0 || cards.length === 0;
    };
    form.hidden = false;
    form.addEventListener('submit', e => { e.preventDefault(); run(); });
    form.addEventListener('input', run);
    form.addEventListener('reset', () => setTimeout(run, 0));
    run();
  }
  const modes = document.querySelector('[data-mode-controls]');
  if (modes) {
    const set = mode => {
      modes.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      document.querySelectorAll('[data-reading]').forEach(s => { s.hidden = s.dataset.reading !== mode; });
    };
    modes.hidden = false;
    modes.querySelectorAll('button').forEach(b => b.addEventListener('click', () => set(b.dataset.mode)));
    set('simple');
  }
  // One read per section per visit; CDN caching contains upstream usage. No polling loop.
  for (const panel of document.querySelectorAll('[data-auto-feed]')) {
    const news = panel.dataset.autoFeed === 'news';
    const notice = panel.querySelector('[role="status"]');
    const list = panel.querySelector('ol'), retry = panel.querySelector('button');
    const load = async () => {
      panel.setAttribute('aria-busy', 'true'); retry.hidden = true;
      notice.textContent = news ? 'Loading source headlines…' : 'Loading product updates…';
      list.replaceChildren();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(news ? '/api/xrp-news?limit=3' : '/api/project-feed?limit=3', { signal: controller.signal, credentials: 'omit' });
        if (!res.ok) throw new Error('Unavailable');
        const data = await res.json();
        const rows = news ? data.items : data.entries;
        if (!Array.isArray(rows)) throw new Error('Incomplete');
        let count = 0;
        for (const row of rows.slice(0, 3)) {
          if (!row || typeof row.url !== 'string' || !row.url.trim() || row.url.length > 3000) continue;
          let url;
          try { url = new URL(row.url, location.origin); } catch { continue; }
          const at = news ? row.publishedAt : row.at;
          if (url.protocol !== 'https:' || url.username || url.password || typeof row.title !== 'string' || row.title.length > 500) continue;
          const li = document.createElement('li'), a = document.createElement('a'), note = document.createElement('p');
          a.href = url.href; a.rel = 'noopener noreferrer'; a.textContent = row.title;
          const stamp = at && Number.isFinite(Date.parse(at)) ? new Date(at).toLocaleString() : 'source date unknown';
          note.textContent = `${news ? typeof row.publisher === 'string' && row.publisher ? row.publisher : 'Publisher unknown' : 'NOSHASHI repository'} · ${stamp}`;
          note.className = 'nr-small'; li.append(a, note); list.append(li); count++;
        }
        const fetched = data.fetchedAt && Number.isFinite(Date.parse(data.fetchedAt)) ? new Date(data.fetchedAt).toLocaleString() : 'time unavailable';
        notice.textContent = `${count ? `${count} source item${count === 1 ? '' : 's'}` : 'No usable source items'} · ${news ? 'External feed, not editorial verification' : 'Repository updates'}${data.partial ? ' · Partial coverage' : ''} · Source read ${fetched} · May be cached`;
        if (!count) retry.hidden = false;
      } catch {
        notice.textContent = 'Source reading unavailable. No results have been substituted.';
        retry.hidden = false;
      } finally { clearTimeout(timer); panel.setAttribute('aria-busy', 'false'); }
    };
    retry.addEventListener('click', load);
    load();
  }
})();
