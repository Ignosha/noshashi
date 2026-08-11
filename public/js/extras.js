/* IGNOSHASHI - Whale tracker + gas widget + shortcuts + command palette */
(function (global) {
  'use strict';
  const $ = global.$;

  /* ---------- Whale tracker ---------- */
  async function loadWhales() {
    const container = document.getElementById('whaleList');
    if (!container) return;
    try {
      const r = await API.get('/api/whales');
      const whales = r.whales || [];
      container.innerHTML = whales.length ? whales.map(w => `
        <div class="ob-row" style="color:var(--yellow)">
          <span>🐋</span>
          <span>${global.fmt.shortAddr(w.address)}</span>
          <span class="pixel tiny dim">${w.network ? w.network.toUpperCase() : 'SOL'}</span>
          <span>${global.fmt.usd(w.balance || 0)}</span>
        </div>
      `).join('') : '<p class="dim pixel small">No whale data</p>';
    } catch (e) { container.innerHTML = '<p class="dim pixel small">Failed to load whales</p>'; }
  }

  async function loadWhaleFeed() {
    const container = document.getElementById('whaleTradeFeed');
    if (!container) return;
    try {
      const r = await API.get('/api/whales/feed');
      const trades = r.trades || [];
      container.innerHTML = trades.length ? trades.map(tr => `
        <div class="ob-row ${tr.side}">
          <span>🐋</span>
          <span>${global.fmt.shortAddr(tr.user)}</span>
          <span>${global.fmt.num(tr.amount)}</span>
          <span class="pixel tiny dim">${global.fmt.time(tr.timestamp)}</span>
        </div>
      `).join('') : '<p class="dim pixel small">No whale trades</p>';
    } catch (e) { container.innerHTML = '<p class="dim pixel small">Failed to load whale feed</p>'; }
  }

  /* ---------- Gas widget ---------- */
  async function loadGas() {
    const el = document.getElementById('gasWidget');
    if (!el) return;
    try {
      const r = await API.get('/api/gas');
      if (r.ethereum) {
        el.innerHTML = `<span class="pixel tiny" style="color:var(--green)">⚡ ETH: ${r.ethereum.gasPrice || r.ethereum} gwei</span>`;
      }
      if (r.solana) {
        el.innerHTML += ` <span class="pixel tiny" style="color:var(--purple)">⚡ SOL: ${r.solana.rent || r.solana}</span>`;
      }
    } catch (e) { el.innerHTML = '<span class="pixel tiny dim">Gas: --</span>'; }
  }

  /* ---------- Command palette ---------- */
  function initCommandPalette() {
    const palette = document.getElementById('commandPalette');
    const input = document.getElementById('commandInput');
    if (!palette || !input) return;
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); palette.classList.toggle('hidden'); input.focus(); }
      if (e.key === 'Escape') palette.classList.add('hidden');
    });
    input.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const results = document.getElementById('commandResults');
      if (!results) return;
      const pages = ['home','terminal','leaderboard','create','trade','rank','watchlist','portfolio','launchpad','pumpfun','community','news','tools','api','announce','earnings','memecoin','alerts','copytrade','whale','referrals','social'];
      const matches = pages.filter(p => p.includes(q));
      results.innerHTML = matches.length ? matches.map(p => `<div class="ob-row" onclick="global.showPage('${p}');document.getElementById('commandPalette').classList.add('hidden')"><span>📄</span><span>${p.toUpperCase()}</span></div>`).join('') : '<p class="dim pixel tiny">No matches</p>';
    });
  }

  /* ---------- Keyboard shortcuts ---------- */
  function initShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (key === 't') global.showPage && global.showPage('trade');
      if (key === 'p') global.showPage && global.showPage('portfolio');
      if (key === 'w') global.showPage && global.showPage('watchlist');
      if (key === 'n') global.showPage && global.showPage('news');
      if (key === 'l') global.showPage && global.showPage('launchpad');
      if (key === 'c') global.showPage && global.showPage('create');
    });
  }

  global.loadWhales = loadWhales;
  global.loadWhaleFeed = loadWhaleFeed;
  global.loadGas = loadGas;

  global.renderPage = global.renderPage || {};
  global.renderPage.whale = loadWhales;

  document.addEventListener('DOMContentLoaded', () => { initCommandPalette(); initShortcuts(); });
})(window);
