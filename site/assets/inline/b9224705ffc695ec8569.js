
/* Exposure, NFT id decoding, and node agreement.
 *
 * The first two answer questions the ledger will only tell you if you know
 * which field to read. The third answers a question about the reading
 * itself: you are seeing mainnet through somebody's server, and when two
 * servers disagree that disagreement IS the finding rather than noise to
 * average away.
 */
(function () {
  /* Browser-reachable only. s1/s2.ripple.com answer curl but send no CORS
     headers, so a page can never read them — a fallback that only works
     outside a browser is not a fallback. */
  var NODES = ["https://xrplcluster.com", "https://xrpl.ws", "https://xrpl.link"];
  /* WebSocket rather than fetch, deliberately. The same hosts that refuse a
     cross-origin POST accept a wss:// connection, and that unlocks Ripple's
     own servers alongside the community clusters — so this compares
     independent operators instead of three front doors onto one of them,
     which is the only version of this question worth asking. */
  var ALL_NODES = [
    { url: "wss://xrplcluster.com", name: "xrplcluster.com", who: "community cluster" },
    { url: "wss://xrpl.ws", name: "xrpl.ws", who: "community cluster" },
    { url: "wss://s1.ripple.com", name: "s1.ripple.com", who: "operated by Ripple" },
    { url: "wss://s2.ripple.com", name: "s2.ripple.com", who: "operated by Ripple" }
  ];

  function askNode(n) {
    return new Promise(function (resolve) {
      var started = Date.now(), settled = false, ws;
      function done(v) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch (e) {}
        resolve(v);
      }
      var timer = setTimeout(function () {
        done({ name: n.name, who: n.who, idx: null, hash: null, ms: Date.now() - started });
      }, 8000);
      try { ws = new WebSocket(n.url); } catch (e) {
        return done({ name: n.name, who: n.who, idx: null, hash: null, ms: 0 });
      }
      ws.onopen = function () {
        ws.send(JSON.stringify({ id: 1, command: "ledger", ledger_index: "validated" }));
      };
      ws.onmessage = function (m) {
        var L = null;
        try { L = JSON.parse(m.data).result.ledger; } catch (e) {}
        done({
          name: n.name, who: n.who,
          idx: L ? Number(L.ledger_index) : null,
          hash: L ? L.ledger_hash : null,
          ms: Date.now() - started
        });
      };
      ws.onerror = function () {
        done({ name: n.name, who: n.who, idx: null, hash: null, ms: Date.now() - started });
      };
    });
  }

  function post(url, method, params) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: method, params: [params] })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.result) throw new Error("no result");
      return j.result;
    });
  }
  function rpc(method, params) {
    var i = 0;
    function go() {
      return post(NODES[i], method, params).catch(function (e) {
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
  /* Data is marked translate="no" so the page translation leaves it as
     read. A fact's key may be data too: pass { html: … }. */
  function nt(x) { return '<span translate="no">' + esc(x) + "</span>"; }
  function declined(code, known) {
    var e = new Error(known || ("The ledger declined the read: " + code));
    if (!known) e.html = "The ledger declined the read: " + nt(code);
    return e;
  }

  function fact(k, v, cls, note) {
    return '<div class="fact"><p class="k">' + (k && k.html ? k.html : esc(k)) + '</p><p class="v ' + (cls || "") + '">' +
      v + '</p>' + (note ? '<p class="n">' + note + '</p>' : "") + "</div>";
  }
  function num(n, d) {
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: d === undefined ? 2 : d });
  }
  function curName(c) {
    if (!c) return "?";
    if (c.length !== 40) return c;
    try {
      var t = (c.match(/.{1,2}/g) || []).filter(function (b) { return b !== "00"; });
      var v = decodeURIComponent(t.map(function (b) { return "%" + b; }).join(""));
      return /^[\x20-\x7e]+$/.test(v) ? v : c.slice(0, 8) + "…";
    } catch (e) { return c.slice(0, 8) + "…"; }
  }
  function show(el, sev, html) {
    el.className = "checkout";
    el.style.setProperty("--sev", sev);
    el.innerHTML = html;
    el.hidden = false;
  }
  function oops(el, msg, html) {
    el.className = "checkout err";
    el.style.setProperty("--sev", "var(--hold)");
    el.innerHTML = '<p class="verdict">' + (html || esc(msg)) + "</p>";
    el.hidden = false;
  }
  function busy(el, msg) {
    el.className = "checkout";
    el.innerHTML = '<p class="spin">' + esc(msg) + "</p>";
    el.hidden = false;
  }
  function wire(form, btn, run) {
    if (!form) return;
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      btn.disabled = true;
      var was = btn.textContent;
      btn.textContent = "Reading…";
      Promise.resolve().then(run).then(null, function () {})
        .then(function () { btn.disabled = false; btn.textContent = was; });
    });
  }

  /* ── Exposure: the lines you hold, and who can freeze them ────── */
  var expForm = document.getElementById("expForm");
  var expAddr = document.getElementById("expAddr");
  var expBtn = document.getElementById("expBtn");
  var expOut = document.getElementById("expOut");

  [].forEach.call(document.querySelectorAll(".sample[data-e]"), function (b) {
    b.addEventListener("click", function () {
      expAddr.value = b.getAttribute("data-e");
      expForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });
  });

  wire(expForm, expBtn, function () {
    var a = (expAddr.value || "").trim();
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a)) {
      oops(expOut, "That does not look like an XRPL address.");
      return;
    }
    busy(expOut, "Reading trust lines…");
    return rpc("account_lines", { account: a, ledger_index: "validated", limit: 200 })
      .then(function (r) {
        if (r.error) {
          throw declined(r.error, r.error === "actNotFound" ? "No such account on mainnet." : null);
        }
        /* The sign is the whole meaning. A positive balance is a token this
           account HOLDS, and its issuer may be able to freeze it. A negative
           one is a token this account has ISSUED — an obligation it owes,
           which nobody can freeze against it. Reading them together, as an
           absolute value, reports an issuer's own liabilities back to it as
           holdings at risk. */
        var all = r.lines || [];
        var held = all.filter(function (l) { return Number(l.balance) > 0; });
        var owed = all.filter(function (l) { return Number(l.balance) < 0; });

        if (!held.length) {
          show(expOut, owed.length ? "var(--faint)" : "var(--go)",
            '<p class="verdict">This account holds no issued tokens.</p>' +
            '<p class="sub">' +
              (owed.length
                ? "It has issued " + owed.length + " token line" + (owed.length === 1 ? "" : "s") +
                  " of its own, which are obligations it owes rather than balances anyone can freeze against it."
                : "It may still hold XRP, which has no issuer and cannot be frozen.") +
            "</p>");
          return;
        }
        var lines = held;
        lines.sort(function (x, y) { return Number(y.balance) - Number(x.balance); });
        var top = lines.slice(0, 6);

        /* Ask each distinct issuer whether it gave up the freeze right. */
        var issuers = [];
        top.forEach(function (l) { if (issuers.indexOf(l.account) < 0) issuers.push(l.account); });
        return Promise.all(issuers.map(function (iss) {
          return rpc("account_info", { account: iss, ledger_index: "validated" })
            .then(function (x) { return { iss: iss, flags: (x.account_data || {}).Flags || 0 }; })
            .catch(function () { return { iss: iss, flags: null }; });
        })).then(function (infos) {
          var byIss = {};
          infos.forEach(function (i) { byIss[i.iss] = i.flags; });

          var frozen = 0, freezable = 0, surrendered = 0;
          var f = top.map(function (l) {
            var fl = byIss[l.account];
            var isFrozen = l.freeze_peer === true;
            var noFreeze = fl === null ? null : !!(fl & 0x00200000);
            if (isFrozen) frozen += 1;
            else if (noFreeze === true) surrendered += 1;
            else if (noFreeze === false) freezable += 1;

            var state = isFrozen ? "Frozen now"
              : noFreeze === null ? "Issuer unread"
              : noFreeze ? "Cannot be frozen" : "Can be frozen";
            var cls = isFrozen ? "bad" : noFreeze === null ? "unknown" : noFreeze ? "good" : "warn";
            return fact({ html: nt(curName(l.currency)) + " · " + num(Number(l.balance), 4) },
              state, cls,
              "Issued by <span class=\"mono\" translate=\"no\">" + esc(l.account.slice(0, 12)) + "…</span>" +
              (isFrozen ? ". This specific line is frozen right now." : ""));
          });

          var sev = frozen ? "var(--nogo)" : (freezable ? "var(--hold)" : "var(--go)");
          var verdict = frozen
            ? frozen + " of your balances " + (frozen === 1 ? "is" : "are") + " frozen right now."
            : freezable
              ? freezable + " of these balances " + (freezable === 1 ? "sits" : "sit") +
                " with an issuer that kept the right to freeze."
              : "Every issuer here has permanently given up the right to freeze.";

          show(expOut, sev,
            '<p class="verdict">' + verdict + "</p>" +
            '<p class="sub">' + lines.length + " token" + (lines.length === 1 ? "" : "s") + " held" +
              (lines.length > top.length ? ", largest " + top.length + " shown" : "") +
              (owed.length ? "; " + owed.length + " further line" + (owed.length === 1 ? " is" : "s are") +
                " this account's own issuance, not a holding" : "") +
              ' · <span class="mono" translate="no">' + esc(a.slice(0, 16)) + "…</span></p>" +
            '<div class="facts">' + f.join("") + "</div>" +
            '<p class="foot">A freeze right is not wrongdoing — most issuers keep it, and it is how ' +
            'a regulated issuer answers a court order. It is a fact about what you hold, and one ' +
            'that is published rather than disclosed. The desktop app reads deep freeze ' +
            '(XLS-77) and counterparty history too. <a href="#download">Download it free</a>.</p>');
        });
      }).catch(function (e) { oops(expOut, e.message || "Could not reach a public XRPL node.", e.html); });
  });

  /* ── NFT: the id carries the issuer, the royalty and the rights ── */
  var nftForm = document.getElementById("nftForm");
  var nftId = document.getElementById("nftId");
  var nftBtn = document.getElementById("nftBtn");
  var nftOut = document.getElementById("nftOut");

  [].forEach.call(document.querySelectorAll(".sample[data-n]"), function (b) {
    b.addEventListener("click", function () {
      nftId.value = b.getAttribute("data-n");
      nftForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });
  });

  var B58 = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";
  function sha256(bytes) {
    return crypto.subtle.digest("SHA-256", bytes).then(function (b) { return new Uint8Array(b); });
  }
  /* AccountID -> r-address is base58check over a 0x00-prefixed payload with a
     double-SHA-256 checksum, in XRPL's own alphabet rather than Bitcoin's. */
  function accountIdToAddress(hex) {
    var raw = new Uint8Array(21);
    raw[0] = 0;
    for (var i = 0; i < 20; i++) raw[i + 1] = parseInt(hex.substr(i * 2, 2), 16);
    return sha256(raw).then(sha256).then(function (h) {
      var full = new Uint8Array(25);
      full.set(raw, 0);
      full.set(h.slice(0, 4), 21);
      var n = 0n;
      for (var j = 0; j < full.length; j++) n = n * 256n + BigInt(full[j]);
      var out = "";
      while (n > 0n) { out = B58[Number(n % 58n)] + out; n = n / 58n; }
      for (var k = 0; k < full.length && full[k] === 0; k++) out = B58[0] + out;
      return out;
    });
  }

  wire(nftForm, nftBtn, function () {
    var id = (nftId.value || "").trim().replace(/^0x/i, "").toUpperCase();
    if (!/^[0-9A-F]{64}$/.test(id)) {
      oops(nftOut, "An NFTokenID is 64 hexadecimal characters. That is " + id.length + ".");
      return;
    }
    busy(nftOut, "Decoding…");
    var flags = parseInt(id.slice(0, 4), 16);
    var fee = parseInt(id.slice(4, 8), 16);
    var acct = id.slice(8, 48);
    var rawTaxon = parseInt(id.slice(48, 56), 16);
    var seq = parseInt(id.slice(56, 64), 16);
    /* The taxon is stored scrambled against the sequence so that sequential
       mints do not produce adjacent ids. 384160001 * seq exceeds
       Number.MAX_SAFE_INTEGER for any real sequence, so this must be done
       in BigInt — done as a double it returns a plausible wrong taxon. */
    var taxon = Number(
      (BigInt(rawTaxon) ^ ((384160001n * BigInt(seq) + 2459n) % 4294967296n)) % 4294967296n
    );

    return accountIdToAddress(acct).then(function (addr) {
      return rpc("account_info", { account: addr, ledger_index: "validated" })
        .then(function (r) { return { addr: addr, ok: !r.error }; })
        .catch(function () { return { addr: addr, ok: null }; });
    }).then(function (iss) {
      var transferable = !!(flags & 0x0008);
      var burnable = !!(flags & 0x0001);
      var onlyXRP = !!(flags & 0x0002);
      var mutable = !!(flags & 0x0010);

      var sev = burnable ? "var(--hold)" : "var(--go)";
      var verdict = burnable
        ? "The issuer kept the right to destroy this token."
        : transferable ? "This token is transferable and cannot be burned by its issuer."
                       : "This token cannot be transferred.";

      var f = [];
      f.push(fact("Issuer", '<span class="mono" translate="no">' + esc(iss.addr) + "</span>", "",
        iss.ok === true ? "Decoded from the id itself, and the account exists on mainnet."
          : iss.ok === false ? "Decoded from the id, but no such account is on mainnet — treat the id as suspect."
          : "Decoded from the id. The node did not answer a check."));
      f.push(fact("Royalty on resale", (fee / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "") + "%",
        "mono" + (fee ? " warn" : ""),
        fee ? "Paid to the issuer on every secondary sale." : "No transfer fee is charged."));
      f.push(fact("Issuer can burn it", burnable ? "Yes" : "No", burnable ? "warn" : "good",
        burnable ? "<span class=\"mono\">tfBurnable</span> — the issuer may destroy this token while you hold it."
                 : "The issuer cannot destroy this token."));
      f.push(fact("Transferable", transferable ? "Yes" : "No", transferable ? "" : "warn",
        transferable ? "It can be sold on." : "Only the issuer may hold or move it."));
      f.push(fact("Metadata mutable", mutable ? "Yes" : "No", mutable ? "warn" : "good",
        mutable ? "XLS-46 — the issuer can change what this token points at after you buy it."
                : "The URI is fixed at mint."));
      f.push(fact("Taxon · sequence", taxon + " · " + seq, "mono",
        "The issuer's own collection number, unscrambled, and the mint sequence." +
        (onlyXRP ? " Sale proceeds are restricted to XRP." : "")));

      show(nftOut, sev,
        '<p class="verdict">' + verdict + "</p>" +
        '<p class="sub">Decoded in your browser from the id alone — no lookup was needed for any of ' +
        'this except confirming the issuer exists.</p>' +
        '<div class="facts">' + f.join("") + "</div>" +
        '<p class="foot">An XLS-20 id is not a database key: the flags, the royalty, the issuer and ' +
        'the collection are packed into the 256 bits. A marketplace showing you a picture and a ' +
        'price is not showing you these.</p>');
    }).catch(function (e) { oops(nftOut, e.message || "Could not decode that id."); });
  });

  /* ── Nodes: do they agree? ────────────────────────────────────── */
  var nodeForm = document.getElementById("nodeForm");
  var nodeBtn = document.getElementById("nodeBtn");
  var nodeOut = document.getElementById("nodeOut");

  wire(nodeForm, nodeBtn, function () {
    busy(nodeOut, "Asking each node what it considers validated…");
    var t0 = Date.now();
    return Promise.all(ALL_NODES.map(askNode)).then(function (rs) {
      var live = rs.filter(function (r) { return r.idx; });
      if (!live.length) { oops(nodeOut, "No public node answered."); return; }
      var idxs = live.map(function (r) { return r.idx; });
      var max = Math.max.apply(null, idxs), min = Math.min.apply(null, idxs);
      var spread = max - min;
      /* Two nodes at the same index must agree on the hash. Different
         indexes are lag, which is normal; a hash conflict is not. */
      var conflict = false;
      live.forEach(function (a) {
        live.forEach(function (b) {
          if (a !== b && a.idx === b.idx && a.hash !== b.hash) conflict = true;
        });
      });

      var sev = conflict ? "var(--nogo)" : (spread > 3 ? "var(--hold)" : "var(--go)");
      var verdict = conflict
        ? "Two nodes disagree about the contents of the same ledger."
        : spread === 0 ? "All nodes agree, at the same ledger."
        : "The nodes agree, within " + spread + " ledger" + (spread === 1 ? "" : "s") + " of each other.";

      var f = rs.map(function (r) {
        return fact({ html: nt(r.name) },
          r.idx ? String(r.idx) : "No answer",
          r.idx ? ("mono" + (r.idx === max ? " good" : "")) : "unknown",
          esc(r.who) + " · " +
          (r.idx ? (r.hash ? '<span class="mono" translate="no">' + esc(r.hash.slice(0, 16)) + "…</span> · " + r.ms + " ms"
                           : r.ms + " ms")
                 : "did not respond"));
      });

      show(nodeOut, sev,
        '<p class="verdict">' + verdict + "</p>" +
        '<p class="sub">' + live.length + " of " + rs.length + " nodes answered in " +
          (Date.now() - t0) + " ms. Ledgers close about every four seconds, so a gap of one or " +
          "two is ordinary timing rather than disagreement.</p>" +
        '<div class="facts">' + f.join("") + "</div>" +
        '<p class="foot">You are always reading the ledger through someone\'s server. When two ' +
        'disagree, the disagreement is the reading — the desktop app treats it that way rather ' +
        'than picking a winner. Two of these are run by Ripple and two are community clusters, ' +
        'so agreement across them means more than agreement between three front doors onto the ' +
        'same infrastructure. <a href="#download">Download it free</a>.</p>');
    });
  });
})();
