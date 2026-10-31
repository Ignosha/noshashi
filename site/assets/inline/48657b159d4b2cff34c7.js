
/* The hero card: a live issuer reading for RLUSD from /api/authority, the
   same read the certificate uses. A check that could not be read is never
   counted as clear. */
(function () {
  var box = document.getElementById("mn-issuer"); if (!box) return;
  var led = document.getElementById("mn-ledger"), clear = document.getElementById("md-clear"), flag = document.getElementById("md-flag");
  var alert = document.getElementById("md-alert"), alertD = document.getElementById("md-alert-d");
  function fail() { led.textContent = "LEDGER NOT READ JUST NOW"; }
  fetch("/api/authority?issuer=" + encodeURIComponent(box.getAttribute("data-issuer"))).then(function (r) { return r.json(); }).then(function (c) {
    var checks = ((c && c.checks) || []).filter(function (k) { return k.id !== "SUPPLY_CONCENTRATION" && k.id !== "AUTHORITY_READABLE"; });
    if (!checks.length) return fail();
    var ok = checks.filter(function (k) { return k.passed; });
    var kept = checks.filter(function (k) { return !k.passed; });
    clear.textContent = ok.length; flag.textContent = kept.length;
    if (kept.length) { alertD.textContent = kept[0].label.replace(/^No /, "").replace(/ permanently surrendered$/, " not surrendered"); alert.hidden = false; }
    led.textContent = "READ AT LEDGER " + Number(c.ledgerIndex || 0).toLocaleString("en-US");
  }).catch(fail);
})();
