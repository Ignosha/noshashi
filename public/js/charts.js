/* IGNOSHASHI - Advanced pixel candlestick chart engine
 * Supports: multi-timeframe OHLC, crosshair readout, indicator overlays,
 * drawing tools (via DrawTools), and oracle source labeling.
 */
(function (global) {
  'use strict';

  const canvas = document.getElementById('candleChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let currentTf = '1m';
  let activeIndicators = []; // array of indicator ids
  let currentCandles = [];
  let currentOracle = 'internal';

  /* Build candles from trades (legacy API) */
  function buildCandles(trades) {
    const candles = [];
    if (!trades || !trades.length) return candles;
    const sorted = trades.slice().sort((a, b) => b.timestamp - a.timestamp);
    const span = (sorted[0].timestamp - sorted[sorted.length - 1].timestamp) / 40 || 60000;
    const buckets = new Map();
    for (const t of sorted) {
      const b = Math.floor(t.timestamp / span) * span;
      if (!buckets.has(b)) buckets.set(b, { time: b, open: t.price, high: t.price, low: t.price, close: t.price, vol: t.cost || 0 });
      else { const c = buckets.get(b); c.high = Math.max(c.high, t.price); c.low = Math.min(c.low, t.price); c.close = t.price; c.vol += t.cost || 0; }
    }
    const keys = Array.from(buckets.keys()).sort((a, b) => a - b);
    while (keys.length < 12 && keys.length) { keys.unshift(keys[0] - span); const ref = buckets.get(keys[1]); buckets.set(keys[0], { ...ref }); }
    keys.forEach(k => candles.push(buckets.get(k)));
    return candles;
  }

  /* Fetch OHLC from server at timeframe */
  async function loadOHLC(id, tf) {
    try {
      const r = await API.get('/api/ohlc/' + id + '?timeframe=' + (tf || currentTf));
      if (r.candles) {
        currentCandles = r.candles;
        currentOracle = r.oracle || 'internal';
        if (r.source) currentOracle = r.source === 'live' ? ('LIVE ' + (r.oracle || 'ORACLE')) : 'INTERNAL';
        $('#chartOracle').textContent = (r.oracle === 'binance' ? '🌐 LIVE ORACLE: Binance' : '🔒 INTERNAL BONDING CURVE');
        render(r.candles);
      }
    } catch (e) { /* ignore */ }
  }

  /* Render candles with overlays + drawings */
  function render(candles) {
    const W = canvas.width = canvas.clientWidth || 700;
    const H = canvas.height = canvas.clientHeight || 320;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05050d';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;

    if (!candles || candles.length < 2) {
      ctx.fillStyle = '#7a7aa8';
      ctx.font = '16px VT323';
      ctx.textAlign = 'center';
      ctx.fillText('NO DATA YET — TRADE OR CONNECT TO LIVE ORACLE', W / 2, H / 2);
      return;
    }

    const padT = 26, padB = 30, padL = 60, padR = 16;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    let min = Infinity, max = -Infinity, maxVol = 0;
    for (const c of candles) {
      min = Math.min(min, c.low, c.open, c.close);
      max = Math.max(max, c.high, c.open, c.close);
      maxVol = Math.max(maxVol, c.vol || 0);
    }
    if (min === max) { min = min * 0.9; max = max * 1.1; }

    // include active indicator values in y-range
    const closes = candles.map(c => c.close);
    if (activeIndicators.includes('sma')) applyMinMax(smaVals(closes, 20), () => {});
    function applyMinMax(arr) { (arr || []).forEach(v => { if (v != null) { min = Math.min(min, v); max = Math.max(max, v); } }); }
    if (activeIndicators.includes('ema')) applyMinMax(emaVals(closes, 21));
    if (activeIndicators.includes('bb')) {
      const bb = bbVals(closes, 20);
      applyMinMax(bb.upper); applyMinMax(bb.lower);
    }

    const y = (p) => padT + chartH - ((p - min) / (max - min)) * chartH;
    const n = candles.length;
    const slot = chartW / n;
    const wick = Math.min(slot * 0.45, 4);

    // grid
    ctx.strokeStyle = 'rgba(122,122,168,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const yy = padT + (chartH / 5) * i;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
      ctx.fillStyle = '#7a7aa8'; ctx.font = '11px VT323'; ctx.textAlign = 'right';
      const price = max - ((max - min) / 5) * i;
      ctx.fillText(global.fmt ? global.fmt.price(price) : price.toFixed(6), padL - 6, yy + 4);
    }

    // volume bars (bottom 18%)
    const volH = chartH * 0.16;
    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const x = padL + i * slot + slot / 2;
      if (!maxVol) break;
      const vh = (c.vol / maxVol) * volH;
      ctx.fillStyle = c.close >= c.open ? 'rgba(55,255,139,0.3)' : 'rgba(255,77,109,0.3)';
      ctx.fillRect(x - wick, H - padB - vh, wick * 2, vh);
    }

    // candles
    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const x = padL + i * slot + slot / 2;
      const up = c.close >= c.open;
      ctx.strokeStyle = ctx.fillStyle = up ? '#37ff8b' : '#ff4d6d';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y(c.high)); ctx.lineTo(x, y(c.low)); ctx.stroke();
      const yO = y(c.open), yC = y(c.close);
      const bodyTop = Math.min(yO, yC);
      const bodyH = Math.max(Math.abs(yC - yO) || 4, 3);
      ctx.fillRect(x - wick, bodyTop, wick * 2, bodyH);
    }

    // indicator overlays
    if (activeIndicators.includes('sma')) drawLine(smaVals(closes, 20), y, '#ffe14d', n, padL, slot);
    if (activeIndicators.includes('ema')) drawLine(emaVals(closes, 21), y, '#32f2ff', n, padL, slot);
    if (activeIndicators.includes('bb')) {
      const bb = bbVals(closes, 20);
      drawRegion(bb.upper, bb.lower, y, n, padL, slot, 'rgba(50,242,255,0.08)');
      drawLine(bb.mid, y, '#b46bff', n, padL, slot);
    }
    if (activeIndicators.includes('rsi')) drawSub(chartBottom(H, padB), rsiVals(closes), y, n, min, max, padL, slot, H, padB);
    if (activeIndicators.includes('macd')) drawMacdSub(H, padB, closes, n, padL, slot);

    function smaVals(v, nn) { return global.Indicators ? global.Indicators.sma(v, nn) : null; }
    function emaVals(v, nn) { return global.Indicators ? global.Indicators.ema(v, nn) : null; }
    function rsiVals(v) { return global.Indicators ? global.Indicators.rsi(v, 14) : null; }
    function bbVals(v, nn) { return global.Indicators ? global.Indicators.bollinger(v, nn) : null; }

    function drawLine(arr, yy, color, nn, pl, sl) {
      if (!arr) return;
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < nn; i++) {
        const v = arr[i]; if (v == null) continue;
        const x = pl + i * sl + sl / 2;
        if (!i) ctx.moveTo(x, yy(v)); else ctx.lineTo(x, yy(v));
      }
      ctx.stroke();
    }
    function drawRegion(upper, lower, yy, nn, pl, sl, color) {
      if (!upper) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < nn; i++) { const v = upper[i]; if (v == null) continue; const x = pl + i * sl + sl / 2; if (!i) ctx.moveTo(x, yy(v)); else ctx.lineTo(x, yy(v)); }
      for (let i = nn - 1; i >= 0; i--) { const v = lower && lower[i]; if (v == null) continue; const x = pl + i * sl + sl / 2; ctx.lineTo(x, yy(v)); }
      ctx.closePath(); ctx.fill();
    }
    function chartBottom(gH, gB) { return gH - gB; }

    // labels / live price
    ctx.fillStyle = '#32f2ff';
    ctx.font = '12px VT323';
    ctx.textAlign = 'right';
    const last = candles[n - 1].close;
    ctx.fillText('◄ LIVE ' + (global.fmt ? global.fmt.price(last) : last.toFixed(6)), W - padR, H - 8);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7a7aa8';
    ctx.fillText(currentTf.toUpperCase(), padL, padT - 8);

    // register scale for DrawTools
    if (global.DrawTools) {
      global.DrawTools.setScale({ y, padL, padT });
      global.DrawTools.setCanvas(canvas);
      global.DrawTools.redraw();
    }
  }

  /* Crosshair readout on mousemove */
  let rr;
  function bindCrosshair() {
    if (!canvas) return;
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const readout = document.getElementById('chartReadout');
      if (!readout || !currentCandles.length) return;
      const padL = 60, slot = (canvas.width - 76) / currentCandles.length;
      const idx = Math.min(currentCandles.length - 1, Math.max(0, Math.floor((mx - padL) / slot)));
      const c = currentCandles[idx];
      if (!c) return;
      readout.textContent = `O:${global.fmt.price(c.open)} H:${global.fmt.price(c.high)} L:${global.fmt.price(c.low)} C:${global.fmt.price(c.close)} VOL:${global.fmt.num(c.vol)}`;
    });
  }
  bindCrosshair();

  /* RSI sub-panel */
  function drawSub(topY, arr, yy, n, min, max, padL, slot, H, padB) {
    if (!arr) return;
    // draw a small sub-panel at bottom for RSI 0-100
    const subH = 40;
    const sy = (v) => H - padB - subH + (100 - v) * (subH / 100);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(padL, H - padB - subH, (canvas ? canvas.width : 700) - padL - 16, subH);
    ctx.strokeStyle = '#765';
    ctx.beginPath();
    for (let i = 0; i < n && i < arr.length; i++) {
      const v = arr[i]; if (v == null) continue;
      const x = padL + i * slot + slot / 2;
      if (!i) ctx.moveTo(x, sy(v)); else ctx.lineTo(x, sy(v));
    }
    ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ff4d6d'; ctx.font = '10px VT323'; ctx.textAlign = 'left';
    ctx.fillText('RSI ' + (arr[arr.length - 1] != null ? arr[arr.length - 1].toFixed(1) : '-'), padL + 2, H - padB - subH - 4);
  }

  function drawMacdSub(H, padB, closes, n, padL, slot) {
    const m = global.Indicators && global.Indicators.macd(closes);
    if (!m) return;
    const subH = 46;
    const vals = m.hist.map((v) => v || 0);
    const mx = Math.max.apply(null, vals.map(Math.abs)) || 1;
    const cy0 = H - padB - subH / 2;
    const sy = (v) => cy0 - (v / mx) * (subH / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(padL, cy0 - subH / 2, (canvas ? canvas.width : 700) - padL - 16, subH);
    ctx.strokeStyle = '#558';
    ctx.beginPath(); ctx.moveTo(padL, cy0); ctx.lineTo((canvas ? canvas.width : 700) - 16, cy0); ctx.stroke();
    for (let i = 0; i < n && i < m.hist.length; i++) {
      const x = padL + i * slot + slot / 2;
      ctx.fillStyle = m.hist[i] >= 0 ? '#37ff8b' : '#ff4d6d';
      const vh = (m.hist[i] || 0) / mx * (subH / 2);
      ctx.fillRect(x - slot / 3, (m.hist[i] >= 0 ? cy0 - vh : cy0), slot / 1.5, Math.abs(vh) || 1);
    }
    ctx.fillStyle = '#32f2ff'; ctx.font = '10px VT323'; ctx.textAlign = 'left';
    ctx.fillText('MACD', padL + 2, cy0 - subH / 2 - 4);
  }

  /* Indicator toggle */
  function toggleIndicator(id) {
    const i = activeIndicators.indexOf(id);
    if (i >= 0) activeIndicators.splice(i, 1);
    else activeIndicators.push(id);
  }

  /* Public API */
  global.Charts = {
    buildCandles,
    render,
    loadOHLC,
    setTimeframe(tf) { currentTf = tf; },
    getTimeframe: () => currentTf,
    toggleIndicator,
    getIndicators: () => activeIndicators.slice(),
    setCandles(c) { currentCandles = c; },
    getCandles: () => currentCandles,
  };

  global.renderPage = global.renderPage || {};
  global.renderPage.rank = global.renderPage.rank || (() => {});
})(window);
