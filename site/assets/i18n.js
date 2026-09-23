/*
 * Translation.
 *
 * Every piece of text on the page is translated, not a tagged subset.
 * The page is walked for *units*: the smallest element whose content is
 * text plus inline markup only (a paragraph, a heading, a button, a
 * table cell). Each unit is read as one sentence with its inline markup
 * turned into numbered placeholders,
 *
 *   Read <a href="/research/">the measurement</a> first.
 *   → "Read <0>the measurement</0> first."
 *
 * and looked up in site/data/i18n/text/<lang>.json. The translation puts
 * the same placeholders wherever that language's word order needs them,
 * and the original elements (with their links, classes and listeners) are
 * moved into place. Translating whole sentences rather than loose text
 * fragments is what keeps Japanese and Korean readable: their word order
 * is not English's.
 *
 *   - Numbers are slots. "Updated 3 min ago" is looked up as
 *     "Updated {0} min ago", so a live figure never misses the catalogue.
 *   - `translate="no"` (the HTML attribute) keeps data out: addresses,
 *     hashes, currency codes, publisher names. `<code>`, `<kbd>`, SVG and
 *     images are never translated either.
 *   - Text a script writes later (a tool's verdict, a status that
 *     updates, the support chat) is caught by a MutationObserver and
 *     translated the same way.
 *   - Anything not in the catalogue, which in practice is third-party
 *     text such as news headlines, is translated on the device by the
 *     browser's built-in Translator where the browser has one. Nothing
 *     is sent to a translation service.
 *   - `placeholder`, `aria-label`, `title`, `alt` and the document title
 *     are translated too.
 *
 * Elements carrying `data-i18n="key"` keep the older keyed lookup from
 * site/data/i18n/<lang>.json; the walker leaves them alone.
 *
 * Legal text, the findings and the guide are translated as a courtesy.
 * The English is the version that governs, and the language bar says so.
 *
 * On a first visit the language is applied automatically from
 * /api/locale (Vercel's edge geolocation and the browser's own
 * Accept-Language). After that the visitor's own choice is stored and
 * nothing overrides it. It never redirects: Googlebot crawls from US
 * addresses, so an IP redirect would mean only English is ever indexed.
 */
(function () {
  "use strict";

  var KEY = "noshashi-lang";
  var DEFAULT = "en";
  var cache = {};
  var lang = DEFAULT;
  var keys = {};
  var text = {};

  /* ── The unit grammar. Shared with scripts/extract-i18n.mjs, which runs
     this same file in a browser to build the catalogue, so the keys the
     extractor writes are exactly the keys this looks up. ─────────────── */

  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, TEXTAREA: 1, CANVAS: 1,
    IFRAME: 1, SELECT: 1, OPTION: 1, HEAD: 1 };
  var OPAQUE = { CODE: 1, KBD: 1, SAMP: 1, PRE: 1, SVG: 1, svg: 1, IMG: 1, BR: 1, WBR: 1,
    INPUT: 1, PICTURE: 1, VIDEO: 1, AUDIO: 1, MATH: 1 };
  var INLINE = { A: 1, ABBR: 1, B: 1, BDI: 1, BDO: 1, CITE: 1, DATA: 1, DFN: 1, EM: 1, I: 1,
    MARK: 1, Q: 1, S: 1, SMALL: 1, SPAN: 1, STRONG: 1, SUB: 1, SUP: 1, TIME: 1, U: 1, VAR: 1,
    LABEL: 1, INS: 1, DEL: 1 };
  var ATTRS = ["placeholder", "aria-label", "title", "alt"];
  var LETTER = /[A-Za-zÀ-ɏ]/;

  function isOpaque(el) {
    return !!(OPAQUE[el.tagName] || el.getAttribute("translate") === "no" ||
      el.hasAttribute("data-i18n") || el.namespaceURI === "http://www.w3.org/2000/svg");
  }
  function isSkipped(el) {
    return !!(SKIP[el.tagName] || el.classList.contains("lang-bar") || el.classList.contains("lang-switch"));
  }

  /* Inline-only: every element inside is inline or opaque. Live text
     ([data-i18n-live], a headline) is always its own unit, never part of
     the sentence around it. */
  function inlineOnly(el) {
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (isSkipped(c) || c.hasAttribute("data-i18n-live")) return false;
      if (isOpaque(c)) continue;
      if (!INLINE[c.tagName] || !inlineOnly(c)) return false;
    }
    return true;
  }
  /* A row of separate labels — spans side by side with nothing but
     spacing or punctuation between them — is layout, not a sentence:
     each label is its own unit. A sentence has words of its own between
     its links. */
  function isLayout(el) {
    if (!el.firstElementChild) return false;
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && LETTER.test(n.nodeValue)) return false;
    }
    return true;
  }
  function hasText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { if (LETTER.test(n.nodeValue)) return true; }
      else if (n.nodeType === 1 && !isOpaque(n) && !isSkipped(n) && hasText(n)) return true;
    }
    return false;
  }

  function escText(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function unescText(s) { return s.replace(/&lt;/g, "<").replace(/&amp;/g, "&"); }

  /* A unit's key, and the nodes its placeholders stand for. */
  function serialize(el) {
    var nodes = [];
    function walk(parent) {
      var out = "";
      for (var n = parent.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) out += escText(n.nodeValue);
        else if (n.nodeType === 1) {
          var i = nodes.push(n) - 1;
          out += isOpaque(n) ? "<" + i + "/>" : "<" + i + ">" + walk(n) + "</" + i + ">";
        }
      }
      return out;
    }
    var key = walk(el).replace(/\s+/g, " ").trim();
    return { key: key, nodes: nodes };
  }

  var TAG = /(<\/?\d+\/?>)/;
  var NUM = /\d+(?:[.,:]\d+)*/g;

  /* Numbers become {0}, {1}… outside the placeholder tags. */
  function template(key) {
    var nums = [];
    var t = key.split(TAG).map(function (part) {
      if (TAG.test(part)) return part;
      return part.replace(NUM, function (m) { nums.push(m); return "{" + (nums.length - 1) + "}"; });
    }).join("");
    return { key: t, nums: nums };
  }

  function lookup(key) {
    if (Object.prototype.hasOwnProperty.call(text, key)) return text[key];
    var t = template(key);
    if (t.nums.length && Object.prototype.hasOwnProperty.call(text, t.key)) {
      return text[t.key].replace(/\{(\d+)\}/g, function (m, i) {
        return t.nums[i] !== undefined ? t.nums[i] : m;
      });
    }
    return null;
  }

  /* Rebuild a unit from its translation. Refuses a translation whose
     placeholders do not match the key's, rather than dropping a link. */
  function valid(translated, nodes) {
    var parts = translated.split(TAG);
    var seen = {};
    var stack = [];
    for (var i = 0; i < parts.length; i++) {
      var m = /^<(\/?)(\d+)(\/?)>$/.exec(parts[i]);
      if (!m) continue;
      var n = Number(m[2]);
      if (!nodes[n]) return false;
      if (m[1]) { if (stack.pop() !== n) return false; continue; }
      if (seen[n] || (!!m[3]) !== isOpaque(nodes[n])) return false;
      seen[n] = 1;
      if (!m[3]) stack.push(n);
    }
    return !stack.length && Object.keys(seen).length === nodes.length;
  }

  function build(el, translated, nodes, record) {
    if (!valid(translated, nodes)) return false;
    var parts = translated.split(TAG);
    var seen = {};
    var frag = document.createDocumentFragment();
    var stack = [frag];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      var m = /^<(\/?)(\d+)(\/?)>$/.exec(p);
      if (!m) { stack[stack.length - 1].appendChild(document.createTextNode(unescText(p))); continue; }
      var node = nodes[Number(m[2])];
      if (!node) return false;
      if (m[1]) {                       // </N>
        if (stack.length < 2 || stack[stack.length - 1] !== node) return false;
        stack.pop();
      } else if (m[3]) {                // <N/>
        if (seen[m[2]]) return false;
        seen[m[2]] = 1;
        stack[stack.length - 1].appendChild(node);
      } else {                          // <N>
        if (seen[m[2]]) return false;
        seen[m[2]] = 1;
        record(node);
        while (node.firstChild) node.removeChild(node.firstChild);
        stack[stack.length - 1].appendChild(node);
        stack.push(node);
      }
    }
    if (stack.length !== 1 || Object.keys(seen).length !== nodes.length) return false;
    record(el);
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(frag);
    return true;
  }

  /* Units in a subtree, in document order. */
  function collect(root, out) {
    if (root.nodeType !== 1 || isSkipped(root) || isOpaque(root)) return out;
    if (inlineOnly(root) && !isLayout(root)) {
      if (hasText(root)) out.push(root);
      return out;
    }
    for (var n = root.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1) collect(n, out);
      else if (n.nodeType === 3 && LETTER.test(n.nodeValue)) out.push(n);
    }
    return out;
  }

  /* ── State: what was changed, so English comes back exactly. ───────── */

  var units = new Map();       // unit element → [[el, originalChildren], …]
  var loose = new Map();       // bare text node → original string
  var attrs = new Map();       // element → { attr: original }
  var originalTitle = null;
  var missing = new Set();

  /* What the catalogue lacks, for scripts/extract-i18n.mjs. Text inside
     [data-i18n-live] (news headlines) is third-party and changes by the
     hour, so it is left to the on-device fallback, not the catalogue. */
  function miss(key, el) {
    if (el && el.closest && el.closest("[data-i18n-live]")) return;
    missing.add(template(key).key);
  }

  function restoreUnit(el, keep) {
    var rec = units.get(el);
    if (!rec) return;
    for (var i = rec.length - 1; i >= 0; i--) {
      var target = rec[i][0];
      if (keep && (target === keep || keep.contains(target))) continue;
      while (target.firstChild) target.removeChild(target.firstChild);
      rec[i][1].forEach(function (n) { target.appendChild(n); });
    }
    units.delete(el);
  }

  function translateUnit(el) {
    var s = serialize(el);
    if (!s.key) return;
    var t = lookup(s.key);
    if (t === null) { miss(s.key, el); queueDevice(el, s); return; }
    var rec = [];
    var ok = build(el, t, s.nodes, function (node) {
      rec.push([node, Array.prototype.slice.call(node.childNodes)]);
    });
    if (ok) units.set(el, rec);
    else if (rec.length) { units.set(el, rec); restoreUnit(el); }
  }

  function translateLoose(node) {
    var original = loose.has(node) ? loose.get(node) : node.nodeValue;
    var key = original.replace(/\s+/g, " ").trim();
    var t = lookup(escText(key));
    if (t === null) { miss(escText(key), node.parentNode); queueDevice(node, null, key); return; }
    if (!loose.has(node)) loose.set(node, original);
    var lead = /^\s/.test(original) ? " " : "", tail = /\s$/.test(original) ? " " : "";
    node.nodeValue = lead + unescText(t) + tail;
  }

  /* Elements whose translatable attributes are ours to translate. */
  function attrTargets(root) {
    var list = root.querySelectorAll ? root.querySelectorAll("[placeholder],[aria-label],[title],[alt]") : [];
    return [root].concat(Array.prototype.slice.call(list)).filter(function (el) {
      return el.nodeType === 1 && !el.hasAttribute("data-i18n") && !el.hasAttribute("data-i18n-aria-label") &&
        !el.closest("[translate=no],.lang-bar,.lang-switch,select,script,style,head");
    });
  }

  function translateAttrs(root) {
    attrTargets(root).forEach(function (el) {
      ATTRS.forEach(function (a) {
        if (!el.hasAttribute(a)) return;
        var saved = attrs.get(el) || {};
        var original = Object.prototype.hasOwnProperty.call(saved, a) ? saved[a] : el.getAttribute(a);
        if (!LETTER.test(original)) return;
        var k = escText(original.replace(/\s+/g, " ").trim());
        var t = lookup(k);
        if (t === null) { miss(k, el); return; }
        saved[a] = original;
        attrs.set(el, saved);
        el.setAttribute(a, unescText(t));
      });
    });
  }

  function translateTree(root) {
    collect(root, []).forEach(function (u) {
      if (u.nodeType === 3) translateLoose(u);
      else if (!units.has(u)) translateUnit(u);
    });
    translateAttrs(root);
  }

  function restoreAll() {
    Array.from(units.keys()).forEach(function (el) { restoreUnit(el); });
    loose.forEach(function (orig, node) { node.nodeValue = orig; });
    loose.clear();
    attrs.forEach(function (saved, el) {
      Object.keys(saved).forEach(function (a) { el.setAttribute(a, saved[a]); });
    });
    attrs.clear();
    if (originalTitle !== null) document.title = originalTitle;
  }

  /* ── On-device fallback for text outside the catalogue. ──────────── */

  var device = null;
  var deviceQueue = [];
  var deviceTimer = null;

  function queueDevice(target, s, plain) {
    if (!("Translator" in self)) return;
    deviceQueue.push({ target: target, s: s, plain: plain });
    if (!deviceTimer) deviceTimer = setTimeout(runDevice, 60);
  }

  function translator(code) {
    if (device && device.code === code) return device.ready;
    var ready = self.Translator.availability({ sourceLanguage: "en", targetLanguage: code })
      .then(function (a) {
        if (a === "unavailable") return null;
        return self.Translator.create({ sourceLanguage: "en", targetLanguage: code });
      })
      .catch(function () { return null; });
    device = { code: code, ready: ready };
    return ready;
  }

  function runDevice() {
    deviceTimer = null;
    var batch = deviceQueue.splice(0);
    var code = lang;
    if (code === DEFAULT || !batch.length) return;
    translator(code).then(function (tr) {
      if (!tr) return;
      batch.forEach(function (job) {
        if (lang !== code) return;
        if (job.plain !== undefined) {
          var node = job.target;
          var original = node.nodeValue;
          tr.translate(job.plain).then(function (out) {
            if (lang !== code || node.nodeValue !== original) return;
            loose.set(node, original);
            quietly(function () { node.nodeValue = " " + out + " "; });
          }).catch(function () {});
          return;
        }
        var el = job.target;
        var before = job.s.key;
        /* Text between placeholders is translated piece by piece, so the
           links and code stay exactly where they were. */
        var pieces = before.split(TAG);
        Promise.all(pieces.map(function (p) {
          return (TAG.test(p) || !LETTER.test(p)) ? Promise.resolve(p)
            : tr.translate(unescText(p)).then(function (o) {
                var lead = /^\s/.test(p) ? " " : "", tail = /\s$/.test(p) ? " " : "";
                return lead + escText(o) + tail;
              });
        })).then(function (outs) {
          if (lang !== code || !el.isConnected || serialize(el).key !== before) return;
          var s = serialize(el);
          var rec = [];
          quietly(function () {
            var ok = build(el, outs.join(""), s.nodes, function (node) {
              rec.push([node, Array.prototype.slice.call(node.childNodes)]);
            });
            units.set(el, rec);
            if (!ok) restoreUnit(el);
          });
        }).catch(function () {});
      });
    });
  }

  /* ── Scripts that write text after load. ──────────────────────────── */

  var observer = null;
  function quietly(fn) {
    if (observer) observer.disconnect();
    try { fn(); } finally { observe(); }
  }
  function observe() {
    if (!observer || lang === DEFAULT) return;
    observer.observe(document.body, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS });
  }

  function unitOf(node) {
    for (var el = node; el && el !== document.body; el = el.parentNode) {
      if (units.has(el)) return el;
    }
    return null;
  }

  function onMutations(records) {
    var roots = new Set();
    records.forEach(function (r) {
      if (r.type === "attributes") {
        var saved = attrs.get(r.target);
        if (saved) delete saved[r.attributeName];
        roots.add(r.target);
        return;
      }
      var target = r.type === "characterData" ? r.target.parentNode : r.target;
      if (!target || target.nodeType !== 1) return;
      if (r.type === "characterData" && loose.has(r.target)) loose.delete(r.target);
      var unit = unitOf(target);
      if (unit) {
        /* The script wrote English into a translated unit: put the rest of
           the unit back, keep what the script wrote, translate again. */
        restoreUnit(unit, unit === target ? null : target);
        if (unit === target) units.delete(unit);
        roots.add(unit.parentNode || unit);
      } else {
        roots.add(target.parentNode && target.parentNode.nodeType === 1 ? target.parentNode : target);
      }
    });
    quietly(function () {
      roots.forEach(function (root) { if (root.isConnected) translateTree(root); });
    });
  }

  /* ── Loading and applying. ──────────────────────────────────────── */

  function fetchJson(url) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
  }
  function load(code) {
    if (cache[code]) return Promise.resolve(cache[code]);
    if (code === DEFAULT) { cache[code] = { keys: {}, text: {} }; return Promise.resolve(cache[code]); }
    return Promise.all([
      fetchJson("/data/i18n/" + code + ".json"),
      fetchJson("/data/i18n/text/" + code + ".json"),
    ]).then(function (r) {
      cache[code] = { keys: r[0], text: r[1] };
      return cache[code];
    });
  }

  function original(el) {
    if (!el.hasAttribute("data-i18n-en")) {
      el.setAttribute("data-i18n-en",
        el.hasAttribute("placeholder") ? el.getAttribute("placeholder") : el.textContent);
    }
    return el.getAttribute("data-i18n-en");
  }

  function applyKeys(code, map) {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var base = original(el);
      var value = (code === DEFAULT) ? base : (map[key] || base);
      if (el.id === "themeLabel") {
        var themeKey = document.documentElement.getAttribute("data-theme") === "light"
          ? "theme.dark" : "theme.light";
        value = (code === DEFAULT ? null : map[themeKey]) || (code === DEFAULT
          ? (themeKey === "theme.dark" ? "DARK" : "LIGHT") : value);
      }
      if (el.hasAttribute("placeholder")) el.setAttribute("placeholder", value);
      else el.textContent = value;
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-aria-label");
      if (!el.hasAttribute("data-i18n-aria-label-en")) {
        el.setAttribute("data-i18n-aria-label-en", el.getAttribute("aria-label") || "");
      }
      el.setAttribute("aria-label", (code === DEFAULT ? el.getAttribute("data-i18n-aria-label-en") : map[key]) ||
        el.getAttribute("data-i18n-aria-label-en"));
    });
  }

  function apply(code, bundle) {
    if (observer) observer.disconnect();
    restoreAll();
    missing.clear();
    lang = code;
    keys = bundle.keys || {};
    text = bundle.text || {};
    window.__NOSHASHI_I18N = keys;
    applyKeys(code, keys);
    if (code !== DEFAULT) {
      translateTree(document.body);
      if (originalTitle === null) originalTitle = document.title;
      var tk = escText(originalTitle.replace(/\s+/g, " ").trim());
      var t = lookup(tk);
      if (t !== null) document.title = unescText(t);
      else miss(tk);
      if (!observer && "MutationObserver" in window) observer = new MutationObserver(onMutations);
      observe();
    }
    document.documentElement.setAttribute("lang", code);
    var select = document.getElementById("lang-select");
    if (select) select.value = code;
    document.dispatchEvent(new CustomEvent("noshashi:i18n", { detail: { code: code, map: keys } }));
  }

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function remember(code) {
    try { localStorage.setItem(KEY, code); } catch (e) {}
  }

  function setLanguage(code, options) {
    return load(code).then(function (bundle) {
      apply(code, bundle);
      if (!options || options.remember !== false) remember(code);
      if (code !== DEFAULT) bar(code, bundle.keys);
      else hideBar();
      return code;
    });
  }

  /* A one-line notice: what changed, how to undo it, and which English
     governs. */
  var barEl = null;
  function bar(code, map) {
    if (!barEl) {
      barEl = document.createElement("div");
      barEl.className = "lang-bar";
      document.body.appendChild(barEl);
      window.addEventListener("resize", function () {
        if (!barEl.hidden) document.documentElement.style.setProperty("--lang-bar-h", barEl.offsetHeight + "px");
      });
    }
    var native = (window.__NOSHASHI_LANGS || []).filter(function (l) { return l.code === code; })[0];
    barEl.innerHTML =
      '<span>' + (map["lang.showing"] || "Showing this site in") + " " +
        '<b>' + ((native && native.native) || code) + "</b>" +
      '</span>' +
      '<span class="lang-note">' + (map["lang.note"] || "") + "</span>" +
      '<button type="button" id="lang-revert">' +
        (map["lang.english"] || "View in English") + "</button>";
    barEl.hidden = false;
    document.documentElement.style.setProperty("--lang-bar-h", barEl.offsetHeight + "px");
    document.getElementById("lang-revert").addEventListener("click", function () {
      setLanguage(DEFAULT);
    });
  }
  function hideBar() {
    if (barEl) barEl.hidden = true;
    document.documentElement.style.removeProperty("--lang-bar-h");
  }

  function mountSwitcher(languages) {
    window.__NOSHASHI_LANGS = languages;
    /* In the shared footer; on a page that predates it, just after its
       footer, so the footer's own sentence stays one sentence. */
    var host = document.querySelector("footer .foot");
    var after = host ? null : document.querySelector("footer");
    if (!host && !after) return;
    var wrap = document.createElement("div");
    wrap.className = "lang-switch";
    wrap.innerHTML =
      '<label class="sr-only" for="lang-select">Language</label>' +
      '<select id="lang-select">' +
      languages.map(function (l) {
        return '<option value="' + l.code + '">' + l.native + "</option>";
      }).join("") +
      "</select>";
    if (host) host.appendChild(wrap);
    else after.parentNode.insertBefore(wrap, after.nextSibling);
    wrap.querySelector("select").addEventListener("change", function (event) {
      setLanguage(event.target.value);
    });
  }

  /* For scripts/extract-i18n.mjs, which runs the page in a language with
     an empty catalogue and reads back everything that missed. */
  window.__NOSHASHI_I18N_MISSING = function () { return Array.from(missing); };
  window.__NOSHASHI_I18N_KEY = function (plain) {
    return template(escText(String(plain).replace(/\s+/g, " ").trim())).key;
  };
  window.__NOSHASHI_I18N_SET = setLanguage;

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
      apply(DEFAULT, { keys: {}, text: {} });
    })
    .catch(function () {
      mountSwitcher([{ code: "en", native: "English" }]);
      if (chosen) setLanguage(chosen, { remember: false });
    });
})();
