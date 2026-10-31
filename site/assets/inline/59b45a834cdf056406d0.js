
/* The hero window: a live issuer reading for RLUSD from /api/authority,
   the same read the certificate uses. A check that could not be read is
   "Not read", never a pass. */
(function () {
  var box = document.getElementById("mn-issuer"); if (!box) return;
  var list = document.getElementById("mn-checks"), led = document.getElementById("mn-ledger");
  var SHOW = ["FREEZE_SURRENDERED", "NOT_GLOBALLY_FROZEN", "NO_UNILATERAL_SIGNER", "OPEN_HOLDING", "CLAWBACK_DISABLED", "NO_TRANSFER_FEE"];
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fail() { list.innerHTML = '<li class="mn-wait">The ledger could not be read just now. Nothing here is a pass.</li>'; led.textContent = "Not read"; }
  fetch("/api/authority?issuer=" + encodeURIComponent(box.getAttribute("data-issuer"))).then(function (r) { return r.json(); }).then(function (c) {
    var checks = (c && c.checks) || []; if (!checks.length) return fail();
    var picked = checks.filter(function (k) { return SHOW.indexOf(k.id) >= 0; });
    if (picked.length < 4) picked = checks.filter(function (k) { return k.id !== "SUPPLY_CONCENTRATION"; });
    list.innerHTML = picked.slice(0, 5).map(function (k) {
      var tone = k.passed ? "go" : (k.severity === "block" ? "nogo" : "hold");
      if (/could not be read|abstain/i.test(k.detail || "") && !k.passed) tone = "na";
      var word = tone === "na" ? "Not read" : (k.passed ? "Yes" : "No");
      return '<li><span>' + esc(k.label) + '</span><span class="mn-pill ' + tone + '">' + word + '</span></li>';
    }).join("");
    led.innerHTML = "Ledger " + Number(c.ledgerIndex || 0).toLocaleString("en-US") + "<br>" + esc(String(c.evaluatedAt || "").replace("T", " ").slice(0, 16)) + " UTC";
  }).catch(fail);
})();
