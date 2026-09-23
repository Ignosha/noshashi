/* IGNOSHASHI - Memecoin Analytics (bonding curve, trending, creator rewards) */
(function (global) {
  'use strict';
  const $ = global.$;

  function drawBondingCurve(token) {
    const canvas = document.getElementById('bondingChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    if (!token) {
      ctx.fillStyle = '#7a7aa8';
      ctx.font = '14px VT323';
      ctx.textAlign = 'center';
      ctx.fillText('SELECT A TOKEN TO VIEW BONDING CURVE', w / 2, h / 2);
      return;
    }

    const supply = token.supply || 1000000000;
    const mcap = token.marketCap || 0;
    const price = mcap / supply;
    const progress = Math.min(100, (mcap / (supply * 0.001)) * 100);

    ctx.strokeStyle = '#32f2ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const x = (i / 100) * w;
      const y = h - (i / 100) * (h - 40) - 20;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#37ff8b';
    ctx.beginPath();
    const px = (progress / 100) * w;
    const py = h - (progress / 100) * (h - 40) - 20;
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffd42b';
    ctx.font = '12px VT323';
    ctx.textAlign = 'left';
    ctx.fillText('PRICE: $' + global.fmt.price(price), 10, 20);
    ctx.fillText('MCAP: ' + global.fmt.usd(mcap), 10, 35);
    ctx.fillText('PROGRESS: ' + progress.toFixed(1) + '%', 10, 50);
  }

  function renderTrendingScore() {
    const container = document.getElementById('trendingScore');
    if (!container) return;
    const tokens = (global.STATE.tokens || []).slice().sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 10);
    container.innerHTML = tokens.map((t, i) => {
      const score = Math.min(100, ((t.marketCap || 0) / 100000) + (t.volume || 0) / 10000 + i * 5);
      const barWidth = Math.min(100, score);
      return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span class="pixel" style="width:30px;color:var(--yellow)">${i + 1}</span>
        <div class="token-avatar">${global.fmt.avatar(t.symbol)}</div>
        <div style="flex:1">
          <div class="pixel small">${t.name}</div>
          <div style="background:#000;border:2px solid var(--panel-line);height:8px;margin-top:4px">
            <div style="background:linear-gradient(90deg,var(--cyan),var(--green));height:100%;width:${barWidth}%"></div>
          </div>
        </div>
        <span class="pixel" style="color:var(--green)">${score.toFixed(0)}</span>
      </div>`;
    }).join('');
  }

  function renderCreatorRewards() {
    const container = document.getElementById('creatorRewards');
    if (!container) return;
    const wallet = global.STATE.wallet;
    if (!wallet) {
      container.innerHTML = '<p class="dim pixel small">Connect wallet to view creator rewards</p>';
      return;
    }
    const tokens = (global.STATE.tokens || []).filter(t => t.creator === wallet);
    const totalEarned = tokens.reduce((a, t) => a + (t.creatorEarnings || 0), 0);
    container.innerHTML = `
      <div class="pf-summary" style="margin-bottom:14px">
        <div class="pf-block"><span class="pixel tiny dim">YOUR TOKENS</span><span class="pixel sm">${tokens.length}</span></div>
        <div class="pf-block"><span class="pixel tiny dim">TOTAL EARNED</span><span class="pixel sm accent">${global.fmt.usd(totalEarned)}</span></div>
      </div>
      ${tokens.length ? tokens.map(t => `
        <div class="token-row">
          <div class="token-avatar">${global.fmt.avatar(t.symbol)}</div>
          <div class="token-info">
            <div class="token-name">${t.name}</div>
            <div class="token-sym">$${t.symbol}</div>
          </div>
          <div class="token-stat">
            <div class="token-cap" style="color:var(--green)">EARNED: ${global.fmt.usd(t.creatorEarnings || 0)}</div>
          </div>
        </div>
      `).join('') : '<p class="dim pixel small">No tokens created yet</p>'}
    `;
  }

  global.renderMemecoin = function () {
    const t = global.getAmountForSel ? global.getAmountForSel() : null;
    drawBondingCurve(t);
    renderTrendingScore();
    renderCreatorRewards();
  };

  global.renderPage = global.renderPage || {};
  global.renderPage.memecoin = global.renderMemecoin;
})(window);