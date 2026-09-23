/* IGNOSHASHI - Whale alerts - real trades only */
(function (global) {
  'use strict';
  const $ = global.$;
  const container = document.getElementById('whaleTradeFeed');
  if (!container) return;

  async function loadRealWhales() {
    try {
      const r = await API.get('/api/whales/feed');
      const trades = (r && r.trades) || [];
      if (!trades.length) {
        container.innerHTML = '<p class="dim pixel small">No whale activity yet</p>';
        return;
      }
      container.innerHTML = trades.slice(0, 10).map(t => {
        const isBuy = t.side === 'buy';
        const color = isBuy ? 'var(--green)' : 'var(--red)';
        const icon = isBuy ? '🐋' : '🦈';
        const token = (global.STATE.tokens || []).find(x => x.id === t.tokenId) || { name: t.tokenId, symbol: t.tokenId.slice(0, 4) };
        return `<div class="token-row" style="animation:slideIn 0.3s ease">
          <div class="token-avatar">${icon}</div>
          <div class="token-info">
            <div class="token-name">${token.name || token.symbol}</div>
            <div class="token-sym">${global.fmt.shortAddr(t.user)}</div>
          </div>
          <div class="token-stat">
            <div class="token-price" style="color:${color}">${isBuy?'BUY':'SELL'} ${global.fmt.num(t.amount || 0)}</div>
            <div class="token-cap">${global.fmt.usd(t.cost || 0)}</div>
          </div>
        </div>`;
      }).join('');
    } catch (e) {
      container.innerHTML = '<p class="dim pixel small">Failed to load whale activity</p>';
    }
  }

  loadRealWhales();
  setInterval(loadRealWhales, 10000);

  global.renderPage = global.renderPage || {};
})(window);
