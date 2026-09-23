/*
 * The subscribe form.
 *
 * Progressive enhancement over a real form: without this the field is
 * still there and still focusable, it simply cannot submit, which is
 * why the button is not disabled by default.
 */
(function () {
  "use strict";
  var form = document.getElementById("subscribe-form");
  if (!form) return;

  var status = document.getElementById("subscribe-status");
  var button = document.getElementById("subscribe-send");
  var field = document.getElementById("subscribe-email");
  var opened = Date.now();

  function say(text, tone) {
    status.textContent = text;
    status.setAttribute("data-tone", tone || "");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var email = field.value.trim();
    if (!email) { say("Enter an email address.", "bad"); field.focus(); return; }

    button.disabled = true;
    say("Subscribing…", "busy");

    fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        elapsed: Date.now() - opened,
        company_website: document.getElementById("subscribe_company").value,
      }),
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (result) {
        if (result.ok) { form.reset(); say(result.body.message || "Subscribed.", "good"); return; }
        say(result.body.error || "That did not save.", "bad");
      })
      .catch(function () { say("Could not reach the server. Try again shortly.", "bad"); })
      .finally(function () { button.disabled = false; });
  });
})();

/*
 * The subscribe dialog.
 *
 * Shown once to a visitor who has actually engaged, never on arrival.
 * The rules are deliberate and each one is load-bearing:
 *
 *   - It waits for 30 seconds OR 35% scroll depth, whichever comes
 *     first. A dialog that fires on load is the pattern everyone hates,
 *     and on mobile Google treats a content-covering interstitial as
 *     intrusive and demotes the page for it — which would undo the SEO
 *     work the rest of this site is built on.
 *   - On a phone it is a bottom sheet that leaves the content visible,
 *     for the same reason.
 *   - It shows once. A dismissal is remembered for 90 days, a
 *     subscription for ever, and neither is re-asked.
 *   - It never appears on /contact/, where the visitor is already doing
 *     the thing, and never when the inline form is on screen.
 *   - Escape closes it, focus is trapped while open and returned on
 *     close, and the close control is a 40px target.
 *
 * Storage is best-effort: a browser with storage blocked simply never
 * sees it, which is the right failure direction.
 */
(function () {
  "use strict";

  var KEY = "noshashi-subscribe-state";
  var DISMISS_DAYS = 90;
  var DELAY_MS = 30000;
  var SCROLL_TRIGGER = 0.35;

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return null; }
  }
  function write(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  var state = read();
  // null means storage threw — do not show a dialog that cannot
  // remember it was dismissed.
  if (state === null) return;
  if (state.subscribed) return;
  if (state.dismissedAt && Date.now() - state.dismissedAt < DISMISS_DAYS * 864e5) return;
  if (location.pathname.indexOf("/contact/") === 0) return;

  var shown = false;
  var opener = null;

  function build() {
    var wrap = document.createElement("div");
    wrap.className = "sub-dialog";
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="sub-scrim" data-close></div>' +
      '<div class="sub-card" role="dialog" aria-modal="true" aria-labelledby="sub-dlg-title">' +
        '<button class="sub-close" type="button" aria-label="Close" data-close>✕</button>' +
        '<div class="sub-mark" aria-hidden="true">' +
          '<span class="ring"></span><span class="ring"></span>' +
          '<svg viewBox="0 0 100 100" fill="none">' +
          '<defs><radialGradient id="sub-f-p" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="50"><stop offset="0" stop-color="#EAFFA0" stop-opacity=".95"/><stop offset=".14" stop-color="#8EDD4A" stop-opacity=".62"/><stop offset=".4" stop-color="#2A7F32" stop-opacity=".42"/><stop offset="1" stop-color="#0A3316" stop-opacity=".62"/></radialGradient><radialGradient id="sub-f-c" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="13"><stop offset="0" stop-color="#fff"/><stop offset=".18" stop-color="#F4FFB8"/><stop offset=".5" stop-color="#A9F152" stop-opacity=".55"/><stop offset="1" stop-color="#7BD83A" stop-opacity="0"/></radialGradient></defs><g fill="url(#sub-f-p)" stroke="#8FE34E" stroke-width=".55" stroke-linejoin="round"><path d="M50 50C36.06 50.54 24.28 64.59 21.24 82.81C38.9 77.4 51.29 63.89 50 50Z"/><path d="M50 50C48.77 63.91 61.22 77.43 78.93 82.81C75.8 64.57 63.96 50.52 50 50Z"/><path d="M50 50C51.45 38.27 41.29 27.4 26.45 23.55C28.56 38.75 38.18 50.09 50 50Z"/><path d="M50 50C61.86 50.15 71.66 38.8 73.97 23.55C59.02 27.35 48.69 38.22 50 50Z"/><path d="M50 50C63.64 40.02 63.09 20.96 50 4.63C36.91 20.96 36.36 40.02 50 50Z"/><path d="M50 50C37.4 60.15 37.9 79.51 50 96.12C62.1 79.51 62.6 60.15 50 50Z"/><path d="M50 50C39.38 38.47 19.18 39 1.9 50.17C19.25 61.21 39.46 61.61 50 50Z"/><path d="M50 50C60.63 61.61 81.01 61.21 98.51 50.17C81.09 39 60.71 38.47 50 50Z"/><path d="M50 50C53.03 42.95 48.66 34.37 40.08 29.34C38.65 39.18 42.6 47.96 50 50Z"/><path d="M50 50C57.4 47.96 61.35 39.18 59.92 29.34C51.34 34.37 46.97 42.95 50 50Z"/><path d="M50 50C41.25 53.26 36.29 64.83 37.6 77.27C47.84 70.08 53.29 58.74 50 50Z"/><path d="M50 50C46.71 58.74 52.16 70.08 62.4 77.27C63.71 64.83 58.75 53.26 50 50Z"/></g><g stroke="#C6F77E" stroke-width=".35" stroke-opacity=".85"><path d="M50 4.63V96.12"/><path d="M1.9 50.17H98.51"/></g><circle cx="50" cy="50" r="13" fill="url(#sub-f-c)"/>' +
          '</svg>' +
        '</div>' +
        '<h2 id="sub-dlg-title">Hear when something ships.</h2>' +
        '<p class="lede">An email when a build ships or a capability lands — drawn from the same ' +
          'mission log this site publishes, so an email cannot claim something the site does not. ' +
          'No schedule, no digest, one click to leave.</p>' +
        '<form id="sub-dlg-form" novalidate>' +
          '<label class="sr-only" for="sub-dlg-email">Your email address</label>' +
          '<input id="sub-dlg-email" type="email" autocomplete="email" maxlength="200" ' +
            'placeholder="you@institution.com" required>' +
          '<button class="btn" type="submit" id="sub-dlg-send">Subscribe</button>' +
          '<p class="form-status" id="sub-dlg-status" role="status" aria-live="polite"></p>' +
        '</form>' +
        '<button class="sub-later" type="button" data-close>No thanks</button>' +
        '<p class="sub-terms">Product updates only. Your address is stored with our email ' +
          'provider and used for nothing else.</p>' +
      '</div>';
    document.body.appendChild(wrap);
    return wrap;
  }

  var dialog = null;

  function close(remember) {
    if (!dialog) return;
    dialog.classList.remove("open");
    if (remember !== false) write({ dismissedAt: Date.now() });
    setTimeout(function () { dialog.hidden = true; }, 240);
    document.removeEventListener("keydown", onKey, true);
    if (opener && opener.focus) opener.focus();
  }

  function onKey(event) {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    // Focus trap: a modal that lets Tab wander behind the scrim is a
    // modal a keyboard user cannot get out of.
    var focusable = dialog.querySelectorAll("button, input, a[href]");
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function open() {
    if (shown) return;
    shown = true;
    opener = document.activeElement;
    dialog = build();
    dialog.hidden = false;
    // Two frames: the element must be laid out before the class that
    // transitions it is added, or it appears instantly.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { dialog.classList.add("open"); });
    });

    dialog.addEventListener("click", function (event) {
      if (event.target.hasAttribute("data-close")) close();
    });
    document.addEventListener("keydown", onKey, true);
    setTimeout(function () { dialog.querySelector("#sub-dlg-email").focus(); }, 280);

    var form = dialog.querySelector("#sub-dlg-form");
    var status = dialog.querySelector("#sub-dlg-status");
    var send = dialog.querySelector("#sub-dlg-send");
    var field = dialog.querySelector("#sub-dlg-email");
    var opened = Date.now();

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var email = field.value.trim();
      if (!email) { status.textContent = "Enter an email address."; status.dataset.tone = "bad"; return; }

      send.disabled = true;
      status.textContent = "Subscribing…";
      status.dataset.tone = "busy";

      fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, elapsed: Date.now() - opened }),
      })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (result) {
          if (result.ok) {
            write({ subscribed: true });
            status.textContent = result.body.message || "Subscribed.";
            status.dataset.tone = "good";
            setTimeout(function () { close(false); }, 1600);
            return;
          }
          status.textContent = result.body.error || "That did not save.";
          status.dataset.tone = "bad";
        })
        .catch(function () {
          status.textContent = "Could not reach the server. Try again shortly.";
          status.dataset.tone = "bad";
        })
        .finally(function () { send.disabled = false; });
    });
  }

  /* Never interrupt someone already looking at the inline form. */
  function inlineFormVisible() {
    var inline = document.getElementById("subscribe-form");
    if (!inline) return false;
    var r = inline.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  }

  function maybeOpen() {
    if (shown || inlineFormVisible()) return;
    open();
  }

  setTimeout(maybeOpen, DELAY_MS);

  var onScroll = function () {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (max > 0 && window.scrollY / max >= SCROLL_TRIGGER) {
      window.removeEventListener("scroll", onScroll);
      maybeOpen();
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  /* The inline form and the dialog share one state: subscribing in
     either one stops the other ever appearing. */
  var inlineForm = document.getElementById("subscribe-form");
  if (inlineForm) {
    inlineForm.addEventListener("submit", function () {
      setTimeout(function () {
        var s = document.getElementById("subscribe-status");
        if (s && s.getAttribute("data-tone") === "good") write({ subscribed: true });
      }, 1200);
    });
  }
})();
