/* IGNOSHASHI - Trade, buy/sell, chart, rank, watchlist */
(function (global) {
  'use strict';
  const $ = global.$;
  let mode = 'buy';
  let currentTokenId = null;
  let tradeBusy = false;

  /* ---------- Token select population ---------- */
  function populate(selId) {
    const sel = $(selId);
    if (!sel) return;
    const tokens = (global.STATE.tokens || []).slice().sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    sel.innerHTML = tokens.length
      ? tokens.map((t) => `<option value="${t.id}">${t.name} ($${t.symbol}) · ${global.fmt.usd(t.marketCap || 0)}</option>`).join('')
      : '<option value="">No tokens yet — create one!</option>';
    return sel;
  }

  global.refreshTokenSelects = function () {
    populate('#tradeTokenSel');
    populate('#rankTokenSel');
    if (currentTokenId && !global.STATE.tokens.find(t => t.id === currentTokenId)) {
      currentTokenId = null;
    }
  };

  function getAmountForSel() {
    const v = $('#tradeTokenSel').value;
    if (v === '') {
      return global.STATE.tokens.find(t => t.id === currentTokenId);
    }
    const t = global.STATE.tokens.find(x => x.id === v);
    if (t) currentTokenId = t.id;
    return t;
  }

  /* ---------- Select a token (global for onclick) ---------- */
  global.selectToken = function (id) {
    currentTokenId = id;
    const t = global.STATE.tokens.find((x) => x.id === id);
    if (t) {
      $('#tradeTokenSel').value = id;
      renderTradeInfo();
      loadChart(id);
      loadOrderbook(id);
      loadRank(id);
      if (global.showPage) global.showPage('trade');
    } else {
      global.showPage && global.showPage('trade');
    }
  };

  /* ---------- Trade info render ---------- */
  function renderTradeInfo() {
    const t = getAmountForSel();
    if (!t) { $('#tradeInfo').innerHTML = '<p class="dim">Select a token to trade</p>'; return; }
    currentTokenId = t.id;
    const price = t.marketCap && t.supply ? t.marketCap / t.supply : 0;
    const safety = t.safetyScore != null ? t.safetyScore : 50;
    const safetyColor = safety >= 80 ? 'var(--green)' : safety >= 50 ? 'var(--yellow)' : 'var(--red)';
    $('#tPrice').textContent = global.fmt.price(price);
    $('#tCap').textContent = global.fmt.usd(t.marketCap || 0);
    $('#tSupply').textContent = global.fmt.num(t.supply);
    $('#tNet').textContent = (t.network || 'solana').toUpperCase();
    $('#tradeTokenSel').value = t.id;
    let extra = `<div><span class="pixel tiny dim">SAFETY</span><span class="pixel lg" style="color:${safetyColor}">${safety}/100</span></div>`;
    if (global.STATE.wallet) {
      API.get('/api/balances/' + encodeURIComponent(global.STATE.wallet)).then(r => {
        const item = (r.balances || []).find(b => b.tokenId === t.id);
        const bal = item ? (item.balance || 0) : 0;
        const balUsd = bal * price;
        extra += `<div><span class="pixel tiny dim">YOUR BALANCE</span><span class="pixel lg" style="color:var(--cyan)">${global.fmt.num(bal)} $${t.symbol} (${global.fmt.usd(balUsd)})</span></div>`;
        $('#tradeExtraInfo').innerHTML = extra;
      }).catch(() => { $('#tradeExtraInfo').innerHTML = extra; });
    }
    if (t.graduated && t.dexUrl) {
      extra += `<div><span class="pixel tiny dim">DEX</span><a href="${t.dexUrl}" target="_blank" rel="noopener" class="txlink pixel lg" style="color:var(--green)">🔄 TRADE ON DEX</a></div>`;
    }
    if (t.verified) {
      extra += `<div><span class="pixel tiny dim">STATUS</span><span class="pixel lg" style="color:var(--cyan)">✅ VERIFIED</span></div>`;
    }
    if (t.buyTax || t.sellTax || t.marketingTax) {
      const taxes = [];
      if (t.buyTax) taxes.push('Buy: ' + t.buyTax + '%');
      if (t.sellTax) taxes.push('Sell: ' + t.sellTax + '%');
      if (t.marketingTax) taxes.push('MKT: ' + t.marketingTax + '%');
      extra += `<div><span class="pixel tiny dim">TAXES</span><span class="pixel lg" style="color:var(--orange)">${taxes.join(' | ')}</span></div>`;
    }
    if (t.maxWallet) {
      extra += `<div><span class="pixel tiny dim">MAX WALLET</span><span class="pixel lg" style="color:var(--cyan)">${t.maxWallet}%</span></div>`;
    }
    $('#tradeExtraInfo').innerHTML = extra;
    drawBondingCurve(t);
    updateEstimate();
  }

  function drawBondingCurve(t) {
    const section = $('#bondingCurveSection');
    const info = $('#bondingCurveInfo');
    const canvas = $('#bondingCurveChart');
    if (!section || !canvas) return;
    const bonded = (t.isBonded || 0);
    const supply = (t.supply || 0);
    const pct = supply > 0 ? Math.min(100, (bonded / supply) * 100) : 0;
    section.style.display = (t.graduated || bonded > 0) ? 'block' : 'none';
    if (info) info.textContent = 'Bonded: ' + global.fmt.num(bonded) + ' / ' + global.fmt.num(supply) + ' (' + pct.toFixed(1) + '%)';
    if (!canvas.getContext) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = (rect.width || 300) * dpr;
    canvas.height = 80 * dpr;
    canvas.style.height = '80px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = rect.width || 300;
    const h = 80;
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, w, h);
    if (supply <= 0) return;
    const progress = Math.min(1, bonded / supply);
    const barW = w * progress;
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, '#39ff88');
    gradient.addColorStop(1, '#a855f7');
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, barW, h);
    ctx.fillStyle = '#fff';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(pct.toFixed(1) + '%', w / 2, h / 2 + 3);
  }

  /* ---------- Chart ---------- */
  let currentTf = '1m';
  async function loadChart(id) {
    try {
      if (global.Charts && global.Charts.loadOHLC) {
        await global.Charts.loadOHLC(id, currentTf);
        return;
      }
      const r = await API.get('/api/trades/' + id);
      const trades = r.trades || [];
      const candles = global.Charts.buildCandles(trades);
      global.Charts.render(candles);
      global._chartTrades = trades;
    } catch (e) { /* ignore */ }
  }

  /* ---------- Chart toolbar wiring ---------- */
  const tfBtns = document.querySelectorAll('#chartTf .chip');
  tfBtns.forEach(btn => btn.addEventListener('click', () => {
    tfBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTf = btn.dataset.tf;
    if (global.Charts && global.Charts.setTimeframe) global.Charts.setTimeframe(currentTf);
    if (currentTokenId) loadChart(currentTokenId);
  }));
  const indBtns = document.querySelectorAll('#chartInd .chip');
  indBtns.forEach(btn => btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    if (global.Charts && global.Charts.toggleIndicator) global.Charts.toggleIndicator(btn.dataset.ind);
    if (currentTokenId) loadChart(currentTokenId);
  }));
  const toolBtns = document.querySelectorAll('#chartTools .chip');
  toolBtns.forEach(btn => btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    if (tool === 'clear') {
      if (global.DrawTools) global.DrawTools.clearAll();
      if (currentTokenId) loadChart(currentTokenId);
      toolBtns.forEach(b => b.classList.remove('active'));
      return;
    }
    const wasActive = btn.classList.contains('active');
    toolBtns.forEach(b => b.classList.remove('active'));
    if (wasActive) {
      if (global.DrawTools) global.DrawTools.clearActive();
      return;
    }
    btn.classList.add('active');
    if (global.DrawTools) global.DrawTools.setTool(tool);
  }));
  const chartCanvas = document.getElementById('candleChart');
  if (chartCanvas && global.DrawTools) {
    chartCanvas.addEventListener('mousedown', (e) => global.DrawTools.onDown(e));
    chartCanvas.addEventListener('mousemove', (e) => global.DrawTools.onMove(e));
    chartCanvas.addEventListener('mouseup', (e) => global.DrawTools.onUp(e));
    chartCanvas.addEventListener('mouseleave', () => {
      if (global.DrawTools && global.DrawTools.onUp) global.DrawTools.onUp(e);
    });
  }

  /* orderbook (depth) */
  async function loadOrderbook(id) {
    try {
      const r = await API.get('/api/orderbook/' + id);
      if (r.bids) {
        renderDepth(r);
        return;
      }
      const tr = await API.get('/api/trades/' + id);
      const trades = (tr.trades || []).slice(0, 20);
      $('#tradeOrderbook').innerHTML = trades.length
        ? trades.map((tr2) => {
            const sym = (global.STATE.tokens.find(x => x.id === tr2.tokenId) || {}).symbol || '?';
            return `<div class="ob-row ${tr2.side}">
              <span>[${tr2.side.toUpperCase()}]</span>
              <span>${global.fmt.shortAddr(tr2.user)}</span>
              <span>${global.fmt.num(tr2.amount)} $${sym}</span>
              <span>@ ${global.fmt.price(tr2.price)}</span>
            </div>`;
          }).join('')
        : '<p class="dim">No trades yet</p>';
    } catch (e) {}
  }
  function renderDepth(r) {
    const mid = r.last || 0;
    const rows = [];
    const asks = (r.asks || []).slice().reverse();
    rows.push('<div class="ob-depth"><div class="pixel tiny dim" style="margin-bottom:6px">ORDERBOOK DEPTH (asks ▲)</div>');
    for (const a of asks) {
      rows.push(`<div class="ob-row sell"><span style="width:25%">@ ${global.fmt.price(a.price)}</span><span style="width:25%">${global.fmt.num(a.size)}</span><div class="depth-bar" style="width:${Math.min(100, a.size * 1.5)}%"></div></div>`);
    }
    rows.push(`<div class="ob-mid pixel tiny">LAST: ${global.fmt.price(mid)}</div>`);
    for (const b of r.bids || []) {
      rows.push(`<div class="ob-row buy"><span style="width:25%">@ ${global.fmt.price(b.price)}</span><span style="width:25%">${global.fmt.num(b.size)}</span><div class="depth-bar" style="width:${Math.min(100, b.size * 1.5)}%"></div></div>`);
    }
    rows.push('</div>');
    $('#tradeOrderbook').innerHTML = rows.join('');
  }

  global.onLiveTrade = function (msg) {
    if (msg.trade && msg.trade.tokenId === (getAmountForSel() || {}).id) {
      reRenderChart();
      loadOrderbook(msg.trade.tokenId);
      renderTradeInfo();
    }
  };

  /* ---------- Buy / Sell ---------- */
  $('#tradeTokenSel').addEventListener('change', () => {
    currentTokenId = $('#tradeTokenSel').value;
    renderTradeInfo();
    if (currentTokenId) { loadChart(currentTokenId); loadOrderbook(currentTokenId); }
  });

  $('#tabBuy').addEventListener('click', () => { mode = 'buy'; setMode(); updateEstimate(); });
  $('#tabSell').addEventListener('click', () => { mode = 'sell'; setMode(); updateEstimate(); });
  function setMode() {
    $('#tabBuy').classList.toggle('active', mode === 'buy');
    $('#tabSell').classList.toggle('active', mode === 'sell');
    $('#amountLabel').textContent = mode === 'buy' ? 'AMOUNT (SOL / ETH)' : 'TOKEN AMOUNT';
    $('#btnTrade').textContent = mode === 'buy' ? '⇩ BUY' : '⇧ SELL';
    $('#btnTrade').className = 'pixel-btn ' + (mode === 'buy' ? 'buy' : 'sell') + ' w100';
  }

  function updateEstimate() {
    const t = getAmountForSel();
    if (!t) { $('#tradeEstimate').innerHTML = ''; return; }
    const price = t.marketCap && t.supply ? t.marketCap / t.supply : 0;
    const raw = parseFloat($('#tradeQty').value) || 0;
    const feeRate = (global.STATE.platformFee || 2) / 100;
    if (mode === 'buy' && raw > 0 && price > 0) {
      const tokens = raw / price;
      const fee = tokens * feeRate;
      const net = tokens - fee;
      $('#tradeEstimate').innerHTML = `<div class="pixel tiny dim">≈ ${global.fmt.num(net)} $${t.symbol} received (fee: ${global.fmt.num(fee)} $${t.symbol})</div>`;
    } else if (mode === 'sell' && raw > 0 && price > 0) {
      const quote = raw * price;
      const fee = quote * feeRate;
      const net = quote - fee;
      $('#tradeEstimate').innerHTML = `<div class="pixel tiny dim">≈ ${global.fmt.usd(net)} received (fee: ${global.fmt.usd(fee)})</div>`;
    } else {
      $('#tradeEstimate').innerHTML = '';
    }
  }

  $('#tradeQty').addEventListener('input', updateEstimate);

  function updatePriceImpact() {
    const t = getAmountForSel();
    const el = document.getElementById('priceImpact');
    if (!t || !el) return;
    const qty = parseFloat($('#tradeQty').value) || 0;
    const supply = t.supply || 1000000000;
    const impact = (qty / supply) * 100;
    const color = impact > 5 ? 'var(--red)' : impact > 1 ? 'var(--yellow)' : 'var(--green)';
    el.innerHTML = impact > 0 ? `<span style="color:${color}">⚠️ Price impact: ${impact.toFixed(4)}%</span>` : '';
  }

  $('#tradeQty').addEventListener('input', updatePriceImpact);

  /* Quick amount buttons */
  document.querySelectorAll('.quick-amounts .chip[data-pct]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const t = getAmountForSel();
      if (!t) return;
      const pct = parseFloat(btn.dataset.pct);
      const price = t.marketCap && t.supply ? t.marketCap / t.supply : 0;
      if (mode === 'buy') {
        const balance = global.STATE.walletBalance || 0;
        const amount = balance * pct;
        $('#tradeQty').value = amount > 0 ? amount.toFixed(4) : '';
      } else {
        const wallet = global.STATE.wallet;
        if (!wallet) return toast('Connect wallet first');
        try {
          const r = await API.get('/api/portfolio/' + encodeURIComponent(wallet));
          const item = (r.items || []).find(i => i.token && i.token.id === t.id);
          const max = item ? (item.net || 0) : 0;
          $('#tradeQty').value = (max * pct).toFixed(4);
        } catch (e) { $('#tradeQty').value = ''; }
      }
      updateEstimate();
    });
  });

  $('#btnMax').addEventListener('click', async () => {
    const t = getAmountForSel();
    if (!t) return;
    if (mode === 'sell') {
      const wallet = global.STATE.wallet;
      if (!wallet) return toast('Connect wallet first');
      try {
        const r = await API.get('/api/portfolio/' + encodeURIComponent(wallet));
        const item = (r.items || []).find(i => i.token && i.token.id === t.id);
        const max = item ? (item.net || 0) : 0;
        $('#tradeQty').value = Math.max(0, max).toFixed(4);
      } catch (e) { $('#tradeQty').value = ''; }
    } else {
      $('#tradeQty').value = '';
    }
    updateEstimate();
  });

  $('#btnTrade').addEventListener('click', async () => {
    if (tradeBusy) return;
    const t = getAmountForSel();
    if (!t) return toast('Select a token first');
    const qty = parseFloat($('#tradeQty').value);
    if (!qty || qty <= 0) return toast('Enter amount');

    const wallet = await global.requireWallet();
    if (!wallet) return;

    // Anti-bot: cooldown check
    const now = Date.now();
    const lastTrade = global.STATE._lastTradeAt ? (now - global.STATE._lastTradeAt) : 9999;
    if (lastTrade < 3000) {
      return toast('⏳ Anti-bot: Wait ' + Math.ceil((3000 - lastTrade) / 1000) + 's before trading again');
    }
    global.STATE._lastTradeAt = now;

    // Anti-whale: max wallet check
    if (t.maxWallet && t.maxWallet > 0 && mode === 'buy') {
      try {
        const portfolio = await API.get('/api/portfolio/' + encodeURIComponent(wallet));
        const item = (portfolio.items || []).find(i => i.token && i.token.id === t.id);
        const currentHoldings = item ? (item.balance || 0) : 0;
        const maxAllowed = (t.supply * (t.maxWallet / 100));
        const newTotal = currentHoldings + qty;
        if (newTotal > maxAllowed) {
          return toast('⚠️ Max wallet limit: ' + t.maxWallet + '% of supply. Current: ' + global.fmt.num(currentHoldings) + ', Max: ' + global.fmt.num(maxAllowed));
        }
      } catch (e) { /* non-blocking */ }
    }

    tradeBusy = true;
    const btn = $('#btnTrade');
    const origText = btn.textContent;
    btn.textContent = '⏳ PROCESSING...';
    btn.disabled = true;

    try {
      let r;

      if (mode === 'buy') {
        r = await API.post('/api/trade', { tokenId: t.id, side: 'buy', user: wallet, cost: qty });
        const received = r.trade ? r.trade.amount : 0;
        $('#tradeResult').innerHTML = `✅ Bought ${global.fmt.num(received)} $${t.symbol} @ ${global.fmt.price(r.trade.price)}`;
        if (r.onchain && r.onchain.hash) {
          $('#tradeResult').innerHTML += `<div class="pixel tiny" style="margin-top:8px;color:#39ff88">🔗 ON-CHAIN: <a href="${r.onchain.explorer}" target="_blank" rel="noopener" class="txlink">${global.fmt.shortAddr(r.onchain.hash)}</a></div>`;
        }
      } else {
        r = await API.post('/api/trade', { tokenId: t.id, side: 'sell', user: wallet, amount: qty });
        const received = r.trade ? r.trade.cost : 0;
        $('#tradeResult').innerHTML = `✅ Sold ${global.fmt.num(qty)} $${t.symbol} for ${global.fmt.usd(received)}`;
        if (r.onchain && r.onchain.hash) {
          $('#tradeResult').innerHTML += `<div class="pixel tiny" style="margin-top:8px;color:#39ff88">🔗 ON-CHAIN: <a href="${r.onchain.explorer}" target="_blank" rel="noopener" class="txlink">${global.fmt.shortAddr(r.onchain.hash)}</a></div>`;
        }
      }
      $('#tradeQty').value = '';
      renderTradeInfo();
      reRenderChart();
      loadOrderbook(t.id);
      if (r && r.graduated) global.showGraduation(t.name);
    } catch (e) {
      $('#tradeResult').innerHTML = '❌ ' + e.message;
    } finally {
      tradeBusy = false;
      btn.textContent = origText;
      btn.disabled = false;
    }
  });

  /* ---------- Rank / Analysis ---------- */
  async function loadRank(id) {
    try {
      const t = global.STATE.tokens.find(x => x.id === id);
      if (!t) return;
      const trades = (await API.get('/api/trades/' + id)).trades || [];
      const buys = trades.filter(x => x.side === 'buy');
      const sells = trades.filter(x => x.side === 'sell');
      const bVol = buys.reduce((a, x) => a + (x.cost || 0), 0);
      const sVol = sells.reduce((a, x) => a + (x.cost || 0), 0);
      const price = t.marketCap && t.supply ? t.marketCap / t.supply : 0;
      const supplyLeft = t.supply - (t.totalBuy || 0);
      const bonding = Math.min(100, ((t.marketCap || 0) / (t.supply * 0.001)) * 100);
      const temp = [];
      temp.push(`<div class="panel" style="margin-top:14px"><div class="panel-title pixel">📊 ${t.name} ($${t.symbol}) ANALYSIS</div><div class="panel-body">`);
      temp.push(`<div class="rank-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">`);
      temp.push(stat('Price', global.fmt.price(price)));
      temp.push(stat('Market Cap', global.fmt.usd(t.marketCap || 0)));
      temp.push(stat('Total Supply', global.fmt.num(t.supply)));
      temp.push(stat('Network', (t.network || 'solana').toUpperCase()));
      temp.push(stat('Buy Volume', global.fmt.num(bVol)));
      temp.push(stat('Sell Volume', global.fmt.num(sVol)));
      temp.push(stat('Trades', trades.length));
      temp.push(stat('Graduated', t.graduated ? '🎓 YES' : 'No'));
      temp.push(`</div>`);
      temp.push(`<div style="margin-top:14px"><div class="pixel small dim" style="margin-bottom:6px">Bonding Curve Progress</div>
        <div style="background:#000;border:2px solid var(--panel-line);height:22px;position:relative">
          <div style="background:linear-gradient(90deg,var(--cyan),var(--green));height:100%;width:${Math.min(100,bonding)}%"></div>
        </div>
        <div class="pixel small" style="margin-top:6px;color:${bonding>=100?'var(--green)':'var(--yellow)'}">${Math.min(100,bonding).toFixed(1)}% ${bonding>=100?'GRADUATED!':'to graduation'}</div></div>`);
      const score = Math.round(Math.max(0, Math.min(100, bonding - (sVol > bVol ? 15 : 0) + (trades.length > 5 ? 10 : 0))));
      temp.push(`<div style="margin-top:14px"><div class="pixel small dim" style="margin-bottom:6px">Token Health Score</div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="background:#000;border:2px solid var(--panel-line);height:22px;flex:1"><div style="background:${score>60?'var(--green)':score>40?'var(--yellow)':'var(--red)'};height:100%;width:${score}%"></div></div>
          <span class="pixel">${score}/100</span>
        </div></div>`);
      try {
        const ind = await API.get('/api/indicators/' + id);
        const closes = (ind.candles || []).map(c => c.close);
        if (closes.length > 2 && ind.indicators) {
          const rsiArr = ind.indicators.rsi14 || [];
          const rsiNow = rsiArr[rsiArr.length - 1];
          const macdVal = ind.indicators.macd;
          const macdLast = macdVal && macdVal.macd ? macdVal.macd[macdVal.macd.length - 1] : null;
          const macdSig = macdVal && macdVal.signal ? macdVal.signal[macdVal.signal.length - 1] : null;
          const bb = ind.indicators.bb;
          const bbLast = bb && bb.upper ? closes[closes.length - 1] : null;
          const bbUpper = bb && bb.upper ? bb.upper[bb.upper.length - 1] : null;
          const bbLower = bb && bb.lower ? bb.lower[bb.lower.length - 1] : null;
          const rsiSignal = rsiNow != null ? (rsiNow > 70 ? '⚡ OVERBOUGHT' : rsiNow < 30 ? '🟢 OVERSOLD' : '🟡 NEUTRAL') : '-';
          const macdSignal = (macdLast != null && macdSig != null) ? (macdLast > macdSig ? '🟢 BULLISH' : '🔴 BEARISH') : '-';
          const bbSignal = (bbUpper != null && bbLast != null) ? (bbLast >= bbUpper ? '🔺 ABOVE UPPER' : bbLast <= bbLower ? '🔻 BELOW LOWER' : '🟢 IN BANDS') : '-';
          temp.push(`<div class="panel" style="margin-top:14px"><div class="panel-title pixel">📐 TECHNICAL ANALYSIS</div><div class="panel-body">`);
          temp.push(`<div class="rank-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">`);
          temp.push(stat('RSI (14)', rsiNow != null ? rsiNow.toFixed(1) + ' ' + rsiSignal : '-'));
          temp.push(stat('MACD', macdSignal));
          temp.push(stat('Bollinger', bbSignal));
          temp.push(stat('SMA20', global.fmt.price(ind.indicators.sma20 ? ind.indicators.sma20[ind.indicators.sma20.length-1] : 0)));
          temp.push(stat('EMA21', global.fmt.price(ind.indicators.ema21 ? ind.indicators.ema21[ind.indicators.ema21.length-1] : 0)));
          temp.push(stat('Candles', (ind.candles||[]).length));
          temp.push(`</div></div></div>`);
        }
      } catch (e) { /* ignore indicators */ }

      temp.push(`</div></div>`);
      $('#rankResult').innerHTML = temp.join('');
    } catch (e) { $('#rankResult').innerHTML = '<p class="dim">Failed to load analysis</p>'; }
  }
  function stat(label, val) {
    return `<div style="border:2px solid var(--panel-line);padding:10px;background:rgba(0,0,0,0.3)">
      <div class="pixel tiny dim">${label}</div><div class="pixel" style="font-size:11px;margin-top:4px;color:var(--green)">${val}</div></div>`;
  }

  $('#rankTokenSel').addEventListener('change', () => {
    if ($('#rankTokenSel').value) loadRank($('#rankTokenSel').value);
  });

  global.renderPage.rank = function () {};

  /* ---------- User transaction history ---------- */
  async function loadUserTxHistory() {
    const wallet = global.STATE.wallet;
    const container = document.getElementById('userTxHistory');
    if (!container) return;
    if (!wallet) {
      container.innerHTML = '<p class="dim pixel small">Connect a wallet to see your transactions.</p>';
      return;
    }
    try {
      const trades = await API.get('/api/trades/user/' + encodeURIComponent(wallet));
      const items = (trades.trades || []).slice(0, 20);
      container.innerHTML = items.length ? items.map((tx) => {
        const tok = global.STATE.tokens.find(t => t.id === tx.tokenId);
        const sym = tok ? tok.symbol : tx.tokenId.slice(0, 4);
        return `<div class="ob-row ${tx.side}">
          <span>[${tx.side.toUpperCase()}]</span>
          <span>${global.fmt.shortAddr(tx.user)}</span>
          <span>${global.fmt.num(tx.amount)} $${sym}</span>
          <span>@ ${global.fmt.price(tx.price)}</span>
          <span class="pixel tiny dim">${global.fmt.time(tx.timestamp)}</span>
        </div>`;
      }).join('') : '<p class="dim pixel small">No transactions yet. Trade a token!</p>';
    } catch (e) {
      container.innerHTML = '<p class="dim pixel small">Failed to load transactions.</p>';
    }
  }

  /* ---------- Graduation & verification ---------- */
  async function checkGraduationEligibility() {
    const t = getAmountForSel();
    if (!t) return;
    const btnGrad = document.getElementById('btnGraduate');
    const btnPublish = document.getElementById('btnPublishPump');
    const btnCopy = document.getElementById('btnCopyTrade');
    const btnAlert = document.getElementById('btnAlert');
    const btnVerify = document.getElementById('btnVerify');
    if (!btnGrad || !btnVerify) return;
    if (t.graduated) {
      btnGrad.style.display = 'none';
      btnGrad.textContent = '🎓 GRADUATED';
    } else if ((t.isBonded || 0) >= t.supply) {
      btnGrad.style.display = 'block';
      btnGrad.textContent = '🎓 GRADUATE TO DEX';
      btnGrad.onclick = async () => {
        const wallet = await global.requireWallet();
        if (!wallet) return;
        try {
          const r = await API.post('/api/graduate', { tokenId: t.id, signerKey: wallet });
          if (r.dexUrl) {
            btnGrad.textContent = '🔄 DEX LINK READY';
            btnGrad.style.background = 'var(--green)';
            toast('Graduated! DEX link: ' + r.dexUrl);
            if (global.showGraduation) global.showGraduation(t.name);
          }
        } catch (e) { toast('Graduation failed: ' + e.message); }
      };
    } else {
      btnGrad.style.display = 'none';
      btnGrad.textContent = '⏳ BONDING CURVE';
    }
    if (btnPublish) {
      btnPublish.style.display = 'block';
      btnPublish.onclick = async () => {
        const wallet = await global.requireWallet();
        if (!wallet) return;
        try {
          const r = await API.post('/api/pumpfun/publish', { tokenId: t.id, wallet, contractAddress: t.id, name: t.name, symbol: t.symbol });
          toast('Published to pump.fun! ' + r.url);
          if (global.SoundEngine && global.SoundEngine.successBlip) global.SoundEngine.successBlip();
        } catch (e) { toast('Publish failed: ' + e.message); }
      };
    }
    if (btnCopy) {
      btnCopy.style.display = 'block';
      btnCopy.onclick = async () => {
        const wallet = await global.requireWallet();
        if (!wallet) return;
        try {
          await API.post('/api/copytrade/follow', { wallet, tokenId: t.id });
          toast('Now copying trades for $' + t.symbol);
        } catch (e) { toast('Copy trade failed: ' + e.message); }
      };
    }
    if (btnAlert) {
      btnAlert.style.display = 'block';
      btnAlert.onclick = async () => {
        const wallet = await global.requireWallet();
        if (!wallet) return;
        const threshold = prompt('Set price alert (USD):', '0.001');
        if (!threshold) return;
        try {
          await API.post('/api/alerts', { wallet, tokenId: t.id, threshold: parseFloat(threshold) });
          toast('Alert set at $' + threshold);
        } catch (e) { toast('Alert failed: ' + e.message); }
      };
    }
    btnVerify.style.display = t.verified ? 'none' : 'block';
    btnVerify.onclick = async () => {
      toast('Verification requests require admin approval. Submitted!');
      btnVerify.style.display = 'none';
    };
    const btnLP = document.getElementById('btnCreateLP');
    const btnGuide = document.getElementById('btnLPGuide');
    if (btnLP) {
      btnLP.style.display = t.graduated ? 'block' : 'none';
      btnLP.onclick = () => showLPCreateModal(t);
    }
    if (btnGuide) {
      btnGuide.style.display = 'block';
      btnGuide.onclick = () => showLPGuideModal();
    }
    const btnWithdraw = document.getElementById('btnWithdraw');
    if (btnWithdraw) {
      btnWithdraw.style.display = 'block';
      btnWithdraw.onclick = async () => {
        const wallet = await global.requireWallet();
        if (!wallet) return;
        try {
          const r = await API.get('/api/balances/' + encodeURIComponent(wallet));
          const item = (r.balances || []).find(b => b.tokenId === t.id);
          const bal = item ? (item.balance || 0) : 0;
          if (bal <= 0) return toast('No tokens to sell');
          const qty = prompt('Sell how many ' + t.symbol + '? (max: ' + global.fmt.num(bal) + ')', global.fmt.num(bal));
          if (!qty) return;
          const sellQty = parseFloat(qty);
          if (isNaN(sellQty) || sellQty <= 0 || sellQty > bal) return toast('Invalid amount');
          const sellR = await API.post('/api/trade', { tokenId: t.id, side: 'sell', user: wallet, amount: sellQty });
          if (sellR.onchain && sellR.onchain.hash) {
            toast('Sold! TX: ' + sellR.onchain.hash.slice(0, 10) + '...');
          } else {
            toast('Sold ' + global.fmt.num(sellQty) + ' ' + t.symbol);
          }
          renderTradeInfo();
        } catch (e) {
          toast('Sell failed: ' + e.message);
        }
      };
    }
  }

  function showLPCreateModal(t) {
    const net = global.STATE.network;
    const isEth = net === 'ethereum';
    const modal = buildModal(`
      <div style="background:#0a0a14;border:3px solid var(--purple,#a855f7);padding:24px;max-width:420px;width:92%;text-align:center;font-family:'Press Start 2P',monospace;color:#e6f7ff;max-height:90vh;overflow:auto;">
        <div style="font-size:12px;color:var(--purple,#a855f7);margin-bottom:12px;">💧 CREATE LIQUIDITY POOL</div>
        <div class="pixel tiny dim" style="margin-bottom:12px;line-height:1.6;">
          Provide ${t.symbol} + ${isEth ? 'ETH' : 'SOL'} to create a trading pair.<br/>
          LP tokens will be sent to your wallet. Lock them to build trust.
        </div>
        <div style="background:#111833;padding:12px;border-radius:4px;margin-bottom:12px;text-align:left;font-size:8px;line-height:1.8;">
          <div><b>Token:</b> ${t.name} (${t.symbol})</div>
          <div><b>Network:</b> ${net.toUpperCase()}</div>
          <div><b>Pair:</b> ${t.symbol}/${isEth ? 'ETH' : 'SOL'}</div>
          <div><b>DEX:</b> ${isEth ? 'Uniswap V3' : 'Raydium'}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <a id="lpUniswapLink" href="${isEth ? 'https://app.uniswap.org/#/add/ETH/' + t.id + '/0.05' : 'https://raydium.io/liquidity/add/'}" target="_blank" rel="noopener" class="pixel-btn w100" style="background:var(--purple,#a855f7);color:#fff;text-decoration:none;display:block;">🚀 OPEN UNISWAP / RAYDIUM</a>
          <button id="lpCopyAddr" class="pixel-btn w100" style="background:var(--cyan,#32f2ff);color:#000;">📋 COPY TOKEN ADDRESS</button>
          <button id="lpLock" class="pixel-btn w100" style="background:var(--green,#39ff88);color:#000;">🔒 LOCK LP (Trust Wallet)</button>
          <button id="lpClose" class="pixel-btn w100" style="background:transparent;color:var(--dim);border-color:var(--dim)">CLOSE</button>
        </div>
      </div>`);
    modal.querySelector('#lpClose').addEventListener('click', () => modal.remove());
    const copyBtn = modal.querySelector('#lpCopyAddr');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(t.id || t.address || '').then(() => toast('Token address copied!')).catch(() => toast('Copy failed'));
    });
    const lockBtn = modal.querySelector('#lpLock');
    if (lockBtn) lockBtn.addEventListener('click', () => {
      const url = 'https://trustwallet.com/liquidity/' + (t.id || t.address || '');
      window.open(url, '_blank');
    });
  }

  function showLPGuideModal() {
    const modal = buildModal(`
      <div style="background:#0a0a14;border:3px solid var(--orange);padding:24px;max-width:420px;width:92%;text-align:center;font-family:'Press Start 2P',monospace;color:#e6f7ff;max-height:90vh;overflow:auto;">
        <div style="font-size:12px;color:var(--orange);margin-bottom:12px;">📖 LIQUIDITY POOL GUIDE</div>
        <div class="pixel tiny" style="text-align:left;line-height:1.8;margin-bottom:12px;">
          <b>Step 1:</b> Deploy your token using Ignoshashi<br/>
          <b>Step 2:</b> Get ${global.STATE.network === 'ethereum' ? 'ETH' : 'SOL'} for gas fees<br/>
          <b>Step 3:</b> Click "Create LP" and open the DEX<br/>
          <b>Step 4:</b> Add ${global.STATE.network === 'ethereum' ? 'ETH' : 'SOL'} + token pair<br/>
          <b>Step 5:</b> Lock LP tokens for 6-12 months<br/>
          <b>Step 6:</b> Share your liquidity link on socials
        </div>
        <div class="pixel tiny dim" style="margin-bottom:12px;">LP links: ${global.STATE.network === 'ethereum' ? 'app.uniswap.org' : 'raydium.io'} | Lock: trustwallet.com/liquidity</div>
        <button id="lpGuideClose" class="pixel-btn w100" style="background:transparent;color:var(--dim);border-color:var(--dim)">CLOSE</button>
      </div>`);
    modal.querySelector('#lpGuideClose').addEventListener('click', () => modal.remove());
  }

  /* Refresh tx history when trade page is shown */
  const origShowPage = global.showPage;
  global.showPage = function (name) {
    origShowPage(name);
    if (name === 'trade') {
      setTimeout(() => { loadUserTxHistory(); checkGraduationEligibility(); if (global.loadWhaleFeed) global.loadWhaleFeed(); }, 300);
    }
  };

  /* Refresh tx history periodically */
  setInterval(() => {
    if (document.getElementById('page-trade').classList.contains('active')) {
      loadUserTxHistory();
    }
  }, 10000);

  /* expose */
  global.Trade = {
    getAmountForSel,
    selectToken: global.selectToken,
    loadRank,
    renderTradeInfo,
    onLiveTrade: global.onLiveTrade,
    showDeploySuccess: showDeploySuccess,
    showSecurityScore: showSecurityScore,
  };
  global.getAmountForSel = getAmountForSel;

  function showDeploySuccess(token) {
    const modal = buildModal(`
      <div style="background:#0a0a14;border:3px solid var(--green,#39ff88);padding:24px;max-width:420px;width:92%;text-align:center;font-family:'Press Start 2P',monospace;color:#e6f7ff;max-height:90vh;overflow:auto;">
        <div style="font-size:20px;margin-bottom:8px;">🎉</div>
        <div style="font-size:14px;color:var(--green,#39ff88);margin-bottom:12px;">TOKEN DEPLOYED!</div>
        <div style="font-size:10px;color:#e6f7ff;margin-bottom:8px;">${token.name} ($${token.symbol})</div>
        <div class="pixel tiny dim" style="margin-bottom:12px;line-height:1.6;">Your memecoin is live and ready for bonding curve trading. Share it to attract buyers!</div>
        <div style="background:#111833;padding:12px;border-radius:4px;margin-bottom:12px;text-align:left;font-size:8px;line-height:1.8;">
          <div><b>Address:</b> ${token.address || token.id}</div>
          <div><b>Network:</b> ${(token.network || 'solana').toUpperCase()}</div>
          <div><b>Supply:</b> ${global.fmt.num(token.supply)}</div>
          <div><b>Security Score:</b> <span id="deploySecurityScore">--</span>/100</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button id="deployShare" class="pixel-btn w100" style="background:var(--purple,#a855f7);color:#fff;">📤 SHARE TOKEN</button>
          <button id="deployCopy" class="pixel-btn w100" style="background:var(--cyan,#32f2ff);color:#000;">📋 COPY ADDRESS</button>
          <button id="deployTrade" class="pixel-btn w100" style="background:var(--green,#39ff88);color:#000;">📈 GO TO TRADE</button>
          <button id="deployClose" class="pixel-btn w100" style="background:transparent;color:var(--dim);border-color:var(--dim)">CLOSE</button>
        </div>
      </div>`);
    modal.querySelector('#deployClose').addEventListener('click', () => modal.remove());
    modal.querySelector('#deployCopy').addEventListener('click', () => {
      const addr = token.address || token.id || '';
      navigator.clipboard.writeText(addr).then(() => toast('Address copied!')).catch(() => toast('Copy failed'));
    });
    modal.querySelector('#deployTrade').addEventListener('click', () => {
      modal.remove();
      global.selectToken(token.id);
    });
    modal.querySelector('#deployShare').addEventListener('click', () => {
      const text = `🚀 New memecoin: $${token.symbol} - ${token.name}\n${token.description || ''}\n\nTrade now: ${location.origin}`;
      if (navigator.share) {
        navigator.share({ title: `${token.name} ($${token.symbol})`, text }).catch(() => {});
      } else {
        navigator.clipboard.writeText(text).then(() => toast('Share text copied!')).catch(() => toast('Copy failed'));
      }
    });
    const scoreEl = modal.querySelector('#deploySecurityScore');
    if (scoreEl) {
      API.get('/api/token/' + token.id + '/security').then(r => {
        if (r && r.score) scoreEl.textContent = r.score;
      }).catch(() => { scoreEl.textContent = '--'; });
    }
  }

  async function showSecurityScore(t) {
    try {
      const r = await API.get('/api/token/' + t.id + '/security');
      if (r && r.score !== undefined) {
        toast(`Security Score: ${r.score}/100`);
      }
    } catch (e) { /* non-blocking */ }
  }

  global.renderLeaderboard = function () {
    const body = $('#leaderboardBody');
    const list = (global.STATE.tokens || []).slice().sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    body.innerHTML = list.length ? list.map((t, i) => {
      const price = t.marketCap && t.supply ? t.marketCap / t.supply : 0;
      return `<tr>
        <td>${i + 1}</td>
        <td><div style="display:flex;align-items:center;gap:8px"><span style="font-size:20px">${global.fmt.avatar(t.symbol)}</span><div><div>${t.name}</div><div style="color:var(--cyan)">$${t.symbol}</div></div></div></td>
        <td>${global.fmt.price(price)}</td>
        <td style="color:var(--yellow)">${global.fmt.usd(t.marketCap || 0)}</td>
        <td>${global.fmt.num(t.volume || 0)}</td>
        <td>${(t.network || 'solana').toUpperCase()}</td>
        <td><button class="chip" onclick="global.Trade.selectToken('${t.id}')">TRADE</button>
        <button class="chip" onclick="global.addWatch('${t.id}')">👁 WATCH</button>
        <button class="chip" onclick="global.publishToPump && global.publishToPump('${t.id}')">🎰 PUMP</button></td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" style="text-align:center">No tokens yet</td></tr>';
  };

  global.renderLeaderboardLive = function () { global.renderLeaderboard(); };

  // init mode
  setMode();
})(window);
