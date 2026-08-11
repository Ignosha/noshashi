/* IGNOSHASHI - API & WebSocket client */
(function (global) {
  'use strict';

  if (!window.global) window.global = global;

  const WS_PROTO = location.protocol === 'https:' ? 'wss://' : 'ws://';
  const WS_URL = WS_PROTO + location.host;
  const API_BASE = (location.port === '3000' || location.hostname === 'localhost' && !location.port) ? '' : 'http://localhost:3000';
  const RATE_LIMIT_MS = 100;
  let lastRequestTime = 0;

  function sanitizeBody(body) {
    if (!body || typeof body !== 'object') return {};
    const out = {};
    for (const key of Object.keys(body)) {
      const val = body[key];
      if (typeof val === 'string') {
        out[key] = val.replace(/[<>"'&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;', '&': '&amp;' })[c]).slice(0, 10000);
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        out[key] = val;
      } else if (Array.isArray(val)) {
        out[key] = val.slice(0, 100);
      } else if (val && typeof val === 'object') {
        out[key] = sanitizeBody(val);
      }
    }
    return out;
  }

  async function rateLimit() {
    const now = Date.now();
    const wait = RATE_LIMIT_MS - (now - lastRequestTime);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRequestTime = Date.now();
  }

  global.API = {
    async get(url) {
      await rateLimit();
      const r = await fetch(API_BASE + url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    },
    async post(url, body) {
      await rateLimit();
      const sanitized = sanitizeBody(body);
      const r = await fetch(API_BASE + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(sanitized),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Request failed');
      return j;
    },
    async del(url, body) {
      await rateLimit();
      const sanitized = sanitizeBody(body);
      const r = await fetch(API_BASE + url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(sanitized),
      });
      return r.json();
    },
  };

  // Shared app state
  global.STATE = {
    tokens: [],
    trades: [],
    earnings: [],
    connected: false,
    wallet: null,
    network: 'solana', // toggled
    platformFee: 2,
    feeETH: '',
    feeSOL: '',
    ws: null,
    currentTokenId: null,
    watchAdded: new Set(),
    handlers: {},
  };

  // WebSocket
  global.WS = {
    connect() {
      try {
        const ws = new WebSocket(WS_URL);
        STATE.ws = ws;
        ws.onmessage = (ev) => {
          let msg;
          try { msg = JSON.parse(ev.data); } catch (e) { return; }
          if (msg.type === 'init') {
            STATE.tokens = msg.tokens || [];
            STATE.trades = msg.trades || [];
            STATE.platformFee = msg.platformFee || 2;
            STATE.feeETH = msg.feeETH || '';
            STATE.feeSOL = msg.feeSOL || '';
          }
          if (STATE.handlers[msg.type]) STATE.handlers[msg.type](msg);
          if (STATE.handlers['*']) STATE.handlers['*'](msg);
        };
        ws.onclose = () => setTimeout(() => global.WS.connect(), 2000);
      } catch (e) { /* ignore */ }
    },
    on(type, fn) { STATE.handlers[type] = fn; },
  };

  global.fmt = {
    num(n, dp) {
      if (n == null || isNaN(n)) return '0';
      if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(dp || 2) + 'B';
      if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(dp || 2) + 'M';
      if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(dp || 1) + 'K';
      return (Number(n) || 0).toFixed(dp == null ? 2 : dp);
    },
    usd(n) {
      return '$' + global.fmt.num(n || 0);
    },
    price(n) {
      if (n == null || n === 0 || isNaN(n)) return '0.0000';
      return Number(n).toPrecision(4);
    },
    time(ts) {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour12: false });
    },
    shortAddr(a) {
      if (!a) return 'anon';
      a = String(a);
      return a.length > 12 ? a.slice(0, 6) + '...' + a.slice(-4) : a;
    },
    avatar(symbol) {
      const s = String(symbol || 'X').toUpperCase();
      const emojis = ['🪙','🚀','👾','🌌','⚡','🛸','🌠','💎','🪐','🌟','🐸','🦍','🧨','🔮','🗡️','👑'];
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return emojis[Math.abs(h) % emojis.length];
    },
  };
})(window);

