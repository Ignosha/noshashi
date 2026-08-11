/* IGNOSHASHI - Batch operations, portfolio sharing, advanced features */
(function (global) {
  'use strict';
  const $ = global.$;

  /* ---------- Batch send ---------- */
  document.getElementById('btnBatchSend') && document.getElementById('btnBatchSend').addEventListener('click', async () => {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect wallet first');
    const addresses = document.getElementById('batchAddresses').value.split('\n').filter(a => a.trim());
    const amount = parseFloat(document.getElementById('batchAmount').value);
    if (!addresses.length || !amount) return global.toast('Enter addresses and amount');
    try {
      const r = await API.post('/api/batch/send', { wallet, addresses, amount });
      global.toast('Batch send complete! TX: ' + (r.hash || 'ok'));
    } catch (e) { global.toast('Batch send failed: ' + e.message); }
  });

  /* ---------- Portfolio share ---------- */
  global.sharePortfolio = function () {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect wallet first');
    const url = location.origin + '/portfolio.html?wallet=' + wallet;
    navigator.clipboard.writeText(url).then(() => global.toast('Portfolio link copied!')).catch(() => global.toast('Failed to copy'));
  };

  /* ---------- Limit order ---------- */
  document.getElementById('btnLimitOrder') && document.getElementById('btnLimitOrder').addEventListener('click', async () => {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect wallet first');
    const tokenId = document.getElementById('limitToken').value;
    const price = parseFloat(document.getElementById('limitPrice').value);
    const amount = parseFloat(document.getElementById('limitAmount').value);
    const side = document.getElementById('limitSide').value;
    if (!tokenId || !price || !amount) return global.toast('Fill all fields');
    try {
      await API.post('/api/orders/limit', { wallet, tokenId, price, amount, side });
      global.toast('Limit order placed!');
    } catch (e) { global.toast('Order failed: ' + e.message); }
  });

  /* ---------- Sniper bot ---------- */
  document.getElementById('btnSniper') && document.getElementById('btnSniper').addEventListener('click', async () => {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect wallet first');
    const maxBuy = parseFloat(document.getElementById('sniperMaxBuy').value) || 1;
    const minLiq = parseFloat(document.getElementById('sniperMinLiq').value) || 10000;
    try {
      await API.post('/api/sniper/enable', { wallet, maxBuy, minLiq });
      global.toast('Sniper bot enabled!');
    } catch (e) { global.toast('Sniper failed: ' + e.message); }
  });

  /* ---------- DEX aggregation ---------- */
  document.getElementById('btnDexAgg') && document.getElementById('btnDexAgg').addEventListener('click', async () => {
    const from = document.getElementById('dexFrom').value;
    const to = document.getElementById('dexTo').value;
    const amount = parseFloat(document.getElementById('dexAmount').value);
    if (!amount) return global.toast('Enter amount');
    try {
      const r = await API.get('/api/dex/quote?from=' + from + '&to=' + to + '&amount=' + amount);
      global.toast('Best: ' + r.bestDex + ' @ ' + r.rate + ' (slippage: ' + (r.slippage || 0) + '%)');
    } catch (e) { global.toast('DEX agg failed: ' + e.message); }
  });

  /* ---------- Creator staking ---------- */
  document.getElementById('btnStake') && document.getElementById('btnStake').addEventListener('click', async () => {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect wallet first');
    const tokenId = document.getElementById('stakeToken').value;
    const amount = parseFloat(document.getElementById('stakeAmount').value);
    if (!amount) return global.toast('Enter amount');
    try {
      const r = await API.post('/api/staking/stake', { wallet, tokenId, amount });
      global.toast('Staked! APY: ' + (r.apy || '?') + '%');
    } catch (e) { global.toast('Stake failed: ' + e.message); }
  });

  /* ---------- Airdrop ---------- */
  document.getElementById('btnAirdrop') && document.getElementById('btnAirdrop').addEventListener('click', async () => {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect wallet first');
    const tokenId = document.getElementById('airdropToken').value;
    const recipients = document.getElementById('airdropRecipients').value.split('\n').filter(a => a.trim());
    const amount = parseFloat(document.getElementById('airdropAmount').value);
    if (!recipients.length || !amount) return global.toast('Enter recipients and amount');
    try {
      const r = await API.post('/api/airdrop', { wallet, tokenId, recipients, amount });
      global.toast('Airdrop sent! TX: ' + (r.hash || 'ok'));
    } catch (e) { global.toast('Airdrop failed: ' + e.message); }
  });

  /* ---------- Time-lock ---------- */
  document.getElementById('btnTimelock') && document.getElementById('btnTimelock').addEventListener('click', async () => {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect wallet first');
    const to = document.getElementById('timelockTo').value.trim();
    const amount = parseFloat(document.getElementById('timelockAmount').value);
    const unlockTime = document.getElementById('timelockTime').value;
    if (!to || !amount || !unlockTime) return global.toast('Fill all fields');
    try {
      await API.post('/api/timelock', { wallet, to, amount, unlockTime: new Date(unlockTime).getTime() });
      global.toast('Time-lock created!');
    } catch (e) { global.toast('Timelock failed: ' + e.message); }
  });

  /* ---------- DCA ---------- */
  document.getElementById('btnDca') && document.getElementById('btnDca').addEventListener('click', async () => {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect wallet first');
    const tokenId = document.getElementById('dcaToken').value;
    const amount = parseFloat(document.getElementById('dcaAmount').value);
    const frequency = document.getElementById('dcaFreq').value;
    if (!amount || !frequency) return global.toast('Fill all fields');
    try {
      await API.post('/api/dca/create', { wallet, tokenId, amount, frequency });
      global.toast('DCA created!');
    } catch (e) { global.toast('DCA failed: ' + e.message); }
  });

  /* ---------- Tax report ---------- */
  global.generateTaxReport = async function () {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect wallet first');
    try {
      const r = await API.get('/api/tax/report/' + encodeURIComponent(wallet));
      const csv = 'Type,Token,Amount,Price,Date\n' + (r.trades || []).map(t => `${t.side},${t.tokenId},${t.amount},${t.price},${new Date(t.timestamp).toISOString()}`).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'tax-report.csv'; a.click();
      URL.revokeObjectURL(url);
      global.toast('Tax report downloaded');
    } catch (e) { global.toast('Tax report failed: ' + e.message); }
  };

  global.renderPage = global.renderPage || {};
})(window);
