/* IGNOSHASHI - Live ticker */
(function (global) {
  'use strict';
  let tickerItems = [];
  let currentIndex = 0;

  function updateTicker() {
    const el = document.getElementById('liveTicker');
    if (!el) return;
    if (!tickerItems.length) {
      const tokens = (global.STATE.tokens || []).slice().sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 8);
      tickerItems = tokens.map(t => {
        return `$${t.symbol}: ${global.fmt.usd(t.marketCap || 0)}`;
      });
    }
    if (tickerItems.length) {
      el.textContent = '📡 ' + tickerItems[currentIndex % tickerItems.length];
      currentIndex++;
    }
  }

  setInterval(updateTicker, 3000);
  updateTicker();

  global.renderPage = global.renderPage || {};
})(window);
