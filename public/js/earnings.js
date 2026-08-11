/* IGNOSHASHI - Earnings and withdrawal */
(function (global) {
  'use strict';
  const $ = global.$;

  async function loadEarnings() {
    const wallet = global.STATE.wallet;
    const container = document.getElementById('userEarnings');
    if (!container) return;

    if (!wallet) {
      container.innerHTML = '<p class="dim pixel small">Connect wallet to view earnings</p>';
      return;
    }

    try {
      const r = await API.get('/api/balances/' + encodeURIComponent(wallet));
      const items = r.balances || [];
      let totalValue = 0;
      let totalEarned = 0;
      items.forEach(item => {
        if (item.token) {
          totalValue += item.value || 0;
          totalEarned += (item.balance || 0) * (item.price || 0);
        }
      });
      const netEarnings = totalValue;
      const el = document.getElementById('withdrawAmount');
      if (el) el.max = Math.max(0, netEarnings);

      container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="pixel tiny dim">PORTFOLIO VALUE</div><div class="pixel small" style="color:var(--green)">${global.fmt.usd(totalValue)}</div>
          <div class="pixel tiny dim">TOKENS HELD</div><div class="pixel small">${items.length} tokens</div>
          <div class="pixel tiny dim">NET EARNINGS</div><div class="pixel lg glow-green">${global.fmt.usd(netEarnings)}</div>
          <div class="pixel tiny dim">WITHDRAWABLE</div><div class="pixel small" style="color:var(--cyan)">${global.fmt.usd(netEarnings)}</div>
        </div>
        ${netEarnings > 0 ? '<div class="pixel tiny" style="margin-top:10px;color:var(--green)">✅ Available for withdrawal</div>' : '<div class="pixel tiny" style="margin-top:10px;color:var(--dim)">Trade to earn profits</div>'}
      `;
    } catch (e) {
      container.innerHTML = '<p class="dim pixel small">Failed to load earnings</p>';
    }
  }

  async function loadWithdrawalHistory() {
    const wallet = global.STATE.wallet;
    const container = document.getElementById('withdrawalHistory');
    if (!container || !wallet) {
      if (container) container.innerHTML = '<p class="dim pixel small">Connect wallet to view history</p>';
      return;
    }

    try {
      const r = await API.get('/api/withdrawals/' + encodeURIComponent(wallet));
      const rows = r || [];
      container.innerHTML = rows.length ? rows.map(w => `
        <div class="token-row">
          <div class="token-info">
            <div class="token-name">${w.currency || 'CRYPTO'} WITHDRAWAL</div>
            <div class="token-sym">${global.fmt.time(w.timestamp)} · ${w.status}</div>
          </div>
          <div class="token-stat">
            <div class="token-price">${global.fmt.usd(w.amount)}</div>
            <div class="token-cap">${w.address ? global.fmt.shortAddr(w.address) : ''}</div>
          </div>
        </div>
      `).join('') : '<p class="dim pixel small">No withdrawals yet</p>';
    } catch (e) {
      container.innerHTML = '<p class="dim pixel small">No withdrawals yet</p>';
    }
  }

  async function handleWithdrawal() {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect wallet first');

    const address = $('#earningsWithdrawAddr').value.trim();
    const network = $('#earningsWithdrawNetwork').value;
    const amount = parseFloat($('#earningsWithdrawAmount').value);

    if (!address) return global.toast('Enter withdrawal address');
    if (!amount || amount <= 0) return global.toast('Enter valid amount');

    if (global.Security && !global.Security.isValidAddress(address, network.toLowerCase())) {
      return global.toast('Invalid wallet address');
    }

    try {
      const r = await API.post('/api/withdraw', { wallet, network });
      global.toast('Withdrawal submitted: ' + (r.hash || 'processing'));
      $('#earningsWithdrawResult').innerHTML = '<span style="color:var(--green)">✅ Withdrawal processing</span>';
      $('#earningsWithdrawAddr').value = '';
      $('#earningsWithdrawAmount').value = '';
      loadEarnings();
      loadWithdrawalHistory();
    } catch (e) {
      global.toast('Withdrawal failed: ' + e.message);
      $('#earningsWithdrawResult').innerHTML = '<span style="color:var(--red)">❌ ' + e.message + '</span>';
    }
  }

  global.renderPage = global.renderPage || {};
  global.renderPage.earnings = async function () {
    await loadEarnings();
    await loadWithdrawalHistory();
  };

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnEarningsWithdraw');
    if (btn) btn.addEventListener('click', handleWithdrawal);
  });
})(window);
