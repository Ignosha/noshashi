/* IGNOSHASHI - Terminal feed (pump.fun-style) */
(function (global) {
  'use strict';
  const $ = global.$;
  const listEl = $('#terminalTokenList');
  const logEl = $('#terminalLog');
  let paused = false;
  let sortBy = 'newest';

  function renderSeed() {
    if (logEl.children.length) return;
  }

  function addLine(msg) {
    if (paused) return;
    const t = msg.trade;
    const dt = new Date();
    const line = document.createElement('div');
    let cls = 'term-line';
    let text = '';
    let user = '';
    if (msg.type === 'create') {
      cls += ' create';
      text = `NEW TOKEN ${msg.token.name} ($${msg.token.symbol}) launched on ${(msg.token.network||'solana').toUpperCase()}`;
    } else if (msg.type === 'trade') {
      cls += ' ' + t.side;
      user = global.fmt.shortAddr(t.user);
      const sym = global.STATE.tokens.find(x => x.id === t.tokenId)?.symbol || t.tokenId.slice(0,4);
      if (t.side === 'buy') {
        text = `${user} BUY ${global.fmt.num(t.amount)} $${sym} for ${global.fmt.num(t.cost)} @ ${global.fmt.price(t.price)}`;
      } else {
        text = `${user} SELL ${global.fmt.num(t.amount)} $${sym} for ${global.fmt.num(t.cost)} @ ${global.fmt.price(t.price)}`;
      }
    } else if (msg.graduated) {
      cls += ' grad';
      text = `🎓 ${msg.token.name} GRADUATED! Ascended to outer rim!`;
    }
    line.className = cls;
    line.innerHTML = `<span class="term-time">[${dt.toLocaleTimeString([],{hour12:false})}]</span> <span class="term-user">${user || ''}</span> ${text}`;
    line.setAttribute('data-t', msg.type);
    if (msg.type === 'trade') line.setAttribute('data-sid', t.side);
    logEl.appendChild(line);
    while (logEl.children.length > 200) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function renderTokenList() {
    let arr = (global.STATE.tokens || []).slice();
    if (sortBy === 'newest') arr.sort((a, b) => b.created_at - a.created_at);
    if (sortBy === 'marketcap') arr.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    if (sortBy === 'volume') arr.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    listEl.innerHTML = arr.length
      ? arr.map(global.tokenCard).join('')
      : '<p class="dim">No tokens yet</p>';
  }

  global.renderTerminalLines = function () {
    renderSeed();
    // pre-populate existing trades
    const existing = (global.STATE.trades || []).slice().reverse();
    if (!logEl.dataset.seeded) {
      for (const tr of existing.slice(-30)) {
        const type = tr.side === 'buy' ? 'trade' : 'trade';
        addLine({ type, trade: tr, token: { name: tr.tokenId, symbol: tr.tokenId.slice(0,4) }, graduated: false });
      }
      logEl.dataset.seeded = '1';
    }
    renderTokenList();
  };

  global.terminalRenderHomeLine = function () { /* no-op */ };

  global.onLiveTrade = function (msg) {
    addLine(msg);
    renderTokenList();
  };

  global.WS.on('create', () => { renderTokenList(); });
  global.WS.on('trade', () => {}); // handled in app.js routing

  $('#terminalPause').addEventListener('click', () => {
    paused = !paused;
    $('#terminalPause').textContent = paused ? '▶ RESUME' : '⏸ PAUSE';
  });

  $$('.chip[data-sort]').forEach((c) => {
    c.addEventListener('click', () => {
      $$('.chip[data-sort]').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      sortBy = c.dataset.sort;
      renderTokenList();
    });
  });

  global.Terminal = { renderTokenList, addLine };
})(window);

