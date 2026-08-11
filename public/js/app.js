/* IGNOSHASHI - app router, starfield, shared UI */
(function (global) {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ---------- Starfield (kinetic pixel visuals) ---------- */
  const canvas = $('#starfield');
  const ctx = canvas.getContext('2d');
  let stars = [];
  function initStars() {
    stars = [];
    const n = Math.floor((canvas.width * canvas.height) / 900);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: ((i * 137 + 42) % canvas.width),
        y: ((i * 251 + 73) % canvas.height),
        z: 0.5 + (i % 3) * 0.5,
        size: i % 2 === 0 ? 2 : 1,
      });
    }
  }
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initStars();
  }
  window.addEventListener('resize', resize);
  resize();

  let mouseX = 0;
  window.addEventListener('mousemove', (e) => { mouseX = e.clientX; });

  let shootingStarFrame = 0;
  function drawStars(t) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const base = ctx.createLinearGradient(0, 0, 0, canvas.height);
    base.addColorStop(0, '#0a0a14');
    base.addColorStop(1, '#06060d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // nebula pulses
    ctx.globalAlpha = 0.15;
    const cx = canvas.width * 0.5 + Math.sin(t / 4000) * canvas.width * 0.1;
    const cy = canvas.height * 0.35;
    const r = canvas.height * 0.4;
    const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    ng.addColorStop(0, '#32f2ff');
    ng.addColorStop(0.5, '#b46bff');
    ng.addColorStop(1, 'transparent');
    ctx.fillStyle = ng;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;

    // parallax starfield
    for (const s of stars) {
      s.y += s.z * 0.3;
      s.x += (mouseX - canvas.width / 2) * 0.00002 * s.z;
      if (s.y > canvas.height) { s.y = 0; s.x = ((s.x + 42) % canvas.width); }
      if (s.x > canvas.width) s.x = 0;
      if (s.x < 0) s.x = canvas.width;
      ctx.fillStyle = s.size > 1 ? '#ffffff' : 'rgba(200,220,255,0.7)';
      ctx.shadowBlur = s.size > 1 ? 6 : 0;
      ctx.shadowColor = s.size > 1 ? '#32f2ff' : '';
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.shadowBlur = 0;

    // occasional shooting star
    shootingStarFrame++;
    if (shootingStarFrame % 250 === 0) {
      const sx = ((shootingStarFrame * 137) % canvas.width);
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx - 60, 60);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  requestAnimationFrame(drawStars);

  /* ---------- Routing ---------- */
  let currentPage = 'home';
  function showPage(name) {
    currentPage = name;
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + name));
    $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === name));
    global.renderPage && global.renderPage[name] && global.renderPage[name]();
    window.scrollTo(0, 0);
    if (global.SoundEngine && global.SoundEngine.clickBlip) global.SoundEngine.clickBlip();
  }
  $$('.nav-item').forEach((btn) =>
    btn.addEventListener('click', () => showPage(btn.dataset.page))
  );
  $$('[data-nav]').forEach((btn) =>
    btn.addEventListener('click', () => showPage(btn.dataset.nav))
  );

  /* Home page token filters */
  $$('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      const grid = document.getElementById('homeTokenGrid');
      if (!grid) return;
      let tokens = (global.STATE.tokens || []).slice();
      if (filter === 'solana') tokens = tokens.filter(t => (t.network || 'solana') === 'solana');
      else if (filter === 'ethereum') tokens = tokens.filter(t => (t.network || 'solana') === 'ethereum');
      else if (filter === 'verified') tokens = tokens.filter(t => t.verified);
      else if (filter === 'graduated') tokens = tokens.filter(t => t.graduated);
      else if (filter === 'trending') tokens = tokens.filter(t => (t.volume || 0) > 10000);
      tokens.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
      grid.innerHTML = tokens.length ? tokens.map(t => global.tokenCard(t)).join('') : '<p class="dim pixel small">No tokens match filter</p>';
    });
  });

  /* Trending tags */
  $$('.trending-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const query = tag.textContent.replace('#', '').toLowerCase();
      const search = document.getElementById('globalSearch');
      if (search) {
        search.value = query;
        search.dispatchEvent(new Event('input'));
        search.focus();
      }
    });
  });

  /* Search dropdown */
  const searchInput = document.getElementById('globalSearch');
  const searchDropdown = document.getElementById('searchDropdown');
  if (searchInput && searchDropdown) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      if (!q) { searchDropdown.classList.add('hidden'); return; }
      const filtered = (global.STATE.tokens || []).filter(t => t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q)).slice(0, 10);
      searchDropdown.innerHTML = filtered.length ? filtered.map(t => `<div class="token-row" onclick="global.selectToken('${t.id}');document.getElementById('searchDropdown').classList.add('hidden')">
        <div class="token-avatar">${global.fmt.avatar(t.symbol)}</div>
        <div class="token-info"><div class="token-name">${t.name}</div><div class="token-sym">$${t.symbol}</div></div>
        <div class="token-stat"><div class="token-price">${global.fmt.usd(t.marketCap||0)}</div></div>
      </div>`).join('') : '<p class="dim pixel tiny">No results</p>';
      searchDropdown.classList.remove('hidden');
    });
    document.addEventListener('click', (e) => { if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) searchDropdown.classList.add('hidden'); });
  }

  /* Token detail nav support */
  $$('[data-token-id]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); global.showPage('token'); setTimeout(() => global.renderTokenDetail && global.renderTokenDetail(el.dataset.tokenId), 50); });
  });

  /* Modal buttons */
  document.getElementById('btnLimitModal') && document.getElementById('btnLimitModal').addEventListener('click', () => { document.getElementById('modalLimitOrder').classList.remove('hidden'); });
  document.getElementById('btnSniperModal') && document.getElementById('btnSniperModal').addEventListener('click', () => { document.getElementById('modalSniper').classList.remove('hidden'); });

  global.showPage = showPage;

  /* Loading screen */
  function initLoadingScreen() {
    const screen = document.getElementById('loadingScreen');
    const bar = document.getElementById('loadingBar');
    const text = document.getElementById('loadingText');
    if (!screen || !bar || !text) return;
    const steps = [
      { pct: 20, msg: 'LOADING STAR MAP_' },
      { pct: 40, msg: 'CONNECTING TO GALAXY_' },
      { pct: 60, msg: 'SCANNING MEME COINS_' },
      { pct: 80, msg: 'CALIBRATING CHARTS_' },
      { pct: 100, msg: 'READY_' },
    ];
    let i = 0;
    const interval = setInterval(() => {
      if (i < steps.length) {
        bar.style.width = steps[i].pct + '%';
        text.textContent = steps[i].msg;
        i++;
      } else {
        clearInterval(interval);
        screen.style.transition = 'opacity 0.5s';
        screen.style.opacity = '0';
        setTimeout(() => { try { screen.remove(); } catch(e) {} }, 500);
      }
    }, 400);
    setTimeout(() => {
      screen.style.transition = 'opacity 0.5s';
      screen.style.opacity = '0';
      setTimeout(() => { try { screen.remove(); } catch(e) {} }, 500);
    }, 5000);
  }
  initLoadingScreen();

  /* Safety fallback: force-hide loading screen after 6s no matter what */
  setTimeout(() => {
    const screen = document.getElementById('loadingScreen');
    if (screen) {
      screen.style.transition = 'opacity 0.5s';
      screen.style.opacity = '0';
      setTimeout(() => { try { screen.remove(); } catch(e) {} }, 500);
    }
    const pre = document.getElementById('preloader');
    if (pre) {
      pre.style.transition = 'opacity 0.5s';
      pre.style.opacity = '0';
      setTimeout(() => { try { pre.remove(); } catch(e) {} }, 500);
    }
  }, 6000);

  /* Error handling */
  window.addEventListener('error', (e) => {
    const src = e.filename || '';
    if (src.includes('/vendor/metamask-sdk') || src.includes('/vendor/walletconnect') || src.includes('/vendor/ethers') || src.includes('/vendor/solana-web3')) return;
    console.error('[IGNOSHASHI]', e.message);
    global.toast && global.toast('⚠️ Error: ' + e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[IGNOSHASHI] Unhandled:', e.reason);
    global.toast && global.toast('⚠️ Error: ' + (e.reason?.message || 'Unknown'));
  });

  /* Gas widget refresh */
  setInterval(() => { if (global.loadGas) global.loadGas(); }, 30000);
  if (global.loadGas) global.loadGas();

  /* ---------- Chain status indicator (static SOLANA) ---------- */
  function renderChainStatus() {
    API.get('/api/chain').then((c) => {
      let label = '⚙️ CHAIN: SOLANA MAINNET';
      const el = $('#chainStatus');
      if (el) {
        el.textContent = label;
        el.classList.add('live');
        el.classList.remove('sim');
        el.title = `SOLANA: ${c.solana || 'SIMULATED'}\nRPC: ${c.solanaRpc || 'local'}`;
      }
    }).catch(() => {
      const el = $('#chainStatus');
      if (el) {
        el.textContent = '⚙️ CHAIN: SOLANA MAINNET';
        el.classList.add('live');
      }
    });
  }
  renderChainStatus();
  setInterval(renderChainStatus, 30000);

/* ---------- Wallet connect ---------- */
  const walletBox = $('#walletBox');
  walletBox.addEventListener('click', () => {
    if (global.connectWallet) global.connectWallet();
    else toast('Wallet module still loading...');
  });
  global.updateWalletUI = function () {
    if (STATE.connected && STATE.wallet) {
      walletBox.classList.add('connected');
      $('#walletAddress').textContent = global.fmt.shortAddr(STATE.wallet);
      const picEl = document.getElementById('walletProfilePic');
      if (picEl) {
        const pic = global.getProfilePic ? global.getProfilePic(STATE.wallet) : '';
        if (pic) {
          picEl.src = pic;
          picEl.style.display = 'inline-block';
          picEl.onerror = () => { picEl.style.display = 'none'; };
        } else {
          picEl.style.display = 'none';
        }
      }
    } else {
      walletBox.classList.remove('connected');
      $('#walletAddress').textContent = '⛓ Connect';
      const picEl = document.getElementById('walletProfilePic');
      if (picEl) picEl.style.display = 'none';
    }
  };

  /* ---------- Toast ---------- */
  global.toast = function (msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.add('hidden'), 3000);
    if (global.SoundEngine && global.SoundEngine.blip) global.SoundEngine.blip();
  };

  global.copyToClipboard = function (elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = el.textContent || el.value || '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        global.toast('Copied: ' + text.slice(0, 20) + (text.length > 20 ? '...' : ''));
      }).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  };

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      global.toast('Copied: ' + text.slice(0, 20) + (text.length > 20 ? '...' : ''));
    } catch (e) {
      global.toast('Copy failed. Please copy manually.');
    }
  }

  /* ---------- Support wallet display ---------- */
  function updateSupportWallets() {
    const ethEl = document.getElementById('supportEthAddr');
    const solEl = document.getElementById('supportSolAddr');
    if (ethEl && STATE.feeWalletETH) ethEl.textContent = STATE.feeWalletETH;
    if (solEl && STATE.feeWalletSOL) solEl.textContent = STATE.feeWalletSOL;
  }

  /* ---------- Notification system ---------- */
  let notifications = [];
  global.addNotification = function (msg, type = 'info') {
    notifications.push({ msg, type, time: Date.now() });
    if (notifications.length > 50) notifications.shift();
    renderNotifications();
    if (global.SoundEngine && global.SoundEngine.notifyBlip) global.SoundEngine.notifyBlip();
  };

  function renderNotifications() {
    const container = document.getElementById('notificationPanel');
    if (!container) return;
    container.innerHTML = notifications.slice(-10).map((n) => `
      <div class="notification-item ${n.type}">
        <span class="notification-time pixel tiny dim">${global.fmt.time(n.time)}</span>
        <span class="notification-msg pixel small">${n.msg}</span>
      </div>
    `).join('') || '<p class="dim pixel tiny">No notifications</p>';
  }

  const notifBtn = document.getElementById('notificationBtn');
  if (notifBtn) {
    notifBtn.addEventListener('click', () => {
      const panel = document.getElementById('notificationPanel');
      panel.classList.toggle('hidden');
    });
  }

  global.WS.on('community-message', (msg) => {
    if (msg.message && msg.message.user !== (global.STATE.wallet || '')) {
      global.addNotification(`New message in #${msg.channelId || 'chat'}: ${msg.message.text.slice(0, 50)}...`, 'chat');
    }
  });

  global.WS.on('community-like', (msg) => {
    if (msg.user !== (global.STATE.wallet || '')) {
      global.addNotification(`Your video got a like!`, 'like');
    }
  });

  global.WS.on('community-comment', (msg) => {
    if (msg.comment && msg.comment.user !== (global.STATE.wallet || '')) {
      global.addNotification(`New comment on your video`, 'comment');
    }
  });

  /* ---------- Graduation overlay ---------- */
  global.showGraduation = function (name) {
    $('#gradName').textContent = name;
    $('#gradOverlay').classList.remove('hidden');
    $('#gradMsg').textContent = 'has ascended to the outer rim!';
    if (global.SoundEngine && global.SoundEngine.successBlip) global.SoundEngine.successBlip();
  };
  $('#gradClose').addEventListener('click', () => $('#gradOverlay').classList.add('hidden'));

  /* ---------- Home page render ---------- */
  function renderHome() {
    const tokens = STATE.tokens;
    animateCounter('statTokens', tokens.length);
    const vol = tokens.reduce((a, t) => a + (t.volume || 0), 0);
    animateCounter('statVolume', vol, true);
    const leader = tokens.slice().sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))[0];
    $('#statLeader').textContent = leader ? '$' + leader.symbol : 'NONE';
    const totalMcap = tokens.reduce((a, t) => a + (t.marketCap || 0), 0);
    animateCounter('statMarketCap', totalMcap, true);
    API.get('/api/active-traders').then((r) => animateCounter('statTraders', r.activeTraders || 0)).catch(() => {});
    animateCounter('statGraduated', graduated);

    // Token of the day
    const tod = tokens.slice().sort((a, b) => (b.volume || 0) - (a.volume || 0))[0];
    if (tod) {
      $('#todName').textContent = tod.name;
      $('#todSymbol').textContent = '$' + tod.symbol;
      $('#todDesc').textContent = tod.description || 'Top trending token today';
      const todId = document.getElementById('todId');
      if (todId) todId.textContent = tod.id;
    }

    // announcements (fetch)
    API.get('/api/announcements').then((r) => {
      $('#homeAnnounceList').innerHTML = (r.announcements || [])
        .slice(0, 4)
        .map((a) => `<div class="ann-item"><span class="ann-icon">${a.icon}</span><span class="ann-text">${a.text}</span><span class="ann-time">${global.fmt.time(a.time)}</span></div>`)
        .join('') || '<p class="dim pixel small">No announcements yet</p>';
    }).catch(() => {});

    // leaders
    const top = tokens.slice().sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 5);
    $('#homeLeaders').innerHTML = top.length
      ? top.map((t, i) => tokenMini(t, i + 1)).join('')
      : '<p class="dim pixel small">Be the first to launch!</p>';

    // all tokens grid with holographic effect
    $('#homeTokenGrid').innerHTML = tokens.length
      ? tokens.map((t) => tokenCard(t)).join('')
      : '<p class="dim pixel small">No tokens yet — launch the first meme coin!</p>';

    // dynamic trending tags from live token symbols
    const tagsEl = document.getElementById('trendingTags');
    if (tagsEl) {
      const symbols = tokens.slice(0, 12).map(t => t.symbol).filter(Boolean);
      const unique = Array.from(new Set(symbols));
      tagsEl.innerHTML = unique.length
        ? unique.map(s => `<span class="trending-tag">#${s.toLowerCase()}</span>`).join('')
        : '<span class="pixel tiny dim">No tags yet</span>';
    }

    // Market overview
    const marketEl = document.getElementById('marketOverview');
    if (marketEl) {
      const totalVol = tokens.reduce((a, t) => a + (t.volume || 0), 0);
      const totalMcap = tokens.reduce((a, t) => a + (t.marketCap || 0), 0);
      const avgPrice = tokens.length ? tokens.reduce((a, t) => a + (t.marketCap || 0) / (t.supply || 1), 0) / tokens.length : 0;
      marketEl.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="pixel tiny dim">TOTAL VOLUME</div><div class="pixel small">${global.fmt.usd(totalVol)}</div>
          <div class="pixel tiny dim">TOTAL MKTCAP</div><div class="pixel small">${global.fmt.usd(totalMcap)}</div>
          <div class="pixel tiny dim">AVG PRICE</div><div class="pixel small">${global.fmt.price(avgPrice)}</div>
          <div class="pixel tiny dim">TOKENS</div><div class="pixel small">${tokens.length}</div>
        </div>`;
    }

    // Recent trades
    const tradesEl = document.getElementById('recentTrades');
    if (tradesEl) {
      API.get('/api/trades/recent').then((r) => {
        const trades = (r.trades || []).slice(0, 8);
        tradesEl.innerHTML = trades.length ? trades.map(t => {
          const isBuy = t.side === 'buy';
          const token = tokens.find(tok => tok.id === t.tokenId) || { symbol: '???', name: 'Unknown' };
          return `<div class="token-row">
            <div class="token-info"><div class="token-name">${token.name || token.symbol}</div><div class="token-sym">${global.fmt.time(t.timestamp)}</div></div>
            <div class="token-stat"><div class="token-price" style="color:${isBuy?'var(--green)':'var(--red)'}">${isBuy?'BUY':'SELL'} ${global.fmt.num(t.amount || 0)}</div></div>
          </div>`;
        }).join('') : '<p class="dim pixel small">No recent trades</p>';
      }).catch(() => { tradesEl.innerHTML = '<p class="dim pixel small">No recent trades</p>'; });
    }

    // Top movers
    const moversEl = document.getElementById('topMovers');
    if (moversEl) {
      const sorted = tokens.slice().sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 10);
      moversEl.innerHTML = sorted.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">` + sorted.map((t, i) => {
        return `<div class="token-row" style="cursor:pointer" onclick="global.selectToken('${t.id}')">
          <div class="token-avatar">${global.fmt.avatar(t.symbol)}</div>
          <div class="token-info"><div class="token-name">${t.name}</div><div class="token-sym">$${t.symbol}</div></div>
          <div class="token-stat"><div class="token-price">VOL ${global.fmt.usd(t.volume || 0)}</div></div>
        </div>`;
      }).join('') + `</div>` : '<p class="dim pixel small">No tokens yet</p>';
    }
  }

  function showError(msg) {
    global.toast && global.toast('Error: ' + msg);
    console.error('[IGNOSHASHI]', msg);
  }

  function retry(fn, retries = 3) {
    return fn().catch((e) => retries > 0 ? retry(fn, retries - 1) : Promise.reject(e));
  }

  /* Animated counter that counts up to target value */
  function animateCounter(elementId, target, isCurrency = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const duration = 1200;
    const start = 0;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (target - start) * eased;
      el.textContent = isCurrency ? global.fmt.usd(current) : global.fmt.num(current);
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  function tokenMini(t, rank) {
    const safety = t.safetyScore != null ? t.safetyScore : 50;
    const safetyColor = safety >= 80 ? 'var(--green)' : safety >= 50 ? 'var(--yellow)' : 'var(--red)';
    return `<div class="token-row" onclick="location.hash='#/trade'; selectToken('${t.id}')">
      <span class="pixel" style="color:${rank<=3?'var(--yellow)':'var(--dim)'}">${rank}</span>
      <div class="token-avatar">${global.fmt.avatar(t.symbol)}${t.verified ? ' ✅' : ''}</div>
      <div class="token-info">
        <div class="token-name">${t.name} ${t.graduated ? '🎓' : ''}</div>
        <div class="token-sym">$${t.symbol}</div>
      </div>
      <div class="token-stat">
        <div class="token-price">${global.fmt.usd(t.marketCap || 0)}</div>
        <div class="token-vol">● ${global.fmt.num(t.volume || 0)}</div>
        <div class="token-cap" style="color:${safetyColor}">SAFETY ${safety}/100</div>
      </div>
      <button class="pixel-btn small" onclick="event.stopPropagation(); global.publishToPump && global.publishToPump('${t.id}')">🎰 PUMP</button>
    </div>`;
  }

  function tokenCard(t) {
    const safety = t.safetyScore != null ? t.safetyScore : 50;
    const safetyColor = safety >= 80 ? 'var(--green)' : safety >= 50 ? 'var(--yellow)' : 'var(--red)';
    const dexLink = t.dexUrl ? ` <a href="${t.dexUrl}" target="_blank" rel="noopener" class="txlink pixel tiny" style="color:var(--green)">🔄 DEX</a>` : '';
    const sparkId = 'spark-' + t.id;
    const sparkCanvas = `<canvas class="sparkline" id="${sparkId}" width="60" height="24"></canvas>`;
    setTimeout(() => drawSparkline(sparkId, t.priceHistory || []), 0);
    return `<div class="token-row" onclick="location.hash='#/trade'; selectToken('${t.id}')">
      <div class="token-avatar">${global.fmt.avatar(t.symbol)}${t.verified ? ' ✅' : ''}</div>
      <div class="token-info">
        <div class="token-name">${t.name} ${t.graduated ? '🎓' : ''}${dexLink}</div>
        <div class="token-sym">$${t.symbol} <span class="dim" style="font-family:var(--font-term);font-size:14px">${t.network}</span></div>
        <div class="token-meta">${t.description || ''}</div>
      </div>
      <div class="token-stat">
        <div class="token-price">${global.fmt.usd(t.marketCap || 0)}</div>
        <div class="token-cap">MC</div>
        <div class="token-vol">vol ${global.fmt.num(t.volume || 0)}</div>
        <div class="token-cap" style="color:${safetyColor}">SAFETY ${safety}/100</div>
      </div>
      <div class="spark-wrap">${sparkCanvas}</div>
      <button class="pixel-btn small" onclick="event.stopPropagation(); global.publishToPump && global.publishToPump('${t.id}')" title="Publish to pump.fun">🎰</button>
    </div>`;
  }

  function drawSparkline(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#32f2ff';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#32f2ff';
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  global.renderPage = {
    home: renderHome,
    leaderboard: global.renderLeaderboard,
    traders: () => global.renderPage && global.renderPage.traders && global.renderPage.traders(),
    rank: () => global.populateTokenSelects && global.populateTokenSelects(),
    watchlist: global.renderWatchlist,
    portfolio: () => global.renderPortfolio && global.renderPortfolio(),
    launchpad: () => global.renderLaunchpad && global.renderLaunchpad(),
    tools: () => global.renderTools && global.renderTools(),
    api: () => global.renderApiPortal && global.renderApiPortal(),
    announce: () => global.renderAnnounce && global.renderAnnounce(),
    earnings: global.renderEarnings,
    pumpfun: () => global.renderPage && global.renderPage.pumpfun && global.renderPage.pumpfun(),
    memecoin: () => global.renderPage && global.renderPage.memecoin && global.renderPage.memecoin(),
    alerts: () => global.renderPage && global.renderPage.alerts && global.renderPage.alerts(),
    whale: () => { if (global.loadWhales) global.loadWhales(); },
    terminal: () => global.renderPage && global.renderPage.terminal && global.renderPage.terminal(),
    settings: () => global.renderPage && global.renderPage.settings && global.renderPage.settings(),
    help: () => global.renderPage && global.renderPage.help && global.renderPage.help(),
    achievements: () => global.renderPage && global.renderPage.achievements && global.renderPage.achievements(),
    dashboard: () => global.renderPage && global.renderPage.dashboard && global.renderPage.dashboard(),
    history: () => global.renderPage && global.renderPage.history && global.renderPage.history(),
    token: (id) => global.renderTokenDetail && global.renderTokenDetail(id),
  };

  /* ---------- WebSocket handlers for live updates ---------- */
  WS.on('create', (msg) => {
    renderHome();
    global.refreshTokenSelects();
    // add create line to terminal
    if (global.Terminal && global.Terminal.addLine) global.Terminal.addLine(msg);
    if (global.renderTerminalLines) global.renderTerminalLines();
  });
  WS.on('trade', (msg) => {
    renderHome();
    if (msg && msg.token && msg.token.id) {
      const idx = STATE.tokens.findIndex(t => t.id === msg.token.id);
      if (idx >= 0) {
        STATE.tokens[idx] = { ...STATE.tokens[idx], ...msg.token };
      } else {
        STATE.tokens.push(msg.token);
      }
    }
    if (global.onLiveTrade) global.onLiveTrade(msg);
    if (global.Trade && global.Trade.onLiveTrade) global.Trade.onLiveTrade(msg);
    if (global.renderLeaderboardLive) global.renderLeaderboardLive();
  });
WS.on('*', () => {});
  // Wallet bridge: a Chrome/browser tab connected a real extension wallet
  // and posted its address to the internal server. Adopt it here.
  WS.on('wallet-bridge', (msg) => {
    if (msg && msg.address) {
      STATE.connected = true;
      STATE.wallet = msg.address;
      STATE.walletType = msg.type || 'browser';
      global.userKey = msg.address;
      global.updateWalletUI && global.updateWalletUI();
      if (global.renderWatchlist) global.renderWatchlist();
      global.toast && global.toast('Connected via browser: ' + global.fmt.shortAddr(msg.address));
    }
  });

  // fetch initial state via REST
  API.get('/api/state').then((s) => {
    STATE.tokens = s.tokens || [];
    STATE.trades = s.recentTrades || [];
    STATE.feeWalletETH = s.feeWalletETH || '';
    STATE.feeWalletSOL = s.feeWalletSOL || '';
    global.refreshTokenSelects && global.refreshTokenSelects();
    renderHome();
    global.renderLeaderboard && global.renderLeaderboard();
    global.renderEarnings && global.renderEarnings();
    global.renderAnnounce && global.renderAnnounce();
    global.renderWatchlist && global.renderWatchlist();
    global.renderTerminalLines && global.renderTerminalLines();
    global.renderCommunity && global.renderCommunity();
    updateSupportWallets();
  }).catch(() => {});

  /* ---------- Robust wallet session adoption (connect-back fix) ----------
   * The Chrome-extension bridge persists its real wallet server-side.
   * Poll it (and adopt on boot) so even if the WebSocket missed the event
   * (reconnect, slow bridge), the desktop app still picks up the wallet. */
  function adoptSession() {
    API.get('/api/wallet-session').then((r) => {
      const s = r.session;
      if (s && s.address && !STATE.connected) {
        STATE.connected = true;
        STATE.wallet = s.address;
        STATE.walletType = s.type || 'browser';
        global.userKey = s.address;
        global.updateWalletUI && global.updateWalletUI();
        if (global.renderWatchlist) global.renderWatchlist();
        if (global.renderPortfolio) global.renderPortfolio();
        global.toast && global.toast('Wallet restored: ' + global.fmt.shortAddr(s.address));
      }
    }).catch(() => {});
  }
  adoptSession(); // adopt on boot
  setInterval(adoptSession, 5000); // keep in sync

  WS.connect();

global.tokenMini = tokenMini;
  global.tokenCard = tokenCard;
  global.$ = $;
  global.$$ = $$;

  /* ---------- Star Wars preloader ---------- */
  const preloader = $('#preloader');
  const preFill = $('#preloaderFill');
  const preTip = $('#preloaderTip');
  const tips = [
    'INITIALIZING TERMINAL...',
    'CALIBRATING BONDING CURVE...',
    'CHARGING LIGHTSABERS...',
    'SYNCING ORDERBOOK...',
    'WARMING UP THE ENGINE...',
  ];
  let p = 0;
  let tipIndex = 0;
  const preTimer = setInterval(() => {
    p = Math.min(p + 12, 94);
    if (preFill) preFill.style.width = p + '%';
    if (preTip && tips.length) {
      preTip.textContent = tips[tipIndex % tips.length];
      tipIndex++;
    }
    if (p >= 94) clearInterval(preTimer);
  }, 180);

  function hidePreloader() {
    clearInterval(preTimer);
    if (preFill) preFill.style.width = '100%';
    if (preTip) preTip.textContent = 'BOOT SEQUENCE COMPLETE';
    setTimeout(() => preloader && preloader.classList.add('hide'), 350);
    setTimeout(() => preloader && (preloader.style.display = 'none'), 1200);
  }

  // Hide once initial state has loaded (via REST) and WS connected time
  const preWait = () => {
    try {
      if (STATE.tokens.length > 0 || (STATE.connected === undefined)) hidePreloader();
    } catch (e) { hidePreloader(); }
  };
setTimeout(preWait, 2500);
  setTimeout(hidePreloader, 6000); // safety fallback
  // also hide once state arrives
  API.get('/api/state').then(() => {
    setTimeout(hidePreloader, 300);
  }).catch(() => setTimeout(hidePreloader, 800));

  /* ---------- Utility functions ---------- */
  global.fmt = global.fmt || {};
  global.fmt.shortAddr = (addr) => addr.length > 10 ? addr.slice(0, 6) + '...' + addr.slice(-4) : addr;
  global.fmt.usd = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  global.fmt.time = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };
  global.fmt.avatar = (sym) => (sym || '?').charAt(0).toUpperCase();
  global.fmt.trendIcon = (pct) => pct >= 0 ? '🟢' : '🔴';

  /* ---------- Error handling ---------- */
  window.addEventListener('error', (e) => {
    const src = e.filename || '';
    if (src.includes('/vendor/metamask-sdk') || src.includes('/vendor/walletconnect') || src.includes('/vendor/ethers') || src.includes('/vendor/solana-web3')) return;
    console.error('[IGNOSHASHI]', e.message);
    global.toast && global.toast('⚠️ Error: ' + e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[IGNOSHASHI] Unhandled:', e.reason);
    global.toast && global.toast('⚠️ Error: ' + (e.reason?.message || 'Unknown'));
  });

  /* ---------- Network toggle ---------- */
  const toggleBtn = document.getElementById('toggleNetwork');
  const netBadge = document.getElementById('networkBadge');
  if (toggleBtn && netBadge) {
    toggleBtn.addEventListener('click', () => {
      global.STATE.network = global.STATE.network === 'ethereum' ? 'solana' : 'ethereum';
      localStorage.setItem('igno_network', global.STATE.network);
      updateNetworkBadge();
      global.toast('Network: ' + global.STATE.network.toUpperCase() + ' MAINNET');
    });
  }
  function updateNetworkBadge() {
    if (!netBadge) return;
    const net = global.STATE.network || 'solana';
    netBadge.textContent = net === 'ethereum' ? '⬢ ETHEREUM MAINNET' : '⬢ SOLANA MAINNET';
  }
  updateNetworkBadge();

  /* ---------- Keyboard shortcuts ---------- */
  document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    const map = { t: 'trade', p: 'portfolio', w: 'watchlist', n: 'news', l: 'launchpad', c: 'create', h: 'history' };
    const key = e.key.toLowerCase();
    if (map[key]) global.showPage(map[key]);
  });
})(window);

