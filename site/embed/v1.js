/*!
 * NOSHASHI screening widget, v1.
 *
 *   <div data-noshashi-embed="EMBED-ID"></div>
 *   <script src="https://www.noshashi.app/embed/v1.js" async></script>
 *
 * Optional on the div: data-widget="verify" | "check" | "deposit" to show
 * one check only, data-theme="light" | "dark" to override the embed's theme.
 *
 * Three checks, each answered by NOSHASHI's server from the live XRP Ledger:
 *   verify   Is this address really the organization's deposit address?
 *            Catches lookalike addresses made for address poisoning.
 *   check    What the ledger publishes about an address, and whether the
 *            US Treasury lists it (OFAC SDN).
 *   deposit  Has my deposit arrived? (Never shows why a deposit is under review.)
 *
 * The widget holds no key. The server answers only pages on the origins the
 * organization allowed. It renders inside a shadow root, so the host page's
 * styles cannot change it and it cannot change the host page. No cookies,
 * no storage, no third-party requests.
 */
(function () {
  "use strict";
  var API = "https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1/noshashi-xrpl-watch/embed/";
  var ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
  var HASH = /^[0-9A-Fa-f]{64}$/;
  var LABELS = { verify: "Verify address", check: "Check an address", deposit: "Deposit status" };

  var CSS = [
    ":host{all:initial;display:block;font:14px/1.5 ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}",
    ".w{--bg:#fbfaf7;--fg:#1d1f1c;--mute:#5f655c;--line:#dcd9d0;--go:#2f7a4b;--hold:#9a6a12;--no:#a23b2e;--acc:#1d1f1c;",
    "background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:16px;max-width:560px;box-sizing:border-box}",
    ".w.dark{--bg:#15171a;--fg:#e9e7e1;--mute:#9aa096;--line:#2c3036;--go:#6cc48d;--hold:#e0b25a;--no:#ec7e6f;--acc:#e9e7e1}",
    "@media (prefers-color-scheme:dark){.w.auto{--bg:#15171a;--fg:#e9e7e1;--mute:#9aa096;--line:#2c3036;--go:#6cc48d;--hold:#e0b25a;--no:#ec7e6f;--acc:#e9e7e1}}",
    ".h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:0 0 10px}",
    ".t{font-weight:600;letter-spacing:.02em}",
    ".tabs{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 12px}",
    ".tab{font:inherit;font-size:12px;border:1px solid var(--line);background:transparent;color:var(--mute);border-radius:999px;padding:3px 10px;cursor:pointer}",
    ".tab[aria-selected=true]{color:var(--fg);border-color:var(--acc)}",
    "form{display:flex;gap:6px;flex-wrap:wrap}",
    "input{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;flex:1 1 260px;min-width:0;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:transparent;color:var(--fg)}",
    "input:focus{outline:2px solid var(--acc);outline-offset:1px}",
    "button.go{font:inherit;font-size:13px;padding:8px 14px;border-radius:6px;border:1px solid var(--acc);background:var(--acc);color:var(--bg);cursor:pointer}",
    "button.go:disabled{opacity:.5;cursor:default}",
    ".r{margin-top:12px;padding:10px 12px;border-radius:6px;border:1px solid var(--line);word-break:break-word}",
    ".r.ok{border-color:var(--go)}.r.warn{border-color:var(--hold)}.r.bad{border-color:var(--no)}",
    ".r b{display:block;margin-bottom:2px}.ok b{color:var(--go)}.warn b{color:var(--hold)}.bad b{color:var(--no)}",
    ".r ul{margin:6px 0 0;padding-left:18px}.r li{margin:2px 0}",
    ".m{color:var(--mute);font-size:12px}",
    ".f{margin-top:10px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}",
    "a{color:inherit}",
  ].join("");

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function call(id, action, body) {
    var init = body
      ? { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body), credentials: "omit" }
      : { method: "GET", credentials: "omit" };
    return fetch(API + encodeURIComponent(id) + "/" + action, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.message || "The check could not be completed (" + res.status + ").");
        return data;
      });
    });
  }

  function result(tone, title, lines, note) {
    var list = lines && lines.length ? el("ul", {}, lines.map(function (l) { return el("li", { text: l }); })) : null;
    return el("div", { class: "r " + tone, role: "status" }, [
      el("b", { text: title }),
      list,
      note ? el("div", { class: "m", text: note }) : null,
    ]);
  }

  function mount(host) {
    if (host.__noshashi) return;
    host.__noshashi = true;
    var id = host.getAttribute("data-noshashi-embed") || "";
    var root = host.attachShadow ? host.attachShadow({ mode: "closed" }) : host;
    root.appendChild(el("style", { text: CSS }));
    var box = el("div", { class: "w auto" }, [el("div", { class: "m", text: "Loading\u2026" })]);
    root.appendChild(box);

    call(id, "config").then(function (cfg) {
      var theme = host.getAttribute("data-theme") || cfg.theme || "auto";
      box.className = "w " + (theme === "dark" ? "dark" : theme === "light" ? "" : "auto");
      var only = host.getAttribute("data-widget");
      var widgets = (cfg.widgets || []).filter(function (w) { return LABELS[w] && (!only || w === only); });
      if (!widgets.length) throw new Error("This widget has no checks switched on.");
      box.textContent = "";

      var out = el("div");
      var input = el("input", { autocomplete: "off", spellcheck: "false", "aria-label": "Address or hash" });
      var button = el("button", { class: "go", type: "submit", text: "Check" });
      var form = el("form", {}, [input, button]);
      var current = widgets[0];
      var tabs = el("div", { class: "tabs", role: "tablist" });

      function select(w) {
        current = w;
        input.value = "";
        out.textContent = "";
        input.placeholder = w === "deposit" ? "Transaction hash (64 characters)" : "XRP Ledger address (r\u2026)";
        Array.prototype.forEach.call(tabs.children, function (t) { t.setAttribute("aria-selected", String(t.dataset.w === w)); });
      }
      widgets.forEach(function (w) {
        var t = el("button", { class: "tab", type: "button", role: "tab", text: LABELS[w] });
        t.dataset.w = w;
        t.addEventListener("click", function () { select(w); });
        tabs.appendChild(t);
      });

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var value = input.value.trim();
        if (current === "deposit" ? !HASH.test(value) : !ADDRESS.test(value)) {
          out.textContent = "";
          out.appendChild(result("warn", current === "deposit" ? "That is not a transaction hash." : "That is not an XRP Ledger address.",
            [current === "deposit" ? "A hash is 64 letters and digits; your wallet shows it for each payment." : "An address starts with r and is 25 to 35 characters."]));
          return;
        }
        button.disabled = true;
        out.textContent = "";
        out.appendChild(el("div", { class: "m", text: "Reading the ledger\u2026" }));
        var body = current === "deposit" ? { hash: value } : { address: value };
        call(id, current, body).then(function (r) {
          out.textContent = "";
          if (current === "verify") {
            out.appendChild(result(r.result === "match" ? "ok" : "bad", r.result === "match" ? "Correct address" : r.result === "lookalike" ? "Lookalike address: do not send" : "Not this organization's address", [r.message]));
          } else if (current === "check") {
            out.appendChild(r.sanctioned
              ? result("bad", "On the OFAC SDN sanctions list", ["Listed under " + r.sanction.entity + (r.sanction.entry ? " (entry " + r.sanction.entry + (r.sanction.program ? ", program " + r.sanction.program : "") + ")" : "") + "."].concat(r.facts || []), "Source: " + r.sanction.source)
              : result(r.exists ? "ok" : "warn", r.exists ? "Not on the OFAC SDN list" : "Not on the OFAC SDN list; never funded", r.facts || [], r.note + (r.sanctions_list && r.sanctions_list.list_as_of ? " List as of " + r.sanctions_list.list_as_of.slice(0, 10) + "." : "")));
          } else {
            var tone = r.status === "received" ? "ok" : r.status === "under_review" || r.status === "pending" ? "warn" : "bad";
            var title = { received: "Received", under_review: "Received, being reviewed", pending: "On its way", not_found: "Not found yet", not_a_deposit: "Not a deposit here", failed: "Payment failed" }[r.status] || "Status";
            var lines = [r.message];
            if (r.delivered) lines.push("Arrived: " + r.delivered.value + " " + r.delivered.currency + (r.destination_tag !== null && r.destination_tag !== undefined ? ", destination tag " + r.destination_tag : "") + ".");
            if (r.ledger_index) lines.push("Validated ledger " + Number(r.ledger_index).toLocaleString("en-US") + (r.ledger_time ? ", " + r.ledger_time.replace("T", " ").slice(0, 16) + " UTC" : "") + ".");
            out.appendChild(result(tone, title, lines));
          }
        }).catch(function (err) {
          out.textContent = "";
          out.appendChild(result("warn", "The check could not be completed.", [err.message]));
        }).then(function () { button.disabled = false; });
      });

      box.appendChild(el("div", { class: "h" }, [el("span", { class: "t", text: cfg.label }), el("span", { class: "m", text: "Live XRP Ledger" })]));
      if (widgets.length > 1) box.appendChild(tabs);
      box.appendChild(form);
      box.appendChild(out);
      var foot = el("div", { class: "f" }, [
        el("span", { class: "m", text: "Answers come from the validated ledger" + (cfg.sanctions_list && cfg.sanctions_list.list_as_of ? " and the OFAC SDN list of " + cfg.sanctions_list.list_as_of.slice(0, 10) : "") + "." }),
        el("a", { class: "m", href: "https://www.noshashi.app/", target: "_blank", rel: "noopener", text: "NOSHASHI" }),
      ]);
      box.appendChild(foot);
      select(current);
    }).catch(function (err) {
      box.textContent = "";
      box.appendChild(result("warn", "This check is unavailable.", [err.message]));
    });
  }

  function scan() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-noshashi-embed]"), mount);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();
