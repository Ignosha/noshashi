
(function () {
  /* Keep the chosen reading mode local to this device. No preference leaves
     the OS/browser choice in charge, which is the safest first visit. */
  var themeToggle = document.getElementById("themeToggle");
  var themeLabel = document.getElementById("themeLabel");
  var savedTheme = "";
  try { savedTheme = localStorage.getItem("noshashi-theme") || ""; } catch (e) {}
  if (savedTheme === "light" || savedTheme === "dark") document.documentElement.setAttribute("data-theme", savedTheme);
  function updateThemeButton() {
    var light = document.documentElement.getAttribute("data-theme") === "light";
    var map = window.__NOSHASHI_I18N || {};
    if (themeLabel) themeLabel.textContent = map[light ? "theme.dark" : "theme.light"] || (light ? "DARK" : "LIGHT");
    if (themeToggle) themeToggle.setAttribute("aria-label", map[light ? "theme.ariaDark" : "theme.ariaLight"] || (light ? "Switch to dark mode" : "Switch to light mode"));
  }
  updateThemeButton();
  if (themeToggle) themeToggle.addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("noshashi-theme", next); } catch (e) {}
    updateThemeButton();
  });

  /* Hash copies are deliberately small and explicit: verification belongs
     in the operator's workflow, not hidden behind a secondary page. */
  document.querySelectorAll('.copyhash').forEach(function (button) {
    button.addEventListener('click', function () {
      var value = button.getAttribute('data-copy');
      if (!value || !navigator.clipboard) return;
      navigator.clipboard.writeText(value).then(function () {
        var original = button.textContent;
        button.textContent = 'COPIED';
        button.classList.add('done');
        setTimeout(function () {
          button.textContent = original;
          button.classList.remove('done');
        }, 1400);
      });
    });
  });

  /* Scroll reveals. */
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '-60px' });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  }

  /*
   * Live XRPL telemetry.
   *
   * The same public WebSocket the desktop app uses. Two rules: it never
   * shows a number it did not receive, and if the socket fails it says
   * OFFLINE rather than leaving a stale figure on screen looking live.
   * A marketing page that fakes a ticker is exactly the thing this
   * product exists to argue against.
   */
  var $ = function (id) { return document.getElementById(id); };
  var state = $('tk-state');
  if (!state) return;

  var ENDPOINTS = ['wss://xrplcluster.com', 'wss://s1.ripple.com', 'wss://s2.ripple.com'];
  var idx = 0, ws = null, lastClose = 0, retry = 0;

  function set(id, value, cls) {
    var el = $(id); if (!el) return;
    el.textContent = value;
    el.className = cls || '';
  }

  function down(reason) {
    set('tk-state', reason, 'down');
    ['tk-ledger', 'tk-tx', 'tk-fee', 'tk-close', 'tk-xrp', 'tk-spread']
      .forEach(function (k) { set(k, '—'); });
  }

  /*
   * XRP price, taken from the ledger rather than from a price feed.
   *
   * Both sides of the XRP/RLUSD book are read and only offers their owners can
   * actually honour are counted. An offer whose owner has since spent the asset
   * still rests in the book and still quotes a price nobody can take; that is
   * the same correction the order-book tool makes, and it is why this is
   * labelled the spread you can fill rather than the spread.
   *
   * RLUSD rather than an exchange-issued USD because its book is far tighter,
   * and a midpoint across a wide spread is close to meaningless.
   *
   * Same rule as the rest of this ticker: if either side cannot be read the
   * price returns to a dash. A stale price, on a page that argues against
   * stale numbers, would be indefensible.
   */
  var RLUSD = {
    currency: '524C555344000000000000000000000000000000',
    issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'
  };
  var XRPCUR = { currency: 'XRP' };
  var priceReq = 100, pending = {}, priceTimer = null;

  function val(a) { return typeof a === 'object' ? Number(a.value) : Number(a) / 1e6; }

  /* taker_gets_funded appears only when the owner cannot cover the listed
     amount, so its absence means fully funded. */
  function bestPrice(offers, side) {
    var best = null;
    for (var i = 0; i < offers.length; i++) {
      var o = offers[i];
      var gets = val(o.TakerGets), pays = val(o.TakerPays);
      if (!(gets > 0) || !(pays > 0)) continue;
      var funded = o.taker_gets_funded !== undefined ? val(o.taker_gets_funded) : gets;
      if (!(funded > 0)) continue;
      var px = side === 'ask' ? pays / gets : gets / pays;
      if (best === null) best = px;
      else if (side === 'ask') { if (px < best) best = px; }
      else if (px > best) best = px;
    }
    return best;
  }

  function paintPrice() {
    var bid = pending.bid, ask = pending.ask;
    if (typeof bid !== 'number' || typeof ask !== 'number' || !(ask > 0) || !(bid > 0)) {
      set('tk-xrp', '—'); set('tk-spread', '—');
      return;
    }
    var mid = (bid + ask) / 2;
    set('tk-xrp', '$' + mid.toFixed(4));
    set('tk-spread', (((ask - bid) / mid) * 100).toFixed(2) + '%');
  }

  function requestPrice() {
    if (!ws || ws.readyState !== 1) return;
    pending = {};
    var askId = ++priceReq, bidId = ++priceReq;
    pending.askId = askId; pending.bidId = bidId;
    try {
      /* Offers giving XRP for RLUSD are the asks; the mirror book is the bids. */
      ws.send(JSON.stringify({ id: askId, command: 'book_offers',
        taker_gets: XRPCUR, taker_pays: RLUSD, limit: 30 }));
      ws.send(JSON.stringify({ id: bidId, command: 'book_offers',
        taker_gets: RLUSD, taker_pays: XRPCUR, limit: 30 }));
    } catch (e) { /* the socket handlers deal with it */ }
  }

  function connect() {
    try { ws = new WebSocket(ENDPOINTS[idx % ENDPOINTS.length]); }
    catch (e) { return down('OFFLINE'); }

    ws.onopen = function () {
      retry = 0;
      set('tk-state', 'LIVE', 'live');
      ws.send(JSON.stringify({ id: 1, command: 'subscribe', streams: ['ledger'] }));
      requestPrice();
      if (priceTimer) clearInterval(priceTimer);
      priceTimer = setInterval(requestPrice, 20000);
    };

    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }

      if (m.id === pending.askId || m.id === pending.bidId) {
        var bo = m.result && m.result.offers;
        if (!bo) { paintPrice(); return; }
        if (m.id === pending.askId) pending.ask = bestPrice(bo, 'ask');
        else pending.bid = bestPrice(bo, 'bid');
        paintPrice();
        return;
      }

      if (m.type !== 'ledgerClosed') return;
      set('tk-ledger', Number(m.ledger_index).toLocaleString());
      set('tk-tx', String(m.txn_count));
      /* fee_base is in drops. */
      set('tk-fee', (Number(m.fee_base) / 1e6).toFixed(5) + ' XRP');
      var now = Date.now();
      if (lastClose) set('tk-close', ((now - lastClose) / 1000).toFixed(1) + ' s');
      lastClose = now;
    };

    ws.onclose = function () {
      if (priceTimer) { clearInterval(priceTimer); priceTimer = null; }
      idx += 1; retry += 1;
      down(retry > 3 ? 'OFFLINE' : 'RECONNECTING');
      /* Back off rather than hammering a public node. */
      if (retry <= 6) setTimeout(connect, Math.min(1000 * retry * retry, 15000));
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  connect();
  /* Stop the socket when the tab is hidden — a marketing page has no
     business holding a subscription open in a background tab. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && ws) { try { ws.close(); } catch (e) {} }
    else if (!document.hidden && (!ws || ws.readyState > 1)) { retry = 0; connect(); }
  });
})();
