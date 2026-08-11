/* IGNOSHASHI - Particle background */
(function (global) {
  'use strict';
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];
  let w, h;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function createParticle(i) {
    const colors = ['#32f2ff', '#b46bff', '#37ff8b', '#ffd42b'];
    return {
      x: ((i * 137 + 42) % w),
      y: ((i * 251 + 73) % h),
      vx: ((i % 2 === 0 ? 1 : -1) * (0.2 + (i % 3) * 0.1)),
      vy: ((i % 2 === 0 ? -1 : 1) * (0.2 + (i % 3) * 0.1)),
      size: 0.5 + (i % 3) * 0.5,
      alpha: 0.2 + (i % 4) * 0.1,
      color: colors[i % colors.length],
    };
  }

  for (let i = 0; i < 80; i++) particles.push(createParticle(i));

  function animate() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(animate);
  }
  animate();
})(window);
