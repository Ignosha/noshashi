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
