/*
 * Homepage, private-bank edition. Three things, all on live data except
 * the engraving itself:
 *
 *   seal       an engraved guilloché (two woven bands of sine-modulated
 *              circles, drawn here, not traced from anything) that turns
 *              very slowly. Each validated XRP Ledger, as the public
 *              WebSocket reports it (`noshashi:ledger`, dispatched by
 *              garden-field.js), sends one ring rippling out from the
 *              centre and sets the ledger number in it.
 *   statement  the table under "The ledger, as of this page": closes and
 *              transactions from the same events, the RLUSD issuer's
 *              retained powers from /api/authority, and its order book's
 *              fillable depth from /api/book. A line that could not be
 *              read says so.
 *
 * Everything stops moving under prefers-reduced-motion; the figures still
 * update.
 */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var RLUSD = { issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", currency: "524C555344000000000000000000000000000000" };
  function $(id) { return document.getElementById(id); }
  function fmt(n) { return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
  function compact(n) {
    n = Number(n || 0);
    if (n >= 1e9) return (n / 1e9).toFixed(2) + " bn";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + " m";
    if (n >= 1e4) return (n / 1e3).toFixed(1) + " k";
    return fmt(n);
  }
  function set(id, text, quiet) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("pv-quiet", !!quiet);
    if (!quiet && !reduce) {
      el.classList.add("pv-fresh");
      setTimeout(function () { el.classList.remove("pv-fresh"); }, 900);
    }
  }

  /* ── The engraving ─────────────────────────────────────────────── */
  var g = $("pv-guilloche");
  if (g) {
    var bands = [
      { R: 130, a: 15, n: 18, strands: 14, wob: 4, m: 3 },
      { R: 94, a: 9, n: 26, strands: 10, wob: 2, m: 4 },
    ];
    bands.forEach(function (b) {
      for (var j = 0; j < b.strands; j++) {
        var ph = (j / b.strands) * 2 * Math.PI;
        var d = "";
        for (var i = 0; i <= 480; i++) {
          var t = (i / 480) * 2 * Math.PI;
          var r = b.R + b.a * Math.sin(b.n * t + ph) + b.wob * Math.sin(b.m * t - ph * 3);
          d += (i ? "L" : "M") + (200 + r * Math.cos(t)).toFixed(2) + " " + (200 + r * Math.sin(t)).toFixed(2);
        }
        var p = document.createElementNS(NS, "path");
        p.setAttribute("d", d + "Z");
        g.appendChild(p);
      }
    });
  }

  /* ── Ripples and the statement, one per validated ledger ───────── */
  var ripples = $("pv-ripples"), sealN = $("pv-seal-n");
  var seen = [], closes = [];
  function ripple() {
    if (!ripples || reduce) return;
    var c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", 200); c.setAttribute("cy", 200); c.setAttribute("r", 196);
    c.setAttribute("vector-effect", "non-scaling-stroke");
    c.setAttribute("class", "wave");
    c.style.transformOrigin = "200px 200px";
    ripples.appendChild(c);
    if (c.animate) {
      c.animate([{ transform: "scale(.32)", opacity: .75 }, { transform: "scale(1.04)", opacity: 0 }],
        { duration: 3600, easing: "cubic-bezier(.25,.6,.3,1)", fill: "forwards" });
    }
    setTimeout(function () { c.remove(); }, 3800);
  }
  window.addEventListener("noshashi:ledger", function (ev) {
    var d = ev.detail || {};
    if (!Number.isInteger(d.index)) return;
    var tx = Math.max(0, Number(d.txnCount) || 0);
    ripple();
    if (sealN) sealN.textContent = fmt(d.index);
    seen.push(Date.now());
    if (seen.length > 10) seen.shift();
    set("pv-ledger", fmt(d.index));
    set("pv-tx", fmt(tx));
    if (seen.length > 1) {
      var span = (seen[seen.length - 1] - seen[0]) / 1000 / (seen.length - 1);
      set("pv-close", span.toFixed(1) + " seconds");
    } else {
      set("pv-close", "After the next close", true);
    }
    closes.push(tx);
  });

  /* ── Issuer powers and book depth, read once when the table is near ── */
  var LABELS = {
    FREEZE_SURRENDERED: "freeze",
    NOT_GLOBALLY_FROZEN: "a global freeze in force",
    OPEN_HOLDING: "authorisation of holders",
    NO_UNILATERAL_SIGNER: "signing with one key",
    NO_TRANSFER_FEE: "a transfer fee",
  };
  var notes = [];
  function foot() {
    var f = $("pv-foot");
    if (f && notes.length) f.textContent = "Sources: the public XRPL WebSocket for closes; " + notes.join("; ") + ".";
  }
  function readIssuer() {
    fetch("/api/authority?issuer=" + RLUSD.issuer).then(function (r) { return r.json(); }).then(function (c) {
      var checks = ((c && c.checks) || []).filter(function (k) { return LABELS[k.id]; });
      if (!checks.length) throw new Error("no checks");
      var kept = checks.filter(function (k) { return !k.passed; });
      set("pv-kept", kept.length
        ? kept.length + " of " + checks.length + ": " + kept.map(function (k) { return LABELS[k.id]; }).join(", ")
        : "None of " + checks.length);
      notes.push("the RLUSD issuer account read at ledger " + fmt(c.ledgerIndex));
      foot();
    }).catch(function () { set("pv-kept", "Not read just now", true); });
  }
  function readBook() {
    fetch("/api/book?currency=" + RLUSD.currency + "&issuer=" + RLUSD.issuer).then(function (r) { return r.json(); }).then(function (b) {
      if (!b || !b.quoted) throw new Error("no book");
      var quoted = (b.quoted.bid || 0) + (b.quoted.ask || 0);
      var fill = (b.fillable.bid || 0) + (b.fillable.ask || 0);
      if (!(quoted > 0)) throw new Error("empty book");
      set("pv-fill", Math.round((fill / quoted) * 100) + "% · " + compact(fill) + " of " + compact(quoted) + " RLUSD");
      notes.push("its DEX order book at ledger " + fmt(b.ledger_index) + " (AMM pools excluded)");
      foot();
    }).catch(function () { set("pv-fill", "Not read just now", true); });
  }
  var table = $("pv-kept");
  if (table) {
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        io.disconnect(); readIssuer(); readBook();
      }, { rootMargin: "300px" });
      io.observe(table);
    } else { readIssuer(); readBook(); }
  }
})();
