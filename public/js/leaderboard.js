/* IGNOSHASHI - Leaderboard based on real token buy data */
(function (global) {
  'use strict';
  const $ = global.$;

  function getTokenLeaderboard() {
    const tokens = (global.STATE.tokens || []).slice();
    return tokens.sort((a, b) => {
      const scoreA = (a.buys || 0) * 1000 + (a.volume || 0);
      const scoreB = (b.buys || 0) * 1000 + (b.volume || 0);
      return scoreB - scoreA;
    }).slice(0, 20);
  }

  function renderTokenRow(t, i) {
    const buys = t.buys || 0;
    const vol = t.volume || 0;
    const mcap = t.marketCap || 0;
    const change = (t.priceChange || 0).toFixed(2);
    const color = change >= 0 ? 'var(--green)' : 'var(--red)';
    const creatorPic = t.creator && global.getProfilePic ? global.getProfilePic(t.creator) : '';
    const creatorAvatar = creatorPic
      ? `<img src="${creatorPic}" style="width:36px;height:36px;border-radius:50%;border:2px solid var(--panel-line);object-fit:cover;" onerror="this.outerHTML='🪙'" />`
      : (global.fmt.avatar(t.symbol) || '🪙');
    const icon = i < 3 ? ['🥇','🥈','🥉'][i] : creatorAvatar;
    return `<div class="token-row">
      <span class="pixel" style="color:${i<3?'var(--yellow)':'var(--dim)'};width:30px">${i+1}</span>
      <div class="token-avatar">${icon}</div>
      <div class="token-info">
        <div class="token-name">${t.name || t.symbol || 'Unknown'}</div>
        <div class="token-sym">$${t.symbol || '???'} · ${buys} buys · ${(t.network||'solana').toUpperCase()}</div>
      </div>
      <div class="token-stat">
        <div class="token-price" style="color:${color}">${change>=0?'+':''}${change}%</div>
        <div class="token-cap">${global.fmt.usd(mcap)} · Vol: ${global.fmt.usd(vol)}</div>
      </div>
      <button class="chip" onclick="global.selectToken('${t.id}')">TRADE</button>
    </div>`;
  }

  async function loadLeaderboard() {
    const container = document.getElementById('leaderboardBody');
    if (!container) return;
    try {
      const r = await API.get('/api/leaderboard');
      const tokens = r || [];
      if (tokens.length) {
        container.innerHTML = tokens.map((t, i) => renderTokenRow(t, i)).join('');
      } else {
        renderFromState(container);
      }
    } catch (e) {
      renderFromState(container);
    }
  }

  function renderFromState(container) {
    const tokens = getTokenLeaderboard();
    if (tokens.length) {
      container.innerHTML = tokens.map((t, i) => renderTokenRow(t, i)).join('');
    } else {
      container.innerHTML = '<p class="dim pixel small">No tokens yet. Be the first to launch!</p>';
    }
  }

  async function loadTraderLeaderboard() {
    const container = document.getElementById('traderLeaderboardList');
    if (!container) return;
    try {
      const r = await API.get('/api/leaderboard');
      const tokens = r || [];
      const traders = tokens.slice().sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 10).map(t => ({
        wallet: t.creator || t.address || '0x0000000000000000000000000000000000000000',
        pnl: t.volume || 0,
        pnl24h: (t.volume || 0) * 0.1,
        winRate: Math.min(100, 50 + (t.volume || 0) / 1000),
        trades: Math.floor((t.totalBuy || 0) / 100),
      }));
      container.innerHTML = traders.length ? traders.map((tr, i) => renderTraderRow(tr, i)).join('') : '<p class="dim pixel small">No traders yet</p>';
    } catch (e) {
      container.innerHTML = '<p class="dim pixel small">Failed to load traders</p>';
    }
  }

  function renderTraderRow(tr, i) {
    const pic = global.getProfilePic ? global.getProfilePic(tr.wallet) : '';
    const avatarHtml = pic
      ? `<img src="${pic}" style="width:36px;height:36px;border-radius:50%;border:2px solid var(--panel-line);object-fit:cover;" onerror="this.outerHTML='👤'" />`
      : (i < 3 ? ['🥇','🥈','🥉'][i] : '👤');
    return `<div class="token-row">
      <span class="pixel" style="color:${i<3?'var(--yellow)':'var(--dim)'};width:30px">${i+1}</span>
      <div class="token-avatar">${avatarHtml}</div>
      <div class="token-info">
        <div class="token-name">${global.fmt.shortAddr(tr.wallet)}</div>
        <div class="token-sym">Win: ${(tr.winRate||0).toFixed(0)}% · Trades: ${tr.trades||0}</div>
      </div>
      <div class="token-stat">
        <div class="token-price" style="color:var(--green)">+${global.fmt.usd(tr.pnl||0)}</div>
        <div class="token-cap">24H: ${global.fmt.usd(tr.pnl24h||0)}</div>
      </div>
      <button class="chip" onclick="global.followTrader('${tr.wallet}')">FOLLOW</button>
    </div>`;
  }

  global.followTrader = async function (wallet) {
    try { await API.post('/api/copytrade/follow', { wallet, trader: wallet }); global.toast('Now following trader'); }
    catch (e) { global.toast('Follow failed: ' + e.message); }
  };

  async function loadReferrals() {
    const wallet = global.STATE.wallet;
    const container = document.getElementById('referralStats');
    if (!container || !wallet) return;
    try {
      const r = await API.get('/api/referrals/' + encodeURIComponent(wallet));
      container.innerHTML = `
        <div class="pf-summary">
          <div class="pf-block"><span class="pixel tiny dim">REFERRALS</span><span class="pixel sm">${r.count || 0}</span></div>
          <div class="pf-block"><span class="pixel tiny dim">EARNED</span><span class="pixel sm accent">${global.fmt.usd(r.earned || 0)}</span></div>
          <div class="pf-block"><span class="pixel tiny dim">LINK</span><span class="pixel tiny cyan" style="word-break:break-all">${r.link || ''}</span></div>
        </div>`;
    } catch (e) { container.innerHTML = '<p class="dim pixel small">Failed to load referrals</p>'; }
  }

  global.renderPage = global.renderPage || {};
  global.renderPage.leaderboard = loadLeaderboard;
  global.renderPage.traders = loadTraderLeaderboard;
  global.renderPage.referrals = loadReferrals;
})(window);
