/*
 * Interface translation.
 *
 * Elements carrying `data-i18n="key"` have their text replaced from
 * site/data/i18n/<lang>.json. A missing key falls through to whatever
 * the markup already says, which is English — so a partial translation
 * degrades to a mixed page rather than to blanks.
 *
 * On a first visit the language is applied automatically from
 * /api/locale, which reads Vercel's edge geolocation and the browser's
 * own Accept-Language. After that the visitor's own choice is stored and
 * nothing overrides it.
 *
 * Two things this deliberately does not do:
 *
 *   - It never redirects. Googlebot crawls from US addresses, so an
 *     IP-based redirect would mean only English is ever indexed no
 *     matter which URL was requested. A traveller or anyone on a VPN
 *     would also land in a language they may not read well enough to
 *     find their way out of.
 *   - It never translates legal text, the findings or the guide. This
 *     is a compliance product: "a GO verdict means the configured rules
 *     passed — it is not a representation that a transaction is lawful"
 *     has to survive translation exactly, and a phrase that drifts
 *     slightly becomes a claim the product does not make. Those pages
 *     stay in the language they were reviewed in, and the bar says so.
 */
(function () {
  "use strict";

  var KEY = "noshashi-lang";
  var DEFAULT = "en";
  var cache = {};

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function remember(code) {
    try { localStorage.setItem(KEY, code); } catch (e) {}
  }

  function load(code) {
    if (cache[code]) return Promise.resolve(cache[code]);
    if (code === DEFAULT) { cache[code] = {}; return Promise.resolve({}); }
    return fetch("/data/i18n/" + code + ".json")
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (map) { cache[code] = map; return map; })
      .catch(function () { cache[code] = {}; return {}; });
  }

  /* The English original, kept so switching back is lossless. */
  function original(el) {
    if (!el.hasAttribute("data-i18n-en")) {
      el.setAttribute("data-i18n-en",
        el.hasAttribute("placeholder") ? el.getAttribute("placeholder") : el.textContent);
    }
    return el.getAttribute("data-i18n-en");
  }

  function apply(code, map) {
    window.__NOSHASHI_I18N = map;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var base = original(el);
      var text = (code === DEFAULT) ? base : (map[key] || base);
      if (el.id === "themeLabel") {
        var themeKey = document.documentElement.getAttribute("data-theme") === "light"
          ? "theme.dark" : "theme.light";
        text = (code === DEFAULT ? (window.__NOSHASHI_I18N || {})[themeKey] : map[themeKey]) || text;
      }
      if (el.hasAttribute("placeholder")) el.setAttribute("placeholder", text);
      else el.textContent = text;
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-aria-label");
      el.setAttribute("aria-label", (code === DEFAULT ? el.getAttribute("data-i18n-aria-label-en") : map[key]) || el.getAttribute("aria-label"));
    });
    document.documentElement.setAttribute("lang", code);
    var current = document.getElementById("lang-current");
    if (current) current.textContent = code.toUpperCase();
    var select = document.getElementById("lang-select");
    if (select) select.value = code;
    document.dispatchEvent(new CustomEvent("noshashi:i18n", { detail: { code: code, map: map } }));
  }

  function setLanguage(code, options) {
    return load(code).then(function (map) {
      apply(code, map);
      if (!options || options.remember !== false) remember(code);
      if (code !== DEFAULT) bar(code, map);
      else hideBar();
      return code;
    });
  }

  /* A one-line notice: what changed, how to undo it, and what is not
     translated. Shown only when a language was applied automatically. */
  var barEl = null;
  function bar(code, map) {
    if (!barEl) {
      barEl = document.createElement("div");
      barEl.className = "lang-bar";
      document.body.appendChild(barEl);
    }
    var native = (window.__NOSHASHI_LANGS || []).filter(function (l) { return l.code === code; })[0];
    barEl.innerHTML =
      '<span>' + (map["lang.showing"] || "Showing the interface in") + " " +
        '<b>' + ((native && native.native) || code) + "</b>" +
      '</span>' +
      '<span class="lang-note">' + (map["lang.note"] || "") + "</span>" +
      '<button type="button" id="lang-revert">' +
        (map["lang.english"] || "View in English") + "</button>";
    barEl.hidden = false;
    document.getElementById("lang-revert").addEventListener("click", function () {
      setLanguage(DEFAULT);
    });
  }
  function hideBar() { if (barEl) barEl.hidden = true; }

  function mountSwitcher(languages) {
    window.__NOSHASHI_LANGS = languages;
    var host = document.querySelector("footer .foot");
    if (!host) return;
    var wrap = document.createElement("div");
    wrap.className = "lang-switch";
    wrap.innerHTML =
      '<label class="sr-only" for="lang-select">Language</label>' +
      '<select id="lang-select">' +
      languages.map(function (l) {
        return '<option value="' + l.code + '">' + l.native + "</option>";
      }).join("") +
      "</select>";
    host.appendChild(wrap);
    wrap.querySelector("select").addEventListener("change", function (event) {
      setLanguage(event.target.value);
    });
  }

  var chosen = stored();

  fetch("/api/locale")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      var languages = (data && data.languages) || [{ code: "en", native: "English" }];
      mountSwitcher(languages);
      if (chosen) return setLanguage(chosen, { remember: false });
      var suggested = (data && data.suggested) || DEFAULT;
      // Applied, not merely offered — but not remembered, so a visitor
      // who wanted English gets it back on the next visit if they say so.
      if (suggested !== DEFAULT) return setLanguage(suggested, { remember: false });
      apply(DEFAULT, {});
    })
    .catch(function () {
      mountSwitcher([{ code: "en", native: "English" }]);
      if (chosen) setLanguage(chosen, { remember: false });
    });
})();
