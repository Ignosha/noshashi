/*
 * Continuity: does one issued-token deposit match exactly one posted credit?
 *
 * One script, used in three places:
 *   - tools/continuity/continuity.html, served on loopback by
 *     credit_source.py next to the operator's accounting database;
 *   - noshashi.app/continuity/, built by scripts/build-products.mjs, which
 *     copies this file to site/assets/continuity.js;
 *   - tests/continuity.test.js, which loads it with require().
 *
 * The checks are pure (evaluate, decimal, currencyKey). The page wiring at
 * the bottom only runs when the page's elements are there.
 *
 * Scope: issued tokens (IOUs) only. An XRP payment is refused with a reason,
 * never passed.
 */
(function () {
  "use strict";

  var sample = {
    requirement: { destination: "demo-wallet", issuer: "demo-issuer", currency: "EUR", amount: "25" },
    payment: { validated: true, result: "tesSUCCESS", destination: "demo-wallet", issuer: "demo-issuer", currency: "EUR", delivered: "25" },
    credits: [
      { amount: "25", issuer: "demo-issuer", currency: "EUR" },
      { amount: "25", issuer: "demo-issuer", currency: "EUR" },
    ],
  };

  /**
   * A non-negative amount as a canonical decimal string ("25.00" -> "25",
   * "2.5e1" -> "25"), or null. rippled writes very large and very small
   * issued amounts in exponent form, so that form is accepted too. Issued
   * amounts span exponents -96 to 80; anything outside +-120 is refused.
   */
  function decimal(value) {
    if (typeof value !== "string") return null;
    var m = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value.trim());
    if (!m) return null;
    var whole = m[1], fraction = m[2] || "", exp = m[3] ? Number(m[3]) : 0;
    if (!Number.isInteger(exp) || Math.abs(exp) > 120) return null;
    var digits = whole + fraction;
    var point = whole.length + exp;
    if (point <= 0) {
      digits = "0".repeat(1 - point) + digits;
      point = 1;
    } else if (point > digits.length) {
      digits = digits + "0".repeat(point - digits.length);
    }
    var int = digits.slice(0, point).replace(/^0+(?=\d)/, "");
    var frac = digits.slice(point).replace(/0+$/, "");
    return int + (frac ? "." + frac : "");
  }

  /**
   * One spelling per currency, so "RLUSD" matches the 40-hex code the ledger
   * returns for it. Three-character codes are compared as written (the
   * ledger treats "usd" and "USD" as different currencies).
   */
  function currencyKey(code) {
    if (typeof code !== "string") return null;
    var c = code.trim();
    if (!c) return null;
    if (/^[0-9A-Fa-f]{40}$/.test(c)) return c.toUpperCase();
    if (c.length === 3) return c;
    if (c.length > 40 || !/^[\x20-\x7E]+$/.test(c)) return null;
    var hex = "";
    for (var i = 0; i < c.length; i++) hex += c.charCodeAt(i).toString(16).toUpperCase().padStart(2, "0");
    return (hex + "0".repeat(40)).slice(0, 40);
  }

  function evaluate(input) {
    var r = input && input.requirement, p = input && input.payment, credits = input && input.credits;
    var filled = function (k) { return r && typeof r[k] === "string" && r[k].trim(); };
    if (!r || !p || !["issuer", "currency", "destination"].every(filled) || !decimal(r.amount) || decimal(r.amount) === "0") {
      throw Error("Supply a complete requirement and payment record.");
    }
    var match = function (v, w) { return typeof v !== "string" || !v.trim() ? "UNKNOWN" : v === w ? "PASS" : "FAIL"; };
    var amount = function (v) { return decimal(v) === null ? "UNKNOWN" : match(decimal(v), decimal(r.amount)); };
    var currency = function (v) {
      var a = currencyKey(v), b = currencyKey(r.currency);
      return a === null || b === null ? "UNKNOWN" : a === b ? "PASS" : "FAIL";
    };
    var checks = {
      "Validated successful payment": p.validated === true ? match(p.result, "tesSUCCESS") : "UNKNOWN",
      "Destination": match(p.destination, r.destination),
      "Issued currency": currency(p.currency),
      "Issuer": match(p.issuer, r.issuer),
      "Delivered amount": amount(p.delivered),
      "Exactly one matching credit": Array.isArray(credits) ? (credits.length === 1 ? "PASS" : "FAIL") : "UNKNOWN",
    };
    var credit = Array.isArray(credits) && credits.length === 1 ? credits[0] : null;
    checks["Credited amount"] = amount(credit && credit.amount);
    checks["Credited currency"] = currency(credit && credit.currency);
    checks["Credited issuer"] = match(credit && credit.issuer, r.issuer);
    var states = Object.keys(checks).map(function (k) { return checks[k]; });
    return { verdict: states.indexOf("FAIL") >= 0 ? "FAIL" : states.indexOf("UNKNOWN") >= 0 ? "UNKNOWN" : "PASS", checks: checks };
  }

  /** Dependencies that more than one listed workflow relies on. */
  function dependencies(workflows) {
    var owners = new Map();
    (Array.isArray(workflows) ? workflows : []).forEach(function (flow) {
      new Set(Array.isArray(flow && flow.dependencies) ? flow.dependencies : []).forEach(function (dep) {
        if (!owners.has(dep)) owners.set(dep, new Set());
        owners.get(dep).add(flow.name);
      });
    });
    return Array.from(owners, function (e) { return { dependency: e[0], workflows: Array.from(e[1]) }; })
      .filter(function (x) { return x.workflows.length > 1; });
  }

  /**
   * The payment facts from one rippled `tx` reply (API v2), or a reason it
   * cannot be used. Pure, so the two servers' replies can be compared and
   * the rules tested.
   */
  function settlementFrom(msg, hash) {
    var r = msg && msg.result, t = r && r.tx_json, meta = r && r.meta, d = meta && meta.delivered_amount;
    if (!msg || msg.status !== "success" || !r) return { error: "The server did not return the transaction." };
    if (r.validated !== true || !r.ledger_hash) return { error: "The transaction is not in a validated ledger yet." };
    if (String(r.hash || "").toUpperCase() !== hash) return { error: "The server answered for a different transaction." };
    if (!t || t.TransactionType !== "Payment") return { error: "That transaction is not a Payment." };
    if (meta.TransactionResult === "tesSUCCESS") {
      if (typeof d === "string") return { error: "That is an XRP payment. Continuity checks issued-token deposits only." };
      if (!d || typeof d !== "object" || !d.issuer || !d.currency || decimal(d.value) === null) return { error: "The delivered amount could not be read." };
    }
    return {
      ledgerHash: r.ledger_hash,
      ledgerIndex: r.ledger_index,
      payment: { validated: true, result: meta.TransactionResult, destination: t.Destination, issuer: d && d.issuer, currency: d && d.currency, delivered: d && d.value },
    };
  }

  var api = { sample: sample, decimal: decimal, currencyKey: currencyKey, evaluate: evaluate, dependencies: dependencies, settlementFrom: settlementFrom };
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof document === "undefined" || !document.getElementById("data")) return;

  // ── The page ────────────────────────────────────────────────────────
  var el = function (id) { return document.getElementById(id); };
  var box = el("data"), out = el("result");
  var pretty = function (x) { return JSON.stringify(x, null, 2); };
  var endpoints = ["wss://s1.ripple.com", "wss://s2.ripple.com"];
  var report = null, revision = 0, timer = null;

  function invalidate() {
    revision++; report = null; el("save").disabled = true;
    out.textContent = "Inputs changed. Run checks again.";
  }
  function scenario() { var raw = JSON.parse(box.value); return raw.scenario || raw; }
  function show(input, source, extra) {
    var result = evaluate(input);
    var reasons = Object.keys(result.checks).filter(function (k) { return result.checks[k] === "FAIL"; });
    var diagnosis = reasons.map(function (k) {
      return k === "Exactly one matching credit"
        ? (input.credits.length === 0 ? "No matching credit in the supplied export." : "Multiple credits match this deposit.")
        : k + " differs from the requirement.";
    });
    report = Object.assign({ version: "continuity-deposit/3", source: source, at: new Date().toISOString(), scenario: input },
      result, { diagnosis: diagnosis, sharedDependencies: dependencies(input.workflows) }, extra || {});
    out.textContent = pretty(report); el("save").disabled = false;
  }
  function lookup(url, hash) {
    return new Promise(function (resolve, reject) {
      var ws = new WebSocket(url);
      var timeout = setTimeout(function () { finish({ error: "No reply from " + url + " in time." }); }, 9000);
      function finish(data) {
        clearTimeout(timeout); ws.onclose = ws.onerror = ws.onmessage = null; ws.close();
        data && !data.error ? resolve(data) : reject(Error(url + ": " + ((data && data.error) || "no confirmed response.")));
      }
      ws.onopen = function () { ws.send(JSON.stringify({ id: 1, command: "tx", transaction: hash, api_version: 2 })); };
      ws.onerror = ws.onclose = function () { finish({ error: "connection closed." }); };
      ws.onmessage = function (e) {
        try { var msg = JSON.parse(e.data); if (msg.id !== 1) return; finish(settlementFrom(msg, hash)); }
        catch (err) { finish({ error: "unreadable reply." }); }
      };
    });
  }
  function readCredits(hash) {
    return fetch("/credits/" + hash, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(9000) })
      .then(function (response) { if (!response.ok) throw Error("Accounting source unavailable."); return response.json(); })
      .then(function (source) {
        if (source.transactionHash !== hash || source.creditExportComplete !== true || !Array.isArray(source.credits) ||
          source.credits.some(function (row) { return !row || row.txHash !== hash; })) throw Error("Incomplete or mismatched accounting response.");
        return source;
      });
  }
  function verify() {
    invalidate(); var current = revision;
    var input, hash, connected;
    try {
      input = scenario(); hash = el("hash").value.trim().toUpperCase(); connected = el("connected").checked;
      if (!/^[0-9A-F]{64}$/.test(hash)) throw Error("Enter a valid transaction hash.");
      if (connected && location.origin !== "http://127.0.0.1:8765") throw Error("Open Continuity from the local accounting adapter at http://127.0.0.1:8765.");
    } catch (e) { out.textContent = "UNKNOWN — " + e.message; return; }
    out.textContent = "Checking both Mainnet servers…";
    Promise.all(endpoints.map(function (url) { return lookup(url, hash); }).concat([connected ? readCredits(hash) : input]))
      .then(function (all) {
        if (current !== revision) return;
        var a = all[0], b = all[1], source = all[2];
        if (pretty(a) !== pretty(b)) throw Error("Servers returned different settlement evidence.");
        var rows = source.credits;
        var complete = source.creditExportComplete === true && Array.isArray(rows) &&
          rows.every(function (x) { return x && typeof x.txHash === "string" && /^[0-9a-f]{64}$/i.test(x.txHash); });
        var matched = complete ? rows.filter(function (x) { return x.txHash.toUpperCase() === hash; }) : undefined;
        show(Object.assign({}, input, { payment: a.payment, creditExportComplete: complete, credits: matched }),
          connected ? "Two Mainnet RPC responses and a fresh query of the configured accounting view."
            : "Two Mainnet RPC responses; credit export completeness is operator-declared.",
          { hash: hash, endpoints: endpoints, ledgerHash: a.ledgerHash, ledgerIndex: a.ledgerIndex, matchedExportComplete: complete });
      })
      .catch(function (e) { if (current === revision) out.textContent = "UNKNOWN — " + e.message; });
  }

  box.value = pretty(sample);
  box.oninput = el("connected").onchange = el("hash").oninput = invalidate;
  el("run").onclick = function () { invalidate(); try { show(scenario(), "Local rehearsal from supplied records"); } catch (e) { out.textContent = e.message; } };
  el("verify").onclick = verify;
  el("watch").onchange = function () { clearInterval(timer); if (el("watch").checked) { verify(); timer = setInterval(verify, 60000); } };
  el("replay").onclick = function () { var c = JSON.parse(JSON.stringify(sample)); c.credits.pop(); box.value = pretty(c); el("run").click(); };
  el("save").onclick = function () {
    if (!report) return;
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([pretty(report)], { type: "application/json" }));
    a.download = "continuity-evidence.json"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  };
})();
