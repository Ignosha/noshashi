/*
 * The Ledger Desk's three live figures, drawn on canvas in the page's own
 * ink and given depth (projection, lit faces, soft contact shadows, light
 * on moving water) rather than flat fills. Everything that moves is data,
 * except the surface's resting swell:
 *
 *   Figure 1  #rh-sky      validated ledgers as blocks; a block's height is
 *                          that ledger's transaction count, on the
 *                          square-root scale marked on the back wall. On
 *                          load the last couple of dozen are read once from
 *                          a public XRPL node (transaction lists and close
 *                          times); after that each new one arrives from the
 *                          public WebSocket (`noshashi:ledger`, dispatched
 *                          by garden-field.js) and lands with a ripple.
 *   Figure 2  #rh-surface  a lit water surface in perspective: rings from
 *                          the issuer outward, labelled with what NOSHASHI
 *                          reads at each. Every validated ledger sends a
 *                          wave across it.
 *   Figure 3  #rh-depth    the XRP / RLUSD book as cumulative depth within
 *                          10% of mid, from /api/book?format=raw (the
 *                          ledger's own book_offers replies), computed the
 *                          way api/_lib/book.js computes it: what can fill
 *                          shaded, what is quoted dashed. Re-read every
 *                          minute while on screen.
 *
 * Frames are drawn only while a figure is on screen and the tab is visible.
 * Under prefers-reduced-motion nothing animates; the figures still update.
 */
(function () {
  "use strict";
  var REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var SERIF = '"Instrument Serif", Georgia, serif';
  var SANS = 'Inter, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
  var RLUSD = { issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", currency: "524C555344000000000000000000000000000000" };
  var BAND = 0.1; // api/_lib/book.js BAND
  var root = document.documentElement;

  function now() { return performance.now() / 1000; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ease(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function fmt(n) { return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
  function compact(n) {
    n = Number(n || 0);
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return fmt(n);
  }
  function set(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }

  /* ── The page's colours, re-read when the theme changes ─────────── */
  var C = { dark: true };
  function rgbOf(value) {
    var v = String(value || "").trim();
    if (v.charAt(0) === "#") {
      var h = v.slice(1);
      if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
      var n = parseInt(h.slice(0, 6), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    var m = v.match(/[\d.]+/g);
    return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [136, 136, 136];
  }
  function readTheme() {
    var cs = getComputedStyle(root);
    ["ink", "ground", "faint", "muted", "rule"].forEach(function (k) { C[k] = rgbOf(cs.getPropertyValue("--" + k)); });
    var g = C.ground;
    C.dark = (0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2]) / 255 < 0.5;
  }
  function ink(a) { return "rgba(" + C.ink.join(",") + "," + a + ")"; }
  function tone(name, a) { return "rgba(" + C[name].join(",") + "," + (a == null ? 1 : a) + ")"; }
  readTheme();

  /* ── A canvas that sizes itself and draws only when it must ─────── */
  var views = [];
  function view(el, draw) {
    var v = { el: el, ctx: el.getContext("2d"), draw: draw, w: 0, h: 0, on: true, dirty: true, live: false };
    function size() {
      var r = el.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (w === v.w && h === v.h) return;
      v.w = w; v.h = h;
      el.width = Math.round(w * DPR); el.height = Math.round(h * DPR);
      v.ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      v.dirty = true;
    }
    size();
    if ("ResizeObserver" in window) new ResizeObserver(size).observe(el); else window.addEventListener("resize", size);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { v.on = es[0].isIntersecting; if (v.on) v.dirty = true; }, { rootMargin: "120px" }).observe(el);
    }
    views.push(v);
    return v;
  }
  function redrawAll() { views.forEach(function (v) { v.dirty = true; }); }
  new MutationObserver(function () { readTheme(); redrawAll(); }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('16px "Instrument Serif"'), document.fonts.load("12px Inter")]).then(redrawAll, redrawAll);
  }
  var lastFrame = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (document.hidden || ts - lastFrame < 32) return;
    lastFrame = ts;
    var t = now();
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      if (!v.on || !(v.dirty || v.live)) continue;
      v.dirty = false;
      v.ctx.clearRect(0, 0, v.w, v.h);
      v.draw(v, t);
    }
  }
  requestAnimationFrame(frame);

  /* ── Validated ledgers, shared by Figures 1 and 2 ──────────────── */
  // Oldest first: { index, tx, src, time }. `src` says which clock `time`
  // is on: "close" is the ledger's own close time (read with the recent
  // past), "seen" is when this page received it from the stream. Intervals
  // are only ever measured between two ledgers on the same clock.
  var ledgers = [];
  window.addEventListener("noshashi:ledger", function (ev) {
    var d = ev.detail || {};
    if (!Number.isInteger(d.index)) return;
    if (ledgers.length && ledgers[ledgers.length - 1].index >= d.index) return;
    ledgers.push({ index: d.index, tx: Math.max(0, Number(d.txnCount) || 0), src: "seen", time: Date.now() / 1000 });
    if (ledgers.length > 60) ledgers.shift();
    var t = now();
    if (sky) { sky.arrived = t; sky.dirty = true; }
    if (surface && !REDUCE) { surface.pulses.push(t); if (surface.pulses.length > 6) surface.pulses.shift(); }
    skyStats();
  });
  function closeEvery(list) {
    var secs = 0, steps = 0;
    for (var i = 1; i < list.length; i++) {
      var a = list[i - 1], b = list[i];
      if (a.src !== b.src) continue;
      secs += b.time - a.time; steps += b.index - a.index;
    }
    return steps >= 4 && secs > 0 ? secs / steps : null;
  }
  function skyStats() {
    var win = ledgers.slice(-((sky && sky.N) || SKY_MAX));
    var m = win.length;
    if (!m) return;
    var txs = win.map(function (l) { return l.tx; }).sort(function (a, b) { return a - b; });
    var med = m % 2 ? txs[(m - 1) / 2] : (txs[m / 2 - 1] + txs[m / 2]) / 2;
    var every = closeEvery(win);
    set("rh-sky-stats", "Last " + fmt(m) + (m === 1 ? " ledger" : " ledgers") + ": a median of " + fmt(med) + " transactions" +
      (every ? ", one closing every " + every.toFixed(1) + " s" : "") + ". Latest " + fmt(win[m - 1].index) + ".");
  }
  function merge(list) {
    var by = {};
    list.forEach(function (l) { by[l.index] = { index: l.index, tx: l.tx, src: "close", time: l.close }; });
    ledgers.forEach(function (l) { by[l.index] = l; });
    ledgers = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.index - b.index; }).slice(-60);
    if (sky) { sky.seededAt = now(); sky.dirty = true; }
    skyStats();
  }
  // The recent past, read once: one short session with a public node, the
  // same host the ledger stream uses. A ledger's header gives its close
  // time (seconds since 2000-01-01); its transaction list gives the count.
  function seedHistory(count) {
    if (!("WebSocket" in window)) return;
    var ws;
    try { ws = new WebSocket("wss://xrplcluster.com"); } catch (e) { return; }
    var seq = 0, top = null, pending = 0, got = [], done = false;
    var timer = setTimeout(finish, 15000);
    function send(o) { o.id = ++seq; ws.send(JSON.stringify(o)); }
    function finish() {
      if (done) return;
      done = true; clearTimeout(timer);
      try { ws.close(); } catch (e) { /* already closed */ }
      if (got.length) merge(got);
    }
    ws.onopen = function () { send({ command: "ledger", ledger_index: "validated" }); };
    ws.onerror = finish;
    ws.onmessage = function (m) {
      var r;
      try { r = JSON.parse(m.data); } catch (e) { return; }
      if (!r || r.status !== "success" || !r.result) { if (top === null || --pending <= 0) finish(); return; }
      if (top === null) {
        top = Number(r.result.ledger_index || (r.result.ledger && r.result.ledger.ledger_index));
        if (!top) return finish();
        for (var i = 0; i < count; i++) { pending++; send({ command: "ledger", ledger_index: top - i, transactions: true }); }
        return;
      }
      var L = r.result.ledger;
      if (L && Array.isArray(L.transactions)) {
        got.push({ index: Number(L.ledger_index), tx: L.transactions.length, close: Number(L.close_time) });
      }
      if (--pending <= 0) finish();
    };
  }

  // A soft shadow under any polygon, drawn with the canvas's own blur: the
  // shape is drawn far off the canvas and only its shadow lands in place.
  var OFF = 4000;
  function softShadow(ctx, pts, color, blur) {
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = blur * DPR; ctx.shadowOffsetX = OFF * DPR; ctx.shadowOffsetY = 0;
    ctx.beginPath(); ctx.moveTo(pts[0][0] - OFF, pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] - OFF, pts[i][1]);
    ctx.closePath(); ctx.fillStyle = "#000"; ctx.fill();
    ctx.restore();
  }
  // Text with a halo in the ground colour, so it reads over lines.
  function label(ctx, text, x, y, halo) {
    ctx.save();
    ctx.lineJoin = "round"; ctx.strokeStyle = tone("ground", 0.9); ctx.lineWidth = halo || 4;
    ctx.strokeText(text, x, y);
    ctx.restore();
    ctx.fillText(text, x, y);
  }

  /* ── The title emblem: a ring for every validated ledger ───────── */
  var emW = [document.getElementById("rh-em-w1"), document.getElementById("rh-em-w2")];
  if (emW[0] && emW[1] && !REDUCE) {
    window.addEventListener("noshashi:ledger", function () {
      emW.forEach(function (w, i) {
        var c = i ? "go2" : "go";
        w.classList.remove(c); void w.getBoundingClientRect(); w.classList.add(c);
      });
    });
  }

  /* ── Figure 1: validated ledgers as blocks ─────────────────────── */
  // An oblique projection: each block's front face is a true rectangle, so
  // heights can be read against the scale on the back wall; depth runs up
  // and to the right. Heights are on a square-root scale, so one busy
  // ledger does not flatten the rest; the wall says so in numbers.
  var sky = null, skyEl = document.getElementById("rh-sky");
  var DX = 0.44, DY = 0.32;                    // the depth axis on screen
  var BW = 1, BD = 1.2, STEP = 1.36;           // block width, depth, pitch
  var FF = 0.8, FB = 0.3, FS = 0.35;           // floor margin: front, back, sides
  var SKY_MAX = 28;
  var GRID = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];
  if (skyEl) {
    sky = view(skyEl, drawSky); sky.arrived = -10; sky.seededAt = -10; sky.maxTx = 0; sky.N = 0;
    seedHistory(skyEl.getBoundingClientRect().width < 560 ? 12 : SKY_MAX);
  }

  function drawSky(v, t) {
    var ctx = v.ctx, W = v.w, H = v.h, small = W < 560;
    var padL = small ? 30 : 42, padR = small ? 8 : 14, padT = small ? 52 : 58, padB = 28;
    var units = function (n) { return (n - 1) * STEP + BW + 2 * FS + (FF + BD + FB) * DX; };
    var N = small ? 12 : SKY_MAX, s = (W - padL - padR) / units(N);
    while (N > 8 && s < (small ? 15 : 20)) { N--; s = (W - padL - padR) / units(N); }
    if (sky.N !== N) { sky.N = N; skyStats(); }
    var xL = -(N - 1) * STEP - FS, xR = BW + FS, yF = -FF, yB = BD + FB;
    var ox = padL + (-xL + FF * DX) * s;
    var oy = H - padB - FF * DY * s;
    var HM = Math.max(2, (oy - padT) / s - yB * DY); // the scale's full height, in block units
    function P(x, y, z) { return [ox + (x + y * DX) * s, oy - (y * DY + z) * s]; }
    function poly(pts) {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    }
    function line(a, b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }

    var shown = ledgers.slice(-N - 1), n = shown.length;
    var win = shown.slice(-N);
    var target = win.length ? Math.max.apply(null, win.map(function (l) { return l.tx; })) * 1.08 : 0;
    if (!sky.maxTx || REDUCE) sky.maxTx = target; else sky.maxTx += (target - sky.maxTx) * 0.16;
    var scale = Math.max(1, sky.maxTx);
    var Z = function (tx) { return Math.sqrt(Math.max(0, tx) / scale) * HM; };

    // The floor, lit a little more towards the back.
    var floor = [P(xL, yF, 0), P(xR, yF, 0), P(xR, yB, 0), P(xL, yB, 0)];
    var fg = ctx.createLinearGradient(0, floor[2][1], 0, floor[0][1]);
    fg.addColorStop(0, ink(C.dark ? 0.055 : 0.05)); fg.addColorStop(1, ink(C.dark ? 0.018 : 0.015));
    poly(floor); ctx.fillStyle = fg; ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = tone("rule", 1); line(floor[0], floor[1]);
    ctx.strokeStyle = tone("rule", 0.6); line(floor[3], floor[2]);

    // The back wall: the scale, in transactions.
    ctx.strokeStyle = tone("rule", 0.6); line(P(xL, yB, 0), P(xL, yB, HM));
    if (n) {
      var picked = [], last = -1e9;
      for (var gi = GRID.length - 1; gi >= 0 && picked.length < 4; gi--) {
        var gz = Z(GRID[gi]);
        if (GRID[gi] > scale || gz * s < 14) continue;
        if (last - gz * s < 20 && picked.length) continue;
        picked.push(GRID[gi]); last = gz * s;
      }
      ctx.font = "10.5px " + SANS; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      picked.forEach(function (g) {
        var a = P(xL, yB, Z(g)), b = P(xR, yB, Z(g));
        ctx.setLineDash([1, 3]); ctx.strokeStyle = tone("faint", 0.55); line(a, b); ctx.setLineDash([]);
        ctx.fillStyle = tone("faint", 1); ctx.fillText(fmt(g), a[0] - 7, a[1]);
      });
      var wt = P(xL, yB, HM);
      ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.fillStyle = tone("faint", 1);
      ctx.fillText(small ? "Transactions" : "Transactions per ledger (square-root scale)", wt[0] - (small ? 22 : 34), wt[1] - 8);
    }

    // Ledger slots along the front edge, counted back from the latest.
    ctx.font = "10.5px " + SANS; ctx.fillStyle = tone("faint", 1); ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.strokeStyle = tone("rule", 1);
    for (var tk = 0; tk < N; tk += 5) {
      var tp = P(-tk * STEP + BW / 2, yF, 0);
      line(tp, [tp[0], tp[1] + 4]);
      ctx.fillText(tk === 0 ? "latest" : "−" + tk, tp[0], tp[1] + 7);
    }

    if (!n) {
      ctx.font = "13px " + SANS; ctx.fillStyle = tone("faint", 1); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      var c = P(xL / 2, BD / 2, HM * 0.45);
      ctx.fillText("Reading the latest validated ledgers…", c[0], c[1]);
      v.live = false;
      return;
    }

    var e = REDUCE ? 1 : ease((t - sky.arrived) / 0.8);
    var grow = REDUCE ? 1 : ease((t - sky.arrived - 0.15) / 0.85);
    var blocks = [];
    for (var j = 0; j < n; j++) {               // oldest first: left to right, back to front
      var age = n - 1 - j;                      // 0 = latest
      var pos = age === 0 ? 0 : age - (1 - e);
      if (pos > N - 0.35) continue;
      var fade = clamp(1 - 0.62 * Math.pow(pos / Math.max(1, N - 1), 0.85), 0.3, 1) * clamp((N - 0.35 - pos) * 1.5, 0, 1);
      var rise = REDUCE ? 1 : ease((t - sky.seededAt - (N - 1 - age) * 0.022) / 0.7);
      var hz = Z(shown[j].tx) * rise * (age === 0 ? grow : 1);
      blocks.push({ l: shown[j], age: age, x0: -pos * STEP, hz: Math.max(hz, 0.06), a: fade });
    }

    // Contact shadows first, so no block's shadow falls across another.
    blocks.forEach(function (bk) {
      var x0 = bk.x0, x1 = x0 + BW, sh = Math.min(bk.hz * 0.06, 0.4);
      softShadow(ctx, [P(x0 - 0.05, -0.05, 0), P(x1 + 0.12 + sh, -0.05, 0), P(x1 + 0.12 + sh, BD + 0.12 + sh, 0), P(x0 - 0.05, BD + 0.12 + sh, 0)],
        "rgba(0,0,0," + ((C.dark ? 0.65 : 0.2) * bk.a).toFixed(3) + ")", 9);
    });

    // Where the latest ledger lands, a ripple runs out across the floor.
    var since = t - sky.arrived;
    if (!REDUCE && since < 1.8) {
      ctx.save(); poly(floor); ctx.clip();
      var cxr = BW / 2, cyr = BD / 2;
      [0, 0.28].forEach(function (lag) {
        var u = (since - lag) / 1.5;
        if (u <= 0 || u >= 1) return;
        var rr = 0.75 + 3.4 * ease(u);
        ctx.strokeStyle = ink(0.55 * Math.pow(1 - u, 1.6)); ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (var q = 0; q <= 64; q++) {
          var th = q / 64 * Math.PI * 2, pt = P(cxr + rr * Math.cos(th), cyr + rr * Math.sin(th), 0);
          if (q) ctx.lineTo(pt[0], pt[1]); else ctx.moveTo(pt[0], pt[1]);
        }
        ctx.stroke();
      });
      ctx.restore();
    }

    // The blocks: lit from the upper left, so the top is brightest, the
    // front shades towards the floor and the right side is darkest.
    var S = C.dark
      ? { top: 0.8, f0: 0.5, f1: 0.24, side: 0.17, edge: 0.95 }
      : { top: 0.05, f0: 0.15, f1: 0.27, side: 0.38, edge: 0.5 };
    var latest = null;
    blocks.forEach(function (bk) {
      var x0 = bk.x0, x1 = x0 + BW, h = bk.hz, a = bk.a;
      var f00 = P(x0, 0, 0), f10 = P(x1, 0, 0), f11 = P(x1, 0, h), f01 = P(x0, 0, h);
      var b10 = P(x1, BD, 0), b11 = P(x1, BD, h), b01 = P(x0, BD, h);
      poly([f10, b10, b11, f11]); ctx.fillStyle = ink(S.side * a); ctx.fill();
      var g = ctx.createLinearGradient(0, f01[1], 0, f00[1]);
      g.addColorStop(0, ink(S.f0 * a)); g.addColorStop(1, ink(S.f1 * a));
      poly([f00, f10, f11, f01]); ctx.fillStyle = g; ctx.fill();
      poly([f01, f11, b11, b01]); ctx.fillStyle = ink(S.top * a); ctx.fill();
      ctx.lineWidth = 1;
      if (C.dark) {
        ctx.strokeStyle = tone("ground", 0.6); line(f11, f10);
        ctx.strokeStyle = ink(S.edge * a); line(f01, f11);
      } else {
        ctx.strokeStyle = ink(S.edge * a);
        poly([f00, f10, b10, b11, b01, f01]); ctx.stroke();
        line(f01, f11); line(f11, f10); line(f11, b11);
      }
      if (bk.age === 0) latest = bk;
    });

    // The latest ledger, named.
    if (latest) {
      var la = latest.a, top = P(latest.x0 + BW / 2, BD / 2, latest.hz);
      var clear = top[1];
      blocks.forEach(function (bk) { if (bk.age > 0 && bk.age <= 3) clear = Math.min(clear, P(bk.x0, BD, bk.hz)[1]); });
      var ly = Math.min(top[1] - 14, clear - 10);
      ctx.font = "18px " + SERIF;
      var w1 = ctx.measureText(fmt(latest.l.index)).width;
      ctx.font = "11px " + SANS;
      var w2 = ctx.measureText(fmt(latest.l.tx) + " transactions").width;
      var lx = Math.min(top[0], W - 4 - Math.max(w1, w2) / 2);
      ctx.globalAlpha = la;
      ctx.strokeStyle = ink(0.5); ctx.lineWidth = 1;
      line([top[0], top[1] - 3], [top[0], ly + 2]);
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.font = "18px " + SERIF; ctx.fillStyle = ink(1); label(ctx, fmt(latest.l.index), lx, ly - 14);
      ctx.font = "11px " + SANS; ctx.fillStyle = tone("faint", 1); label(ctx, fmt(latest.l.tx) + " transactions", lx, ly);
      ctx.globalAlpha = 1;
    }
    v.live = !REDUCE && (t - sky.arrived < 1.9 || t - sky.seededAt < 1.5 || Math.abs(target - sky.maxTx) > target * 0.004);
  }

  /* ── Figure 2: the ripple surface ──────────────────────────────── */
  var surface = null, surfEl = document.getElementById("rh-surface");
  var legend = document.querySelector(".rh-legend");
  var RINGS = [
    { r: 0.24, name: "Holders", note: "freeze · clawback · authorisation" },
    { r: 0.46, name: "Order book", note: "quoted against fillable depth" },
    { r: 0.68, name: "Payments", note: "delivered, not requested" },
    { r: 0.9, name: "Counterparties", note: "sanctions three hops back" },
  ];
  var PHI = 0.5, FOCAL = 3.4;
  var LIGHT = [-0.74, 0.67];                    // where the light comes from, across the water
  var LEVELS = 12, LMAX = 0.3;
  if (surfEl) { surface = view(surfEl, drawSurface); surface.pulses = []; surface.live = !REDUCE; }

  function heightAt(r, t, pulses) {
    var z = 0.02 * Math.sin(16 * r - (REDUCE ? 0 : 1.4 * t)) * Math.exp(-r * 1.5);
    for (var i = 0; i < pulses.length; i++) {
      var age = t - pulses[i];
      if (age < 0 || age > 5.5) continue;
      var front = 0.04 + 0.3 * age, amp = 0.12 * Math.exp(-age / 2.4);
      var d = r - front, d2 = d + 0.075;
      z += amp * Math.exp(-(d * d) / 0.0021) - 0.45 * amp * Math.exp(-(d2 * d2) / 0.0018);
    }
    return z;
  }

  function drawSurface(v, t) {
    var ctx = v.ctx, W = v.w, H = v.h;
    var labels = !!legend && getComputedStyle(legend).position === "absolute";
    var k, cx, labelW = 0;
    if (labels) {
      ctx.font = "16px " + SERIF;
      RINGS.forEach(function (g) { labelW = Math.max(labelW, ctx.measureText(g.name).width); });
      ctx.font = "10.5px " + SANS;
      RINGS.forEach(function (g) { labelW = Math.max(labelW, ctx.measureText(g.note).width); });
      k = Math.min((H - 64) / 1.08, (W - 30 - labelW) / 2.08);
      cx = 4 + k * 1.04;
    } else {
      k = Math.min(W * 0.46, (H - 56) / 1.08);
      cx = W / 2;
    }
    // Centre what is drawn: the far rim and the issuer's label above, the near rim below.
    var above = Math.max(0.4 * k, 0.19 * k + 40), below = Math.max(0.66 * k, labels ? 0.04 * k + 136 : 0);
    var cy = (H - above - below) / 2 + above;
    var cphi = Math.cos(PHI), sphi = Math.sin(PHI);
    function P(X, Y, Z) {
      var depth = Y * cphi - Z * sphi, up = Y * sphi + Z * cphi, sc = FOCAL / (FOCAL + depth);
      return [cx + X * k * sc, cy - up * k * sc];
    }
    var pulses = surface.pulses.filter(function (p) { return t - p < 5.5; });
    surface.pulses = pulses;

    // A soft floor under the surface.
    ctx.save();
    ctx.translate(cx, cy + 0.06 * k); ctx.scale(1, sphi * 1.15);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, k * 1.08);
    g.addColorStop(0, ink(C.dark ? 0.07 : 0.06)); g.addColorStop(1, ink(0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, k * 1.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Light on the water. Where the surface tilts towards the light it
    // brightens (on the dark page) or, tilted away, it shades (on the light
    // page). Patches are grouped by tone and filled once per tone.
    var RB = 40, AB = W < 560 ? 44 : 64, paths = [];
    for (var bi = 0; bi < RB; bi++) {
      var r0 = 0.05 + bi * (0.95 / RB), r1 = r0 + 0.95 / RB, rm = (r0 + r1) / 2;
      var dz = (heightAt(rm + 0.004, t, pulses) - heightAt(rm - 0.004, t, pulses)) / 0.008;
      if (Math.abs(dz) < 0.06) continue;
      var z0 = heightAt(r0, t, pulses), z1 = heightAt(r1, t, pulses);
      for (var ai = 0; ai < AB; ai++) {
        var a0 = ai / AB * Math.PI * 2, a1 = (ai + 1) / AB * Math.PI * 2, am = (a0 + a1) / 2;
        var lit = -dz * (Math.cos(am) * LIGHT[0] + Math.sin(am) * LIGHT[1]) * (C.dark ? 1 : -1);
        var lv = Math.round(clamp(lit * 0.2, 0, LMAX) / LMAX * LEVELS);
        if (lv < 1) continue;
        var pth = paths[lv] || (paths[lv] = new Path2D());
        var c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        var q0 = P(r0 * c0, r0 * s0, z0), q1 = P(r1 * c0, r1 * s0, z1), q2 = P(r1 * c1, r1 * s1, z1), q3 = P(r0 * c1, r0 * s1, z0);
        pth.moveTo(q0[0], q0[1]); pth.lineTo(q1[0], q1[1]); pth.lineTo(q2[0], q2[1]); pth.lineTo(q3[0], q3[1]); pth.closePath();
      }
    }
    for (var li = 1; li <= LEVELS; li++) if (paths[li]) { ctx.fillStyle = ink(li / LEVELS * LMAX); ctx.fill(paths[li]); }

    // Radial cross-sections, which show the wave's profile.
    var SPOKES = 36, SAMP = 34;
    ctx.lineWidth = 0.8;
    for (var sI = 0; sI < SPOKES; sI++) {
      var th = (sI / SPOKES) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
      ctx.strokeStyle = ink(st > 0 ? 0.05 : 0.1);
      ctx.beginPath();
      for (var q = 0; q <= SAMP; q++) {
        var rr = 0.05 + (q / SAMP) * 0.95, pt = P(rr * ct, rr * st, heightAt(rr, t, pulses));
        if (q) ctx.lineTo(pt[0], pt[1]); else ctx.moveTo(pt[0], pt[1]);
      }
      ctx.stroke();
    }

    // Rings: faint contours between the four named rings. Back halves first.
    var radii = [];
    for (var ri = 1; ri <= 21; ri++) radii.push({ r: 0.05 + ri * 0.0452, named: false });
    RINGS.forEach(function (n) {
      radii = radii.filter(function (x) { return Math.abs(x.r - n.r) > 0.02; });
      radii.push({ r: n.r, named: true });
    });
    radii.sort(function (a, b) { return a.r - b.r; });
    var SEG = 96;
    function ring(R, z, from, to, alpha, width) {
      ctx.strokeStyle = ink(alpha); ctx.lineWidth = width;
      ctx.beginPath();
      for (var i = 0; i <= SEG; i++) {
        var th = from + (to - from) * (i / SEG), pt = P(R * Math.cos(th), R * Math.sin(th), z);
        if (i) ctx.lineTo(pt[0], pt[1]); else ctx.moveTo(pt[0], pt[1]);
      }
      ctx.stroke();
    }
    var zs = radii.map(function (x) { return heightAt(x.r, t, pulses); });
    radii.forEach(function (x, i) {
      var lift = clamp(zs[i] * 7, 0, 0.55);
      ring(x.r, zs[i], 0, Math.PI, (x.named ? 0.3 : 0.07) + lift * 0.5, x.named ? 1 : 0.8);
    });
    radii.forEach(function (x, i) {
      var lift = clamp(zs[i] * 7, 0, 0.55);
      ring(x.r, zs[i], Math.PI, Math.PI * 2, (x.named ? 0.72 : 0.15) + lift, (x.named ? 1.25 : 0.85) + clamp(zs[i] * 10, 0, 1.2));
    });

    // The issuer at the centre: a marker standing on the surface.
    var zc = heightAt(0, t, pulses), base = P(0, 0, zc), tip = P(0, 0, zc + 0.2);
    ctx.strokeStyle = ink(0.85); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ring(0.035, zc, 0, Math.PI * 2, 0.75, 1.1);
    ctx.fillStyle = ink(1); ctx.beginPath(); ctx.arc(tip[0], tip[1], 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.font = "16px " + SERIF; ctx.fillStyle = ink(1); label(ctx, "Issuer account", tip[0], tip[1] - 22, 5);
    ctx.font = "10.5px " + SANS; ctx.fillStyle = tone("faint", 1); label(ctx, "keys · signer list · flags", tip[0], tip[1] - 8, 4);

    // What is read at each ring, with leaders to a label column.
    if (labels) {
      var lx = cx + k * 1.04 + 22, prev = -1e9;
      RINGS.forEach(function (n, i) {
        var th = -0.3 - 0.2 * i, z = heightAt(n.r, t, pulses);
        var pt = P(n.r * Math.cos(th), n.r * Math.sin(th), z);
        var ly = Math.max(pt[1], prev + 38); prev = ly;
        ctx.strokeStyle = ink(0.4); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(pt[0], pt[1]); ctx.lineTo(lx - 20, ly); ctx.lineTo(lx - 6, ly); ctx.stroke();
        ctx.fillStyle = ink(1); ctx.beginPath(); ctx.arc(pt[0], pt[1], 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        ctx.font = "16px " + SERIF; ctx.fillStyle = ink(1); ctx.fillText(n.name, lx, ly + 2);
        ctx.font = "10.5px " + SANS; ctx.fillStyle = tone("faint", 1); ctx.fillText(n.note, lx, ly + 16);
      });
    }
    v.live = !REDUCE;
  }

  /* ── Figure 3: cumulative depth, XRP / RLUSD ───────────────────── */
  var depth = null, depthEl = document.getElementById("rh-depth");
  var BOOK_URL = "/api/book?currency=" + RLUSD.currency + "&issuer=" + RLUSD.issuer + "&format=raw";

  // The same arithmetic as api/_lib/book.js (toLevels, uncrossedTouch,
  // quotedVsFillable), so the chart and the server agree to the unit.
  function amount(value) {
    if (typeof value === "string") { var n = Number(value) / 1e6; return isFinite(n) ? Number(n.toFixed(6)) : 0; }
    if (value && typeof value === "object") return Number(value.value || 0);
    return 0;
  }
  function toLevels(offers, invert) {
    var levels = new Map();
    (offers || []).forEach(function (o) {
      var gets = amount(o.TakerGets), pays = amount(o.TakerPays);
      if (gets <= 0 || pays <= 0) return;
      var getsF = o.taker_gets_funded !== undefined ? amount(o.taker_gets_funded) : gets;
      var paysF = o.taker_pays_funded !== undefined ? amount(o.taker_pays_funded) : pays;
      var price = invert ? gets / pays : pays / gets;
      if (!isFinite(price) || price <= 0) return;
      var listed = invert ? pays : gets, funded = invert ? paysF : getsF;
      var e = levels.get(price) || { funded: 0, listed: 0 };
      if (isFinite(funded) && funded > 0) e.funded += Math.min(funded, listed);
      e.listed += listed;
      levels.set(price, e);
    });
    return Array.from(levels.entries()).sort(function (a, b) { return invert ? b[0] - a[0] : a[0] - b[0]; })
      .map(function (x) { return { price: x[0], quantity: x[1].funded, listed: x[1].listed }; });
  }
  function touch(bids, asks) {
    var ask = asks[0] && asks[0].price;
    if (ask === undefined) return { bid: bids[0] && bids[0].price, ask: undefined };
    for (var i = 0; i < bids.length; i++) if (bids[i].price < ask) return { bid: bids[i].price, ask: ask };
    return { bid: undefined, ask: ask };
  }
  function cumulative(levels, mid, outward) {
    // From the mid outward. Levels on the wrong side of the mid (a crossed
    // touch) are counted at the mid, as the server counts them.
    var lo = mid * (1 - BAND), hi = mid * (1 + BAND), f = 0, l = 0, pts = [];
    levels.forEach(function (lv) {
      if (lv.price < lo || lv.price > hi) return;
      f += lv.quantity; l += lv.listed;
      var p = outward < 0 ? Math.min(lv.price, mid) : Math.max(lv.price, mid);
      pts.push({ p: p, f: f, l: l });
    });
    return pts;
  }

  if (depthEl) {
    depth = view(depthEl, drawDepth);
    depth.book = null; depth.error = false; depth.hover = null; depth.shownAt = -10;
    depthEl.addEventListener("pointermove", function (e) {
      var r = depthEl.getBoundingClientRect(); depth.hover = e.clientX - r.left; depth.dirty = true;
    });
    depthEl.addEventListener("pointerleave", function () { depth.hover = null; depth.dirty = true; });
    var readBook = function () {
      fetch(BOOK_URL).then(function (r) { return r.json(); }).then(function (raw) {
        if (!raw || !raw.bids || !raw.asks) throw new Error("no book");
        var bids = toLevels(raw.bids, true), asks = toLevels(raw.asks, false), tc = touch(bids, asks);
        if (tc.bid === undefined || tc.ask === undefined) throw new Error("no mid");
        var mid = (tc.bid + tc.ask) / 2;
        var within = function (p) { return Math.abs(p - mid) <= mid * BAND; };
        var sum = function (lv, key) { return lv.filter(function (x) { return within(x.price); }).reduce(function (s, x) { return s + x[key]; }, 0); };
        var first = !depth.book;
        depth.book = {
          mid: mid, ledger: raw.ledger_index,
          bids: cumulative(bids, mid, -1), asks: cumulative(asks, mid, 1),
          qb: sum(bids, "listed"), fb: sum(bids, "quantity"), qa: sum(asks, "listed"), fa: sum(asks, "quantity"),
        };
        depth.error = false;
        if (first) depth.shownAt = now();
        depth.dirty = true;
        var b = depth.book;
        set("rh-dp-l", "Ledger " + fmt(b.ledger) + " · read " + new Date().toISOString().slice(11, 19) + " UTC");
        set("rh-dp-sum", "Within 10% of a mid of " + mid.toFixed(4) + " XRP: bids " + compact(b.qb) + " RLUSD quoted, " + compact(b.fb) +
          " can fill; asks " + compact(b.qa) + " quoted, " + compact(b.fa) + " can fill.");
      }).catch(function () {
        if (!depth.book) { depth.error = true; depth.dirty = true; }
        set("rh-dp-l", "The order book could not be read just now");
      });
    };
    readBook();
    setInterval(function () { if (depth.on && !document.hidden) readBook(); }, 60000);
  }

  function niceCeil(v) {
    var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function drawDepth(v, t) {
    var ctx = v.ctx, W = v.w, H = v.h, b = depth.book;
    var padL = 4, padR = 58, padT = W < 560 ? 52 : 40, padB = 34, pw = W - padL - padR, ph = H - padT - padB;
    // Grid first, so an empty chart still reads as a chart.
    ctx.strokeStyle = tone("rule", 1); ctx.lineWidth = 1;
    ctx.font = "10.5px " + SANS; ctx.fillStyle = tone("faint", 1); ctx.textAlign = "left"; ctx.textBaseline = "middle";
    if (!b) {
      for (var gi = 0; gi <= 4; gi++) { var gy = padT + ph * gi / 4; ctx.beginPath(); ctx.moveTo(padL, gy + 0.5); ctx.lineTo(padL + pw, gy + 0.5); ctx.stroke(); }
      ctx.font = "13px " + SANS; ctx.textAlign = "center";
      ctx.fillText(depth.error ? "The order book could not be read just now." : "Reading the order book…", padL + pw / 2, padT + ph / 2);
      v.live = false;
      return;
    }
    var lo = b.mid * (1 - BAND), hi = b.mid * (1 + BAND);
    var top = Math.max(b.bids.length ? b.bids[b.bids.length - 1].l : 0, b.asks.length ? b.asks[b.asks.length - 1].l : 0, 1);
    var maxY = niceCeil(top * 1.08);
    var X = function (p) { return padL + (p - lo) / (hi - lo) * pw; };
    var Y = function (q) { return padT + ph - q / maxY * ph; };
    for (var i = 0; i <= 4; i++) {
      var q = maxY * i / 4, yy = Math.round(Y(q)) + 0.5;
      ctx.strokeStyle = tone("rule", i === 0 ? 1 : 0.7);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + pw, yy); ctx.stroke();
      ctx.fillText(i ? compact(q) : "0", padL + pw + 8, yy);
    }

    var reveal = REDUCE ? 1 : ease((t - depth.shownAt) / 1.1);
    var xm = X(b.mid);
    ctx.save();
    ctx.beginPath(); ctx.rect(xm - reveal * (xm - padL) - 1, 0, reveal * pw + 2, H); ctx.clip();

    function stepPts(pts, key, edge) {
      var out = [[xm, Y(0)]], prev = 0;
      pts.forEach(function (pt) { var x = X(pt.p); out.push([x, Y(prev)], [x, Y(pt[key])]); prev = pt[key]; });
      out.push([X(edge), Y(prev)]);
      return out;
    }
    function trace(pts, dx, dy, close) {
      ctx.beginPath(); ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + dx, pts[i][1] + dy);
      if (close) { ctx.lineTo(pts[pts.length - 1][0] + dx, Y(0) + dy); ctx.closePath(); }
    }
    // What can fill is drawn as a solid with depth: a back face, lit top
    // faces along each level, and the front face over them.
    var DXd = 9, DYd = -7;
    var grad = ctx.createLinearGradient(0, padT, 0, padT + ph);
    grad.addColorStop(0, ink(C.dark ? 0.32 : 0.2)); grad.addColorStop(1, ink(C.dark ? 0.05 : 0.04));
    [[b.bids, lo], [b.asks, hi]].forEach(function (side) {
      var f = stepPts(side[0], "f", side[1]), q = stepPts(side[0], "l", side[1]);
      trace(f, DXd, DYd, true); ctx.fillStyle = ink(C.dark ? 0.1 : 0.07); ctx.fill();
      for (var i = 1; i < f.length; i++) {
        var p0 = f[i - 1], p1 = f[i];
        if (Math.abs(p0[1] - p1[1]) > 0.5 || p0[1] >= Y(0) - 0.5) continue;
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p1[0] + DXd, p1[1] + DYd); ctx.lineTo(p0[0] + DXd, p0[1] + DYd); ctx.closePath();
        ctx.fillStyle = ink(C.dark ? 0.42 : 0.16); ctx.fill();
      }
      ctx.strokeStyle = ink(C.dark ? 0.3 : 0.25); ctx.lineWidth = 1;
      trace(f, DXd, DYd, false); ctx.stroke();
      trace(f, 0, 0, true); ctx.fillStyle = tone("ground", 1); ctx.fill(); ctx.fillStyle = grad; ctx.fill();
      ctx.save();
      ctx.shadowColor = ink(C.dark ? 0.4 : 0.25); ctx.shadowBlur = 12 * DPR; ctx.shadowOffsetY = 4 * DPR;
      ctx.strokeStyle = ink(0.95); ctx.lineWidth = 1.6;
      trace(f, 0, 0, false); ctx.stroke();
      ctx.restore();
      // Quoted: a dashed outline. Where it rises above the solid, the book
      // advertises more than its owners can deliver.
      ctx.setLineDash([4, 4]); ctx.strokeStyle = ink(0.6); ctx.lineWidth = 1.2;
      trace(q, 0, 0, false); ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.restore();

    // The mid, the band and the sides.
    ctx.setLineDash([2, 4]); ctx.strokeStyle = ink(0.4); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(xm) + 0.5, padT - 6); ctx.lineTo(Math.round(xm) + 0.5, padT + ph); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "11px " + SANS; ctx.fillStyle = tone("muted", 1); ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("Mid " + b.mid.toFixed(4) + " XRP", xm, padT - 10);
    ctx.textBaseline = "top"; ctx.fillStyle = tone("faint", 1); ctx.font = "10.5px " + SANS;
    ctx.textAlign = "left"; ctx.fillText("−10% · " + lo.toFixed(4), padL, padT + ph + 9);
    ctx.textAlign = "right"; ctx.fillText(hi.toFixed(4) + " · +10%", padL + pw, padT + ph + 9);
    ctx.font = "16px " + SERIF; ctx.fillStyle = ink(0.8); ctx.textBaseline = "bottom";
    ctx.textAlign = "left"; ctx.fillText("Bids", padL + 8, padT + ph - 8);
    ctx.textAlign = "right"; ctx.fillText("Asks", padL + pw - 8, padT + ph - 8);

    // Key.
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "11px " + SANS; ctx.fillStyle = tone("muted", 1);
    ctx.fillStyle = grad; ctx.fillRect(padL, 9, 16, 9); ctx.strokeStyle = ink(0.95); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(padL, 9.5); ctx.lineTo(padL + 16, 9.5); ctx.stroke();
    ctx.fillStyle = tone("muted", 1); ctx.fillText("Can fill", padL + 22, 14);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = ink(0.55); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(padL + 84, 14); ctx.lineTo(padL + 100, 14); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillText("Quoted", padL + 106, 14);

    // Hover: read any price.
    if (depth.hover !== null && depth.hover >= padL && depth.hover <= padL + pw && reveal >= 1) {
      var hx = depth.hover, p = lo + (hx - padL) / pw * (hi - lo), side = p <= b.mid ? b.bids : b.asks, f = 0, l = 0;
      side.forEach(function (pt) { if (p <= b.mid ? pt.p >= p : pt.p <= p) { f = pt.f; l = pt.l; } });
      ctx.strokeStyle = ink(0.35); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(hx) + 0.5, padT); ctx.lineTo(Math.round(hx) + 0.5, padT + ph); ctx.stroke();
      ctx.fillStyle = ink(1); ctx.strokeStyle = tone("ground", 1); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx, Y(f), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      var text = p.toFixed(4) + " XRP  ·  " + compact(f) + " can fill  ·  " + compact(l) + " quoted";
      ctx.font = "11.5px " + SANS;
      var tw = ctx.measureText(text).width + 16, bx = clamp(hx - tw / 2, padL, padL + pw - tw), by = padT + 6;
      ctx.fillStyle = tone("ground", 0.92); ctx.fillRect(bx, by, tw, 22);
      ctx.strokeStyle = tone("rule", 1); ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, 21);
      ctx.fillStyle = ink(1); ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(text, bx + 8, by + 11.5);
    }
    v.live = !REDUCE && t - depth.shownAt < 1.2;
  }
})();
