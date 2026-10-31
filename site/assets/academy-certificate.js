/*
 * /academy/certificate/: recompute a NOSHASHI Academy certificate's code.
 *
 * The link's fragment (after #) is the certificate's record, base64url
 * encoded. The code is SHA-256 over that record's canonical JSON (keys
 * sorted, no whitespace), the same rule as src/lib/academy/academy.ts.
 * The fragment never leaves the browser, and nothing is stored.
 */
(function () {
  var out = document.getElementById("ac-result");
  var SCHEMA = "noshashi.academy-certificate/1";
  if (!out || !location.hash || location.hash.length < 4) return;

  function canonical(v) {
    if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
    if (v !== null && typeof v === "object") {
      return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + canonical(v[k]); }).join(",") + "}";
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  function el(tag, text) { var e = document.createElement(tag); if (text !== undefined) e.textContent = text; return e; }
  function fail(message) {
    out.className = "ac-result bad";
    out.replaceChildren(el("p", message));
  }

  var record;
  try {
    var s = location.hash.slice(1).replace(/-/g, "+").replace(/_/g, "/");
    var bin = atob(s + "===".slice((s.length + 3) % 4));
    var bytes = Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
    record = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    fail("This link does not hold a certificate. Check that it was copied in full.");
    return;
  }
  if (!record || record.schema !== SCHEMA) {
    fail("This link does not hold a NOSHASHI Academy certificate.");
    return;
  }
  if (!window.crypto || !crypto.subtle) {
    fail("This browser cannot compute SHA-256 here. Try a current browser.");
    return;
  }
  crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(record))).then(function (buf) {
    var hex = Array.from(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join("").toUpperCase();
    var short = hex.slice(0, 16).match(/.{4}/g).join("-");
    out.className = "ac-result ok";
    var title = el("p");
    title.appendChild(el("strong", "Code " + short));
    var dl = el("dl");
    [
      ["Name", record.name],
      ["Completed on", record.completed_on],
      ["Lessons passed", record.lessons_passed + " of " + record.lessons_total],
      ["Final check", record.exam_percent + "%"],
      ["Labs completed", record.labs_completed + " of " + record.labs_total],
      ["Course", record.course],
      ["SHA-256", hex],
    ].forEach(function (row) { dl.appendChild(el("dt", row[0])); dl.appendChild(el("dd", String(row[1]))); });
    var note = el("p", "If the code printed on the certificate matches this one, the certificate states exactly what is shown here. Change any detail and the code changes completely. This is a record of a completed self-paced course, not a licence, accreditation or offer of employment.");
    note.className = "ac-fine";
    // The holder's own choice to show it: LinkedIn's documented add-to-profile
    // link, filled from the record. Nothing is sent until they press it.
    var done = String(record.completed_on || "").split("-");
    var add = new URL("https://www.linkedin.com/profile/add");
    add.search = new URLSearchParams({
      startTask: "CERTIFICATION_NAME",
      name: "NOSHASHI Academy: " + String(record.course || "XRP Ledger compliance"),
      organizationName: "NOSHASHI",
      issueYear: done[0] || "",
      issueMonth: String(Number(done[1] || 0) || ""),
      certUrl: location.href,
      certId: short,
    }).toString();
    var share = "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent("https://www.noshashi.app/academy/");
    var actions = el("p");
    actions.className = "ac-share";
    [[add.toString(), "Add to LinkedIn profile"], [share, "Share the course on LinkedIn"]].forEach(function (a, i) {
      var link = el("a", a[1]);
      link.href = a[0]; link.target = "_blank"; link.rel = "noopener";
      link.className = i === 0 ? "btn" : "btn ghost";
      actions.appendChild(link);
      actions.appendChild(document.createTextNode(" "));
    });
    out.replaceChildren(title, dl, actions, note);
  });
})();
