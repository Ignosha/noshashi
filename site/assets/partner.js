/*
 * The design-partner form. Sends through /api/contact as an
 * institutional enquiry, so it reaches the same inbox as every other
 * sales conversation and needs no endpoint of its own.
 */
(function () {
  "use strict";
  var form = document.getElementById("partner-form");
  if (!form) return;

  var status = document.getElementById("p-status");
  var button = document.getElementById("p-send");
  var opened = Date.now();

  function value(id) { return document.getElementById(id).value.trim(); }
  function say(text, tone) { status.textContent = text; status.setAttribute("data-tone", tone || ""); }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var name = value("p-name"), email = value("p-email"), org = value("p-org"),
        role = value("p-role"), problem = value("p-problem");
    if (!name || !email || !org || !role || !problem) { say("Please fill in all five fields.", "bad"); return; }

    button.disabled = true;
    say("Sending…", "busy");
    fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "institutions",
        name: name,
        email: email,
        org: org,
        subject: "Design partner · " + role,
        message: "Role: " + role + "\nOrganization: " + org + "\n\nProblem to solve:\n" + problem,
        elapsed: Date.now() - opened,
        company_website: document.getElementById("p_company").value,
      }),
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (result) {
        if (result.ok) { form.reset(); say("Thank you. You will get a reply at the address you gave.", "good"); return; }
        say(result.body.error || "That did not send. Email institutions@noshashi.app instead.", "bad");
      })
      .catch(function () { say("Could not reach the server. Email institutions@noshashi.app instead.", "bad"); })
      .finally(function () { button.disabled = false; });
  });
})();
