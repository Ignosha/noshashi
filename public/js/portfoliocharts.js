/* IGNOSHASHI - Portfolio performance chart */
(function (global) {
  'use strict';
  const $ = global.$;

  function drawPortfolioChart(wallet) {
    const canvas = document.getElementById('portfolioChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth || 600;
    const h = canvas.height = 280;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (!wallet) {
      ctx.fillStyle = '#7a7aa8';
      ctx.font = '14px VT323';
      ctx.textAlign = 'center';
      ctx.fillText('CONNECT WALLET TO VIEW PORTFOLIO CHART', w / 2, h / 2);
      return;
    }
    const items = (global.STATE.portfolio || []).slice();
    if (!items.length) {
      ctx.fillStyle = '#7a7aa8';
      ctx.font = '14px VT323';
      ctx.textAlign = 'center';
      ctx.fillText('NO PORTFOLIO DATA YET', w / 2, h / 2);
      return;
    }
    const padL = 60, padR = 16, padT = 26, padB = 30;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;
    const total = items.reduce((a, i) => a + (i.value || 0), 0);
    const sorted = items.slice().sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 20);
    const max = sorted[0]?.value || 1;
    const colors = ['#32f2ff', '#37ff8b', '#ffd42b', '#b46bff', '#ff4d6d', '#ff8c42'];
    ctx.font = '11px VT323';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const yy = padT + (chartH / 5) * i;
      ctx.fillStyle = '#7a7aa8';
      ctx.fillText('$' + global.fmt.num(max - (max / 5) * i), padL - 6, yy + 4);
      ctx.strokeStyle = 'rgba(122,122,168,0.15)';
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
    }
    const slot = chartW / sorted.length;
    const bw = slot * 0.6;
    sorted.forEach((item, i) => {
      const x = padL + i * slot + slot / 2;
      const bh = ((item.value || 0) / max) * chartH;
      const color = colors[i % colors.length];
      ctx.fillStyle = color;
      ctx.fillRect(x - bw / 2, padT + chartH - bh, bw, bh);
      ctx.fillStyle = '#7a7aa8';
      ctx.textAlign = 'center';
      const sym = item.token?.symbol || '?';
      ctx.fillText('$' + sym, x, h - 10);
    });
    ctx.fillStyle = '#32f2ff';
    ctx.textAlign = 'left';
    ctx.fillText('TOTAL: ' + global.fmt.usd(total), padL, padT - 10);
  }

  function drawAllocationDonut(wallet) {
    const canvas = document.getElementById('allocationChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth || 300;
    const h = canvas.height = 200;
    ctx.clearRect(0, 0, w, h);
    if (!wallet) return;
    const items = (global.STATE.portfolio || []).slice().sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 8);
    const total = items.reduce((a, i) => a + (i.value || 0), 0);
    if (!total) return;
    const colors = ['#32f2ff', '#37ff8b', '#ffd42b', '#b46bff', '#ff4d6d', '#ff8c42', '#42c6ff', '#ff9ed2'];
    let angle = -Math.PI / 2;
    const cx = w / 2, cy = h / 2, r = 70, ir = 45;
    items.forEach((item, i) => {
      const slice = (item.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.arc(cx, cy, ir, angle + slice, angle, true);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      angle += slice;
    });
    ctx.fillStyle = '#e8e8ff';
    ctx.font = '12px VT323';
    ctx.textAlign = 'center';
    ctx.fillText('PORTFOLIO', cx, cy + 4);
  }

  global.drawPortfolioCharts = function () {
    const wallet = global.STATE.wallet;
    drawPortfolioChart(wallet);
    drawAllocationDonut(wallet);
  };

  global.renderPage = global.renderPage || {};
  global.renderPage.portfolio = function () { global.renderPortfolio && global.renderPortfolio(); setTimeout(global.drawPortfolioCharts, 100); };
})(window);
