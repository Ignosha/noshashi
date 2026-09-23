/* IGNOSHASHI - Launchpad (featured launches, gradient-to-DEX) */
(function (global) {
  'use strict';
  const $ = global.$;

  function renderLaunchpad() {
    const tokens = (global.STATE.tokens || []).slice().sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    const featured = tokens.slice(0, 6);
    $('#launchpadBody').innerHTML = featured.length ? `
      <div class="launchpad-grid">
        ${featured.map((t, i) => {
          const price = t.marketCap && t.supply ? t.marketCap / t.supply : 0;
          const bonding = Math.min(100, ((t.marketCap || 0) / (t.supply * 0.001)) * 100);
          const live = i === 0;
          return `<div class="launch-card">
            <div class="launch-badge ${live ? 'live' : ''}">${live ? '🔥 LIVE' : 'NEW'}</div>
            <div class="launch-avatar">${global.fmt.avatar(t.symbol)}</div>
            <div class="launch-name pixel">${t.name}</div>
            <div class="launch-sym">$${t.symbol} · ${(t.network||'solana').toUpperCase()}</div>
            <div class="launch-price">${global.fmt.usd(t.marketCap || 0)}</div>
            <div class="launch-bonding">
              <div style="background:#000;border:2px solid var(--panel-line);height:12px"><div style="background:linear-gradient(90deg,var(--cyan),var(--yellow));height:100%;width:${bonding}%"></div></div>
              <span class="pixel tiny dim">${bonding.toFixed(1)}% to DEX</span>
            </div>
            <button class="pixel-btn small" onclick="global.selectToken('${t.id}')">🚀 TRADE</button>
          </div>`;
        }).join('') || ''}
      </div>` : '<p class="dim pixel small">No launches yet — be the first to launch a meme coin!</p>';
  }

  global.renderLaunchpad = renderLaunchpad;
  global.renderPage.launchpad = renderLaunchpad;
})(window);
