/*
 * Homepage (green). Three things:
 *
 *   ascii    water drawn in characters: a slow standing ripple from the
 *            centre of the hero, plus one ring that spreads out each time
 *            the XRP Ledger validates a ledger (`noshashi:ledger`, from the
 *            public WebSocket via garden-field.js). The picture is
 *            generated here; only the rings are data.
 *   chain    the "Ledger monitoring" module: one bar per validated ledger,
 *            its height that ledger's transaction count.
 *   reads    one reply from the public Asset Risk API for RLUSD fills the
 *            issuer-review module, the receipt module, the liquidity tile
 *            and the first proof card. A read that fails says so.
 *
 * Under prefers-reduced-motion the water is drawn once and stays still;
 * the figures still update.
 */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var RLUSD = { issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", currency: "524C555344000000000000000000000000000000" };
  var RAMP = " .,:-=+*#%@";
  function $(id) { return document.getElementById(id); }
  function fmt(n) { return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
  function compact(n) {
    n = Number(n || 0);
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e4) return (n / 1e3).toFixed(1) + "K";
    return fmt(n);
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ── ASCII water ───────────────────────────────────────────────── */
  var rings = [];
  function Water(pre, opts) {
    this.pre = pre; this.opts = opts || {}; this.cols = 0; this.rows = 0; this.on = false;
    var self = this;
    this.size();
    window.addEventListener("resize", function () { self.size(); if (reduce) self.draw(0); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { self.on = es[0].isIntersecting; }).observe(pre.parentElement);
    } else { this.on = true; }
  }
  Water.prototype.size = function () {
    var box = this.pre.getBoundingClientRect();
    var fs = parseFloat(getComputedStyle(this.pre).fontSize) || 11;
    var cw = fs * 0.66, ch = fs;
    this.cols = Math.min(220, Math.ceil(box.width / cw));
    this.rows = Math.min(90, Math.ceil(box.height / ch));
    this.aspect = ch / cw;
  };
  Water.prototype.draw = function (t) {
    var out = "", cx = this.cols / 2, cy = this.rows / 2, n = RAMP.length - 1;
    var gain = this.opts.gain || 1;
    for (var y = 0; y < this.rows; y++) {
      for (var x = 0; x < this.cols; x++) {
        var dx = x - cx, dy = (y - cy) * this.aspect;
        var d = Math.sqrt(dx * dx + dy * dy);
        var wave = 0.5 + 0.5 * Math.cos(d * 0.5 - t * 1.5);
        var v = wave * wave * wave * Math.exp(-d / 60) * 0.95;
        for (var i = 0; i < rings.length; i++) {
          var age = t - rings[i];
          if (age < 0 || age > 6) continue;
          var r = age * 24, w = d - r;
          v += Math.exp(-age / 2.6) * Math.exp(-(w * w) / 5);
        }
        v *= gain;
        out += RAMP.charAt(Math.max(0, Math.min(n, Math.floor(v * n))));
      }
      out += "\n";
    }
    this.pre.textContent = out;
  };
  var waters = [];
  ["rp-ascii", "rp-ascii-2"].forEach(function (id, k) {
    var pre = $(id);
    if (pre) waters.push(new Water(pre, { gain: k ? 0.8 : 1 }));
  });
  var t0 = performance.now(), last = 0;
  function now() { return (performance.now() - t0) / 1000; }
  if (waters.length) {
    if (reduce) { waters.forEach(function (w) { w.draw(0); }); }
    else {
      (function loop(ts) {
        requestAnimationFrame(loop);
        if (document.hidden || ts - last < 66) return;
        last = ts;
        var t = now();
        waters.forEach(function (w) { if (w.on) w.draw(t); });
      })(0);
    }
  }

  /* ── Each validated ledger: a ring, a bar, the proof card ───────── */
  var chain = $("rp-chain"), peak = 1, seen = [];
  window.addEventListener("noshashi:ledger", function (ev) {
    var d = ev.detail || {};
    if (!Number.isInteger(d.index)) return;
    var tx = Math.max(0, Number(d.txnCount) || 0);
    rings.push(now());
    while (rings.length > 6) rings.shift();
    seen.push(Date.now());
    if (seen.length > 10) seen.shift();
    var lg = $("rp-ledger"); if (lg) lg.textContent = fmt(d.index);
    var lgd = $("rp-ledger-d");
    if (lgd) {
      var span = seen.length > 1 ? (seen[seen.length - 1] - seen[0]) / 1000 / (seen.length - 1) : null;
      lgd.textContent = tx + " transactions in it" + (span ? " · one close every " + span.toFixed(1) + " s" : "");
    }
    if (!chain) return;
    var wait = chain.querySelector(".wait"); if (wait) wait.remove();
    peak = Math.max(peak * 0.98, tx, 1);
    var bar = document.createElement("i");
    bar.className = reduce ? "" : "enter";
    bar.title = "Ledger " + fmt(d.index) + " · " + tx + " transactions";
    bar.style.setProperty("--h", Math.max(12, Math.round((tx / peak) * 100)) + "%");
    chain.prepend(bar);
    while (chain.children.length > 9) chain.lastElementChild.remove();
  });

  /* ── One live read: the public Asset Risk API for RLUSD ────────── */
  function notRead() {
    var c = $("rp-checks"); if (c) c.innerHTML = '<li class="wait">The ledger could not be read just now.</li>';
    var v = $("rp-verdict"); if (v) v.textContent = "Not read";
    var vd = $("rp-verdict-d"); if (vd) vd.textContent = "The issuer account could not be read just now. Try again in a moment.";
    var f = $("rp-fill-l"); if (f) f.textContent = "The order book could not be read just now.";
    var r = $("rp-receipt"); if (r) r.textContent = "not read";
  }
  fetch("/api/v1/asset-risk?issuer=" + RLUSD.issuer + "&currency=" + RLUSD.currency)
    .then(function (r) { return r.json(); })
    .then(function (a) {
      if (!a || !a.schema) throw new Error("no report");
      var ctl = a.issuer_controls, liq = a.liquidity;
      if (ctl && ctl.checks) {
        var checks = ctl.checks.filter(function (k) { return k.state !== "INSUFFICIENT_DATA"; });
        var kept = checks.filter(function (k) { return !k.passed; });
        var list = $("rp-checks");
        if (list) list.innerHTML = checks.slice(0, 4).map(function (k, n) {
          return '<li style="--n:' + n + '"><span>' + esc(k.label) + '</span><em class="' + (k.passed ? "yes" : "no") + '">' + (k.passed ? "Yes" : "No") + "</em></li>";
        }).join("");
        var v = $("rp-verdict");
        if (v) v.textContent = String(ctl.authority_verdict || "").replace(/-/g, " ").toUpperCase();
        var vd = $("rp-verdict-d");
        if (vd) vd.textContent = (kept.length
          ? kept.map(function (k) { return k.label; }).join(", ") + ": no. "
          : "Every power checked is given up. ") + "Read at ledger " + fmt(a.ledgers && a.ledgers.issuer_controls) + ".";
      }
      if (liq && liq.quoted) {
        var quoted = (liq.quoted.bid || 0) + (liq.quoted.ask || 0);
        var fill = (liq.fillable.bid || 0) + (liq.fillable.ask || 0);
        if (quoted > 0) {
          var pct = Math.round((fill / quoted) * 100);
          var fb = $("rp-fill"); if (fb) fb.textContent = pct + "% can fill";
          var bar = $("rp-fillbar"); if (bar) requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.width = Math.max(pct, 1) + "%"; }); });
          var fl = $("rp-fill-l"); if (fl) fl.textContent = compact(fill) + " of " + compact(quoted) + " RLUSD quoted · ledger " + fmt(liq.ledger_index) + " · AMM pools excluded";
        }
      }
      var rc = $("rp-receipt"); if (rc && a.receipt) rc.textContent = a.receipt.digest;
      var rl = $("rp-receipt-l"); if (rl) rl.textContent = "RLUSD · read at ledger " + fmt(a.ledgers && (a.ledgers.issuer_controls || a.ledgers.liquidity));
    })
    .catch(notRead);
})();
