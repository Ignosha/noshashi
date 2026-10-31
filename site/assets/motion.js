/*
 * Homepage motion. Everything that moves is either decoration that
 * stops under prefers-reduced-motion, or a real XRP Ledger event:
 *
 *   - the ledger stream: each validated ledger, as the public WebSocket
 *     reports it (garden-field.js dispatches `noshashi:ledger` with the
 *     ledger index and its transaction count), slides in as a block whose
 *     height is that ledger's transaction count. Nothing is invented: until
 *     a ledger arrives the strip says it is waiting;
 *   - the consensus figure pulses once per validated ledger, and not
 *     otherwise;
 *   - scroll reveals, the cursor spotlight on cards, and count-up on the
 *     fixed figures.
 */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Scroll reveal ─────────────────────────────────────────────── */
  var revealed = document.querySelectorAll("[data-reveal]");
  if (!reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    revealed.forEach(function (el) { el.classList.add("will-reveal"); io.observe(el); });
  }

  /* ── Count-up on fixed figures (data-count) ────────────────────── */
  document.querySelectorAll("[data-count]").forEach(function (el) {
    var target = Number(el.getAttribute("data-count"));
    if (reduce || !isFinite(target) || target <= 0) return;
    var start = null;
    function step(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / 900);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("en-US");
      if (p < 1) requestAnimationFrame(step);
    }
    var o = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { o.disconnect(); requestAnimationFrame(step); }
    });
    o.observe(el);
  });

  /* ── Cursor spotlight on cards ─────────────────────────────────── */
  document.querySelectorAll("[data-spot]").forEach(function (card) {
    card.addEventListener("pointermove", function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  });

  /* ── Live ledger stream and consensus pulse ────────────────────── */
  var strip = document.getElementById("mn-blocks");
  var rate = document.getElementById("mn-rate");
  var ring = document.getElementById("mn-consensus");
  var MAX = 14, seen = [], peak = 1;

  function closeRate() {
    if (seen.length < 2 || !rate) return;
    var span = (seen[seen.length - 1].at - seen[0].at) / 1000 / (seen.length - 1);
    rate.textContent = "One every " + span.toFixed(1) + " s";
  }

  window.addEventListener("noshashi:ledger", function (ev) {
    var d = ev.detail || {};
    if (!Number.isInteger(d.index)) return;
    seen.push({ at: Date.now() });
    if (seen.length > 10) seen.shift();
    closeRate();

    if (ring) {
      ring.classList.remove("pulse");
      void ring.getBoundingClientRect();
      ring.classList.add("pulse");
      var label = ring.querySelector("[data-ring-ledger]");
      if (label) label.textContent = "#" + d.index.toLocaleString("en-US");
    }

    if (!strip) return;
    var wait = strip.querySelector(".mn-wait");
    if (wait) wait.remove();
    var tx = Math.max(0, Number(d.txnCount) || 0);
    peak = Math.max(peak * 0.98, tx, 1);
    var block = document.createElement("div");
    block.className = "mn-block" + (reduce ? "" : " enter");
    var bar = document.createElement("i");
    bar.style.setProperty("--h", Math.max(8, Math.round((tx / peak) * 100)) + "%");
    var idx = document.createElement("b");
    idx.textContent = "#" + d.index.toLocaleString("en-US");
    var meta = document.createElement("span");
    meta.textContent = tx + " tx";
    block.append(bar, idx, meta);
    strip.prepend(block);
    while (strip.children.length > MAX) strip.lastElementChild.remove();
  });
})();
