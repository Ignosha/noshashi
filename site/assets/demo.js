/*
 * The institutional demo (/institutional-demo/).
 *
 * Three guided scenarios, each five short steps, every figure read live:
 *
 *   A. Issuer risk          /api/issuer-state  (account_info at the validated ledger)
 *   B. Payment verification public XRPL JSON-RPC, tx + validated ledgers
 *   C. Liquidity            /api/book          (quoted vs fillable, api/_lib/book.js)
 *
 * Nothing here is sample data. When a read fails the step says so and
 * shows nothing in its place. Progress is kept in this browser only
 * (localStorage), as a convenience; there is no account behind it.
 */
(function () {
  "use strict";
  var root = document.getElementById("demo");
  if (!root) return;

  var NODES = ["https://xrplcluster.com", "https://xrpl.ws", "https://xrpl.link"];
  var KEY = "noshashi-demo-progress";

  /* ── helpers ─────────────────────────────────────────────────────── */
  function esc(x) {
    return String(x).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function nt(x) { return '<span translate="no">' + esc(x) + "</span>"; }
  function fmt(n, d) {
    if (n == null || !isFinite(n)) return "—";
    return Number(n).toLocaleString("en-US", { maximumFractionDigits: d == null ? 2 : d });
  }
  function link(href, text) { return '<a href="' + esc(href) + '" rel="noopener" target="_blank">' + esc(text) + "</a>"; }

  function rpc(method, params) {
    var i = 0;
    function go() {
      return fetch(NODES[i], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: method, params: [params] })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.result) throw new Error("no result");
        return j.result;
      }).catch(function (e) {
        i += 1;
        if (i < NODES.length) return go();
        throw e;
      });
    }
    return go();
  }
  function api(path) {
    return fetch(path, { headers: { Accept: "application/json" } }).then(function (r) {
      return r.json().then(function (b) {
        if (!r.ok) throw new Error(b && b.error ? b.error : "The service answered " + r.status + ".");
        return b;
      });
    });
  }
  function amtVal(a) {
    if (a == null) return NaN;
    if (typeof a === "string") return Number(a) / 1e6;
    return Number(a.value);
  }
  function amtText(a) {
    if (a == null) return "—";
    if (typeof a === "string") return fmt(Number(a) / 1e6, 6) + " XRP";
    var cur = a.currency.length === 40 ? hexCurrency(a.currency) : a.currency;
    return fmt(Number(a.value), 6) + " " + cur;
  }
  function hexCurrency(h) {
    var s = "";
    for (var i = 0; i < h.length; i += 2) {
      var c = parseInt(h.substr(i, 2), 16);
      if (c) s += String.fromCharCode(c);
    }
    return s || h;
  }

  /* ── progress (this browser only) ────────────────────────────────── */
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  var progress = loadProgress();
  function saveProgress() { try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (e) {} }
  function markDone(id) {
    progress[id] = true;
    saveProgress();
    paintChecklist();
  }
  function paintChecklist() {
    var boxes = document.querySelectorAll("[data-task]");
    var done = 0;
    boxes.forEach(function (box) {
      var on = !!progress[box.getAttribute("data-task")];
      box.checked = on;
      if (on) done += 1;
    });
    var meter = document.getElementById("taskMeter");
    if (meter) meter.textContent = done + " of " + boxes.length + " complete";
    var tbar = document.getElementById("taskBar");
    if (tbar) tbar.style.width = (boxes.length ? (done / boxes.length) * 100 : 0) + "%";
    document.querySelectorAll("[data-scenario-tab]").forEach(function (tab) {
      tab.classList.toggle("done", !!progress["scenario-" + tab.getAttribute("data-scenario-tab")]);
    });
  }
  document.querySelectorAll("[data-task]").forEach(function (box) {
    box.addEventListener("change", function () {
      progress[box.getAttribute("data-task")] = box.checked;
      saveProgress();
      paintChecklist();
    });
  });
  var reset = document.getElementById("taskReset");
  if (reset) reset.addEventListener("click", function () { progress = {}; saveProgress(); paintChecklist(); });

  /* ── scenario tabs ───────────────────────────────────────────────── */
  var tabs = root.querySelectorAll("[data-scenario-tab]");
  function show(id) {
    tabs.forEach(function (t) {
      var on = t.getAttribute("data-scenario-tab") === id;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.classList.toggle("on", on);
    });
    root.querySelectorAll("[data-scenario]").forEach(function (p) {
      p.hidden = p.getAttribute("data-scenario") !== id;
    });
  }
  tabs.forEach(function (t) {
    t.addEventListener("click", function () { show(t.getAttribute("data-scenario-tab")); });
  });

  /* ── step rendering ──────────────────────────────────────────────── */
  function stepper(panel) {
    var steps = panel.querySelectorAll(".dstep");
    var bar = panel.querySelector(".dbar i");
    var label = panel.querySelector(".dcount");
    return {
      reset: function () {
        steps.forEach(function (s, i) {
          s.classList.toggle("active", i === 0);
          s.classList.remove("ok", "bad");
          if (i > 0) { var out = s.querySelector(".dout"); if (out) out.innerHTML = ""; }
        });
        this.at(1);
      },
      at: function (n) {
        if (bar) bar.style.width = (n / steps.length) * 100 + "%";
        if (label) label.textContent = "Step " + n + " of " + steps.length;
      },
      fill: function (n, html, tone) {
        var s = steps[n - 1];
        if (!s) return;
        s.querySelector(".dout").innerHTML = html;
        s.classList.add("active");
        s.classList.add(tone === "bad" ? "bad" : "ok");
        this.at(n);
      },
      fail: function (n, message) {
        this.fill(n, '<p class="dwarn">' + esc(message) + " Nothing is shown in its place.</p>", "bad");
      }
    };
  }
  function busy(button, on, text) {
    if (!button) return;
    if (on) { button.dataset.was = button.textContent; button.textContent = text || "Reading the ledger…"; button.disabled = true; }
    else { button.textContent = button.dataset.was || button.textContent; button.disabled = false; }
  }
  function row(k, v, tone) {
    return '<tr><th scope="row">' + esc(k) + '</th><td class="' + (tone ? "t-" + tone : "") + '">' + v + "</td></tr>";
  }

  /* ── A. Issuer risk ──────────────────────────────────────────────── */
  (function () {
    var panel = root.querySelector('[data-scenario="issuer"]');
    if (!panel) return;
    var form = panel.querySelector("form"), input = panel.querySelector("input"), button = panel.querySelector("button[type=submit]");
    var s = stepper(panel);
    panel.querySelectorAll("[data-example]").forEach(function (b) {
      b.addEventListener("click", function () { input.value = b.getAttribute("data-example"); form.requestSubmit(); });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var addr = input.value.trim();
      if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(addr)) { s.reset(); s.fail(1, "That is not an XRPL classic address (it starts with r)."); return; }
      s.reset();
      busy(button, true);
      s.fill(1, "<p>Reading " + nt(addr) + " at the latest validated ledger…</p>");
      api("/api/issuer-state?issuer=" + encodeURIComponent(addr)).then(function (b) {
        var r = b.result || {}, d = r.account_data || {}, f = r.account_flags || {};
        if (!d.Account) throw new Error("The ledger has no account at that address.");
        var fee = d.TransferRate ? (d.TransferRate / 1e9 - 1) * 100 : 0;
        var signers = (d.signer_lists && d.signer_lists[0] && d.signer_lists[0].SignerEntries) || (r.signer_lists && r.signer_lists[0] && r.signer_lists[0].SignerEntries) || [];
        s.fill(1, "<p>Selected " + nt(addr) + (d.Domain ? " · domain " + nt(hexCurrency(d.Domain)) : "") + ".</p>");

        s.fill(2, '<table class="dtable">' +
          row("Can freeze individual holders", f.noFreeze ? "No — gave the right up" : "Yes", f.noFreeze ? "go" : "hold") +
          row("Global freeze on now", f.globalFreeze ? "Yes" : "No", f.globalFreeze ? "nogo" : "go") +
          row("Can claw back balances", f.allowTrustLineClawback ? "Yes" : "No", f.allowTrustLineClawback ? "hold" : "go") +
          row("Must approve each holder", f.requireAuthorization ? "Yes" : "No", f.requireAuthorization ? "hold" : "") +
          row("Transfer fee", fee > 0 ? fmt(fee, 4) + "%" : "None", fee > 0 ? "hold" : "go") +
          row("Master key", f.disableMasterKey ? "Disabled" : "Enabled", "") +
          row("Regular key", d.RegularKey ? nt(d.RegularKey) : "None", "") +
          row("Multi-signing", signers.length ? signers.length + " signers" : "Not set", "") +
          "</table>");

        var notes = [];
        notes.push(f.noFreeze
          ? "This issuer has permanently given up the right to freeze individual trust lines."
          : "This issuer can freeze a holder's trust line, which would stop that holder moving the token.");
        if (f.globalFreeze) notes.push("A global freeze is active: no holder can currently move this issuer's tokens except back to the issuer.");
        notes.push(f.allowTrustLineClawback
          ? "Clawback is enabled: the issuer can take tokens back from holders."
          : "Clawback is not enabled on this account.");
        if (fee > 0) notes.push("Every transfer between holders pays a " + fmt(fee, 4) + "% fee to the issuer.");
        if (f.requireAuthorization) notes.push("Holders must be approved by the issuer before they can hold its tokens.");
        s.fill(3, "<ul>" + notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>");

        s.fill(4, '<table class="dtable">' +
          row("Validated ledger", nt(fmt(r.ledger_index, 0)), "") +
          row("Ledger hash", nt(String(r.ledger_hash || "").slice(0, 16) + "…"), "") +
          row("Flags field", nt(d.Flags), "") +
          row("Method", nt(b.method || "account_info"), "") +
          row("Read at", nt(b.read_at || ""), "") + "</table>");

        s.fill(5, "<p>Check it yourself: " +
          link("https://livenet.xrpl.org/accounts/" + addr, "XRPL explorer") + " · " +
          link("/api/issuer-state?issuer=" + addr, "the raw ledger reply") + " · " +
          link("/certificate/?issuer=" + addr, "full authority certificate") + "</p>");
        markDone("scenario-issuer");
      }).catch(function (e) { s.fail(2, e.message || "Could not read the ledger."); })
        .then(function () { busy(button, false); });
    });
  })();

  /* ── B. Payment verification ─────────────────────────────────────── */
  (function () {
    var panel = root.querySelector('[data-scenario="payment"]');
    if (!panel) return;
    var form = panel.querySelector("form"), input = panel.querySelector("input"), button = panel.querySelector("button[type=submit]");
    var finder = panel.querySelector("[data-find]");
    var s = stepper(panel);

    function render(hash, tx, meta, ledger) {
      s.fill(1, "<p>Loaded transaction " + nt(hash.slice(0, 16) + "…") + ".</p>");
      if (tx.TransactionType !== "Payment") {
        s.fill(2, "<p>This is a " + nt(tx.TransactionType) + ", not a payment.</p>", "bad");
        s.fail(3, "Delivered amounts apply to payments only.");
        return;
      }
      s.fill(2, '<table class="dtable">' +
        row("Result", nt(meta.TransactionResult), meta.TransactionResult === "tesSUCCESS" ? "go" : "nogo") +
        row("Ledger", nt(fmt(ledger, 0)) + " (validated)", "") +
        row("From", nt(tx.Account), "") +
        row("To", nt(tx.Destination), "") + "</table>");

      var req = tx.DeliverMax || tx.Amount, del = meta.delivered_amount;
      var partial = (Number(tx.Flags) & 0x00020000) !== 0;
      if (!del || del === "unavailable") {
        s.fill(3, '<table class="dtable">' + row("Requested", nt(amtText(req)), "") + row("Delivered", "Not recorded by the ledger", "hold") + "</table>");
        s.fill(4, "<p>The ledger did not record a delivered amount for this payment (it happens for very old transactions), so the delivered figure cannot be confirmed from the ledger.</p>", "bad");
      } else {
        var rv = amtVal(req), dv = amtVal(del), short = rv > 0 && dv / rv < 0.9999;
        s.fill(3, '<table class="dtable">' +
          row("Requested (Amount)", nt(amtText(req)), "") +
          row("Delivered (delivered_amount)", nt(amtText(del)), short ? "nogo" : "go") +
          row("Partial-payment flag", partial ? "Set" : "Not set", partial ? "hold" : "") +
          (short ? row("Share delivered", fmt((dv / rv) * 100, 4) + "%", "nogo") : "") + "</table>");
        s.fill(4, "<p>" + (short
          ? "This payment succeeded but delivered less than its Amount field. A system that credits the Amount would over-credit the receiver."
          : "This payment delivered the full amount it requested.") +
          " The figure that matters is <span class=\"mono\">delivered_amount</span> from the validated result, never <span class=\"mono\">Amount</span>.</p>" +
          '<p class="dnote">Limits: only Payment transactions; amounts are as the ledger recorded them; no exchange-rate conversion is applied.</p>');
      }
      s.fill(5, "<p>Verify independently: " + link("https://livenet.xrpl.org/transactions/" + hash, "XRPL explorer") +
        " · " + link("/delivered/", "export an account's delivered amounts") + "</p>");
      markDone("scenario-payment");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var h = input.value.trim().toUpperCase();
      s.reset();
      if (!/^[0-9A-F]{64}$/.test(h)) { s.fail(1, "A transaction hash is 64 hexadecimal characters."); return; }
      busy(button, true);
      rpc("tx", { transaction: h, binary: false }).then(function (r) {
        var tx = r.tx_json || r, meta = r.meta || r.metaData;
        if (r.validated !== true) throw new Error("That transaction is not in a validated ledger yet.");
        render(r.hash || h, tx, meta, r.ledger_index || tx.ledger_index);
      }).catch(function (err) { s.fail(2, err.message === "no result" ? "No public node knows that transaction." : (err.message || "Could not reach a public XRPL node.")); })
        .then(function () { busy(button, false); });
    });

    if (finder) finder.addEventListener("click", function () {
      s.reset();
      busy(finder, true, "Searching recent ledgers…");
      var LEDGERS = 12, scanned = 0;
      rpc("ledger", { ledger_index: "validated" }).then(function (c) {
        var validatedIndex = Number(c.ledger_index);
        var fallback = null;
        function round() {
          if (scanned >= LEDGERS) {
            if (fallback) return fallback;
            throw new Error("No successful payment found in the last " + scanned + " ledgers. Try again.");
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
                if (rv > 0 && dv / rv < 0.99) return hit;   // a short payment: the case worth seeing
                if (!fallback) fallback = hit;
              }
            }
            return round();
          });
        }
        return round();
      }).then(function (hit) {
        input.value = hit.hash;
        render(hit.hash, hit.tx, hit.meta, hit.ledger);
      }).catch(function (err) { s.fail(1, err.message || "Could not reach a public XRPL node."); })
        .then(function () { busy(finder, false); });
    });
  })();

  /* ── C. Liquidity ────────────────────────────────────────────────── */
  (function () {
    var panel = root.querySelector('[data-scenario="liquidity"]');
    if (!panel) return;
    var form = panel.querySelector("form"), select = panel.querySelector("select"), button = panel.querySelector("button[type=submit]");
    var s = stepper(panel);
    function bar(ratio) {
      var pct = Math.max(0, Math.min(1, ratio)) * 100;
      return '<span class="dmeter"><i style="width:' + pct.toFixed(1) + '%"></i></span> ' + fmt(pct, 1) + "%";
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var parts = select.value.split("|");
      s.reset();
      busy(button, true);
      s.fill(1, "<p>Selected XRP / " + nt(select.options[select.selectedIndex].text) + ".</p>");
      api("/api/book?format=json&currency=" + encodeURIComponent(parts[0]) + "&issuer=" + encodeURIComponent(parts[1])).then(function (b) {
        var age = b.read_at ? Math.max(0, Math.round((Date.now() - Date.parse(b.read_at)) / 1000)) : null;
        s.fill(2, '<table class="dtable">' +
          row("Validated ledger", nt(fmt(b.ledger_index, 0)), "") +
          row("Offers read", nt((b.offers_read ? b.offers_read.bids + " bids · " + b.offers_read.asks + " asks" : "—")), "") +
          row("Data age", age == null ? "—" : age + " seconds", age != null && age > 120 ? "hold" : "go") + "</table>");
        var u = b.currency_label || parts[0];
        s.fill(3, '<table class="dtable">' +
          row("Advertised to buy (" + u + ")", nt(fmt(b.quoted && b.quoted.bid)), "") +
          row("Advertised to sell (" + u + ")", nt(fmt(b.quoted && b.quoted.ask)), "") + "</table>");
        var ref = b.reference || {};
        var spread = ref.bid && ref.ask && ref.mid ? ((ref.ask - ref.bid) / ref.mid) * 100 : null;
        s.fill(4, '<table class="dtable">' +
          row("Can actually fill, buy side", nt(fmt(b.fillable && b.fillable.bid)) + "<br>" + bar(b.fillable_ratio ? b.fillable_ratio.bid : 0), (b.fillable_ratio && b.fillable_ratio.bid < 0.5) ? "nogo" : "go") +
          row("Can actually fill, sell side", nt(fmt(b.fillable && b.fillable.ask)) + "<br>" + bar(b.fillable_ratio ? b.fillable_ratio.ask : 0), (b.fillable_ratio && b.fillable_ratio.ask < 0.5) ? "nogo" : "go") +
          row("Spread at the touch", spread == null ? "—" : fmt(spread, 3) + "%", "") + "</table>" +
          '<p class="dnote">Fillable counts only what each offer\'s owner held at this ledger.</p>');
        s.fill(5, "<ul>" + (b.disclosures || []).map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") +
          "<li>Slippage: taking the whole band can move the price by up to " + fmt((b.band || 0) * 100, 0) + "%; this is depth, not a quote for a specific order size.</li></ul>" +
          "<p>Recompute it yourself: " + link("/api/book?format=raw&currency=" + parts[0] + "&issuer=" + parts[1], "the raw ledger replies") +
          " · " + link("/book-health/", "book health across major pairs") + "</p>");
        markDone("scenario-liquidity");
      }).catch(function (err) { s.fail(2, err.message || "Could not read the order book."); })
        .then(function () { busy(button, false); });
    });
  })();

  /* ── Feedback and issue forms (through /api/contact) ─────────────── */
  function wire(formId, statusId, build) {
    var form = document.getElementById(formId);
    if (!form) return;
    var status = document.getElementById(statusId);
    var opened = Date.now();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var payload = build(form);
      if (!payload) { status.textContent = "Please fill in the required fields."; status.setAttribute("data-tone", "bad"); return; }
      payload.elapsed = Date.now() - opened;
      payload.company_website = (form.querySelector("[name=company_website]") || {}).value || "";
      var send = form.querySelector("button[type=submit]");
      send.disabled = true;
      status.textContent = "Sending…"; status.setAttribute("data-tone", "busy");
      fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          if (res.ok) {
            form.reset();
            status.textContent = "Thank you. The founder reads every one of these.";
            status.setAttribute("data-tone", "good");
            if (formId === "feedbackForm") markDone("feedback");
            return;
          }
          status.textContent = res.body.error || "That did not send. Email support@noshashi.app instead.";
          status.setAttribute("data-tone", "bad");
        })
        .catch(function () { status.textContent = "Could not reach the server. Email support@noshashi.app instead."; status.setAttribute("data-tone", "bad"); })
        .then(function () { send.disabled = false; });
    });
  }
  function val(form, name) { var el = form.querySelector("[name=" + name + "]"); return el ? el.value.trim() : ""; }

  wire("feedbackForm", "feedbackStatus", function (f) {
    var email = val(f, "email"), name = val(f, "name") || "Demo tester";
    var answers = ["expected", "confusing", "today", "value", "pay"].map(function (k) { return [k, val(f, k)]; });
    if (!email || answers.every(function (a) { return !a[1]; })) return null;
    var labels = { expected: "What did you expect the tool to do?", confusing: "What was confusing or missing?", today: "How do you solve this today?",
      value: "Would solving it save time, reduce risk or improve a decision?", pay: "What would NOSHASHI need to deliver for your organization to pay for it?" };
    return {
      topic: "institutions", name: name, email: email, org: val(f, "org"),
      subject: "Demo feedback · " + (val(f, "scenario") || "general"),
      message: "Scenario: " + (val(f, "scenario") || "general") + "\n\n" +
        answers.map(function (a) { return labels[a[0]] + "\n" + (a[1] || "—"); }).join("\n\n")
    };
  });
  wire("issueForm", "issueStatus", function (f) {
    var email = val(f, "email"), what = val(f, "what");
    if (!email || !what) return null;
    return {
      topic: "support", name: val(f, "name") || "Demo tester", email: email, org: "",
      subject: "Demo issue · " + (val(f, "scenario") || "general"),
      message: "Scenario: " + (val(f, "scenario") || "general") + "\nInput used: " + (val(f, "input") || "—") +
        "\n\nWhat happened:\n" + what + "\n\nWhat you expected:\n" + (val(f, "expected") || "—")
    };
  });

  paintChecklist();
  if (location.hash === "#launch") { var first = root.querySelector("[data-scenario-tab]"); if (first) first.focus(); }
})();
