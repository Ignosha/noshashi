/* IGNOSHASHI - Global search, filters, command palette */
(function (global) {
  'use strict';
  const $ = global.$;
  let query = '';
  let filters = { network: 'all', verified: false, graduated: false, minMcap: 0, maxMcap: Infinity, safetyMin: 0 };

  function init() {
    const search = $('#globalSearch');
    if (!search) return;
    search.addEventListener('input', (e) => { query = e.target.value.toLowerCase(); renderResults(); });
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; query = ''; renderResults(); search.blur(); } });
    document.addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); search.focus(); } });
    $('#filterNetwork') && $('#filterNetwork').addEventListener('change', (e) => { filters.network = e.target.value; renderResults(); });
    $('#filterVerified') && $('#filterVerified').addEventListener('change', (e) => { filters.verified = e.target.checked; renderResults(); });
    $('#filterGraduated') && $('#filterGraduated').addEventListener('change', (e) => { filters.graduated = e.target.checked; renderResults(); });
    $('#filterSafety') && $('#filterSafety').addEventListener('input', (e) => { filters.safetyMin = parseInt(e.target.value) || 0; renderResults(); });
  }

  function getFiltered() {
    let list = (global.STATE.tokens || []).slice();
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(t => {
        const name = (t.name || '').toLowerCase();
        const sym = (t.symbol || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        return name.includes(q) || sym.includes(q) || desc.includes(q) || fuzzyMatch(q, name) || fuzzyMatch(q, sym);
      });
    }
    if (filters.network !== 'all') list = list.filter(t => (t.network || 'solana') === filters.network);
    if (filters.verified) list = list.filter(t => t.verified);
    if (filters.graduated) list = list.filter(t => t.graduated);
    if (filters.safetyMin > 0) list = list.filter(t => (t.safetyScore || 50) >= filters.safetyMin);
    return list.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
  }

  function fuzzyMatch(query, str) {
    let qi = 0;
    for (let i = 0; i < str.length && qi < query.length; i++) {
      if (str[i] === query[qi]) qi++;
    }
    return qi === query.length;
  }

  function renderResults() {
    const container = document.getElementById('searchDropdown');
    if (!container) return;
    const list = getFiltered();
    container.innerHTML = list.length ? list.map((t, i) => {
      const safety = t.safetyScore != null ? t.safetyScore : 50;
      const safetyColor = safety >= 80 ? 'var(--green)' : safety >= 50 ? 'var(--yellow)' : 'var(--red)';
      const name = global.Security ? global.Security.sanitize(t.name || '') : (t.name || '');
      const sym = global.Security ? global.Security.sanitize(t.symbol || '') : (t.symbol || '');
      const network = global.Security ? global.Security.sanitize(t.network || 'solana') : (t.network || 'solana');
      return `<div class="token-row" onclick="global.selectToken('${t.id}');document.getElementById('searchDropdown').classList.add('hidden')">
        <div class="token-avatar">${global.fmt.avatar(t.symbol)}${t.verified ? ' ✅' : ''}</div>
        <div class="token-info"><div class="token-name">${name}</div><div class="token-sym">$${sym} · ${network.toUpperCase()}</div></div>
        <div class="token-stat"><div class="token-price">${global.fmt.usd(t.marketCap||0)}</div><div class="token-cap" style="color:${safetyColor}">SAFETY ${safety}</div></div>
      </div>`;
    }).join('') : '<p class="dim pixel small">No tokens match your search</p>';
  }

  global.getFilteredTokens = getFiltered;
  global.renderSearchResults = renderResults;

  document.addEventListener('DOMContentLoaded', init);
})(window);
