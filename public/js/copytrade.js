/* IGNOSHASHI - Copy trade */
(function (global) {
  'use strict';
  const $ = global.$;

  async function loadCopyTrades() {
    const wallet = global.STATE.wallet;
    const container = document.getElementById('copyTradeList');
    if (!container) return;
    if (!wallet) { container.innerHTML = '<p class="dim pixel small">Connect wallet to view copy trades</p>'; return; }
    try {
      const r = await API.get('/api/copytrade/' + encodeURIComponent(wallet));
      const follows = r.follows || [];
      container.innerHTML = follows.length ? follows.map(f => `
        <div class="ob-row" style="color:var(--cyan)">
          <span>📋</span>
          <span>${f.tokenName || f.tokenId}</span>
          <span class="pixel tiny dim">${f.wallet.slice(0,6)}...${f.wallet.slice(-4)}</span>
          <button class="chip" onclick="global.unfollowTrade('${f.id || f.tokenId}')">✖</button>
        </div>
      `).join('') : '<p class="dim pixel small">Not copying any trades yet</p>';
    } catch (e) { container.innerHTML = '<p class="dim pixel small">Failed to load copy trades</p>'; }
  }

  global.unfollowTrade = async function (id) {
    try { await API.del('/api/copytrade/' + id); global.toast('Unfollowed'); loadCopyTrades(); }
    catch (e) { global.toast('Unfollow failed: ' + e.message); }
  };

  global.renderPage = global.renderPage || {};
  global.renderPage.copytrade = loadCopyTrades;
})(window);
