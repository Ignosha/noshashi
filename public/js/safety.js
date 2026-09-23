/* IGNOSHASHI - Anti-rug safety indicators */
(function (global) {
  'use strict';
  const $ = global.$;

  function getSafetyBadges(t) {
    const badges = [];
    const safety = t.safetyScore != null ? t.safetyScore : 50;
    if (t.verified) badges.push({ label: '✅ VERIFIED', color: 'var(--green)' });
    if (t.graduated) badges.push({ label: '🎓 GRADUATED', color: 'var(--yellow)' });
    if (safety >= 80) badges.push({ label: '🛡️ SAFE', color: 'var(--green)' });
    else if (safety < 30) badges.push({ label: '⚠️ RISKY', color: 'var(--red)' });
    if (t.liquidityLocked) badges.push({ label: '🔒 LIQ LOCKED', color: 'var(--cyan)' });
    if (!t.mintAuthority) badges.push({ label: '🔐 MINT REVOKED', color: 'var(--green)' });
    if ((t.topHolderPercent || 0) > 20) badges.push({ label: '🐋 WHALE ALERT', color: 'var(--red)' });
    if (t.honeypot) badges.push({ label: '🚨 HONEYPOT', color: 'var(--red)' });
    return badges;
  }

  function renderBadges(t) {
    const badges = getSafetyBadges(t);
    return badges.map(b => `<span class="pixel tiny" style="background:${b.color};color:#000;padding:2px 6px;margin-right:4px;border-radius:2px">${b.label}</span>`).join('');
  }

  global.getSafetyBadges = getSafetyBadges;
  global.renderSafetyBadges = renderBadges;

  global.renderPage = global.renderPage || {};
})(window);
