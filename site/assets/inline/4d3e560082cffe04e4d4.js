
/* The free address check.
 *
 * Reads validated mainnet state and reports what the ledger publishes and
 * most interfaces do not. Three things it deliberately never does: invent a
 * reputation score, show a zero where the ledger gave no answer, or describe
 * a right the issuer holds as something they have already done.
 *
 * Flag values are XRPL account root flags. NoFreeze is the one that matters
 * most and reads backwards from instinct: its PRESENCE is the good news,
 * because it is the issuer permanently surrendering the freeze right.
 */
(function () {
  /* Browser-reachable only. s1/s2.ripple.com answer curl but send no CORS
     headers, so a page can never read them — a fallback that only works
     outside a browser is not a fallback. */
  var NODES = ["https://xrplcluster.com", "https://xrpl.ws", "https://xrpl.link"];
  var F = {
    RequireDest:   0x00020000,
    RequireAuth:   0x00040000,
    DisallowXRP:   0x00080000,
    DisableMaster: 0x00100000,
    NoFreeze:      0x00200000,
    GlobalFreeze:  0x00400000,
    DefaultRipple: 0x00800000,
    DepositAuth:   0x01000000,
    Clawback:      0x80000000
  };

  var form = document.getElementById("checkForm");
  var input = document.getElementById("addr");
  var btn = document.getElementById("checkBtn");
  var out = document.getElementById("checkOut");
  if (!form) return;

  [].forEach.call(document.querySelectorAll(".sample"), function (b) {
    b.addEventListener("click", function () {
      input.value = b.getAttribute("data-a");
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });
  });

  function esc(x) {
    return String(x).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* Try each node in turn. A single node being down is not a finding. */
  function rpc(method, params) {
    var i = 0;
    function attempt() {
      return fetch(NODES[i], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: method, params: [params] })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.result) throw new Error("no result");
        return j.result;
      }).catch(function (e) {
        i += 1;
        if (i < NODES.length) return attempt();
        throw e;
      });
    }
    return attempt();
  }

  function hexToText(h) {
    if (!h) return null;
    try {
      var t = h.replace(/[^0-9a-fA-F]/g, "").match(/.{1,2}/g) || [];
      return decodeURIComponent(t.map(function (b) { return "%" + b; }).join(""));
    } catch (e) { return null; }
  }

  /* Data (addresses, codes, currencies) is marked translate="no" so the
     page translation (site/assets/i18n.js) leaves it exactly as read. */
  function nt(x) { return '<span translate="no">' + esc(x) + "</span>"; }

  function fact(k, v, cls, note) {
    return '<div class="fact"><p class="k">' + esc(k) + '</p>' +
           '<p class="v ' + (cls || "") + '">' + v + '</p>' +
           (note ? '<p class="n">' + note + '</p>' : "") + "</div>";
  }

  function render(addr, info, gw, signers) {
    var a = info.account_data || {};
    var flags = a.Flags || 0;
    var noFreeze = !!(flags & F.NoFreeze);
    var globalFreeze = !!(flags & F.GlobalFreeze);
    var clawback = !!(flags & F.Clawback);

    /* The verdict. Ordered by what would hurt most if you did not know it. */
    var sev = "var(--go)", verdict, sub;
    if (globalFreeze) {
      sev = "var(--nogo)";
      verdict = "Every balance this issuer backs is frozen right now.";
      sub = "Global freeze is set. Holders cannot send what they hold.";
    } else if (clawback) {
      sev = "var(--hold)";
      verdict = "This issuer can claw back tokens it has issued.";
      sub = "Clawback is enabled — issued balances can be taken back unilaterally.";
    } else if (!noFreeze) {
      sev = "var(--hold)";
      verdict = "This account keeps the right to freeze balances it issues.";
      sub = "Not a wrongdoing — most issuers keep it. It is a right you should know about before you hold their token.";
    } else {
      verdict = "This issuer has permanently given up the right to freeze.";
      sub = "NoFreeze is set, and on XRPL that cannot be undone.";
    }

    var f = [];

    f.push(fact("Freeze rights",
      globalFreeze ? "Frozen now" : (noFreeze ? "Surrendered" : "Retained"),
      globalFreeze ? "bad" : (noFreeze ? "good" : "warn"),
      globalFreeze ? "Global freeze is currently set."
        : (noFreeze ? "NoFreeze is set and is irreversible."
                    : "The issuer may freeze an individual line at any time.")));

    /* TransferRate is 0/absent for no fee, otherwise 1e9..2e9 for 0%..100%.
       Values outside that range exist on old accounts and cannot be read as
       a percentage — 0xFFFFFFFF would render as 329%, which is not a fee any
       holder will ever be charged. Say it is uninterpretable instead of
       inventing a figure. */
    var rate = a.TransferRate;
    if (!rate) {
      f.push(fact("Transfer fee", "0%", "mono", "No transfer fee is set."));
    } else if (rate >= 1e9 && rate <= 2e9) {
      var pct = (((rate / 1e9) - 1) * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
      f.push(fact("Transfer fee", pct + "%", "mono" + (rate > 1e9 ? " warn" : ""),
        rate > 1e9 ? "Charged on every transfer of this token between third parties."
                   : "No transfer fee is charged."));
    } else {
      f.push(fact("Transfer fee", "Not interpretable", "unknown",
        "The account stores " + esc(String(rate)) + ", which is outside the protocol's valid " +
        "range of 0 or 1,000,000,000\u20132,000,000,000. It cannot be read as a percentage."));
    }

    var ob = (gw && gw.obligations) || null;
    if (ob && Object.keys(ob).length) {
      /* Show the largest few, but never silently. A capped list that does
         not say it is capped is the same failure this tool exists to catch. */
      var keys = Object.keys(ob).sort(function (x, y) { return Number(ob[y]) - Number(ob[x]); });
      var shown = keys.slice(0, 3);
      var parts = shown.map(function (c) {
        return nt(c) + " " + Number(ob[c]).toLocaleString(undefined, { maximumFractionDigits: 2 });
      });
      var rest = keys.length - shown.length;
      f.push(fact("Outstanding obligations", parts.join("<br>"), "mono",
        "What this issuer currently owes to holders" +
        (rest > 0 ? ", largest " + shown.length + " of " + keys.length + " currencies shown." : ".")));
    } else if (gw) {
      f.push(fact("Outstanding obligations", "None", "",
        "This account has issued nothing that is still held. A token it backs could not be redeemed."));
    } else {
      f.push(fact("Outstanding obligations", "Not established", "unknown",
        "The node did not answer this read."));
    }

    /* The quorum finding, from the research page, applied live. */
    if (signers && signers.entries && signers.entries.length) {
      var weights = signers.entries.map(function (e) { return e.SignerEntry.SignerWeight; });
      var total = weights.reduce(function (x, y) { return x + y; }, 0);
      var q = signers.quorum;
      var solo = weights.filter(function (w) { return w >= q; }).length;
      f.push(fact("Signers",
        signers.entries.length + " signers · quorum " + q + " of " + total,
        "mono" + (solo ? " warn" : ""),
        solo ? solo + " of them meets the quorum alone, so this is a single-key account wearing a committee's clothes."
             : "No single signer meets the quorum."));
    } else if (flags & F.DisableMaster) {
      f.push(fact("Master key", "Disabled", "",
        "The original key can no longer sign. Control sits with a regular key or a signer list."));
    } else {
      f.push(fact("Signers", "Single key", "",
        "No signer list. One key moves this account."));
    }

    var dom = hexToText(a.Domain);
    f.push(fact("Domain", dom ? nt(dom) : "Not set", dom ? "mono" : "unknown",
      dom ? "Self-declared by the account. It is a claim, not a verification."
          : "No domain is published."));

    f.push(fact("Requires destination tag",
      (flags & F.RequireDest) ? "Yes" : "No",
      (flags & F.RequireDest) ? "warn" : "",
      (flags & F.RequireDest) ? "A payment without a tag will be rejected — this is usually an exchange."
                              : "Payments without a destination tag are accepted."));

    out.className = "checkout";
    out.style.setProperty("--sev", sev);
    out.innerHTML =
      '<p class="verdict">' + verdict + "</p>" +
      '<p class="sub">' + sub + ' <span class="mono" translate="no">' + esc(addr) + "</span></p>" +
      '<div class="facts">' + f.join("") + "</div>" +
      '<p class="foot">Read from validated ledger ' +
        (info.ledger_index ? esc(info.ledger_index) : "state") +
        '. This is what the ledger publishes — there is no reputation score behind it and no ' +
        'bad-actor list, because inventing one would be the worst thing this tool could do. ' +
        'The desktop app goes further: counterparty history, issuance concentration and ' +
        'settlement adjudication. <a href="#download">Download it free</a>.</p>';
    out.hidden = false;
  }

  function fail(msg, html) {
    out.className = "checkout err";
    out.style.setProperty("--sev", "var(--hold)");
    out.innerHTML = '<p class="verdict">' + (html || esc(msg)) + "</p>";
    out.hidden = false;
  }

  /* A rippled error code the reader has no plain-words version of. The
     code itself is data; the sentence around it is translated. */
  function declined(code, known) {
    var e = new Error(known || ("The ledger declined the read: " + code));
    if (!known) e.html = "The ledger declined the read: " + nt(code);
    return e;
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var addr = (input.value || "").trim();
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(addr)) {
      fail("That does not look like an XRPL address. They begin with r and are 25–35 characters.");
      return;
    }
    btn.disabled = true;
    var was = btn.textContent;
    btn.textContent = "Reading…";
    out.hidden = false;
    out.className = "checkout";
    out.innerHTML = '<p class="spin">Reading validated ledger state…</p>';

    rpc("account_info", { account: addr, ledger_index: "validated" })
      .then(function (info) {
        if (info.error) {
          /* Say what happened in the reader's terms. A raw rippled error
             code is accurate and useless to the person who typed it. */
          var says = {
            actNotFound: "No such account on mainnet. An address that has never been funded does not exist on the ledger, so there is nothing to read.",
            actMalformed: "That is not a valid XRPL address — it has the right shape but fails its checksum, which usually means a mistyped or transposed character.",
            invalidParams: "That address was not accepted by the ledger. Check it for a missing or extra character."
          };
          throw declined(info.error, says[info.error]);
        }
        return Promise.all([
          info,
          rpc("gateway_balances", { account: addr, ledger_index: "validated" }).catch(function () { return null; }),
          rpc("account_objects", { account: addr, type: "signer_list", ledger_index: "validated" })
            .then(function (r) {
              var l = (r.account_objects || [])[0];
              return l ? { quorum: l.SignerQuorum, entries: l.SignerEntries } : null;
            }).catch(function () { return null; })
        ]);
      })
      .then(function (r) { render(addr, r[0], r[1], r[2]); })
      .catch(function (e) { fail(e.message || "Could not reach a public XRPL node. Try again in a moment.", e.html); })
      .then(function () { btn.disabled = false; btn.textContent = was; });
  });
})();
