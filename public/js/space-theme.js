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
    const numStars = 300;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < numStars; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 200;
      stars.push({
        x: canvas.width / 4 + Math.cos(angle) * radius,
        y: canvas.height / 4 + Math.sin(angle) * radius,
        radius: Math.random() * 2 + 0.5,
        angle: angle,
        radius: radius,
        speed: Math.random() * 0.002 + 0.001,
        color: ['#32f2ff', '#b46bff', '#37ff8b', '#ffd42b', '#fff'][Math.floor(Math.random() * 5)],
      });
    }

    function animate() {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Draw black hole center
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 50);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
      gradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.8)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Draw accretion disk
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, 80, 20, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(50, 242, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw and rotate stars
      stars.forEach(star => {
        star.angle += star.speed;
        const x = centerX + Math.cos(star.angle) * star.radius;
        const y = centerY + Math.sin(star.angle) * star.radius * 0.3;

        ctx.beginPath();
        ctx.arc(x, y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.fill();
        ctx.shadowBlur = 5;
        ctx.shadowColor = star.color;
      });

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