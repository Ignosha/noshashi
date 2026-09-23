/* IGNOSHASHI - Portfolio (holdings & PnL from connected wallet) */
(function (global) {
  'use strict';
  const $ = global.$;

  async function loadPortfolio(wallet) {
    if (!wallet) {
      $('#portfolioSummary').innerHTML = '';
      $('#portfolioBody').innerHTML = '<p class="dim pixel small">Connect a wallet to see your portfolio.</p>';
      return;
    }
    try {
      const r = await API.get('/api/portfolio/' + encodeURIComponent(wallet));
      const items = r.items || [];
      const totalValue = items.reduce((a, i) => a + (i.value || 0), 0);
      $('#portfolioSummary').innerHTML = `
        <div class="pf-summary">
          <div class="pf-block"><span class="pixel tiny dim">WALLET</span><span class="pixel small">${global.fmt.shortAddr(wallet)}</span></div>
          <div class="pf-block"><span class="pixel tiny dim">HOLDINGS</span><span class="pixel sm accent">${items.length}</span></div>
          <div class="pf-block"><span class="pixel tiny dim">VALUE</span><span class="pixel sm">${global.fmt.usd(totalValue)}</span></div>
          <div class="pf-block"><span class="pixel tiny dim">EARNINGS</span><span class="pixel sm" style="color:var(--green)">${global.fmt.usd(r.earnings || 0)}</span></div>
        </div>`;
      $('#portfolioBody').innerHTML = items.length ? items.map(i => `
        <div class="token-row" onclick="global.selectToken('${i.token.id}')">
          <div class="token-avatar">${global.fmt.avatar(i.token.symbol)}</div>
          <div class="token-info">
            <div class="token-name">${i.token.name}</div>
            <div class="token-sym">$${i.token.symbol}</div>
          </div>
          <div class="token-stat">
            <div class="token-price">${global.fmt.num(i.balance || 0)}</div>
            <div class="token-vol">${global.fmt.usd(i.value || 0)}</div>
            <div class="token-cap">${global.fmt.price(i.price || 0)}</div>
          </div>
        </div>`).join('') : '<p class="dim pixel small">No holdings yet. Trade a token to build your portfolio.</p>';
    } catch (e) {
      $('#portfolioBody').innerHTML = '<p class="dim pixel small">Failed to load portfolio.</p>';
    }
  }

  global.renderPortfolio = function () {
    loadPortfolio(global.STATE.wallet);
  };

  global.renderPage.portfolio = global.renderPortfolio;

  // refresh portfolio when wallet connects
  const origHandle = global._origWalletHandler;
  // simple polling refresh
  setInterval(() => {
    if (global.STATE.connected && document.getElementById('page-portfolio').classList.contains('active')) {
      loadPortfolio(global.STATE.wallet);
    }
  }, 10000);
})(window);
