/*
 * The plan picker shown when a free caller reaches a limit (HTTP 429 with
 * code FREE_LIMIT or RATE_LIMIT) or calls a paid-only endpoint (402).
 * The API sends the offer itself (`upgrade`, from upgradeOffer in
 * api/_lib/rippling-keys.js), so the prices here are always the ones the
 * invoice uses. Used by /console/ and /rippling/.
 *
 *   window.NoshashiUpgrade.show(body)   // body = the JSON error reply
 *
 * "Ask NOSHX which plan fits" opens the site's support assistant
 * (support.js) with the question filled in. Nothing is stored and nothing
 * is sent anywhere until the visitor clicks.
 */
(function () {
  "use strict";
  if (window.NoshashiUpgrade) return;

  var CSS =
    ".up-dlg{margin:auto;max-height:calc(100dvh - 32px);overflow:auto;max-width:min(720px,calc(100vw - 32px));width:100%;border:1px solid var(--rule,#333);border-radius:14px;padding:0;" +
    "background:var(--bg,#0d0f0d);color:var(--ink,#eee);box-shadow:0 30px 80px rgba(0,0,0,.55)}" +
    ".up-dlg::backdrop{background:rgba(0,0,0,.6)}" +
    ".up-in{padding:22px clamp(16px,4vw,28px) 24px}" +
    ".up-kick{font:11px 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--warn,#f5a524);margin:0}" +
    ".up-h{font:400 clamp(22px,3vw,28px)/1.2 'Instrument Serif',Georgia,serif;margin:8px 0 6px}" +
    ".up-p{color:var(--muted,#aaa);font-size:14px;line-height:1.55;margin:0 0 16px}" +
    ".up-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}" +
    ".up-card{border:1px solid var(--rule,#333);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px}" +
    ".up-card[data-pick]{border-color:var(--ink,#eee)}" +
    ".up-name{font:600 15px 'Space Grotesk',system-ui,sans-serif}" +
    ".up-price{font:600 22px 'Space Grotesk',system-ui,sans-serif}.up-price small{font-size:12px;font-weight:400;color:var(--muted,#aaa)}" +
    ".up-card ul{margin:0;padding-left:16px;color:var(--muted,#aaa);font-size:12.5px;line-height:1.5;flex:1}" +
    ".up-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;align-items:center}" +
    ".up-x{position:absolute;right:12px;top:10px;background:none;border:0;color:var(--muted,#aaa);font-size:22px;cursor:pointer;line-height:1}" +
    ".up-note{font-size:12px;color:var(--muted,#aaa);margin-top:12px}";

  var dlg = null;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function link(href, cls, text) { var a = el("a", cls, text); a.href = href; return a; }

  function build() {
    var style = el("style"); style.textContent = CSS; document.head.appendChild(style);
    dlg = el("dialog", "up-dlg"); dlg.setAttribute("aria-labelledby", "up-h");
    document.body.appendChild(dlg);
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  }

  function money(n) { return "$" + Number(n).toLocaleString("en-US"); }

  function show(body) {
    var offer = body && body.upgrade;
    if (!offer || !offer.plans || !offer.plans.length) return false;
    if (!dlg) build();
    dlg.textContent = "";
    var inner = el("div", "up-in"); inner.style.position = "relative";
    var x = el("button", "up-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Close"); x.addEventListener("click", function () { dlg.close(); });
    var free = body.code === "FREE_LIMIT" || body.code === "RATE_LIMIT";
    inner.appendChild(x);
    inner.appendChild(el("p", "up-kick", body.code === "FREE_LIMIT" ? "Free limit reached" : body.code === "RATE_LIMIT" ? "Slow down, or go unlimited" : "Paid plan needed"));
    var h = el("h2", "up-h", free ? "You've gone past your free limit." : "This check is part of a paid plan."); h.id = "up-h";
    inner.appendChild(h);
    inner.appendChild(el("p", "up-p", (body.error || "") + " Every plan is read-only: no keys of yours, no signing, no custody."));
    var grid = el("div", "up-grid");
    offer.plans.forEach(function (p, i) {
      var c = el("div", "up-card"); if (i === 0) c.setAttribute("data-pick", "");
      c.appendChild(el("span", "up-name", p.label + (i === 0 ? " · most teams start here" : "")));
      var price = el("span", "up-price", money(p.monthly_usd)); price.appendChild(el("small", null, " a month")); c.appendChild(price);
      var ul = el("ul"); (p.unlocks || []).forEach(function (u) { ul.appendChild(el("li", null, u)); }); c.appendChild(ul);
      c.appendChild(link(p.order_url, i === 0 ? "btn" : "btn ghost", "Choose " + p.label));
      grid.appendChild(c);
    });
    inner.appendChild(grid);
    var row = el("div", "up-row");
    row.appendChild(link(offer.compare_url || "/rippling/#plans", "btn ghost", "Compare all plans"));
    if (typeof window.noshashiSupportAsk === "function") {
      var ask = el("button", "btn ghost", "Ask NOSHX which plan fits"); ask.type = "button";
      ask.addEventListener("click", function () {
        dlg.close();
        window.noshashiSupportAsk("Which Rippling Exposure API plan fits my team? I just reached the free limit.");
      });
      row.appendChild(ask);
    }
    inner.appendChild(row);
    inner.appendChild(el("p", "up-note", "Billed monthly by invoice or card; annual prepayment is 10% less. Keys are issued once the first invoice is paid. Questions: " + (offer.contact || "institutions@noshashi.app")));
    dlg.appendChild(inner);
    if (typeof dlg.showModal === "function") { if (!dlg.open) dlg.showModal(); } else { location.href = offer.compare_url || "/rippling/#plans"; }
    return true;
  }

  window.NoshashiUpgrade = { show: show };
})();
