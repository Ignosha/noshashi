/* IGNOSHASHI - Tools Shop with real functionality */
(function (global) {
  'use strict';
  const $ = global.$;
  let ethPrice = 3200;
  let solPrice = 145;
  let ownedTools = new Set();

  async function loadPrices() {
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana&vs_currencies=usd');
      if (r.ok) {
        const data = await r.json();
        if (data.ethereum) ethPrice = data.ethereum.usd;
        if (data.solana) solPrice = data.solana.usd;
      }
    } catch (e) { /* use defaults */ }
  }
  loadPrices();
  setInterval(loadPrices, 60000);

  function fmtCrypto(usd, symbol) {
    const price = symbol === 'ETH' ? ethPrice : symbol === 'SOL' ? solPrice : 1;
    const crypto = usd / price;
    return { crypto: crypto.toFixed(4), usd: '$' + usd.toFixed(2) };
  }

  async function loadOwnedTools() {
    const wallet = global.STATE.wallet;
    if (!wallet) return;
    try {
      const r = await API.get('/api/tools/my/' + encodeURIComponent(wallet));
      ownedTools = new Set((r || []).map(t => t.id));
    } catch (e) { ownedTools = new Set(); }
  }

  async function loadTools() {
    await loadPrices();
    await loadOwnedTools();
    try {
      const r = await API.get('/api/tools');
      const tools = r || [];
      const grid = $('#toolsGrid');
      if (!grid) return;
      grid.innerHTML = tools.length ? tools.map((t) => {
        const features = Object.entries(t.features || {}).map(([k, v]) => v ? `<span class="pixel tiny" style="color:var(--green)">✓ ${k}</span>` : `<span class="pixel tiny dim">○ ${k}</span>`).join(' ');
        const priceUSD = t.price || 9.99;
        const eth = fmtCrypto(priceUSD, 'ETH');
        const sol = fmtCrypto(priceUSD, 'SOL');
        const isOwned = ownedTools.has(t.id);
        const btnText = isOwned ? '✅ OWNED' : '🔓 BUY';
        const btnClass = isOwned ? 'pixel-btn small' : 'pixel-btn small';
        const btnStyle = isOwned ? 'background:var(--green);color:#000;' : '';
        const action = isOwned ? `window.activateTool && window.activateTool('${t.id}')` : `window.buyTool('${t.id}')`;
        return `<div class="tool-card">
          <div class="tool-header">
            <div class="tool-avatar">${t.name.split(' ').slice(0,2).join(' ')}</div>
            <div>
              <div class="pixel small">${t.name}</div>
              <div class="pixel tiny dim">${t.category}</div>
            </div>
          </div>
          <div class="pixel tiny" style="margin:10px 0;line-height:1.6">${t.description}</div>
          <div class="tool-features">${features}</div>
          <div class="tool-footer">
            <div>
              ${isOwned ? '<div class="pixel lg" style="color:var(--green)">ACTIVE</div>' : `<div class="pixel lg" style="color:var(--yellow)">${eth.crypto} ETH</div><div class="pixel tiny dim">${sol.crypto} SOL · ${eth.usd}</div>`}
            </div>
            <button class="${btnClass}" data-tool="${t.id}" onclick="${action}" style="${btnStyle}">${btnText}</button>
          </div>
        </div>`;
      }).join('') : '<p class="dim pixel small">No tools available.</p>';
    } catch (e) { 
      const grid = $('#toolsGrid');
      if (grid) grid.innerHTML = '<p class="dim pixel small">Failed to load tools. Server may be offline.</p>'; 
    }
  }

  async function loadMyTools() {
    const wallet = global.STATE.wallet;
    const body = $('#myToolsBody');
    if (!wallet) { body.innerHTML = '<p class="dim pixel small">Connect a wallet to view your tools.</p>'; return; }
    try {
      const r = await API.get('/api/tools/my/' + encodeURIComponent(wallet));
      const tools = r || [];
      ownedTools = new Set(tools.map(t => t.id));
      body.innerHTML = tools.length ? tools.map((t) => `
        <div class="token-row">
          <div class="token-avatar">✅</div>
          <div class="token-info">
            <div class="token-name">${t.name}</div>
            <div class="token-sym">${t.category} · Unlocked ${new Date(t.unlocked_at).toLocaleDateString()}</div>
          </div>
          <div class="token-stat">
            <div class="token-cap" style="color:var(--green)">ACTIVE</div>
          </div>
        </div>
      `).join('') : '<p class="dim pixel small">No tools unlocked yet. Buy tools to unlock features.</p>';
    } catch (e) { body.innerHTML = '<p class="dim pixel small">Failed to load tools.</p>'; }
  }

  global.buyTool = async function (toolId) {
    const wallet = global.STATE.wallet;
    if (!wallet) return global.toast('Connect a wallet first');
    const network = global.STATE.network || 'solana';
    const paymentMethod = network === 'ethereum' ? 'eth' : 'sol';
    try {
      const r = await API.post('/api/tools/purchase', { wallet, toolId, paymentMethod, network });
      if (r.alreadyOwned) return global.toast('You already own this tool!');
      global.toast('Tool unlocked! Payment sent to ' + (r.network === 'ethereum' ? 'ETH' : 'SOL') + ' wallet');
      ownedTools.add(toolId);
      loadMyTools();
      loadTools();
      activateToolFeatures(toolId);
    } catch (e) { global.toast('Purchase failed: ' + e.message); }
  };

  global.activateTool = function (toolId) {
    activateToolFeatures(toolId);
  };

  function activateToolFeatures(toolId) {
    switch (toolId) {
      case 'rug_safety_net':
        global.toast('🛡️ Rug Safety Net: Real-time monitoring activated');
        if (global.SafetyEngine) global.SafetyEngine.enableRealTimeMonitoring();
        break;
      case 'sniper_bot_pro':
        global.toast('🎯 Sniper Bot Pro: Auto-snipe ready');
        if (global.SniperBot) global.SniperBot.enable();
        break;
      case 'portfolio_tracker':
        global.toast('📊 Portfolio Tracker Pro: Advanced analytics enabled');
        if (global.PortfolioPro) global.PortfolioPro.enable();
        break;
      case 'whale_tracker':
        global.toast('🐋 Whale Tracker: Alerts activated');
        if (global.WhaleTracker) global.WhaleTracker.enableAlerts();
        break;
      default:
        global.toast('Tool activated: ' + toolId);
    }
  }

  global.renderTools = function () {
    loadTools();
    loadMyTools();
  };

  global.renderPage = global.renderPage || {};
  global.renderPage.tools = global.renderTools;
})(window);
