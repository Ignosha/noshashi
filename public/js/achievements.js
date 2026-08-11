/* IGNOSHASHI - Achievements */
(function (global) {
  'use strict';
  const $ = global.$;

  const ACHIEVEMENTS = [
    { id: 'first_trade', name: 'FIRST TRADE', desc: 'Execute your first trade', icon: '🎯', check: () => (global.STATE.trades || []).length > 0 },
    { id: 'whale', name: 'WHALE', desc: 'Have $10,000+ in portfolio', icon: '🐋', check: () => (global.STATE.portfolio || []).reduce((a, i) => a + (i.value || 0), 0) > 10000 },
    { id: 'creator', name: 'CREATOR', desc: 'Launch your first token', icon: '🪙', check: () => (global.STATE.tokens || []).some(t => t.creator === global.STATE.wallet) },
    { id: 'diamond', name: 'DIAMOND HANDS', desc: 'Hold 5+ tokens', icon: '💎', check: () => (global.STATE.portfolio || []).length >= 5 },
    { id: 'early', name: 'EARLY ADOPTER', desc: 'Join in the first hour', icon: '⚡', check: () => Date.now() - (global.STATE.startTime || Date.now()) < 3600000 },
  ];

  function getUnlocked() {
    return ACHIEVEMENTS.filter(a => a.check());
  }

  function renderAchievements() {
    const container = document.getElementById('achievementsList');
    if (!container) return;
    const unlocked = getUnlocked();
    container.innerHTML = ACHIEVEMENTS.map(a => {
      const isUnlocked = unlocked.includes(a);
      return `<div class="ob-row" style="color:${isUnlocked ? 'var(--yellow)' : 'var(--dim)'}">
        <span>${isUnlocked ? a.icon : '🔒'}</span>
        <span class="pixel small">${a.name}</span>
        <span class="pixel tiny">${a.desc}</span>
        <span class="pixel tiny">${isUnlocked ? '✅' : '🔒'}</span>
      </div>`;
    }).join('');
  }

  global.renderPage = global.renderPage || {};
  global.renderPage.achievements = renderAchievements;
})(window);
