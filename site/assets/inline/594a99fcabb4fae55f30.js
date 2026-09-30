
/*
 * Live ledger readout.
 *
 * Deliberately small and deliberately fragile-safe. Three rules:
 *
 *  1. A cell shows cyan only once a real ledger has arrived. Until then
 *     it is an em dash in --faint. DESIGN.md: "a static number in cyan
 *     is a lie about liveness", and this page is sold to people who are
 *     buying the promise that we do not fabricate.
 *  2. Every failure path is silent and leaves the dash. No retry storm,
 *     no fake value, no console noise for a visitor.
 *  3. The socket closes when the tab goes away, so reading a pricing
 *     page does not hold an open connection to a public node forever.
 */
(function () {
  var idxEl = document.getElementById("tele-ledger");
  var ageEl = document.getElementById("tele-age");
  if (!idxEl || !ageEl || typeof WebSocket === "undefined") return;

  var socket = null, lastClose = 0, ticker = null;

  function show(el, text) { el.textContent = text; el.className = "v live"; }

  function startTicking() {
    if (ticker) return;
    ticker = setInterval(function () {
      if (!lastClose) return;
      var secs = Math.max(0, Math.round((Date.now() - lastClose) / 1000));
      ageEl.textContent = secs + "s ago";
    }, 1000);
  }

  function teardown() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (socket) { try { socket.close(); } catch (e) {} socket = null; }
  }

  try {
    socket = new WebSocket("wss://xrplcluster.com");
  } catch (e) {
    return;                       // leaves both cells as an em dash
  }

  socket.onopen = function () {
    try {
      socket.send(JSON.stringify({ id: 1, command: "subscribe", streams: ["ledger"] }));
    } catch (e) { teardown(); }
  };

  socket.onmessage = function (event) {
    var msg;
    try { msg = JSON.parse(event.data); } catch (e) { return; }
    var index = (msg.result && msg.result.ledger_index) || msg.ledger_index;
    if (!index) return;
    show(idxEl, Number(index).toLocaleString("en-US"));
    lastClose = Date.now();
    show(ageEl, "0s ago");
    startTicking();
  };

  socket.onerror = function () { teardown(); };
  socket.onclose = function () { if (ticker) { clearInterval(ticker); ticker = null; } };

  window.addEventListener("pagehide", teardown);
})();
