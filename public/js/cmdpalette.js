/* IGNOSHASHI - Command palette */
(function (global) {
  'use strict';
  const $ = global.$;
  const palette = document.createElement('div');
  palette.id = 'commandPalette';
  palette.className = 'cmd-palette hidden';
  palette.innerHTML = `
    <div class="cmd-overlay" onclick="global.CommandPalette.close()"></div>
    <div class="cmd-box">
      <input type="text" id="cmdInput" class="cmd-input pixel" placeholder="> Type a command or search..." autocomplete="off">
      <div id="cmdResults" class="cmd-results"></div>
    </div>
  `;
  document.body.appendChild(palette);

  const COMMANDS = [
    { label: '🏠 Home', action: () => global.showPage('home') },
    { label: '📈 Trade', action: () => global.showPage('trade') },
    { label: '📊 Portfolio', action: () => global.showPage('portfolio') },
    { label: '⭐ Watchlist', action: () => global.showPage('watchlist') },
    { label: '📰 News', action: () => global.showPage('news') },
    { label: '🚀 Launchpad', action: () => global.showPage('launchpad') },
    { label: '🪙 Create Token', action: () => global.showPage('create') },
    { label: '🎰 Pump.fun', action: () => global.showPage('pumpfun') },
    { label: '🐋 Whale Tracker', action: () => global.showPage('whale') },
    { label: '🏆 Leaderboard', action: () => global.showPage('leaderboard') },
    { label: '👤 Social', action: () => global.showPage('social') },
    { label: '⚙️ Settings', action: () => global.showPage('settings') },
    { label: '❓ Help', action: () => global.showPage('help') },
    { label: '🏆 Achievements', action: () => global.showPage('achievements') },
    { label: '📊 Dashboard', action: () => global.showPage('dashboard') },
  ];

  function open() {
    palette.classList.remove('hidden');
    const input = document.getElementById('cmdInput');
    if (input) { input.value = ''; input.focus(); }
    renderResults('');
  }

  function close() { palette.classList.add('hidden'); }

  function renderResults(query) {
    const container = document.getElementById('cmdResults');
    if (!container) return;
    const q = query.toLowerCase();
    const matches = COMMANDS.filter(c => c.label.toLowerCase().includes(q));
    container.innerHTML = matches.map((c, i) => `
      <div class="cmd-item" data-index="${i}">
        <span>${c.label}</span>
        <span class="pixel tiny dim">↵</span>
      </div>
    `).join('');
    container.querySelectorAll('.cmd-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index);
        if (matches[idx]) { matches[idx].action(); close(); }
      });
    });
  }

  palette.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter') {
      const first = document.querySelector('.cmd-item');
      if (first) first.click();
    }
  });
  const input = document.getElementById('cmdInput');
  if (input) input.addEventListener('input', (e) => renderResults(e.target.value));

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); open(); }
    if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); open(); }
  });

  global.CommandPalette = { open, close };
})(window);
