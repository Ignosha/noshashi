/*
 * The Ledger Desk (homepage). Everything printed here is read live:
 *
 *   dateline    today's date, and the latest validated ledger (filled by
 *               the existing data-sys-ledger hook).
 *   lead story  written from one reply of the public Asset Risk API for
 *               RLUSD: the headline states what the issuer has and has not
 *               given up and how much of its book can fill; the byline
 *               names the ledger and the receipt.
 *   Table 1     /api/authority for six widely held issuers, read when the
 *               table comes near the screen.
 *
 * The three live figures are drawn by desk-visuals.js.
 *
 * A read that fails says so in place. Nothing is filled with sample values.
 */
(function () {
  "use strict";
  var RLUSD = { issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", currency: "524C555344000000000000000000000000000000" };
  function $(id) { return document.getElementById(id); }
  function set(id, t) { var el = $(id); if (el) el.textContent = t; }
  function fmt(n) { return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
  function compact(n) {
    n = Number(n || 0);
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e4) return (n / 1e3).toFixed(1) + "K";
    return fmt(n);
  }

  /* ── Dateline ──────────────────────────────────────────────────── */
  set("rh-date", new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" }));

  /* ── Lead story, from one Asset Risk reply ─────────────────────── */
  fetch("/api/v1/asset-risk?issuer=" + RLUSD.issuer + "&currency=" + RLUSD.currency)
    .then(function (r) { return r.json(); })
    .then(function (a) {
      if (!a || !a.schema) throw new Error("no report");
      var ctl = a.issuer_controls, liq = a.liquidity, lg = a.ledgers || {};
      var pct = null;
      if (liq && liq.quoted) {
        var tot = (liq.quoted.bid || 0) + (liq.quoted.ask || 0), fil = (liq.fillable.bid || 0) + (liq.fillable.ask || 0);
        if (tot > 0) pct = Math.round((fil / tot) * 100);
      }

      if (ctl && ctl.checks) {
        var checks = ctl.checks.filter(function (k) { return k.state !== "INSUFFICIENT_DATA"; });
        var freeze = checks.filter(function (k) { return k.id === "FREEZE_SURRENDERED"; })[0];
        var signer = checks.filter(function (k) { return k.id === "NO_UNILATERAL_SIGNER"; })[0];
        var head = freeze && !freeze.passed
          ? "RLUSD's issuer has not given up the power to freeze its holders."
          : "RLUSD's issuer has permanently given up the power to freeze its holders.";
        if (pct !== null) head += " " + pct + "% of its order book can actually fill.";
        set("rh-headline", head);
        var kept = checks.filter(function (k) { return !k.passed; }).length;
        set("rh-dek", "Of the " + checks.length + " issuer controls NOSHASHI checks, RLUSD's issuer keeps " + kept + "." +
          (signer && signer.passed ? " No single key can act for it alone." : "") +
          " Its order book, read at the same ledger, holds " + (liq && liq.quoted ? compact((liq.fillable.bid || 0) + (liq.fillable.ask || 0)) + " RLUSD that can trade within 10% of mid." : "no readable depth just now.") +
          " The verdict on its controls is " + String(ctl.authority_verdict || "unknown").replace(/-/g, " ").toUpperCase() + ", which describes the issuer's powers, not the quality of the asset.");
      }
      var by = $("rh-by");
      if (by) {
        by.innerHTML = "";
        by.appendChild(document.createTextNode("Read by NOSHASHI at ledger " + fmt(lg.issuer_controls || lg.liquidity) + ", " +
          new Date(a.evaluated_at).toUTCString().replace(" GMT", " UTC") + ". Receipt "));
        var c = document.createElement("code");
        c.textContent = a.receipt ? a.receipt.digest.slice(0, 16) + "…" : "not issued";
        by.appendChild(c);
      }
    })
    .catch(function () {
      set("rh-by", "The ledger could not be read just now; the figures below will say so too.");
    });

  /* ── Table 1: issuer controls, read when the table is near ──────── */
  var table = $("rh-issuers");
  function fill(tr, c) {
    if (!c || !c.checks) {
      tr.querySelectorAll("td[data-c]").forEach(function (td) { td.textContent = "Not read"; td.className = "na"; });
      return 0;
    }
    tr.querySelectorAll("td[data-c]").forEach(function (td) {
      var id = td.getAttribute("data-c");
      if (id === "verdict") {
        td.textContent = String(c.verdict || "—").replace(/-/g, " ").replace(/^\w/, function (m) { return m.toUpperCase(); });
        td.className = "v" + (c.verdict === "go" ? "" : " no");
        return;
      }
      var k = c.checks.filter(function (x) { return x.id === id; })[0];
      if (!k || k.state === "INSUFFICIENT_DATA") { td.textContent = "Not read"; td.className = "na"; return; }
      td.textContent = k.passed ? "Yes" : "No";
      td.className = k.passed ? "" : "no";
    });
    return c.ledgerIndex || 0;
  }
  function readTable() {
    var rows = Array.prototype.slice.call(table.querySelectorAll("tbody tr"));
    Promise.all(rows.map(function (tr) {
      return fetch("/api/authority?issuer=" + tr.getAttribute("data-issuer"))
        .then(function (r) { return r.json(); })
        .then(function (c) { return fill(tr, c); })
        .catch(function () { return fill(tr, null); });
    })).then(function (ledgers) {
      var top = Math.max.apply(null, ledgers.concat([0]));
      if (top) set("rh-t1-l", "Read at ledger " + fmt(top) + ".");
    });
  }
  if (table) {
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        io.disconnect(); readTable();
      }, { rootMargin: "400px" });
      io.observe(table);
    } else { readTable(); }
  }
})();
