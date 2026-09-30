
/* Tabs, plus the payment and order-book tools.
 *
 * Both reproduce a claim made on /research/. That is the point: a figure
 * a visitor can re-measure on the spot is worth more than one they have to
 * take on trust, and if the live number disagrees with the published one
 * the published one is what needs revisiting.
 */
(function () {
  /* Browser-reachable only. s1/s2.ripple.com answer curl but send no CORS
     headers, so a page can never read them — a fallback that only works
     outside a browser is not a fallback. */
  var NODES = ["https://xrplcluster.com", "https://xrpl.ws", "https://xrpl.link"];

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

  function esc(x) {
    return String(x).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  /* Data is marked translate="no" so the page translation leaves it as read. */
  function nt(x) { return '<span translate="no">' + esc(x) + "</span>"; }
  function declined(code, known) {
    var e = new Error(known || ("The ledger declined the read: " + code));
    if (!known) e.html = "The ledger declined the read: " + nt(code);
    return e;
  }

  function fact(k, v, cls, note) {
    return '<div class="fact"><p class="k">' + esc(k) + '</p><p class="v ' + (cls || "") + '">' +
      v + '</p>' + (note ? '<p class="n">' + note + '</p>' : "") + "</div>";
  }
  function num(n, d) {
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: d === undefined ? 2 : d });
  }
  /* A currency code is either three characters or 40 hex digits that decode
     to a name. Neither is owned by anyone — any account may issue "USD". */
  function curName(c) {
    if (!c) return "?";
    if (c.length !== 40) return c;
    try {
      var t = (c.match(/.{1,2}/g) || []).filter(function (b) { return b !== "00"; });
      var s = decodeURIComponent(t.map(function (b) { return "%" + b; }).join(""));
      return /^[\x20-\x7e]+$/.test(s) ? s : c.slice(0, 8) + "…";
    } catch (e) { return c.slice(0, 8) + "…"; }
  }
  function amtVal(a) { return typeof a === "object" ? Number(a.value) : Number(a) / 1e6; }
  function amtCur(a) { return typeof a === "object" ? curName(a.currency) : "XRP"; }

  /* ── Tabs ─────────────────────────────────────────────────────── */
  var tabs = [].slice.call(document.querySelectorAll(".tab"));
  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      tabs.forEach(function (o) {
        var pane = document.getElementById(o.getAttribute("aria-controls"));
        var on = o === t;
        o.classList.toggle("on", on);
        o.setAttribute("aria-selected", on ? "true" : "false");
        if (pane) { pane.classList.toggle("on", on); pane.hidden = !on; }
      });
    });
  });

  /* ── Payment: what did it actually deliver? ───────────────────── */
  var payForm = document.getElementById("payForm");
  var txh = document.getElementById("txh");
  var payBtn = document.getElementById("payBtn");
  var payOut = document.getElementById("payOut");

  function payFail(m, html) {
    payOut.className = "checkout err";
    payOut.style.setProperty("--sev", "var(--hold)");
    payOut.innerHTML = '<p class="verdict">' + (html || esc(m)) + "</p>";
    payOut.hidden = false;
  }

  function renderPay(hash, tx, meta) {
    var type = tx.TransactionType;
    if (type !== "Payment") {
      payFail("", "That is a " + nt(type) + ", not a payment. This tool reads what a payment delivered.");
      return;
    }
    var res = (meta && meta.TransactionResult) || "?";
    var req = tx.Amount || tx.DeliverMax;
    var del = meta && meta.delivered_amount;

    if (del === "unavailable") {
      payOut.className = "checkout";
      payOut.style.setProperty("--sev", "var(--faint)");
      payOut.innerHTML = '<p class="verdict">The ledger does not record what this delivered.</p>' +
        '<p class="sub">Payments before 2014 predate <span class="mono">delivered_amount</span>. ' +
        'The stated amount cannot be confirmed, and should not be assumed.</p>';
      payOut.hidden = false;
      return;
    }

    var rv = amtVal(req), dv = del ? amtVal(del) : null;
    var ratio = (rv > 0 && dv !== null) ? dv / rv : null;
    var partial = ratio !== null && ratio < 0.9999;

    var sev = "var(--go)", verdict, sub;
    if (res !== "tesSUCCESS") {
      sev = "var(--faint)";
      verdict = "This payment did not succeed.";
      sub = "Result " + nt(res) + ". Nothing was delivered.";
    } else if (partial) {
      sev = "var(--nogo)";
      verdict = "It succeeded and delivered " +
        (ratio < 0.0001 ? "almost none" : num(ratio * 100, 2) + "%") + " of what it stated.";
      sub = "Any system crediting the stated figure over-credits by " +
        (ratio > 0 ? num(1 / ratio, 0) + "×" : "an unbounded factor") + ".";
    } else {
      verdict = "It delivered what it stated.";
      sub = "Requested and delivered agree.";
    }

    var f = [];
    f.push(fact("Result", nt(res), res === "tesSUCCESS" ? "good mono" : "warn mono",
      res === "tesSUCCESS" ? "The transaction succeeded — which says nothing about the amount."
                           : "The transaction did not succeed."));
    f.push(fact("Stated amount", num(rv, 6) + " " + nt(amtCur(req)), "mono",
      "The <span class=\"mono\">Amount</span> field. This is the figure naive systems credit."));
    f.push(fact("Actually delivered",
      dv === null ? "Not recorded" : num(dv, 6) + " " + nt(amtCur(del)),
      dv === null ? "unknown" : ("mono" + (partial ? " bad" : " good")),
      dv === null ? "No <span class=\"mono\">delivered_amount</span> in the metadata."
                  : "The <span class=\"mono\">delivered_amount</span> field. This is what arrived."));
    f.push(fact("Partial-payment flag", (tx.Flags & 0x00020000) ? "Set" : "Not set",
      (tx.Flags & 0x00020000) ? "warn" : "",
      (tx.Flags & 0x00020000)
        ? "<span class=\"mono\">tfPartialPayment</span> permits delivering less than the stated amount."
        : "The full amount was required for the payment to succeed."));

    payOut.className = "checkout";
    payOut.style.setProperty("--sev", sev);
    payOut.innerHTML =
      '<p class="verdict">' + verdict + "</p>" +
      '<p class="sub">' + sub + ' <span class="mono" translate="no">' + esc(hash.slice(0, 24)) + "…</span></p>" +
      (partial ? '<div class="depth">' +
        '<div><div class="lab"><span>Stated</span><em>' + num(rv, 6) + '</em></div>' +
        '<div class="bar"><i style="width:100%"></i></div></div>' +
        '<div><div class="lab"><span>Delivered</span><em>' + num(dv, 6) + '</em></div>' +
        '<div class="bar fill"><i style="width:' + Math.max(ratio * 100, 0.4).toFixed(2) + '%"></i></div></div>' +
        "</div>" : "") +
      '<div class="facts">' + f.join("") + "</div>" +
      '<p class="foot">Partial payments are legitimate and common — they are how the DEX fills what it can. ' +
      'The danger is a system that reads <span class="mono">Amount</span> and reports success. ' +
      '<a href="/research/">The measurement behind this</a>.</p>';
    payOut.hidden = false;
  }

  if (payForm) {
    payForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var h = (txh.value || "").trim().replace(/^0x/i, "").toUpperCase();
      if (!/^[0-9A-F]{64}$/.test(h)) {
        payFail("A transaction hash is 64 hexadecimal characters. That is " + h.length + ".");
        return;
      }
      payBtn.disabled = true;
      var was = payBtn.textContent; payBtn.textContent = "Reading…";
      payOut.hidden = false; payOut.className = "checkout";
      payOut.innerHTML = '<p class="spin">Reading the transaction…</p>';
      rpc("tx", { transaction: h, binary: false }).then(function (r) {
        if (r.error) {
          throw declined(r.error, r.error === "txnNotFound"
            ? "No transaction with that hash is in this node's history. Public nodes keep only recent ledgers."
            : null);
        }
        renderPay(h, r.tx_json || r, r.meta || r.metaData);
      }).catch(function (e) { payFail(e.message || "Could not reach a public XRPL node.", e.html); })
        .then(function () { payBtn.disabled = false; payBtn.textContent = was; });
    });
  }

  /* Rather than hardcode a sample hash that public nodes will eventually
     prune, walk back from the current ledger looking for a live partial
     payment. They run at roughly one to two percent of payments, so a
     handful of ledgers is not a big enough sample — this reads twenty, four
     at a time, and says plainly when it comes up empty rather than implying
     something is wrong. */
  var finder = document.getElementById("findPartial");
  if (finder) {
    finder.addEventListener("click", function () {
      finder.disabled = true;
      var was = finder.textContent; finder.textContent = "searching…";
      payOut.hidden = false; payOut.className = "checkout";
      payOut.innerHTML = '<p class="spin">Walking back through recent ledgers…</p>';

      var LEDGERS = 20, BATCH = 4, scanned = 0, payments = 0;

      /* A ledger's transactions come back flat: the fields sit on the object
         itself with metaData beside them, not under a tx_json wrapper. */
      function scan(r) {
        if (!r || r.validated !== true) return null;
        var txs = (r.ledger && r.ledger.transactions) || [];
        for (var i = 0; i < txs.length; i++) {
          var t = txs[i], tx = t.tx_json || t, m = t.meta || t.metaData;
          if (!tx || tx.TransactionType !== "Payment" || !m) continue;
          if (m.TransactionResult !== "tesSUCCESS") continue;
          payments += 1;
          var req = tx.Amount || tx.DeliverMax, del = m.delivered_amount;
          if (!req || !del || del === "unavailable") continue;
          var rv = amtVal(req), dv = amtVal(del);
          if (rv > 0 && dv / rv < 0.99) return { hash: t.hash || tx.hash, tx: tx, meta: m };
        }
        return null;
      }

      // Start at the newest validated ledger and walk back: every ledger
      // below it is validated too, so nothing here reads unsettled state.
      rpc("ledger", { ledger_index: "validated" }).then(function (c) {
        var validatedIndex = Number(c.ledger_index);
        function round() {
          if (scanned >= LEDGERS) {
            throw new Error("No partial payment in the last " + scanned + " ledgers (" +
              payments + " payments). They run at roughly one to two percent of payments, " +
              "so an empty window is normal — try again, or paste a hash you already have.");
          }
          var batch = [];
          for (var k = 0; k < BATCH; k++) {
            batch.push(rpc("ledger", { ledger_index: validatedIndex--, transactions: true, expand: true })
              .catch(function () { return null; }));
            scanned += 1;
          }
          finder.textContent = "searching " + scanned + " ledgers…";
          return Promise.all(batch).then(function (rs) {
            for (var j = 0; j < rs.length; j++) {
              var hit = scan(rs[j]);
              if (hit) {
                if (txh) txh.value = hit.hash;
                renderPay(hit.hash, hit.tx, hit.meta);
                return true;
              }
            }
            return round();
          });
        }
        return round();
      }).catch(function (e) { payFail(e.message || "Could not reach a public XRPL node."); })
        .then(function () { finder.disabled = false; finder.textContent = was; });
    });
  }

  /* ── Order book: advertised against fundable ──────────────────── */
  var bookForm = document.getElementById("bookForm");
  var pair = document.getElementById("pair");
  var bookBtn = document.getElementById("bookBtn");
  var bookOut = document.getElementById("bookOut");

  if (bookForm) {
    bookForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var parts = pair.value.split("|");
      var label = pair.options[pair.selectedIndex].textContent;
      bookBtn.disabled = true;
      var was = bookBtn.textContent; bookBtn.textContent = "Measuring…";
      bookOut.hidden = false; bookOut.className = "checkout";
      bookOut.innerHTML = '<p class="spin">Walking the live order book…</p>';

      rpc("book_offers", {
        taker_gets: { currency: parts[0], issuer: parts[1] },
        taker_pays: { currency: "XRP" },
        limit: 200,
        ledger_index: "validated"
      }).then(function (r) {
        if (r.error) throw declined(r.error);
        var offers = r.offers || [];
        if (!offers.length) throw new Error("There are no resting offers on this book right now.");
        var adv = 0, fund = 0, under = 0, worst = null;
        offers.forEach(function (o) {
          var a = amtVal(o.TakerGets);
          var fnd = o.taker_gets_funded !== undefined ? amtVal(o.taker_gets_funded) : a;
          adv += a; fund += fnd;
          if (o.taker_gets_funded !== undefined) {
            under += 1;
            if (!worst || (a - fnd) > (worst.a - worst.f)) worst = { a: a, f: fnd };
          }
        });
        var phantom = adv > 0 ? (1 - fund / adv) * 100 : 0;
        var sev = phantom > 50 ? "var(--nogo)" : (phantom > 10 ? "var(--hold)" : "var(--go)");
        var cur = curName(parts[0]);

        var f = [];
        f.push(fact("Offers resting", String(offers.length), "mono",
          "Read from the top of the book, up to 200."));
        f.push(fact("Not fully backed", under + " of " + offers.length,
          "mono" + (under ? " warn" : ""),
          under ? "Their owners no longer hold what they are offering."
                : "Every offer is backed by an owner who still holds the asset."));
        if (worst) {
          f.push(fact("Largest single gap",
            num(worst.a) + " offered<br>" + num(worst.f) + " backed", "mono bad",
            "One offer, advertised against what its owner can actually deliver."));
        }
        f.push(fact("Depth you can rely on", num(fund) + " " + nt(cur),
          "mono" + (phantom > 10 ? " warn" : " good"),
          "Size an exit off this figure, not the advertised one."));

        bookOut.style.setProperty("--sev", sev);
        bookOut.className = "checkout";
        bookOut.innerHTML =
          '<p class="verdict">' +
            (phantom < 1 ? "This book is fully backed."
              : num(phantom, 1) + "% of this book’s visible depth could not fill.") + "</p>" +
          '<p class="sub">' + nt(label) + " · measured just now against validated ledger " +
            esc(r.ledger_index || "state") + "</p>" +
          '<div class="depth">' +
            '<div><div class="lab"><span>Advertised</span><em>' + num(adv) + "</em></div>" +
            '<div class="bar"><i style="width:100%"></i></div></div>' +
            '<div><div class="lab"><span>Could fill</span><em>' + num(fund) + "</em></div>" +
            '<div class="bar ' + (phantom > 10 ? "fill" : "ok") + '"><i style="width:' +
              Math.max(adv > 0 ? (fund / adv) * 100 : 0, 0.4).toFixed(2) + '%"></i></div></div>' +
          "</div>" +
          '<div class="facts">' + f.join("") + "</div>" +
          '<p class="foot">An offer rests in the book whether or not its owner still holds the asset. ' +
          '<span class="mono">rippled</span> reports the difference in ' +
          '<span class="mono">taker_gets_funded</span>; summing ' +
          '<span class="mono">TakerGets</span> counts offers nobody can honour. ' +
          'The desktop app does this across every position you hold. ' +
          '<a href="#download">Download it free</a>.</p>';
        bookOut.hidden = false;
      }).catch(function (e) {
        bookOut.className = "checkout err";
        bookOut.style.setProperty("--sev", "var(--hold)");
        bookOut.innerHTML = '<p class="verdict">' + (e.html || esc(e.message || "Could not reach a public XRPL node.")) + "</p>";
        bookOut.hidden = false;
      }).then(function () { bookBtn.disabled = false; bookBtn.textContent = was; });
    });
  }
})();
