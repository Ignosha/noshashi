/* IGNOSHASHI - Space theme animations */
(function (global) {
  'use strict';

  function initStarfield() {
    const canvas = document.getElementById('starfield');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let stars = [];
    const numStars = 200;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < numStars; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 1.5,
        speed: Math.random() * 0.5 + 0.1,
        opacity: Math.random(),
      });
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach(star => {
        star.y -= star.speed;
        if (star.y < 0) {
          star.y = canvas.height;
          star.x = Math.random() * canvas.width;
        }
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
        ctx.fill();
      });
      requestAnimationFrame(animate);
    }
    animate();
  }

  function initSpaceCanvas() {
    const canvas = document.getElementById('spaceCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    const numParticles = 100;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < numParticles; i++) {
      particles.push({
        x: Math.random() * canvas.width / 2,
        y: Math.random() * canvas.height / 2,
        radius: Math.random() * 2 + 1,
        speedX: (Math.random() - 0.5) * 0.5,
        speedY: (Math.random() - 0.5) * 0.5,
        color: ['#32f2ff', '#b46bff', '#37ff8b', '#ffd42b'][Math.floor(Math.random() * 4)],
      });
    }

    function animate() {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      particles.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;

        if (p.x < 0) p.x = rect.width;
        if (p.x > rect.width) p.x = 0;
        if (p.y < 0) p.y = rect.height;
        if (p.y > rect.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
      });

      // Draw connections
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach(p2 => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(50, 242, 255, ${0.2 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });

      requestAnimationFrame(animate);
    }
    animate();
  }

  function initGalaxyCanvas() {
    const canvas = document.getElementById('galaxyCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let stars = [];
    let time = 0;
    const PIXEL = 4;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * 2);
      canvas.height = Math.floor(rect.height * 2);
      ctx.imageSmoothingEnabled = false;
      initStars(canvas.width, canvas.height);
    }

    function initStars(width, height) {
      stars = [];
      const centerX = width / 2;
      const centerY = height / 2;
      const numStars = 500;

      const coreRadius = 50;
      const barLength = 110;
      const barWidth = 25;

      for (let i = 0; i < numStars; i++) {
        const layer = Math.random();
        let x, y, distance, angle;

        if (layer < 0.3) {
          const r = Math.pow(Math.random(), 0.6) * coreRadius;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          x = centerX + r * Math.sin(phi) * Math.cos(theta);
          y = centerY + r * Math.sin(phi) * Math.sin(theta) * 0.85;
          distance = Math.sqrt((x - centerX) ** 2 + ((y - centerY) / 0.85) ** 2);
          angle = Math.atan2(y - centerY, x - centerX);
        } else if (layer < 0.5) {
          const t = (Math.random() - 0.5) * 2;
          const barPos = t * barLength;
          const spread = (Math.random() - 0.5) * barWidth * (1 - Math.abs(t) * 0.5);
          x = centerX + barPos + (Math.random() > 0.5 ? 1 : -1) * spread;
          y = centerY + spread * 0.6;
          distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
          angle = Math.atan2(y - centerY, x - centerX);
        } else {
          const armIndex = Math.floor(Math.random() * 4);
          const armOffset = (armIndex / 4) * Math.PI * 2;
          distance = Math.random() * 200 + coreRadius * 0.4;
          const armWidth = 0.55 - (distance / 300) * 0.25;
          const armAngle = (distance * 0.016 + armOffset) + (Math.random() - 0.5) * armWidth;
          x = centerX + Math.cos(armAngle) * distance;
          y = centerY + Math.sin(armAngle) * distance * 0.55;
          angle = armAngle;
        }

        const palette = ['#ffffff', '#fff8e7', '#ffd8a8', '#b0c4ff', '#87ceeb', '#ffd700', '#ff9e6b', '#e0ffff'];
        const color = palette[Math.floor(Math.random() * palette.length)];

        stars.push({
          x: Math.round(x / PIXEL) * PIXEL,
          y: Math.round(y / PIXEL) * PIXEL,
          distance,
          angle,
          speed: (0.00025 + Math.random() * 0.0006) * (140 / Math.max(distance, 25)),
          size: Math.random() < 0.08 ? 2 : 1,
          color,
          brightness: Math.random() * 0.6 + 0.4,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    resize();
    window.addEventListener('resize', resize);

    function drawPixelRect(ctx, x, y, size, color, alpha) {
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x / PIXEL) * PIXEL, Math.round(y / PIXEL) * PIXEL, size * PIXEL, size * PIXEL);
      ctx.globalAlpha = 1;
    }

    function drawMilkyWayCore(ctx, centerX, centerY, time) {
      const brightness = 0.7 + Math.sin(time * 0.0008) * 0.15;

      // Core glow - pixelated radial steps
      const coreColors = [
        { r: 255, g: 248, b: 231, a: 0.9 * brightness },
        { r: 255, g: 228, b: 196, a: 0.6 * brightness },
        { r: 176, g: 196, b: 255, a: 0.25 * brightness },
      ];

      coreColors.forEach((c, i) => {
        const radius = (60 - i * 15);
        ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${c.a})`;
        for (let y = -radius; y <= radius; y += PIXEL) {
          for (let x = -radius; x <= radius; x += PIXEL) {
            if (x * x + y * y <= radius * radius) {
              ctx.fillRect(centerX + x, centerY + y, PIXEL, PIXEL);
            }
          }
        }
      });

      // Central bar - pixelated
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(-0.4);

      const barPixels = 35;
      for (let i = -barPixels; i <= barPixels; i++) {
        const t = i / barPixels;
        const alpha = (1 - t * t) * 0.7 * brightness;
        ctx.fillStyle = `rgba(255, 248, 231, ${alpha})`;
        const hw = Math.max(PIXEL, Math.round((25 * (1 - Math.abs(t) * 0.5)) / PIXEL) * PIXEL);
        ctx.fillRect(i * PIXEL - hw / 2, -hw / 2, PIXEL, hw);
      }

      ctx.restore();

      // Dust lane
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(-0.4);
      ctx.fillStyle = 'rgba(20, 10, 30, 0.5)';
      for (let i = -25; i <= 25; i++) {
        ctx.fillRect(i * PIXEL, -PIXEL, PIXEL, PIXEL * 2);
      }
      ctx.restore();
    }

    function drawSpiralArms(ctx, centerX, centerY, time) {
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(time * 0.00004);

      const arms = 4;
      for (let arm = 0; arm < arms; arm++) {
        const armOffset = (arm / arms) * Math.PI * 2;
        ctx.fillStyle = 'rgba(135, 206, 235, 0.12)';

        for (let r = 35; r < 210; r += PIXEL) {
          const spiralAngle = r * 0.014 + armOffset;
          const wobble = Math.round((Math.sin(r * 0.04 + time * 0.0004) * 6) / PIXEL) * PIXEL;
          const x = Math.round((Math.cos(spiralAngle) * (r + wobble)) / PIXEL) * PIXEL;
          const y = Math.round((Math.sin(spiralAngle) * (r + wobble) * 0.55) / PIXEL) * PIXEL;
          ctx.fillRect(x - PIXEL / 2, y - PIXEL / 2, PIXEL * 2, PIXEL);
        }
      }

      ctx.restore();
    }

    function animate() {
      time++;
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // Deep space background
      const bg = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(width, height) / 2);
      bg.addColorStop(0, 'rgba(10, 8, 20, 0.25)');
      bg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Spiral arms
      drawSpiralArms(ctx, centerX, centerY, time);

      // Milky Way core
      drawMilkyWayCore(ctx, centerX, centerY, time);

      // Stars - pixel blocks
      stars.forEach((star) => {
        star.angle += star.speed;
        const pulse = Math.sin(time * 0.015 + star.phase) * 0.3 + 0.7;
        const alpha = star.brightness * pulse;
        const size = star.size * PIXEL;

        drawPixelRect(ctx, star.x, star.y, star.size, star.color, alpha);
      });

      // Subtle center glow
      const lensGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 35);
      lensGradient.addColorStop(0, 'rgba(255, 248, 231, 0.08)');
      lensGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = lensGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 35, 0, Math.PI * 2);
      ctx.fill();

      requestAnimationFrame(animate);
    }

    animate();
  }

  function initMeteors() {
    const container = document.body;
    const numMeteors = 5;

    for (let i = 0; i < numMeteors; i++) {
      const meteor = document.createElement('div');
      meteor.className = 'meteor';
      meteor.style.left = Math.random() * 100 + '%';
      meteor.style.top = Math.random() * 100 + '%';
      meteor.style.setProperty('--fall-duration', (Math.random() * 3 + 2) + 's');
      meteor.style.animationDelay = Math.random() * 5 + 's';
      container.appendChild(meteor);
    }
  }

  global.SpaceTheme = {
    initStarfield,
    initSpaceCanvas,
    initGalaxyCanvas,
    initMeteors,
  };

  document.addEventListener('DOMContentLoaded', () => {
    initStarfield();
    initSpaceCanvas();
    initGalaxyCanvas();
    initMeteors();
  });
})(window);