/*
 * The homepage dashboard cards, all on live XRP Ledger reads. Nothing is
 * drawn until its data arrives; a read that fails says so.
 *
 *   radar   /api/authority for eight major issuers, read once when the card
 *           scrolls into view (edge-cached for five minutes). Each axis is
 *           the share of those issuers that keep that power.
 *   book    /api/book for XRP / RLUSD: advertised against fillable depth.
 *   digest  validated ledgers from the public WebSocket, via the
 *           `noshashi:ledger` events garden-field.js dispatches.
 */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  /* ── Radar ─────────────────────────────────────────────────────── */
  var ISSUERS = [
    "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", "rGm7WCVp9gb4jZHWTEtGUr4dd74z2XuWhE", "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz",
    "rCSCManTZ8ME9EoLrSHHYKW8PPwWMgkwr", "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq", "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
    "rXPMxBeefHGxx2K7g5qmmWq3gFsgawkoa", "rhcyBrowwApgNonehKBj8Po5z4gTyRknaU",
  ];
  /* Each axis: a check whose FAILING means the issuer keeps that power. */
  var AXES = [
    ["FREEZE_SURRENDERED", "Freeze kept"],
    ["NO_UNILATERAL_SIGNER", "One key signs"],
    ["NO_TRANSFER_FEE", "Charges a fee"],
    ["OPEN_HOLDING", "Permissioned"],
    ["NOT_GLOBALLY_FROZEN", "Frozen now"],
  ];
  var radar = document.getElementById("md-radar"), note = document.getElementById("md-radar-note");

  function el(name, attrs, text) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  function point(i, r) {
    var a = -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length;
    return [110 + r * Math.cos(a), 104 + r * Math.sin(a)];
  }
  function drawRadar(shares, read) {
    radar.textContent = "";
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      radar.appendChild(el("polygon", { class: "md-ring", points: AXES.map(function (_, i) { return point(i, 72 * f).join(","); }).join(" ") }));
    });
    AXES.forEach(function (ax, i) {
      var p = point(i, 72), q = point(i, 90);
      radar.appendChild(el("line", { class: "md-spoke", x1: 110, y1: 104, x2: p[0], y2: p[1] }));
      radar.appendChild(el("text", { class: "md-ax", x: q[0], y: q[1] + 3, "text-anchor": q[0] < 100 ? "end" : q[0] > 120 ? "start" : "middle" }, ax[1]));
    });
    var shape = el("polygon", { class: "md-shape", points: shares.map(function (v, i) { return point(i, 72 * v).join(","); }).join(" ") });
    radar.appendChild(shape);
    shares.forEach(function (v, i) {
      var p = point(i, 72 * v);
      radar.appendChild(el("circle", { class: "md-dot", cx: p[0], cy: p[1], r: 3 }));
      if (v > 0) radar.appendChild(el("text", { class: "md-val", x: p[0], y: p[1] - 7, "text-anchor": "middle" }, Math.round(v * read) + "/" + read));
    });
  }
  function loadRadar() {
    var reads = ISSUERS.map(function (a) {
      return fetch("/api/authority?issuer=" + a).then(function (r) { return r.json(); }).catch(function () { return null; });
    });
    Promise.all(reads).then(function (all) {
      var ok = all.filter(function (c) { return c && c.checks && c.checks.length > 1; });
      if (!ok.length) { note.textContent = "The ledger could not be read just now."; return; }
      var shares = AXES.map(function (ax) {
        var kept = ok.filter(function (c) {
          var k = c.checks.find(function (x) { return x.id === ax[0]; });
          return k && !k.passed;
        });
        return kept.length / ok.length;
      });
      drawRadar(shares, ok.length);
      var top = ok.reduce(function (m, c) { return Math.max(m, c.ledgerIndex || 0); }, 0);
      note.textContent = ok.length + " of " + ISSUERS.length + " issuers read, latest at ledger " + top.toLocaleString("en-US") + ".";
    });
  }
  if (radar) {
    drawRadar(AXES.map(function () { return 0; }), 0);
    var seen = false;
    var io = new IntersectionObserver(function (es) {
      if (seen || !es[0].isIntersecting) return;
      seen = true; io.disconnect(); loadRadar(); loadBook();
    }, { rootMargin: "200px" });
    io.observe(radar);
  }

  /* ── Book composition ──────────────────────────────────────────── */
  var comp = document.getElementById("md-comp"), compNote = document.getElementById("md-comp-note");
  function fmt(n) { return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
  function loadBook() {
    if (!comp) return;
    fetch("/api/book?currency=524C555344000000000000000000000000000000&issuer=rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De")
      .then(function (r) { return r.json(); }).then(function (b) {
        if (!b || !b.quoted) throw new Error("no book");
        var quoted = (b.quoted.bid || 0) + (b.quoted.ask || 0);
        var fill = (b.fillable.bid || 0) + (b.fillable.ask || 0);
        var pct = quoted > 0 ? Math.round((fill / quoted) * 100) : 0;
        var rows = [
          ["Fillable", pct, fmt(fill) + " RLUSD"],
          ["Advertised, unfunded", 100 - pct, fmt(Math.max(0, quoted - fill)) + " RLUSD"],
        ];
        comp.innerHTML = '<div class="md-pcts">' + rows.map(function (r) { return '<div><b>' + r[1] + '%</b><em>' + r[0] + '</em></div>'; }).join("") + '</div>' +
          '<div class="md-barline"><i style="flex:' + Math.max(pct, 1) + '"></i><i class="u" style="flex:' + Math.max(100 - pct, 1) + '"></i></div>';
        compNote.textContent = "Within 10% of mid at ledger " + fmt(b.ledger_index) + " · DEX book only, AMM pools excluded";
      }).catch(function () { comp.innerHTML = '<p class="md-note">The order book could not be read just now.</p>'; });
  }

  /* ── Digest ────────────────────────────────────────────────────── */
  var digest = document.getElementById("md-digest"), state = document.getElementById("md-dg-state");
  var closes = [];
  window.addEventListener("noshashi:ledger", function (ev) {
    var d = ev.detail || {};
    if (!Number.isInteger(d.index) || !digest) return;
    closes.push({ i: d.index, tx: Math.max(0, Number(d.txnCount) || 0), at: Date.now() });
    if (closes.length > 30) closes.shift();
    var n = closes.length, avg = closes.reduce(function (s, c) { return s + c.tx; }, 0) / n;
    var span = n > 1 ? (closes[n - 1].at - closes[0].at) / 1000 / (n - 1) : null;
    var busiest = closes.reduce(function (m, c) { return c.tx > m.tx ? c : m; }, closes[0]);
    state.textContent = "LIVE · " + n + " LEDGER" + (n === 1 ? "" : "S") + " SEEN";
    digest.innerHTML = [
      "Latest: ledger " + d.index.toLocaleString("en-US") + ", " + closes[n - 1].tx + " transactions",
      "Average " + avg.toFixed(0) + " transactions per ledger",
      span ? "One validated close every " + span.toFixed(1) + " s" : "Close interval after the next ledger",
      "Busiest: ledger " + busiest.i.toLocaleString("en-US") + " with " + busiest.tx,
    ].map(function (t) { return "<li>" + t + "</li>"; }).join("");
  });
})();
