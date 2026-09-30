
/*
 * Keeping the server-rendered sections current without a reload.
 *
 * Everything these touch is already in the HTML — the server rendered
 * real headlines, a real log and a real clock before this file was
 * parsed. This only replaces them with fresher copies. Turn JavaScript
 * off and the page still carries all of it, which is the whole reason
 * the rendering happens on the server in the first place.
 */
(function () {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* Same coarse units the server prints, so a refreshed row does not
     suddenly disagree with the one next to it. */
  function ago(iso) {
    var then = Date.parse(iso);
    if (!isFinite(then)) return "";
    var seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (seconds < 90) return "just now";
    var minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes + "m ago";
    var hours = Math.round(minutes / 60);
    if (hours < 24) return hours + "h ago";
    var days = Math.round(hours / 24);
    if (days < 30) return days + "d ago";
    var months = Math.round(days / 30);
    return months < 12 ? months + "mo ago" : Math.round(months / 12) + "y ago";
  }

  /* ── Mission clock ───────────────────────────────────────────────── */
  var clock = document.getElementById("mission-clock");
  if (clock) {
    var utc = document.getElementById("clock-utc");
    var met = document.getElementById("clock-met");
    var epoch = Date.parse(clock.getAttribute("data-epoch"));
    var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function tick() {
      var now = new Date();
      if (utc) utc.textContent = now.toISOString().slice(11, 19);
      if (met && isFinite(epoch)) {
        met.textContent = "T+" + Math.max(0, Math.floor((now.getTime() - epoch) / 86400000)) + "d";
      }
    }
    tick();
    /* A second is a state change, not decoration, so reduced motion
       keeps the reading — it just stops it animating once a second. */
    if (!still) setInterval(tick, 1000);
  }

  /* ── Newsroom ────────────────────────────────────────────────────── */
  var feed = document.getElementById("news-feed");
  if (feed) {
    var state = document.getElementById("news-state");
    function paint(data) {
      if (!data || !data.items || !data.items.length) return;
      feed.innerHTML = data.items.slice(0, 8).map(function (item) {
        var when = item.publishedAt
          ? '<time datetime="' + escapeHtml(item.publishedAt) + '">' + escapeHtml(ago(item.publishedAt)) + "</time>"
          : "";
        /* Only http(s) reaches an href. A feed is third-party text and
           is treated as such everywhere it is rendered. */
        var url = /^https?:\/\//.test(item.url || "") ? item.url : "#";
        return '<article class="feed-item"><span class="feed-meta"><span class="src" translate="no">' +
          escapeHtml(item.publisher) + "</span>" + when + '</span>' +
          '<a class="headline" data-i18n-live href="' + escapeHtml(url) + '" rel="noopener nofollow" target="_blank">' +
          escapeHtml(item.title) + "</a></article>";
      }).join("");
      if (state) {
        state.textContent = "UPDATED " + ago(data.fetchedAt);
        state.className = "reading live";
      }
    }
    function load() {
      fetch("/api/xrp-news?limit=8", { headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(paint)
        .catch(function () { /* the rendered copy stays; it is real */ });
    }
    /* Refresh on a return to the tab rather than on a timer — a page
       left open all day should not poll all day. */
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) load();
    });
    setTimeout(load, 30000);
  }

  /* ── Checkout ────────────────────────────────────────────────────── */
  document.querySelectorAll(".checkout-form").forEach(function (form) {
    var error = form.querySelector(".checkout-error");
    var button = form.querySelector("button");
    form.addEventListener("submit", function (event) {
      /* Progressive enhancement: without this handler the form still
         posts and the endpoint still redirects. This exists so a
         failure reads as a sentence here instead of navigating the
         visitor to an error page. */
      event.preventDefault();
      if (error) { error.hidden = true; error.textContent = ""; }
      button.disabled = true;
      var original = button.textContent;
      button.textContent = "OPENING STRIPE…";

      fetch(form.action, { method: "POST", headers: { Accept: "application/json" } })
        .then(function (response) {
          return response.json().then(function (data) { return { ok: response.ok, data: data }; });
        })
        .then(function (result) {
          if (result.ok && result.data.url) { location.href = result.data.url; return; }
          throw new Error(result.data.error || "Checkout could not start.");
        })
        .catch(function (e) {
          button.disabled = false;
          button.textContent = original;
          if (error) { error.textContent = e.message; error.hidden = false; }
        });
    });
  });
})();
