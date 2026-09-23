/* IGNOSHASHI - Developer API portal (keys + docs + bot snippets) */
(function (global) {
  'use strict';
  const $ = global.$;

  async function loadKeys() {
    try {
      const r = await API.get('/api/keys');
      const keys = r.keys || [];
      $('#apiKeysList').innerHTML = keys.length ? keys.map(k => `
        <div class="api-key-item">
          <div>
            <div class="pixel small">${k.label}</div>
            <code class="api-key-code">${k.key}</code>
          </div>
          <div style="display:flex;gap:6px">
            <button class="chip" onclick="global.copyToClipboard && global.copyToClipboard('${k.id}')">📋 COPY</button>
            <button class="chip" onclick="global.revokeKey('${k.id}')">🗑</button>
          </div>
        </div>`).join('') : '<p class="dim pixel small">No keys yet. Generate one to start building your bot.</p>';
    } catch (e) {
      $('#apiKeysList').innerHTML = '<p class="dim pixel small">Failed to load keys.</p>';
    }
  }

  global.revokeKey = async function (id) {
    try { await API.del('/api/keys/' + id); global.toast('Key revoked'); loadKeys(); }
    catch (e) { global.toast('Revoke failed: ' + e.message); }
  };

  $('#btnCreateKey').addEventListener('click', async () => {
    const label = $('#apiKeyLabel').value.trim() || 'My bot';
    try {
      const r = await API.post('/api/keys', { label });
      toast('API key generated!');
      $('#apiKeyLabel').value = '';
      loadKeys();
      // auto-fill snippet with the fresh key
      renderSnippet(r.key.key);
    } catch (e) { toast('Generate failed: ' + e.message); }
  });

  async function loadDocs() {
    try {
      const r = await API.get('/api/docs');
      const eps = r.endpoints || [];
      $('#apiEndpoints').innerHTML = `<div class="api-base pixel tiny cyan">BASE: ${r.base}</div>` + eps.map(e => `
        <div class="api-endpoint">
          <span class="api-method ${e.method}">${e.method}</span>
          <code class="api-path">${e.path}</code>
          <span class="api-auth ${e.auth ? 'yes' : 'no'}">${e.auth ? '🔑 KEY' : 'PUBLIC'}</span>
          <div class="api-desc">${e.desc}</div>
        </div>`).join('');
    } catch (e) {
      $('#apiEndpoints').innerHTML = '<p class="dim pixel small">Failed to load docs.</p>';
    }
  }

  function renderSnippet(key) {
    const k = key || 'YOUR_API_KEY';
    $('#apiSnippet').textContent = `// Ignoshashi trade bot example (Node.js)
const API_KEY = '${k}';
const BASE = '${location.origin}';

async function getState() {
  const r = await fetch(BASE + '/api/state');
  return r.json();
}

async function getOHLC(tokenId, tf = '1m') {
  const r = await fetch(BASE + '/api/ohlc/' + tokenId + '?timeframe=' + tf);
  return r.json();
}

async function getIndicators(tokenId) {
  const r = await fetch(BASE + '/api/indicators/' + tokenId);
  return r.json();
}

async function buy(tokenId, cost) {
  const r = await fetch(BASE + '/api/trade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    body: JSON.stringify({ tokenId, side: 'buy', cost, user: 'your_wallet' })
  });
  return r.json();
}

// Live WebSocket feed
const ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://') + location.host + '/api/ws?api_key=' + API_KEY);
ws.onmessage = (e) => console.log('LIVE', JSON.parse(e.data));

// Example: grab indicators for the top token
getState().then(async (s) => {
  const top = s.tokens[0];
  if (top) console.log('OHLC', await getOHLC(top.id, '5m'));
});`;
    try { hl(); } catch (e) {}
  }
  function hl() {}

  // WebSocket live feed subscription (for bots)
  function connectBotWS() {
    // The desktop app uses its own WS; the bot feed is exposed via /api/ws
    // We don't open a second one here to avoid conflicts, but document it.
  }

  global.renderApiPortal = function () { loadKeys(); loadDocs(); renderSnippet(); };
  global.renderPage.api = global.renderApiPortal;
})(window);
