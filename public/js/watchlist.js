/* IGNOSHASHI - Watchlist management */
(function (global) {
  'use strict';
  const $ = global.$;

  function userKey() {
    return global.STATE.wallet || (localStorage.getItem('igno_user') || 'local_user');
  }

  // watch set from server for current user
  global.addWatch = async function (id) {
    const u = userKey();
    try {
      await API.post('/api/watchlist', { user: u, tokenId: id });
      global.STATE.watchAdded.add(id);
      toast('Added to watchlist');
      global.renderWatchlist();
    } catch (e) { toast('Failed to add'); }
  };

  global.removeWatch = async function (id) {
    const u = userKey();
    try {
      await API.del('/api/watchlist?user=' + encodeURIComponent(u) + '&tokenId=' + id);
      global.STATE.watchAdded.delete(id);
      global.renderWatchlist();
    } catch (e) {}
  };

  global.renderWatchlist = function () {
    const u = userKey();
    API.get('/api/watchlist/' + encodeURIComponent(u)).then((rows) => {
      const body = $('#watchlistBody');
      if (!body) return;
      body.innerHTML = rows.length ? rows.map((t) => {
        const price = (t.marketCap || 0) / (t.supply || 1);
        return `<div class="token-row">
          <div class="token-avatar">${global.fmt.avatar(t.symbol)}</div>
          <div class="token-info">
            <div class="token-name">${t.name}</div>
            <div class="token-sym">$${t.symbol}</div>
            <div class="token-meta">${global.fmt.price(price)} · ${global.fmt.usd(t.marketCap || 0)}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="chip" onclick="global.Trade.selectToken('${t.id}')">TRADE</button>
            <button class="chip" onclick="global.removeWatch('${t.id}')">✖</button>
          </div>
        </div>`;
      }).join('') : '<p class="dim">No tokens watched yet. Click 👁 WATCH on a token.</p>';
    }).catch(() => {});
  };

  global.renderAnnounce = function () {
    API.get('/api/announcements').then((r) => {
      const body = $('#announceBody');
      if (!body) return;
      body.innerHTML = (r.announcements || []).map((a) =>
        `<div class="ann-item"><span class="ann-icon">${a.icon}</span><span class="ann-text">${a.text}</span><span class="ann-time">${global.fmt.time(a.time)}</span></div>`
      ).join('') || '<p class="dim">No announcements yet.</p>';
    }).catch(() => {});
  };

  global.renderEarnings = function () {
    $('#feeETH').textContent = global.STATE.feeETH || '—';
    $('#feeSOL').textContent = global.STATE.feeSOL || '—';
    API.get('/api/earnings').then((r) => {
      const body = $('#feeLedger');
      if (!body) return;
      body.innerHTML = (r.earnings || []).length ? r.earnings.map((e) =>
        `<div class="ob-row ${e.kind.includes('buy')?'buy':'sell'}">
          <span>${e.network.toUpperCase()}</span>
          <span>${e.kind}</span>
          <span>${global.fmt.num(e.amount)}</span>
          <span>${global.fmt.time(e.timestamp)}</span>
        </div>`
      ).join('') : '<p class="dim">No platform fees collected yet.</p>';
    }).catch(() => {});
  };

  global.renderPage.watchlist = global.renderWatchlist;
  global.renderPage.announce = global.renderAnnounce;
  global.renderPage.earnings = global.renderEarnings;
})(window);

