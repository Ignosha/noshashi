/*
 * The workspace window on the homepage, filled from XRP Ledger mainnet:
 *
 *   controls, depth, receipt   one reply from the public Asset Risk API
 *                              for RLUSD (/api/v1/asset-risk), the same
 *                              read the workspace makes.
 *   validated ledgers          each close as the public WebSocket reports
 *                              it (`noshashi:ledger`, from garden-field.js),
 *                              with its transaction count and how long ago
 *                              it closed.
 *
 * A read that fails says so; nothing here is filled with sample values.
 */
(function () {
  "use strict";
  var RLUSD = { issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", currency: "524C555344000000000000000000000000000000" };
  function $(id) { return document.getElementById(id); }
  function fmt(n) { return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
  function compact(n) {
    n = Number(n || 0);
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e4) return (n / 1e3).toFixed(1) + "K";
    return fmt(n);
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ── Validated ledgers ─────────────────────────────────────────── */
  var rows = $("sx-rows"), rate = $("sx-rate"), seen = [];
  function ago(t) {
    var s = Math.max(0, Math.round((Date.now() - t) / 1000));
    return s < 2 ? "just now" : s + " s ago";
  }
  window.addEventListener("noshashi:ledger", function (ev) {
    var d = ev.detail || {};
    if (!Number.isInteger(d.index) || !rows) return;
    var wait = rows.querySelector(".sx-wait");
    if (wait) wait.parentNode.remove();
    var at = Date.now();
    seen.push(at);
    if (seen.length > 10) seen.shift();
    var tr = document.createElement("tr");
    tr.className = "new";
    tr.setAttribute("data-at", at);
    tr.innerHTML = "<td>" + fmt(d.index) + "</td><td>" + fmt(Math.max(0, Number(d.txnCount) || 0)) + "</td><td>just now</td>";
    rows.prepend(tr);
    while (rows.children.length > 5) rows.lastElementChild.remove();
    if (rate && seen.length > 1) {
      rate.textContent = "one every " + ((seen[seen.length - 1] - seen[0]) / 1000 / (seen.length - 1)).toFixed(1) + " s";
    }
  });
  setInterval(function () {
    if (!rows) return;
    rows.querySelectorAll("tr[data-at]").forEach(function (tr) {
      tr.lastElementChild.textContent = ago(Number(tr.getAttribute("data-at")));
    });
  }, 1000);

  /* ── Issuer controls, depth and receipt ────────────────────────── */
  function notRead() {
    var c = $("sx-checks"); if (c) c.innerHTML = '<tr><td colspan="2" class="sx-wait">The issuer account could not be read just now.</td></tr>';
    var v = $("sx-verdict"); if (v) v.textContent = "Not read";
    var f = $("sx-fill-l"); if (f) f.textContent = "The order book could not be read just now.";
    var r = $("sx-receipt"); if (r) r.textContent = "not read";
  }
  fetch("/api/v1/asset-risk?issuer=" + RLUSD.issuer + "&currency=" + RLUSD.currency)
    .then(function (r) { return r.json(); })
    .then(function (a) {
      if (!a || !a.schema) throw new Error("no report");
      var ctl = a.issuer_controls, liq = a.liquidity;
      if (ctl && ctl.checks) {
        var checks = ctl.checks.filter(function (k) { return k.state !== "INSUFFICIENT_DATA"; });
        var body = $("sx-checks");
        if (body) body.innerHTML = checks.map(function (k) {
          return "<tr><td>" + esc(k.label) + '</td><td><span class="sx-res ' + (k.passed ? "yes" : "no") + '">' + (k.passed ? "Yes" : "No") + "</span></td></tr>";
        }).join("");
        var v = $("sx-verdict");
        if (v) {
          var verdict = String(ctl.authority_verdict || "");
          v.textContent = "Ledger verdict: " + (verdict ? verdict.replace(/-/g, " ").replace(/^\w/, function (c) { return c.toUpperCase(); }) : "read");
          v.title = "The authority rules' verdict on this issuer's ledger controls. Not a rating of the asset.";
          v.setAttribute("data-tone", verdict === "go" ? "go" : "hold");
        }
      }
      if (liq && liq.quoted) {
        var quoted = (liq.quoted.bid || 0) + (liq.quoted.ask || 0);
        var fill = (liq.fillable.bid || 0) + (liq.fillable.ask || 0);
        if (quoted > 0) {
          var pct = Math.round((fill / quoted) * 100);
          var big = $("sx-fill"); if (big) big.textContent = pct + "% can fill";
          var bar = $("sx-fillbar");
          if (bar) requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.width = Math.max(pct, 1) + "%"; }); });
          var l = $("sx-fill-l"); if (l) l.textContent = compact(fill) + " of " + compact(quoted) + " RLUSD quoted · DEX only, AMM pools excluded";
        }
      }
      var rc = $("sx-receipt"); if (rc && a.receipt) rc.textContent = a.receipt.digest;
      var rl = $("sx-receipt-l");
      if (rl && a.ledgers) rl.textContent = "SHA-256 over the full answer · read at ledger " + fmt(a.ledgers.issuer_controls || a.ledgers.liquidity);
    })
    .catch(notRead);
})();
