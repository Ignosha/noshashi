/* IGNOSHASHI - Dashboard */
(function (global) {
  'use strict';
  const $ = global.$;

  async function renderDashboard() {
    const wallet = global.STATE.wallet;
    const tokens = global.STATE.tokens || [];
    
    // Fetch real portfolio data from server
    let portfolio = [];
    if (wallet) {
      try {
        const r = await API.get('/api/portfolio/' + encodeURIComponent(wallet));
        portfolio = r.items || [];
      } catch (e) { portfolio = []; }
    }
    
    const total = portfolio.reduce((a, i) => a + (i.value || 0), 0);
    const elVal = document.getElementById('dashPortfolioValue');
    if (elVal) elVal.textContent = global.fmt.usd(total);
    
    const elChg = document.getElementById('dashPortfolioChange');
    if (elChg) {
      const totalPnl = portfolio.reduce((a, i) => a + (i.pnl || 0), 0);
      const pct = total > 0 ? (totalPnl / total) * 100 : 0;
      const color = pct >= 0 ? 'var(--green)' : 'var(--red)';
      const icon = pct >= 0 ? '▲' : '▼';
      elChg.innerHTML = `<span style="color:${color}">${icon} ${Math.abs(pct).toFixed(2)}% (24H)</span>`;
    }
    
    const elHold = document.getElementById('dashTopHoldings');
    if (elHold) {
      const top = portfolio.slice().sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 5);
      elHold.innerHTML = top.length ? top.map((h, i) => {
        const tk = h.token || tokens.find(t => t.id === h.tokenId) || { symbol: '???', name: 'Unknown' };
        const pnl = h.pnl || 0;
        const pnlColor = pnl >= 0 ? 'var(--green)' : 'var(--red)';
        return `<div class="token-row">
          <span class="pixel" style="color:var(--dim);width:30px">${i+1}</span>
          <div class="token-info"><div class="token-name">${tk.name || tk.symbol}</div><div class="token-sym">$${tk.symbol || ''}</div></div>
          <div class="token-stat"><div class="token-price">${global.fmt.usd(h.value || 0)}</div><div class="token-cap" style="color:${pnlColor}">${pnl>=0?'+':''}${global.fmt.usd(pnl)}</div></div>
        </div>`;
      }).join('') : '<p class="dim pixel small">Connect wallet to view holdings</p>';
    }
    
    const elAct = document.getElementById('dashRecentActivity');
    if (elAct) {
      try {
        const r = await API.get('/api/trades/user/' + encodeURIComponent(wallet || ''));
        const trades = (r.trades || []).slice().reverse().slice(0, 8);
        elAct.innerHTML = trades.length ? trades.map(t => {
          const isBuy = t.side === 'buy';
          return `<div class="token-row">
            <div class="token-info"><div class="token-name">${t.tokenName || 'Token'}</div><div class="token-sym">${global.fmt.time(t.timestamp)}</div></div>
            <div class="token-stat"><div class="token-price" style="color:${isBuy?'var(--green)':'var(--red)'}">${isBuy?'BUY':'SELL'} ${global.fmt.num(t.amount || 0)}</div></div>
          </div>`;
        }).join('') : '<p class="dim pixel small">No recent activity</p>';
      } catch (e) {
        elAct.innerHTML = '<p class="dim pixel small">Connect wallet to view activity</p>';
      }
    }
    
    const elWl = document.getElementById('dashWatchlistPerf');
    if (elWl) {
      try {
        const r = await API.get('/api/watchlist/' + encodeURIComponent(wallet || ''));
        const watchlist = r.watchlist || r.items || [];
        const wlTokens = watchlist.map(id => tokens.find(t => t.id === id)).filter(Boolean);
        elWl.innerHTML = wlTokens.length ? wlTokens.map((t, i) => {
          const chg = (t.priceChange || 0).toFixed(2);
          const color = parseFloat(chg) >= 0 ? 'var(--green)' : 'var(--red)';
          return `<div class="token-row">
            <span class="pixel" style="color:var(--dim);width:30px">${i+1}</span>
            <div class="token-info"><div class="token-name">${t.name}</div><div class="token-sym">$${t.symbol}</div></div>
            <div class="token-stat"><div class="token-price" style="color:${color}">${parseFloat(chg)>=0?'+':''}${chg}%</div></div>
          </div>`;
        }).join('') : '<p class="dim pixel small">Add tokens to watchlist</p>';
      } catch (e) {
        elWl.innerHTML = '<p class="dim pixel small">Add tokens to watchlist</p>';
      }
    }
  }

  global.renderPage = global.renderPage || {};
  global.renderPage.dashboard = renderDashboard;
})(window);
