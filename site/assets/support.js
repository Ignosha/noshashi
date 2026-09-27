/*
 * The support console, answered by NOSHX.
 *
 * NOSHX Core, the engine the desktop app runs by default, is loaded from
 * /assets/noshx/ when the console is first opened and answers in the
 * visitor's browser: from NOSHASHI's published pages and support answers,
 * and, when a question names an address, token or transaction, from the
 * live XRP Ledger. No model and no server are involved, so the question is
 * not sent to NOSHASHI. If the engine cannot load (an old browser, a
 * blocked script), the console falls back to the server's reference
 * answers at /api/support-chat.
 *
 * Injects itself into any page that loads this file. Nothing about the
 * page's own content depends on it, so a failure here costs a widget
 * and not a page — which is also why it is loaded `defer` and builds
 * its own markup rather than requiring every page to carry it.
 *
 * Behaviour rules, in the register of the rest of the site:
 *   - It starts closed and never opens itself.
 *   - It says which mode it is answering in, and marks an answer it is
 *     not confident about rather than presenting a guess as an answer.
 *   - It always offers a human. The point of the console is to shorten
 *     the path to one, not to stand in front of one.
 */
(function () {
  "use strict";

  if (window.__noshashiSupport) return;
  window.__noshashiSupport = true;

  /* The last opener reads Bitstamp's USD issuing account live, so the
     first thing a visitor sees NOSHX do is a real ledger read. */
  var OPENERS = [
    "What does it cost?",
    "Which plan is right for me?",
    "Can it move my funds?",
    { q: "Check rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", label: "Check Bitstamp's USD issuer" },
  ];

  var engine = null;
  function loadEngine() {
    if (!engine) {
      engine = import("/assets/noshx/noshx.js").then(
        function (m) { try { m.prewarm(); } catch (e) { /* the index builds on first use instead */ } return m; },
        function () { return null; }
      );
    }
    return engine;
  }

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "support-launch";
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = '<i aria-hidden="true"></i>SUPPORT';

  var panel = document.createElement("div");
  panel.className = "support-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-label", "NOSHASHI support console");
  panel.innerHTML =
    '<div class="support-top">' +
      '<span class="who"><strong>NOSHX · SUPPORT</strong><span>Ask about NOSHASHI or any XRPL address</span></span>' +
      '<button class="support-close" type="button" aria-label="Close support console">✕</button>' +
    "</div>" +
    '<div class="support-log" id="ns-log" role="log" aria-live="polite" aria-atomic="false"></div>' +
    '<div class="support-suggest" id="ns-suggest"></div>' +
    '<form class="support-form" id="ns-form">' +
      '<label class="sr-only" for="ns-input">Your question</label>' +
      '<input id="ns-input" type="text" autocomplete="off" maxlength="600" placeholder="Ask a question, or paste an r… address">' +
      '<button type="submit" id="ns-send">SEND</button>' +
    "</form>" +
    '<p class="support-foot">NOSHX answers from NOSHASHI\'s published pages and reads the live XRP Ledger. ' +
      'It runs in your browser, so your question is not sent to NOSHASHI. ' +
      'For anything it cannot answer, <a href="/contact/">contact the team</a>.</p>';

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  var log = panel.querySelector("#ns-log");
  var form = panel.querySelector("#ns-form");
  var input = panel.querySelector("#ns-input");
  var send = panel.querySelector("#ns-send");
  var suggest = panel.querySelector("#ns-suggest");
  var closeButton = panel.querySelector(".support-close");
  var history = [];
  var busy = false;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function add(from, text, options) {
    options = options || {};
    var wrap = document.createElement("div");
    /* "bot", not "console": .console is the site's card class (bordered,
       clipped), and a bot reply wearing it was cut off at a fixed height. */
    wrap.className = "support-msg " + (from === "you" ? "visitor" : "bot");
    if (from !== "you") wrap.setAttribute("data-grounded", options.grounded === false ? "false" : "true");

    /* The visitor's own words are never translated, and nor is a reply
       the server says is already in the page's language. */
    var fixed = from === "you" || (options.lang && options.lang !== "en");
    var html =
      '<span class="from">' + (from === "you" ? "YOU" : "NOSHX") + "</span>" +
      "<p" + (fixed ? ' translate="no"' : "") + ">" + escapeHtml(text) + "</p>";

    if (options.links && options.links.length) {
      html += '<div class="links">' + options.links.map(function (link) {
        // Only same-origin paths and http(s) are rendered as links.
        var href = String(link.href || "");
        if (!/^(https?:\/\/|\/|mailto:)/.test(href)) return "";
        var external = /^https?:\/\//.test(href);
        return '<a href="' + escapeHtml(href) + '"' +
          (external ? ' rel="noopener" target="_blank"' : "") + ">" +
          escapeHtml(link.label || href) + "</a>";
      }).join("") + "</div>";
    }

    wrap.innerHTML = html;
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  }

  function drawSuggestions(items) {
    suggest.innerHTML = "";
    (items || []).slice(0, 4).forEach(function (item) {
      var question = typeof item === "string" ? item : item.q;
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = typeof item === "string" ? item : item.label;
      button.addEventListener("click", function () {
        /* The English question is what NOSHX matches; the bubble shows
           the words the visitor actually clicked. */
        ask(question, button.textContent);
      });
      suggest.appendChild(button);
    });
  }

  function open() {
    panel.hidden = false;
    launcher.hidden = true;
    launcher.setAttribute("aria-expanded", "true");
    loadEngine();
    if (!log.childElementCount) {
      add("console",
        "I'm NOSHX. Ask about pricing, plans, downloads, privacy and how NOSHASHI works, or paste an XRPL address, NFT id or transaction hash and I'll read it from the live ledger. Anything I can't answer goes straight to the team.",
        { links: [] });
      drawSuggestions(OPENERS);
    }
    input.focus();
  }

  function close() {
    panel.hidden = true;
    launcher.hidden = false;
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  }

  launcher.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !panel.hidden) close();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    ask(input.value.trim());
  });

  function ask(question, shown) {
    if (busy || !question) return;

    input.value = "";
    suggest.innerHTML = "";
    add("you", shown || question);
    history.push({ role: "user", content: question });

    busy = true;
    send.disabled = true;
    var pending = add("console", "Reading…", {});

    function done() {
      busy = false;
      send.disabled = false;
      input.focus();
    }

    loadEngine().then(function (noshx) {
      if (!noshx) return askServer(question, pending, done);
      var line = pending.querySelector("p");
      return noshx
        .ask(question, function (step) {
          if (line) line.textContent = "Reading " + step.reader + " from the ledger…";
        })
        .then(function (result) {
          pending.remove();
          add("console", result.text, {
            links: result.links,
            grounded: result.source !== "none" && result.source !== "refused",
          });
          history.push({ role: "assistant", content: result.text });
          if (result.related && result.related.length) drawSuggestions(result.related);
        })
        .catch(function () {
          return askServer(question, pending, function () {});
        })
        .then(done);
    });
  }

  /* The server's reference answers: used only when NOSHX cannot load. */
  function askServer(question, pending, finish) {
    return fetch("/api/support-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: question,
        history: history.slice(-6),
        lang: document.documentElement.getAttribute("lang") || "en",
      }),
    })
      .then(function (response) { return response.json().catch(function () { return {}; }); })
      .then(function (data) {
        pending.remove();
        var reply = data.reply ||
          "That did not get through. Email support@noshashi.app and it will reach a person.";
        var links = data.links && data.links.length
          ? data.links
          : [{ label: "Contact the team", href: "/contact/" }];
        add("console", reply, { links: links, grounded: data.grounded !== false, lang: data.lang });
        history.push({ role: "assistant", content: reply });
        if (data.related && data.related.length) drawSuggestions(data.related);
      })
      .catch(function () {
        pending.remove();
        add("console",
          "The console could not be reached. The contact form does not depend on it.",
          { links: [{ label: "Contact the team", href: "/contact/" }], grounded: false });
      })
      .finally(finish);
  }
})();
