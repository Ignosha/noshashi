/* IGNOSHASHI - Fund, Swap, Withdraw */
(function (global) {
  'use strict';
  const $ = global.$;

  async function loadBalance() {
    const wallet = global.STATE.wallet;
    if (!wallet) return;
    try {
      const r = await API.get('/api/fund/balance/' + encodeURIComponent(wallet));
      const el = document.getElementById('fundBalance');
      if (el) el.textContent = global.fmt.usd(r.total || 0);
      const usdEl = document.getElementById('fundUsd');
      if (usdEl) usdEl.textContent = global.fmt.usd(r.usd || 0);
      const tokEl = document.getElementById('fundToken');
      if (tokEl) tokEl.textContent = global.fmt.usd(r.tokenValue || 0);
    } catch (e) {}
  }

  async function loadSwapWallet() {
    const wallet = global.STATE.wallet;
    const body = document.getElementById('swapWalletBody');
    if (!body) return;
    if (!wallet) { body.innerHTML = '<p class="dim pixel small">Connect a wallet to view swap assets.</p>'; return; }
    try {
      const r = await API.get('/api/swaps/wallet/' + encodeURIComponent(wallet));
      const items = r.items || [];
      body.innerHTML = items.length ? items.map((s) => `
        <div class="ob-row" style="color:var(--cyan)">
          <span>🔄</span>
          <span>${s.fromToken} → ${s.toToken}</span>
          <span class="pixel tiny dim">${global.fmt.time(s.timestamp)}</span>
        </div>
      `).join('') : '<p class="dim pixel small">No swaps yet.</p>';
    } catch (e) { body.innerHTML = '<p class="dim pixel small">Failed to load swap wallet.</p>'; }
  }

  async function loadTxHistory() {
    const wallet = global.STATE.wallet;
    if (!wallet) return;
    try {
      const [swaps, withdrawals] = await Promise.all([
        API.get('/api/swaps/' + encodeURIComponent(wallet)),
        API.get('/api/withdrawals/' + encodeURIComponent(wallet)),
      ]);
      const all = [
        ...(swaps.swaps || []).map(s => ({ ...s, type: 'swap' })),
        ...(withdrawals.withdrawals || []).map(w => ({ ...w, type: 'withdraw' })),
      ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);
      const body = document.getElementById('txHistoryBody');
      if (!body) return;
      body.innerHTML = all.length ? all.map((tx) => {
        const color = tx.type === 'withdraw' ? 'var(--red)' : 'var(--cyan)';
        const icon = tx.type === 'withdraw' ? '💸' : '🔄';
        const desc = tx.type === 'withdraw' ? 'Withdrew $' + tx.amount + ' (net $' + (tx.netAmount || tx.amount * 0.99) + ')' : 'Swapped ' + tx.fromToken + ' -> ' + tx.toToken;
        return '<div class="ob-row" style="color:' + color + '"><span>' + icon + '</span><span>' + desc + '</span><span class="pixel tiny dim">' + global.fmt.time(tx.timestamp) + '</span><span style="color:' + (tx.status === 'completed' || tx.status === 'succeeded' ? 'var(--green)' : 'var(--yellow)') + '">' + tx.status + '</span></div>';
      }).join('') : '<p class="dim pixel small">No transactions yet.</p>';
    } catch (e) { const body = document.getElementById('txHistoryBody'); if (body) body.innerHTML = '<p class="dim pixel small">Failed to load history.</p>'; }
  }

  /* Swap */
  document.getElementById('swapBtn').addEventListener('click', async () => {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect a wallet first');
    const from = document.getElementById('swapFrom').value;
    const to = document.getElementById('swapTo').value;
    const amount = parseFloat(document.getElementById('swapAmount').value);
    if (!amount || amount <= 0) return global.toast('Enter amount');
    try {
      const quote = await API.get('/api/swap/quote?from=' + from + '&to=' + to + '&amount=' + amount);
      const confirmed = confirm('Swap ' + amount + ' ' + from + ' -> ' + quote.toAmount + ' ' + to + '?\nRate: 1 ' + from + ' = ' + quote.rate + ' ' + to + '\nFee: ' + quote.fee + ' ' + from);
      if (!confirmed) return;
      const r = await API.post('/api/swap/execute', { wallet, from, to, amount });
      const resultEl = document.getElementById('swapResult');
      if (resultEl) resultEl.innerHTML = '✅ Swapped ' + r.fromAmount + ' ' + r.from + ' -> ' + r.toAmount + ' ' + r.to + ' (fee: ' + r.fee + ')';
      document.getElementById('swapAmount').value = '';
      loadBalance(); loadTxHistory(); loadSwapWallet();
    } catch (e) { const resultEl = document.getElementById('swapResult'); if (resultEl) resultEl.innerHTML = '❌ ' + e.message; }
  });

  /* Withdraw */
  document.getElementById('withdrawBtn').addEventListener('click', async () => {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect a wallet first');
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    const address = document.getElementById('withdrawAddress').value.trim();
    if (!amount || amount < 10) return global.toast('Minimum withdrawal is $10');
    if (!address) return global.toast('Enter a destination address');
    try {
      const r = await API.post('/api/withdraw', { wallet, amount, currency: 'USD', address });
      const resultEl = document.getElementById('withdrawResult');
      if (resultEl) resultEl.innerHTML = '✅ Withdrawal submitted! Net: $' + r.netAmount + ' (fee: $' + r.fee + '). Status: ' + r.status + '. ' + r.estimatedArrival;
      document.getElementById('withdrawAmount').value = '';
      document.getElementById('withdrawAddress').value = '';
      loadBalance(); loadTxHistory();
    } catch (e) { const resultEl = document.getElementById('withdrawResult'); if (resultEl) resultEl.innerHTML = '❌ ' + e.message; }
  });

  global.renderFund = function () {
    loadBalance();
    loadSwapWallet();
    loadTxHistory();
  };

  global.renderPage = global.renderPage || {};
  global.renderPage.fund = global.renderFund;
})(window);
