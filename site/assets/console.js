/*
 * NOSHASHI API Console (/console/): every public API as a form, with the
 * answer explained in plain language, the exact JSON, and the curl command
 * that reproduces it. Nothing here signs or moves funds. A paid Rippling
 * key, if entered, is kept in sessionStorage for this tab only and is sent
 * only to www.noshashi.app's own API.
 */
(function () {
  "use strict";
  var ORIGIN = "https://www.noshashi.app";
  var ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
  var RLUSD = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
  var RLUSD_HEX = "524C555344000000000000000000000000000000";
  var BITSTAMP = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
  var GATEHUB = "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq";
  var SOLO = "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz";
  var XRT = "rPvuCxw1m8u2SWTqtRN6ZEcb1xPbU4cPFR";

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function num(v) { var n = Number(v); return isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 6 }) : String(v); }
  function pct(v) { return isFinite(Number(v)) ? (Number(v) * 100).toFixed(1) + "%" : "—"; }

  /* Each tool: the question it answers, its inputs, how to call it, and how to read the answer. */
  var TOOLS = [
    { id: "rippling", group: "Your holdings", q: "Can my balances be swapped without my signature?", name: "Rippling exposure",
      plan: "Free", who: "Exchanges, custodians, treasuries, any wallet holding the same token from two issuers.",
      explain: "Reads every trust line of one account and finds the currencies a third party's payment can move between its own lines, at par.",
      fields: [{ k: "account", addr: true, label: "Account address", ex: XRT }],
      req: function (v) { return { url: "/api/v1/rippling?account=" + enc(v.account) }; },
      read: function (b) {
        var exposed = (b.exposures || []).filter(function (e) { return e.exposed; });
        return { verdict: b.verdict, tone: b.verdict === "EXPOSED" ? "bad" : b.verdict === "CLEAR" ? "good" : "warn", headline: b.summary,
          facts: [["Role", b.role], ["Lines read", b.coverage && b.coverage.lines_read], ["Exposed currencies", exposed.map(function (e) { return e.currency_display + " (" + num(e.movable_at_par) + " movable)"; }).join(", ") || "None"], ["Fixes offered", (b.fixes || []).length + " unsigned transaction(s)"], ["Validated ledger", num(b.ledger_index)]],
          meaning: exposed.length ? "Set NoRipple on the listed lines (the fixes are ready to review and sign in your own wallet) and the swap route closes." : "Nothing on this account can be swapped between its own lines today. Re-check when new trust lines are added." };
      } },
    { id: "rippling-batch", group: "Your holdings", q: "Is any wallet in my fleet exposed?", name: "Fleet scan",
      plan: "Starter and up", key: true, who: "Exchanges and custodians running hot, warm, deposit and treasury wallets.",
      explain: "The rippling check for every wallet at once, with totals per currency across the fleet.",
      fields: [{ k: "accounts", label: "Wallet addresses (one per line)", ex: XRT + "\n" + GATEHUB, multi: true }],
      req: function (v) { return { url: "/api/v1/rippling/batch", method: "POST", body: { accounts: v.accounts.split(/[\s,]+/).filter(Boolean) } }; },
      read: function (b) {
        var s = b.summary || {}, t = b.exposed_by_currency || {};
        return { verdict: s.exposed ? "EXPOSED" : "CLEAR", tone: s.exposed ? "bad" : "good", headline: (s.exposed || 0) + " of " + (s.accounts || 0) + " wallets can have a balance swapped between their own lines.",
          facts: [["Wallets checked", s.accounts], ["Exposed", s.exposed], ["Clear", s.clear], ["Could not be read", s.unresolved], ["Movable by currency", Object.keys(t).map(function (c) { return c + " " + num(t[c].movable_at_par); }).join(", ") || "None"]],
          meaning: s.exposed ? "Open each exposed wallet's report below the summary for its unsigned fixes." : "No wallet in this set can be swapped between its own lines today." };
      } },
    { id: "rippling-issuer", group: "Your token", q: "Which of my token's holders can have it swapped out?", name: "Issuer holder scan",
      plan: "Desk and Institution", key: true, who: "Stablecoin and token issuers, and the exchanges that list them.",
      explain: "Checks your largest holders one by one and totals how much of your token a third party could swap out of their accounts.",
      fields: [{ k: "issuer", addr: true, label: "Issuer address", ex: BITSTAMP }, { k: "currency", label: "Currency (USD, RLUSD or 40 hex)", ex: "USD" }, { k: "holders", label: "Holders to check (max 200 a call)", ex: "50" }],
      req: function (v) { return { url: "/api/v1/rippling/issuer?issuer=" + enc(v.issuer) + "&currency=" + enc(v.currency) + "&holders=" + enc(v.holders || "50") }; },
      read: function (b) {
        var s = b.summary || {}, sc = b.scope || {};
        return { verdict: s.holders_exposed ? "EXPOSED" : "CLEAR", tone: s.holders_exposed ? "bad" : "good", headline: (s.holders_exposed || 0) + " of " + (sc.holders_checked || 0) + " holders checked could have your token swapped out: " + num(s.can_be_swapped_out) + " in total.",
          facts: [["Holders found", sc.holders_found], ["Holders checked", sc.holders_checked], ["Held by those holders", num(s.held_by_checked_holders)], ["Share that can be swapped out", s.share_of_checked_balance], ["Next page", sc.next_offset == null ? "None" : "offset=" + sc.next_offset]],
          meaning: "Holders protect themselves by setting NoRipple; you can point them to the free check for their own address." };
      } },
    { id: "authority", group: "Your token", q: "What can this issuer still do to holders?", name: "Issuer controls",
      plan: "Free", who: "Anyone accepting, listing or holding a token.",
      explain: "Reads the issuer's account and signer list: freeze, global freeze, permission to hold, and who controls the keys.",
      fields: [{ k: "issuer", addr: true, label: "Issuer address", ex: RLUSD }],
      req: function (v) { return { url: "/api/authority?issuer=" + enc(v.issuer) }; },
      read: function (b) {
        var checks = b.checks || [], failed = checks.filter(function (c) { return !c.passed; });
        return { verdict: String(b.verdict || "").toUpperCase(), tone: b.verdict === "go" ? "good" : b.verdict === "hold" ? "warn" : "bad", headline: failed.length ? failed.length + " of " + checks.length + " controls are retained by the issuer." : "All " + checks.length + " controls checked are given up or not in use.",
          facts: checks.map(function (c) { return [c.label, c.passed ? "Yes" : "No"]; }).concat([["Validated ledger", num(b.ledgerIndex)]]),
          meaning: failed.map(function (c) { return c.detail; }).join(" ") || "The issuer cannot use the powers checked here." };
      } },
    { id: "history", group: "Your token", q: "What has this issuer changed over time?", name: "Issuer history",
      plan: "Free", who: "Due diligence before listing or accepting a token.",
      explain: "Every change the issuer made to its powers and keys, from the ledger's own history.",
      fields: [{ k: "issuer", addr: true, label: "Issuer address", ex: RLUSD }],
      req: function (v) { return { url: "/api/issuer-history?issuer=" + enc(v.issuer) }; },
      read: function (b) {
        var t = b.tally || {}, ev = (b.events || []).slice(0, 4);
        return { verdict: (t.freezes || t.clawbacks) ? "POWER USED" : (t.power_changes || t.key_changes) ? "CHANGED" : "UNCHANGED", tone: (t.freezes || t.clawbacks) ? "bad" : (t.power_changes || t.key_changes) ? "warn" : "good",
          headline: (t.power_changes || 0) + " power change(s), " + (t.key_changes || 0) + " key change(s), " + (t.freezes || 0) + " freeze(s), " + (t.clawbacks || 0) + " clawback(s).",
          facts: ev.map(function (e) { return [String(e.date || "").slice(0, 10), e.summary]; }).concat([["Read up to ledger", num(b.validated_to)]]),
          meaning: "A freeze or clawback means the issuer has used a power on holders, not only kept it." };
      } },
    { id: "risk", group: "Your token", q: "Is this token safe to accept or list?", name: "Asset risk",
      plan: "Free", who: "Exchanges, custodians and payment firms deciding whether to accept a token.",
      explain: "Issuer controls and real liquidity together, with the unknowns listed instead of guessed.",
      fields: [{ k: "issuer", addr: true, label: "Issuer address", ex: RLUSD }, { k: "currency", label: "Currency (3 letters or 40 hex)", ex: RLUSD_HEX }, { k: "size", label: "Trade size to test", ex: "1000" }],
      req: function (v) { return { url: "/api/v1/asset-risk?issuer=" + enc(v.issuer) + "&currency=" + enc(v.currency) + "&size=" + enc(v.size || "1000") }; },
      read: function (b) {
        var checks = (b.issuer_controls && b.issuer_controls.checks) || [], failed = checks.filter(function (c) { return !c.passed; });
        return { verdict: failed.length ? "REVIEW" : "NO FLAGS", tone: failed.length ? "warn" : "good", headline: failed.length + " issuer control(s) retained; " + (b.unknowns || []).length + " thing(s) the ledger cannot tell us.",
          facts: checks.map(function (c) { return [c.label, c.passed ? "Yes" : "No"]; }).concat([["Unknowns", (b.unknowns || []).length]]),
          meaning: (b.unknowns || []).slice(0, 2).map(function (u) { return typeof u === "string" ? u : u.detail || u.label || ""; }).join(" ") || "See the JSON for the liquidity read and every limitation." };
      } },
    { id: "book", group: "Markets", q: "How deep is the market really?", name: "Real vs advertised depth",
      plan: "Free", who: "Trading desks, treasuries and listing teams.",
      explain: "Compares the order book's advertised size with what is actually funded and fillable, within 10% of mid.",
      fields: [{ k: "issuer", addr: true, label: "Issuer address", ex: RLUSD }, { k: "currency", label: "Currency (3 letters or 40 hex)", ex: RLUSD_HEX }],
      req: function (v) { return { url: "/api/book?issuer=" + enc(v.issuer) + "&currency=" + enc(v.currency) + "&format=json" }; },
      read: function (b) {
        var r = b.fillable_ratio || {}, q = b.quoted || {}, f = b.fillable || {};
        var worst = Math.min(Number(r.ask), Number(r.bid));
        return { verdict: worst >= 0.9 ? "DEEP" : worst >= 0.5 ? "THIN SPOTS" : "MOSTLY ADVERTISED", tone: worst >= 0.9 ? "good" : worst >= 0.5 ? "warn" : "bad",
          headline: "Fillable vs advertised: asks " + pct(r.ask) + ", bids " + pct(r.bid) + " (" + (b.pair || "") + ").",
          facts: [["Advertised asks", num(q.ask)], ["Fillable asks", num(f.ask)], ["Advertised bids", num(q.bid)], ["Fillable bids", num(f.bid)], ["Units", b.units], ["Validated ledger", num(b.ledger_index)]],
          meaning: "Offers that look large but are not funded cannot be filled; the fillable figures are what you could trade." };
      } },
    { id: "treasury", group: "Treasury", q: "Who can move this treasury, and what does it hold?", name: "Treasury report",
      plan: "Free", who: "CFOs, auditors and treasury teams.",
      explain: "Balances and the fewest keys that could move each wallet, read at one validated ledger.",
      fields: [{ k: "wallets", label: "Wallet addresses (comma separated)", ex: RLUSD }],
      req: function (v) { return { url: "/api/treasury?wallets=" + enc(v.wallets.replace(/\s+/g, "")) }; },
      read: function (b) {
        var t = b.totals || {};
        return { verdict: Number(t.fewest_keys_to_move_a_wallet) <= 1 ? "SINGLE KEY" : "MULTI-KEY", tone: Number(t.fewest_keys_to_move_a_wallet) <= 1 ? "warn" : "good",
          headline: "Fewest keys needed to move a wallet: " + t.fewest_keys_to_move_a_wallet + ".",
          facts: [["Wallets", t.wallets], ["Found", t.found], ["XRP balance", num(t.balance_xrp)], ["XRP available", num(t.available_xrp)]].concat((b.wallets || []).slice(0, 3).map(function (w) { return [w.address, w.control && w.control.summary]; })),
          meaning: "One key able to move a wallet is one point of failure; a signer list spreads it." };
      } },
    { id: "delivered", group: "Payments", q: "What did payments to this account actually deliver?", name: "Delivered amounts",
      plan: "Free", who: "Accounting, reconciliation and anyone crediting deposits.",
      explain: "Every payment with the amount the ledger says was delivered, not the amount the sender wrote.",
      fields: [{ k: "account", addr: true, label: "Account address", ex: SOLO }, { k: "from", label: "From date (optional, YYYY-MM-DD)", ex: "" }],
      req: function (v) { return { url: "/api/delivered?account=" + enc(v.account) + "&format=json" + (v.from ? "&from=" + enc(v.from) : "") }; },
      read: function (b) {
        var s = b.summary || {};
        return { verdict: s.partial_payments || s.delivered_less_than_stated ? "CHECK" : "CONSISTENT", tone: s.partial_payments || s.delivered_less_than_stated ? "warn" : "good",
          headline: (s.payments || 0) + " payments; " + (s.partial_payments || 0) + " partial; " + (s.delivered_less_than_stated || 0) + " delivered less than stated.",
          facts: [["Payments", s.payments], ["Partial payments", s.partial_payments], ["Delivered less than stated", s.delivered_less_than_stated], ["Delivered amount not recorded", s.delivered_unavailable], ["Complete history", b.complete ? "Yes" : "No (" + b.stopped_because + ")"]],
          meaning: "Credit customers with the delivered amount. A partial payment shows a large stated amount and delivers less." };
      } },
  ];

  function enc(v) { return encodeURIComponent(String(v || "").trim()); }

  var current = null;
  function keyValue() { return ($("cx-key").value || "").trim(); }

  function curlFor(tool, r) {
    var url = ORIGIN + r.url;
    var auth = tool.key ? ' \\\n  -H "Authorization: Bearer $NOSHASHI_RIPPLING_KEY"' : "";
    if (r.method === "POST") return "curl -s " + url + auth + ' \\\n  -H "content-type: application/json" \\\n  -d \'' + JSON.stringify(r.body) + "'";
    return 'curl -s "' + url + '"' + auth;
  }

  function values() {
    var v = {};
    current.fields.forEach(function (f) { v[f.k] = ($("cx-f-" + f.k).value || "").trim(); });
    return v;
  }

  function select(id) {
    current = TOOLS.filter(function (t) { return t.id === id; })[0] || TOOLS[0];
    Array.prototype.forEach.call(document.querySelectorAll("[data-cx-tool]"), function (b) { b.setAttribute("aria-current", b.getAttribute("data-cx-tool") === current.id ? "true" : "false"); });
    $("cx-q").textContent = current.q;
    $("cx-name").textContent = current.name + " · " + current.plan;
    $("cx-explain").textContent = current.explain;
    $("cx-who").textContent = current.who;
    var form = $("cx-fields"); form.textContent = "";
    current.fields.forEach(function (f) {
      var lab = el("label", null, f.label); lab.setAttribute("for", "cx-f-" + f.k);
      var inp = el(f.multi ? "textarea" : "input"); inp.id = "cx-f-" + f.k; inp.spellcheck = false; inp.autocomplete = "off";
      if (!f.multi) inp.type = "text";
      form.appendChild(lab); form.appendChild(inp);
    });
    $("cx-keynote").hidden = !current.key;
    $("cx-out").hidden = true;
    say(current.key && !keyValue() ? "This one needs a paid key (enter it above). Without one you'll see how to get it." : "Fill in the fields, or use the example, then run it.", "");
    try { history.replaceState(null, "", "#" + current.id); } catch (e) {}
  }

  function say(text, tone) { var s = $("cx-status"); s.textContent = text; s.setAttribute("data-tone", tone || ""); }

  function example() { current.fields.forEach(function (f) { $("cx-f-" + f.k).value = f.ex; }); }

  function show(r, body, status) {
    var out = $("cx-out"); out.hidden = false;
    $("cx-curl").textContent = curlFor(current, r);
    $("cx-json").textContent = JSON.stringify(body, null, 2);
    var facts = $("cx-facts"); facts.textContent = "";
    var pill = $("cx-verdict");
    if (status >= 400) {
      pill.textContent = status === 402 ? "PAID PLAN" : status === 429 ? "SLOW DOWN" : "NOT READ";
      pill.setAttribute("data-tone", status === 402 ? "warn" : "bad");
      $("cx-headline").textContent = body.error || "The request was refused.";
      $("cx-meaning").textContent = status === 402 ? "See the plans on the Rippling page, or email institutions@noshashi.app for a key." : "Nothing was concluded. Check the inputs and try again.";
      $("cx-receipt").textContent = "—";
      return;
    }
    var view;
    try { view = current.read(body); } catch (e) { view = { verdict: "READ", tone: "", headline: "The answer is below as JSON.", facts: [], meaning: "" }; }
    pill.textContent = view.verdict || "READ"; pill.setAttribute("data-tone", view.tone || "");
    $("cx-headline").textContent = view.headline || "";
    (view.facts || []).forEach(function (f) {
      if (f[1] == null || f[1] === "") return;
      var row = el("div"); row.appendChild(el("dt", null, String(f[0]))); row.appendChild(el("dd", null, String(f[1]))); facts.appendChild(row);
    });
    $("cx-meaning").textContent = view.meaning || "";
    var digest = (body.receipt && body.receipt.digest) || body.digest || "";
    $("cx-receipt").textContent = digest ? "SHA-256 " + digest : "No receipt on this answer; the JSON below is the record.";
  }

  function run(e) {
    if (e) e.preventDefault();
    var v = values();
    var missing = current.fields.filter(function (f) { return f.addr && !ADDRESS.test(v[f.k]); });
    if (missing.length) { say("Enter a valid XRPL address for “" + missing[0].label + "”. It begins with r.", "bad"); return; }
    var r = current.req(v);
    var headers = { Accept: "application/json" };
    if (current.key && keyValue()) headers.Authorization = "Bearer " + keyValue();
    var init = { method: r.method || "GET", headers: headers };
    if (r.body) { headers["Content-Type"] = "application/json"; init.body = JSON.stringify(r.body); }
    $("cx-run").disabled = true;
    say("Reading validated XRP Ledger state…", "");
    var started = Date.now();
    fetch(r.url, init)
      .then(function (res) { return res.json().catch(function () { return { error: "The answer was not JSON." }; }).then(function (b) { return { s: res.status, b: b }; }); })
      .then(function (x) { show(r, x.b, x.s); say(x.s < 400 ? "Answered in " + ((Date.now() - started) / 1000).toFixed(1) + " s." : "Refused (" + x.s + ").", x.s < 400 ? "" : "bad"); })
      .catch(function () { say("The service could not be reached. Nothing was concluded.", "bad"); })
      .then(function () { $("cx-run").disabled = false; });
  }

  function init() {
    var nav = $("cx-nav"), group = null;
    TOOLS.forEach(function (t) {
      if (t.group !== group) { group = t.group; nav.appendChild(el("p", "cx-group", group)); }
      var b = el("button", "cx-tool"); b.type = "button"; b.setAttribute("data-cx-tool", t.id);
      b.appendChild(el("span", "cx-tool-q", t.q));
      b.appendChild(el("span", "cx-tool-p", t.name + " · " + t.plan));
      b.addEventListener("click", function () { select(t.id); $("cx-main").scrollIntoView({ behavior: "smooth", block: "start" }); });
      nav.appendChild(b);
    });
    $("cx-form").addEventListener("submit", run);
    $("cx-example").addEventListener("click", example);
    $("cx-copy").addEventListener("click", function () { try { navigator.clipboard.writeText($("cx-curl").textContent); say("curl command copied.", ""); } catch (e) {} });
    var key = $("cx-key");
    try { key.value = sessionStorage.getItem("nsh-rip-key") || ""; } catch (e) {}
    key.addEventListener("input", function () { try { sessionStorage.setItem("nsh-rip-key", keyValue()); } catch (e) {} });
    $("cx-forget").addEventListener("click", function () { key.value = ""; try { sessionStorage.removeItem("nsh-rip-key"); } catch (e) {} say("Key removed from this tab.", ""); });
    select((location.hash || "").slice(1));
    window.addEventListener("hashchange", function () { var id = (location.hash || "").slice(1); if (!current || id !== current.id) select(id); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
