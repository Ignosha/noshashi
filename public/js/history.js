/* IGNOSHASHI - Transaction history */
(function (global) {
  'use strict';
  const $ = global.$;

  function renderHistory() {
    const container = document.getElementById('txHistory');
    if (!container) return;
    const trades = (global.STATE.trades || []).slice().reverse();
    if (!trades.length) { container.innerHTML = '<p class="dim pixel small">No transactions yet</p>'; return; }
    container.innerHTML = trades.map(t => {
      const isBuy = t.type === 'buy';
      return `<div class="token-row">
        <div class="token-avatar">${isBuy ? '📈' : '📉'}</div>
        <div class="token-info">
          <div class="token-name">${t.tokenName || 'Token'}</div>
          <div class="token-sym">${global.fmt.time(t.time)} · ${isBuy ? 'BUY' : 'SELL'}</div>
        </div>
        <div class="token-stat">
          <div class="token-price" style="color:${isBuy?'var(--green)':'var(--red)'}">${isBuy?'+':'-'}${t.amount||0}</div>
          <div class="token-cap">${global.fmt.usd(t.total || 0)}</div>
        </div>
        <span class="pixel tiny dim">${t.hash ? global.fmt.shortAddr(t.hash) : ''}</span>
      </div>`;
    }).join('');
  }

  global.renderPage = global.renderPage || {};
  global.renderPage.history = renderHistory;
})(window);
