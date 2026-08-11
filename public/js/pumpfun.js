/* IGNOSHASHI - pump.fun memecoin browser with live data only */
(function (global) {
  'use strict';
  const $ = global.$;
  let pumpTokens = [];
  let currentFilter = 'trending';

  async function fetchPumpFun() {
    pumpTokens = [];
    try {
      const r = await API.get('/api/pumpfun/trending');
      const coins = (r && r.coins) || [];
      if (!coins.length) return;
      const source = r.source || 'unknown';
      pumpTokens = coins.map((c, i) => ({
        id: 'pump-' + i,
        name: c.name || c.mint || 'Unknown',
        symbol: (c.symbol || '???').toUpperCase(),
        description: c.description || '',
        marketCap: c.market_cap || c.marketCap || 0,
        volume: c.volume || 0,
        replies: c.replies || 0,
        age: c.created_at ? Date.now() - new Date(c.created_at).getTime() : 0,
        network: 'solana',
        creator: c.creator || (source === 'coingecko' ? 'coingecko' : '--'),
        bonded: c.bonded || c.bonding_percent || (source === 'coingecko' ? 100 : 0),
        pumpUrl: source === 'pumpfun' ? ('https://pump.fun/coin/' + (c.mint || c.symbol || '')) : ('https://www.coingecko.com/en/coins/' + (c.mint || c.symbol || '')),
        mint: c.mint || c.id || '',
        price: c.price || 0,
        priceChange24h: c.price_change_24h || c.price_change_percentage_24h || 0,
        holders: c.holders || 0,
        image: c.image || '',
        source: source,
      }));
    } catch (e) {
      console.warn('[pumpfun] fetch failed:', e.message);
      pumpTokens = [];
    }
  }

  function renderPumpFun() {
    const body = document.getElementById('pumpfunBody');
    if (!body) return;
    if (!pumpTokens.length) {
      body.innerHTML = '<p class="dim pixel small">No live pump.fun data available right now. Check your connection and try again.</p>';
      return;
    }
    const trending = pumpTokens.slice().sort((a, b) => (b.volume + b.replies * 10) - (a.volume + a.replies * 10));
    const newest = pumpTokens.slice().sort((a, b) => (b.age || 0) - (a.age || 0));
    const topMcap = pumpTokens.slice().sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 5);
    const topVol = pumpTokens.slice().sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 5);

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div class="panel">
          <div class="panel-title pixel">🔥 TRENDING</div>
          <div class="panel-body">${trending.slice(0,8).map((t,i) => pumpRow(t, i+1)).join('')}</div>
        </div>
        <div class="panel">
          <div class="panel-title pixel">🆕 NEWEST</div>
          <div class="panel-body">${newest.slice(0,8).map((t,i) => pumpRow(t, i+1)).join('')}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div class="panel">
          <div class="panel-title pixel">💰 TOP MCAP</div>
          <div class="panel-body">${topMcap.map((t,i) => pumpRow(t, i+1)).join('')}</div>
        </div>
        <div class="panel">
          <div class="panel-title pixel">📈 TOP VOLUME</div>
          <div class="panel-body">${topVol.map((t,i) => pumpRow(t, i+1)).join('')}</div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title pixel">📋 ALL TRENDING COINS</div>
        <div class="panel-body">
          <div class="trending-tags" style="margin-bottom:12px">
            <button class="trending-tag active" data-filter="trending">🔥 TRENDING</button>
            <button class="trending-tag" data-filter="newest">🆕 NEWEST</button>
            <button class="trending-tag" data-filter="mcap">💰 TOP MCAP</button>
            <button class="trending-tag" data-filter="volume">📈 TOP VOL</button>
          </div>
          <div id="pumpList">${trending.slice(0,20).map((t,i) => pumpCard(t, i+1)).join('')}</div>
        </div>
      </div>
    `;

    bindPumpFilters(trending, newest, topMcap, topVol);
  }

  function pumpRow(t, rank) {
    const ageMin = Math.floor((t.age || 0) / 60000);
    const changeColor = t.priceChange24h >= 0 ? 'var(--green)' : 'var(--red)';
    const changeIcon = t.priceChange24h >= 0 ? '▲' : '▼';
    const srcLabel = t.source === 'coingecko' ? ' 📊 CG' : '';
    return `<div class="token-row" style="cursor:pointer" onclick="global.selectToken('${t.id}')">
      <span class="pixel" style="color:var(--yellow)">#${rank}</span>
      <div class="token-avatar">${global.fmt.avatar(t.symbol)}</div>
      <div class="token-info"><div class="token-name">${t.name}${srcLabel}</div><div class="token-sym">$${t.symbol}</div></div>
      <div class="token-stat">
        <div class="token-price">${global.fmt.usd(t.marketCap || 0)}</div>
        <div class="token-vol">VOL ${global.fmt.usd(t.volume || 0)}</div>
        <div class="token-cap" style="color:${changeColor}">${changeIcon} ${Math.abs(t.priceChange24h || 0).toFixed(1)}%</div>
      </div>
    </div>`;
  }

  function pumpCard(t, rank) {
    const ageMin = Math.floor((t.age || 0) / 60000);
    const changeColor = t.priceChange24h >= 0 ? 'var(--green)' : 'var(--red)';
    const changeIcon = t.priceChange24h >= 0 ? '▲' : '▼';
    const srcLabel = t.source === 'coingecko' ? ' 📊 CoinGecko' : ' 🎰 pump.fun';
    return `<div class="pump-card">
      <div class="pump-header">
        <div class="token-avatar">${global.fmt.avatar(t.symbol)}</div>
        <div style="flex:1">
          <div class="pixel small">${t.name}${srcLabel}</div>
          <div class="pixel tiny cyan">$${t.symbol} · SOLANA</div>
          <div class="pixel tiny dim">${t.description || ''}</div>
        </div>
        <div class="pixel tiny dim">#${rank}</div>
      </div>
      <div class="pump-meta">
        <div class="pump-stat"><span class="pixel tiny dim">PRICE</span><span class="pixel">${global.fmt.price(t.price || 0)}</span></div>
        <div class="pump-stat"><span class="pixel tiny dim">MCAP</span><span class="pixel">${global.fmt.usd(t.marketCap || 0)}</span></div>
        <div class="pump-stat"><span class="pixel tiny dim">24H</span><span class="pixel" style="color:${changeColor}">${changeIcon} ${Math.abs(t.priceChange24h || 0).toFixed(1)}%</span></div>
        <div class="pump-stat"><span class="pixel tiny dim">VOL</span><span class="pixel">${global.fmt.usd(t.volume || 0)}</span></div>
        <div class="pump-stat"><span class="pixel tiny dim">HOLDERS</span><span class="pixel">${global.fmt.num(t.holders || 0)}</span></div>
        <div class="pump-stat"><span class="pixel tiny dim">AGE</span><span class="pixel">${ageMin}m</span></div>
      </div>
      <div class="pump-footer">
        <span class="pixel tiny dim">CREATOR: ${t.creator} · BONDED: ${(t.bonded || 0).toFixed(1)}%</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="pixel-btn small" onclick="window.pumpTrade('${t.id}', 'buy')">⇩ BUY</button>
          <button class="pixel-btn small sell" onclick="window.pumpTrade('${t.id}', 'sell')">⇧ SELL</button>
          <a href="${t.pumpUrl}" target="_blank" rel="noopener" class="pixel-btn small ghost" style="margin-left:6px;text-decoration:none">🔗 ${t.source === 'coingecko' ? 'CG' : 'PUMP'}</a>
        </div>
      </div>
    </div>`;
  }

  function bindPumpFilters(trending, newest, topMcap, topVol) {
    const list = document.getElementById('pumpList');
    if (!list) return;
    const tags = list.parentElement.querySelectorAll('.trending-tag');
    tags.forEach(tag => {
      tag.addEventListener('click', () => {
        tags.forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
        const f = tag.dataset.filter;
        let rows = trending;
        if (f === 'newest') rows = newest;
        else if (f === 'mcap') rows = topMcap;
        else if (f === 'volume') rows = topVol;
        list.innerHTML = rows.slice(0,20).map((t,i) => pumpCard(t, i+1)).join('');
      });
    });
  }

  global.pumpTrade = async function (tokenId, side) {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect a wallet first');
    const t = pumpTokens.find(p => p.id === tokenId);
    if (!t) return;
    const amount = prompt(side === 'buy' ? `Buy $${t.symbol} (enter SOL amount):` : `Sell $${t.symbol} (enter token amount):`, side === 'buy' ? '1' : '1000');
    if (!amount || parseFloat(amount) <= 0) return;
    try {
      const r = await API.post('/api/pumpfun/trade', {
        tokenId,
        wallet,
        side,
        amount: parseFloat(amount),
        mint: t.mint || '',
        network: 'solana',
      });
      global.toast((side === 'buy' ? 'Bought' : 'Sold') + ' $' + t.symbol + '! TX: ' + (r.hash || 'ok'));
      if (global.SoundEngine && global.SoundEngine.successBlip) global.SoundEngine.successBlip();
    } catch (e) { global.toast('Trade failed: ' + e.message); }
  };

  document.getElementById('refreshPump') && document.getElementById('refreshPump').addEventListener('click', async () => {
    await fetchPumpFun();
    renderPumpFun();
    global.toast('pump.fun feed refreshed');
  });

  global.renderPage = global.renderPage || {};
  global.renderPage.pumpfun = async function () {
    if (!pumpTokens.length) await fetchPumpFun();
    renderPumpFun();
  };
})(window);
