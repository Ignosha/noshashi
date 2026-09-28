var ut = Object.defineProperty;
var ht = (e, t, n) => t in e ? ut(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n;
var N = (e, t, n) => ht(e, typeof t != "symbol" ? t + "" : t, n);
function K(e) {
  const t = Number(e) / 1e6;
  return Number.isFinite(t) ? t.toFixed(6).replace(/\.?0+$/, "") : "0";
}
function Be(e) {
  return new Date((e + 946684800) * 1e3);
}
function P(e) {
  if (!/^[0-9A-F]{40}$/i.test(e)) return e;
  const t = (e.match(/../g) ?? []).map((n) => String.fromCharCode(parseInt(n, 16))).join("").replace(/\0+$/, "").trim();
  return t && /^[\x20-\x7E]+$/.test(t) ? t : e;
}
const ue = [
  "wss://xrplcluster.com",
  "wss://s1.ripple.com",
  "wss://s2.ripple.com"
], he = 12e3, gt = 2e4;
class A extends Error {
  constructor(n, s) {
    super(n);
    N(this, "code");
    this.code = s, this.name = "XrplError";
  }
}
class ft {
  constructor() {
    N(this, "socket", null);
    N(this, "pending", /* @__PURE__ */ new Map());
    N(this, "nextId", 1);
    N(this, "endpointIndex", 0);
    N(this, "attempt", 0);
    N(this, "retryTimer", 0);
    N(this, "connecting", null);
    N(this, "streamHandlers", /* @__PURE__ */ new Set());
    N(this, "statusHandlers", /* @__PURE__ */ new Set());
    N(this, "latencyMs", 0);
    N(this, "connected", !1);
  }
  /** Round-trip time of the most recent successful command. */
  getLatencyMs() {
    return this.latencyMs;
  }
  isConnected() {
    return this.connected;
  }
  /**
   * Drop the current connection and open a fresh one on the next public
   * server. Used by self-repair when a socket is stuck open but silent.
   */
  async reconnect() {
    window.clearTimeout(this.retryTimer);
    const t = this.socket;
    if (this.socket = null, this.connecting = null, this.endpointIndex += 1, this.attempt = 0, this.setConnected(!1), t) {
      t.onopen = null, t.onclose = null, t.onerror = null, t.onmessage = null;
      try {
        t.close();
      } catch {
      }
    }
    for (const [, n] of this.pending)
      window.clearTimeout(n.timer), n.reject(new A("Connection reset"));
    this.pending.clear();
    try {
      return await this.ensureSocket(), !0;
    } catch {
      return !1;
    }
  }
  onStream(t) {
    return this.streamHandlers.add(t), this.ensureSocket(), () => this.streamHandlers.delete(t);
  }
  onStatus(t) {
    return this.statusHandlers.add(t), t(this.connected), () => this.statusHandlers.delete(t);
  }
  setConnected(t) {
    if (this.connected !== t) {
      this.connected = t;
      for (const n of this.statusHandlers) n(t);
    }
  }
  ensureSocket() {
    return this.socket && this.socket.readyState === WebSocket.OPEN ? Promise.resolve(this.socket) : this.connecting ? this.connecting : (this.connecting = new Promise((t, n) => {
      const s = ue[this.endpointIndex % ue.length];
      let a;
      try {
        a = new WebSocket(s);
      } catch (o) {
        this.connecting = null, n(o instanceof Error ? o : new Error(String(o)));
        return;
      }
      this.socket = a;
      const r = window.setTimeout(() => {
        a.close();
      }, he);
      a.onopen = () => {
        window.clearTimeout(r), this.attempt = 0, this.connecting = null, this.setConnected(!0), a.send(
          JSON.stringify({
            id: this.nextId++,
            command: "subscribe",
            streams: ["ledger", "transactions"]
          })
        ), t(a);
      }, a.onmessage = (o) => this.handleMessage(o), a.onerror = () => {
        window.clearTimeout(r);
      }, a.onclose = () => {
        window.clearTimeout(r), this.connecting = null, this.socket = null, this.setConnected(!1);
        for (const [, o] of this.pending)
          window.clearTimeout(o.timer), o.reject(new A("Connection closed"));
        this.pending.clear(), n(new A("Connection closed")), this.scheduleReconnect();
      };
    }), this.connecting);
  }
  scheduleReconnect() {
    if (this.streamHandlers.size === 0 && this.pending.size === 0) return;
    window.clearTimeout(this.retryTimer), this.endpointIndex += 1, this.attempt += 1;
    const t = Math.min(gt, 1e3 * 2 ** Math.min(this.attempt - 1, 4));
    this.retryTimer = window.setTimeout(() => {
      this.ensureSocket().catch(() => {
      });
    }, t);
  }
  handleMessage(t) {
    let n;
    try {
      n = JSON.parse(String(t.data));
    } catch {
      return;
    }
    if (n.type === "response" && typeof n.id == "number") {
      const s = this.pending.get(n.id);
      if (!s) return;
      if (window.clearTimeout(s.timer), this.pending.delete(n.id), n.status === "error") {
        s.reject(
          new A(
            String(n.error_message ?? n.error ?? "Ledger error"),
            String(n.error ?? "")
          )
        );
        return;
      }
      s.resolve(n.result ?? {});
      return;
    }
    if (n.type === "ledgerClosed" || n.type === "transaction")
      for (const s of this.streamHandlers) s(n);
  }
  /** Issue a rippled command and await its response. */
  async request(t, n = {}) {
    const s = await this.ensureSocket(), a = this.nextId++, r = performance.now();
    return new Promise((o, i) => {
      const c = window.setTimeout(() => {
        this.pending.delete(a), i(new A(`Timed out: ${t}`));
      }, he);
      this.pending.set(a, {
        resolve: (d) => {
          this.latencyMs = Math.max(1, Math.round(performance.now() - r)), o(d);
        },
        reject: i,
        timer: c
      });
      try {
        s.send(JSON.stringify({ id: a, command: t, ...n }));
      } catch (d) {
        window.clearTimeout(c), this.pending.delete(a), i(d instanceof Error ? d : new Error(String(d)));
      }
    });
  }
}
const pt = new ft();
async function b(e, t = {}) {
  return pt.request(e, t);
}
async function mt() {
  const [e, t] = await Promise.all([
    b("ledger", { ledger_index: "validated", transactions: !1, expand: !1 }),
    b("fee").catch(() => ({}))
  ]), n = e.ledger ?? {};
  return {
    ledgerIndex: Number(n.ledger_index ?? e.ledger_index ?? 0),
    ledgerHash: String(n.ledger_hash ?? ""),
    closeTime: Be(Number(n.close_time ?? 0)).toLocaleString(),
    validated: !!(e.validated ?? !1),
    baseFeeXrp: K(Number(t.drops?.base_fee ?? 10)),
    openLedgerFeeXrp: K(Number(t.drops?.open_ledger_fee ?? 10)),
    queueSize: Number(t.current_queue_size ?? 0),
    txnCount: Number(n.transactions?.length ?? 0)
  };
}
function Y(e) {
  try {
    if (!e) return;
    const t = Uint8Array.from(
      e.match(/.{2}/g)?.map((s) => parseInt(s, 16)) ?? []
    ), n = new TextDecoder().decode(t).trim();
    return n.length > 0 ? n : void 0;
  } catch {
    return;
  }
}
function yt(e) {
  return { address: e, balanceXrp: "0.00", sequence: 0, ownerCount: 0, unfunded: !0 };
}
async function wt(e) {
  try {
    const n = (await b("account_info", {
      account: e,
      ledger_index: "validated"
    })).account_data ?? {};
    return {
      address: e,
      balanceXrp: (Number(n.Balance ?? 0) / 1e6).toFixed(2),
      sequence: Number(n.Sequence ?? 0),
      ownerCount: Number(n.OwnerCount ?? 0),
      domain: Y(String(n.Domain ?? ""))
    };
  } catch (t) {
    if (t instanceof A && t.code === "actNotFound") return yt(e);
    throw t instanceof A && t.code === "actMalformed" ? new A(
      "Address failed its base58 checksum — check for a mistyped character.",
      "actMalformed"
    ) : t;
  }
}
async function bt(e) {
  return ((await b("account_objects", {
    account: e,
    ledger_index: "validated",
    type: "credential",
    limit: 100
  })).account_objects ?? []).map((s) => ({
    subject: String(s.Subject ?? ""),
    issuer: String(s.Issuer ?? ""),
    credentialType: Y(String(s.CredentialType ?? "")) ?? String(s.CredentialType ?? "UNKNOWN"),
    // XLS-70 marks acceptance with the lsfAccepted flag (0x00010000).
    accepted: (Number(s.Flags ?? 0) & 65536) !== 0,
    revoked: !!(s.Revoked ?? !1),
    uri: s.URI ? Y(String(s.URI)) : void 0,
    expiration: s.Expiration ? Number(s.Expiration) : void 0
  }));
}
async function vt(e, t = 40) {
  try {
    return ((await b("account_tx", {
      account: e,
      ledger_index_min: -1,
      ledger_index_max: -1,
      binary: !1,
      forward: !1,
      limit: t
    })).transactions ?? []).map((a) => {
      const r = a.tx ?? a.tx_json ?? {}, o = a.meta ?? {}, i = o.delivered_amount ?? o.DeliveredAmount, c = typeof i == "string" ? Number(K(i)) : void 0, d = String(r.Account ?? ""), l = String(r.Destination ?? ""), u = d === e ? "out" : l === e ? "in" : "cross", g = Be(Number(r.date ?? 0));
      return {
        hash: String(r.hash ?? a.hash ?? ""),
        transactionType: String(r.TransactionType ?? "UNKNOWN"),
        result: String(o.TransactionResult ?? "—"),
        ledgerIndex: Number(a.ledger_index ?? r.ledger_index ?? 0),
        date: g.toLocaleString(),
        timestamp: g.getTime(),
        direction: u,
        counterparty: u === "out" ? l || "—" : d || "—",
        amountXrp: c,
        feeXrp: K(String(r.Fee ?? "0"))
      };
    });
  } catch (n) {
    if (n instanceof A && n.code === "actNotFound") return [];
    throw n;
  }
}
function kt(e) {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(e.trim());
}
const St = 262144, Tt = 4194304, $t = 2097152, At = 1048576;
async function _t(e) {
  try {
    return ((await b("account_lines", {
      account: e,
      ledger_index: "validated",
      limit: 200
    })).lines ?? []).map((s) => ({
      issuer: String(s.account ?? ""),
      currency: String(s.currency ?? ""),
      balance: Number(s.balance ?? 0),
      limit: Number(s.limit ?? 0),
      frozen: !!s.freeze,
      frozenByIssuer: !!s.freeze_peer,
      // XLS-77. account_lines reports these directly once DeepFreeze is
      // enabled; on a network without it they are simply absent.
      deepFrozen: !!s.deep_freeze,
      deepFrozenByIssuer: !!s.deep_freeze_peer,
      noRipple: !!s.no_ripple,
      authorized: !!(s.peer_authorized ?? s.authorized ?? !1),
      requiresAuth: !1
      // resolved from the issuer's own flags below
    }));
  } catch (t) {
    if (t instanceof A && t.code === "actNotFound") return [];
    throw t;
  }
}
async function We(e) {
  try {
    const n = (await b("account_info", {
      account: e,
      ledger_index: "validated"
    })).account_data ?? {}, s = Number(n.Flags ?? 0), a = Number(n.TransferRate ?? 0), r = a > 1e9 ? Math.round((a - 1e9) / 1e9 * 1e4) : 0;
    return {
      address: e,
      domain: Y(String(n.Domain ?? "")),
      noFreeze: (s & $t) !== 0,
      globalFreeze: (s & Tt) !== 0,
      requireAuth: (s & St) !== 0,
      masterDisabled: (s & At) !== 0,
      transferRateBps: r
    };
  } catch (t) {
    return {
      address: e,
      noFreeze: !1,
      globalFreeze: !1,
      requireAuth: !1,
      masterDisabled: !1,
      transferRateBps: 0,
      unreadable: t instanceof Error ? t.message : "Unreadable"
    };
  }
}
async function xt(e) {
  try {
    const t = await b("gateway_balances", {
      account: e,
      ledger_index: "validated"
    }), n = t.obligations ?? {}, s = {};
    for (const [a, r] of Object.entries(n)) {
      const o = Number(r);
      Number.isFinite(o) && (s[a] = o);
    }
    return {
      issuer: e,
      obligations: s,
      ledgerIndex: Number(t.ledger_index ?? 0)
    };
  } catch (t) {
    return {
      issuer: e,
      obligations: {},
      ledgerIndex: 0,
      unreadable: t instanceof Error ? t.message : "unreadable"
    };
  }
}
const Nt = "https://xiurbiwuwcfowqnpmwki.supabase.co", It = `${Nt}/functions/v1`, ge = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
async function Ge(e, t) {
  const n = [...new Set(e.filter((s) => ge.test(s)))].slice(0, 50);
  if (n.length === 0) return { hits: {}, listAsOf: null, listed: 0 };
  try {
    const s = await fetch(`${It}/noshashi-xrpl-watch/sanctions?addresses=${n.join(",")}`, {
      signal: t ?? AbortSignal.timeout(8e3)
    });
    if (!s.ok) return null;
    const a = await s.json(), r = {};
    for (const o of a.hits ?? []) ge.test(o.address) && (r[o.address] = o);
    return { hits: r, listAsOf: a.list_as_of ?? null, listed: Number(a.listed ?? 0) };
  } catch {
    return null;
  }
}
function Et(e, t) {
  if (t === void 0) return null;
  if (t === null)
    return {
      id: "sanctions-unchecked",
      severity: "info",
      title: "Sanctions list not checked",
      detail: "The OFAC SDN list could not be read just now, so this check says nothing about sanctions. Check again before paying."
    };
  const n = t.hits[e], s = t.listAsOf ? ` as of ${t.listAsOf.slice(0, 10)}` : "";
  return n ? {
    id: "sanctioned",
    severity: "critical",
    title: `On the ${n.list} sanctions list: ${n.entityName}`,
    detail: `The US Treasury lists this exact address under ${n.entityName}${n.entityNumber ? ` (entry ${n.entityNumber}` : " ("}${n.program ? `, program ${n.program}` : ""})${s}. Source: ${n.sourceUrl}`,
    action: "Do not pay it or accept funds from it. US persons are generally prohibited from dealing with listed parties; take legal advice."
  } : {
    id: "not-sanctioned",
    severity: "ok",
    title: "Not on the OFAC SDN list",
    detail: `This address is not among the ${t.listed.toLocaleString("en-US")} XRP addresses the US Treasury lists${s}. The list names only addresses OFAC has published; not being on it is not a clearance.`
  };
}
function Q(e, t) {
  const n = Et(e.address, t);
  if (!n) return e;
  const s = [n, ...e.findings], a = t?.hits[e.address], r = a ? "avoid" : e.verdict;
  return {
    ...e,
    findings: n.severity === "ok" ? [...e.findings, n] : s,
    verdict: r,
    headline: a ? B.avoid.label : e.headline,
    sanction: a,
    sanctionsChecked: t !== null,
    sanctionsAsOf: t?.listAsOf ?? null
  };
}
const B = {
  clear: {
    label: "NOTHING RECORDED AGAINST IT",
    blurb: "The ledger publishes nothing that would stop you. That is not the same as a recommendation."
  },
  caution: {
    label: "THINGS TO KNOW FIRST",
    blurb: "The ledger publishes facts here you should read before you pay."
  },
  avoid: {
    label: "SERIOUS SIGNALS",
    blurb: "The ledger publishes something that would cost you money or control."
  },
  unknown: {
    label: "NOT READABLE",
    blurb: "This address could not be read, so nothing about it is being asserted."
  }
}, Ot = 60;
async function Ft(e) {
  const t = e.trim(), n = {
    address: t,
    verdict: "unknown",
    headline: B.unknown.label,
    findings: [],
    exists: !1,
    funded: !1,
    balanceXrp: 0,
    activityCount: 0,
    isIssuer: !1,
    issuedCurrencies: [],
    credentials: [],
    sanctionsChecked: !1,
    ledgerIndex: 0,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (!kt(t))
    return {
      ...n,
      findings: [
        {
          id: "malformed",
          severity: "critical",
          title: "That is not a valid XRPL address",
          detail: "An XRP Ledger address starts with r and is 25–35 characters. Check for a missing character or a copy that picked up whitespace.",
          action: "Re-copy the address from its original source, not from a message."
        }
      ],
      headline: "NOT A VALID ADDRESS"
    };
  const [s, a] = await Promise.all([wt(t).catch(() => null), Ge([t])]);
  if (!s)
    return a?.hits[t] ? Q(n, a) : n;
  if (s.unfunded)
    return Q({
      ...n,
      exists: !0,
      funded: !1,
      domain: s.domain,
      verdict: "caution",
      headline: B.caution.label,
      findings: [
        {
          id: "unfunded",
          severity: "warn",
          title: "This address has never been funded",
          detail: "It is well-formed but does not exist on the ledger yet. Nobody has ever activated it with the base reserve, so it has no history at all.",
          action: "If someone gave you this address as a shop or a payee, confirm it with them another way first."
        }
      ]
    }, a);
  const [r, o, i] = await Promise.all([
    bt(t).catch(() => []),
    _t(t).catch(() => []),
    vt(t, Ot).catch(() => [])
  ]), c = await xt(t).catch(() => null), u = Object.keys(c?.obligations ?? {}).length > 0 ? await We(t).catch(() => {
  }) : void 0;
  return Q(
    Rt({
      address: t,
      account: s,
      credentials: r,
      lines: o,
      transactions: i,
      obligations: c,
      posture: u
    }),
    a
  );
}
function Rt(e) {
  const { address: t, account: n, credentials: s, lines: a, transactions: r, obligations: o, posture: i } = e, c = Object.keys(o?.obligations ?? {}), d = c.length > 0, l = [];
  if (n.domain ? l.push({
    id: "domain",
    severity: "info",
    title: `Claims the domain ${n.domain}`,
    detail: "An account can write any domain it likes into this field. It becomes meaningful only when that domain publishes a matching xrp-ledger.toml naming this address back.",
    action: `Open https://${n.domain}/.well-known/xrp-ledger.toml and confirm this address is listed.`
  }) : l.push({
    id: "no-domain",
    severity: "info",
    title: "Claims no domain",
    detail: "The account has not published a domain, so there is no website to check it against. Common for personal wallets, unusual for a business asking to be paid."
  }), s.length > 0) {
    const m = s.filter((y) => y.accepted && !y.revoked);
    l.push({
      id: "credentials",
      severity: m.length > 0 ? "ok" : "warn",
      title: m.length > 0 ? `Holds ${m.length} accepted credential${m.length === 1 ? "" : "s"}` : "Holds credentials, but none currently valid",
      detail: m.length > 0 ? `Someone has attested to this account on-ledger: ${m.map((y) => y.credentialType).join(", ")}. The attestation is only worth as much as the issuer behind it.` : "Every credential attached to this account is either unaccepted or revoked."
    });
  }
  d && i && (i.globalFreeze && l.push({
    id: "global-freeze",
    severity: "critical",
    title: "This issuer has frozen everything it issued",
    detail: "lsfGlobalFreeze is set. Every balance of every currency this account issues is immobilised right now — holders cannot send or redeem.",
    action: "Do not buy this issuer's tokens while this flag stands."
  }), i.noFreeze ? l.push({
    id: "no-freeze",
    severity: "ok",
    title: "This issuer has permanently given up the right to freeze",
    detail: "lsfNoFreeze is set and cannot be undone. It can never immobilise a holder's balance."
  }) : i.globalFreeze || l.push({
    id: "can-freeze",
    severity: "warn",
    title: "This issuer can freeze your balance at any time",
    detail: "lsfNoFreeze is not set, so the issuer retains the right to immobilise what it issued — yours included — in a single transaction, without warning.",
    action: "Hold only what you would accept losing access to."
  }), i.transferRateBps > 0 && l.push({
    id: "transfer-fee",
    severity: "warn",
    title: `Charges ${i.transferRateBps} basis points to transfer`,
    detail: `Moving this issuer's token costs ${(i.transferRateBps / 100).toFixed(2)}%, taken by the issuer. It is not refundable and it applies every time the token changes hands.`
  }), i.requireAuth && l.push({
    id: "require-auth",
    severity: "info",
    title: "Requires authorisation before you can hold it",
    detail: "You cannot receive this issuance until the issuer explicitly authorises your account. Expect an onboarding step."
  }), l.push({
    id: "supply",
    severity: "info",
    title: `Issues ${c.length} currenc${c.length === 1 ? "y" : "ies"}`,
    detail: `Outstanding: ${c.slice(0, 6).map((m) => `${m} ${Math.round(o?.obligations[m] ?? 0).toLocaleString()}`).join(" · ")}`
  }));
  const u = a.filter((m) => m.frozenByIssuer || m.deepFrozenByIssuer);
  u.length > 0 && l.push({
    id: "freezes-others",
    severity: "warn",
    title: `Has frozen ${u.length} counterpart${u.length === 1 ? "y" : "ies"}`,
    detail: "This account has used freeze against people it deals with. That may be entirely legitimate — a sanctions response, for instance — but it demonstrates both the willingness and the ability to do it."
  });
  const g = new Set(
    r.map((m) => m.counterparty).filter(Boolean)
  );
  r.length === 0 ? l.push({
    id: "no-history",
    severity: "warn",
    title: "No recent transaction history",
    detail: "The account is funded but nothing recent is visible. A shop asking for payment should have a trail."
  }) : l.push({
    id: "history",
    severity: "info",
    title: `${r.length} recent transactions across ${g.size} counterparties`,
    detail: g.size <= 2 ? "Almost all activity is with the same one or two addresses, which is unusual for a business." : "Activity is spread across a range of counterparties."
  });
  const f = l.reduce((m, y) => {
    const p = { critical: 3, warn: 2, info: 1, ok: 0 };
    return p[y.severity] > p[m] ? y.severity : m;
  }, "ok"), h = f === "critical" ? "avoid" : f === "warn" ? "caution" : "clear";
  return {
    address: t,
    verdict: h,
    headline: B[h].label,
    findings: l.sort((m, y) => {
      const p = { critical: 0, warn: 1, info: 2, ok: 3 };
      return p[m.severity] - p[y.severity];
    }),
    exists: !0,
    funded: !0,
    balanceXrp: Number(n.balanceXrp),
    domain: n.domain,
    activityCount: r.length,
    isIssuer: d,
    issuedCurrencies: c,
    posture: i,
    credentials: s,
    sanctionsChecked: !1,
    ledgerIndex: o?.ledgerIndex ?? 0,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const Pt = 946684800;
function fe(e) {
  return new Date((e + Pt) * 1e3);
}
const Ct = 1048576;
function Lt(e, t) {
  const n = e.map((a) => a.weight).sort((a, r) => r - a);
  let s = 0;
  for (let a = 0; a < n.length; a += 1)
    if (s += n[a], s >= t) return a + 1;
  return 1 / 0;
}
async function Ke(e) {
  const [t, n, s, a] = await Promise.all([
    b("account_info", { account: e, ledger_index: "validated" }),
    b("server_info").catch(() => ({})),
    b("account_objects", {
      account: e,
      type: "signer_list",
      ledger_index: "validated",
      limit: 10
    }).catch((p) => ({
      __unreadable: p instanceof Error ? p.message : String(p)
    })),
    b("account_objects", {
      account: e,
      type: "escrow",
      ledger_index: "validated",
      limit: 200
    }).catch(() => ({}))
  ]), r = t.account_data ?? {}, o = Number(r.Flags ?? 0), i = n.info?.validated_ledger ?? {}, c = (s.account_objects ?? [])[0], d = (c?.SignerEntries ?? []).map((p) => ({
    account: String(p.SignerEntry?.Account ?? ""),
    weight: Number(p.SignerEntry?.SignerWeight ?? 0)
  })).filter((p) => p.account), l = Number(c?.SignerQuorum ?? 0), u = d.reduce((p, T) => p + T.weight, 0), f = (a.account_objects ?? []).filter((p) => typeof p.Amount == "string").map((p) => ({
    amountXrp: Number(p.Amount) / 1e6,
    finishAfter: p.FinishAfter !== void 0 ? fe(Number(p.FinishAfter)).toISOString() : void 0,
    cancelAfter: p.CancelAfter !== void 0 ? fe(Number(p.CancelAfter)).toISOString() : void 0,
    destination: p.Destination ? String(p.Destination) : void 0
  })), h = Number(r.OwnerCount ?? 0), m = Number(i.reserve_base_xrp ?? 1), y = Number(i.reserve_inc_xrp ?? 0.2);
  return {
    address: e,
    masterKeyEnabled: (o & Ct) === 0,
    regularKey: r.RegularKey ? String(r.RegularKey) : void 0,
    signers: {
      present: d.length > 0,
      unreadable: s.__unreadable ? String(s.__unreadable) : void 0,
      quorum: l,
      signers: d,
      totalWeight: u,
      minimumSigners: d.length > 0 ? Lt(d, l) : 0,
      unilateralSigners: d.filter((p) => l > 0 && p.weight >= l).map((p) => p.account)
    },
    ownerCount: h,
    reserveBaseXrp: m,
    reserveIncrementXrp: y,
    reserveLockedXrp: m + h * y,
    balanceXrp: Number(r.Balance ?? 0) / 1e6,
    escrows: f,
    escrowedXrp: f.reduce((p, T) => p + T.amountXrp, 0),
    truncated: !!(a.marker || s.marker),
    ledgerIndex: Number(t.ledger_index ?? 0),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function Dt(e) {
  const t = [];
  if (e.masterKeyEnabled && !e.signers.present && t.push({
    id: "single-key",
    severity: "warn",
    title: "One key controls this account outright",
    detail: "The master key is enabled and no signer list is configured. Whoever holds that key can move the entire balance, alone, with no second approval and no record of anyone else agreeing.",
    action: "Configure a signer list, then disable the master key once you have confirmed the signers can transact."
  }), e.masterKeyEnabled && e.signers.present && t.push({
    id: "master-still-live",
    severity: "critical",
    title: "The signer list can be bypassed",
    detail: "A signer list is configured, but the master key is still enabled — so the quorum is optional. Anyone holding the master key can sign alone and the approval workflow is decorative.",
    action: "Disable the master key (lsfDisableMaster) so the quorum actually binds."
  }), !e.masterKeyEnabled && !e.signers.present && t.push({
    id: "no-signer-path",
    severity: "critical",
    title: "No key and no signer list",
    detail: "The master key is disabled and no signer list is present. Unless a regular key is set, nothing can sign for this account and the balance is unreachable.",
    action: "Verify a regular key exists before relying on this account."
  }), e.signers.present) {
    const { quorum: a, totalWeight: r, minimumSigners: o, signers: i, unilateralSigners: c } = e.signers;
    o === 1 / 0 ? t.push({
      id: "quorum-unreachable",
      severity: "critical",
      title: "Quorum can never be met",
      detail: `Quorum is ${a} but the signers' weights total only ${r}. No combination of the configured signers can authorise a transaction.`,
      action: "Lower the quorum or add weight before this account needs to move."
    }) : o === 1 ? t.push({
      id: "effective-single",
      severity: "critical",
      title: `${i.length} signers, but one can act alone`,
      detail: `Quorum is ${a} and at least one signer carries that weight by themselves${c.length ? ` (${c.length} of them can)` : ""}. XRPL compares quorum against the sum of signing weights, not a count of signers, so this list provides no second approval in practice.`,
      action: "Rebalance the weights so no single signer reaches quorum unaided."
    }) : t.push({
      id: "quorum-ok",
      severity: "ok",
      title: `Requires at least ${o} of ${i.length} signers`,
      detail: `Quorum ${a} against a total weight of ${r}. Taking the heaviest signers first, ${o} must agree before anything moves.`
    });
  }
  const n = e.balanceXrp - e.reserveLockedXrp - e.escrowedXrp;
  if (t.push({
    id: "reserve",
    severity: "info",
    title: `${e.reserveLockedXrp.toLocaleString(void 0, { maximumFractionDigits: 1 })} XRP locked by reserve`,
    detail: `${e.reserveBaseXrp} XRP base plus ${e.ownerCount.toLocaleString()} owned objects at ${e.reserveIncrementXrp} XRP each. This is not spendable while those objects exist — every trust line, offer and escrow adds to it.`
  }), e.escrows.length > 0) {
    const a = e.escrows.filter((r) => r.finishAfter).sort((r, o) => r.finishAfter < o.finishAfter ? -1 : 1)[0];
    t.push({
      id: "escrow",
      severity: "info",
      title: `${e.escrowedXrp.toLocaleString(void 0, { maximumFractionDigits: 2 })} XRP held in ${e.escrows.length} escrow${e.escrows.length === 1 ? "" : "s"}`,
      detail: a?.finishAfter ? `The earliest releases on ${new Date(a.finishAfter).toISOString().slice(0, 10)}. Escrowed XRP is committed and cannot be redirected before then.` : "None of these carry a finish time, so release depends on their conditions being met."
    });
  }
  n < 0 && t.push({
    id: "under-reserve",
    severity: "critical",
    title: "Balance is below the reserve requirement",
    detail: `Holding ${e.balanceXrp.toLocaleString(void 0, { maximumFractionDigits: 2 })} XRP against ${(e.reserveLockedXrp + e.escrowedXrp).toLocaleString(void 0, { maximumFractionDigits: 2 })} XRP of reserve and escrow. The account cannot create new objects and may be unable to transact.`,
    action: "Fund the account or remove owned objects to release reserve."
  }), e.truncated ? t.push({
    id: "truncated",
    severity: "warn",
    title: "This reading is incomplete",
    detail: "The ledger returned more objects than a single page. Totals above are a floor, not a total, and the account may hold escrows this reading did not reach.",
    action: "Re-run against a node that will return the full object set before relying on these figures."
  }) : e.escrows.length === 0 && t.push({
    id: "no-escrow",
    severity: "info",
    title: "No XRP escrows found",
    detail: "Nothing in the pages read. That is an absence of evidence rather than evidence of absence — it means none were returned, not that none can exist."
  });
  const s = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((a, r) => s[a.severity] - s[r.severity]);
}
const Ye = 946684800, Ht = 32570, pe = 10;
function qt(e, t) {
  const n = [];
  for (const s of e) {
    const a = s.tx_json ?? s.tx ?? s;
    if (a.Account !== t) continue;
    const r = Number(s.ledger_index ?? a.ledger_index ?? 0), o = Number(a.date), i = Number.isFinite(o) ? new Date((o + Ye) * 1e3) : void 0;
    if (a.TransactionType === "SetRegularKey") {
      const c = !!a.RegularKey;
      n.push({
        ledgerIndex: r,
        at: i,
        kind: c ? "regular-key-set" : "regular-key-removed",
        label: c ? "A regular key was assigned — a second key able to sign" : "The regular key was removed"
      });
    } else if (a.TransactionType === "SignerListSet") {
      const c = Number(a.SignerQuorum ?? 0) === 0;
      n.push({
        ledgerIndex: r,
        at: i,
        kind: c ? "signer-list-removed" : "signer-list-set",
        label: c ? "The signer list was deleted — multi-party approval ended" : "A signer list was configured or replaced"
      });
    } else a.TransactionType === "AccountSet" && (Number(a.SetFlag) === 4 ? n.push({
      ledgerIndex: r,
      at: i,
      kind: "master-key-disabled",
      label: "The master key was disabled"
    }) : Number(a.ClearFlag) === 4 && n.push({
      ledgerIndex: r,
      at: i,
      kind: "master-key-enabled",
      label: "The master key was re-enabled"
    }));
  }
  return n.sort((s, a) => s.ledgerIndex - a.ledgerIndex);
}
function Xt(e, t) {
  return e >= t ? e - t : Math.max(0, e - 1);
}
async function zt(e) {
  let t;
  try {
    t = await b("account_info", { account: e, ledger_index: "validated" });
  } catch (v) {
    throw v instanceof A && v.code === "actNotFound" ? new Error(
      "That address is not funded, so no account exists for it yet. An XRPL address only becomes an account once someone sends it enough XRP to meet the reserve — until then it has no history to read."
    ) : v instanceof A && v.code === "actMalformed" ? new Error("That is not a well-formed XRPL address.") : v;
  }
  const n = t.account_data ?? {}, s = Number(n.Sequence ?? 0);
  let a;
  try {
    const v = await b("server_info", {}), _ = String(v.info?.complete_ledgers ?? ""), x = Number(_.split("-")[0]);
    Number.isFinite(x) && (a = x);
  } catch {
  }
  let r;
  const o = [];
  let i = !1, c;
  for (let v = 0; v < pe; v += 1) {
    let _;
    try {
      _ = await b("account_tx", {
        account: e,
        ledger_index_min: -1,
        ledger_index_max: -1,
        binary: !1,
        forward: !0,
        limit: 200,
        ...c ? { marker: c } : {}
      });
    } catch {
      v > 0 && (i = !0);
      break;
    }
    const x = _.transactions ?? [];
    if (r || (r = x[0]), o.push(...x), c = _.marker, !c) break;
    v === pe - 1 && (i = !0);
  }
  const d = r?.tx_json ?? r?.tx ?? {}, l = Number(r?.ledger_index ?? d.ledger_index ?? 0) || void 0, u = Number(d.date), g = Number.isFinite(u) ? new Date((u + Ye) * 1e3) : void 0, f = d.TransactionType ? String(d.TransactionType) : void 0, h = f === "Payment" && d.Destination === e && d.Account !== e, m = h ? String(d.Account) : void 0, y = d.Amount ?? d.DeliverMax, p = h && typeof y == "string" ? Number(y) / 1e6 : void 0, T = l === void 0 ? void 0 : Xt(s, l), w = l !== void 0 && a !== void 0 && a > Ht && l <= a, k = g ? Math.floor((Date.now() - g.getTime()) / 864e5) : void 0;
  return {
    address: e,
    balanceXrp: Number(n.Balance ?? 0) / 1e6,
    ownerCount: Number(n.OwnerCount ?? 0),
    sequence: s,
    originLedger: l,
    originDate: g,
    fundedBy: m,
    fundingAmountXrp: p,
    originType: f,
    approxSentCount: T,
    historyIncomplete: w,
    nodeHistoryFrom: a,
    ageDays: k,
    lastActivityLedger: Number(n.PreviousTxnLgrSeq ?? 0) || void 0,
    controlEvents: qt(o, e),
    controlHistoryPartial: i,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const Ut = 30, Mt = 365;
function jt(e) {
  const t = [];
  if (e.historyIncomplete ? t.push({
    id: "history-incomplete",
    severity: "warn",
    title: "This account may be older than it appears",
    detail: `The earliest transaction found sits at ledger ${e.originLedger?.toLocaleString()}, which is the edge of what this node retains (from ${e.nodeHistoryFrom?.toLocaleString()}). Anything before that is not missing from the ledger, only from this node — so the age below is a floor, not a measurement.`,
    action: "Query a full-history node before treating the age as established."
  }) : e.originDate && e.ageDays !== void 0 && (e.ageDays < Ut ? t.push({
    id: "young-account",
    severity: "warn",
    title: `This account is ${e.ageDays} day${e.ageDays === 1 ? "" : "s"} old`,
    detail: `First seen ${e.originDate.toISOString().slice(0, 10)}. An account this new has no track record — nothing about its history can corroborate or contradict what its operator tells you.`,
    action: "Weight the counterparty's off-ledger identity accordingly."
  }) : e.ageDays >= Mt ? t.push({
    id: "established",
    severity: "ok",
    title: `Continuously on the ledger for ${(e.ageDays / 365).toFixed(1)} years`,
    detail: `First seen ${e.originDate.toISOString().slice(0, 10)} at ledger ${e.originLedger?.toLocaleString()}. A record of this length is difficult to manufacture after the fact.`
  }) : t.push({
    id: "moderate-age",
    severity: "info",
    title: `On the ledger for ${e.ageDays.toLocaleString()} days`,
    detail: `First seen ${e.originDate.toISOString().slice(0, 10)}.`
  })), e.fundedBy ? t.push({
    id: "funding-source",
    severity: "info",
    title: `Funded by ${e.fundedBy}`,
    detail: `The first inbound payment was ${e.fundingAmountXrp?.toLocaleString(void 0, { maximumFractionDigits: 6 }) ?? "an amount"} XRP from that account. Whoever funded an address is the strongest on-ledger link it has to anyone, because it cannot be undone or edited afterwards.`,
    action: "Run that funding account through this same screen."
  }) : e.originType && t.push({
    id: "origin-not-payment",
    severity: "info",
    title: `The earliest record is ${/^[AEIOU]/i.test(e.originType) ? "an" : "a"} ${e.originType}, not a payment in`,
    detail: "No inbound funding payment appears at the start of this account's history, so no funding counterparty can be named from it. That is an absence of evidence, not evidence of an absence."
  }), e.approxSentCount !== void 0 && e.originLedger !== void 0) {
    const s = e.sequence >= e.originLedger;
    t.push({
      id: "activity",
      severity: "info",
      title: `Approximately ${e.approxSentCount.toLocaleString()} transactions sent`,
      detail: s ? `The account's sequence number reads ${e.sequence.toLocaleString()}, but that is not a count. Accounts created after the DeletableAccounts amendment have their sequence seeded to the ledger index they were created at (${e.originLedger.toLocaleString()} here), so the number of transactions actually sent is the difference — roughly ${e.approxSentCount.toLocaleString()}.` : `This account predates sequence seeding, so its sequence of ${e.sequence.toLocaleString()} does count upward from one.`
    });
  }
  if (e.controlEvents.length === 0)
    t.push({
      id: "control-stable",
      severity: "ok",
      title: "No change of signing authority found",
      detail: e.controlHistoryPartial ? "Nothing in the history read, but the walk did not reach the present — this is what was seen, not a guarantee that nothing happened." : "Across the account's readable history, no regular key was assigned, no signer list was configured or removed, and the master key was never disabled or re-enabled. Whoever controlled it at the start controls it now."
    });
  else {
    const s = e.controlEvents[e.controlEvents.length - 1], a = s.at ? Math.floor((Date.now() - s.at.getTime()) / 864e5) : void 0, r = a !== void 0 && a <= 30 && e.ageDays !== void 0 && e.ageDays > 365;
    t.push({
      id: "control-changed",
      severity: r ? "warn" : "info",
      title: `Signing authority changed ${e.controlEvents.length} time${e.controlEvents.length === 1 ? "" : "s"}`,
      detail: `Most recently: ${s.label.toLowerCase()}${s.at ? ` on ${s.at.toISOString().slice(0, 10)}` : ""}, at ledger ${s.ledgerIndex.toLocaleString()}.` + (r ? ` This account is ${(e.ageDays / 365).toFixed(1)} years old and its control moved ${a} day${a === 1 ? "" : "s"} ago. A long-established account whose signing authority changes suddenly is the shape a compromised key takes — and equally the shape of an ordinary key rotation.` : " Changing keys is routine hygiene; what matters is whether the operator expected it."),
      action: r ? "Confirm with the operator, through a channel that does not depend on this account, that they made this change." : void 0
    }), e.controlEvents.filter(
      (i) => i.kind === "signer-list-removed" || i.kind === "master-key-enabled"
    ).length > 0 && t.push({
      id: "control-weakened",
      severity: "warn",
      title: "Approval requirements were removed at some point",
      detail: "The history contains a signer list being deleted or a master key being re-enabled. Both reduce the number of parties needed to move funds, which is the opposite direction from ordinary hardening."
    });
  }
  e.ownerCount === 0 && e.balanceXrp > 0 && t.push({
    id: "no-objects",
    severity: "info",
    title: "The account holds no trust lines, offers or escrows",
    detail: `It carries ${e.balanceXrp.toLocaleString(void 0, { maximumFractionDigits: 6 })} XRP and nothing else. An address used purely to hold and move XRP looks like this; so does a freshly prepared one.`
  });
  const n = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((s, a) => n[s.severity] - n[a.severity]);
}
const Bt = 946684800, Wt = 0.5, Gt = 0.25, W = (e) => typeof e == "string" ? Number(e) / 1e6 : e && typeof e == "object" ? Number(e.value ?? 0) : 0;
function me(e, t, n) {
  const s = [];
  for (const o of e) {
    const i = W(o.TakerGets), c = W(o.TakerPays);
    if (i <= 0 || c <= 0) continue;
    const d = o.taker_gets_funded !== void 0 ? W(o.taker_gets_funded) : i, l = o.taker_pays_funded !== void 0 ? W(o.taker_pays_funded) : c, u = n ? i / c : c / i;
    if (!Number.isFinite(u) || u <= 0) continue;
    const g = n ? c : i, f = n ? l : d, h = Number.isFinite(f) ? Math.max(0, Math.min(f, g)) : 0, m = o.Expiration !== void 0 && Number(o.Expiration) < t;
    s.push({
      account: String(o.Account ?? ""),
      listed: g,
      fundable: m ? 0 : h,
      price: u,
      dead: m || h <= 0,
      expired: m
    });
  }
  s.sort((o, i) => n ? i.price - o.price : o.price - i.price);
  const a = s.reduce((o, i) => o + i.listed, 0), r = s.reduce((o, i) => o + i.fundable, 0);
  return {
    offers: s,
    listedDepth: a,
    fundableDepth: r,
    fundedRatio: a > 0 ? r / a : 1,
    deadOffers: s.filter((o) => o.dead).length,
    bestPrice: s.find((o) => !o.dead)?.price
  };
}
async function Kt(e, t, n = 100) {
  const s = { currency: e, issuer: t }, [a, r, o] = await Promise.all([
    // Bids: someone paying XRP to receive the issued asset.
    b("book_offers", {
      taker_gets: { currency: "XRP" },
      taker_pays: s,
      ledger_index: "validated",
      limit: n
    }),
    // Asks: someone paying the issued asset to receive XRP.
    b("book_offers", {
      taker_gets: s,
      taker_pays: { currency: "XRP" },
      ledger_index: "validated",
      limit: n
    }),
    b("ledger", { ledger_index: "validated" })
  ]), i = Number(o.ledger?.close_time ?? 0), c = me(a.offers ?? [], i, !0), d = me(r.offers ?? [], i, !1), l = /* @__PURE__ */ new Map();
  for (const f of [...c.offers, ...d.offers])
    l.set(f.account, (l.get(f.account) ?? 0) + f.listed);
  const u = c.listedDepth + d.listedDepth, g = [...l.entries()].sort((f, h) => h[1] - f[1]);
  return {
    pair: `${e}/XRP`,
    currency: e,
    issuer: t,
    bids: c,
    asks: d,
    makers: l.size,
    topMakerShare: u > 0 && g[0] ? g[0][1] / u : 0,
    topMaker: g[0]?.[0],
    ledgerIndex: Number(o.ledger_index ?? o.ledger?.ledger_index ?? 0),
    ledgerCloseTime: new Date((i + Bt) * 1e3),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function Yt(e) {
  const t = [], n = (c) => `${(c * 100).toFixed(1)}%`, s = (c) => c.toLocaleString(void 0, { maximumFractionDigits: 2 });
  for (const [c, d] of [
    ["Asks", e.asks],
    ["Bids", e.bids]
  ]) {
    if (d.offers.length === 0) {
      t.push({
        id: `empty-${c}`,
        severity: "warn",
        title: `Nothing resting on the ${c.toLowerCase()} side`,
        detail: "No offers at all. There is no price here to trade against, whatever a chart elsewhere may show."
      });
      continue;
    }
    const l = 1 - d.fundedRatio;
    d.fundedRatio < Wt ? t.push({
      id: `phantom-${c}`,
      severity: l > 0.9 ? "critical" : "warn",
      title: `${n(l)} of ${c.toLowerCase()} depth cannot fill`,
      detail: `The book advertises ${s(d.listedDepth)} but only ${s(d.fundableDepth)} is backed by an owner who still holds it. ${d.deadOffers} of ${d.offers.length} offers can deliver nothing at all. An offer rests whether or not its owner kept the funds, and nothing removes it until someone tries to cross it.`,
      action: "Size against the fundable figure. The advertised depth is what you would be quoted and not what you would receive."
    }) : t.push({
      id: `funded-${c}`,
      severity: "ok",
      title: `${c} are ${n(d.fundedRatio)} funded`,
      detail: `${s(d.fundableDepth)} of ${s(d.listedDepth)} advertised is backed by owners who still hold it.`
    });
  }
  e.topMakerShare >= Gt && e.topMaker && t.push({
    id: "maker-concentration",
    severity: e.topMakerShare >= 0.5 ? "warn" : "info",
    title: `One account rests ${n(e.topMakerShare)} of the quoted depth`,
    detail: `${e.topMaker} accounts for that share of everything listed across both sides, among ${e.makers} makers in total. A book carried by one participant moves when they change their mind, not when the market does.`,
    action: "Check whether that account's offers are the ones that are funded."
  });
  const a = [...e.bids.offers, ...e.asks.offers].filter((c) => c.expired);
  a.length > 0 && t.push({
    id: "expired",
    severity: "info",
    title: `${a.length} offer${a.length === 1 ? "" : "s"} already past expiry`,
    detail: "These carry an expiration the current ledger has passed. They still occupy the book because nothing has tried to cross them, and they are excluded from the fundable figures above."
  });
  const r = e.bids.bestPrice, o = e.asks.bestPrice;
  if (r !== void 0 && o !== void 0)
    if (r >= o)
      t.push({
        id: "crossed",
        severity: "warn",
        title: "The fundable touch is crossed",
        detail: `Best fundable bid ${r.toFixed(6)} is at or above best fundable ask ${o.toFixed(6)}. On a live book this resolves in moments, so it usually means the read caught a moment mid-cross rather than a standing arbitrage.`
      });
    else {
      const c = o - r;
      t.push({
        id: "spread",
        severity: "info",
        title: `Fundable spread ${(c / o * 100).toFixed(2)}%`,
        detail: `Between ${r.toFixed(6)} and ${o.toFixed(6)}, measured on offers that can actually fill. A spread taken from the advertised touch would be narrower and would not be tradeable.`
      });
    }
  const i = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((c, d) => i[c.severity] - i[d.severity]);
}
const Vt = 131072;
function ye(e) {
  if (typeof e == "string") {
    const t = Number(e);
    return Number.isFinite(t) ? { kind: "xrp", drops: t, value: t / 1e6 } : void 0;
  }
  if (e && typeof e == "object") {
    const t = e, n = Number(t.value);
    return Number.isFinite(n) ? {
      kind: "iou",
      currency: String(t.currency ?? ""),
      issuer: String(t.issuer ?? ""),
      value: n
    } : void 0;
  }
}
function G(e) {
  if (e.kind === "xrp")
    return `${e.value.toLocaleString(void 0, { maximumFractionDigits: 6 })} XRP`;
  let t = e.currency;
  if (/^[0-9A-F]{40}$/i.test(t)) {
    const n = (t.match(/../g) ?? []).map((s) => String.fromCharCode(parseInt(s, 16))).join("").replace(/\0+$/, "").trim();
    n && /^[\x20-\x7E]+$/.test(n) && (t = n);
  }
  return `${e.value.toLocaleString(void 0, { maximumFractionDigits: 10 })} ${t}`;
}
function Jt(e, t) {
  return e.kind !== t.kind ? !1 : e.kind === "xrp" ? !0 : e.currency === t.currency && e.issuer === t.issuer;
}
async function Qt(e) {
  let t;
  try {
    t = await b("tx", { transaction: e.trim() });
  } catch (n) {
    throw n instanceof A && n.code === "txnNotFound" ? new Error(
      "No transaction with that hash is in this node's history. It may never have existed, or the node may not retain ledgers that far back."
    ) : n;
  }
  return Zt(t, e);
}
function Zt(e, t = "") {
  const n = e.tx_json ?? e, s = e.meta ?? e.metaData ?? {}, a = String(n.TransactionType ?? "unknown"), r = String(s.TransactionResult ?? "unknown"), o = Number(n.Flags ?? 0), i = a === "Payment" ? ye(n.DeliverMax ?? n.Amount) : void 0, c = s.delivered_amount ?? s.DeliveredAmount, d = c === "unavailable", l = d ? void 0 : ye(c);
  let u;
  return i && l && Jt(i, l) && i.value > 0 && (u = l.value / i.value), {
    hash: String(n.hash ?? e.hash ?? t),
    validated: e.validated === !0,
    transactionType: a,
    result: r,
    succeeded: r.startsWith("tes"),
    account: String(n.Account ?? ""),
    destination: n.Destination ? String(n.Destination) : void 0,
    ledgerIndex: Number(e.ledger_index ?? n.ledger_index ?? 0) || void 0,
    feeDrops: Number(n.Fee ?? 0),
    requested: i,
    delivered: l,
    deliveredUnavailable: d,
    partialFlagSet: (o & Vt) !== 0,
    deliveredFraction: u,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const we = 0.999999;
function en(e) {
  const t = [];
  if (e.validated || t.push({
    id: "not-validated",
    severity: "critical",
    title: "This transaction is not validated",
    detail: "The node returned it, but it is not in a validated ledger. Until it is, it can still fail or vanish, and nothing below describes a settled outcome.",
    action: "Do not credit anything against this transaction yet."
  }), !e.succeeded)
    return t.push({
      id: "failed",
      severity: "warn",
      title: `The transaction did not succeed (${e.result})`,
      detail: `Nothing was delivered. The ${(e.feeDrops / 1e6).toLocaleString(void 0, { maximumFractionDigits: 6 })} XRP fee was still burned — a failed transaction costs its sender the fee and changes no balances otherwise.`,
      action: "Treat this as a non-event for settlement, not as a pending one."
    }), t;
  if (e.transactionType !== "Payment")
    return t.push({
      id: "not-payment",
      severity: "info",
      title: `This is a ${e.transactionType}, not a Payment`,
      detail: "It carries no delivered amount because none applies. That absence is not a delivery of nothing — this transaction type does not move a payment balance at all."
    }), t;
  if (e.deliveredUnavailable)
    return t.push({
      id: "delivered-unavailable",
      severity: "warn",
      title: "The delivered amount was never recorded",
      detail: "The ledger returns `unavailable` for this payment, which happens in ledgers old enough to predate the field. What arrived is unknown — it is specifically not zero, and not the requested amount either.",
      action: "Reconstruct the movement from the affected balances in the metadata before crediting anything."
    }), t;
  if (e.partialFlagSet) {
    const s = e.deliveredFraction, a = s !== void 0 && s < we ? 1 / Math.max(s, Number.MIN_VALUE) : void 0;
    s !== void 0 && s < we ? t.push({
      id: "partial-shortfall",
      severity: "critical",
      title: `Only ${(s * 100).toFixed(4)}% of the requested amount arrived`,
      detail: `This payment is flagged tfPartialPayment and returned ${e.result}. It asked to deliver ${e.requested ? G(e.requested) : "—"} and actually delivered ${e.delivered ? G(e.delivered) : "—"}. Any system that credits the requested figure over-credits by roughly ${a && Number.isFinite(a) ? `${a.toFixed(0)}x` : "an unbounded factor"}.`,
      action: "Credit delivered_amount. The success code and the requested amount are both true and both irrelevant to what you received."
    }) : t.push({
      id: "partial-full",
      severity: "warn",
      title: "Partial payment permitted, but it delivered in full",
      detail: `The sender set tfPartialPayment, which allows the ledger to deliver less than requested. This time it delivered ${e.delivered ? G(e.delivered) : "—"}, the full requested amount. The flag is a property of the sender's instruction, not of this outcome.`,
      action: "The same sender can send less next time under the same flag. Read delivered_amount every time."
    });
  } else e.delivered && t.push({
    id: "settled",
    severity: "ok",
    title: `Settled in full — ${G(e.delivered)}`,
    detail: `The payment is validated, returned ${e.result}, and is not flagged for partial delivery. The requested and delivered amounts agree.`
  });
  e.destination && e.destination === e.account && t.push({
    id: "self-payment",
    severity: "info",
    title: "The sender and the destination are the same account",
    detail: "This is a payment to itself, which on XRPL is how a circular trade through the order books is executed. It is a trading operation rather than a transfer to a counterparty."
  });
  const n = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((s, a) => n[s.severity] - n[a.severity]);
}
const be = 1e5, Z = 1e3, Ve = 946684800;
function tn(e) {
  if (typeof e == "number" && Number.isFinite(e))
    return new Date((e + Ve) * 1e3);
  if (typeof e != "string" || e.length === 0) return null;
  const t = e.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"), n = new Date(t);
  return Number.isNaN(n.getTime()) ? null : n;
}
function ve(e) {
  if (!e || typeof e != "object") return "XRP";
  const n = String(e.currency ?? "XRP");
  if (n === "XRP") return "XRP";
  if (/^[0-9A-F]{40}$/i.test(n)) {
    const s = (n.match(/../g) ?? []).map((a) => String.fromCharCode(parseInt(a, 16))).join("").replace(/\0+$/, "").trim();
    if (s && /^[\x20-\x7E]+$/.test(s)) return s;
  }
  return n;
}
async function nn(e) {
  const t = "No AMM exists at that address. An AMM account is created by the protocol when a pool is opened — it is not an ordinary wallet, and a wallet address will not resolve here.";
  let n, s;
  try {
    [n, s] = await Promise.all([
      b("amm_info", {
        ..."ammAccount" in e ? { amm_account: e.ammAccount } : { asset: e.asset, asset2: e.asset2 },
        ledger_index: "validated"
      }),
      b("ledger", { ledger_index: "validated" })
    ]);
  } catch (g) {
    throw g instanceof A && (g.code === "actNotFound" || g.code === "actMalformed") ? new Error(t) : g;
  }
  if (!n.amm) throw new Error(t);
  const a = n.amm, r = Number(s.ledger?.close_time ?? 0), o = new Date((r + Ve) * 1e3), i = a.vote_slots ?? [], c = i.reduce((g, f) => g + Number(f.vote_weight ?? 0), 0), d = i.map((g) => ({
    account: String(g.account ?? ""),
    votedFeePct: Number(g.trading_fee ?? 0) / Z,
    weightOfSupply: Number(g.vote_weight ?? 0) / be,
    weightOfCast: c > 0 ? Number(g.vote_weight ?? 0) / c : 0
  })).sort((g, f) => f.weightOfSupply - g.weightOfSupply);
  let l;
  const u = a.auction_slot;
  if (u?.account) {
    const g = tn(u.expiration);
    g && (l = {
      holder: String(u.account),
      discountedFeePct: Number(u.discounted_fee ?? 0) / Z,
      expiresAt: g,
      expired: g.getTime() < o.getTime(),
      pricePaid: Number(u.price?.value ?? 0),
      authAccounts: (u.auth_accounts ?? []).map((f) => String(f.account ?? "")).filter(Boolean)
    });
  }
  return {
    account: String(a.account ?? ""),
    pair: `${ve(a.amount)} / ${ve(a.amount2)}`,
    tradingFeePct: Number(a.trading_fee ?? 0) / Z,
    participation: c / be,
    votes: d,
    auction: l,
    lpTokenSupply: Number(a.lp_token?.value ?? 0),
    // Preserved as undefined for XRP: absent means inapplicable, not false.
    assetFrozen: typeof a.asset_frozen == "boolean" ? a.asset_frozen : void 0,
    asset2Frozen: typeof a.asset2_frozen == "boolean" ? a.asset2_frozen : void 0,
    ledgerCloseTime: o,
    ledgerIndex: Number(s.ledger_index ?? s.ledger?.ledger_index ?? 0),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const sn = 0.1, an = 0.5;
function rn(e) {
  const t = [], n = (r) => `${(r * 100).toFixed(2)}%`, s = e.votes[0];
  if (e.votes.length === 0 ? t.push({
    id: "no-votes",
    severity: "warn",
    title: "Nobody is voting on this pool's fee",
    detail: `All eight vote slots are empty, so the trading fee sits at ${e.tradingFeePct.toFixed(3)}% by default. The first liquidity provider to cast a vote sets it, at whatever weight they hold.`,
    action: "If you hold LP tokens here, your vote is currently unopposed."
  }) : s && s.weightOfCast >= an ? t.push({
    id: "vote-capture",
    severity: s.weightOfCast >= 0.99 ? "critical" : "warn",
    title: `One account controls ${n(s.weightOfCast)} of the votes cast`,
    detail: `${s.account} carries ${n(s.weightOfCast)} of all weight cast and is voting for a ${s.votedFeePct.toFixed(3)}% fee. The pool charges ${e.tradingFeePct.toFixed(3)}%. Fee changes here do not require anyone else's agreement.`,
    action: "Treat the fee on this pool as a number one counterparty sets, not a market outcome."
  }) : t.push({
    id: "vote-spread",
    severity: "ok",
    title: `Fee votes are spread across ${e.votes.length} providers`,
    detail: `The largest single voter carries ${n(s?.weightOfCast ?? 0)} of weight cast. No one account can move the fee alone.`
  }), e.participation < sn && e.votes.length > 0 && t.push({
    id: "thin-participation",
    severity: "warn",
    title: `The fee is set by ${n(e.participation)} of the liquidity`,
    detail: `Vote weight is a share of LP token supply, and only ${n(e.participation)} of that supply has voted. The remaining ${n(1 - e.participation)} of providers are accepting a fee chosen by a fraction of a percent of the pool.`,
    action: "A small LP position can carry disproportionate governance weight here."
  }), e.auction) {
    const r = e.auction;
    if (r.expired)
      t.push({
        id: "auction-expired",
        severity: "info",
        title: "The auction slot is expired and unclaimed",
        detail: `The last holder was ${r.holder}, whose window closed ${r.expiresAt.toISOString().slice(0, 10)} — ${Math.floor((e.ledgerCloseTime.getTime() - r.expiresAt.getTime()) / 864e5).toLocaleString()} days before the ledger this was read from. Nobody currently holds a discounted fee, and the slot is available.`,
        action: `Claiming it would trade at ${r.discountedFeePct.toFixed(3)}% against everyone else's ${e.tradingFeePct.toFixed(3)}%.`
      });
    else {
      const o = r.discountedFeePct > 0 ? e.tradingFeePct / r.discountedFeePct : 1 / 0;
      t.push({
        id: "auction-active",
        severity: "warn",
        title: `${r.holder} is trading this pool at a discount right now`,
        detail: `The auction slot holder pays ${r.discountedFeePct.toFixed(3)}% while every other participant pays ${e.tradingFeePct.toFixed(3)}%${Number.isFinite(o) ? ` — ${o.toFixed(0)}x cheaper` : " — the holder trades free"}. The window closes ${r.expiresAt.toISOString().replace("T", " ").slice(0, 16)} UTC.${r.authAccounts.length > 0 ? ` ${r.authAccounts.length} further account${r.authAccounts.length === 1 ? " has" : "s have"} been nominated to share the discount.` : ""}`,
        action: "Arbitrage against this pool is asymmetric until that window closes."
      });
    }
  } else
    t.push({
      id: "auction-none",
      severity: "ok",
      title: "No auction slot is held",
      detail: `Every participant pays the same ${e.tradingFeePct.toFixed(3)}% fee.`
    });
  for (const [r, o] of [
    ["First asset", e.assetFrozen],
    ["Second asset", e.asset2Frozen]
  ])
    o === !0 && t.push({
      id: `frozen-${r}`,
      severity: "critical",
      title: `${r} in this pair is frozen by its issuer`,
      detail: "A frozen asset cannot leave the pool. Liquidity in this AMM is not withdrawable while the freeze stands, regardless of what the pool balance shows.",
      action: "Do not treat this pool's depth as available liquidity."
    });
  const a = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((r, o) => a[r.severity] - a[o.severity]);
}
const ke = 250, on = 400, cn = 262144, dn = 4194304, ln = 2097152;
function un(e) {
  const t = e.reduce((n, s) => n + s, 0);
  return t <= 0 ? 0 : e.reduce((n, s) => n + (s / t * 100) ** 2, 0);
}
async function Je(e, t) {
  const [n, s] = await Promise.all([
    b("account_info", { account: e, ledger_index: "validated" }),
    b("gateway_balances", { account: e, ledger_index: "validated" })
  ]), a = n.account_data ?? {}, r = Number(a.Flags ?? 0), o = {};
  for (const [f, h] of Object.entries(
    s.obligations ?? {}
  )) {
    const m = Number(h);
    Number.isFinite(m) && (o[f] = m);
  }
  const i = [];
  let c, d = 0, l = !1, u;
  for (; d < ke; ) {
    let f;
    try {
      f = await b("account_lines", {
        account: e,
        ledger_index: "validated",
        limit: on,
        ...c ? { marker: c } : {}
      });
    } catch (h) {
      if (d === 0) throw h;
      u = h instanceof Error ? h.message : "the walk was interrupted", l = !0;
      break;
    }
    for (const h of f.lines ?? [])
      i.push({
        account: String(h.account ?? ""),
        currency: String(h.currency ?? ""),
        // From the issuer's side a holder's balance is reported negative.
        held: Math.abs(Number(h.balance ?? 0)),
        limit: Number(h.limit_peer ?? h.limit ?? 0),
        // Present-and-true, never absent-means-false.
        frozenByIssuer: h.freeze === !0,
        authorized: h.authorized === !0
      });
    if (c = f.marker, d += 1, !c) break;
    d >= ke && (l = !0);
  }
  const g = Object.keys(o).map((f) => {
    const h = i.filter((w) => w.currency === f), m = h.filter((w) => w.held > 0).sort((w, k) => k.held - w.held), y = m.map((w) => w.held), p = y.reduce((w, k) => w + k, 0), T = o[f];
    return {
      currency: f,
      outstanding: T,
      observedHeld: p,
      holders: h.length,
      activeHolders: m.length,
      hhi: un(y),
      topHolderPct: p > 0 ? (y[0] ?? 0) / p : 0,
      topFivePct: p > 0 ? y.slice(0, 5).reduce((w, k) => w + k, 0) / p : 0,
      frozenSeen: h.filter((w) => w.frozenByIssuer).length,
      authorizedSeen: h.filter((w) => w.authorized).length,
      coverage: T > 0 ? p / T : 0,
      top: m.slice(0, 10)
    };
  }).sort((f, h) => h.outstanding - f.outstanding);
  return {
    issuer: e,
    domain: a.Domain ? (() => {
      try {
        return decodeURIComponent(
          String(a.Domain).replace(/(..)/g, "%$1")
        );
      } catch {
        return;
      }
    })() : void 0,
    currencies: g,
    linesWalked: i.length,
    truncated: l,
    walkError: u,
    requiresAuth: (r & cn) !== 0,
    canFreeze: (r & ln) === 0,
    globalFreeze: (r & dn) !== 0,
    ledgerIndex: Number(n.ledger_index ?? 0),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const hn = 2500, Se = 0.95;
function gn(e) {
  const t = [];
  e.walkError ? t.push({
    id: "walk-error",
    severity: "warn",
    title: "The holder walk was cut short by a failed read",
    detail: `The ledger stopped answering part-way through: ${e.walkError}. ${e.linesWalked.toLocaleString()} lines were read before that. Everything below is computed on what was retrieved, which is a smaller set than this issuer actually has.`,
    action: "Run the survey again — a fresh walk usually completes."
  }) : e.truncated && t.push({
    id: "truncated",
    severity: "warn",
    title: "Holder walk stopped before the end",
    detail: `Read ${e.linesWalked.toLocaleString()} lines and the ledger had more. Every concentration figure below is computed on that subset, and concentration on a partial holder set can only understate — the largest holder may be on a page this did not reach.`,
    action: "Treat the figures as provisional until a complete walk is possible."
  });
  for (const s of e.currencies) {
    if (s.outstanding <= 0) continue;
    s.coverage < Se && t.push({
      id: `coverage-${s.currency}`,
      severity: "warn",
      title: `${s.currency}: holder lines account for only ${(s.coverage * 100).toFixed(1)}% of supply`,
      detail: `gateway_balances reports ${s.outstanding.toLocaleString(void 0, { maximumFractionDigits: 2 })} outstanding, but the holder lines read sum to ${s.observedHeld.toLocaleString(void 0, { maximumFractionDigits: 2 })}. Those come from different commands and should agree, so the gap is holders this walk did not see.`,
      action: "Trust the outstanding figure; treat the holder breakdown as incomplete."
    }), s.coverage >= Se ? s.hhi >= hn ? t.push({
      id: `hhi-${s.currency}`,
      severity: s.hhi >= 5e3 ? "critical" : "warn",
      title: `${s.currency}: holdings are highly concentrated (HHI ${Math.round(s.hhi).toLocaleString()})`,
      detail: `The largest holder carries ${(s.topHolderPct * 100).toFixed(1)}% of observed supply and the top five carry ${(s.topFivePct * 100).toFixed(1)}%, across ${s.activeHolders.toLocaleString()} accounts with a balance. A regulator treats anything above 2,500 as a highly concentrated market; this issuance is effectively held by a handful of counterparties.`,
      action: "Understand who those accounts are. A single redemption from the top holder would move most of the float."
    }) : t.push({
      id: `hhi-ok-${s.currency}`,
      severity: "ok",
      title: `${s.currency}: holdings are distributed (HHI ${Math.round(s.hhi).toLocaleString()})`,
      detail: `${s.activeHolders.toLocaleString()} accounts hold a balance, the largest at ${(s.topHolderPct * 100).toFixed(1)}%.`
    }) : t.push({
      id: `hhi-unknown-${s.currency}`,
      severity: "warn",
      title: `${s.currency}: concentration cannot be measured from this walk`,
      detail: `The holder lines read account for ${(s.coverage * 100).toFixed(1)}% of the ${s.outstanding.toLocaleString(void 0, { maximumFractionDigits: 0 })} outstanding. Shares computed over that fraction are inflated by the small denominator and deflated by whichever large holders went unseen, so no concentration figure — high or low — can be reported for this issuance.`,
      action: "Run this against a node that can complete the holder walk before drawing any conclusion about concentration."
    });
    const r = s.holders - s.activeHolders;
    r > 0 && t.push({
      id: `dormant-${s.currency}`,
      severity: "info",
      title: `${s.currency}: ${r.toLocaleString()} trust lines carry no balance`,
      detail: `Of ${s.holders.toLocaleString()} lines opened against this issuance, ${r.toLocaleString()} sit at zero. Each still costs its holder reserve, and a large dormant count usually means an onboarding funnel that people started and abandoned.`
    }), s.frozenSeen > 0 && t.push({
      id: `frozen-${s.currency}`,
      severity: "info",
      title: `${s.currency}: ${s.frozenSeen} holder${s.frozenSeen === 1 ? "" : "s"} frozen by you`,
      detail: "Individually frozen lines seen in the walk. This is a record of enforcement actions you have taken and is visible to anyone reading the ledger."
    });
  }
  e.globalFreeze ? t.push({
    id: "global-freeze",
    severity: "critical",
    title: "Every balance you issued is frozen right now",
    detail: "lsfGlobalFreeze is set. No holder can send or redeem anything you issued while it stands."
  }) : e.canFreeze ? t.push({
    id: "can-freeze",
    severity: "info",
    title: "You retain the right to freeze",
    detail: "lsfNoFreeze is not set, so you can immobilise any holder's balance. Holders can read this, and a counterparty assessing you will treat it as a risk they carry.",
    action: "If you never intend to freeze, setting lsfNoFreeze is irreversible and materially improves how your issuance is assessed."
  }) : t.push({
    id: "no-freeze",
    severity: "ok",
    title: "You have permanently surrendered freeze",
    detail: "lsfNoFreeze is set and cannot be undone. Holders can verify that you are unable to immobilise their balances."
  }), e.requiresAuth && t.push({
    id: "require-auth",
    severity: "info",
    title: "Holders must be authorised individually",
    detail: "lsfRequireAuth is set, so nobody can hold your issuance until you authorise their line. Onboarding depends on you acting."
  });
  const n = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((s, a) => n[s.severity] - n[a.severity]);
}
const fn = /* @__PURE__ */ new Set([
  "USDT",
  "USDC",
  "USD",
  "EUR",
  "DAI",
  "BTC",
  "ETH",
  "XRP",
  "RLUSD",
  "GBP",
  "TUSD",
  "BUSD"
]), pn = 946684800;
function mn(e) {
  if (!/^([0-9A-F]{2})+$/i.test(e)) return e;
  const t = (e.match(/../g) ?? []).map((n) => String.fromCharCode(parseInt(n, 16))).join("").replace(/\0+$/, "").trim();
  return t && /^[\x20-\x7E]+$/.test(t) ? t : e;
}
function Te(e) {
  return e.kind === "xrp" ? `${e.value.toLocaleString(void 0, { maximumFractionDigits: 6 })} XRP` : `${e.value.toLocaleString(void 0, { maximumFractionDigits: 6 })} ${P(e.currency)}`;
}
async function yn(e) {
  let t;
  try {
    t = await b("account_objects", {
      account: e,
      ledger_index: "validated",
      type: "check",
      limit: 200
    });
  } catch (r) {
    throw r instanceof A && r.code === "actNotFound" ? new Error(
      "That address is not funded, so it has no account and nothing can be addressed to it yet."
    ) : r;
  }
  const n = t.account_objects ?? [], s = n.filter((r) => r.Destination === e), a = /* @__PURE__ */ new Map();
  for (const r of s) {
    const o = r.SendMax;
    if (typeof o != "object" || !o?.issuer) continue;
    const i = `${o.issuer}|${o.currency}`;
    if (!a.has(i))
      try {
        const [c, d] = await Promise.all([
          b("gateway_balances", { account: o.issuer, ledger_index: "validated" }),
          b("account_info", { account: o.issuer, ledger_index: "validated" })
        ]), l = Number((c.obligations ?? {})[o.currency] ?? 0), u = d.account_data?.Domain;
        a.set(i, {
          obligations: Number.isFinite(l) ? l : 0,
          domain: u ? mn(String(u)) : void 0
        });
      } catch {
      }
  }
  return wn(e, n, a, Number(t.ledger_index ?? 0));
}
function wn(e, t, n, s) {
  const a = t.filter((o) => o.Destination === e), r = a.map((o) => {
    const i = o.SendMax, c = typeof i == "object" && i !== null, d = c ? {
      kind: "iou",
      currency: String(i.currency ?? ""),
      issuer: String(i.issuer ?? ""),
      value: Number(i.value ?? 0)
    } : { kind: "xrp", value: Number(i ?? 0) / 1e6 }, l = c ? `${i.issuer}|${i.currency}` : "", u = n.get(l), g = c ? P(String(i.currency ?? "")) : "XRP";
    return {
      index: String(o.index ?? ""),
      from: String(o.Account ?? ""),
      amount: d,
      destinationTag: o.DestinationTag !== void 0 ? Number(o.DestinationTag) : void 0,
      expiration: o.Expiration !== void 0 ? new Date((Number(o.Expiration) + pn) * 1e3) : void 0,
      issuerObligations: u?.obligations,
      issuerOwesNothing: u !== void 0 && u.obligations === 0,
      borrowedTicker: c && fn.has(g.toUpperCase()),
      issuerDomain: u?.domain
    };
  });
  return {
    address: e,
    inbound: r,
    outboundCount: t.length - a.length,
    ledgerIndex: s,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function bn(e) {
  const t = [];
  if (e.inbound.length === 0)
    return t.push({
      id: "none",
      severity: "ok",
      title: "Nothing is addressed to this account",
      detail: "No checks are pending against it. Note that a check can be cancelled by whoever created it at any time before it is cashed, so an empty result today does not mean none has ever arrived."
    }), t;
  const n = e.inbound.filter((i) => i.borrowedTicker && i.issuerOwesNothing);
  for (const i of n) {
    const c = i.amount.kind === "iou" ? P(i.amount.currency) : "XRP";
    t.push({
      id: `impersonation-${i.index.slice(0, 12)}`,
      severity: "critical",
      title: `A claim for ${Te(i.amount)} that cannot be cashed for anything`,
      detail: `${i.from} has addressed a check for ${Te(i.amount)} to this account. A currency code is not a name anyone owns — any account can issue a token called ${c}, and the ledger renders them identically. This one's issuer has NO obligations outstanding at all, meaning it has never issued a balance to anyone, so there is nothing this check could pay out.${i.issuerDomain ? ` The issuer publishes the domain ${i.issuerDomain}.` : ""}`,
      action: "Do not visit any domain associated with it and do not enter a wallet key anywhere it leads. The check itself is inert — it cannot move your funds, and ignoring it costs you nothing."
    });
  }
  const s = e.inbound.filter((i) => i.borrowedTicker && !i.issuerOwesNothing);
  for (const i of s) {
    const c = i.amount.kind === "iou" ? P(i.amount.currency) : "XRP";
    t.push({
      id: `ticker-${i.index.slice(0, 12)}`,
      severity: "warn",
      title: `A claim denominated in ${c} — verify the issuer, not the ticker`,
      detail: `The issuer does have ${i.issuerObligations?.toLocaleString(void 0, { maximumFractionDigits: 2 })} outstanding, so this token is genuinely held by someone. That still does not make it the ${c} you are thinking of: the code is unowned and any issuer may use it. Only the issuing address identifies a token.`,
      action: `Confirm ${i.amount.kind === "iou" ? i.amount.issuer : ""} is the issuer you expect before treating this as ${c}.`
    });
  }
  const a = e.inbound.filter(
    (i) => i.amount.kind === "iou" && i.issuerObligations === void 0
  );
  a.length > 0 && t.push({
    id: "unverified",
    severity: "warn",
    title: `${a.length} claim${a.length === 1 ? "'s issuer" : "s' issuers"} could not be checked`,
    detail: "The ledger did not answer for those issuing accounts, so whether they have issued anything is unknown — which is not the same as their being fine."
  });
  const r = e.inbound.filter(
    (i) => !i.borrowedTicker && (i.issuerObligations !== void 0 || i.amount.kind === "xrp")
  );
  r.length > 0 && t.push({
    id: "pending",
    severity: "info",
    title: `${r.length} other claim${r.length === 1 ? "" : "s"} pending`,
    detail: "Checks addressed to this account that do not borrow a well-known ticker. A check is an offer to pay, not a payment: nothing moves until it is cashed, and the sender can cancel it first."
  }), t.push({
    id: "reserve",
    severity: "info",
    title: "None of this costs the recipient anything",
    detail: "A Check object counts against the reserve of whoever created it, not of whoever receives it. Ignoring an unwanted claim is free, and there is nothing to clean up."
  });
  const o = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((i, c) => o[i.severity] - o[c.severity]);
}
const vn = 1, kn = 2, Sn = 8, Tn = 16, $n = 5, $e = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";
function An(e) {
  let t = 0n;
  for (const s of e) t = t << 8n | BigInt(s);
  let n = "";
  for (; t > 0n; )
    n = $e[Number(t % 58n)] + n, t /= 58n;
  for (const s of e) {
    if (s !== 0) break;
    n = $e[0] + n;
  }
  return n;
}
async function Ae(e) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", e));
}
function _n(e) {
  const t = new Uint8Array(e.length / 2);
  for (let n = 0; n < t.length; n += 1)
    t[n] = parseInt(e.slice(n * 2, n * 2 + 2), 16);
  return t;
}
async function xn(e) {
  const t = new Uint8Array(21);
  t[0] = 0, t.set(_n(e), 1);
  const n = (await Ae(await Ae(t))).slice(0, 4), s = new Uint8Array(25);
  return s.set(t, 0), s.set(n, 21), An(s);
}
async function Nn(e) {
  const t = e.trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(t))
    throw new Error(
      "An NFTokenID is 64 hexadecimal characters. Check for a truncated copy or stray whitespace."
    );
  const n = parseInt(t.slice(0, 4), 16), s = parseInt(t.slice(4, 8), 16);
  return {
    tokenId: t,
    issuer: await xn(t.slice(8, 48)),
    burnable: (n & vn) !== 0,
    mutable: (n & Tn) !== 0,
    transferable: (n & Sn) !== 0,
    onlyXrp: (n & kn) !== 0,
    // TransferFee is in units of 0.001%, so 5000 is 5%.
    transferFeePct: s / 1e3,
    taxon: parseInt(t.slice(48, 56), 16),
    sequence: parseInt(t.slice(56, 64), 16)
  };
}
function In(e) {
  return Array.isArray(e) ? e.map((t) => ({
    index: String(t.nft_offer_index ?? ""),
    owner: String(t.owner ?? ""),
    amountXrp: typeof t.amount == "string" ? Number(t.amount) / 1e6 : void 0,
    amountRaw: t.amount,
    destination: t.destination ? String(t.destination) : void 0
  })) : [];
}
async function En(e) {
  const t = await Nn(e);
  let n = !1;
  const s = async (o) => {
    try {
      const i = await b(o, { nft_id: t.tokenId, ledger_index: "validated" });
      return In(i.offers);
    } catch (i) {
      return i?.code !== "objectNotFound" && (n = !0), [];
    }
  }, [a, r] = await Promise.all([
    s("nft_sell_offers"),
    s("nft_buy_offers")
  ]);
  return {
    rights: t,
    sellOffers: a,
    buyOffers: r,
    offersUnreadable: n,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function On(e) {
  const t = [], n = e.rights;
  if (n.burnable ? t.push({
    id: "burnable",
    severity: "critical",
    title: "The issuer can destroy this token",
    detail: "lsfBurnable is set, so the issuer may burn this NFT while someone else owns it. Whatever it represents, the holder's claim to it can be ended unilaterally and without warning. No marketplace shows this next to the price.",
    action: "Treat it as a revocable licence, not as property. Price the issuer's discretion into what you pay."
  }) : t.push({
    id: "not-burnable",
    severity: "ok",
    title: "The issuer cannot destroy this token",
    detail: "lsfBurnable is not set. Only the current owner can burn it, and that is a decision the holder makes."
  }), n.mutable && t.push({
    id: "mutable",
    severity: "warn",
    title: "The issuer can change what this token points at",
    detail: "lsfMutable is set, so the URI can be rewritten after sale. An NFT is a pointer, and this one's pointer can be redirected — the artwork, document or entitlement it refers to today is not necessarily what it will refer to tomorrow.",
    action: "Anything you are relying on should be stored where the issuer cannot reach it."
  }), n.transferable || t.push({
    id: "soulbound",
    severity: "warn",
    title: "This token cannot be sold on",
    detail: "lsfTransferable is not set, so it can only ever move back to its issuer. There is no secondary market for it and there cannot be one.",
    action: "Do not value it against comparable tokens that can be resold."
  }), n.transferFeePct > 0 && t.push({
    id: "transfer-fee",
    severity: n.transferFeePct >= $n ? "warn" : "info",
    title: `The issuer takes ${n.transferFeePct.toFixed(3)}% of every resale`,
    detail: `A transfer fee is deducted by the issuer each time this token changes hands, on top of anything a marketplace charges. At this rate a round trip costs ${(n.transferFeePct * 2).toFixed(3)}% before any price movement.`
  }), n.onlyXrp && t.push({
    id: "only-xrp",
    severity: "info",
    title: "It can only be traded for XRP",
    detail: "lsfOnlyXRP is set, so offers denominated in an issued token are not possible for it."
  }), e.offersUnreadable)
    t.push({
      id: "offers-unreadable",
      severity: "warn",
      title: "The offer books could not be read",
      detail: "The ledger did not answer for this token's offers, so whether any exist is unknown — which is not the same as none existing."
    });
  else {
    const a = [...e.sellOffers, ...e.buyOffers].filter((r) => r.destination);
    a.length > 0 && t.push({
      id: "directed-offers",
      severity: "info",
      title: `${a.length} offer${a.length === 1 ? " is" : "s are"} reserved for a named account`,
      detail: "These carry a destination, so only that account can accept them. An offer book showing activity is not the same as a market anyone can trade into."
    }), t.push({
      id: "offers",
      severity: "info",
      title: `${e.sellOffers.length} sell, ${e.buyOffers.length} buy offer${e.buyOffers.length === 1 ? "" : "s"}`,
      detail: e.sellOffers.length + e.buyOffers.length === 0 ? "Nothing is currently offered on either side for this token." : "Offers rest until cancelled or accepted; their presence says nothing about whether the owner still wants to trade."
    });
  }
  const s = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((a, r) => s[a.severity] - s[r.severity]);
}
const _e = [
  "wss://xrplcluster.com",
  "wss://s1.ripple.com",
  "wss://s2.ripple.com",
  "wss://xrpl.ws"
], Fn = 2, Rn = 4, Qe = 12e3;
function Pn(e) {
  return new Promise((t) => {
    const n = Date.now();
    let s = !1, a;
    const r = (i) => {
      if (!s) {
        s = !0;
        try {
          a?.close();
        } catch {
        }
        t(i);
      }
    };
    try {
      a = new WebSocket(e);
    } catch (i) {
      r({
        url: e,
        reachable: !1,
        error: i instanceof Error ? i.message : "could not open socket"
      });
      return;
    }
    const o = window.setTimeout(
      () => r({ url: e, reachable: !1, error: "no response within 12s" }),
      Qe
    );
    a.onerror = () => {
      window.clearTimeout(o), r({ url: e, reachable: !1, error: "connection refused or blocked" });
    }, a.onopen = () => {
      a.send(JSON.stringify({ id: 1, command: "server_info" }));
    }, a.onmessage = (i) => {
      window.clearTimeout(o);
      try {
        const c = JSON.parse(String(i.data))?.result?.info ?? {}, d = c.validated_ledger ?? {}, l = String(c.complete_ledgers ?? "").split("-")[0];
        r({
          url: e,
          reachable: !0,
          roundTripMs: Date.now() - n,
          ledgerSeq: Number(d.seq) || void 0,
          ledgerAge: typeof d.age == "number" ? d.age : void 0,
          // Absent on s1/s2 by operator choice — preserved as undefined.
          version: typeof c.build_version == "string" ? c.build_version : void 0,
          serverState: typeof c.server_state == "string" ? c.server_state : void 0,
          peers: typeof c.peers == "number" ? c.peers : void 0,
          historyFrom: Number(l) || void 0,
          amendmentBlocked: typeof c.amendment_blocked == "boolean" ? c.amendment_blocked : void 0
        });
      } catch {
        r({ url: e, reachable: !1, error: "unreadable response" });
      }
    };
  });
}
function Cn(e) {
  return new Promise((t) => {
    let n = !1, s;
    const a = (o) => {
      if (!n) {
        n = !0;
        try {
          s?.close();
        } catch {
        }
        t(o);
      }
    };
    try {
      s = new WebSocket(e);
    } catch {
      a(void 0);
      return;
    }
    const r = window.setTimeout(() => a(void 0), Qe);
    s.onerror = () => {
      window.clearTimeout(r), a(void 0);
    }, s.onopen = () => s.send(JSON.stringify({ id: 1, command: "fee" })), s.onmessage = (o) => {
      window.clearTimeout(r);
      try {
        const i = JSON.parse(String(o.data))?.result ?? {}, c = i.levels ?? {}, d = Number(c.reference_level) || 256;
        a({
          source: e,
          pressure: (Number(c.open_ledger_level) || d) / d,
          queueSize: Number(i.current_queue_size ?? 0),
          maxQueueSize: Number(i.max_queue_size ?? 0),
          expectedLedgerSize: Number(i.expected_ledger_size ?? 0),
          minimumFeeDrops: Number(i.drops?.minimum_fee ?? 0),
          openLedgerFeeDrops: Number(i.drops?.open_ledger_fee ?? 0)
        });
      } catch {
        a(void 0);
      }
    };
  });
}
async function Ln() {
  const [e, t] = await Promise.all([
    Promise.all(_e.map(Pn)),
    Cn(_e[0])
  ]), n = e.filter((s) => s.reachable && typeof s.ledgerSeq == "number").map((s) => s.ledgerSeq);
  return {
    nodes: e,
    reachableCount: e.filter((s) => s.reachable).length,
    leaderSeq: n.length > 0 ? Math.max(...n) : void 0,
    spread: n.length > 1 ? Math.max(...n) - Math.min(...n) : void 0,
    fee: t,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function Dn(e) {
  const t = [], n = e.nodes.length;
  if (e.reachableCount === 0)
    return t.push({
      id: "all-unreachable",
      severity: "critical",
      title: "No public node answered",
      detail: `All ${n} endpoints failed to respond. Every reading in this console depends on reaching one of them, so this is almost certainly a problem with this machine's network rather than with the ledger.`,
      action: "Check the connection here before drawing any conclusion about XRPL."
    }), t;
  const s = e.nodes.filter((c) => !c.reachable);
  if (s.length > 0 && t.push({
    id: "some-unreachable",
    severity: "warn",
    title: `${s.length} of ${n} nodes did not answer`,
    detail: s.map((c) => `${c.url} — ${c.error ?? "no response"}`).join(". "),
    action: "A single unreachable endpoint is routine. All-but-one usually means this machine, not the ledger."
  }), typeof e.leaderSeq == "number") {
    const c = e.nodes.filter(
      (d) => d.reachable && typeof d.ledgerSeq == "number" && e.leaderSeq - d.ledgerSeq >= Rn
    );
    c.length > 0 ? t.push({
      id: "node-lag",
      severity: "warn",
      title: `${c.length} node${c.length === 1 ? " is" : "s are"} behind the others`,
      detail: c.map(
        (d) => `${d.url} is ${e.leaderSeq - d.ledgerSeq} ledgers back`
      ).join(". ") + ". Ledgers close every three to four seconds, so this is beyond normal cadence.",
      action: "Readings taken from a trailing node describe a ledger that has already moved on."
    }) : typeof e.spread == "number" && e.spread <= Fn && t.push({
      id: "in-sync",
      severity: "ok",
      title: `All ${e.reachableCount} reachable nodes agree`,
      detail: e.spread === 0 ? `Every reachable node reports ledger ${e.leaderSeq.toLocaleString()}. They are on exactly the same ledger.` : `Sequences span ${e.spread} ledger${e.spread === 1 ? "" : "s"} at ${e.leaderSeq.toLocaleString()} — nodes mid-close, which is the normal cadence.`
    });
  }
  const a = e.nodes.filter((c) => c.amendmentBlocked === !0);
  a.length > 0 && t.push({
    id: "amendment-blocked",
    severity: "critical",
    title: `${a.length} node${a.length === 1 ? " is" : "s are"} amendment-blocked`,
    detail: `${a.map((c) => c.url).join(", ")} cannot validate: an amendment has activated that this software does not implement. Anything read from it is stale by definition.`,
    action: "Do not rely on that endpoint until its operator upgrades."
  });
  const r = e.nodes.filter(
    (c) => c.reachable && typeof c.historyFrom == "number" && c.historyFrom > 32570
  );
  if (r.length > 0 && t.push({
    id: "partial-history",
    severity: "info",
    title: `${r.length} node${r.length === 1 ? " keeps" : "s keep"} only recent history`,
    detail: r.map((c) => `${c.url} retains from ledger ${c.historyFrom?.toLocaleString()}`).join(". ") + ". Queries against older ledgers will fail there even though the node is healthy."
  }), e.fee) {
    const c = e.fee, d = c.maxQueueSize > 0 ? c.queueSize / c.maxQueueSize : 0;
    c.pressure > 1 ? t.push({
      id: "fee-pressure",
      severity: c.pressure >= 10 ? "warn" : "info",
      title: `Transactions cost ${c.pressure.toFixed(1)}x the reference fee right now`,
      detail: `The open ledger is charging ${c.openLedgerFeeDrops.toLocaleString()} drops against a ${c.minimumFeeDrops.toLocaleString()}-drop minimum, with ${c.queueSize.toLocaleString()} transactions queued of ${c.maxQueueSize.toLocaleString()} capacity. Fees on XRPL rise with load and fall back when it clears.`,
      action: "A transaction submitted at the minimum fee may sit in the queue until pressure drops."
    }) : t.push({
      id: "fee-clear",
      severity: "ok",
      title: "No fee pressure",
      detail: `The open ledger is charging the reference fee — ${c.openLedgerFeeDrops.toLocaleString()} drops — with ${c.queueSize.toLocaleString()} transactions queued of ${c.maxQueueSize.toLocaleString()} capacity (${(d * 100).toFixed(1)}% full). Expected ledger size is ${c.expectedLedgerSize.toLocaleString()} transactions.`
    });
  }
  const o = e.nodes.filter((c) => c.reachable && c.version === void 0);
  o.length > 0 && t.push({
    id: "undisclosed",
    severity: "info",
    title: `${o.length} node${o.length === 1 ? " does" : "s do"} not disclose their software version`,
    detail: `${o.map((c) => c.url).join(", ")} answered normally but omit build version, server state and peer count. That is an operator's choice about what to publish — it is not a fault, and it is not something this tool can infer.`
  });
  const i = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((c, d) => i[c.severity] - i[d.severity]);
}
function Hn(e) {
  return e.passed ? "PASS" : e.severity === "block" ? "FAIL" : "REVIEW";
}
function qn(e) {
  return e.state ?? Hn(e);
}
const Xn = /* @__PURE__ */ new Set(["INSUFFICIENT_DATA", "NOT_APPLICABLE"]);
function zn(e) {
  return e.state && Xn.has(e.state) ? [e.id, e.passed, e.state] : [e.id, e.passed];
}
async function Un(e) {
  const t = new TextEncoder().encode(e), n = await crypto.subtle.digest("SHA-256", t);
  return Array.from(new Uint8Array(n)).map((s) => s.toString(16).padStart(2, "0")).join("").toUpperCase();
}
async function Mn(e) {
  return Un(
    JSON.stringify({
      kind: e.kind,
      subject: e.subject,
      scope: Object.keys(e.scope).sort().map((t) => [t, e.scope[t]]),
      evaluatedAt: e.evaluatedAt,
      checks: e.checks.map(zn)
    })
  );
}
const xe = 0.95, jn = /* @__PURE__ */ new Set([
  "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
  // ACCOUNT_ZERO
  "rrrrrrrrrrrrrrrrrrrrBZbvji",
  // ACCOUNT_ONE
  "rrrrrrrrrrrrrrrrrNAMEtxvNvQ",
  // reserved for name lookups
  "rrrrrrrrrrrrrrrrrrrn5RM1rHd"
  // rippled's NaN sentinel
]);
function ee(e) {
  return !!e && !jn.has(e);
}
const Ne = 2500, Ie = 2;
async function Bn(e, t = {}) {
  const n = [], [s, a, r] = await Promise.all([
    Ke(e).catch((i) => (n.push(`control: ${i instanceof Error ? i.message : String(i)}`), null)),
    We(e).catch((i) => (n.push(`posture: ${i instanceof Error ? i.message : String(i)}`), null)),
    // The supply walk is the expensive read, so it is opt-in. When it is
    // skipped the concentration checks abstain rather than assume.
    t.walkSupply ? Je(e).catch((i) => (n.push(`issuance: ${i instanceof Error ? i.message : String(i)}`), null)) : Promise.resolve(null)
  ]), o = a?.unreadable ? null : a;
  return a?.unreadable && n.push(`posture: ${a.unreadable}`), {
    issuer: e,
    control: s,
    posture: o,
    issuance: r,
    unreadable: n,
    ledgerIndex: s?.ledgerIndex ?? r?.ledgerIndex ?? 0,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function Ze(e) {
  return !e || e.currencies.length === 0 ? null : e.currencies.reduce((t, n) => n.outstanding > t.outstanding ? n : t);
}
function Wn(e) {
  const t = [], { control: n, posture: s } = e;
  if (!s || s.unreadable || !n)
    return t.push({
      id: "AUTHORITY_READABLE",
      label: "Issuer state readable",
      severity: "block",
      passed: !1,
      detail: [...e.unreadable, s?.unreadable ? `posture: ${s.unreadable}` : ""].filter(Boolean).join("; ") || "The issuer account could not be read from validated state, so no authority claim can be made about it."
    }), t;
  t.push({
    id: "FREEZE_SURRENDERED",
    label: "Freeze permanently surrendered",
    severity: "warn",
    passed: s.noFreeze,
    detail: s.noFreeze ? "lsfNoFreeze is set. The issuer has irrevocably given up the ability to freeze any line of this issuance." : "lsfNoFreeze is not set. The issuer retains the ability to freeze holders' lines, and can exercise it at any time without notice to the holder."
  }), t.push({
    id: "NOT_GLOBALLY_FROZEN",
    label: "Issuance not frozen now",
    severity: "block",
    passed: !s.globalFreeze,
    detail: s.globalFreeze ? "lsfGlobalFreeze is set. Every trust line of this issuer is frozen at this ledger — balances cannot move." : "lsfGlobalFreeze is clear. Lines are not under a global freeze at this ledger."
  }), t.push({
    id: "OPEN_HOLDING",
    label: "Holding does not require issuer permission",
    severity: "warn",
    passed: !s.requireAuth,
    detail: s.requireAuth ? "lsfRequireAuth is set. The issuer authorises each holder individually, so who may hold this asset is the issuer's decision." : "lsfRequireAuth is clear. Any account may open a line without the issuer's permission."
  });
  const a = !!n.signers.unreadable, r = !n.masterKeyEnabled && !!n.regularKey && !ee(n.regularKey), o = n.signers.present ? n.signers.minimumSigners <= 1 : ee(n.regularKey) || n.masterKeyEnabled;
  t.push({
    id: "NO_UNILATERAL_SIGNER",
    label: "No single key controls the issuer",
    severity: "block",
    // A signer list that could not be read cannot be ruled out, and an
    // unverifiable absence must not read as an absence.
    passed: !o && !a,
    detail: a ? `The signer list could not be read (${n.signers.unreadable}), so it cannot be established whether a committee controls this account or one key does. This is an unknown, not a pass.` : n.signers.present ? n.signers.minimumSigners <= 1 ? `A signer list is present, but ${n.signers.unilateralSigners.length || 1} signer reaches the quorum of ${n.signers.quorum} alone. This is a single-key account wearing a committee's clothes.` : `${n.signers.minimumSigners} signers must agree to reach the quorum of ${n.signers.quorum}, derived from summed weights rather than a headcount.` : r ? `The master key is disabled and the regular key is set to ${n.regularKey}, an address whose private key does not exist. The account is blackholed: it can never sign another transaction, so no party can act on this issuance.` : ee(n.regularKey) ? `No signer list. The master key is ${n.masterKeyEnabled ? "enabled" : "disabled"} and a regular key is set, so ${n.regularKey} signs for this issuer on its own.` : n.masterKeyEnabled ? "No signer list and no usable regular key, and the master key is enabled. One key signs for this issuer." : "The master key is disabled, no regular key is set and no signer list is present, so the account cannot currently be signed for at all."
  }), s.transferRateBps > 0 && t.push({
    id: "NO_TRANSFER_FEE",
    label: "No issuer transfer fee",
    severity: "warn",
    passed: !1,
    detail: `The issuer charges ${(s.transferRateBps / 100).toFixed(2)}% on every transfer between holders. The rate is set by the issuer and can be changed by them.`
  });
  const i = Ze(e.issuance), c = e.unreadable.find((d) => d.startsWith("issuance:"));
  if (!e.issuance)
    t.push({
      id: "SUPPLY_CONCENTRATION",
      label: "Supply concentration",
      severity: "warn",
      passed: !1,
      state: "INSUFFICIENT_DATA",
      detail: c ? `The holder walk was requested and could not be completed (${c.replace(/^issuance:\s*/, "")}), so no concentration finding is made. This is a failed read, not an abstention and not a pass.` : "Supply was not walked for this certificate, so no concentration finding is made. This is an abstention, not a pass."
    });
  else if (!i)
    t.push({
      id: "SUPPLY_CONCENTRATION",
      label: "Supply concentration",
      severity: "warn",
      // Nothing to concentrate: the rule does not apply, and it must not
      // hold a certificate back as though it had failed.
      passed: !0,
      state: "NOT_APPLICABLE",
      detail: "The issuer reports no outstanding obligations, so there is no supply to measure."
    });
  else if (i.coverage < xe)
    t.push({
      id: "SUPPLY_CONCENTRATION",
      label: `${P(i.currency)} supply concentration`,
      severity: "warn",
      passed: !1,
      state: "INSUFFICIENT_DATA",
      detail: `The holder lines read account for ${(i.coverage * 100).toFixed(1)}% of the outstanding ${P(i.currency)}. Below ${xe * 100}% coverage no concentration figure is reported, high or low, because shares over that fraction describe the holders seen rather than the issuance.`
    });
  else {
    const d = i.hhi >= Ne, l = e.issuance.source === "indexer" ? ` Holder balances are from ${e.issuance.sourceName}, not read from the ledger directly; their total was reconciled against the ledger's own obligations to within ${Math.abs(i.coverage - 1) * 100 < 0.01 ? "0.01" : (Math.abs(i.coverage - 1) * 100).toFixed(2)}%, which establishes that none are missing or invented but not that each is attributed correctly.` : " Holder balances were read from validated ledger state.";
    t.push({
      id: "SUPPLY_CONCENTRATION",
      label: `${P(i.currency)} supply not concentrated`,
      severity: "warn",
      passed: !d,
      detail: (d ? `HHI ${Math.round(i.hhi)} over ${i.holders} holders at ${(i.coverage * 100).toFixed(1)}% coverage. The largest holder carries ${i.topHolderPct.toFixed(1)}% and the top five carry ${i.topFivePct.toFixed(1)}%.` : `HHI ${Math.round(i.hhi)} over ${i.holders} holders at ${(i.coverage * 100).toFixed(1)}% coverage, below the ${Ne} threshold.`) + l
    });
  }
  return t;
}
function Gn(e, t = {}) {
  return e.some((n) => n.severity === "block" && !n.passed) ? "no-go" : (t.unreadable?.length ?? 0) > 0 ? "insufficient-data" : e.some((n) => !n.passed) ? "hold" : "go";
}
async function Kn(e, t = {}) {
  const n = await Bn(e, t);
  return Yn(n);
}
async function Yn(e) {
  const t = Wn(e), n = Gn(t, { unreadable: e.unreadable }), s = Ze(e.issuance)?.currency, a = e.readAt, r = await Mn({
    kind: "authority",
    subject: e.issuer,
    // The ledger index is inside the digest because a certificate is a
    // claim about one ledger, not about an issuer in general. The same
    // issuer at a later ledger is a different assertion and must not
    // share a digest with this one.
    // `source` is in the scope because the concentration figures can
    // come from the ledger directly or from a third-party indexer
    // reconciled against it, and those are not the same evidence. The
    // finding names the source in its prose, but digestOf hashes only
    // [id, passed] per check — prose is not covered. Without this key
    // an indexer-derived certificate and a ledger-walked one over the
    // same issuer and ledger share a digest, which would let the
    // weaker evidence inherit the stronger one's attestation.
    // "none" when supply was not read at all and the checks abstain.
    scope: {
      currency: s ?? "",
      ledgerIndex: e.ledgerIndex,
      verdict: n,
      source: e.issuance?.source ?? "none",
      rules: Ie
    },
    checks: t,
    evaluatedAt: a
  });
  return {
    verdict: n,
    issuer: e.issuer,
    currency: s,
    currencyLabel: s ? P(s) : void 0,
    checks: t,
    digest: r,
    ledgerIndex: e.ledgerIndex,
    evaluatedAt: a,
    source: e.issuance?.source ?? "none",
    rulesVersion: Ie
  };
}
const Vn = [
  {
    id: "ticket",
    question: "How do I contact support or open a ticket?",
    answer: "Open NOSHX, choose TICKETS, then NEW TICKET. Give it a subject, a topic and a priority, and describe what happened; the app version and platform are attached unless you untick them. Support replies in the same thread, and you are emailed when they do. Tickets are private to you and NOSHASHI support, and you need to be signed in. From the Support chat, OPEN A TICKET WITH SUPPORT carries your question into a new ticket. Never paste a secret key or seed: a ticket that contains one is refused before it is sent.",
    keywords: ["support", "ticket", "contact", "help", "human", "person", "email", "issue", "bug", "report", "problem"]
  },
  {
    id: "labs",
    question: "How do I learn to use NOSHASHI?",
    answer: "Open LEARN and choose Hands-on labs. Each lab takes you through a real screen: TAKE ME TO opens it with a real mainnet address or token already filled in, the step says what to look for, and one question checks what you saw. Every question you answer right joins your review deck and comes back a day later, then after 3, 7, 16 and 35 days; a missed one comes back tomorrow. REVIEW on the Labs page shows what is due. There are seven labs: checking an address, NFT rights, the inbox, the verification gate, ledger sync, NOSHX, and multi-signature treasuries (that one needs Pro for its screen). Progress is kept on this device.",
    keywords: ["learn", "lab", "labs", "tutorial", "training", "course", "how", "use", "onboarding", "review", "practice", "quiz", "remember"]
  },
  {
    id: "regulator-seat",
    question: "How do I give an examiner or regulator access?",
    answer: "In an organization on Institutional or above, an owner, admin or compliance member opens POLICY › MEMBERS › REGULATOR SEATS, enters the examiner's email (they need their own NOSHASHI account) and chooses 7, 30, 90 or 180 days. The examiner can read the organization's policies, exceptions, investigations and audit trail and cannot change anything. The seat ends on its date without anyone acting, can be revoked at any time, and every visit the examiner makes is written to the audit trail.",
    keywords: ["regulator", "examiner", "auditor", "seat", "read-only", "readonly", "access", "supervisor", "inspection"]
  },
  {
    id: "monitoring",
    question: "How do I monitor my book on a schedule and set my own alerts?",
    answer: "Open PORTFOLIO & RADAR › MONITOR (Institutional). Turn the schedule on, choose every 1, 4, 6, 12 or 24 hours and a scenario, and every wallet in the book is stress-tested with the same model as the Risk screen while the app is open. Under ALERT RULES, create a rule from conditions such as recovery ratio below 60% or freezable share above 25%, joined by ALL or ANY, for every wallet or chosen ones, and send it to the console, a desktop notification or your organization's webhooks (event custom_alert). Runs and alerts are recorded in the organization's audit log.",
    keywords: ["monitor", "monitoring", "schedule", "scheduled", "alert", "alerts", "rule", "rules", "threshold", "stress", "notify", "webhook"]
  },
  {
    id: "deposit-screening",
    question: "How do I screen deposits before crediting them?",
    answer: "Open ADJUDICATION › LEDGER WATCH (Enterprise). Paste the transaction hash and your deposit address, set your accepted issuers, deny list, whether a destination tag is required and your Travel Rule threshold, and press SCREEN. NOSHASHI reads the payment live: it credits what actually arrived (never the Amount of a partial payment), holds a familiar ticker whose issuer owes nothing as counterfeit, flags dust carrying a link as phishing, and traces who funded the sender three hops back against your deny list. Add the address under WATCHED ACCOUNTS and every incoming payment is screened by the server within a minute, sent to your webhooks as deposit_screened.",
    keywords: ["deposit", "deposits", "screen", "screening", "credit", "partial", "counterfeit", "phishing", "dust", "kyt", "source of funds", "deny list", "travel rule", "exchange"]
  },
  {
    id: "self-repair",
    question: "Something is not working. Can NOSHX fix it?",
    answer: `Tell NOSHX what is wrong ("it is not working, fix it") or press SELF-REPAIR in the Support panel. NOSHX checks the mainnet link and reconnects to another public server if it is dropped or silent, compares this computer's clock with the ledger's, renews an expiring sign-in, checks the NOSHASHI server, re-reads your plan, looks at your watched accounts, removes damaged saved settings, checks the help index and whether a newer version is out. It repairs what it can and says what is left and how to fix it. Say "open a ticket with this report" to send the report to support, or "post the report to NSH-1042" to add it to a ticket.`,
    keywords: ["broken", "not working", "fix", "repair", "self-repair", "diagnose", "troubleshoot", "disconnected", "error", "slow", "stuck", "clock", "signed out"],
    suggestsDiagnostics: !0
  },
  {
    id: "noshx-tickets",
    question: "Can NOSHX read, answer and act on my tickets for me?",
    answer: `Yes, when you are signed in. To open one yourself, see How do I contact support. Ask NOSHX "show my tickets" for the list, "show NSH-1042" to read a thread with the answer NOSHASHI's own pages give, "reply to NSH-1042: …" to add a message, "resolve NSH-1042" or "reopen NSH-1042", and "open a ticket: …" to start one with your app version attached. NOSHX changes a ticket only when your own message asks it to. Support staff can also ask "answer NSH-1042" for a reply drafted from the pages, and "answer NSH-1042 and send it" to post it.`,
    keywords: ["nsh", "reply", "resolve", "reopen", "noshx", "agent", "status", "thread", "draft"]
  },
  {
    id: "sanctions",
    question: "Does NOSHASHI check the OFAC sanctions list?",
    answer: "Yes. Every day NOSHASHI reads the US Treasury's Specially Designated Nationals list (sdn.csv and sdn_comments.csv from treasury.gov) and keeps every XRP Ledger address it names, with the entry number, name and program. Check an Address says when an address is listed, with its source; deposit screening holds a deposit whose sender, or any account that funded it up to three hops back, is listed, and never credits it; the website widget's address check shows it too. An address that is not on the list is not thereby cleared: the list names only addresses OFAC has published.",
    keywords: ["sanctions", "sanctioned", "ofac", "sdn", "treasury", "blacklist", "blocked", "screening", "aml", "list"]
  },
  {
    id: "address-poisoning",
    question: "What is address poisoning and does NOSHASHI catch it?",
    answer: "An attacker creates an address whose first and last characters match one you use, then sends you a tiny payment so it appears in your history next to the real one, hoping you copy it into a withdrawal. Deposit screening flags any sender that starts and ends like one of your watched addresses or your trusted counterparties (set them in the deposit rules), and holds it when it arrived as dust. The website widget's VERIFY ADDRESS check tells your customers whether the address they are about to pay is really yours or a lookalike.",
    keywords: ["poisoning", "lookalike", "look-alike", "similar address", "vanity", "copy", "history", "scam", "fake address"]
  },
  {
    id: "embed-widget",
    question: "Can I put NOSHASHI's checks on my own website?",
    answer: "Yes, on Enterprise and Strategic. In ADJUDICATION › LEDGER WATCH › WEBSITE WIDGET, create a widget: choose its checks (verify that an address is really your deposit address, check any address against the ledger and the OFAC list, and deposit status by transaction hash), pick your deposit address, and list the exact sites it may appear on. Paste the two-line snippet into your page. The widget holds no key, answers only on the sites you list, and never tells a customer why a deposit is under review.",
    keywords: ["embed", "widget", "website", "white-label", "customer", "snippet", "script", "iframe", "integrate", "site"]
  },
  {
    id: "account-security",
    question: "How do I make my XRP Ledger account harder to hack?",
    answer: "Open SECURITY CENTER › ACCOUNT CHECK (free) and enter your address, never your seed. NOSHASHI grades the account A to F from what the ledger shows: who can sign (master key, regular key, signer list and its real quorum), recent key and settings changes, address-poisoning attempts against you, and the doors strangers can use (NFT offers, checks, payment channels). The hardening plan lists unsigned transactions (for example, sign with a regular key on a hardware wallet, or require two of three signers for a treasury, and refuse unsolicited NFT offers) for you to review and sign in your own wallet. NOSHASHI never signs and never asks for a key.",
    keywords: ["secure", "security", "hack", "hacked", "protect", "harden", "seed", "regular key", "multisig", "signer", "takeover", "wallet", "safe"]
  },
  {
    id: "hacked-account",
    question: "My account was hacked or drained. Can I get my XRP back?",
    answer: "A validated XRP Ledger transaction cannot be reversed by anyone: not validators, not Ripple, not NOSHASHI, and anyone offering a paid 'recovery' is running a second scam. Do this now: move whatever is left to a new account created on a device that never held the old seed, and report it to the police (in the US, ic3.gov; in the UK, Action Fraud). Then open SECURITY CENTER › INCIDENT RESPONSE (Pro and above): it shows the key changes before the theft, follows the value hop by hop past the dust thieves spray, says where it is now, and lists the recovery paths that exist. If it reached an exchange with a destination tag, the exchange can freeze it; if it was an issued token, the issuer may freeze or claw it back. Send them the SHA-256 dossier it writes.",
    keywords: ["hacked", "stolen", "drained", "lost", "recover", "reverse", "scam", "theft", "thief", "compromised", "get back", "refund", "police"]
  },
  {
    id: "security-guardian",
    question: "Can NOSHASHI alert us if one of our accounts is being taken over?",
    answer: "Yes, on Strategic. Watch the accounts in LEDGER WATCH; the server reads them every minute, and when one's regular key or signer list changes, its master key is disabled or re-enabled, or it is deleted, your webhooks receive a signed security_alert within a minute. A takeover almost always starts with the thief adding a key of their own, so this is the earliest warning the ledger gives. SECURITY CENTER › GUARDIAN lists these events, and INCIDENT RESPONSE can watch every account in a theft trail in one click.",
    keywords: ["alert", "guardian", "takeover", "monitor", "keys changed", "webhook", "security_alert", "watch", "notify"]
  },
  {
    id: "event-feeds",
    question: "How do I get XRPL events into my own systems?",
    answer: "On the Strategic plan, add accounts under ADJUDICATION › LEDGER WATCH › WATCHED ACCOUNTS. The server reads each one every minute from validated ledgers and sends every event (payments, trust-line freezes, settings and issuer flag changes, clawbacks and more) to your organization's webhooks as xrpl_event, signed. You can also pull them: GET /functions/v1/noshashi-xrpl-watch/events with an organization API key, as JSON, NDJSON or CSV, cursor-paged, optionally in one of your own export schemas; POST /history backfills any ledger range.",
    keywords: ["event", "events", "feed", "feeds", "stream", "watch", "webhook", "ndjson", "backfill", "history", "schema", "export", "retention"]
  },
  {
    id: "no-go",
    question: "Why did my check come back NO-GO?",
    answer: "NO-GO means at least one blocking rule failed, and the Verification scene names which one. In practice it is almost always one of three things: the account holds none of the XLS-70 credentials the target domain requires (most mainnet accounts hold none yet), the transfer exceeds the domain's per-settlement ceiling, or the balance does not clear the XRPL owner reserve of 1 XRP plus 0.2 XRP per owned object. Open the verdict and read the row marked BLOCK — the detail line states the exact number that failed.",
    keywords: ["no-go", "nogo", "refused", "blocked", "failed", "why", "verdict", "denied"]
  },
  {
    id: "hold",
    question: "What is the difference between HOLD and NO-GO?",
    answer: "NO-GO means a blocking rule failed and the settlement is refused. HOLD means every blocking rule passed but an advisory one did not — most often the account publishes no Domain attestation, or the target domain is under governance review. HOLD is 'a human should look at this', not 'this is forbidden'.",
    keywords: ["hold", "difference", "advisory", "warn", "meaning", "versus", "vs"]
  },
  {
    id: "no-credentials",
    question: "Why does my wallet show no credentials?",
    answer: "Because it genuinely holds none. XLS-70 credentials are ledger objects that an issuer creates and the subject then accepts; they do not exist until someone issues one. An empty registry on mainnet is the normal state today, not a bug or a sync failure. Any domain rule that requires a credential will correctly read NO-GO until one is issued and accepted.",
    keywords: ["credential", "credentials", "empty", "none", "missing", "registry", "xls-70", "xls70"]
  },
  {
    id: "offline",
    question: "The console says OFFLINE or DEGRADED.",
    answer: "The console holds one WebSocket to a public XRPL node and rotates across three endpoints with exponential backoff. OFFLINE almost always means outbound WebSocket traffic on port 443 is being blocked — a corporate proxy, a VPN, or a strict firewall. Run the diagnostics below and use Reconnect; if it still fails, try without the VPN.",
    keywords: ["offline", "degraded", "disconnected", "connection", "reconnect", "network", "websocket"],
    suggestsDiagnostics: !0
  },
  {
    id: "change-wallet",
    question: "How do I change which wallet is being watched?",
    answer: "Settings → Wallet. Paste any XRPL classic address and press LOAD. It must start with r and be 25–35 characters. The console is read-only: it never asks for a seed, a private key or a signature, and it cannot move funds.",
    keywords: ["change", "wallet", "address", "switch", "watch", "different", "another"]
  },
  {
    id: "export",
    question: "How do I export an audit trail?",
    answer: "Audit Trail → EXPORT CSV. It writes every record currently matching your filters, with the compliance metadata attached, into your Downloads folder. The file is plain CSV, so it opens directly in Excel, Numbers or a spreadsheet your accountant already uses.",
    keywords: ["export", "csv", "audit", "download", "accountant", "tax", "report", "trail"]
  },
  {
    id: "menubar",
    question: "How do I open the menu bar HUD?",
    answer: "Press Cmd+Shift+X from anywhere, or click the flower in the macOS menu bar. The HUD shows one thing at a glance — whether this wallet can settle right now — and the menu bar itself carries a live ticker with the gate state and current ledger height. It needs the desktop app; the browser build has no menu bar.",
    keywords: ["menu", "menubar", "hud", "tray", "icon", "shortcut", "cmd", "toggle", "ticker"]
  },
  {
    id: "secrets",
    question: "Where are my API keys and secrets stored?",
    answer: "In the macOS Keychain, through the OS keyring — never in a preferences file, never in browser storage, and never in a log. Compliance API keys you issue are stored only as a SHA-256 hash, shown once at creation, and cannot be recovered afterwards by you or by us. Model-provider keys are scoped per provider so revoking one does not disturb another.",
    keywords: ["key", "keys", "secret", "secrets", "keychain", "store", "stored", "api", "safe", "security"]
  },
  {
    id: "billing",
    question: "How do I cancel or get a refund?",
    answer: "Account → Manage Billing opens Stripe's own portal; cancelling takes two clicks, needs no email and no phone call, and access continues to the end of the period you already paid for. Full refund within 14 days of a first subscription charge if you have not used a paid capability, and unused verification credits are refundable pro rata within 30 days.",
    keywords: ["cancel", "refund", "billing", "subscription", "unsubscribe", "money", "charge", "stripe", "payment"]
  },
  {
    id: "free",
    question: "What do I get without paying?",
    answer: "The whole console. Live mainnet telemetry, unlimited gate checks, the credential registry, the domain grid, the audit trail with CSV export, the on-device AI agent and the menu bar HUD are all free forever, with no account required. Paid plans add multi-wallet portfolios, drift and expiry alerting, receipt anchoring and the Compliance API — capabilities a desk needs, not a paywall on the basics.",
    keywords: ["free", "cost", "price", "pay", "tier", "plan", "trial", "included"]
  },
  {
    id: "agent-setup",
    question: "The AI agent says no runtime is detected.",
    answer: "The agent defaults to a local model so your prompts never leave the machine. Install Ollama, run `ollama serve`, then `ollama pull hermes3`, and press RE-DETECT. LM Studio, llama.cpp, Jan and vLLM are detected automatically too. You can instead point it at Claude, OpenAI, Groq or any OpenAI-compatible endpoint by adding a key in the runtime panel. Support answers like this one work with no runtime at all.",
    keywords: ["agent", "ai", "runtime", "ollama", "model", "llm", "detect", "claude", "install"],
    suggestsDiagnostics: !0
  },
  {
    id: "privacy",
    question: "What data do you collect about me?",
    answer: "Without an account: nothing. No analytics, no telemetry, no crash reporting, no advertising identifiers, and no server of ours receives your usage. With an account we hold your email, subscription state, any wallet addresses you add to a portfolio, and verification records. Passwords are bcrypt-hashed by our auth provider and we never see them. The full list is in Legal → Data Processing.",
    keywords: ["privacy", "data", "collect", "tracking", "telemetry", "gdpr", "personal", "information"]
  },
  {
    id: "gatekeeper",
    question: "macOS says the app cannot be opened.",
    answer: "The build is not yet notarized by Apple, so Gatekeeper warns on first launch. Right-click the app and choose Open, then Open again — you only do this once. Notarization requires an Apple Developer account and is on the roadmap.",
    keywords: ["gatekeeper", "damaged", "unidentified", "developer", "open", "install", "blocked", "macos", "warning"]
  },
  {
    id: "is-it-advice",
    question: "Can I rely on a verdict legally?",
    answer: "No, and we will not pretend otherwise. A GO means the rules you configured passed — it is not legal advice, not a regulatory determination, and it does not discharge an obligation you owe a regulator. The receipt proves a check ran against a stated rule set at a stated time. Anything with legal consequence needs your compliance officer and qualified counsel.",
    keywords: ["legal", "advice", "rely", "compliance", "regulator", "lawyer", "liability", "guarantee"]
  }
], Jn = [
  {
    id: "operator",
    name: "FREE",
    audience: "Individuals and single desks",
    priceLabel: "Free",
    monthlyUsd: 0,
    cadence: "forever",
    priceId: null,
    seatBased: !1,
    purchase: "free",
    features: [
      "Full console and menu bar HUD",
      "Unlimited local gate checks",
      "Ledger sync — four public nodes compared side by side",
      "Inbox — spot impersonated tokens addressed to you",
      "Token rights — check an NFT before you buy it",
      "On-device compliance agent",
      "CSV audit export",
      "Account security check — who can sign, open doors, key changes, poisoning attempts, and an unsigned hardening plan",
      "Safe send — check a pasted address against your own for lookalikes before you sign",
      "Binary integrity verification",
      "Community support"
    ],
    grants: ["console", "gate", "agent", "export"]
  },
  {
    id: "desk",
    name: "PRO",
    audience: "Trading desks and funds",
    priceLabel: "$749",
    monthlyUsd: 749,
    cadence: "per seat / month",
    priceId: "price_1U6U1eGSxPXLjUKIGnORqp43",
    annualUsd: 7490,
    annualPriceId: "price_1UHV60GSxPXLjUKIytehVDNd",
    purchase: "self_serve",
    seatBased: !0,
    emphasis: !0,
    features: [
      "Everything in Free",
      "Redemption stress testing — liquidity-adjusted recoverable value across the book",
      "Multi-wallet portfolios with live gate status",
      "Settlement forensics — what a transaction delivered, not what it requested",
      "Order book integrity — quoted depth against depth that can actually fill",
      "Counterparty provenance — account age and who funded it",
      "Treasury control surface — how few signers can actually move a balance",
      "AMM pool governance — who votes the fee, and who holds the discount",
      "Policy drift and credential expiry alerts",
      "Issuer freeze-rights analysis — know who can immobilise your balance",
      "Authority certificate — a signed, re-checkable record of who can still freeze, seize or gate an issuance",
      "Counterparty concentration (HHI) across the settlement book",
      "Persistent adjudication ledger — 10,000 verdicts, survives restart",
      "Wallet explorer — every address ever scanned, sortable by risk",
      "Editable policy rule set — your thresholds, not ours",
      "Issuer drift monitor — native alert the moment an issuer freezes you",
      "Incident response — follow stolen value hop by hop past the dust, with every recovery path that exists and a SHA-256 dossier for police and exchanges",
      "5,000 API verifications included",
      "Priority support"
    ],
    grants: [
      "console",
      "gate",
      "agent",
      "export",
      "portfolios",
      "alerts",
      "receipt_anchoring",
      "priority_support",
      "authority_certificate",
      // Pro is sold "5,000 API verifications included" and the verify
      // function publishes a 50 req/sec limit for this tier. Without
      // this flag every one of those calls answered 403: the quota and
      // the key have to be granted by the same tier, or one of them is
      // a line on a pricing page that nothing honours.
      "compliance_api",
      "incident_response"
    ]
  },
  {
    id: "institution",
    name: "INSTITUTIONAL",
    audience: "Regulated venues and custodians",
    priceLabel: "$4,000",
    monthlyUsd: 4e3,
    cadence: "per month",
    priceId: "price_1U6U1sGSxPXLjUKI7mCncAIu",
    annualUsd: 4e4,
    annualPriceId: "price_1UHV6AGSxPXLjUKIyxTwSBpO",
    purchase: "contact_sales",
    seatBased: !1,
    features: [
      "Everything in Pro, unlimited seats",
      "Immutable audit log of every adjudication, export and settings change",
      "Bulk portfolio monitoring — unlimited wallets, scheduled stress runs",
      "Custom alert logic — your own thresholds, expressions and destinations",
      "Issuance surveillance — who holds your paper, and how concentrated",
      "Travel Rule (FATF R.16) scoping across every settlement",
      "Signed audit export — SHA-256 chain-of-custody for examiners",
      "Offline adjudication — run on a segregated network from captured state",
      "Compliance API keys and webhooks",
      "White-label console and reports — your name and colour on the console and on exports",
      "Regulator read-only seats — time-boxed examiner access, every visit logged",
      "100,000 API verifications included",
      "99.9% uptime SLA with service credits, set in the MSA",
      "Dedicated onboarding and a named support contact",
      "Invoice, ACH, wire, NET-30 — MSA required"
    ],
    grants: [
      "console",
      "gate",
      "agent",
      "export",
      "portfolios",
      "alerts",
      "receipt_anchoring",
      "priority_support",
      "authority_certificate",
      "compliance_api",
      "webhooks",
      "regulator_seats",
      "white_label",
      "sla",
      "sso",
      "audit_log",
      "bulk_monitoring",
      "custom_alert_logic",
      "incident_response"
    ]
  },
  {
    id: "enterprise",
    name: "ENTERPRISE",
    audience: "Institutional teams operating at scale",
    priceLabel: "$10,000",
    monthlyUsd: 1e4,
    cadence: "per month",
    // No Stripe price exists yet: contract tiers are invoiced per deal.
    priceId: null,
    annualUsd: 1e5,
    annualPriceId: null,
    purchase: "contact_sales",
    seatBased: !1,
    emphasis: !0,
    features: [
      "Everything in Institutional",
      "Deposit screening: partial payments, counterfeit tokens, phishing dust, address poisoning, OFAC-listed senders and three-hop source of funds, before you credit",
      "Embeddable screening widget for your own site: address verification against poisoning, sanctions and deposit status",
      "Forensic trace — five hops deep, 1,000 transactions an account, straight into an organization investigation case",
      "Asset passports and issuer intelligence at institutional scope",
      "Portfolio monitoring, counterparty and liquidity intelligence",
      "Deterministic policy engine, adjudication and decision history",
      "Evidence records, hashes, audit exports and review workflow",
      "Institutional API, scoped keys and webhooks",
      "Dedicated environment, provisioned per contract",
      "Architecture review and named implementation planning"
    ],
    grants: [
      "console",
      "gate",
      "agent",
      "export",
      "portfolios",
      "alerts",
      "receipt_anchoring",
      "priority_support",
      "authority_certificate",
      "compliance_api",
      "webhooks",
      "regulator_seats",
      "white_label",
      "sla",
      "sso",
      "audit_log",
      "bulk_monitoring",
      "custom_alert_logic",
      "asset_passports",
      "dedicated_environment",
      "deposit_screening",
      "embedded_delivery",
      "incident_response",
      "forensic_trace"
    ]
  },
  {
    id: "strategic",
    name: "STRATEGIC INFRASTRUCTURE",
    audience: "Institutions building their own XRPL intelligence layer",
    priceLabel: "$20,850",
    monthlyUsd: 20850,
    cadence: "per month",
    // No Stripe price exists yet: contract tiers are invoiced per deal.
    priceId: null,
    annualUsd: 208500,
    annualPriceId: null,
    purchase: "contact_sales",
    seatBased: !1,
    features: [
      "Everything in Enterprise",
      "High-volume API capacity and contracted burst limits",
      "XRPL event feeds: watched accounts read every minute, signed webhooks, JSON/NDJSON feed and history API",
      "Custom export schemas, bulk export and event retention you set",
      "Security Guardian — signed security_alert webhooks the minute a watched account's keys change or it is deleted, and one-click watching of a theft trail",
      "Architecture review before commitment",
      "Scope documented against the integration"
    ],
    grants: [
      "console",
      "gate",
      "agent",
      "export",
      "portfolios",
      "alerts",
      "receipt_anchoring",
      "priority_support",
      "authority_certificate",
      "compliance_api",
      "webhooks",
      "regulator_seats",
      "white_label",
      "sla",
      "sso",
      "audit_log",
      "bulk_monitoring",
      "custom_alert_logic",
      "asset_passports",
      "dedicated_environment",
      "deposit_screening",
      "embedded_delivery",
      "event_feeds",
      "custom_schemas",
      "incident_response",
      "forensic_trace",
      "security_guardian"
    ]
  }
], Qn = [{ name: "Overview", plan: "Free", summary: "what NOSHASHI is and what it reads." }, { name: "Mission Control", plan: "Free", summary: "live mainnet telemetry, wallet gate, policy rule set." }, { name: "Verification", plan: "Free", summary: "describe a settlement, run it against a domain, get an explainable verdict and a SHA-256 receipt. Nothing is broadcast." }, { name: "Credentials", plan: "Free", summary: "XLS-70 objects held by the wallet, and which domains they unlock." }, { name: "Domain Grid", plan: "Free", summary: "XLS-80 permissioned domains and their rule sets." }, { name: "Audit Trail", plan: "Free", summary: "wallet history, filterable, exportable to CSV." }, { name: "NOSHX", plan: "Free", summary: "this assistant, NOSHASHI's agent. It reads the live ledger with read-only tools (authority, order book, settlement, control surface, provenance, pools, issuance, address check, claims, NFT rights, ledger status), each gated like its screen, answers questions about NOSHASHI itself from the product's own pages (features, screens, plans, docs, trust, legal), and by default runs on NOSHX Core, NOSHASHI's own engine, which uses no language model: it plans from the question, runs the readers and writes the answer itself. A language model can be added (the trained NOSHX model through Ollama, or a hosted one), with optional failover back to Core and a deep reasoning switch. It has an Observer that reads the wallets you name from validated mainnet on an interval and records what changed (freezes, balances, credentials, issuer powers) by fixed rules, and a one-click issuer investigation that reads an issuer's authority certificate and obligations and hands the findings to this assistant." }, { name: "Portfolio & Radar", plan: "Desk", summary: "multi-wallet surveillance and the compliance radar." }, { name: "Exposure Analysis", plan: "Desk", summary: "issuer freeze rights, Travel Rule scope, counterparty concentration." }, { name: "Ledger & Policy", plan: "Desk", summary: "local adjudication history, evidence chain and receipt verification, investigations (cases a person opens on a verdict, with notes and a written resolution; a resolution never changes the verdict), the versioned institutional policy (drafts, simulation, activation, audit trail), policy simulation, signed export." }, { name: "Check an Address", plan: "Free", summary: "read what the ledger publishes about any account." }, { name: "Token Rights", plan: "Free", summary: "what the issuer of an NFT can still do to it after someone owns it — destroy it (lsfBurnable), rewrite what its URI points at (lsfMutable), block resale entirely, or take a cut of every transfer. All of it is encoded in the NFTokenID itself and decoded offline, so no server is asked and none can answer wrongly." }, { name: "Inbox", plan: "Free", summary: "every check a stranger has addressed to an account, and whether the token each one offers has ever been issued by anyone. A currency code is not a name anyone owns — any account can issue a token called USDT — so an unsolicited claim for a large round sum from an issuer with no obligations is impersonation, not money. Receiving one costs nothing and cannot move funds." }, { name: "Ledger Sync", plan: "Free", summary: "four public XRPL nodes queried and compared, with disagreement between them treated as the reading." }, { name: "Learn", plan: "Free", summary: "short animated explainers." }, { name: "Settlement", plan: "Desk", summary: "what a transaction actually DELIVERED against what it requested. A partial payment can return tesSUCCESS having delivered a fraction of the stated amount; this is the screen for that question." }, { name: "Ledger Garden", plan: "Desk", summary: "walk the ledger's relationships one validated read at a time — an issuer's assets, an asset's holders (from the first 200 of the issuer's trust lines, in ledger order; Issuance walks them all), an account's holdings and recent transactions, a transaction's settlement evidence — then hand the whole path to this agent as a question." }, { name: "Provenance", plan: "Desk", summary: "how long an account has existed and who sent it its first XRP. Note the sequence number is not a transaction count on modern accounts." }, { name: "Control Surface", plan: "Desk", summary: "how few signers can actually move a treasury, whether the master key bypasses the quorum, and how much balance is locked rather than spendable." }, { name: "Order Book", plan: "Desk", summary: "how much of an order book's quoted depth is backed by an owner who still holds the asset. An offer rests whether or not its owner kept the funds, and nothing removes it until someone tries to cross it — on some mainnet books over 90% of the visible depth cannot fill." }, { name: "Pool Governance", plan: "Desk", summary: "who votes an AMM's trading fee, on what share of the liquidity, and who holds the discounted auction slot." }, { name: "Issuance", plan: "Institution", summary: "holder concentration and enforcement history for an issuer, from the issuer's side." }, { name: "Authority Certificate", plan: "Desk", summary: "what authority an issuer has kept over an asset it issued — whether it can freeze a holder, whether it gave that power up irrevocably (lsfNoFreeze cannot be cleared once set), whether the asset is frozen right now, whether holding it needs the issuer's permission, whether one signer reaches the quorum alone, what it charges on a transfer between holders, and how concentrated the supply is. Each answer is a fact at one named ledger index, and the set is digested with SHA-256 so the same reading can be checked again later. It is NOT a score — no number is composited from the checks — and NOT a legal finding: whether an asset is decentralised or is a security is a determination for an agency applying statutory criteria, which this software does not evaluate. If the supply walk is skipped, or trust-line coverage falls below 95%, the concentration check abstains rather than passing." }, { name: "Ledger Watch", plan: "Free", summary: "screens an incoming payment to a deposit address before it is credited, read live from the ledger — it credits what actually arrived (delivered_amount, never the Amount of a partial payment), holds a familiar ticker whose issuer owes nothing as counterfeit, flags dust carrying a link as a phishing lure, notes a missing destination tag, the issuer's freeze and clawback rights, the Travel Rule threshold, and traces who created the sender and who created them, three hops back, against the organization's deny list. Verdicts are clear, review or hold; what could not be read holds the deposit. Deposit addresses and monitored accounts are read by the server every minute; each event goes to the organization's webhooks (xrpl_event, deposit_screened) and to a JSON/NDJSON feed API with a history endpoint; export schemas shape bulk exports and the feed. Requires Enterprise (deposit screening); monitoring any account, event feeds, custom schemas and retention need Strategic." }, { name: "Security Center", plan: "Free", summary: "ACCOUNT CHECK (free) grades any address A to F from who can sign (master key, regular key, signer list and its real quorum), recent key and settings changes, address-poisoning attempts and open doors (NFT offers, checks, payment channels), and writes an unsigned hardening plan the owner signs in their own wallet. SAFE SEND (free) checks a pasted destination against the operator's own address book for lookalikes and against the OFAC list. INCIDENT RESPONSE (Pro+; five hops and a case on Enterprise) follows stolen value through payments and AccountDelete sweeps past dust, says where it is, and rates every recovery path; validated transactions are never reversible. GUARDIAN (Strategic) sends security_alert webhooks when a watched account's keys change or it is deleted." }, { name: "Asset Passport", plan: "Enterprise", summary: "a signed, portable record of an asset’s compliance posture — issuer authority, freeze rights, concentration, domain eligibility — that travels with the asset and can be verified by any counterparty without re-running the checks." }, { name: "Growth", plan: "Free", summary: "platform-native drafts built from measured figures." }, { name: "Pricing", plan: "Free", summary: "plans, checkout and verification credits." }, { name: "Account", plan: "Free", summary: "subscription, two-factor authentication and API keys." }, { name: "Business Plan", plan: "Free", summary: "revenue streams, tiers and sequencing." }, { name: "Legal & Accessibility", plan: "Free", summary: "policies, accessibility statement and contact routes." }, { name: "Trust & Security", plan: "Free", summary: "the read-only data path from the ledger to the receipt, what NOSHASHI never does (no keys, custody, signing or broadcast), where data goes, and what it does not claim." }, { name: "Settings", plan: "Free", summary: "appearance, accessibility, wallet address, notifications, launch at login, global shortcut and Keychain storage." }], et = {
  scenes: Qn
}, Zn = "https://www.noshashi.app";
function es() {
  const e = Vn.map((n) => ({
    title: `Help › ${n.question}`,
    source: "NOSHX › Support",
    text: `${n.question}
${n.answer}`
  }));
  for (const n of Jn)
    e.push({
      title: `Pricing › ${n.name}`,
      source: `${Zn}/pricing/`,
      text: `${n.name} plan, for ${n.audience}. Price (cost): ${n.priceLabel} ${n.cadence}. Includes: ${n.features.join("; ")}.`
    });
  const t = et.scenes;
  for (let n = 0; n < t.length; n += 6)
    e.push({
      title: "App screens",
      source: "NOSHASHI desktop app",
      text: t.slice(n, n + 6).map((s) => `${s.name} (${s.plan}): ${s.summary}`).join(`
`)
    });
  return e;
}
const ts = new Set(
  "a an and are as at be but by can do does for from has have how i if in is it its me my of on or our so that the their them then there these this to was we what when where which who why will with you your".split(" ")
), ns = {
  sent: "send",
  sending: "send",
  sends: "send",
  paid: "pay",
  paying: "pay",
  bought: "buy",
  sold: "sell",
  held: "hold",
  holding: "hold",
  frozen: "freeze",
  froze: "freeze",
  freezing: "freeze",
  data: "data",
  costs: "cost",
  priced: "price",
  pricing: "price",
  prices: "price"
};
function R(e) {
  return (e.toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) ?? []).filter((t) => !ts.has(t) && t.length > 1).map((t) => ns[t] ?? (t.length > 4 ? t.replace(/(ies|es|s|ing|ed)$/, (n) => n === "ies" ? "y" : "") : t));
}
function ss(e) {
  const t = [], n = [];
  for (const o of e) {
    const i = R(o.title), c = R(o.text), d = /* @__PURE__ */ new Map();
    for (const l of i) d.set(l, (d.get(l) ?? 0) + 2);
    for (const l of c) d.set(l, (d.get(l) ?? 0) + 1);
    t.push(d), n.push(` ${i.join(" ")} ${c.join(" ")} `);
  }
  const s = t.map((o) => [...o.values()].reduce((i, c) => i + c, 0)), a = /* @__PURE__ */ new Map();
  for (const o of t) for (const i of o.keys()) a.set(i, (a.get(i) ?? 0) + 1);
  const r = s.reduce((o, i) => o + i, 0) / Math.max(1, s.length);
  return { passages: e, docs: t, sequences: n, lengths: s, df: a, avg: r };
}
function as(e, t, n = 5) {
  const s = R(t), a = [...new Set(s)], r = s.slice(1).map((g, f) => ` ${s[f]} ${g} `);
  if (a.length === 0) return [];
  const o = e.passages.length, i = 1.4, c = 0.55, d = (g) => {
    const f = e.df.get(g) ?? 0;
    return Math.log(1 + (o - f + 0.5) / (f + 0.5));
  }, l = [];
  e.docs.forEach((g, f) => {
    let h = 0;
    for (const m of a) {
      const y = g.get(m);
      y && (h += d(m) * y * (i + 1) / (y + i * (1 - c + c * e.lengths[f] / e.avg)));
    }
    for (const m of r)
      if (e.sequences[f].includes(m)) {
        const [y, p] = m.trim().split(" ");
        h += 0.6 * (d(y) + d(p));
      }
    h > 0 && l.push({ ...e.passages[f], score: h * (e.passages[f].weight ?? 1) });
  }), l.sort((g, f) => f.score - g.score);
  const u = /* @__PURE__ */ new Set();
  return l.filter((g) => !u.has(g.title) && u.add(g.title)).slice(0, n);
}
let U = null, tt = [];
function is(e) {
  tt = e, U = null;
}
function nt() {
  return U ?? (U = import("./pages-CjXTLjUb.js").then(({ default: e }) => ss([...es(), ...tt, ...e]))), U;
}
function rs() {
  if (U) return;
  const e = () => {
    nt();
  };
  typeof requestIdleCallback == "function" ? requestIdleCallback(e, { timeout: 1500 }) : setTimeout(e, 0);
}
async function st(e, t = 5) {
  return as(await nt(), e, t);
}
function os(e) {
  if (!/^[0-9A-F]{40}$/i.test(e)) return e;
  const t = (e.match(/../g) ?? []).map((n) => String.fromCharCode(parseInt(n, 16))).join("").replace(/\0+$/, "").trim();
  return t && /^[\x20-\x7E]+$/.test(t) ? t : e;
}
function cs(e, t, n = 4) {
  for (const s of t)
    if (!(s === e || s.length < n * 2 + 1) && s.slice(0, n + 1) === e.slice(0, n + 1) && s.slice(-n) === e.slice(-n))
      return s;
  return null;
}
const ds = 946684800, z = {
  disableMaster: 1048576,
  depositAuth: 16777216,
  disallowIncomingNFTokenOffer: 67108864,
  disallowIncomingCheck: 134217728,
  disallowIncomingPayChan: 268435456
}, L = {
  disableMaster: 4,
  disallowIncomingNFTokenOffer: 12,
  disallowIncomingCheck: 13,
  disallowIncomingPayChan: 14
}, Ee = {
  1: "require a destination tag",
  2: "require authorisation",
  3: "disallow XRP",
  4: "disable the master key",
  5: "track transaction IDs",
  6: "no freeze",
  7: "global freeze",
  8: "default ripple",
  9: "deposit authorisation",
  10: "authorised NFT minter",
  12: "refuse incoming NFT offers",
  13: "refuse incoming checks",
  14: "refuse incoming payment channels",
  15: "refuse incoming trust lines",
  16: "allow trust-line clawback"
}, ls = (e) => typeof e == "number" ? new Date((e + ds) * 1e3).toISOString() : null;
function us(e) {
  return /^([0-9A-Fa-f]{2})+$/.test(e) ? new TextDecoder().decode(new Uint8Array((e.match(/../g) ?? []).map((t) => parseInt(t, 16)))) : e;
}
function hs(e, t) {
  const n = e.map((a) => a.weight).sort((a, r) => r - a);
  let s = 0;
  for (let a = 0; a < n.length; a++)
    if (s += n[a], s >= t) return a + 1;
  return 1 / 0;
}
function Oe(e, t, n, s) {
  const a = t?.account_data ?? null, o = (t?.signer_lists ?? a?.signer_lists ?? [])[0], i = (o?.SignerEntries ?? []).map((y) => ({ account: String(y.SignerEntry?.Account ?? ""), weight: Number(y.SignerEntry?.SignerWeight ?? 0) })).filter((y) => y.account), c = Number(o?.SignerQuorum ?? 0), d = Number(a?.Flags ?? 0), l = [], u = /* @__PURE__ */ new Set(), g = [];
  let f = 0;
  for (const y of n) {
    const p = y.tx_json ?? y.tx ?? y;
    if ((y.meta ?? {}).TransactionResult !== "tesSUCCESS") continue;
    const w = Number(y.ledger_index ?? p.ledger_index ?? 0), k = String(p.hash ?? y.hash ?? ""), v = ls(p.date ?? y.date), _ = p.Account === e;
    switch (p.TransactionType) {
      case "SetRegularKey":
        _ && l.push(
          p.RegularKey ? { kind: "regular_key_set", ledger: w, at: v, hash: k, detail: `Regular key set to ${p.RegularKey}: that key can now sign alone.` } : { kind: "regular_key_removed", ledger: w, at: v, hash: k, detail: "Regular key removed." }
        );
        break;
      case "SignerListSet":
        if (_) {
          const x = Number(p.SignerQuorum ?? 0), S = (p.SignerEntries ?? []).length;
          l.push(
            x > 0 ? { kind: "signer_list_set", ledger: w, at: v, hash: k, detail: `Signer list set: quorum ${x} across ${S} signer${S === 1 ? "" : "s"}.` } : { kind: "signer_list_removed", ledger: w, at: v, hash: k, detail: "Signer list removed." }
          );
        }
        break;
      case "AccountSet":
        _ && (p.SetFlag === L.disableMaster ? l.push({ kind: "master_disabled", ledger: w, at: v, hash: k, detail: "Master key disabled." }) : p.ClearFlag === L.disableMaster ? l.push({ kind: "master_enabled", ledger: w, at: v, hash: k, detail: "Master key re-enabled." }) : typeof p.SetFlag == "number" ? l.push({ kind: "flag_set", ledger: w, at: v, hash: k, detail: `Set: ${Ee[p.SetFlag] ?? `flag ${p.SetFlag}`}.` }) : typeof p.ClearFlag == "number" && l.push({ kind: "flag_cleared", ledger: w, at: v, hash: k, detail: `Cleared: ${Ee[p.ClearFlag] ?? `flag ${p.ClearFlag}`}.` }));
        break;
      case "AccountDelete":
        _ && l.push({ kind: "account_deleted", ledger: w, at: v, hash: k, detail: `Account deleted; its XRP went to ${p.Destination}.` });
        break;
      case "Payment":
        if (_ && typeof p.Destination == "string" && u.add(p.Destination), p.Destination === e && typeof p.Account == "string") {
          g.push({ from: p.Account, hash: k, ledger: w });
          const x = typeof p.Amount == "string" ? Number(p.Amount) : NaN;
          Number.isFinite(x) && x < 1e4 && (f += 1);
        }
        break;
    }
  }
  const h = [], m = /* @__PURE__ */ new Set();
  for (const y of g) {
    if (u.has(y.from) || m.has(y.from)) continue;
    const p = cs(y.from, u);
    p && (m.add(y.from), h.push({ sender: y.from, imitates: p, hash: y.hash, ledger: y.ledger }));
  }
  return {
    address: e,
    exists: !!a,
    balanceXrp: a ? Number(a.Balance ?? 0) / 1e6 : 0,
    flags: d,
    masterEnabled: (d & z.disableMaster) === 0,
    regularKey: a?.RegularKey ? String(a.RegularKey) : null,
    signerList: i.length ? { quorum: c, signers: i, minimumSigners: hs(i, c) } : null,
    domain: typeof a?.Domain == "string" && a.Domain ? us(a.Domain) : null,
    ledgerIndex: Number(t?.ledger_index ?? 0),
    events: l,
    poisoning: h,
    dustReceived: f,
    historyRead: n.length,
    historyComplete: s
  };
}
async function Fe(e, t = 200) {
  const n = await b("account_info", { account: e, ledger_index: "validated", signer_lists: !0 }).catch((r) => {
    if (/actNotFound|not found/i.test(r instanceof Error ? r.message : String(r))) return null;
    throw r;
  });
  if (!n) return Oe(e, null, [], !0);
  const s = await b("account_tx", { account: e, ledger_index_min: -1, ledger_index_max: -1, forward: !1, limit: t }).catch(() => ({ transactions: [] })), a = s.transactions ?? [];
  return Oe(e, n, a, !s.marker);
}
const Re = { critical: 0, warn: 1, info: 2, ok: 3 }, gs = 864e5;
function fs(e, t = Date.now()) {
  const n = [], s = [], a = (h) => (e.flags & h) !== 0;
  if (!e.exists)
    return {
      score: 0,
      grade: "F",
      summary: "This account does not exist on the ledger: never funded, or deleted.",
      findings: [{ id: "not-found", severity: "info", title: "No account at this address", detail: "The validated ledger has no AccountRoot here. If you expected funds, check the address; if it was deleted, its XRP went to the account named in its AccountDelete." }],
      plan: []
    };
  const r = e.signerList;
  e.masterEnabled && !e.regularKey && !r && n.push({
    id: "single-key",
    severity: "warn",
    title: "One secret key controls everything",
    detail: `The master key can sign alone and there is no second key or signer list, so anyone who obtains that one secret can move all ${e.balanceXrp.toLocaleString("en-US")} XRP at once. Stolen seeds (phishing sites, cloud backups, screenshots, clipboard malware) are how most XRPL accounts are emptied.`,
    action: "For a personal wallet: keep the master seed offline and sign day to day with a regular key on a hardware wallet. For a treasury: require several signers."
  }), e.masterEnabled && e.regularKey && n.push({
    id: "two-keys",
    severity: "warn",
    title: "Two separate keys can each move everything",
    detail: `Both the master key and the regular key ${e.regularKey} sign alone. Either one leaking loses the account, so the account is only as safe as the less protected of the two.`,
    action: "If the master seed is not kept offline, disable it once you have confirmed the regular key signs."
  }), !e.masterEnabled && e.regularKey && !r && n.push({
    id: "regular-only",
    severity: "info",
    title: "A single regular key controls the account",
    detail: `The master key is disabled and the regular key ${e.regularKey} signs alone. That is a sound setup when that key lives in a hardware wallet or HSM, and a single point of failure when it does not.`
  }), r && (e.masterEnabled && n.push({
    id: "bypassable-multisig",
    severity: "critical",
    title: "The signer list can be bypassed",
    detail: `Quorum ${r.quorum} is configured, but the master key still signs alone, so one stolen seed skips every approval.`,
    action: "Disable the master key once the signers have been confirmed to sign."
  }), r.minimumSigners === 1 / 0 ? n.push({ id: "quorum-unreachable", severity: "critical", title: "The signers can never reach quorum", detail: `Quorum ${r.quorum} is more than the signers' combined weight. Unless another key exists, nothing can be moved.` }) : r.minimumSigners === 1 ? n.push({ id: "one-signer-enough", severity: "critical", title: "One signer can act alone", detail: `A single signer carries quorum ${r.quorum} by weight, so the list gives no second approval.`, action: "Rebalance weights so no single signer reaches quorum." }) : n.push({ id: "multisig", severity: "ok", title: `At least ${r.minimumSigners} of ${r.signers.length} signers must agree`, detail: `Quorum ${r.quorum}. A thief needs ${r.minimumSigners} separate secrets, usually on separate people's devices.` })), !e.masterEnabled && !e.regularKey && !r && n.push({ id: "blackholed", severity: "info", title: "Nothing can sign for this account", detail: "Master key disabled, no regular key, no signer list: the account is blackholed. Nothing can be stolen from it, and nothing can be moved out of it again." });
  const o = e.events.filter((h) => h.at && t - Date.parse(h.at) < 30 * gs && h.kind !== "flag_set" && h.kind !== "flag_cleared");
  o.length && n.push({
    id: "recent-key-change",
    severity: "warn",
    title: `Signing keys changed ${o.length === 1 ? "once" : `${o.length} times`} in the last 30 days`,
    detail: `${o.map((h) => `${h.at.slice(0, 10)}: ${h.detail}`).join(" ")} Taking over an account usually starts with a new regular key or signer list, so every change should be one you made.`,
    action: "If you did not make these changes, treat the account as compromised: open Incident Response now."
  }), e.poisoning.length && n.push({
    id: "poisoning",
    severity: "warn",
    title: `${e.poisoning.length} address-poisoning attempt${e.poisoning.length === 1 ? "" : "s"} against this account`,
    detail: e.poisoning.slice(0, 5).map((h) => `${h.sender} imitates ${h.imitates}, which this account has paid.`).join(" ") + " They sent you something so the fake appears in your history next to the real one.",
    action: "Never copy a destination from transaction history. Keep an address book, and check a pasted address against it before signing."
  }), e.dustReceived >= 3 && n.push({ id: "dust", severity: "info", title: `${e.dustReceived} dust payments received`, detail: "Payments under 0.01 XRP are how links to fake wallets and airdrops reach an account's history. Do not open links that arrive on the ledger." });
  const c = [
    [z.disallowIncomingNFTokenOffer, L.disallowIncomingNFTokenOffer, "NFT offers", "Unsolicited NFT offers are a common phishing carrier: their names and images point at fake claim sites."],
    [z.disallowIncomingCheck, L.disallowIncomingCheck, "checks", "A check someone else created shows up as something to cash; scammers use them as lures."],
    [z.disallowIncomingPayChan, L.disallowIncomingPayChan, "payment channels", "Unsolicited payment channels clutter the account and are rarely legitimate for a personal wallet."]
  ].filter(([h]) => !a(h));
  if (c.length) {
    n.push({
      id: "open-doors",
      severity: "info",
      title: `Strangers can send this account ${c.map((h) => h[2]).join(", ")}`,
      detail: "Refusing them costs nothing and removes channels phishing uses. You can still create them yourself."
    });
    for (const [, h, m, y] of c)
      s.push({ id: `refuse-${h}`, title: `Refuse incoming ${m}`, why: y, tx: { TransactionType: "AccountSet", Account: e.address, SetFlag: h } });
  } else
    n.push({ id: "doors-closed", severity: "ok", title: "Unsolicited NFT offers, checks and payment channels are refused", detail: "The account has closed the channels phishing usually arrives through." });
  a(z.depositAuth) && n.push({ id: "deposit-auth", severity: "ok", title: "Only preauthorised senders can pay this account", detail: "Deposit authorisation is on: nothing arrives unless the account approved the sender, which also blocks dust and poisoning." }), e.masterEnabled && !r && (s.unshift({
    id: "regular-key",
    title: "Sign day to day with a regular key",
    why: "A regular key on a hardware wallet does the signing; the master seed goes offline (paper or steel, never a photo or cloud). If the regular key is ever exposed, the master key replaces it in one transaction.",
    tx: { TransactionType: "SetRegularKey", Account: e.address, RegularKey: "<address of the key on your hardware wallet>" }
  }), s.splice(1, 0, {
    id: "signer-list",
    title: "Or, for a treasury: require two of three signers",
    why: "Three keys held by different people or devices, any two of which must sign. A single stolen seed can no longer move anything.",
    tx: {
      TransactionType: "SignerListSet",
      Account: e.address,
      SignerQuorum: 2,
      SignerEntries: [1, 2, 3].map((h) => ({ SignerEntry: { Account: `<signer ${h} address>`, SignerWeight: 1 } }))
    },
    caution: "Test that the signers can sign a small transaction before relying on the list."
  })), r && e.masterEnabled && s.unshift({
    id: "disable-master",
    title: "Disable the master key",
    why: "So the signer list actually binds: until then one stolen master seed skips the quorum.",
    tx: { TransactionType: "AccountSet", Account: e.address, SetFlag: L.disableMaster },
    caution: "Sign it only after a multisigned test transaction has succeeded. If the signers cannot reach quorum, disabling the master key locks the account permanently."
  }), n.sort((h, m) => Re[h.severity] - Re[m.severity]);
  const d = n.filter((h) => h.severity === "critical").length, l = n.filter((h) => h.severity === "warn").length, u = Math.max(0, Math.min(100, 100 - d * 30 - l * 12 - c.length * 3 - (r && r.minimumSigners >= 2 && !e.masterEnabled ? -5 : 0))), g = u >= 90 ? "A" : u >= 75 ? "B" : u >= 60 ? "C" : u >= 40 ? "D" : "F", f = d > 0 ? "Serious weaknesses: fix the critical findings before holding meaningful value here." : l > 0 ? "Workable, with changes worth making." : "Well protected by what the ledger can show.";
  return { score: u, grade: g, summary: f, findings: n, plan: s };
}
const ps = 946684800, Pe = 131072, ms = {
  accountTx: (e, t, n, s) => b("account_tx", { account: e, ledger_index_min: t, ledger_index_max: -1, forward: !0, limit: n, ...s ? { marker: s } : {} }),
  accountInfo: (e) => b("account_info", { account: e, ledger_index: "validated" }).catch((t) => {
    if (/actNotFound|not found/i.test(t instanceof Error ? t.message : String(t))) return null;
    throw t;
  }),
  sanctions: async (e) => (await Ge(e))?.hits ?? null
}, V = {
  standard: { depth: 2, perAccount: 400 },
  deep: { depth: 5, perAccount: 1e3 }
}, ys = (e) => typeof e == "number" ? new Date((e + ps) * 1e3).toISOString() : null;
function Ce(e) {
  if (typeof e == "string" && /^\d+$/.test(e)) return { currency: "XRP", issuer: null, value: Number(e) / 1e6 };
  if (e && typeof e == "object") {
    const t = e, n = Number(t.value);
    if (typeof t.currency == "string" && Number.isFinite(n)) return { currency: os(t.currency), issuer: t.issuer ?? null, value: n };
  }
  return null;
}
function ws(e, t) {
  const n = t.tx_json ?? t.tx ?? t, s = t.meta ?? {};
  if (t.validated === !1 || s.TransactionResult !== "tesSUCCESS" || n.Account !== e) return null;
  const a = {
    from: e,
    ledger: Number(t.ledger_index ?? n.ledger_index ?? 0),
    at: ys(n.date ?? t.date),
    hash: String(n.hash ?? t.hash ?? ""),
    destinationTag: typeof n.DestinationTag == "number" ? n.DestinationTag : null
  }, r = Ce(s.delivered_amount ?? s.DeliveredAmount);
  if (n.TransactionType === "Payment" && typeof n.Destination == "string" && n.Destination !== e && r)
    return { ...a, to: n.Destination, kind: "payment", amount: r };
  if (n.TransactionType === "AccountDelete" && typeof n.Destination == "string" && r)
    return { ...a, to: n.Destination, kind: "account_delete", amount: r };
  if (n.TransactionType === "EscrowCreate" && typeof n.Destination == "string") {
    const o = Ce(n.Amount);
    if (o) return { ...a, to: n.Destination, kind: "escrow", amount: o };
  }
  return null;
}
async function bs(e, t) {
  const n = t.reader ?? ms, s = t.depth ?? V.standard.depth, a = t.perAccount ?? V.standard.perAccount, r = t.minXrp ?? 1, o = /* @__PURE__ */ new Map(), i = [], c = { count: 0, xrp: 0 }, d = [{ address: e, from: t.sinceLedger, depth: 0 }];
  for (o.set(e, { address: e, depth: 0, status: "source", receivedXrp: 0, balanceXrp: null, domain: null, sanction: null, read: 0, truncated: !1 }); d.length; ) {
    const { address: h, from: m, depth: y } = d.shift(), p = o.get(h), T = await n.accountInfo(h).catch(() => {
    });
    T === void 0 && (p.status = p.status === "source" ? "source" : "unread");
    const w = T?.account_data;
    if (w ? (p.balanceXrp = Number(w.Balance ?? 0) / 1e6, typeof w.Domain == "string" && w.Domain && (p.domain = new TextDecoder().decode(new Uint8Array((w.Domain.match(/../g) ?? []).map((v) => parseInt(v, 16))))), p.status !== "source" && (p.status = p.tagged || (Number(w.Flags ?? 0) & Pe) !== 0 ? "custodial" : "holding")) : T === null && p.status !== "source" && (p.status = "deleted"), p.tagged && p.status !== "source" && (p.status = "custodial"), p.status === "custodial") continue;
    let k;
    do {
      const v = await n.accountTx(h, m, Math.min(400, a - p.read), k).catch(() => ({ transactions: [] })), _ = v.transactions ?? [];
      p.read += _.length;
      for (const x of _) {
        const S = ws(h, x);
        if (!S) continue;
        if (S.amount.currency === "XRP" && S.amount.value < r && S.kind === "payment") {
          c.count += 1, c.xrp += S.amount.value;
          continue;
        }
        i.push(S);
        const le = S.amount.currency === "XRP" ? S.amount.value : 0, D = o.get(S.to);
        if (D) {
          D.receivedXrp += le, S.destinationTag !== null && D.status !== "source" && (D.tagged = !0, D.status = "custodial");
          continue;
        }
        const H = S.destinationTag !== null;
        if (o.set(S.to, { address: S.to, depth: y + 1, status: H ? "custodial" : "holding", receivedXrp: le, balanceXrp: null, domain: null, sanction: null, read: 0, truncated: !1, tagged: H }), !H && y + 1 <= s) {
          d.push({ address: S.to, from: S.ledger, depth: y + 1 });
          continue;
        }
        const q = o.get(S.to), J = await n.accountInfo(S.to).catch(() => {
        });
        if (J === null) q.status = "deleted";
        else if (J?.account_data) {
          const X = J.account_data;
          q.balanceXrp = Number(X.Balance ?? 0) / 1e6, typeof X.Domain == "string" && X.Domain && (q.domain = new TextDecoder().decode(new Uint8Array((X.Domain.match(/../g) ?? []).map((lt) => parseInt(lt, 16))))), q.status = H || (Number(X.Flags ?? 0) & Pe) !== 0 ? "custodial" : "not_followed";
        } else H || (q.status = "not_followed");
      }
      k = v.marker, p.read >= a && k && (p.truncated = !0);
    } while (k && p.read < a);
  }
  const l = [...o.values()], u = await n.sanctions(l.map((h) => h.address)).catch(() => null);
  for (const h of l) h.sanction = u?.[h.address] ?? null;
  const g = /* @__PURE__ */ new Map();
  for (const h of l) {
    const m = h.address.slice(-4).toLowerCase();
    g.set(m, [...g.get(m) ?? [], h.address]);
  }
  const f = [...g].filter(([, h]) => h.length >= 2).map(([h, m]) => ({ ending: h, accounts: m }));
  return { root: e, sinceLedger: t.sinceLedger, depthLimit: s, minXrp: r, nodes: l, flows: i, dust: c, vanity: f, sanctionsChecked: u !== null };
}
const te = (e) => `${e.value.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${e.currency}${e.issuer ? ` (issuer ${e.issuer})` : ""}`;
function vs(e, t) {
  const n = [
    {
      id: "finality",
      title: "No one can reverse a validated XRP Ledger transaction",
      detail: "There is no chargeback on the XRP Ledger. Validators, Ripple, wallet makers and NOSHASHI cannot move funds out of an account without its keys, and anyone offering to 'recover' or 'reverse' stolen XRP for a fee is running the second half of the scam. What follows are the paths that do exist.",
      outlook: "not_possible"
    }
  ], s = e.nodes.filter((d) => d.status === "custodial");
  for (const d of s) {
    const l = e.flows.filter((u) => u.to === d.address);
    n.push({
      id: `freeze-${d.address}`,
      title: `Ask the service behind ${d.address}${d.domain ? ` (${d.domain})` : ""} to freeze the deposit`,
      detail: `This account requires destination tags, the mark of an exchange or custodial service that credits deposits to customer accounts. The service can identify and freeze the customer who received ${l.map((u) => te(u.amount)).join(" and ") || "the funds"} if you reach it before the funds are withdrawn, usually with a police or court reference. Send it the evidence below.`,
      outlook: "possible",
      evidence: l.map((u) => `${u.at ?? `ledger ${u.ledger}`}: ${te(u.amount)} to ${u.to}${u.destinationTag !== null ? ` tag ${u.destinationTag}` : ""}, transaction ${u.hash}`)
    });
  }
  const a = e.flows.filter((d) => d.amount.issuer), r = [...new Set(a.map((d) => d.amount.issuer))];
  for (const d of r) {
    const l = a.filter((u) => u.amount.issuer === d);
    n.push({
      id: `issuer-${d}`,
      title: `Ask the issuer ${d} to freeze, or claw back, its ${l[0].amount.currency}`,
      detail: "Issued tokens are the issuer's obligations. Unless it has given up the right (No Freeze), the issuer can freeze the trust lines now holding its token, and if it enabled clawback it can take the balance back and reissue it. Check the issuer's posture on the Authority screen, then contact it through its published domain with the evidence below.",
      outlook: "possible",
      evidence: l.map((u) => `${u.at ?? `ledger ${u.ledger}`}: ${te(u.amount)} from ${u.from} to ${u.to}, transaction ${u.hash}`)
    });
  }
  const o = e.nodes.filter((d) => d.status === "holding" && d.depth > 0 && (d.balanceXrp ?? 0) > 0);
  o.length && n.push({
    id: "still-held",
    title: `${o.length} account${o.length === 1 ? " still holds" : "s still hold"} XRP from the trail`,
    detail: `${o.map((d) => `${d.address}: ${d.balanceXrp.toLocaleString("en-US")} XRP`).join("; ")}. Nothing on the ledger can move it without that account's key, but law enforcement can act on an identified owner, and Ledger Watch can alert you the moment it moves (and where to).`,
    outlook: "unlikely"
  });
  const i = e.nodes.filter((d) => d.status === "deleted" && d.depth > 0);
  i.length && n.push({
    id: "deleted",
    title: `${i.length} account${i.length === 1 ? " in the trail was" : "s in the trail were"} deleted after use`,
    detail: "Throwaway accounts that sweep their balance onward with AccountDelete: the value is not in them any more. It is followed to where it went.",
    outlook: "not_possible"
  });
  const c = e.nodes.filter((d) => d.sanction);
  if (c.length && n.push({
    id: "sanctioned",
    title: "The trail reaches an address on the OFAC SDN list",
    detail: `${c.map((d) => `${d.address} (${d.sanction.entityName})`).join("; ")}. Report it with this dossier; US and allied authorities act on listed parties.`,
    outlook: "possible"
  }), t && t.stillHoldsXrp > 0) {
    const d = t.keyEvents.find((l) => l.kind === "regular_key_set" || l.kind === "signer_list_set");
    n.push({
      id: "secure-remaining",
      title: `Move the remaining ${t.stillHoldsXrp.toLocaleString("en-US")} XRP to a new account now`,
      detail: `${d ? `The account's keys were changed (${d.detail}) If that was not you, the thief may still sign. ` : ""}Create a new account on a device that never held the old seed, and move what is left while you still can: whoever has the key can empty it at any time. Then never reuse the old seed.`,
      outlook: "protective"
    });
  }
  return n.push({
    id: "report",
    title: "Report it, with this dossier",
    detail: "File a report with the police where you live (in the US, the FBI's IC3 at ic3.gov; in the UK, Action Fraud) and give them the dossier: exchanges act on law-enforcement requests far faster than on individuals'. Keep the transaction hashes: they are the evidence.",
    outlook: "possible"
  }), n;
}
function ks(e, t, n) {
  const s = [], a = n.filter((d) => d.from === e).sort((d, l) => d.ledger - l.ledger), r = a[0], o = t.filter((d) => d.kind === "regular_key_set" || d.kind === "signer_list_set" || d.kind === "master_disabled"), i = r ? o.filter((d) => d.ledger <= r.ledger && r.ledger - d.ledger < 1e5) : [];
  i.length ? s.push({
    id: "key-then-drain",
    severity: "critical",
    title: "Signing keys changed, then value left",
    detail: `${i.map((d) => `${d.at?.slice(0, 16).replace("T", " ") ?? `ledger ${d.ledger}`}: ${d.detail}`).join(" ")} Value started leaving at ${r.at?.slice(0, 16).replace("T", " ") ?? `ledger ${r.ledger}`}. An attacker who adds their own key can keep signing after the owner notices.`
  }) : r && s.push({
    id: "seed-used",
    severity: "warn",
    title: "Value left with no change of keys",
    detail: "The account's existing key signed the transfers, which usually means the secret seed itself was exposed (a phishing site, a fake wallet, a cloud backup or a screenshot). Anything else secured by that seed is exposed too."
  });
  const c = a.filter((d) => d.amount.currency === "XRP").reduce((d, l) => d + l.amount.value, 0);
  if (a.length) {
    const d = new Set(a.map((l) => l.to));
    s.push({
      id: "outflow",
      severity: "info",
      title: `${c.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP left in ${a.length} transfer${a.length === 1 ? "" : "s"} to ${d.size} account${d.size === 1 ? "" : "s"}`,
      detail: a.slice(0, 5).map((l) => `${l.amount.value.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${l.amount.currency} to ${l.to}${l.kind === "account_delete" ? " (account deleted)" : ""}`).join("; ") + (a.length > 5 ? "; …" : "")
    });
  }
  return a.some((d) => d.kind === "account_delete") && s.push({ id: "deleted", severity: "info", title: "The account was deleted", detail: "Its remaining XRP was swept to the destination of its AccountDelete. The address can be funded again, but its history stays on the ledger." }), s;
}
const Ss = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/, Ts = /^[0-9A-Fa-f]{64}$/;
class M extends Error {
}
function O(e, t = "address") {
  const n = String(e[t] ?? "").trim();
  if (!Ss.test(n)) throw new M(`${t} must be a classic XRPL address starting with r.`);
  return n;
}
function Le(e, t) {
  const n = String(e[t] ?? "").trim();
  if (!Ts.test(n)) throw new M(`${t} must be 64 hexadecimal characters.`);
  return n;
}
const $ = (e, t = Object.keys(e)) => ({ type: "object", properties: e, required: t, additionalProperties: !1 }), I = (e) => ({ type: "string", description: e }), $s = [
  {
    name: "search_noshashi",
    description: "Search NOSHASHI's own pages and help: every app screen and button, features, plans and prices, the Learn course and word list, docs (API, webhooks, receipts, policies, security, enterprise), trust, legal and privacy. Use it for any question about the product, what a customer should use, or how NOSHASHI handles compliance. Returns passages with their page address.",
    input_schema: $({ query: { type: "string", description: "What to look up, in plain words" } }),
    feature: null,
    screen: "NOSHASHI pages",
    run: async (e) => {
      const t = String(e.query ?? "").trim();
      if (!t) throw new M("query is empty.");
      const n = await st(t, 6);
      return n.length === 0 ? "Nothing in NOSHASHI's pages matches that. Say so rather than guess." : n.map((s) => ({ title: s.title, source: s.source, text: s.text }));
    }
  },
  {
    name: "ledger_status",
    description: "The latest validated XRP Ledger: index, hash, close time, reference fee and open-ledger fee. Call this to stamp an answer with the ledger it describes.",
    input_schema: $({}),
    feature: null,
    screen: "Mission Control",
    run: () => mt()
  },
  {
    name: "ledger_sync",
    description: "What four public XRPL servers each report right now (ledger index, state, fees) and where they disagree.",
    input_schema: $({}),
    feature: null,
    screen: "Ledger Sync",
    run: () => Ln()
  },
  {
    name: "check_address",
    description: "What the ledger publishes about an account before someone pays it: existence, age, destination tag requirement, flags and anything recorded against it. Reports facts, never 'safe'.",
    input_schema: $({ address: I("Classic address, r…") }),
    feature: null,
    screen: "Check an Address",
    run: async (e, t) => {
      const n = O(e), s = !t.has("portfolios");
      if (s && !t.spendFreeCheck())
        throw new M("This month's 10 free address checks are used up. Pro includes unlimited checks.");
      const a = await Ft(n);
      if (a.verdict === "unknown" && !a.exists && a.findings.length === 0)
        throw s && t.refundFreeCheck?.(), new Error("The ledger could not be reached, so nothing about this address is known yet. Try again in a moment.");
      return a;
    }
  },
  {
    name: "read_claims",
    description: "Tokens and claims other accounts have sent to an address, and whether each is real or an impersonation (a familiar ticker from an issuer with no obligations).",
    input_schema: $({ address: I("Classic address whose inbox to read") }),
    feature: null,
    screen: "Inbox",
    run: (e) => yn(O(e))
  },
  {
    name: "read_token_rights",
    description: "What an NFT's issuer can still do after someone owns it: burnable, transferable, transfer fee, taxon.",
    input_schema: $({ token_id: I("The 64-character NFTokenID") }),
    feature: null,
    screen: "Token Rights",
    run: (e) => En(Le(e, "token_id"))
  },
  {
    name: "certify_authority",
    description: "The six issuer checks (freeze surrendered, not globally frozen, open holding, no single key controls the issuer, transfer fee, supply concentration) with GO/HOLD/NO-GO, ledger index and SHA-256 digest.",
    input_schema: $({ issuer: I("Issuer's classic address") }),
    feature: "authority_certificate",
    screen: "Authority",
    run: (e) => Kn(O(e, "issuer"), { walkSupply: !1 })
  },
  {
    name: "read_provenance",
    description: "Where an account came from: its real age (corrected for the Sequence misreading) and the account that first funded it.",
    input_schema: $({ address: I("Counterparty address") }),
    feature: "portfolios",
    screen: "Provenance",
    run: (e) => zt(O(e))
  },
  {
    name: "read_book",
    description: "An order book's listed versus funded depth (offers whose owners can really fill them), the unfunded share, spread and mid price. The book is the currency against XRP.",
    input_schema: $({
      currency: { type: "string", description: "Currency code, e.g. USD, or a 40-character hex code" },
      issuer: I("Issuer's classic address")
    }),
    feature: "portfolios",
    screen: "Order Book",
    run: (e) => {
      const t = String(e.currency ?? "").trim();
      if (!/^([A-Za-z0-9]{3}|[0-9A-Fa-f]{40})$/.test(t))
        throw new M("currency must be a 3-character code or 40 hexadecimal characters.");
      return Kt(t, O(e, "issuer"));
    }
  },
  {
    name: "read_settlement",
    description: "What a transaction actually delivered: type, sender, result, whether the partial-payment flag was set, requested versus delivered amount, and the fee burned.",
    input_schema: $({ hash: I("Transaction hash, 64 hexadecimal characters") }),
    feature: "portfolios",
    screen: "Settlement",
    run: (e) => Qt(Le(e, "hash"))
  },
  {
    name: "read_control_surface",
    description: "Who can move an account's funds: master key status, regular key, signer list and quorum, the fewest signers that reach quorum, master-key bypass, and XRP locked in reserve.",
    input_schema: $({ address: I("Treasury or issuer address") }),
    feature: "portfolios",
    screen: "Control Surface",
    run: (e) => Ke(O(e))
  },
  {
    name: "read_pool",
    description: "An AMM pool's balances, trading fee, fee votes weighted by LP tokens, and who holds the auction slot.",
    input_schema: $({ amm_account: I("The AMM pool's own account address") }),
    feature: "portfolios",
    screen: "Pool Governance",
    run: (e) => nn({ ammAccount: O(e, "amm_account") })
  },
  {
    name: "read_issuance",
    description: "A token from the issuer's side: currencies issued, outstanding obligations, holder lines read, the largest holder, concentration, and enforcement history (freezes and clawbacks).",
    input_schema: $({ issuer: I("Issuer's classic address") }),
    feature: "portfolios",
    screen: "Issuance",
    run: (e) => Je(O(e, "issuer"))
  },
  {
    name: "security_check",
    description: "How hard an XRP Ledger account is to take over: who can sign (master key, regular key, signer list and its real quorum), recent key and settings changes, address-poisoning attempts against it, the doors strangers can use (NFT offers, checks, payment channels), a 0–100 score, and an unsigned hardening plan to sign in the owner's own wallet.",
    input_schema: $({ address: I("The account to check, r…") }),
    feature: null,
    screen: "Security Center",
    run: async (e) => {
      const t = await Fe(O(e));
      return { posture: { ...t, events: t.events.slice(0, 10) }, assessment: fs(t) };
    }
  },
  {
    name: "investigate_hack",
    description: "For an account that was drained or hacked: the key changes before it, the stolen value followed hop by hop (payments and AccountDelete sweeps, past the dust), what became of every account it reached, and every recovery path that exists. Validated XRP Ledger transactions cannot be reversed; this says which off-ledger paths apply.",
    input_schema: $(
      {
        address: I("The drained account, r…"),
        from_ledger: { type: "number", description: "Ledger the incident began at, if known" }
      },
      ["address"]
    ),
    feature: "incident_response",
    screen: "Security Center › Incident Response",
    run: async (e, t) => {
      const n = O(e), s = await Fe(n, 400), a = Number(e.from_ledger), r = [...s.events].reverse().find((d) => d.kind === "regular_key_set" || d.kind === "signer_list_set"), o = Number.isInteger(a) && a > 0 ? a : r?.ledger ?? Math.max(1, s.ledgerIndex - 21600 * 30), i = t.has("forensic_trace") ? V.deep : V.standard, c = await bs(n, { sinceLedger: o, depth: i.depth, perAccount: i.perAccount });
      return {
        signals: ks(n, s.events, c.flows),
        trace: { ...c, flows: c.flows.slice(0, 40) },
        options: vs(c, { stillHoldsXrp: s.exists ? s.balanceXrp : 0, keyEvents: s.events })
      };
    }
  }
];
function j(e) {
  return $s.find((t) => t.name === e);
}
async function ne(e, t, n) {
  const s = j(e);
  if (!s) return { ok: !1, error: `No tool named ${e}.` };
  if (s.feature && !n.has(s.feature))
    return { ok: !1, gated: !0, error: `${s.screen} needs a Pro plan or higher.` };
  try {
    return { ok: !0, value: await s.run(t ?? {}, n) };
  } catch (a) {
    return { ok: !1, error: a instanceof Error ? a.message : "The read failed." };
  }
}
const at = /\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/g, it = /\b[0-9A-Fa-f]{64}\b/g, As = /\b[0-9A-F]{40}\b/g, _s = /\b[A-Z][A-Z0-9]{2}\b/g, xs = /* @__PURE__ */ new Set([
  "XRP",
  "AMM",
  "NFT",
  "KYC",
  "AML",
  "API",
  "HHI",
  "UNL",
  "DEX",
  "SSO",
  "CSV",
  "PDF",
  "FAQ",
  "LP",
  "TLS",
  "MAU",
  "CEO",
  "CFO",
  "CTO",
  "ETA",
  "SLA",
  "DPA",
  "MSA",
  "TAG",
  "THE",
  "AND",
  "FOR",
  "YOU",
  "CAN",
  "HOW",
  "WHO",
  "WHY",
  "ARE",
  "NOT",
  "BUT",
  "HUD",
  "GO",
  "OFF",
  "USE",
  "ANY",
  "ALL",
  "OUR",
  "HAS",
  "WAS",
  "RWA",
  "VASP",
  "CASP",
  "SHA",
  "XLS",
  "FATF",
  "OFAC",
  "MICA"
]);
function Ns(e) {
  const t = (r) => [...new Set(r)], n = t(e.match(it) ?? []).map((r) => r.toUpperCase()), s = (e.match(As) ?? []).filter((r) => !n.some((o) => o.includes(r))), a = (e.match(_s) ?? []).filter((r) => !xs.has(r));
  return {
    addresses: t(e.match(at) ?? []),
    hashes: n,
    currencies: t([...a, ...s])
  };
}
const Is = { certify_authority: "issuer", read_issuance: "issuer", read_pool: "amm_account" }, Es = [
  {
    tool: "certify_authority",
    label: "issuer powers",
    needs: "address",
    words: /freez|frozen|claw ?back|clawback|seiz|issuer (power|control|setting|right|flag)|authority|certif|require ?auth|transfer fee|blackhol|no ?freeze|what can (the|this) issuer|can the issuer/i
  },
  {
    tool: "read_control_surface",
    label: "who controls the account",
    needs: "address",
    words: /signer|multi-?sig|quorum|master key|regular key|who (can|really) (move|control|sign)|who controls|control surface|treasury|reserve|locked|escrow/i
  },
  {
    tool: "read_provenance",
    label: "where the account came from",
    needs: "address",
    words: /provenance|how old|account age|\bage\b|first fund|funded (it|by|this)|who funded|where .*(come|came) from|new account|created|history of (the|this) account/i
  },
  {
    tool: "read_issuance",
    label: "supply and holders",
    needs: "address",
    words: /holders?\b|supply|issuance|obligation|concentrat|circulat|largest holder|who holds|outstanding/i
  },
  {
    tool: "read_claims",
    label: "tokens sent to the account",
    needs: "address",
    words: /inbox|claims?\b|airdrop|sent (me|to me|this account)|impersonat|fake token|spam token|scam token|unknown token/i
  },
  {
    tool: "read_pool",
    label: "AMM pool",
    needs: "address",
    words: /\bamm\b|\bpool\b|lp token|auction slot|fee vote|liquidity pool/i
  },
  {
    tool: "read_book",
    label: "order-book depth",
    needs: "book",
    words: /depth|liquid|order ?book|\bbook\b|\bexit\b|sell|slippage|spread|unfunded|\bfunded\b|listed|could i (get out|exit)|at size|mid price/i
  },
  {
    tool: "read_token_rights",
    label: "NFT rights",
    needs: "hash",
    words: /\bnft\b|nftoken|token ?id|token rights|burnable|royalt/i
  },
  {
    tool: "read_settlement",
    label: "what the transaction delivered",
    needs: "hash",
    words: /deliver|arriv|payment|settle|partial|transaction|\btx\b|\bhash\b|credited|received|what happened/i
  },
  {
    tool: "check_address",
    label: "address check",
    needs: "address",
    words: /sanction|\bofac\b|\bsdn\b|blacklist|\bpay\b|paying|send (to|money|xrp)|safe|scam|legit|trust(worthy)?\b|check (this|the|an|that)? ?(address|account|wallet)|counterparty|risky|who is|is (this|it) (ok|fine|real)|destination tag/i
  },
  {
    tool: "investigate_hack",
    label: "what happened to a drained account",
    needs: "address",
    words: /hack|hacked|stolen|stole|drain|drained|compromis|emptied|scammed|took my|lost my (xrp|funds|money|tokens)|recover (my|the|stolen|lost)|get (it|my (xrp|funds|money)) back|reverse (a|the|my|this) (transaction|payment|transfer)|trace (the|my|where)|where did (it|my|the) (go|xrp|funds|money)/i
  },
  {
    tool: "security_check",
    label: "account security",
    needs: "address",
    words: /secur|protect|harden|safe(ty)? of (my|this|the) (account|wallet)|takeover|take over|regular key|multi-?sig|lock (down|my)|poison|lookalike|attack/i
  },
  {
    tool: "ledger_sync",
    label: "server agreement",
    needs: "none",
    words: /\bservers?\b|\bnodes?\b|in sync|disagree|ledger sync|which server/i
  },
  {
    tool: "ledger_status",
    label: "network status",
    needs: "none",
    words: /ledger (index|status|height|number)|latest ledger|current ledger|network (status|fee|busy)|\bfees? (now|right now|today)|reference fee|is the (network|ledger) (up|live|working)/i
  }
], Os = /noshashi|noshx|\bplans?\b|pricing|price|cost|which screen|how (do|can|should) i|what (is|are|does)|explain|difference between|what does .* mean|travel rule|\bkyc\b|\baml\b|mica|webhook|\bapi\b|examiner|auditor/i, Fs = /\bNSH-?\s?(\d{1,9})\b/gi, se = /self[- ]?repair|\brepair\b|diagnos|troubleshoot|health ?check|not working|isn'?t working|doesn'?t work|stopped working|\bbroken\b|won'?t (load|connect|open|start|sign)|can'?t (connect|sign in|log in|load)|keeps? (disconnect|signing me out|failing)|\bfix (it|the app|this|noshashi|my app|yourself|everything)\b|something('?s| is) wrong|check (the app|everything|my setup)/i, Rs = /\b(my|our|open|active|all|pending|unresolved|resolved|recent|customer|support) tickets?\b|\btickets? (queue|inbox|waiting|list)\b|\blist (the |my |all )?tickets\b|\bany tickets\b|\bshow (me )?(the |my )?tickets\b/i, Ps = /\b(open|file|create|raise|start|submit|log) (a |an |new |the )?(support )?(ticket|case with support|support request)\b|\b(contact|tell|email|message) support\b|\breport (a |this |the )?bug\b/i, De = /\b(with|attach|include|send) (this|the|a|my)? ?(self-?repair |repair |diagnostic )?(report|diagnostics|results)\b/i;
function He(e, t) {
  const n = e.slice(t);
  return (/^\s*(?::|—|-|,)?\s*(?:saying|say|with|that|and say|telling (?:them|him|her))?\s*[:,]?\s*([\s\S]*)$/i.exec(n)?.[1] ?? "").trim().replace(/^["'“]|["'”]$/g, "").trim();
}
function Cs(e) {
  const t = [];
  let n = e;
  const s = [...e.matchAll(Fs)].map((o) => ({ ref: `NSH-${o[1]}`, index: o.index ?? 0, end: (o.index ?? 0) + o[0].length })), a = /\b(reply|respond|write|add|post|answer back|tell (?:them|the customer))(?: to| on| in)?\s+NSH-?\s?(\d{1,9})\b/i.exec(e);
  if (a) {
    const o = He(e, (a.index ?? 0) + a[0].length);
    return o.length >= 10 ? (t.push({ tool: "reply_ticket", input: { ticket: `NSH-${a[2]}`, message: o }, why: "reply to the ticket" }), n = e.slice(0, a.index)) : t.push({ tool: "read_ticket", input: { ticket: `NSH-${a[2]}` }, why: "the ticket to reply to (no message given)" }), { calls: t, rest: n };
  }
  const r = Ps.exec(e);
  if (r) {
    if (De.test(e) || se.test(e))
      return t.push({ tool: "self_repair", input: { open_ticket: !0 }, why: "repair, then open a ticket with the report" }), { calls: t, rest: "" };
    const o = He(e, (r.index ?? 0) + r[0].length).replace(/^(about|for|regarding|because|that)\s+/i, "");
    if (o.length >= 10) {
      const i = (o.split(/[.!?](?:\s|$)|\n/)[0] ?? o).trim().slice(0, 100);
      return t.push({ tool: "open_ticket", input: { subject: i.length >= 4 ? i : o.slice(0, 100), body: o }, why: "open a support ticket" }), { calls: t, rest: e.slice(0, r.index) };
    }
    return { calls: t, rest: "", note: "To open a ticket, say what happened after it, for example: open a ticket: the Ledger Watch tab shows no events since this morning." };
  }
  for (const { ref: o } of s) {
    const i = e;
    /\b(re-?open|not (solved|fixed|resolved))\b/i.test(i) ? t.push({ tool: "set_ticket_status", input: { ticket: o, status: "open" }, why: "reopen the ticket" }) : /\b(close|resolve|mark (it |this )?(as )?(resolved|solved|done|closed)|it'?s (solved|fixed))\b/i.test(i) ? t.push({ tool: "set_ticket_status", input: { ticket: o, status: "resolved" }, why: "resolve the ticket" }) : /\bmark (it |this )?(as )?answered\b/i.test(i) ? t.push({ tool: "set_ticket_status", input: { ticket: o, status: "answered" }, why: "mark the ticket answered" }) : /\b(answer|draft|suggest)\b/i.test(i) ? t.push({ tool: "answer_ticket", input: { ticket: o, send: /\b(send|post|and reply|submit) (it|that|this|the (draft|answer|reply))?\b|\band send\b/i.test(i) }, why: "answer the ticket from NOSHASHI's pages" }) : se.test(i) || De.test(i) ? t.push({ tool: "self_repair", input: { post_to_ticket: o }, why: "repair and post the report to the ticket" }) : t.push({ tool: "read_ticket", input: { ticket: o }, why: "read the ticket" });
  }
  if (s.length) return { calls: t, rest: s.reduceRight((o, i) => o.slice(0, i.index) + o.slice(i.end), e) };
  if (Rs.test(e)) {
    const o = /\bresolved\b|\bclosed\b/i.test(e) && !/unresolved/i.test(e) ? "resolved" : /\ball\b/i.test(e) ? "any" : "active";
    return t.push({ tool: "list_tickets", input: { status: o }, why: "the support tickets" }), { calls: t, rest: "" };
  }
  return se.test(e) && t.push({ tool: "self_repair", input: {}, why: "check and repair the app" }), { calls: t, rest: n };
}
function rt(e, t = {}) {
  const n = t.tickets ? Cs(e) : { calls: [], rest: e };
  e = n.rest;
  const s = Ns(e), a = [...n.calls], r = (i) => {
    a.some((c) => c.tool === i.tool && JSON.stringify(c.input) === JSON.stringify(i.input)) || a.push(i);
  };
  for (const i of Es)
    if (i.words.test(e))
      if (i.needs === "address")
        for (const c of s.addresses) r({ tool: i.tool, input: { [Is[i.tool] ?? "address"]: c }, why: i.label });
      else if (i.needs === "hash")
        for (const c of s.hashes)
          r({ tool: i.tool, input: i.tool === "read_token_rights" ? { token_id: c } : { hash: c }, why: i.label });
      else if (i.needs === "book") {
        const c = s.addresses[0];
        for (const d of s.currencies) c && r({ tool: i.tool, input: { currency: d, issuer: c }, why: i.label });
      } else
        r({ tool: i.tool, input: {}, why: i.label });
  if (a.length === 0 && e.trim()) {
    for (const i of s.hashes) r({ tool: "read_settlement", input: { hash: i }, why: "a hash on its own" });
    for (const i of s.addresses) r({ tool: "check_address", input: { address: i }, why: "an address on its own" });
  }
  const o = a.length === 0 && e.trim().length > 0 || n.calls.length === 0 && Os.test(e.replace(at, " ").replace(it, " "));
  return { calls: a.slice(0, 6), knowledge: o, entities: s, note: n.note };
}
const Ls = et.scenes, Ds = R("noshashi noshx plan plans need use screen screens help feature which tool tools we our us want get way much many cost price pay"), Hs = /\bwhich\b|\bwhat (screen|tool|plan|should)|how (do|can|does|should) (i|we|noshashi)|\bhelp\b|\bneed\b|\buse\b|where (do|can)|feature/i;
function qs(e, t = 3) {
  const n = new Set(R(e));
  for (const s of Ds) n.delete(s);
  return Ls.map((s) => {
    const a = R(`${s.name} ${s.name} ${s.summary}`), r = a.filter((o) => n.has(o)).length;
    return { scene: s, score: r / Math.sqrt(a.length + 4) };
  }).filter((s) => s.score > 0.12).sort((s, a) => a.score - s.score).slice(0, t).map((s) => s.scene);
}
const qe = { critical: 0, warn: 1, info: 2, ok: 3 }, Xs = { critical: "✕", warn: "!", info: "·", ok: "✓" };
function E(e, t = 6) {
  const n = [...e].sort((s, a) => qe[s.severity] - qe[a.severity]).slice(0, t);
  return n.length === 0 ? "Nothing notable was recorded." : n.map((s) => `${Xs[s.severity]} ${s.title}. ${s.detail}${s.action ? ` What to do: ${s.action}` : ""}`).join(`
`);
}
const F = (e) => e ? ` (validated ledger ${e.toLocaleString("en-US")})` : "", Xe = (e) => e.length > 12 ? `${e.slice(0, 6)}…${e.slice(-4)}` : e;
function ze(e, t) {
  switch (e) {
    case "check_address": {
      const n = t, s = B[n.verdict];
      return [
        `Address check for ${n.address}${F(n.ledgerIndex)}: ${s.label}.${n.headline === s.label ? "" : ` ${n.headline}`}`,
        n.exists ? `Balance ${n.balanceXrp.toLocaleString("en-US")} XRP${n.domain ? `, claims the domain ${n.domain} (claimed, not verified)` : ""}${n.isIssuer ? `, issues ${n.issuedCurrencies.join(", ") || "tokens"}` : ""}.` : "",
        E(n.findings),
        "This reports what the ledger publishes. Nothing recorded against an address is not the same as safe."
      ].filter(Boolean).join(`
`);
    }
    case "certify_authority": {
      const n = t, s = n.checks.map((a) => {
        const r = qn(a);
        return `${r === "PASS" ? "✓" : r === "FAIL" ? "✕" : "!"} ${a.label} (${a.severity === "block" ? "blocking" : "warning"}): ${r}. ${a.detail}`;
      }).join(`
`);
      return [
        `Authority certificate for issuer ${n.issuer}${n.currencyLabel ? ` (${n.currencyLabel})` : ""}${F(n.ledgerIndex)}: ${n.verdict.toUpperCase()}.`,
        s,
        `Digest ${n.digest.slice(0, 16)}…, so anyone can re-check this reading.`
      ].join(`
`);
    }
    case "read_control_surface": {
      const n = t;
      return [
        `Who controls ${n.address}${F(n.ledgerIndex)}: master key ${n.masterKeyEnabled ? "enabled" : "disabled"}${n.regularKey ? `, regular key ${Xe(n.regularKey)}` : ""}${n.signers.present ? `, signer list quorum ${n.signers.quorum} with the fewest signers that reach it being ${n.signers.minimumSigners}` : ", no signer list"}. Balance ${n.balanceXrp.toLocaleString("en-US")} XRP, ${n.reserveLockedXrp.toLocaleString("en-US")} XRP locked in reserve${n.escrowedXrp ? `, ${n.escrowedXrp.toLocaleString("en-US")} XRP in escrow` : ""}.`,
        E(Dt(n))
      ].join(`
`);
    }
    case "read_provenance": {
      const n = t;
      return [`Provenance of ${n.address}${n.ageDays !== void 0 ? `, about ${Math.round(n.ageDays).toLocaleString("en-US")} days old` : ""}${n.fundedBy ? `, first funded by ${n.fundedBy}` : ""}:`, E(jt(n))].join(`
`);
    }
    case "read_book": {
      const n = t;
      return [`Order book${F(n.ledgerIndex)}:`, E(Yt(n))].join(`
`);
    }
    case "read_settlement": {
      const n = t;
      return [
        `Transaction ${Xe(n.hash)}${F(n.ledgerIndex)}: ${n.transactionType}, result ${n.result}${n.validated ? "" : " (not yet validated, so nothing here is final)"}.`,
        E(en(n))
      ].join(`
`);
    }
    case "read_pool": {
      const n = t;
      return [`AMM pool${F(n.ledgerIndex)}:`, E(rn(n))].join(`
`);
    }
    case "read_issuance": {
      const n = t;
      return [`Issuance${F(n.ledgerIndex)}:`, E(gn(n))].join(`
`);
    }
    case "read_claims": {
      const n = t;
      return [`Tokens sent to the account${F(n.ledgerIndex)}:`, E(bn(n))].join(`
`);
    }
    case "read_token_rights":
      return ["NFT rights:", E(On(t))].join(`
`);
    case "ledger_sync":
      return ["What the public servers report:", E(Dn(t))].join(`
`);
    case "ledger_status": {
      const n = t;
      return `Latest validated ledger ${n.ledgerIndex.toLocaleString("en-US")}, closed ${n.closeTime}. Reference fee ${n.baseFeeXrp} XRP; the open ledger is charging ${n.openLedgerFeeXrp} XRP with ${n.queueSize} transactions queued.`;
    }
    case "security_check": {
      const { posture: n, assessment: s } = t;
      if (!n.exists) return `Security check for ${n.address}: there is no account at this address (never funded, or deleted).`;
      const a = s.plan.length ? `
Hardening plan (unsigned; review and sign each in your own wallet, NOSHASHI never signs):
${s.plan.map((r) => `→ ${r.title}: ${JSON.stringify(r.tx)}${r.caution ? ` Before signing: ${r.caution}` : ""}`).join(`
`)}` : "";
      return [`Security check for ${n.address}${F(n.ledgerIndex)}: grade ${s.grade}, ${s.score}/100. ${s.summary}`, E(s.findings), a].filter(Boolean).join(`
`);
    }
    case "investigate_hack": {
      const n = t, s = n.trace.nodes.filter((a) => a.depth > 0).map((a) => `${a.address} (hop ${a.depth}): ${a.status.replace("_", " ")}${a.balanceXrp !== null ? `, ${a.balanceXrp} XRP` : ""}${a.sanction ? `, OFAC SDN ${a.sanction.entityName}` : ""}`);
      return [
        `Incident on ${n.trace.root}, traced from ledger ${n.trace.sinceLedger.toLocaleString("en-US")} up to ${n.trace.depthLimit} hops:`,
        ...n.signals.map((a) => `${a.severity === "critical" ? "✕" : a.severity === "warn" ? "!" : "·"} ${a.title}. ${a.detail}`),
        s.length ? `Where the value went:
${s.slice(0, 12).join(`
`)}` : "",
        n.trace.dust.count ? `(${n.trace.dust.count} dust payments under ${n.trace.minXrp} XRP were not followed.)` : "",
        `Recovery paths:
${n.options.map((a) => `[${a.outlook.replace("_", " ").toUpperCase()}] ${a.title}. ${a.detail}`).join(`
`)}`,
        "The full trail and a SHA-256 dossier for police and exchanges are in SECURITY CENTER › INCIDENT RESPONSE."
      ].filter(Boolean).join(`
`);
    }
    default:
      return j(e)?.compose?.(t) ?? "";
  }
}
function zs(e) {
  return e.replace(/^Q: .*$/m, "").replace(/^A: /m, "").replace(/([.!?])\s+/g, `$1
`).split(/\n+/).map((t) => t.trim()).filter((t) => t.length > 25 && !/^[|·—-]/.test(t));
}
function Us(e, t) {
  if (t.length === 0) return "";
  const n = new Set(R(e)), s = t[0], a = /^(Help ›|Support ›|Learn NOSHASHI › Knowledge check|Pricing ›)/, r = t.slice(0, 2).find((g) => a.test(g.title) && g.score >= s.score * 0.85);
  if (r) {
    let g = r.text.replace(/^Q: .*\nA: /, "");
    return /^(Help|Support) ›/.test(r.title) && (g = g.split(`
`).slice(1).join(`
`) || g), `${g}

Source: ${r.title} · ${r.source}`;
  }
  if (s.title.startsWith("Learn NOSHASHI › Word list")) {
    const g = s.text.split(`
`).find((f) => R(f.split(":")[0]).some((h) => n.has(h)));
    if (g) return `${g}

Source: NOSHASHI word list · ${s.source}`;
  }
  const o = t.slice(0, 3).flatMap(
    (g, f) => zs(g.text).map((h, m) => {
      const y = R(h), p = y.filter((T) => n.has(T)).length;
      return { hit: g, sentence: h, position: m, score: p / Math.sqrt(y.length + 1) + (f === 0 ? 0.3 : 0) - m * 0.01 };
    })
  ), i = /* @__PURE__ */ new Set(), c = o.filter((g) => g.score > 0).sort((g, f) => f.score - g.score).filter((g) => {
    const f = g.sentence.toLowerCase().replace(/\s+/g, " ");
    return !i.has(f) && i.add(f);
  }).slice(0, 4);
  if (c.length === 0) return `${s.text.slice(0, 600)}

Source: ${s.title} · ${s.source}`;
  const d = /* @__PURE__ */ new Map();
  for (const g of c) d.set(g.hit, [...d.get(g.hit) ?? [], g]);
  const l = [], u = [];
  for (const [g, f] of d)
    l.push(f.sort((h, m) => h.position - m.position).map((h) => h.sentence).join(" ")), u.push(`${g.title} · ${g.source}`);
  return `${l.join(`

`)}

Source${u.length > 1 ? "s" : ""}: ${u.join("; ")}`;
}
async function Ms(e, t, n) {
  const s = rt(e, { tickets: !!j("list_tickets") }), a = [], r = (u) => {
    a.push(u), n?.(u);
  }, o = await Promise.all(
    s.calls.map(async (u) => {
      const g = await ne(u.tool, u.input, t), f = s.calls.some((h) => h.tool === "check_address" && h.input.address === u.input.issuer);
      if (g.ok === !1 && g.gated && u.tool === "certify_authority" && typeof u.input.issuer == "string" && !f) {
        const h = await ne("check_address", { address: u.input.issuer }, t);
        if (h.ok)
          return r({ kind: "tool", name: "check_address", input: { address: u.input.issuer }, ok: !0, summary: "read" }), { call: { ...u, tool: "check_address", input: { ...u.input, address: u.input.issuer } }, result: h, gatedFrom: u };
      }
      if (!g.ok && u.tool === "read_settlement" && !g.gated) {
        const h = await ne("read_token_rights", { token_id: u.input.hash }, t);
        if (h.ok)
          return r({ kind: "tool", name: "read_token_rights", input: { token_id: u.input.hash }, ok: !0, summary: "read" }), { call: { ...u, tool: "read_token_rights" }, result: h };
      }
      return r({
        kind: "tool",
        name: u.tool,
        input: u.input,
        ok: g.ok,
        summary: g.ok ? "read" : g.error
      }), { call: u, result: g };
    })
  ), i = [];
  for (const u of o) {
    const { call: g, result: f } = u, h = j(g.tool)?.screen ?? g.tool;
    f.ok && "gatedFrom" in u ? i.push(
      `${ze(g.tool, f.value)}

That is the free address check. The six issuer checks with a GO/HOLD/NO-GO certificate need Pro in the app, and are free on the website without an account: https://www.noshashi.app/certificate/`
    ) : f.ok ? i.push(ze(g.tool, f.value)) : f.gated ? i.push(
      g.tool === "certify_authority" ? `${h}: ${f.error} The same six issuer checks are free on the website, without an account: https://www.noshashi.app/certificate/ (paste ${String(g.input.issuer ?? "the issuer address")}).` : `${h}: ${f.error} It is available after upgrading in Pricing.`
    ) : j(g.tool)?.compose ? i.push(`${h}: ${f.error}`) : i.push(`${h}: could not be read. ${f.error}`);
  }
  let c = "";
  if (s.knowledge) {
    const u = await st(e, 5).catch(() => []);
    if (r({ kind: "tool", name: "search_noshashi", input: { query: e.slice(0, 60) }, ok: u.length > 0, summary: u.length ? `${u.length} passages` : "nothing matched" }), c = Us(e, u), Hs.test(e)) {
      const g = qs(e);
      g.length > 0 && (c += `${c ? `

` : ""}Where in NOSHASHI:
${g.map((f) => `→ ${f.name} (${f.plan}): ${f.summary}`).join(`
`)}`);
    }
  }
  s.note && i.unshift(s.note);
  const d = i.join(`

`);
  let l = [d, c].filter(Boolean).join(`

`);
  return l || (l = "I could not find that in NOSHASHI's pages, and the question names nothing I can read from the ledger. Name an address (r…), an issuer and currency, or a 64-character transaction hash, or ask about a NOSHASHI screen, plan or feature."), { text: l, steps: a, plan: s, facts: d };
}
const C = {
  support: "support@noshashi.app",
  institutions: "institutions@noshashi.app",
  security: "security@noshashi.app",
  privacy: "privacy@noshashi.app",
  form: "/contact/"
}, de = [
  {
    id: "what",
    keywords: ["what", "noshashi", "do", "product", "about", "purpose", "explain", "is"],
    q: "What does NOSHASHI do?",
    a: "NOSHASHI reads validated XRP Ledger state and answers two questions from it at the same moment: whether a transfer is permitted under the rules you configured, and whether you could actually exit the position. It returns a GO, HOLD or NO-GO verdict with the evidence attached. It is informational tooling — it never holds, signs or moves an asset.",
    links: [{ label: "The thesis", href: "/#thesis" }]
  },
  {
    id: "advice",
    // Deliberately narrow keywords. Anything as generic as "should" or
    // "buy" would pull ordinary questions ("should I download the beta")
    // into a refusal, which is a worse failure than the one it prevents.
    keywords: [
      "worth",
      "predict",
      "prediction",
      "forecast",
      "invest",
      "investing",
      "investment",
      "profit",
      "portfolio",
      "bullish",
      "bearish",
      "moon",
      "pump",
      "dump",
      "hodl",
      "rally",
      "target"
    ],
    q: "Will XRP go up? Should I buy?",
    a: "That is outside what this tool does, and outside what anyone here will tell you. NOSHASHI reports whether a transfer is permitted under the rules you configured and whether you could actually exit the position. It does not forecast a price, and nothing it produces is investment, legal, regulatory or tax advice.",
    links: [{ label: "What it actually does", href: "/#thesis" }, { label: "Legal", href: "/legal/" }]
  },
  {
    id: "price",
    keywords: ["price", "pricing", "cost", "costs", "much", "free", "tier", "plan", "plans", "seat", "pay", "expensive", "cheap"],
    q: "What does it cost?",
    a: "The console is free forever, including unlimited GO/HOLD/NO-GO checks, live mainnet telemetry and 10 address checks a month. Pro is $749 per seat per month and adds unlimited address checks, exit-liquidity and freeze-rights analysis, the persistent adjudication ledger and 5,000 API verifications. Institutional is $4,000 a month and adds Travel Rule scoping, signed audit export, offline adjudication and 100,000 API verifications.",
    links: [{ label: "Full pricing", href: "/pricing/" }]
  },
  {
    id: "download",
    keywords: ["download", "install", "mac", "macos", "windows", "linux", "dmg", "exe", "deb", "rpm", "appimage", "msi", "platform", "get"],
    q: "How do I download it?",
    a: "Builds for macOS (Apple silicon and Intel), Windows (.exe and .msi) and Linux (.deb, .rpm, .AppImage) are on the download section, produced by GitHub Actions from a public commit. Every artifact lists its SHA-256 so you can verify it before running it.",
    links: [{ label: "Downloads", href: "/#download" }]
  },
  {
    id: "beta",
    keywords: ["beta", "stable", "release", "channel", "production", "ready", "version", "pre-release"],
    q: "Is this production-ready?",
    a: "No — every build on this site is labelled BETA. It is pre-1.0, the binaries are not code-signed or notarised yet, and the release pipeline is still being hardened. Treat it as an evaluation build: verify the SHA-256, run it through your own software admission process, and do not make it the sole basis of a decision carrying legal consequence.",
    links: [{ label: "Downloads", href: "/#download" }, { label: "Status", href: "/status/" }]
  },
  {
    id: "unsigned",
    keywords: ["gatekeeper", "smartscreen", "unsigned", "unidentified", "developer", "warn", "blocked", "notarised", "notarized", "signature"],
    q: "macOS or Windows blocks the app — is that expected?",
    a: "Yes. The builds are not code-signed or notarised while the release pipeline is being hardened, so macOS reports an unidentified developer and Windows SmartScreen warns. On macOS, right-click the app and choose Open the first time. Verify the SHA-256 published next to the download first — that check is what actually tells you the file is the one CI built.",
    links: [{ label: "Verify a download", href: "/#download" }]
  },
  {
    id: "verify",
    keywords: ["verify", "hash", "sha256", "sha-256", "checksum", "integrity", "tamper", "authentic"],
    q: "How do I verify a download?",
    a: "Each artifact's SHA-256 is printed next to it. Run `shasum -a 256 <file>` on macOS or Linux, or `certutil -hashfile <file> SHA256` on Windows, and compare. The application also hashes its own running binary under Settings › Binary integrity, on every tier — verifying that we are not malicious is not a paid feature.",
    links: [{ label: "Downloads", href: "/#download" }]
  },
  {
    id: "account",
    keywords: ["account", "sign", "signup", "login", "register", "dashboard", "workspace", "password"],
    q: "Do I need an account?",
    a: "No. There are no accounts on this site — sign-in and the hosted workspace were withdrawn. The application runs on your machine and reads public ledger state directly, so there is no server-side state to log into. A paid subscription is managed through Stripe and does not create a website login.",
    links: [{ label: "Security posture", href: "/#security" }]
  },
  {
    id: "privacy",
    keywords: ["privacy", "data", "telemetry", "analytics", "tracking", "collect", "gdpr", "store", "egress"],
    q: "What data do you collect?",
    a: "Without an account there is no server-side state: no analytics, no telemetry, no crash reporting. The compliance agent runs on your own machine with zero egress. Secrets are held by the OS keychain rather than by the app. Typefaces are self-hosted, so opening a page does not announce you to a font CDN.",
    links: [{ label: "Security posture", href: "/#security" }, { label: "Legal", href: "/legal/" }]
  },
  {
    id: "custody",
    keywords: ["custody", "funds", "wallet", "sign", "transaction", "broadcast", "hold", "money", "safe"],
    q: "Can it move my funds?",
    a: "No, and it cannot be made to. NOSHASHI has no signing path and no custody: it reads ledger state and reports on it. It is not a bank, broker-dealer, money services business, money transmitter, qualified custodian or registered investment adviser, and nothing it produces is legal, regulatory, tax or investment advice.",
    links: [{ label: "Legal", href: "/legal/" }]
  },
  {
    id: "which-plan",
    // Mirrors each plan's audience and price in src/lib/billing/catalog.ts;
    // src/site/__tests__/noshx-web.test.ts fails if they drift apart.
    keywords: ["which", "plan", "right", "choose", "suit", "custodian", "custodians", "exchange", "venue", "desk", "fund", "team", "institution", "bank"],
    q: "Which plan is right for me?",
    a: "Free is for individuals and single desks. Pro ($749 per seat per month) is for trading desks and funds. Institutional ($4,000 a month) is for regulated venues and custodians. Enterprise ($10,000 a month) is for institutional teams operating at scale. Strategic Infrastructure ($20,850 a month) is for institutions building their own XRPL intelligence layer. The pricing page lists what each one includes.",
    links: [{ label: "Compare plans", href: "/pricing/" }]
  },
  {
    id: "billing",
    keywords: ["refund", "cancel", "billing", "invoice", "stripe", "card", "renew", "charge", "payment", "unsubscribe", "subscription", "subscribe"],
    q: "How do billing, cancellation and refunds work?",
    a: "Payments run entirely through Stripe — no card data ever reaches NOSHASHI. Subscriptions renew automatically until cancelled and can be cancelled at any time, taking effect at the end of the period already paid for. A first charge is fully refundable within 14 days if no paid capability was used.",
    links: [{ label: "Pricing", href: "/pricing/" }]
  },
  {
    id: "pro",
    keywords: ["pro", "upgrade", "unlock", "exit", "liquidity", "freeze", "concentration", "api", "webhook", "institutional", "enterprise"],
    q: "What do the paid tiers add?",
    a: "Pro adds unlimited address checks, exit-liquidity analysis (freeze risk × depth × concentration), settlement forensics, order-book integrity, counterparty provenance, issuer freeze-rights and XLS-77 deep-freeze analysis, a 10,000-verdict persistent ledger and 5,000 API verifications. Institutional adds issuance surveillance, Travel Rule (FATF R.16) scoping, signed audit export with a SHA-256 chain of custody, offline adjudication on segregated networks, and regulator read-only seats.",
    links: [{ label: "Compare tiers", href: "/pricing/" }]
  },
  {
    id: "network",
    keywords: ["xrpl", "xrp", "ledger", "mainnet", "testnet", "network", "node", "rippled", "chain"],
    q: "Which network does it read?",
    a: "XRPL mainnet only — no testnet path exists in the build. It reads public nodes directly (xrplcluster.com, s1/s2.ripple.com and others) and compares several so a single node's view is never taken on trust.",
    links: [{ label: "Free tools", href: "/#public" }]
  },
  {
    id: "news",
    keywords: ["news", "headlines", "feed", "market", "latest", "happening", "story"],
    q: "Where do the headlines come from?",
    a: "The newsroom merges three public RSS feeds — Google News, Cointelegraph's XRP tag and CoinDesk — server-side, de-duplicates them and stamps each with its publisher and age. Headlines are reproduced as a title and a link back to the publisher. They are news, not a NOSHASHI reading, and no verdict is implied by anything appearing there.",
    links: [{ label: "Newsroom", href: "/news/" }]
  },
  {
    id: "status",
    keywords: ["status", "down", "outage", "maintenance", "incident", "broken", "uptime", "working", "progress", "roadmap", "next", "eta", "soon", "release", "shipping", "timeline", "update"],
    q: "Is something broken, and what are you working on?",
    a: "The status page carries the live board and the mission log — every shipped release, plus any maintenance window or incident. Releases appear there only when CI has actually produced an artifact, so the log is evidence rather than an announcement. The progress page sets out what has shipped and what is next.",
    links: [{ label: "Status", href: "/status/" }, { label: "Progress", href: "/progress/" }]
  },
  {
    id: "source",
    keywords: ["source", "code", "github", "open", "repo", "audit", "test", "review"],
    q: "Can I read the source?",
    a: "Yes. Every build on the download page was produced by CI from a public commit, and the logic that makes claims carries 272 tests. The repository is public on GitHub.",
    links: [{ label: "GitHub", href: "https://github.com/Ignosha/noshashi" }]
  },
  {
    id: "contact",
    keywords: ["contact", "email", "human", "sales", "talk", "reach", "help", "support", "someone"],
    q: "How do I reach a person?",
    a: `The contact form reaches the team directly. For specific routes: ${C.support} for product support, ${C.institutions} for institutional enquiries, ${C.security} for vulnerability reports and ${C.privacy} for data questions.`,
    links: [{ label: "Contact form", href: "/contact/" }]
  }
], js = new Set(
  "a an the is are was were be been do does did can could would should i you it this that of for to in on at by with my your our we us and or if how what when where why not no yes please tell me about".split(" ")
);
function ae(e) {
  return String(e || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !js.has(t));
}
function Bs(e) {
  const t = ae(e);
  return t.length ? de.map((n) => {
    const s = new Set(n.keywords), a = new Set(ae(n.q)), r = new Set(ae(n.a));
    let o = 0;
    for (const i of t)
      s.has(i) ? o += 3 : a.has(i) ? o += 2 : r.has(i) ? o += 0.5 : [...s].some((c) => c.startsWith(i) || i.startsWith(c)) && (o += 1.5);
    return { entry: n, score: o };
  }).filter((n) => n.score > 0).sort((n, s) => s.score - n.score) : [];
}
const Ue = 3;
function Ws(e) {
  const t = Bs(e), n = t[0];
  if (!n || n.score < Ue)
    return {
      grounded: !1,
      text: "I can answer questions about pricing, downloads and verification, what the paid tiers add, privacy and security posture, billing, and the XRPL data the product reads. I don't have a confident answer to that one — rather than guess, send it to the team and you'll get a real answer.",
      links: [{ label: "Contact the team", href: C.form }],
      matched: t.slice(0, 3).map((a) => a.entry.id)
    };
  const s = t.slice(1, 3).filter((a) => a.score > Ue * 0.8).map((a) => a.entry.q);
  return {
    grounded: !0,
    text: n.entry.a,
    links: n.entry.links || [],
    related: s,
    matched: [n.entry.id]
  };
}
const Me = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz", Gs = /\bs[1-9A-HJ-NP-Za-km-z]{24,34}\b/g;
function Ks(e) {
  const t = [0];
  for (const r of e) {
    const o = Me.indexOf(r);
    if (o < 0) return null;
    let i = o;
    for (let c = t.length - 1; c >= 0; c -= 1)
      i += t[c] * 58, t[c] = i & 255, i >>= 8;
    for (; i > 0; )
      t.unshift(i & 255), i >>= 8;
  }
  let n = 0;
  for (; n < e.length && e[n] === Me[0]; ) n += 1;
  let s = 0;
  for (; s < t.length && t[s] === 0; ) s += 1;
  const a = new Uint8Array(n + t.length - s);
  return a.set(t.slice(s), n), a;
}
async function Ys(e) {
  const t = e.slice(0, e.length - 4), n = await crypto.subtle.digest("SHA-256", t), s = new Uint8Array(await crypto.subtle.digest("SHA-256", n));
  return e.slice(e.length - 4).every((r, o) => r === s[o]);
}
async function Vs(e) {
  const t = Ks(e);
  if (!t) return !1;
  const n = t.length === 21 && t[0] === 33, s = t.length === 23 && t[0] === 1 && t[1] === 225 && t[2] === 75;
  return !n && !s ? !1 : Ys(t);
}
async function Js(e) {
  for (const t of e.matchAll(Gs))
    if (await Vs(t[0])) return !0;
  return !1;
}
class Qs extends Error {
  constructor() {
    super(
      "That message contains an XRPL secret seed, so it was not sent. NOSHASHI never needs a seed. Treat this one as exposed: move the funds to a new account and stop using it."
    ), this.name = "SecretInMessageError";
  }
}
const ot = 10, ct = "noshashi:web.checks", re = () => {
  const e = /* @__PURE__ */ new Date();
  return `${e.getUTCFullYear()}-${String(e.getUTCMonth() + 1).padStart(2, "0")}`;
};
function Zs() {
  try {
    const e = JSON.parse(localStorage.getItem(ct) ?? "null");
    if (e && e.month === re() && typeof e.count == "number" && Number.isFinite(e.count))
      return { month: e.month, count: Math.max(0, e.count) };
  } catch {
  }
  return { month: re(), count: 0 };
}
let dt = 0;
function je(e) {
  dt = e;
  try {
    localStorage.setItem(ct, JSON.stringify({ month: re(), count: e }));
  } catch {
  }
}
const oe = () => Math.max(Zs().count, dt), ea = {
  has: () => !1,
  spendFreeCheck: () => {
    const e = oe();
    return e >= ot ? !1 : (je(e + 1), !0);
  },
  refundFreeCheck: () => je(Math.max(0, oe() - 1))
}, ce = "Support › ";
is(
  de.map((e) => ({
    title: `${ce}${e.q}`,
    source: "noshashi.app support",
    text: `${e.q}
${e.a}`,
    // Written for exactly the questions visitors ask, so they lead a close call.
    weight: 1.25
  }))
);
const ie = { label: "Contact the team", href: C.form };
function ta(e) {
  const t = /\n\nSources?: ([^\n]+)/.exec(e);
  if (!t) return { body: e, links: [] };
  const n = [];
  let s;
  for (const a of t[1].split("; ")) {
    const r = a.lastIndexOf(" · "), o = r >= 0 ? a.slice(0, r) : a, i = r >= 0 ? a.slice(r + 3) : "";
    o.startsWith(ce) && (s = o.slice(ce.length));
    const c = /^https:\/\/www\.noshashi\.app(\/[^\s]*)?$/.exec(i);
    if (!c) continue;
    const d = c[1] ?? "/";
    if (n.some((u) => u.href.split("#")[0] === d.split("#")[0])) continue;
    const l = (o.split(" › ").pop() ?? o).replace(/^NOSHASHI — /, "").trim();
    n.push({ label: l.length > 38 ? `${l.slice(0, 36)}…` : l, href: d });
  }
  return { body: e.replace(t[0], ""), links: n.slice(0, 3), support: s };
}
async function aa(e, t) {
  const n = String(e ?? "").trim().slice(0, 600);
  if (!n)
    return { text: "Ask a question about NOSHASHI, or paste an XRPL address, token id or transaction hash.", steps: [], links: [], related: [], source: "none" };
  if (await Js(n))
    return { text: new Qs().message, steps: [], links: [], related: [], source: "refused" };
  const s = rt(n).calls.length > 0, a = [];
  let r = !1;
  try {
    const o = await Ms(n, ea, (f) => {
      if (f.kind !== "tool") return;
      if (f.name === "search_noshashi") {
        r = f.ok;
        return;
      }
      const h = { reader: na[f.name] ?? f.name, ok: f.ok, summary: f.summary };
      a.push(h), t?.(h);
    });
    if (!o.facts && !r)
      return { text: Ws(n).text, steps: a, links: [ie], related: [], source: "none" };
    const { body: i, links: c, support: d } = ta(o.text), l = d ? de.find((f) => f.q === d) : void 0, u = i.includes("https://www.noshashi.app/certificate/") ? [{ label: "Free issuer certificate", href: "/certificate/" }] : [], g = [...l?.links ?? [], ...u, ...c];
    return {
      text: i,
      steps: a,
      links: g.some((f) => f.href === C.form) ? g.slice(0, 4) : [...g.slice(0, 3), ie],
      related: [],
      source: o.facts ? "ledger" : l ? "support" : "pages"
    };
  } catch (o) {
    return {
      text: `NOSHX could not finish that: ${o instanceof Error ? o.message : "an unexpected error"}. Try again, or contact the team.`,
      steps: a,
      links: [ie],
      related: [],
      source: s ? "ledger" : "none"
    };
  }
}
const na = {
  check_address: "the address",
  read_claims: "the inbox",
  read_token_rights: "the token",
  read_settlement: "the transaction",
  read_book: "the order book",
  read_provenance: "the account's origin",
  read_control_surface: "the signers",
  read_pool: "the pool",
  read_issuance: "the issuance",
  certify_authority: "the issuer",
  ledger_status: "the latest ledger",
  ledger_sync: "the public servers"
}, ia = () => Math.max(0, ot - oe()), ra = () => rs();
export {
  aa as ask,
  ia as checksLeft,
  ra as prewarm,
  ta as splitSources
};
