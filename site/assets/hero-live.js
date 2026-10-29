/*
 * Hero glass panels. They hold no data of their own: each value mirrors
 * the live ticker under the hero (#tk-*), which reads validated ledgers
 * over the public XRPL WebSocket. The line is the XRP / RLUSD readings
 * collected since this page opened; before two readings arrive it stays
 * empty rather than drawing an invented shape.
 */
(function () {
  "use strict";
  var stage = document.querySelector(".bx-stage");
  if (!stage) return;
  var path = stage.querySelector("[data-bx-spark]");
  var state = stage.querySelector("[data-bx-state]");
  var note = stage.querySelector("[data-bx-note]");
  var points = [];
  var MAX = 40;

  function draw() {
    if (!path || points.length < 2) return;
    var lo = Math.min.apply(null, points), hi = Math.max.apply(null, points);
    var span = hi - lo || 1;
    var d = points.map(function (v, i) {
      var x = (i / (points.length - 1)) * 240;
      var y = 44 - ((v - lo) / span) * 40;
      return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }).join(" ");
    path.setAttribute("d", d);
    if (note) note.textContent = "XRP / RLUSD over the last " + points.length + " readings since this page opened";
  }

  function mirror(dd) {
    var src = document.getElementById(dd.getAttribute("data-bx-mirror"));
    if (!src) return;
    var sync = function () {
      var text = src.textContent.trim();
      dd.textContent = text || "—";
      if (dd.getAttribute("data-bx-mirror") === "tk-xrp") {
        var n = parseFloat(text.replace(/[^0-9.]/g, ""));
        if (isFinite(n) && n > 0 && n !== points[points.length - 1]) {
          points.push(n);
          if (points.length > MAX) points.shift();
          draw();
        }
      }
    };
    sync();
    new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
  }
  stage.querySelectorAll("[data-bx-mirror]").forEach(mirror);

  var tkState = document.getElementById("tk-state");
  if (tkState && state) {
    var syncState = function () {
      var t = tkState.textContent.trim().toUpperCase();
      var live = /LIVE|OPERATIONAL|CONNECTED/.test(t);
      var down = /RECONNECT|OFFLINE|DOWN|ERROR|UNAVAILABLE/.test(t);
      state.textContent = live ? "Live" : down ? "Reconnecting" : "Connecting";
      state.setAttribute("data-state", live ? "live" : down ? "down" : "wait");
    };
    syncState();
    new MutationObserver(syncState).observe(tkState, { childList: true, characterData: true, subtree: true });
  }
})();
