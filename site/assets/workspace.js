/*
 * The NOSHASHI workspace (/app/).
 *
 * Layout behaviour (sidebar rail and drawer, the context panel, settings,
 * feedback) and the four analysis tools. Every figure is read when the
 * user asks for it, from the site's read API or public XRPL nodes, and a
 * failed read is shown as a failure: nothing is ever filled in. Recent
 * analyses are kept in this browser only.
 */
(function () {
  "use strict";
  var root = document.documentElement;
  var app = document.querySelector(".ws-app");
  if (!app) return;

  var NODES = ["https://xrplcluster.com", "https://xrpl.ws", "https://xrpl.link"];
  var HISTORY = "noshashi-ws-history";
  var lastInput = "";

  /* ── helpers ─────────────────────────────────────────────────────── */
  function esc(x) {
    return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n, d) {
    if (n == null || !isFinite(n)) return "—";
    return Number(n).toLocaleString("en-US", { maximumFractionDigits: d == null ? 2 : d });
  }
  function rpc(method, params) {
    var i = 0;
    function go() {
      return fetch(NODES[i], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: method, params: [params] })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.result) throw new Error("no result");
        if (j.result.error) {
          // The ledger answered; another node would answer the same.
          var answer = new Error(j.result.error_message || j.result.error);
          answer.ledger = j.result.error;
          throw answer;
        }
        return j.result;
      }).catch(function (e) {
        if (e.ledger) throw e;
        i += 1;
        if (i < NODES.length) return go();
        // Network failures and unreadable replies: say it plainly.
        throw new Error("Could not reach a public XRPL node right now. Try again in a moment.");
      });
    }
    return go();
  }
  function api(path) {
    return fetch(path, { headers: { Accept: "application/json" } }).catch(function () {
      throw new Error("Could not reach the NOSHASHI read API right now. Try again in a moment.");
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) throw new Error(b && b.error ? b.error : "The service answered " + r.status + ".");
        return b;
      });
    });
  }
  function amtVal(a) { return a == null ? NaN : typeof a === "string" ? Number(a) / 1e6 : Number(a.value); }
  function cur(c) {
    if (!c || c.length !== 40) return c || "";
    var s = "";
    for (var i = 0; i < 40; i += 2) { var n = parseInt(c.substr(i, 2), 16); if (n) s += String.fromCharCode(n); }
    return s || c;
  }
  function amtText(a) {
    if (a == null) return "—";
    if (typeof a === "string") return fmt(Number(a) / 1e6, 6) + " XRP";
    return fmt(Number(a.value), 6) + " " + cur(a.currency);
  }
  function short(s, n) { s = String(s || ""); return s.length > (n || 14) ? s.slice(0, n || 14) + "…" : s; }
  function ago(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return null;
    return Math.max(0, Math.round((Date.now() - t) / 1000));
  }
  function freshness(iso) {
    var s = ago(iso);
    if (s == null) return '<span class="ws-badge live">Live</span>';
    return s <= 20 ? '<span class="ws-badge live">Live · read ' + s + "s ago</span>"
      : '<span class="ws-badge cached">Cached · read ' + s + "s ago</span>";
  }
  function metric(label, value, sub, tone) {
    return '<div class="ws-metric"><dt>' + esc(label) + '</dt><dd class="' + (tone ? "t-" + tone : "") + '">' + value +
      (sub ? "<small>" + sub + "</small>" : "") + "</dd></div>";
  }
  function row(k, v, tone) {
    return '<tr><th scope="row">' + esc(k) + '</th><td class="' + (tone ? "t-" + tone : "") + '">' + v + "</td></tr>";
  }
  function table(rows) { return '<div class="ws-table-wrap"><table class="ws-table"><tbody>' + rows.join("") + "</tbody></table></div>"; }
  function raw(label, obj) {
    return '<details class="ws-details"><summary>' + esc(label) + "</summary><pre>" + esc(JSON.stringify(obj, null, 2)) + "</pre></details>";
  }
  function link(href, text, ext) {
    return '<a href="' + esc(href) + '"' + (ext ? ' rel="noopener" target="_blank"' : "") + ">" + esc(text) + "</a>";
  }

  /* ── sidebar: rail on desktop, drawer on small screens ───────────── */
  var collapse = document.querySelector("[data-ws-collapse]");
  function syncCollapse() {
    var rail = root.getAttribute("data-ws-side") === "rail";
    if (!collapse) return;
    collapse.setAttribute("aria-expanded", rail ? "false" : "true");
    collapse.setAttribute("aria-label", rail ? "Expand sidebar" : "Collapse sidebar");
  }
  if (collapse) collapse.addEventListener("click", function () {
    var rail = root.getAttribute("data-ws-side") !== "rail";
    if (rail) root.setAttribute("data-ws-side", "rail"); else root.removeAttribute("data-ws-side");
    try { localStorage.setItem("noshashi-ws-side", rail ? "rail" : "full"); } catch (e) {}
    syncCollapse();
  });
  syncCollapse();

  var scrim = document.querySelector("[data-ws-scrim]");
  var drawerBtn = document.querySelector("[data-ws-drawer]");
  function setDrawer(open) {
    if (open) root.setAttribute("data-ws-drawer", "open"); else root.removeAttribute("data-ws-drawer");
    if (drawerBtn) drawerBtn.setAttribute("aria-expanded", open ? "true" : "false");
    syncScrim();
    if (open) { var first = document.querySelector(".ws-side .ws-link"); if (first) first.focus(); }
    else if (drawerBtn) drawerBtn.focus();
  }
  if (drawerBtn) drawerBtn.addEventListener("click", function () { setDrawer(root.getAttribute("data-ws-drawer") !== "open"); });

  /* ── context panel ───────────────────────────────────────────────── */
  var ctx = document.getElementById("ws-ctx");
  var ctxTitle = ctx && ctx.querySelector("[data-ctx-title]");
  var TITLES = { details: "Details", feedback: "Feedback", settings: "Settings" };
  var opener = null;
  function overlayCtx() { return window.matchMedia("(max-width:1180px)").matches; }
  function syncScrim() {
    var show = root.getAttribute("data-ws-drawer") === "open" || (ctx && !ctx.hidden && overlayCtx());
    if (scrim) scrim.hidden = !show;
  }
  function openCtx(view, from) {
    if (!ctx) return;
    opener = from || document.activeElement;
    ctx.querySelectorAll("[data-ctx-view]").forEach(function (v) { v.hidden = v.getAttribute("data-ctx-view") !== view; });
    if (ctxTitle) ctxTitle.textContent = TITLES[view] || "Details";
    ctx.hidden = false;
    app.classList.add("ctx-open");
    document.querySelectorAll('[data-ctx-open="details"]').forEach(function (b) { b.setAttribute("aria-expanded", view === "details" ? "true" : "false"); });
    if (root.getAttribute("data-ws-drawer") === "open") setDrawer(false);
    syncScrim();
    var focusable = ctx.querySelector("[data-ctx-view]:not([hidden]) input, [data-ctx-view]:not([hidden]) select, [data-ctx-view]:not([hidden]) button, [data-ctx-close]");
    if (focusable) focusable.focus();
    if (view === "settings") paintSettings();
  }
  function closeCtx() {
    if (!ctx || ctx.hidden) return;
    ctx.hidden = true;
    app.classList.remove("ctx-open");
    document.querySelectorAll('[data-ctx-open="details"]').forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    syncScrim();
    if (opener && opener.focus) opener.focus();
  }
  document.querySelectorAll("[data-ctx-open]").forEach(function (b) {
    b.addEventListener("click", function () {
      var view = b.getAttribute("data-ctx-open");
      var visible = ctx && !ctx.hidden && !ctx.querySelector('[data-ctx-view="' + view + '"]').hidden;
      if (visible) closeCtx(); else openCtx(view, b);
    });
  });
  if (ctx) ctx.querySelector("[data-ctx-close]").addEventListener("click", closeCtx);
  if (scrim) scrim.addEventListener("click", function () { setDrawer(false); closeCtx(); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (root.getAttribute("data-ws-drawer") === "open") setDrawer(false);
    else closeCtx();
  });
  window.addEventListener("resize", syncScrim);

  function setDetails(html) {
    var box = ctx && ctx.querySelector("[data-ctx-details]");
    if (!box) return;
    var method = box.getAttribute("data-method");
    if (method == null) { method = box.innerHTML; box.setAttribute("data-method", method); }
    box.innerHTML = html + method;
  }

  /* ── settings ────────────────────────────────────────────────────── */
  function paintSettings() {
    var theme = root.getAttribute("data-theme") === "light" ? "light" : "dark";
    var accent = root.getAttribute("data-accent") === "blue" ? "blue" : "green";
    document.querySelectorAll("[data-set-theme]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-set-theme") === theme ? "true" : "false"); });
    document.querySelectorAll("[data-set-accent]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-set-accent") === accent ? "true" : "false"); });
  }
  document.querySelectorAll("[data-set-theme]").forEach(function (b) {
    b.addEventListener("click", function () {
      var t = b.getAttribute("data-set-theme");
      root.setAttribute("data-theme", t);
      try { localStorage.setItem("noshashi-theme", t); } catch (e) {}
      paintSettings();
    });
  });
  document.querySelectorAll("[data-set-accent]").forEach(function (b) {
    b.addEventListener("click", function () {
      var a = b.getAttribute("data-set-accent");
      if (a === "blue") root.setAttribute("data-accent", "blue"); else root.removeAttribute("data-accent");
      try { localStorage.setItem("noshashi-accent", a); } catch (e) {}
      paintSettings();
    });
  });
  var clear = document.querySelector("[data-clear-history]");
  if (clear) clear.addEventListener("click", function () {
    try { localStorage.removeItem(HISTORY); } catch (e) {}
    var was = clear.textContent;
    clear.textContent = "Cleared";
    setTimeout(function () { clear.textContent = was; }, 2000);
    renderHistory();
  });

  /* ── feedback (private, through /api/contact) ────────────────────── */
  var fb = document.getElementById("wsFeedback");
  if (fb) {
    var opened = Date.now();
    var sending = false;
    var EMAIL_OK = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;
    fb.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending) return;
      var status = fb.querySelector("[data-fb-status]");
      function say(text, tone) { status.textContent = text; if (tone) status.setAttribute("data-tone", tone); else status.removeAttribute("data-tone"); }
      var what = fb.what.value.trim(), email = fb.email.value.trim(), consent = fb.consent.checked;
      if (what.length < 12) { say("Describe your experience in at least a few words.", "bad"); fb.what.focus(); return; }
      if (email && !EMAIL_OK.test(email)) { say("That email address does not look right. Leave it empty to send without one.", "bad"); fb.email.focus(); return; }
      if (email && !consent) { say("Tick the consent box to be contacted, or leave the email empty.", "bad"); fb.consent.focus(); return; }
      var extra = [["Trying to", fb.goal], ["Useful", fb.useful], ["Confusing or missing", fb.missing], ["Would use again if", fb.again], ["Role", fb.role]]
        .map(function (p) { var v = p[1].value.trim(); return v ? p[0] + ": " + v : ""; }).filter(Boolean);
      var send = fb.querySelector("button[type=submit]");
      sending = true; send.disabled = true; say("Sending…");
      fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: "feedback", name: fb.role.value.trim() || "Tester", email: email, consent: consent, org: "",
          subject: "Tester feedback · " + fb.kind.value,
          message: "Category: " + fb.kind.value + "\nPage: " + location.pathname + "\nLast input: " + (lastInput || "—") +
            "\n\n" + what + (extra.length ? "\n\n" + extra.join("\n") : ""),
          elapsed: Date.now() - opened, company_website: fb.company_website.value
        })
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          if (res.ok) { fb.reset(); say(email ? "Thank you. You will get a reply at the address you gave." : "Thank you. The founder reads every one.", "good"); return; }
          say((res.body.error || "That did not send.") + " You can also email support@noshashi.app.", "bad");
        })
        .catch(function () { say("Could not reach the server, so nothing was sent. Email support@noshashi.app instead.", "bad"); })
        .then(function () { sending = false; send.disabled = false; });
    });
  }

  /* ── recent analyses (this browser only) ─────────────────────────── */
  var TOOL_NAMES = { asset: "Asset intelligence", issuer: "Issuer analysis", payment: "Payment verification", liquidity: "Liquidity analysis" };
  function loadHistory() { try { return JSON.parse(localStorage.getItem(HISTORY) || "[]") || []; } catch (e) { return []; } }
  function remember(tool, q, label, summary) {
    var list = loadHistory().filter(function (h) { return !(h.tool === tool && h.q === q); });
    list.unshift({ tool: tool, q: q, label: label, summary: summary, at: new Date().toISOString() });
    try { localStorage.setItem(HISTORY, JSON.stringify(list.slice(0, 12))); } catch (e) {}
  }
  var historyBox = document.querySelector("[data-history-list]");
  var historyEmpty = historyBox ? historyBox.innerHTML : "";
  function renderHistory() {
    var box = historyBox;
    if (!box) return;
    var list = loadHistory();
    if (!list.length) { box.innerHTML = historyEmpty; return; }
    box.innerHTML = '<ul class="ws-history">' + list.map(function (h) {
      var when = new Date(h.at);
      return '<li><a href="/app/' + esc(h.tool) + "/?q=" + encodeURIComponent(h.q) + '"><span class="k">' + esc(TOOL_NAMES[h.tool] || h.tool) +
        '</span><span><span class="v">' + esc(h.label) + "</span>" + (h.summary ? '<br><span class="t">' + esc(h.summary) + "</span>" : "") +
        '</span><span class="t">' + esc(when.toLocaleDateString()) + "</span></a></li>";
    }).join("") + "</ul>";
  }
  renderHistory();

  /* ── overview: data-source checks ────────────────────────────────── */
  function srcState(key, ok, text) {
    var cell = document.querySelector('[data-src="' + key + '"]');
    if (cell) cell.innerHTML = '<span class="ws-dot ' + (ok ? "ok" : "bad") + '"></span>' + esc(text);
  }
  if (document.querySelector("[data-sources]")) {
    rpc("server_info", {}).then(function (r) {
      var v = r.info && r.info.validated_ledger;
      srcState("node", true, v ? "Reachable · validated ledger " + fmt(v.seq, 0) : "Reachable");
    }).catch(function () { srcState("node", false, "Not reachable from this browser right now"); });
    api("/api/issuer-state?issuer=rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B").then(function (b) {
      srcState("api", true, "Answering · ledger " + fmt(b.result && b.result.ledger_index, 0));
    }).catch(function (e) { srcState("api", false, e.message || "Not answering"); });
  }

  /* ── tool plumbing ───────────────────────────────────────────────── */
  var form = document.querySelector("form[data-run]");
  var result = document.querySelector("[data-result]");
  var empty = document.querySelector("[data-empty]");
  var input = form && form.querySelector("[name=q]");
  function show(html) { if (empty) empty.hidden = true; result.hidden = false; result.innerHTML = html; }
  function fail(msg) {
    show('<p class="ws-error" role="alert">' + esc(msg) + " Nothing is shown in its place.</p>" +
      '<div class="ws-next"><button type="button" class="ws-btn" data-ctx-open-inline="feedback">Report a problem</button></div>');
    wireInline();
  }
  function wireInline() {
    result.querySelectorAll("[data-ctx-open-inline]").forEach(function (b) {
      b.addEventListener("click", function () { openCtx(b.getAttribute("data-ctx-open-inline"), b); });
    });
  }
  function busy(on, label) {
    var b = form.querySelector("button[type=submit]");
    if (on) { b.dataset.was = b.textContent; b.textContent = label || "Reading…"; b.disabled = true; }
    else { b.textContent = b.dataset.was || b.textContent; b.disabled = false; }
  }
  function next(links) {
    return '<div class="ws-next">' + links + '<button type="button" class="ws-btn" data-ctx-open-inline="details">Source &amp; method</button>' +
      '<button type="button" class="ws-btn" data-ctx-open-inline="feedback">Report a problem</button></div>';
  }
  function invalid(msg) {
    input.setAttribute("aria-invalid", "true");
    fail(msg);
    input.focus();
  }
  var ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

  var RUN = {};

  /* Issuer analysis */
  RUN.issuer = function (q) {
    if (!ADDRESS.test(q)) return invalid("That is not an XRPL classic address. It starts with r and is 25 to 35 characters.");
    show('<p class="ws-loading">Reading ' + esc(q) + " at the latest validated ledger…</p>");
    busy(true);
    return api("/api/issuer-state?issuer=" + encodeURIComponent(q)).then(function (b) {
      var r = b.result || {}, d = r.account_data || {}, f = r.account_flags || {};
      if (!d.Account) throw new Error("The ledger has no account at that address.");
      var fee = d.TransferRate ? (d.TransferRate / 1e9 - 1) * 100 : 0;
      var signers = (d.signer_lists && d.signer_lists[0] && d.signer_lists[0].SignerEntries) || [];
      var domain = "";
      if (d.Domain) for (var i = 0; i < d.Domain.length; i += 2) domain += String.fromCharCode(parseInt(d.Domain.substr(i, 2), 16));
      var notes = [];
      notes.push(f.noFreeze ? "Has permanently given up the right to freeze individual trust lines." : "Can freeze a holder's trust line, which would stop that holder moving the token.");
      if (f.globalFreeze) notes.push("A global freeze is on: holders cannot move this issuer's tokens except back to the issuer.");
      notes.push(f.allowTrustLineClawback ? "Can claw tokens back from holders." : "Clawback is not enabled.");
      if (fee > 0) notes.push("Charges a " + fmt(fee, 4) + "% fee on every transfer between holders.");
      if (f.requireAuthorization) notes.push("Approves each holder before they can hold its tokens.");
      show('<div class="ws-result-head"><h2>' + esc(q) + "</h2>" + freshness(b.read_at) + (domain ? '<span class="ws-badge">' + esc(domain) + "</span>" : "") + "</div>" +
        '<dl class="ws-metrics">' +
        metric("Freeze holders", f.noFreeze ? "No" : "Yes", f.noFreeze ? "right given up" : "right kept", f.noFreeze ? "go" : "hold") +
        metric("Global freeze", f.globalFreeze ? "On" : "Off", "", f.globalFreeze ? "nogo" : "go") +
        metric("Clawback", f.allowTrustLineClawback ? "Enabled" : "Off", "", f.allowTrustLineClawback ? "hold" : "go") +
        metric("Transfer fee", fee > 0 ? fmt(fee, 4) + "%" : "None", "", fee > 0 ? "hold" : "go") +
        "</dl>" +
        '<div class="ws-block"><h3 class="ws-h2">What this means</h3><ul class="ws-notes">' + notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") +
        "<li>These are the issuer's powers, not a verdict. One passing check does not make a token safe.</li></ul></div>" +
        '<div class="ws-block"><h3 class="ws-h2">Not shown by the ledger: verify yourself</h3><ul class="ws-notes">' +
        "<li>" + (domain ? "Who runs this account. The domain " + esc(domain) + " is set by the account itself: confirm the issuer lists this address in that domain's xrp-ledger.toml and on its own website."
          : "Who runs this account. No domain is set, so the ledger names no operator: find this address published by the issuer itself before trusting it.") + "</li>" +
        "<li>Which token you hold. One issuer can issue several currency codes; check the exact code on your trust line.</li>" +
        "<li>Whether the token is backed or redeemable. Reserves, attestations and redemption terms are off-ledger; ask the issuer for them.</li>" +
        "<li>Whether these settings will stay. They are read at the ledger shown; the account's key holders can change most of them later (giving up freeze is permanent).</li></ul></div>" +
        '<div class="ws-block"><h3 class="ws-h2">Evidence</h3>' + table([
          row("Must approve each holder", f.requireAuthorization ? "Yes" : "No"),
          row("Master key", f.disableMasterKey ? "Disabled" : "Enabled"),
          row("Regular key", d.RegularKey ? '<span class="mono">' + esc(d.RegularKey) + "</span>" : "None"),
          row("Multi-signing", signers.length ? signers.length + " signers" : "Not set"),
          row("Validated ledger", '<span class="mono">' + fmt(r.ledger_index, 0) + "</span>"),
          row("Flags field", '<span class="mono">' + esc(d.Flags) + "</span>")
        ]) + raw("Raw ledger reply", r) + "</div>" +
        next('<a class="ws-btn" href="/certificate/?issuer=' + encodeURIComponent(q) + '">Full authority certificate</a>' +
          '<a class="ws-btn" href="https://livenet.xrpl.org/accounts/' + encodeURIComponent(q) + '" rel="noopener" target="_blank">Open in explorer</a>'));
      setDetails('<p class="ws-ctx-label">This result</p><dl><dt>Account</dt><dd>' + esc(q) + "</dd><dt>Validated ledger</dt><dd>" + fmt(r.ledger_index, 0) +
        "</dd><dt>Ledger hash</dt><dd>" + esc(r.ledger_hash) + "</dd><dt>Read at</dt><dd>" + esc(b.read_at) + "</dd><dt>Method</dt><dd>" + esc(b.method) +
        "</dd></dl><p>" + link("/api/issuer-state?issuer=" + q, "Raw reply from /api/issuer-state") + "</p>");
      remember("issuer", q, q, (f.noFreeze ? "No freeze" : "Can freeze") + " · " + (f.allowTrustLineClawback ? "clawback on" : "no clawback"));
      wireInline();
    }).catch(function (e) { fail(e.message || "Could not read the ledger."); })
      .then(function () { busy(false); });
  };

  /* Payment verification */
  function renderPayment(hash, tx, meta, ledger) {
    if (tx.TransactionType !== "Payment") return fail("That transaction is a " + tx.TransactionType + ", not a payment. Delivered amounts apply to payments only.");
    var req = tx.DeliverMax || tx.Amount, del = meta.delivered_amount;
    var partial = (Number(tx.Flags) & 0x00020000) !== 0;
    var known = del && del !== "unavailable";
    var rv = amtVal(req), dv = amtVal(del), shortPay = known && rv > 0 && dv / rv < 0.9999;
    show('<div class="ws-result-head"><h2>' + esc(short(hash, 20)) + '</h2><span class="ws-badge live">Live · validated</span></div>' +
      '<dl class="ws-metrics">' +
      metric("Requested", esc(amtText(req)), "Amount field") +
      metric("Delivered", known ? esc(amtText(del)) : "Not recorded", "delivered_amount", !known ? "hold" : shortPay ? "nogo" : "go") +
      metric("Share delivered", known && rv > 0 ? fmt((dv / rv) * 100, 4) + "%" : "—", "", shortPay ? "nogo" : known ? "go" : "") +
      metric("Result", esc(meta.TransactionResult), "", meta.TransactionResult === "tesSUCCESS" ? "go" : "nogo") +
      "</dl>" +
      '<div class="ws-block"><h3 class="ws-h2">What this means</h3><ul class="ws-notes"><li>' +
      (!known ? "The ledger did not record a delivered amount for this payment, so it cannot be confirmed from the ledger."
        : shortPay ? "It succeeded but delivered less than its Amount. Crediting the Amount would over-credit the receiver."
        : "It delivered the full amount it requested.") +
      "</li><li>Always credit <code>delivered_amount</code> from the validated result, never <code>Amount</code>.</li></ul></div>" +
      '<div class="ws-block"><h3 class="ws-h2">Evidence</h3>' + table([
        row("From", '<span class="mono">' + esc(tx.Account) + "</span>"),
        row("To", '<span class="mono">' + esc(tx.Destination) + "</span>"),
        row("Partial-payment flag", partial ? "Set" : "Not set", partial ? "hold" : ""),
        row("Validated ledger", '<span class="mono">' + fmt(ledger, 0) + "</span>"),
        row("Hash", '<span class="mono">' + esc(hash) + "</span>")
      ]) + raw("Raw transaction", { tx: tx, meta: meta }) + "</div>" +
      next('<a class="ws-btn" href="https://livenet.xrpl.org/transactions/' + encodeURIComponent(hash) + '" rel="noopener" target="_blank">Open in explorer</a>' +
        '<a class="ws-btn" href="/app/asset/?q=' + encodeURIComponent(tx.Destination) + '">Analyze the receiver</a>'));
    setDetails('<p class="ws-ctx-label">This result</p><dl><dt>Transaction</dt><dd>' + esc(hash) + "</dd><dt>Validated ledger</dt><dd>" + fmt(ledger, 0) +
      "</dd><dt>Source</dt><dd>tx from a public XRPL node</dd><dt>Read at</dt><dd>" + esc(new Date().toISOString()) + "</dd></dl>");
    input.value = hash;
    lastInput = hash;
    history.replaceState(null, "", location.pathname + "?q=" + encodeURIComponent(hash));
    remember("payment", hash, short(hash, 18), known ? (shortPay ? "Short payment" : "Delivered in full") : "Delivered not recorded");
    wireInline();
  }
  RUN.payment = function (q) {
    q = q.toUpperCase();
    if (!/^[0-9A-F]{64}$/.test(q)) return invalid("A transaction hash is 64 hexadecimal characters.");
    show('<p class="ws-loading">Looking the transaction up on public XRPL nodes…</p>');
    busy(true);
    return rpc("tx", { transaction: q, binary: false }).then(function (r) {
      var tx = r.tx_json || r, meta = r.meta || r.metaData;
      if (r.validated !== true) throw new Error("That transaction is not in a validated ledger yet.");
      renderPayment(r.hash || q, tx, meta, r.ledger_index || tx.ledger_index);
    }).catch(function (e) {
      fail(e.message === "no result" || /not found|txnNotFound/i.test(e.message) ? "No public node knows that transaction." : (e.message || "Could not reach a public XRPL node."));
    }).then(function () { busy(false); });
  };
  var finder = document.querySelector("[data-find-payment]");
  if (finder) finder.addEventListener("click", function () {
    finder.disabled = true;
    var was = finder.textContent; finder.textContent = "Searching recent ledgers…";
    show('<p class="ws-loading">Walking back through recent validated ledgers…</p>');
    var scanned = 0, fallback = null;
    rpc("ledger", { ledger_index: "validated" }).then(function (c) {
      var validatedIndex = Number(c.ledger_index);
      function round() {
        if (scanned >= 12) {
          if (fallback) return fallback;
          throw new Error("No successful payment in the last " + scanned + " ledgers. Try again.");
        }
        var batch = [];
        for (var k = 0; k < 3; k++) {
          batch.push(rpc("ledger", { ledger_index: validatedIndex--, transactions: true, expand: true }).catch(function () { return null; }));
          scanned += 1;
        }
        return Promise.all(batch).then(function (rs) {
          for (var j = 0; j < rs.length; j++) {
            var r = rs[j];
            if (!r || r.validated !== true) continue;
            var txs = (r.ledger && r.ledger.transactions) || [];
            for (var i = 0; i < txs.length; i++) {
              var t = txs[i], tx = t.tx_json || t, m = t.meta || t.metaData;
              if (!tx || tx.TransactionType !== "Payment" || !m || m.TransactionResult !== "tesSUCCESS") continue;
              var hit = { hash: t.hash || tx.hash, tx: tx, meta: m, ledger: r.ledger_index };
              var rv = amtVal(tx.DeliverMax || tx.Amount), dv = amtVal(m.delivered_amount);
              if (rv > 0 && dv / rv < 0.99) return hit;
              if (!fallback) fallback = hit;
            }
          }
          return round();
        });
      }
      return round();
    }).then(function (hit) { renderPayment(hit.hash, hit.tx, hit.meta, hit.ledger); })
      .catch(function (e) { fail(e.message || "Could not reach a public XRPL node."); })
      .then(function () { finder.disabled = false; finder.textContent = was; });
  });

  /* Liquidity analysis */
  function bar(label, value, ratio, unit) {
    var pct = Math.max(0, Math.min(1, ratio || 0)) * 100;
    return '<div class="ws-bar-row"><span>' + esc(label) + '</span><span class="ws-bar"><i style="width:' + pct.toFixed(1) + '%"></i></span><b>' + fmt(value, 0) + "</b></div>";
  }
  RUN.liquidity = function (q) {
    var parts = String(q).split("|");
    if (parts.length !== 2) return invalid("Pick a pair from the list.");
    var label = input.options ? input.options[input.selectedIndex].text : q;
    show('<p class="ws-loading">Reading both sides of the book at one validated ledger…</p>');
    busy(true);
    return api("/api/book?format=json&currency=" + encodeURIComponent(parts[0]) + "&issuer=" + encodeURIComponent(parts[1])).then(function (b) {
      if (!b.quoted || !b.fillable) throw new Error("The order book reply was incomplete. Try again in a moment.");
      var u = b.currency_label || cur(parts[0]);
      var ref = b.reference || {};
      var spread = ref.bid && ref.ask && ref.mid ? ((ref.ask - ref.bid) / ref.mid) * 100 : null;
      var fr = b.fillable_ratio || {};
      var maxQ = Math.max(b.quoted.bid || 0, b.quoted.ask || 0) || 1;
      show('<div class="ws-result-head"><h2>' + esc(label) + "</h2>" + freshness(b.read_at) + "</div>" +
        '<dl class="ws-metrics">' +
        metric("Fillable, buy side", fmt(b.fillable.bid, 0) + " " + esc(u), fmt((fr.bid || 0) * 100, 1) + "% of advertised", fr.bid < 0.5 ? "nogo" : "go") +
        metric("Fillable, sell side", fmt(b.fillable.ask, 0) + " " + esc(u), fmt((fr.ask || 0) * 100, 1) + "% of advertised", fr.ask < 0.5 ? "nogo" : "go") +
        metric("Spread at the touch", spread == null ? "—" : fmt(spread, 3) + "%") +
        metric("Validated ledger", fmt(b.ledger_index, 0)) +
        "</dl>" +
        '<div class="ws-block"><h3 class="ws-h2">Advertised against fillable (' + esc(u) + ")</h3><div class=\"ws-bars\">" +
        bar("Buy, advertised", b.quoted.bid, b.quoted.bid / maxQ) + bar("Buy, fillable", b.fillable.bid, b.fillable.bid / maxQ) +
        bar("Sell, advertised", b.quoted.ask, b.quoted.ask / maxQ) + bar("Sell, fillable", b.fillable.ask, b.fillable.ask / maxQ) +
        '</div><p class="ws-fine">Bars share one scale, so the gap between advertised and fillable is visible at a glance.</p></div>' +
        '<div class="ws-block"><h3 class="ws-h2">Limits of this calculation</h3><ul class="ws-notes">' +
        (b.disclosures || []).map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") +
        "<li>Slippage: taking the whole band can move the price by up to " + fmt((b.band || 0) * 100, 0) + "%. This is depth, not a quote for a specific order size.</li></ul>" +
        raw("Summary reply", b) + "</div>" +
        next('<a class="ws-btn" href="/api/book?format=raw&currency=' + encodeURIComponent(parts[0]) + "&issuer=" + encodeURIComponent(parts[1]) + '">Raw ledger replies</a>' +
          '<a class="ws-btn" href="/book-health/">Book health across major pairs</a>'));
      setDetails('<p class="ws-ctx-label">This result</p><dl><dt>Pair</dt><dd>' + esc(label) + "</dd><dt>Validated ledger</dt><dd>" + fmt(b.ledger_index, 0) +
        "</dd><dt>Read at</dt><dd>" + esc(b.read_at) + "</dd><dt>Offers read</dt><dd>" + (b.offers_read ? b.offers_read.bids + " bids · " + b.offers_read.asks + " asks" : "—") +
        "</dd><dt>Band</dt><dd>" + fmt((b.band || 0) * 100, 0) + "% of mid</dd></dl>");
      remember("liquidity", q, label, "Sell side " + fmt((fr.ask || 0) * 100, 1) + "% fillable");
      wireInline();
    }).catch(function (e) { fail(e.message || "Could not read the order book."); })
      .then(function () { busy(false); });
  };

  /* Asset intelligence: holdings and issuer controls */
  RUN.asset = function (q) {
    if (!ADDRESS.test(q)) return invalid("That is not an XRPL classic address. It starts with r and is 25 to 35 characters.");
    show('<p class="ws-loading">Reading trust lines at the latest validated ledger…</p>');
    busy(true);
    return rpc("account_lines", { account: q, ledger_index: "validated", limit: 200 }).then(function (r) {
      var lines = r.lines || [];
      if (!lines.length) {
        show('<div class="ws-result-head"><h2>' + esc(q) + '</h2><span class="ws-badge live">Live · validated</span></div>' +
          '<div class="ws-empty"><p><b>No token holdings.</b> This account has no trust lines at ledger ' + fmt(r.ledger_index, 0) + ".</p></div>");
        remember("asset", q, q, "No trust lines");
        return;
      }
      var issuers = [];
      lines.forEach(function (l) { if (issuers.indexOf(l.account) < 0) issuers.push(l.account); });
      var checked = issuers.slice(0, 12);
      return Promise.all(checked.map(function (iss) {
        return api("/api/issuer-state?issuer=" + encodeURIComponent(iss)).then(function (b) { return [iss, (b.result || {}).account_flags || null]; })
          .catch(function () { return [iss, null]; });
      })).then(function (pairs) {
        var flags = {};
        pairs.forEach(function (p) { flags[p[0]] = p[1]; });
        var canFreeze = 0, clawback = 0, frozen = 0;
        var rows = lines.slice(0, 60).map(function (l) {
          var f = flags[l.account];
          var fz = f ? !f.noFreeze : null, cb = f ? !!f.allowTrustLineClawback : null;
          if (fz) canFreeze += 1;
          if (cb) clawback += 1;
          if (l.freeze_peer) frozen += 1;
          return "<tr><td>" + esc(cur(l.currency)) + '</td><td class="mono">' + esc(short(l.account, 12)) + '</td><td class="mono">' + fmt(Number(l.balance), 4) +
            '</td><td class="' + (fz == null ? "" : fz ? "t-hold" : "t-go") + '">' + (fz == null ? "Not checked" : fz ? "Yes" : "No") +
            '</td><td class="' + (cb == null ? "" : cb ? "t-hold" : "t-go") + '">' + (cb == null ? "Not checked" : cb ? "Yes" : "No") +
            '</td><td class="' + (l.freeze_peer ? "t-nogo" : "") + '">' + (l.freeze_peer ? "Frozen" : "—") + "</td></tr>";
        });
        show('<div class="ws-result-head"><h2>' + esc(q) + '</h2><span class="ws-badge live">Live · validated</span></div>' +
          '<dl class="ws-metrics">' +
          metric("Token lines", fmt(lines.length, 0), r.marker ? "first 200 shown" : "") +
          metric("Issuers", fmt(issuers.length, 0), issuers.length > checked.length ? checked.length + " checked" : "all checked") +
          metric("Issuer can freeze", fmt(canFreeze, 0), "lines", canFreeze ? "hold" : "go") +
          metric("Frozen now", fmt(frozen, 0), "lines", frozen ? "nogo" : "go") +
          "</dl>" +
          '<div class="ws-block"><h3 class="ws-h2">Holdings</h3><div class="ws-table-wrap"><table class="ws-table"><thead><tr><th scope="col">Token</th><th scope="col">Issuer</th><th scope="col">Balance</th><th scope="col">Can freeze</th><th scope="col">Clawback</th><th scope="col">Line</th></tr></thead><tbody>' +
          rows.join("") + "</tbody></table></div>" +
          (lines.length > 60 ? '<p class="ws-fine">Showing the first 60 of ' + lines.length + " lines.</p>" : "") +
          '<p class="ws-fine">' + clawback + " line(s) are with issuers that can claw back. Issuer powers describe what could happen, not what will.</p>" +
          raw("Raw trust lines", r) + "</div>" +
          next(issuers[0] ? '<a class="ws-btn" href="/app/issuer/?q=' + encodeURIComponent(issuers[0]) + '">Analyze the first issuer</a>' : ""));
        setDetails('<p class="ws-ctx-label">This result</p><dl><dt>Account</dt><dd>' + esc(q) + "</dd><dt>Validated ledger</dt><dd>" + fmt(r.ledger_index, 0) +
          "</dd><dt>Trust lines</dt><dd>" + lines.length + (r.marker ? " (more exist)" : "") + "</dd><dt>Issuers checked</dt><dd>" + checked.length + " of " + issuers.length + "</dd></dl>");
        remember("asset", q, q, lines.length + " lines · " + canFreeze + " freezable");
        wireInline();
      });
    }).catch(function (e) {
      fail(/actNotFound|Account not found/i.test(e.message || "") ? "The ledger has no account at that address." : (e.message || "Could not reach a public XRPL node."));
    }).then(function () { busy(false); });
  };

  if (form && RUN[form.getAttribute("data-run")]) {
    var run = RUN[form.getAttribute("data-run")];
    var running = false;
    var submit = function () {
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { cancelable: true }));
    };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (running) return;
      input.removeAttribute("aria-invalid");
      lastInput = String(input.value).trim();
      if (!lastInput) return invalid("Enter something to analyze first.");
      history.replaceState(null, "", location.pathname + "?q=" + encodeURIComponent(lastInput));
      var p = run(lastInput);
      if (p && p.then) {
        running = true;
        p.then(function () { running = false; }, function () { running = false; });
      }
    });
    document.querySelectorAll("[data-example]").forEach(function (b) {
      b.addEventListener("click", function () { if (running) return; input.value = b.getAttribute("data-example"); submit(); });
    });
    var q0 = new URLSearchParams(location.search).get("q");
    if (q0) {
      if (input.tagName === "SELECT") { if ([].some.call(input.options, function (o) { return o.value === q0; })) input.value = q0; }
      else input.value = q0;
      submit();
    }
  }

  /* ── first-use guide and tester card: dismissible, remembered here ── */
  document.querySelectorAll("[data-dismiss-key]").forEach(function (box) {
    var key = "noshashi:ws:dismissed:" + box.getAttribute("data-dismiss-key");
    try { if (localStorage.getItem(key) === "1") { box.hidden = true; return; } } catch (e) {}
    var x = box.querySelector("[data-dismiss]");
    if (x) x.addEventListener("click", function () {
      box.hidden = true;
      try { localStorage.setItem(key, "1"); } catch (e) {}
      if (input) input.focus();
    });
  });
  document.querySelectorAll("[data-start-analyzing]").forEach(function (b) {
    b.addEventListener("click", function () { if (input) { input.focus(); input.scrollIntoView({ block: "center" }); } });
  });
  if (new URLSearchParams(location.search).get("feedback") === "1") openCtx("feedback");
})();
