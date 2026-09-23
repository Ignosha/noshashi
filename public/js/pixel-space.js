/* IGNOSHASHI - Pixel Space TV Animation */
(function (global) {
  'use strict';
  const canvas = document.getElementById('pixelSpaceCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let stars = [];
  let ships = [];
  let planets = [];
  let frame = 0;
  let topToken = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width || 800;
    canvas.height = rect.height || 300;
  }
  resize();
  window.addEventListener('resize', resize);

  function initSpace() {
    stars = [];
    ships = [];
    planets = [];
    for (let i = 0; i < 120; i++) {
      stars.push({
        x: ((i * 137 + 42) % canvas.width),
        y: ((i * 251 + 73) % canvas.height),
        size: i % 3 === 0 ? 2 : 1,
        speed: 0.1 + (i % 5) * 0.1,
        brightness: 0.3 + (i % 7) * 0.1,
      });
    }
    for (let i = 0; i < 3; i++) {
      planets.push({
        x: ((i * 311 + 17) % canvas.width),
        y: ((i * 197 + 29) % canvas.height),
        radius: 10 + i * 4,
        color: ['#32f2ff', '#b46bff', '#37ff8b', '#ffd42b'][i % 4],
        speed: 0.1 + i * 0.05,
        rings: i % 2 === 0,
      });
    }
    for (let i = 0; i < 2; i++) {
      ships.push({
        x: ((i * 223 + 61) % canvas.width),
        y: ((i * 179 + 43) % canvas.height),
        width: 15 + i * 5,
        height: 8,
        speed: 0.5 + i * 0.5,
        direction: i % 2 === 0 ? 1 : -1,
        color: ['#32f2ff', '#ffd42b', '#37ff8b'][i % 3],
      });
    }
  }

  function getTopToken() {
    const tokens = global.STATE.tokens || [];
    if (!tokens.length) return null;
    return tokens.slice().sort((a, b) => (b.volume || 0) - (a.volume || 0))[0];
  }

  function drawPixelStar(x, y, size, brightness) {
    const alpha = 0.3 + brightness * 0.7;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(Math.floor(x), Math.floor(y), size, size);
  }

  function drawPixelPlanet(p) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    if (p.rings) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.radius * 1.8, p.radius * 0.3, Math.PI * 0.1, 0, Math.PI * 2);
      ctx.stroke();
    }
    const shadowX = p.x - p.radius * 0.3;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(shadowX, p.y, p.radius * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPixelShip(s) {
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    ctx.fillStyle = s.color;
    ctx.fillRect(x, y, s.width, s.height);
    ctx.fillStyle = '#ff4d6d';
    ctx.fillRect(x + (s.direction > 0 ? s.width : -4), y + 2, 4, 4);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 4, y + 2, 4, 2);
  }

  function drawTokenLabel() {
    if (!topToken) return;
    const label = 'TOP: $' + topToken.symbol + ' | VOL: ' + global.fmt.usd(topToken.volume || 0);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, 20);
    ctx.fillStyle = '#32f2ff';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(label, 8, 14);
  }

  function animate() {
    if (!canvas.width) { requestAnimationFrame(animate); return; }
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    stars.forEach(star => {
      star.x -= star.speed;
      if (star.x < 0) { star.x = canvas.width; star.y = ((star.y * 1.1 + 7) % canvas.height); }
      drawPixelStar(star.x, star.y, star.size, star.brightness);
    });

    planets.forEach(p => {
      p.x -= p.speed;
      if (p.x < -p.radius * 2) { p.x = canvas.width + p.radius; p.y = ((p.y * 1.1 + 13) % canvas.height); }
      drawPixelPlanet(p);
    });

    ships.forEach(s => {
      s.x += s.speed * s.direction;
      if (s.direction > 0 && s.x > canvas.width + 20) s.x = -s.width;
      if (s.direction < 0 && s.x < -s.width) s.x = canvas.width + 20;
      drawPixelShip(s);
    });

    drawTokenLabel();

    frame++;
    requestAnimationFrame(animate);
  }

  function updateTopToken() {
    topToken = getTopToken();
    const label = document.getElementById('pixelSpaceLabel');
    if (label && topToken) {
      label.textContent = 'TOP: $' + topToken.symbol.toUpperCase();
    }
  }

  initSpace();
  animate();
  updateTopToken();
  setInterval(updateTopToken, 10000);

  global.renderPage = global.renderPage || {};
  global.renderPage.home = global.renderPage.home || (() => {});
  const originalHome = global.renderPage.home;
  global.renderPage.home = function () {
    if (originalHome) originalHome();
    updateTopToken();
  };
})(window);
