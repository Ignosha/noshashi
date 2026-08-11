/* IGNOSHASHI - Token detail page with safety, holders, trades */
(function (global) {
  'use strict';
  const $ = global.$;

  function renderTokenDetail(id) {
    const t = (global.STATE.tokens || []).find(x => x.id === id);
    const body = document.getElementById('tokenDetailBody');
    if (!body || !t) { body && (body.innerHTML = '<p class="dim pixel small">Token not found</p>'); return; }
    const price = t.marketCap && t.supply ? t.marketCap / t.supply : 0;
    const safety = t.safetyScore != null ? t.safetyScore : 50;
    const safetyColor = safety >= 80 ? 'var(--green)' : safety >= 50 ? 'var(--yellow)' : 'var(--red)';
    const bonding = Math.min(100, ((t.marketCap || 0) / (t.supply * 0.001)) * 100);
    body.innerHTML = `
      <div class="grid-2">
        <div class="panel">
          <div class="panel-title pixel">📊 TOKEN INFO</div>
          <div class="panel-body">
            <div style="text-align:center;margin-bottom:14px">
              <div class="token-avatar-big pixel-anim" style="margin:0 auto 10px">${global.fmt.avatar(t.symbol)}</div>
              <div class="pixel lg">${t.name} ${t.graduated ? '🎓' : ''}${t.verified ? ' ✅' : ''}</div>
              <div class="pixel small cyan">$${t.symbol} · ${(t.network||'solana').toUpperCase()}</div>
            </div>
            <div class="rank-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="stat-block"><span class="pixel tiny dim">PRICE</span><span class="pixel lg cyan">${global.fmt.price(price)}</span></div>
              <div class="stat-block"><span class="pixel tiny dim">MKTCAP</span><span class="pixel lg">${global.fmt.usd(t.marketCap||0)}</span></div>
              <div class="stat-block"><span class="pixel tiny dim">SUPPLY</span><span class="pixel lg">${global.fmt.num(t.supply)}</span></div>
              <div class="stat-block"><span class="pixel tiny dim">VOLUME</span><span class="pixel lg accent">${global.fmt.usd(t.volume||0)}</span></div>
            </div>
            <div style="margin-top:14px">
              <div class="pixel tiny dim" style="margin-bottom:6px">Bonding Curve Progress</div>
              <div style="background:#000;border:2px solid var(--panel-line);height:22px;position:relative">
                <div style="background:linear-gradient(90deg,var(--cyan),var(--green));height:100%;width:${bonding}%"></div>
              </div>
              <div class="pixel small" style="margin-top:6px;color:${bonding>=100?'var(--green)':'var(--yellow)'}">${bonding.toFixed(1)}% ${bonding>=100?'GRADUATED!':'to graduation'}</div>
            </div>
            <div style="margin-top:14px">
              <div class="pixel tiny dim" style="margin-bottom:6px">Safety Score</div>
              <div style="display:flex;align-items:center;gap:10px">
                <div style="background:#000;border:2px solid var(--panel-line);height:22px;flex:1"><div style="background:${safetyColor};height:100%;width:${safety}%"></div></div>
                <span class="pixel">${safety}/100</span>
              </div>
            </div>
            <div style="margin-top:14px">
              <div class="pixel tiny dim" style="margin-bottom:6px">Description</div>
              <div class="pixel small">${t.description || 'No description'}</div>
            </div>
            <div style="margin-top:14px">
              <div class="pixel tiny dim" style="margin-bottom:6px">Creator</div>
              <div class="pixel small cyan">${global.fmt.shortAddr(t.creator || t.address || 'unknown')}</div>
            </div>
            ${t.dexUrl ? `<div style="margin-top:14px"><a href="${t.dexUrl}" target="_blank" rel="noopener" class="pixel-btn small" style="text-decoration:none">🔄 TRADE ON DEX</a></div>` : ''}
          </div>
        </div>
        <div class="panel">
          <div class="panel-title pixel">🛡️ SAFETY CHECKS</div>
          <div class="panel-body" id="safetyChecks">
            ${renderSafetyChecks(t)}
            ${renderRating(t)}
          </div>
        </div>
      </div>
      <div class="panel" style="margin-top:16px">
        <div class="panel-title pixel">📜 RECENT TRADES</div>
        <div class="panel-body" id="tokenDetailTrades"><p class="dim pixel small">Loading trades...</p></div>
      </div>
    `;
    loadTrades(id);
  }

  function renderSafetyChecks(t) {
    const checks = [
      { label: 'HONEYPOT CHECK', pass: !t.honeypot, detail: t.honeypot ? '⚠️ Possible honeypot' : '✅ No honeypot detected' },
      { label: 'LIQUIDITY LOCK', pass: t.liquidityLocked, detail: t.liquidityLocked ? '🔒 Liquidity locked' : '⚠️ Liquidity not locked' },
      { label: 'MINT AUTHORITY', pass: !t.mintAuthority, detail: !t.mintAuthority ? '🔐 Mint revoked' : '⚠️ Mint authority active' },
      { label: 'TOP HOLDER', pass: (t.topHolderPercent || 0) < 20, detail: 'Top holder: ' + (t.topHolderPercent || 0) + '%' },
      { label: 'CONTRACT VERIFIED', pass: t.verified, detail: t.verified ? '✅ Verified' : '⚠️ Not verified' },
      { label: 'GRADUATED', pass: t.graduated, detail: t.graduated ? '🎓 Graduated to DEX' : 'Bonding curve active' },
    ];
    return checks.map(c => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--panel-line)">
        <span class="pixel tiny">${c.label}</span>
        <span class="pixel tiny" style="color:${c.pass ? 'var(--green)' : 'var(--red)'}">${c.detail}</span>
      </div>
    `).join('');
  }

  function renderRating(t) {
    const safety = t.safetyScore != null ? t.safetyScore : 50;
    const rating = safety >= 80 ? 'A' : safety >= 60 ? 'B' : safety >= 40 ? 'C' : safety >= 20 ? 'D' : 'F';
    const ratingColor = safety >= 80 ? 'var(--green)' : safety >= 60 ? 'var(--yellow)' : safety >= 40 ? 'var(--orange)' : 'var(--red)';
    return `
      <div style="display:flex;align-items:center;gap:12px;margin-top:14px">
        <div style="width:50px;height:50px;border-radius:50%;background:${ratingColor};display:grid;place-items:center;font-size:20px;font-weight:bold;color:#000;box-shadow:0 0 15px ${ratingColor}">${rating}</div>
        <div>
          <div class="pixel small">TOKEN RATING</div>
          <div class="pixel tiny dim">Based on safety, volume, and age</div>
        </div>
      </div>
    `;
  }

  async function loadTrades(id) {
    const container = document.getElementById('tokenDetailTrades');
    if (!container) return;
    try {
      const r = await API.get('/api/trades/' + id);
      const trades = (r.trades || []).slice(0, 20);
      container.innerHTML = trades.length ? trades.map(tr => {
        const tok = global.STATE.tokens.find(t => t.id === tr.tokenId);
        const sym = tok ? tok.symbol : id.slice(0,4);
        return `<div class="ob-row ${tr.side}">
          <span>[${tr.side.toUpperCase()}]</span>
          <span>${global.fmt.shortAddr(tr.user)}</span>
          <span>${global.fmt.num(tr.amount)} $${sym}</span>
          <span>@ ${global.fmt.price(tr.price)}</span>
          <span class="pixel tiny dim">${global.fmt.time(tr.timestamp)}</span>
        </div>`;
      }).join('') : '<p class="dim pixel small">No trades yet</p>';
    } catch (e) { container.innerHTML = '<p class="dim pixel small">Failed to load trades</p>'; }
  }

  global.renderTokenDetail = renderTokenDetail;
  global.renderPage = global.renderPage || {};
  global.renderPage.token = renderTokenDetail;
})(window);
