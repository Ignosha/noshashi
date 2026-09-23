/* IGNOSHASHI - Price alerts */
(function (global) {
  'use strict';
  const $ = global.$;

  async function loadAlerts() {
    const wallet = global.STATE.wallet;
    const container = document.getElementById('alertsList');
    if (!container) return;
    if (!wallet) { container.innerHTML = '<p class="dim pixel small">Connect wallet to view alerts</p>'; return; }
    try {
      const r = await API.get('/api/alerts/' + encodeURIComponent(wallet));
      const alerts = r.alerts || [];
      container.innerHTML = alerts.length ? alerts.map((a, i) => `
        <div class="ob-row" style="color:var(--yellow)">
          <span>🔔</span>
          <span>${a.tokenName || a.tokenId}</span>
          <span class="pixel tiny dim">${a.type === 'above' ? 'ABOVE' : 'BELOW'} $${a.threshold}</span>
          <button class="chip" onclick="global.removeAlert('${a.id || i}')">✖</button>
        </div>
      `).join('') : '<p class="dim pixel small">No alerts set</p>';
    } catch (e) { container.innerHTML = '<p class="dim pixel small">Failed to load alerts</p>'; }
  }

  global.setAlert = async function (tokenId, threshold, type) {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect wallet first');
    try {
      await API.post('/api/alerts', { wallet, tokenId, threshold, type: type || 'above' });
      global.toast('Alert set!');
      loadAlerts();
    } catch (e) { global.toast('Alert failed: ' + e.message); }
  };

  global.removeAlert = async function (id) {
    try { await API.del('/api/alerts/' + id); global.toast('Alert removed'); loadAlerts(); }
    catch (e) { global.toast('Remove failed: ' + e.message); }
  };

  global.renderPage = global.renderPage || {};
  global.renderPage.alerts = loadAlerts;
})(window);
