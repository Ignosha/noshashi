var Dt = Object.defineProperty;
var Ct = (e, t, n) => t in e ? Dt(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n;
var R = (e, t, n) => Ct(e, typeof t != "symbol" ? t + "" : t, n);
function ne(e) {
  const t = Number(e) / 1e6;
  return Number.isFinite(t) ? t.toFixed(6).replace(/\.?0+$/, "") : "0";
}
function ht(e) {
  return new Date((e + 946684800) * 1e3);
}
function q(e) {
  if (!/^[0-9A-F]{40}$/i.test(e)) return e;
  const t = (e.match(/../g) ?? []).map((n) => String.fromCharCode(parseInt(n, 16))).join("").replace(/\0+$/, "").trim();
  return t && /^[\x20-\x7E]+$/.test(t) ? t : e;
}
const xe = [
  "wss://xrplcluster.com",
  "wss://s1.ripple.com",
  "wss://s2.ripple.com"
], _e = 12e3, Pt = 2e4;
class E extends Error {
  constructor(n, s) {
    super(n);
    R(this, "code");
    this.code = s, this.name = "XrplError";
  }
}
class Lt {
  constructor() {
    R(this, "socket", null);
    R(this, "pending", /* @__PURE__ */ new Map());
    R(this, "nextId", 1);
    R(this, "endpointIndex", 0);
    R(this, "attempt", 0);
    R(this, "retryTimer", 0);
    R(this, "connecting", null);
    R(this, "streamHandlers", /* @__PURE__ */ new Set());
    R(this, "statusHandlers", /* @__PURE__ */ new Set());
    R(this, "latencyMs", 0);
    R(this, "connected", !1);
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
      window.clearTimeout(n.timer), n.reject(new E("Connection reset"));
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
      const s = xe[this.endpointIndex % xe.length];
      let a;
      try {
        a = new WebSocket(s);
      } catch (i) {
        this.connecting = null, n(i instanceof Error ? i : new Error(String(i)));
        return;
      }
      this.socket = a;
      const o = window.setTimeout(() => {
        a.close();
      }, _e);
      a.onopen = () => {
        window.clearTimeout(o), this.attempt = 0, this.connecting = null, this.setConnected(!0), a.send(
          JSON.stringify({
            id: this.nextId++,
            command: "subscribe",
            streams: ["ledger", "transactions"]
          })
        ), t(a);
      }, a.onmessage = (i) => this.handleMessage(i), a.onerror = () => {
        window.clearTimeout(o);
      }, a.onclose = () => {
        window.clearTimeout(o), this.connecting = null, this.socket = null, this.setConnected(!1);
        for (const [, i] of this.pending)
          window.clearTimeout(i.timer), i.reject(new E("Connection closed"));
        this.pending.clear(), n(new E("Connection closed")), this.scheduleReconnect();
      };
    }), this.connecting);
  }
  scheduleReconnect() {
    if (this.streamHandlers.size === 0 && this.pending.size === 0) return;
    window.clearTimeout(this.retryTimer), this.endpointIndex += 1, this.attempt += 1;
    const t = Math.min(Pt, 1e3 * 2 ** Math.min(this.attempt - 1, 4));
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
          new E(
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
    const s = await this.ensureSocket(), a = this.nextId++, o = performance.now();
    return new Promise((i, r) => {
      const c = window.setTimeout(() => {
        this.pending.delete(a), r(new E(`Timed out: ${t}`));
      }, _e);
      this.pending.set(a, {
        resolve: (l) => {
          this.latencyMs = Math.max(1, Math.round(performance.now() - o)), i(l);
        },
        reject: r,
        timer: c
      });
      try {
        s.send(JSON.stringify({ id: a, command: t, ...n }));
      } catch (l) {
        window.clearTimeout(c), this.pending.delete(a), r(l instanceof Error ? l : new Error(String(l)));
      }
    });
  }
}
const Xt = new Lt();
async function S(e, t = {}) {
  return Xt.request(e, t);
}
async function Ht() {
  const [e, t] = await Promise.all([
    S("ledger", { ledger_index: "validated", transactions: !1, expand: !1 }),
    S("fee").catch(() => ({}))
  ]), n = e.ledger ?? {};
  return {
    ledgerIndex: Number(n.ledger_index ?? e.ledger_index ?? 0),
    ledgerHash: String(n.ledger_hash ?? ""),
    closeTime: ht(Number(n.close_time ?? 0)).toLocaleString(),
    validated: !!(e.validated ?? !1),
    baseFeeXrp: ne(Number(t.drops?.base_fee ?? 10)),
    openLedgerFeeXrp: ne(Number(t.drops?.open_ledger_fee ?? 10)),
    queueSize: Number(t.current_queue_size ?? 0),
    txnCount: Number(n.transactions?.length ?? 0)
  };
}
function se(e) {
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
function qt(e) {
  return { address: e, balanceXrp: "0.00", sequence: 0, ownerCount: 0, unfunded: !0 };
}
async function Ut(e) {
  try {
    const n = (await S("account_info", {
      account: e,
      ledger_index: "validated"
    })).account_data ?? {};
    return {
      address: e,
      balanceXrp: (Number(n.Balance ?? 0) / 1e6).toFixed(2),
      sequence: Number(n.Sequence ?? 0),
      ownerCount: Number(n.OwnerCount ?? 0),
      domain: se(String(n.Domain ?? ""))
    };
  } catch (t) {
    if (t instanceof E && t.code === "actNotFound") return qt(e);
    throw t instanceof E && t.code === "actMalformed" ? new E(
      "Address failed its base58 checksum — check for a mistyped character.",
      "actMalformed"
    ) : t;
  }
}
async function Mt(e) {
  return ((await S("account_objects", {
    account: e,
    ledger_index: "validated",
    type: "credential",
    limit: 100
  })).account_objects ?? []).map((s) => ({
    subject: String(s.Subject ?? ""),
    issuer: String(s.Issuer ?? ""),
    credentialType: se(String(s.CredentialType ?? "")) ?? String(s.CredentialType ?? "UNKNOWN"),
    // XLS-70 marks acceptance with the lsfAccepted flag (0x00010000).
    accepted: (Number(s.Flags ?? 0) & 65536) !== 0,
    revoked: !!(s.Revoked ?? !1),
    uri: s.URI ? se(String(s.URI)) : void 0,
    expiration: s.Expiration ? Number(s.Expiration) : void 0
  }));
}
async function zt(e, t = 40) {
  try {
    return ((await S("account_tx", {
      account: e,
      ledger_index_min: -1,
      ledger_index_max: -1,
      binary: !1,
      forward: !1,
      limit: t
    })).transactions ?? []).map((a) => {
      const o = a.tx ?? a.tx_json ?? {}, i = a.meta ?? {}, r = i.delivered_amount ?? i.DeliveredAmount, c = typeof r == "string" ? Number(ne(r)) : void 0, l = String(o.Account ?? ""), d = String(o.Destination ?? ""), h = l === e ? "out" : d === e ? "in" : "cross", p = ht(Number(o.date ?? 0));
      return {
        hash: String(o.hash ?? a.hash ?? ""),
        transactionType: String(o.TransactionType ?? "UNKNOWN"),
        result: String(i.TransactionResult ?? "—"),
        ledgerIndex: Number(a.ledger_index ?? o.ledger_index ?? 0),
        date: p.toLocaleString(),
        timestamp: p.getTime(),
        direction: h,
        counterparty: h === "out" ? d || "—" : l || "—",
        amountXrp: c,
        feeXrp: ne(String(o.Fee ?? "0"))
      };
    });
  } catch (n) {
    if (n instanceof E && n.code === "actNotFound") return [];
    throw n;
  }
}
function jt(e) {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(e.trim());
}
const Bt = 262144, Wt = 4194304, Gt = 2097152, Kt = 1048576;
async function Yt(e) {
  try {
    return ((await S("account_lines", {
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
    if (t instanceof E && t.code === "actNotFound") return [];
    throw t;
  }
}
async function pt(e) {
  try {
    const n = (await S("account_info", {
      account: e,
      ledger_index: "validated"
    })).account_data ?? {}, s = Number(n.Flags ?? 0), a = Number(n.TransferRate ?? 0), o = a > 1e9 ? Math.round((a - 1e9) / 1e9 * 1e4) : 0;
    return {
      address: e,
      domain: se(String(n.Domain ?? "")),
      noFreeze: (s & Gt) !== 0,
      globalFreeze: (s & Wt) !== 0,
      requireAuth: (s & Bt) !== 0,
      masterDisabled: (s & Kt) !== 0,
      transferRateBps: o
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
async function Vt(e) {
  try {
    const t = await S("gateway_balances", {
      account: e,
      ledger_index: "validated"
    }), n = t.obligations ?? {}, s = {};
    for (const [a, o] of Object.entries(n)) {
      const i = Number(o);
      Number.isFinite(i) && (s[a] = i);
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
const Jt = "https://xiurbiwuwcfowqnpmwki.supabase.co", ft = `${Jt}/functions/v1`, Ne = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
async function ie(e, t) {
  const n = [...new Set(e.filter((s) => Ne.test(s)))].slice(0, 50);
  if (n.length === 0) return { hits: {}, listAsOf: null, listed: 0 };
  try {
    const s = await fetch(`${ft}/noshashi-xrpl-watch/sanctions?addresses=${n.join(",")}`, {
      signal: t ?? AbortSignal.timeout(8e3)
    });
    if (!s.ok) return null;
    const a = await s.json(), o = {};
    for (const i of a.hits ?? []) Ne.test(i.address) && (o[i.address] = i);
    return { hits: o, listAsOf: a.list_as_of ?? null, listed: Number(a.listed ?? 0) };
  } catch {
    return null;
  }
}
function Qt(e, t) {
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
function ce(e, t) {
  const n = Qt(e.address, t);
  if (!n) return e;
  const s = [n, ...e.findings], a = t?.hits[e.address], o = a ? "avoid" : e.verdict;
  return {
    ...e,
    findings: n.severity === "ok" ? [...e.findings, n] : s,
    verdict: o,
    headline: a ? Z.avoid.label : e.headline,
    sanction: a,
    sanctionsChecked: t !== null,
    sanctionsAsOf: t?.listAsOf ?? null
  };
}
const Z = {
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
}, Zt = 60;
async function en(e) {
  const t = e.trim(), n = {
    address: t,
    verdict: "unknown",
    headline: Z.unknown.label,
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
  if (!jt(t))
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
  const [s, a] = await Promise.all([Ut(t).catch(() => null), ie([t])]);
  if (!s)
    return a?.hits[t] ? ce(n, a) : n;
  if (s.unfunded)
    return ce({
      ...n,
      exists: !0,
      funded: !1,
      domain: s.domain,
      verdict: "caution",
      headline: Z.caution.label,
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
  const [o, i, r] = await Promise.all([
    Mt(t).catch(() => []),
    Yt(t).catch(() => []),
    zt(t, Zt).catch(() => [])
  ]), c = await Vt(t).catch(() => null), h = Object.keys(c?.obligations ?? {}).length > 0 ? await pt(t).catch(() => {
  }) : void 0;
  return ce(
    tn({
      address: t,
      account: s,
      credentials: o,
      lines: i,
      transactions: r,
      obligations: c,
      posture: h
    }),
    a
  );
}
function tn(e) {
  const { address: t, account: n, credentials: s, lines: a, transactions: o, obligations: i, posture: r } = e, c = Object.keys(i?.obligations ?? {}), l = c.length > 0, d = [];
  if (n.domain ? d.push({
    id: "domain",
    severity: "info",
    title: `Claims the domain ${n.domain}`,
    detail: "An account can write any domain it likes into this field. It becomes meaningful only when that domain publishes a matching xrp-ledger.toml naming this address back.",
    action: `Open https://${n.domain}/.well-known/xrp-ledger.toml and confirm this address is listed.`
  }) : d.push({
    id: "no-domain",
    severity: "info",
    title: "Claims no domain",
    detail: "The account has not published a domain, so there is no website to check it against. Common for personal wallets, unusual for a business asking to be paid."
  }), s.length > 0) {
    const y = s.filter((b) => b.accepted && !b.revoked);
    d.push({
      id: "credentials",
      severity: y.length > 0 ? "ok" : "warn",
      title: y.length > 0 ? `Holds ${y.length} accepted credential${y.length === 1 ? "" : "s"}` : "Holds credentials, but none currently valid",
      detail: y.length > 0 ? `Someone has attested to this account on-ledger: ${y.map((b) => b.credentialType).join(", ")}. The attestation is only worth as much as the issuer behind it.` : "Every credential attached to this account is either unaccepted or revoked."
    });
  }
  l && r && (r.globalFreeze && d.push({
    id: "global-freeze",
    severity: "critical",
    title: "This issuer has frozen everything it issued",
    detail: "lsfGlobalFreeze is set. Every balance of every currency this account issues is immobilised right now — holders cannot send or redeem.",
    action: "Do not buy this issuer's tokens while this flag stands."
  }), r.noFreeze ? d.push({
    id: "no-freeze",
    severity: "ok",
    title: "This issuer has permanently given up the right to freeze",
    detail: "lsfNoFreeze is set and cannot be undone. It can never immobilise a holder's balance."
  }) : r.globalFreeze || d.push({
    id: "can-freeze",
    severity: "warn",
    title: "This issuer can freeze your balance at any time",
    detail: "lsfNoFreeze is not set, so the issuer retains the right to immobilise what it issued — yours included — in a single transaction, without warning.",
    action: "Hold only what you would accept losing access to."
  }), r.transferRateBps > 0 && d.push({
    id: "transfer-fee",
    severity: "warn",
    title: `Charges ${r.transferRateBps} basis points to transfer`,
    detail: `Moving this issuer's token costs ${(r.transferRateBps / 100).toFixed(2)}%, taken by the issuer. It is not refundable and it applies every time the token changes hands.`
  }), r.requireAuth && d.push({
    id: "require-auth",
    severity: "info",
    title: "Requires authorisation before you can hold it",
    detail: "You cannot receive this issuance until the issuer explicitly authorises your account. Expect an onboarding step."
  }), d.push({
    id: "supply",
    severity: "info",
    title: `Issues ${c.length} currenc${c.length === 1 ? "y" : "ies"}`,
    detail: `Outstanding: ${c.slice(0, 6).map((y) => `${y} ${Math.round(i?.obligations[y] ?? 0).toLocaleString()}`).join(" · ")}`
  }));
  const h = a.filter((y) => y.frozenByIssuer || y.deepFrozenByIssuer);
  h.length > 0 && d.push({
    id: "freezes-others",
    severity: "warn",
    title: `Has frozen ${h.length} counterpart${h.length === 1 ? "y" : "ies"}`,
    detail: "This account has used freeze against people it deals with. That may be entirely legitimate — a sanctions response, for instance — but it demonstrates both the willingness and the ability to do it."
  });
  const p = new Set(
    o.map((y) => y.counterparty).filter(Boolean)
  );
  o.length === 0 ? d.push({
    id: "no-history",
    severity: "warn",
    title: "No recent transaction history",
    detail: "The account is funded but nothing recent is visible. A shop asking for payment should have a trail."
  }) : d.push({
    id: "history",
    severity: "info",
    title: `${o.length} recent transactions across ${p.size} counterparties`,
    detail: p.size <= 2 ? "Almost all activity is with the same one or two addresses, which is unusual for a business." : "Activity is spread across a range of counterparties."
  });
  const f = d.reduce((y, b) => {
    const m = { critical: 3, warn: 2, info: 1, ok: 0 };
    return m[b.severity] > m[y] ? b.severity : y;
  }, "ok"), u = f === "critical" ? "avoid" : f === "warn" ? "caution" : "clear";
  return {
    address: t,
    verdict: u,
    headline: Z[u].label,
    findings: d.sort((y, b) => {
      const m = { critical: 0, warn: 1, info: 2, ok: 3 };
      return m[y.severity] - m[b.severity];
    }),
    exists: !0,
    funded: !0,
    balanceXrp: Number(n.balanceXrp),
    domain: n.domain,
    activityCount: o.length,
    isIssuer: l,
    issuedCurrencies: c,
    posture: r,
    credentials: s,
    sanctionsChecked: !1,
    ledgerIndex: i?.ledgerIndex ?? 0,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const nn = 946684800;
function Ie(e) {
  return new Date((e + nn) * 1e3);
}
const sn = 1048576;
function an(e, t) {
  const n = e.map((a) => a.weight).sort((a, o) => o - a);
  let s = 0;
  for (let a = 0; a < n.length; a += 1)
    if (s += n[a], s >= t) return a + 1;
  return 1 / 0;
}
async function gt(e) {
  const [t, n, s, a] = await Promise.all([
    S("account_info", { account: e, ledger_index: "validated" }),
    S("server_info").catch(() => ({})),
    S("account_objects", {
      account: e,
      type: "signer_list",
      ledger_index: "validated",
      limit: 10
    }).catch((m) => ({
      __unreadable: m instanceof Error ? m.message : String(m)
    })),
    S("account_objects", {
      account: e,
      type: "escrow",
      ledger_index: "validated",
      limit: 200
    }).catch(() => ({}))
  ]), o = t.account_data ?? {}, i = Number(o.Flags ?? 0), r = n.info?.validated_ledger ?? {}, c = (s.account_objects ?? [])[0], l = (c?.SignerEntries ?? []).map((m) => ({
    account: String(m.SignerEntry?.Account ?? ""),
    weight: Number(m.SignerEntry?.SignerWeight ?? 0)
  })).filter((m) => m.account), d = Number(c?.SignerQuorum ?? 0), h = l.reduce((m, g) => m + g.weight, 0), f = (a.account_objects ?? []).filter((m) => typeof m.Amount == "string").map((m) => ({
    amountXrp: Number(m.Amount) / 1e6,
    finishAfter: m.FinishAfter !== void 0 ? Ie(Number(m.FinishAfter)).toISOString() : void 0,
    cancelAfter: m.CancelAfter !== void 0 ? Ie(Number(m.CancelAfter)).toISOString() : void 0,
    destination: m.Destination ? String(m.Destination) : void 0
  })), u = Number(o.OwnerCount ?? 0), y = Number(r.reserve_base_xrp ?? 1), b = Number(r.reserve_inc_xrp ?? 0.2);
  return {
    address: e,
    masterKeyEnabled: (i & sn) === 0,
    regularKey: o.RegularKey ? String(o.RegularKey) : void 0,
    signers: {
      present: l.length > 0,
      unreadable: s.__unreadable ? String(s.__unreadable) : void 0,
      quorum: d,
      signers: l,
      totalWeight: h,
      minimumSigners: l.length > 0 ? an(l, d) : 0,
      unilateralSigners: l.filter((m) => d > 0 && m.weight >= d).map((m) => m.account)
    },
    ownerCount: u,
    reserveBaseXrp: y,
    reserveIncrementXrp: b,
    reserveLockedXrp: y + u * b,
    balanceXrp: Number(o.Balance ?? 0) / 1e6,
    escrows: f,
    escrowedXrp: f.reduce((m, g) => m + g.amountXrp, 0),
    truncated: !!(a.marker || s.marker),
    ledgerIndex: Number(t.ledger_index ?? 0),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function on(e) {
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
    const { quorum: a, totalWeight: o, minimumSigners: i, signers: r, unilateralSigners: c } = e.signers;
    i === 1 / 0 ? t.push({
      id: "quorum-unreachable",
      severity: "critical",
      title: "Quorum can never be met",
      detail: `Quorum is ${a} but the signers' weights total only ${o}. No combination of the configured signers can authorise a transaction.`,
      action: "Lower the quorum or add weight before this account needs to move."
    }) : i === 1 ? t.push({
      id: "effective-single",
      severity: "critical",
      title: `${r.length} signers, but one can act alone`,
      detail: `Quorum is ${a} and at least one signer carries that weight by themselves${c.length ? ` (${c.length} of them can)` : ""}. XRPL compares quorum against the sum of signing weights, not a count of signers, so this list provides no second approval in practice.`,
      action: "Rebalance the weights so no single signer reaches quorum unaided."
    }) : t.push({
      id: "quorum-ok",
      severity: "ok",
      title: `Requires at least ${i} of ${r.length} signers`,
      detail: `Quorum ${a} against a total weight of ${o}. Taking the heaviest signers first, ${i} must agree before anything moves.`
    });
  }
  const n = e.balanceXrp - e.reserveLockedXrp - e.escrowedXrp;
  if (t.push({
    id: "reserve",
    severity: "info",
    title: `${e.reserveLockedXrp.toLocaleString(void 0, { maximumFractionDigits: 1 })} XRP locked by reserve`,
    detail: `${e.reserveBaseXrp} XRP base plus ${e.ownerCount.toLocaleString()} owned objects at ${e.reserveIncrementXrp} XRP each. This is not spendable while those objects exist — every trust line, offer and escrow adds to it.`
  }), e.escrows.length > 0) {
    const a = e.escrows.filter((o) => o.finishAfter).sort((o, i) => o.finishAfter < i.finishAfter ? -1 : 1)[0];
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
  return t.sort((a, o) => s[a.severity] - s[o.severity]);
}
const mt = 946684800, rn = 32570, Ee = 10;
function cn(e, t) {
  const n = [];
  for (const s of e) {
    const a = s.tx_json ?? s.tx ?? s;
    if (a.Account !== t) continue;
    const o = Number(s.ledger_index ?? a.ledger_index ?? 0), i = Number(a.date), r = Number.isFinite(i) ? new Date((i + mt) * 1e3) : void 0;
    if (a.TransactionType === "SetRegularKey") {
      const c = !!a.RegularKey;
      n.push({
        ledgerIndex: o,
        at: r,
        kind: c ? "regular-key-set" : "regular-key-removed",
        label: c ? "A regular key was assigned — a second key able to sign" : "The regular key was removed"
      });
    } else if (a.TransactionType === "SignerListSet") {
      const c = Number(a.SignerQuorum ?? 0) === 0;
      n.push({
        ledgerIndex: o,
        at: r,
        kind: c ? "signer-list-removed" : "signer-list-set",
        label: c ? "The signer list was deleted — multi-party approval ended" : "A signer list was configured or replaced"
      });
    } else a.TransactionType === "AccountSet" && (Number(a.SetFlag) === 4 ? n.push({
      ledgerIndex: o,
      at: r,
      kind: "master-key-disabled",
      label: "The master key was disabled"
    }) : Number(a.ClearFlag) === 4 && n.push({
      ledgerIndex: o,
      at: r,
      kind: "master-key-enabled",
      label: "The master key was re-enabled"
    }));
  }
  return n.sort((s, a) => s.ledgerIndex - a.ledgerIndex);
}
function ln(e, t) {
  return e >= t ? e - t : Math.max(0, e - 1);
}
async function dn(e) {
  let t;
  try {
    t = await S("account_info", { account: e, ledger_index: "validated" });
  } catch (k) {
    throw k instanceof E && k.code === "actNotFound" ? new Error(
      "That address is not funded, so no account exists for it yet. An XRPL address only becomes an account once someone sends it enough XRP to meet the reserve — until then it has no history to read."
    ) : k instanceof E && k.code === "actMalformed" ? new Error("That is not a well-formed XRPL address.") : k;
  }
  const n = t.account_data ?? {}, s = Number(n.Sequence ?? 0);
  let a;
  try {
    const k = await S("server_info", {}), $ = String(k.info?.complete_ledgers ?? ""), T = Number($.split("-")[0]);
    Number.isFinite(T) && (a = T);
  } catch {
  }
  let o;
  const i = [];
  let r = !1, c;
  for (let k = 0; k < Ee; k += 1) {
    let $;
    try {
      $ = await S("account_tx", {
        account: e,
        ledger_index_min: -1,
        ledger_index_max: -1,
        binary: !1,
        forward: !0,
        limit: 200,
        ...c ? { marker: c } : {}
      });
    } catch {
      k > 0 && (r = !0);
      break;
    }
    const T = $.transactions ?? [];
    if (o || (o = T[0]), i.push(...T), c = $.marker, !c) break;
    k === Ee - 1 && (r = !0);
  }
  const l = o?.tx_json ?? o?.tx ?? {}, d = Number(o?.ledger_index ?? l.ledger_index ?? 0) || void 0, h = Number(l.date), p = Number.isFinite(h) ? new Date((h + mt) * 1e3) : void 0, f = l.TransactionType ? String(l.TransactionType) : void 0, u = f === "Payment" && l.Destination === e && l.Account !== e, y = u ? String(l.Account) : void 0, b = l.Amount ?? l.DeliverMax, m = u && typeof b == "string" ? Number(b) / 1e6 : void 0, g = d === void 0 ? void 0 : ln(s, d), w = d !== void 0 && a !== void 0 && a > rn && d <= a, v = p ? Math.floor((Date.now() - p.getTime()) / 864e5) : void 0;
  return {
    address: e,
    balanceXrp: Number(n.Balance ?? 0) / 1e6,
    ownerCount: Number(n.OwnerCount ?? 0),
    sequence: s,
    originLedger: d,
    originDate: p,
    fundedBy: y,
    fundingAmountXrp: m,
    originType: f,
    approxSentCount: g,
    historyIncomplete: w,
    nodeHistoryFrom: a,
    ageDays: v,
    lastActivityLedger: Number(n.PreviousTxnLgrSeq ?? 0) || void 0,
    controlEvents: cn(i, e),
    controlHistoryPartial: r,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const un = 30, hn = 365;
function pn(e) {
  const t = [];
  if (e.historyIncomplete ? t.push({
    id: "history-incomplete",
    severity: "warn",
    title: "This account may be older than it appears",
    detail: `The earliest transaction found sits at ledger ${e.originLedger?.toLocaleString()}, which is the edge of what this node retains (from ${e.nodeHistoryFrom?.toLocaleString()}). Anything before that is not missing from the ledger, only from this node — so the age below is a floor, not a measurement.`,
    action: "Query a full-history node before treating the age as established."
  }) : e.originDate && e.ageDays !== void 0 && (e.ageDays < un ? t.push({
    id: "young-account",
    severity: "warn",
    title: `This account is ${e.ageDays} day${e.ageDays === 1 ? "" : "s"} old`,
    detail: `First seen ${e.originDate.toISOString().slice(0, 10)}. An account this new has no track record — nothing about its history can corroborate or contradict what its operator tells you.`,
    action: "Weight the counterparty's off-ledger identity accordingly."
  }) : e.ageDays >= hn ? t.push({
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
    const s = e.controlEvents[e.controlEvents.length - 1], a = s.at ? Math.floor((Date.now() - s.at.getTime()) / 864e5) : void 0, o = a !== void 0 && a <= 30 && e.ageDays !== void 0 && e.ageDays > 365;
    t.push({
      id: "control-changed",
      severity: o ? "warn" : "info",
      title: `Signing authority changed ${e.controlEvents.length} time${e.controlEvents.length === 1 ? "" : "s"}`,
      detail: `Most recently: ${s.label.toLowerCase()}${s.at ? ` on ${s.at.toISOString().slice(0, 10)}` : ""}, at ledger ${s.ledgerIndex.toLocaleString()}.` + (o ? ` This account is ${(e.ageDays / 365).toFixed(1)} years old and its control moved ${a} day${a === 1 ? "" : "s"} ago. A long-established account whose signing authority changes suddenly is the shape a compromised key takes — and equally the shape of an ordinary key rotation.` : " Changing keys is routine hygiene; what matters is whether the operator expected it."),
      action: o ? "Confirm with the operator, through a channel that does not depend on this account, that they made this change." : void 0
    }), e.controlEvents.filter(
      (r) => r.kind === "signer-list-removed" || r.kind === "master-key-enabled"
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
const fn = 946684800, gn = 0.5, mn = 0.25, ee = (e) => typeof e == "string" ? Number(e) / 1e6 : e && typeof e == "object" ? Number(e.value ?? 0) : 0;
function Fe(e, t, n) {
  const s = [];
  for (const i of e) {
    const r = ee(i.TakerGets), c = ee(i.TakerPays);
    if (r <= 0 || c <= 0) continue;
    const l = i.taker_gets_funded !== void 0 ? ee(i.taker_gets_funded) : r, d = i.taker_pays_funded !== void 0 ? ee(i.taker_pays_funded) : c, h = n ? r / c : c / r;
    if (!Number.isFinite(h) || h <= 0) continue;
    const p = n ? c : r, f = n ? d : l, u = Number.isFinite(f) ? Math.max(0, Math.min(f, p)) : 0, y = i.Expiration !== void 0 && Number(i.Expiration) < t;
    s.push({
      account: String(i.Account ?? ""),
      listed: p,
      fundable: y ? 0 : u,
      price: h,
      dead: y || u <= 0,
      expired: y
    });
  }
  s.sort((i, r) => n ? r.price - i.price : i.price - r.price);
  const a = s.reduce((i, r) => i + r.listed, 0), o = s.reduce((i, r) => i + r.fundable, 0);
  return {
    offers: s,
    listedDepth: a,
    fundableDepth: o,
    fundedRatio: a > 0 ? o / a : 1,
    deadOffers: s.filter((i) => i.dead).length,
    bestPrice: s.find((i) => !i.dead)?.price
  };
}
async function yn(e, t, n = 100) {
  const s = { currency: e, issuer: t }, [a, o, i] = await Promise.all([
    // Bids: someone paying XRP to receive the issued asset.
    S("book_offers", {
      taker_gets: { currency: "XRP" },
      taker_pays: s,
      ledger_index: "validated",
      limit: n
    }),
    // Asks: someone paying the issued asset to receive XRP.
    S("book_offers", {
      taker_gets: s,
      taker_pays: { currency: "XRP" },
      ledger_index: "validated",
      limit: n
    }),
    S("ledger", { ledger_index: "validated" })
  ]), r = Number(i.ledger?.close_time ?? 0), c = Fe(a.offers ?? [], r, !0), l = Fe(o.offers ?? [], r, !1), d = /* @__PURE__ */ new Map();
  for (const f of [...c.offers, ...l.offers])
    d.set(f.account, (d.get(f.account) ?? 0) + f.listed);
  const h = c.listedDepth + l.listedDepth, p = [...d.entries()].sort((f, u) => u[1] - f[1]);
  return {
    pair: `${e}/XRP`,
    currency: e,
    issuer: t,
    bids: c,
    asks: l,
    makers: d.size,
    topMakerShare: h > 0 && p[0] ? p[0][1] / h : 0,
    topMaker: p[0]?.[0],
    ledgerIndex: Number(i.ledger_index ?? i.ledger?.ledger_index ?? 0),
    ledgerCloseTime: new Date((r + fn) * 1e3),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function wn(e) {
  const t = [], n = (c) => `${(c * 100).toFixed(1)}%`, s = (c) => c.toLocaleString(void 0, { maximumFractionDigits: 2 });
  for (const [c, l] of [
    ["Asks", e.asks],
    ["Bids", e.bids]
  ]) {
    if (l.offers.length === 0) {
      t.push({
        id: `empty-${c}`,
        severity: "warn",
        title: `Nothing resting on the ${c.toLowerCase()} side`,
        detail: "No offers at all. There is no price here to trade against, whatever a chart elsewhere may show."
      });
      continue;
    }
    const d = 1 - l.fundedRatio;
    l.fundedRatio < gn ? t.push({
      id: `phantom-${c}`,
      severity: d > 0.9 ? "critical" : "warn",
      title: `${n(d)} of ${c.toLowerCase()} depth cannot fill`,
      detail: `The book advertises ${s(l.listedDepth)} but only ${s(l.fundableDepth)} is backed by an owner who still holds it. ${l.deadOffers} of ${l.offers.length} offers can deliver nothing at all. An offer rests whether or not its owner kept the funds, and nothing removes it until someone tries to cross it.`,
      action: "Size against the fundable figure. The advertised depth is what you would be quoted and not what you would receive."
    }) : t.push({
      id: `funded-${c}`,
      severity: "ok",
      title: `${c} are ${n(l.fundedRatio)} funded`,
      detail: `${s(l.fundableDepth)} of ${s(l.listedDepth)} advertised is backed by owners who still hold it.`
    });
  }
  e.topMakerShare >= mn && e.topMaker && t.push({
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
  const o = e.bids.bestPrice, i = e.asks.bestPrice;
  if (o !== void 0 && i !== void 0)
    if (o >= i)
      t.push({
        id: "crossed",
        severity: "warn",
        title: "The fundable touch is crossed",
        detail: `Best fundable bid ${o.toFixed(6)} is at or above best fundable ask ${i.toFixed(6)}. On a live book this resolves in moments, so it usually means the read caught a moment mid-cross rather than a standing arbitrage.`
      });
    else {
      const c = i - o;
      t.push({
        id: "spread",
        severity: "info",
        title: `Fundable spread ${(c / i * 100).toFixed(2)}%`,
        detail: `Between ${o.toFixed(6)} and ${i.toFixed(6)}, measured on offers that can actually fill. A spread taken from the advertised touch would be narrower and would not be tradeable.`
      });
    }
  const r = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((c, l) => r[c.severity] - r[l.severity]);
}
const bn = 131072;
function Re(e) {
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
function te(e) {
  if (e.kind === "xrp")
    return `${e.value.toLocaleString(void 0, { maximumFractionDigits: 6 })} XRP`;
  let t = e.currency;
  if (/^[0-9A-F]{40}$/i.test(t)) {
    const n = (t.match(/../g) ?? []).map((s) => String.fromCharCode(parseInt(s, 16))).join("").replace(/\0+$/, "").trim();
    n && /^[\x20-\x7E]+$/.test(n) && (t = n);
  }
  return `${e.value.toLocaleString(void 0, { maximumFractionDigits: 10 })} ${t}`;
}
function vn(e, t) {
  return e.kind !== t.kind ? !1 : e.kind === "xrp" ? !0 : e.currency === t.currency && e.issuer === t.issuer;
}
async function kn(e) {
  let t;
  try {
    t = await S("tx", { transaction: e.trim() });
  } catch (n) {
    throw n instanceof E && n.code === "txnNotFound" ? new Error(
      "No transaction with that hash is in this node's history. It may never have existed, or the node may not retain ledgers that far back."
    ) : n;
  }
  return Sn(t, e);
}
function Sn(e, t = "") {
  const n = e.tx_json ?? e, s = e.meta ?? e.metaData ?? {}, a = String(n.TransactionType ?? "unknown"), o = String(s.TransactionResult ?? "unknown"), i = Number(n.Flags ?? 0), r = a === "Payment" ? Re(n.DeliverMax ?? n.Amount) : void 0, c = s.delivered_amount ?? s.DeliveredAmount, l = c === "unavailable", d = l ? void 0 : Re(c);
  let h;
  return r && d && vn(r, d) && r.value > 0 && (h = d.value / r.value), {
    hash: String(n.hash ?? e.hash ?? t),
    validated: e.validated === !0,
    transactionType: a,
    result: o,
    succeeded: o.startsWith("tes"),
    account: String(n.Account ?? ""),
    destination: n.Destination ? String(n.Destination) : void 0,
    ledgerIndex: Number(e.ledger_index ?? n.ledger_index ?? 0) || void 0,
    feeDrops: Number(n.Fee ?? 0),
    requested: r,
    delivered: d,
    deliveredUnavailable: l,
    partialFlagSet: (i & bn) !== 0,
    deliveredFraction: h,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const Oe = 0.999999;
function $n(e) {
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
    const s = e.deliveredFraction, a = s !== void 0 && s < Oe ? 1 / Math.max(s, Number.MIN_VALUE) : void 0;
    s !== void 0 && s < Oe ? t.push({
      id: "partial-shortfall",
      severity: "critical",
      title: `Only ${(s * 100).toFixed(4)}% of the requested amount arrived`,
      detail: `This payment is flagged tfPartialPayment and returned ${e.result}. It asked to deliver ${e.requested ? te(e.requested) : "—"} and actually delivered ${e.delivered ? te(e.delivered) : "—"}. Any system that credits the requested figure over-credits by roughly ${a && Number.isFinite(a) ? `${a.toFixed(0)}x` : "an unbounded factor"}.`,
      action: "Credit delivered_amount. The success code and the requested amount are both true and both irrelevant to what you received."
    }) : t.push({
      id: "partial-full",
      severity: "warn",
      title: "Partial payment permitted, but it delivered in full",
      detail: `The sender set tfPartialPayment, which allows the ledger to deliver less than requested. This time it delivered ${e.delivered ? te(e.delivered) : "—"}, the full requested amount. The flag is a property of the sender's instruction, not of this outcome.`,
      action: "The same sender can send less next time under the same flag. Read delivered_amount every time."
    });
  } else e.delivered && t.push({
    id: "settled",
    severity: "ok",
    title: `Settled in full — ${te(e.delivered)}`,
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
const De = 1e5, le = 1e3, yt = 946684800;
function Tn(e) {
  if (typeof e == "number" && Number.isFinite(e))
    return new Date((e + yt) * 1e3);
  if (typeof e != "string" || e.length === 0) return null;
  const t = e.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"), n = new Date(t);
  return Number.isNaN(n.getTime()) ? null : n;
}
function Ce(e) {
  if (!e || typeof e != "object") return "XRP";
  const n = String(e.currency ?? "XRP");
  if (n === "XRP") return "XRP";
  if (/^[0-9A-F]{40}$/i.test(n)) {
    const s = (n.match(/../g) ?? []).map((a) => String.fromCharCode(parseInt(a, 16))).join("").replace(/\0+$/, "").trim();
    if (s && /^[\x20-\x7E]+$/.test(s)) return s;
  }
  return n;
}
async function An(e) {
  const t = "No AMM exists at that address. An AMM account is created by the protocol when a pool is opened — it is not an ordinary wallet, and a wallet address will not resolve here.";
  let n, s;
  try {
    [n, s] = await Promise.all([
      S("amm_info", {
        ..."ammAccount" in e ? { amm_account: e.ammAccount } : { asset: e.asset, asset2: e.asset2 },
        ledger_index: "validated"
      }),
      S("ledger", { ledger_index: "validated" })
    ]);
  } catch (p) {
    throw p instanceof E && (p.code === "actNotFound" || p.code === "actMalformed") ? new Error(t) : p;
  }
  if (!n.amm) throw new Error(t);
  const a = n.amm, o = Number(s.ledger?.close_time ?? 0), i = new Date((o + yt) * 1e3), r = a.vote_slots ?? [], c = r.reduce((p, f) => p + Number(f.vote_weight ?? 0), 0), l = r.map((p) => ({
    account: String(p.account ?? ""),
    votedFeePct: Number(p.trading_fee ?? 0) / le,
    weightOfSupply: Number(p.vote_weight ?? 0) / De,
    weightOfCast: c > 0 ? Number(p.vote_weight ?? 0) / c : 0
  })).sort((p, f) => f.weightOfSupply - p.weightOfSupply);
  let d;
  const h = a.auction_slot;
  if (h?.account) {
    const p = Tn(h.expiration);
    p && (d = {
      holder: String(h.account),
      discountedFeePct: Number(h.discounted_fee ?? 0) / le,
      expiresAt: p,
      expired: p.getTime() < i.getTime(),
      pricePaid: Number(h.price?.value ?? 0),
      authAccounts: (h.auth_accounts ?? []).map((f) => String(f.account ?? "")).filter(Boolean)
    });
  }
  return {
    account: String(a.account ?? ""),
    pair: `${Ce(a.amount)} / ${Ce(a.amount2)}`,
    tradingFeePct: Number(a.trading_fee ?? 0) / le,
    participation: c / De,
    votes: l,
    auction: d,
    lpTokenSupply: Number(a.lp_token?.value ?? 0),
    // Preserved as undefined for XRP: absent means inapplicable, not false.
    assetFrozen: typeof a.asset_frozen == "boolean" ? a.asset_frozen : void 0,
    asset2Frozen: typeof a.asset2_frozen == "boolean" ? a.asset2_frozen : void 0,
    ledgerCloseTime: i,
    ledgerIndex: Number(s.ledger_index ?? s.ledger?.ledger_index ?? 0),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const xn = 0.1, _n = 0.5;
function Nn(e) {
  const t = [], n = (o) => `${(o * 100).toFixed(2)}%`, s = e.votes[0];
  if (e.votes.length === 0 ? t.push({
    id: "no-votes",
    severity: "warn",
    title: "Nobody is voting on this pool's fee",
    detail: `All eight vote slots are empty, so the trading fee sits at ${e.tradingFeePct.toFixed(3)}% by default. The first liquidity provider to cast a vote sets it, at whatever weight they hold.`,
    action: "If you hold LP tokens here, your vote is currently unopposed."
  }) : s && s.weightOfCast >= _n ? t.push({
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
  }), e.participation < xn && e.votes.length > 0 && t.push({
    id: "thin-participation",
    severity: "warn",
    title: `The fee is set by ${n(e.participation)} of the liquidity`,
    detail: `Vote weight is a share of LP token supply, and only ${n(e.participation)} of that supply has voted. The remaining ${n(1 - e.participation)} of providers are accepting a fee chosen by a fraction of a percent of the pool.`,
    action: "A small LP position can carry disproportionate governance weight here."
  }), e.auction) {
    const o = e.auction;
    if (o.expired)
      t.push({
        id: "auction-expired",
        severity: "info",
        title: "The auction slot is expired and unclaimed",
        detail: `The last holder was ${o.holder}, whose window closed ${o.expiresAt.toISOString().slice(0, 10)} — ${Math.floor((e.ledgerCloseTime.getTime() - o.expiresAt.getTime()) / 864e5).toLocaleString()} days before the ledger this was read from. Nobody currently holds a discounted fee, and the slot is available.`,
        action: `Claiming it would trade at ${o.discountedFeePct.toFixed(3)}% against everyone else's ${e.tradingFeePct.toFixed(3)}%.`
      });
    else {
      const i = o.discountedFeePct > 0 ? e.tradingFeePct / o.discountedFeePct : 1 / 0;
      t.push({
        id: "auction-active",
        severity: "warn",
        title: `${o.holder} is trading this pool at a discount right now`,
        detail: `The auction slot holder pays ${o.discountedFeePct.toFixed(3)}% while every other participant pays ${e.tradingFeePct.toFixed(3)}%${Number.isFinite(i) ? ` — ${i.toFixed(0)}x cheaper` : " — the holder trades free"}. The window closes ${o.expiresAt.toISOString().replace("T", " ").slice(0, 16)} UTC.${o.authAccounts.length > 0 ? ` ${o.authAccounts.length} further account${o.authAccounts.length === 1 ? " has" : "s have"} been nominated to share the discount.` : ""}`,
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
  for (const [o, i] of [
    ["First asset", e.assetFrozen],
    ["Second asset", e.asset2Frozen]
  ])
    i === !0 && t.push({
      id: `frozen-${o}`,
      severity: "critical",
      title: `${o} in this pair is frozen by its issuer`,
      detail: "A frozen asset cannot leave the pool. Liquidity in this AMM is not withdrawable while the freeze stands, regardless of what the pool balance shows.",
      action: "Do not treat this pool's depth as available liquidity."
    });
  const a = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((o, i) => a[o.severity] - a[i.severity]);
}
const Pe = 250, In = 400, En = 262144, Fn = 4194304, Rn = 2097152;
function On(e) {
  const t = e.reduce((n, s) => n + s, 0);
  return t <= 0 ? 0 : e.reduce((n, s) => n + (s / t * 100) ** 2, 0);
}
async function wt(e, t) {
  const [n, s] = await Promise.all([
    S("account_info", { account: e, ledger_index: "validated" }),
    S("gateway_balances", { account: e, ledger_index: "validated" })
  ]), a = n.account_data ?? {}, o = Number(a.Flags ?? 0), i = {};
  for (const [f, u] of Object.entries(
    s.obligations ?? {}
  )) {
    const y = Number(u);
    Number.isFinite(y) && (i[f] = y);
  }
  const r = [];
  let c, l = 0, d = !1, h;
  for (; l < Pe; ) {
    let f;
    try {
      f = await S("account_lines", {
        account: e,
        ledger_index: "validated",
        limit: In,
        ...c ? { marker: c } : {}
      });
    } catch (u) {
      if (l === 0) throw u;
      h = u instanceof Error ? u.message : "the walk was interrupted", d = !0;
      break;
    }
    for (const u of f.lines ?? [])
      r.push({
        account: String(u.account ?? ""),
        currency: String(u.currency ?? ""),
        // From the issuer's side a holder's balance is reported negative.
        held: Math.abs(Number(u.balance ?? 0)),
        limit: Number(u.limit_peer ?? u.limit ?? 0),
        // Present-and-true, never absent-means-false.
        frozenByIssuer: u.freeze === !0,
        authorized: u.authorized === !0
      });
    if (c = f.marker, l += 1, !c) break;
    l >= Pe && (d = !0);
  }
  const p = Object.keys(i).map((f) => {
    const u = r.filter((w) => w.currency === f), y = u.filter((w) => w.held > 0).sort((w, v) => v.held - w.held), b = y.map((w) => w.held), m = b.reduce((w, v) => w + v, 0), g = i[f];
    return {
      currency: f,
      outstanding: g,
      observedHeld: m,
      holders: u.length,
      activeHolders: y.length,
      hhi: On(b),
      topHolderPct: m > 0 ? (b[0] ?? 0) / m : 0,
      topFivePct: m > 0 ? b.slice(0, 5).reduce((w, v) => w + v, 0) / m : 0,
      frozenSeen: u.filter((w) => w.frozenByIssuer).length,
      authorizedSeen: u.filter((w) => w.authorized).length,
      coverage: g > 0 ? m / g : 0,
      top: y.slice(0, 10)
    };
  }).sort((f, u) => u.outstanding - f.outstanding);
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
    currencies: p,
    linesWalked: r.length,
    truncated: d,
    walkError: h,
    requiresAuth: (o & En) !== 0,
    canFreeze: (o & Rn) === 0,
    globalFreeze: (o & Fn) !== 0,
    ledgerIndex: Number(n.ledger_index ?? 0),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const Dn = 2500, Le = 0.95;
function Cn(e) {
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
    s.coverage < Le && t.push({
      id: `coverage-${s.currency}`,
      severity: "warn",
      title: `${s.currency}: holder lines account for only ${(s.coverage * 100).toFixed(1)}% of supply`,
      detail: `gateway_balances reports ${s.outstanding.toLocaleString(void 0, { maximumFractionDigits: 2 })} outstanding, but the holder lines read sum to ${s.observedHeld.toLocaleString(void 0, { maximumFractionDigits: 2 })}. Those come from different commands and should agree, so the gap is holders this walk did not see.`,
      action: "Trust the outstanding figure; treat the holder breakdown as incomplete."
    }), s.coverage >= Le ? s.hhi >= Dn ? t.push({
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
    const o = s.holders - s.activeHolders;
    o > 0 && t.push({
      id: `dormant-${s.currency}`,
      severity: "info",
      title: `${s.currency}: ${o.toLocaleString()} trust lines carry no balance`,
      detail: `Of ${s.holders.toLocaleString()} lines opened against this issuance, ${o.toLocaleString()} sit at zero. Each still costs its holder reserve, and a large dormant count usually means an onboarding funnel that people started and abandoned.`
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
const Pn = /* @__PURE__ */ new Set([
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
]), Ln = 946684800;
function Xn(e) {
  if (!/^([0-9A-F]{2})+$/i.test(e)) return e;
  const t = (e.match(/../g) ?? []).map((n) => String.fromCharCode(parseInt(n, 16))).join("").replace(/\0+$/, "").trim();
  return t && /^[\x20-\x7E]+$/.test(t) ? t : e;
}
function Xe(e) {
  return e.kind === "xrp" ? `${e.value.toLocaleString(void 0, { maximumFractionDigits: 6 })} XRP` : `${e.value.toLocaleString(void 0, { maximumFractionDigits: 6 })} ${q(e.currency)}`;
}
async function Hn(e) {
  let t;
  try {
    t = await S("account_objects", {
      account: e,
      ledger_index: "validated",
      type: "check",
      limit: 200
    });
  } catch (o) {
    throw o instanceof E && o.code === "actNotFound" ? new Error(
      "That address is not funded, so it has no account and nothing can be addressed to it yet."
    ) : o;
  }
  const n = t.account_objects ?? [], s = n.filter((o) => o.Destination === e), a = /* @__PURE__ */ new Map();
  for (const o of s) {
    const i = o.SendMax;
    if (typeof i != "object" || !i?.issuer) continue;
    const r = `${i.issuer}|${i.currency}`;
    if (!a.has(r))
      try {
        const [c, l] = await Promise.all([
          S("gateway_balances", { account: i.issuer, ledger_index: "validated" }),
          S("account_info", { account: i.issuer, ledger_index: "validated" })
        ]), d = Number((c.obligations ?? {})[i.currency] ?? 0), h = l.account_data?.Domain;
        a.set(r, {
          obligations: Number.isFinite(d) ? d : 0,
          domain: h ? Xn(String(h)) : void 0
        });
      } catch {
      }
  }
  return qn(e, n, a, Number(t.ledger_index ?? 0));
}
function qn(e, t, n, s) {
  const a = t.filter((i) => i.Destination === e), o = a.map((i) => {
    const r = i.SendMax, c = typeof r == "object" && r !== null, l = c ? {
      kind: "iou",
      currency: String(r.currency ?? ""),
      issuer: String(r.issuer ?? ""),
      value: Number(r.value ?? 0)
    } : { kind: "xrp", value: Number(r ?? 0) / 1e6 }, d = c ? `${r.issuer}|${r.currency}` : "", h = n.get(d), p = c ? q(String(r.currency ?? "")) : "XRP";
    return {
      index: String(i.index ?? ""),
      from: String(i.Account ?? ""),
      amount: l,
      destinationTag: i.DestinationTag !== void 0 ? Number(i.DestinationTag) : void 0,
      expiration: i.Expiration !== void 0 ? new Date((Number(i.Expiration) + Ln) * 1e3) : void 0,
      issuerObligations: h?.obligations,
      issuerOwesNothing: h !== void 0 && h.obligations === 0,
      borrowedTicker: c && Pn.has(p.toUpperCase()),
      issuerDomain: h?.domain
    };
  });
  return {
    address: e,
    inbound: o,
    outboundCount: t.length - a.length,
    ledgerIndex: s,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function Un(e) {
  const t = [];
  if (e.inbound.length === 0)
    return t.push({
      id: "none",
      severity: "ok",
      title: "Nothing is addressed to this account",
      detail: "No checks are pending against it. Note that a check can be cancelled by whoever created it at any time before it is cashed, so an empty result today does not mean none has ever arrived."
    }), t;
  const n = e.inbound.filter((r) => r.borrowedTicker && r.issuerOwesNothing);
  for (const r of n) {
    const c = r.amount.kind === "iou" ? q(r.amount.currency) : "XRP";
    t.push({
      id: `impersonation-${r.index.slice(0, 12)}`,
      severity: "critical",
      title: `A claim for ${Xe(r.amount)} that cannot be cashed for anything`,
      detail: `${r.from} has addressed a check for ${Xe(r.amount)} to this account. A currency code is not a name anyone owns — any account can issue a token called ${c}, and the ledger renders them identically. This one's issuer has NO obligations outstanding at all, meaning it has never issued a balance to anyone, so there is nothing this check could pay out.${r.issuerDomain ? ` The issuer publishes the domain ${r.issuerDomain}.` : ""}`,
      action: "Do not visit any domain associated with it and do not enter a wallet key anywhere it leads. The check itself is inert — it cannot move your funds, and ignoring it costs you nothing."
    });
  }
  const s = e.inbound.filter((r) => r.borrowedTicker && !r.issuerOwesNothing);
  for (const r of s) {
    const c = r.amount.kind === "iou" ? q(r.amount.currency) : "XRP";
    t.push({
      id: `ticker-${r.index.slice(0, 12)}`,
      severity: "warn",
      title: `A claim denominated in ${c} — verify the issuer, not the ticker`,
      detail: `The issuer does have ${r.issuerObligations?.toLocaleString(void 0, { maximumFractionDigits: 2 })} outstanding, so this token is genuinely held by someone. That still does not make it the ${c} you are thinking of: the code is unowned and any issuer may use it. Only the issuing address identifies a token.`,
      action: `Confirm ${r.amount.kind === "iou" ? r.amount.issuer : ""} is the issuer you expect before treating this as ${c}.`
    });
  }
  const a = e.inbound.filter(
    (r) => r.amount.kind === "iou" && r.issuerObligations === void 0
  );
  a.length > 0 && t.push({
    id: "unverified",
    severity: "warn",
    title: `${a.length} claim${a.length === 1 ? "'s issuer" : "s' issuers"} could not be checked`,
    detail: "The ledger did not answer for those issuing accounts, so whether they have issued anything is unknown — which is not the same as their being fine."
  });
  const o = e.inbound.filter(
    (r) => !r.borrowedTicker && (r.issuerObligations !== void 0 || r.amount.kind === "xrp")
  );
  o.length > 0 && t.push({
    id: "pending",
    severity: "info",
    title: `${o.length} other claim${o.length === 1 ? "" : "s"} pending`,
    detail: "Checks addressed to this account that do not borrow a well-known ticker. A check is an offer to pay, not a payment: nothing moves until it is cashed, and the sender can cancel it first."
  }), t.push({
    id: "reserve",
    severity: "info",
    title: "None of this costs the recipient anything",
    detail: "A Check object counts against the reserve of whoever created it, not of whoever receives it. Ignoring an unwanted claim is free, and there is nothing to clean up."
  });
  const i = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((r, c) => i[r.severity] - i[c.severity]);
}
const Mn = 1, zn = 2, jn = 8, Bn = 16, Wn = 5, He = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";
function Gn(e) {
  let t = 0n;
  for (const s of e) t = t << 8n | BigInt(s);
  let n = "";
  for (; t > 0n; )
    n = He[Number(t % 58n)] + n, t /= 58n;
  for (const s of e) {
    if (s !== 0) break;
    n = He[0] + n;
  }
  return n;
}
async function qe(e) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", e));
}
function Kn(e) {
  const t = new Uint8Array(e.length / 2);
  for (let n = 0; n < t.length; n += 1)
    t[n] = parseInt(e.slice(n * 2, n * 2 + 2), 16);
  return t;
}
async function Yn(e) {
  const t = new Uint8Array(21);
  t[0] = 0, t.set(Kn(e), 1);
  const n = (await qe(await qe(t))).slice(0, 4), s = new Uint8Array(25);
  return s.set(t, 0), s.set(n, 21), Gn(s);
}
async function Vn(e) {
  const t = e.trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(t))
    throw new Error(
      "An NFTokenID is 64 hexadecimal characters. Check for a truncated copy or stray whitespace."
    );
  const n = parseInt(t.slice(0, 4), 16), s = parseInt(t.slice(4, 8), 16);
  return {
    tokenId: t,
    issuer: await Yn(t.slice(8, 48)),
    burnable: (n & Mn) !== 0,
    mutable: (n & Bn) !== 0,
    transferable: (n & jn) !== 0,
    onlyXrp: (n & zn) !== 0,
    // TransferFee is in units of 0.001%, so 5000 is 5%.
    transferFeePct: s / 1e3,
    taxon: parseInt(t.slice(48, 56), 16),
    sequence: parseInt(t.slice(56, 64), 16)
  };
}
function Jn(e) {
  return Array.isArray(e) ? e.map((t) => ({
    index: String(t.nft_offer_index ?? ""),
    owner: String(t.owner ?? ""),
    amountXrp: typeof t.amount == "string" ? Number(t.amount) / 1e6 : void 0,
    amountRaw: t.amount,
    destination: t.destination ? String(t.destination) : void 0
  })) : [];
}
async function Qn(e) {
  const t = await Vn(e);
  let n = !1;
  const s = async (i) => {
    try {
      const r = await S(i, { nft_id: t.tokenId, ledger_index: "validated" });
      return Jn(r.offers);
    } catch (r) {
      return r?.code !== "objectNotFound" && (n = !0), [];
    }
  }, [a, o] = await Promise.all([
    s("nft_sell_offers"),
    s("nft_buy_offers")
  ]);
  return {
    rights: t,
    sellOffers: a,
    buyOffers: o,
    offersUnreadable: n,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function Zn(e) {
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
    severity: n.transferFeePct >= Wn ? "warn" : "info",
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
    const a = [...e.sellOffers, ...e.buyOffers].filter((o) => o.destination);
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
  return t.sort((a, o) => s[a.severity] - s[o.severity]);
}
const Ue = [
  "wss://xrplcluster.com",
  "wss://s1.ripple.com",
  "wss://s2.ripple.com",
  "wss://xrpl.ws"
], es = 2, ts = 4, bt = 12e3;
function ns(e) {
  return new Promise((t) => {
    const n = Date.now();
    let s = !1, a;
    const o = (r) => {
      if (!s) {
        s = !0;
        try {
          a?.close();
        } catch {
        }
        t(r);
      }
    };
    try {
      a = new WebSocket(e);
    } catch (r) {
      o({
        url: e,
        reachable: !1,
        error: r instanceof Error ? r.message : "could not open socket"
      });
      return;
    }
    const i = window.setTimeout(
      () => o({ url: e, reachable: !1, error: "no response within 12s" }),
      bt
    );
    a.onerror = () => {
      window.clearTimeout(i), o({ url: e, reachable: !1, error: "connection refused or blocked" });
    }, a.onopen = () => {
      a.send(JSON.stringify({ id: 1, command: "server_info" }));
    }, a.onmessage = (r) => {
      window.clearTimeout(i);
      try {
        const c = JSON.parse(String(r.data))?.result?.info ?? {}, l = c.validated_ledger ?? {}, d = String(c.complete_ledgers ?? "").split("-")[0];
        o({
          url: e,
          reachable: !0,
          roundTripMs: Date.now() - n,
          ledgerSeq: Number(l.seq) || void 0,
          ledgerAge: typeof l.age == "number" ? l.age : void 0,
          // Absent on s1/s2 by operator choice — preserved as undefined.
          version: typeof c.build_version == "string" ? c.build_version : void 0,
          serverState: typeof c.server_state == "string" ? c.server_state : void 0,
          peers: typeof c.peers == "number" ? c.peers : void 0,
          historyFrom: Number(d) || void 0,
          amendmentBlocked: typeof c.amendment_blocked == "boolean" ? c.amendment_blocked : void 0
        });
      } catch {
        o({ url: e, reachable: !1, error: "unreadable response" });
      }
    };
  });
}
function ss(e) {
  return new Promise((t) => {
    let n = !1, s;
    const a = (i) => {
      if (!n) {
        n = !0;
        try {
          s?.close();
        } catch {
        }
        t(i);
      }
    };
    try {
      s = new WebSocket(e);
    } catch {
      a(void 0);
      return;
    }
    const o = window.setTimeout(() => a(void 0), bt);
    s.onerror = () => {
      window.clearTimeout(o), a(void 0);
    }, s.onopen = () => s.send(JSON.stringify({ id: 1, command: "fee" })), s.onmessage = (i) => {
      window.clearTimeout(o);
      try {
        const r = JSON.parse(String(i.data))?.result ?? {}, c = r.levels ?? {}, l = Number(c.reference_level) || 256;
        a({
          source: e,
          pressure: (Number(c.open_ledger_level) || l) / l,
          queueSize: Number(r.current_queue_size ?? 0),
          maxQueueSize: Number(r.max_queue_size ?? 0),
          expectedLedgerSize: Number(r.expected_ledger_size ?? 0),
          minimumFeeDrops: Number(r.drops?.minimum_fee ?? 0),
          openLedgerFeeDrops: Number(r.drops?.open_ledger_fee ?? 0)
        });
      } catch {
        a(void 0);
      }
    };
  });
}
async function as() {
  const [e, t] = await Promise.all([
    Promise.all(Ue.map(ns)),
    ss(Ue[0])
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
function os(e) {
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
      (l) => l.reachable && typeof l.ledgerSeq == "number" && e.leaderSeq - l.ledgerSeq >= ts
    );
    c.length > 0 ? t.push({
      id: "node-lag",
      severity: "warn",
      title: `${c.length} node${c.length === 1 ? " is" : "s are"} behind the others`,
      detail: c.map(
        (l) => `${l.url} is ${e.leaderSeq - l.ledgerSeq} ledgers back`
      ).join(". ") + ". Ledgers close every three to four seconds, so this is beyond normal cadence.",
      action: "Readings taken from a trailing node describe a ledger that has already moved on."
    }) : typeof e.spread == "number" && e.spread <= es && t.push({
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
  const o = e.nodes.filter(
    (c) => c.reachable && typeof c.historyFrom == "number" && c.historyFrom > 32570
  );
  if (o.length > 0 && t.push({
    id: "partial-history",
    severity: "info",
    title: `${o.length} node${o.length === 1 ? " keeps" : "s keep"} only recent history`,
    detail: o.map((c) => `${c.url} retains from ledger ${c.historyFrom?.toLocaleString()}`).join(". ") + ". Queries against older ledgers will fail there even though the node is healthy."
  }), e.fee) {
    const c = e.fee, l = c.maxQueueSize > 0 ? c.queueSize / c.maxQueueSize : 0;
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
      detail: `The open ledger is charging the reference fee — ${c.openLedgerFeeDrops.toLocaleString()} drops — with ${c.queueSize.toLocaleString()} transactions queued of ${c.maxQueueSize.toLocaleString()} capacity (${(l * 100).toFixed(1)}% full). Expected ledger size is ${c.expectedLedgerSize.toLocaleString()} transactions.`
    });
  }
  const i = e.nodes.filter((c) => c.reachable && c.version === void 0);
  i.length > 0 && t.push({
    id: "undisclosed",
    severity: "info",
    title: `${i.length} node${i.length === 1 ? " does" : "s do"} not disclose their software version`,
    detail: `${i.map((c) => c.url).join(", ")} answered normally but omit build version, server state and peer count. That is an operator's choice about what to publish — it is not a fault, and it is not something this tool can infer.`
  });
  const r = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((c, l) => r[c.severity] - r[l.severity]);
}
function is(e) {
  return e.passed ? "PASS" : e.severity === "block" ? "FAIL" : "REVIEW";
}
function rs(e) {
  return e.state ?? is(e);
}
const cs = /* @__PURE__ */ new Set(["INSUFFICIENT_DATA", "NOT_APPLICABLE"]);
function ls(e) {
  return e.state && cs.has(e.state) ? [e.id, e.passed, e.state] : [e.id, e.passed];
}
async function ds(e) {
  const t = new TextEncoder().encode(e), n = await crypto.subtle.digest("SHA-256", t);
  return Array.from(new Uint8Array(n)).map((s) => s.toString(16).padStart(2, "0")).join("").toUpperCase();
}
async function us(e) {
  return ds(
    JSON.stringify({
      kind: e.kind,
      subject: e.subject,
      scope: Object.keys(e.scope).sort().map((t) => [t, e.scope[t]]),
      evaluatedAt: e.evaluatedAt,
      checks: e.checks.map(ls)
    })
  );
}
const Me = 0.95, hs = /* @__PURE__ */ new Set([
  "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
  // ACCOUNT_ZERO
  "rrrrrrrrrrrrrrrrrrrrBZbvji",
  // ACCOUNT_ONE
  "rrrrrrrrrrrrrrrrrNAMEtxvNvQ",
  // reserved for name lookups
  "rrrrrrrrrrrrrrrrrrrn5RM1rHd"
  // rippled's NaN sentinel
]);
function de(e) {
  return !!e && !hs.has(e);
}
const ze = 2500, je = 2;
async function ps(e, t = {}) {
  const n = [], [s, a, o] = await Promise.all([
    gt(e).catch((r) => (n.push(`control: ${r instanceof Error ? r.message : String(r)}`), null)),
    pt(e).catch((r) => (n.push(`posture: ${r instanceof Error ? r.message : String(r)}`), null)),
    // The supply walk is the expensive read, so it is opt-in. When it is
    // skipped the concentration checks abstain rather than assume.
    t.walkSupply ? wt(e).catch((r) => (n.push(`issuance: ${r instanceof Error ? r.message : String(r)}`), null)) : Promise.resolve(null)
  ]), i = a?.unreadable ? null : a;
  return a?.unreadable && n.push(`posture: ${a.unreadable}`), {
    issuer: e,
    control: s,
    posture: i,
    issuance: o,
    unreadable: n,
    ledgerIndex: s?.ledgerIndex ?? o?.ledgerIndex ?? 0,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function vt(e) {
  return !e || e.currencies.length === 0 ? null : e.currencies.reduce((t, n) => n.outstanding > t.outstanding ? n : t);
}
function fs(e) {
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
  const a = !!n.signers.unreadable, o = !n.masterKeyEnabled && !!n.regularKey && !de(n.regularKey), i = n.signers.present ? n.signers.minimumSigners <= 1 : de(n.regularKey) || n.masterKeyEnabled;
  t.push({
    id: "NO_UNILATERAL_SIGNER",
    label: "No single key controls the issuer",
    severity: "block",
    // A signer list that could not be read cannot be ruled out, and an
    // unverifiable absence must not read as an absence.
    passed: !i && !a,
    detail: a ? `The signer list could not be read (${n.signers.unreadable}), so it cannot be established whether a committee controls this account or one key does. This is an unknown, not a pass.` : n.signers.present ? n.signers.minimumSigners <= 1 ? `A signer list is present, but ${n.signers.unilateralSigners.length || 1} signer reaches the quorum of ${n.signers.quorum} alone. This is a single-key account wearing a committee's clothes.` : `${n.signers.minimumSigners} signers must agree to reach the quorum of ${n.signers.quorum}, derived from summed weights rather than a headcount.` : o ? `The master key is disabled and the regular key is set to ${n.regularKey}, an address whose private key does not exist. The account is blackholed: it can never sign another transaction, so no party can act on this issuance.` : de(n.regularKey) ? `No signer list. The master key is ${n.masterKeyEnabled ? "enabled" : "disabled"} and a regular key is set, so ${n.regularKey} signs for this issuer on its own.` : n.masterKeyEnabled ? "No signer list and no usable regular key, and the master key is enabled. One key signs for this issuer." : "The master key is disabled, no regular key is set and no signer list is present, so the account cannot currently be signed for at all."
  }), s.transferRateBps > 0 && t.push({
    id: "NO_TRANSFER_FEE",
    label: "No issuer transfer fee",
    severity: "warn",
    passed: !1,
    detail: `The issuer charges ${(s.transferRateBps / 100).toFixed(2)}% on every transfer between holders. The rate is set by the issuer and can be changed by them.`
  });
  const r = vt(e.issuance), c = e.unreadable.find((l) => l.startsWith("issuance:"));
  if (!e.issuance)
    t.push({
      id: "SUPPLY_CONCENTRATION",
      label: "Supply concentration",
      severity: "warn",
      passed: !1,
      state: "INSUFFICIENT_DATA",
      detail: c ? `The holder walk was requested and could not be completed (${c.replace(/^issuance:\s*/, "")}), so no concentration finding is made. This is a failed read, not an abstention and not a pass.` : "Supply was not walked for this certificate, so no concentration finding is made. This is an abstention, not a pass."
    });
  else if (!r)
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
  else if (r.coverage < Me)
    t.push({
      id: "SUPPLY_CONCENTRATION",
      label: `${q(r.currency)} supply concentration`,
      severity: "warn",
      passed: !1,
      state: "INSUFFICIENT_DATA",
      detail: `The holder lines read account for ${(r.coverage * 100).toFixed(1)}% of the outstanding ${q(r.currency)}. Below ${Me * 100}% coverage no concentration figure is reported, high or low, because shares over that fraction describe the holders seen rather than the issuance.`
    });
  else {
    const l = r.hhi >= ze, d = e.issuance.source === "indexer" ? ` Holder balances are from ${e.issuance.sourceName}, not read from the ledger directly; their total was reconciled against the ledger's own obligations to within ${Math.abs(r.coverage - 1) * 100 < 0.01 ? "0.01" : (Math.abs(r.coverage - 1) * 100).toFixed(2)}%, which establishes that none are missing or invented but not that each is attributed correctly.` : " Holder balances were read from validated ledger state.";
    t.push({
      id: "SUPPLY_CONCENTRATION",
      label: `${q(r.currency)} supply not concentrated`,
      severity: "warn",
      passed: !l,
      detail: (l ? `HHI ${Math.round(r.hhi)} over ${r.holders} holders at ${(r.coverage * 100).toFixed(1)}% coverage. The largest holder carries ${r.topHolderPct.toFixed(1)}% and the top five carry ${r.topFivePct.toFixed(1)}%.` : `HHI ${Math.round(r.hhi)} over ${r.holders} holders at ${(r.coverage * 100).toFixed(1)}% coverage, below the ${ze} threshold.`) + d
    });
  }
  return t;
}
function gs(e, t = {}) {
  return e.some((n) => n.severity === "block" && !n.passed) ? "no-go" : (t.unreadable?.length ?? 0) > 0 ? "insufficient-data" : e.some((n) => !n.passed) ? "hold" : "go";
}
async function ms(e, t = {}) {
  const n = await ps(e, t);
  return ys(n);
}
async function ys(e) {
  const t = fs(e), n = gs(t, { unreadable: e.unreadable }), s = vt(e.issuance)?.currency, a = e.readAt, o = await us({
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
      rules: je
    },
    checks: t,
    evaluatedAt: a
  });
  return {
    verdict: n,
    issuer: e.issuer,
    currency: s,
    currencyLabel: s ? q(s) : void 0,
    checks: t,
    digest: o,
    ledgerIndex: e.ledgerIndex,
    evaluatedAt: a,
    source: e.issuance?.source ?? "none",
    rulesVersion: je
  };
}
const ws = [
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
    id: "personal-guardian",
    question: "Can I get an alert on my own computer if my wallet is being taken over?",
    answer: "Yes, free. In SECURITY CENTER › GUARDIAN, add your own addresses under PERSONAL GUARDIAN (3 on Free, 50 on Pro and above). While NOSHASHI is open it reads them every minute and raises a native notification when a new regular key or signer list appears, the master key is switched, the account is deleted, more than your threshold of XRP leaves, or a dust payment or NFT offer with a link arrives. The addresses and alerts stay on your device. For accounts that must be watched when no one has the app open, Strategic's server-side Guardian sends signed webhooks.",
    keywords: ["notification", "alert me", "personal", "my wallet", "desktop", "guardian", "outflow", "notify", "monitor my"]
  },
  {
    id: "pre-sign-check",
    question: "A website asks me to sign a transaction. How do I know what it does?",
    answer: "Paste it into SECURITY CENTER › PRE-SIGN CHECK (free), as JSON or as the hex blob the site shows. It is decoded on your device and explained in plain words, with a verdict: SAFE-LOOKING, CAREFUL or DO NOT SIGN. DO NOT SIGN is given for what empties accounts: a SetRegularKey or SignerListSet that hands signing to someone else, an AccountDelete, an NFT sell offer for zero, or an OFAC-listed or lookalike destination. A transaction is not a secret; a seed is, and no legitimate site ever asks for one.",
    keywords: ["sign", "signing", "blob", "transaction", "approve", "wallet prompt", "what does this do", "decode", "phishing", "claim", "airdrop"]
  },
  {
    id: "recover-funds",
    question: "Is any of my XRP stuck, and can I get my reserve back?",
    answer: "Open SECURITY CENTER › RECOVER FUNDS (free for one address). It reads everything the account owns and lists what comes back. That covers escrows that have matured and are waiting for someone to finish them, and expired escrows and payment channels that return to you when closed. It also covers checks written to you that you never cashed. The owner reserve (0.2 XRP each) locked by empty trust lines, old orders, NFT offers, preauthorisations and unused tickets is listed too. Each item comes with the unsigned transaction that releases it, and the scan says what AccountDelete would return if you closed the account. Pro values every other holding in XRP and scans 25 addresses at once; Institutional scans 500.",
    keywords: ["stuck", "reserve", "escrow", "payment channel", "check", "reclaim", "unlock", "recover", "trust line", "accountdelete", "forgotten", "free up"]
  },
  {
    id: "exposure-audit",
    question: "How do I revoke permissions on my XRP Ledger account?",
    answer: "The XRP Ledger has no token allowances, but it has standing permissions that let someone else take value: checks you wrote, NFT sell offers (a zero-price one gives the NFT away), funded payment channels, open orders, deposit preauthorisations, a regular key, signers and an authorised NFT minter. SECURITY CENTER › EXPOSURE AUDIT (free) lists every one on your account with its risk and the unsigned transaction that revokes it.",
    keywords: ["revoke", "approval", "approvals", "permission", "allowance", "exposure", "open offer", "nft offer", "check", "cancel"]
  },
  {
    id: "deposit-help",
    question: "I sent XRP to an exchange and it never arrived. What happened?",
    answer: "Paste the transaction hash into SECURITY CENTER › DEPOSIT HELP (free). If the payment failed (for example tecDST_TAG_NEEDED), only the fee was spent and the amount is still in your account. If it succeeded without the destination tag, or with the wrong one, the funds are in the exchange's pooled account: only the exchange can credit them, and it usually will when given the facts. NOSHASHI writes that letter, with the hash, ledger, amount, tags and a SHA-256, for you to send from your logged-in account. A payment to a private wallet can only be returned by its owner.",
    keywords: ["deposit", "never arrived", "missing", "destination tag", "forgot tag", "wrong tag", "exchange", "credited", "lost deposit", "memo"]
  },
  {
    id: "domain-check",
    question: "How can I tell if an account really belongs to the company it claims?",
    answer: "An account's Domain field is a claim anyone can write. It is proven only when that website lists the account back in its /.well-known/xrp-ledger.toml. SECURITY CENTER › DOMAIN CHECK (free) reads the file and tells you VERIFIED, UNVERIFIED (treat it as impersonation) or that no file exists. Given a domain instead, it shows which accounts the domain vouches for and whether each names it back.",
    keywords: ["domain", "toml", "xrp-ledger.toml", "impersonation", "fake exchange", "official", "verify", "belongs", "real account"]
  },
  {
    id: "scam-cluster",
    question: "Can NOSHASHI find the other accounts a scammer uses?",
    answer: "Yes, on Pro and above. SECURITY CENTER › SCAM CLUSTERS starts from one known scam account. It finds who funded it, the accounts it created, and where it swept its balance when it deleted itself. It also groups accounts that share a vanity ending or a memo. Exchanges end a branch, so their customers are not pulled in, and every link names its transaction. Pro maps two hops and 40 accounts. Enterprise maps four hops and 200, and opens the report as an investigation case. Strategic watches the whole cluster server-side.",
    keywords: ["cluster", "scammer", "network", "related accounts", "linked", "operation", "drainer", "vanity", "same person"]
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
], bs = [
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
      "Pre-sign explainer — paste any transaction or blob and see what it really does before you sign (DO NOT SIGN on takeovers and NFT giveaways)",
      "Stuck funds & reserve recovery — matured escrows, expired channels and checks, and reserve locked in old objects, with the transactions to get it back",
      "Exposure audit — every check, NFT sell offer, channel, order, key and preauthorisation that lets someone else take value, with a revoke for each",
      "Wrong-deposit helper — a deposit that 'vanished' explained from its hash, with the letter to the exchange when it arrived without a tag",
      "Domain impersonation check — does the domain an account claims list it back in its xrp-ledger.toml",
      "Forgotten-asset inventory — tokens, LP shares, NFTs and open orders an account still holds",
      "Personal Guardian — native takeover alerts for up to 3 of your own addresses while the app is open",
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
      "Asset recovery suite — forgotten assets valued in XRP at the live best bid, recovery and exposure scans across 25 addresses at once, Personal Guardian on 50 addresses",
      "Scam cluster mapper — the accounts one operation runs, linked by funder, AccountDelete sweeps, vanity endings and shared memos (two hops, 40 accounts)",
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
      "incident_response",
      "asset_recovery"
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
      "Recovery and exposure scans across up to 500 addresses in one run, exported for the audit file",
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
      "incident_response",
      "asset_recovery"
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
      "Forensic cluster mapping — four hops and 200 accounts per scam operation, opened as an investigation case",
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
      "forensic_trace",
      "asset_recovery"
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
      "Security Guardian — signed security_alert webhooks the minute a watched account's keys change or it is deleted, and one-click watching of a theft trail or a whole scam cluster",
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
      "security_guardian",
      "asset_recovery"
    ]
  }
], vs = [{ name: "Overview", plan: "Free", summary: "what NOSHASHI is and what it reads." }, { name: "Mission Control", plan: "Free", summary: "live mainnet telemetry, wallet gate, policy rule set." }, { name: "Verification", plan: "Free", summary: "describe a settlement, run it against a domain, get an explainable verdict and a SHA-256 receipt. Nothing is broadcast." }, { name: "Credentials", plan: "Free", summary: "XLS-70 objects held by the wallet, and which domains they unlock." }, { name: "Domain Grid", plan: "Free", summary: "XLS-80 permissioned domains and their rule sets." }, { name: "Audit Trail", plan: "Free", summary: "wallet history, filterable, exportable to CSV." }, { name: "NOSHX", plan: "Free", summary: "this assistant, NOSHASHI's agent. It reads the live ledger with read-only tools (authority, order book, settlement, control surface, provenance, pools, issuance, address check, claims, NFT rights, ledger status), each gated like its screen, answers questions about NOSHASHI itself from the product's own pages (features, screens, plans, docs, trust, legal), and by default runs on NOSHX Core, NOSHASHI's own engine, which uses no language model: it plans from the question, runs the readers and writes the answer itself. A language model can be added (the trained NOSHX model through Ollama, or a hosted one), with optional failover back to Core and a deep reasoning switch. It has an Observer that reads the wallets you name from validated mainnet on an interval and records what changed (freezes, balances, credentials, issuer powers) by fixed rules, and a one-click issuer investigation that reads an issuer's authority certificate and obligations and hands the findings to this assistant." }, { name: "Portfolio & Radar", plan: "Desk", summary: "multi-wallet surveillance and the compliance radar." }, { name: "Exposure Analysis", plan: "Desk", summary: "issuer freeze rights, Travel Rule scope, counterparty concentration." }, { name: "Ledger & Policy", plan: "Desk", summary: "local adjudication history, evidence chain and receipt verification, investigations (cases a person opens on a verdict, with notes and a written resolution; a resolution never changes the verdict), the versioned institutional policy (drafts, simulation, activation, audit trail), policy simulation, signed export." }, { name: "Check an Address", plan: "Free", summary: "read what the ledger publishes about any account." }, { name: "Token Rights", plan: "Free", summary: "what the issuer of an NFT can still do to it after someone owns it — destroy it (lsfBurnable), rewrite what its URI points at (lsfMutable), block resale entirely, or take a cut of every transfer. All of it is encoded in the NFTokenID itself and decoded offline, so no server is asked and none can answer wrongly." }, { name: "Inbox", plan: "Free", summary: "every check a stranger has addressed to an account, and whether the token each one offers has ever been issued by anyone. A currency code is not a name anyone owns — any account can issue a token called USDT — so an unsolicited claim for a large round sum from an issuer with no obligations is impersonation, not money. Receiving one costs nothing and cannot move funds." }, { name: "Ledger Sync", plan: "Free", summary: "four public XRPL nodes queried and compared, with disagreement between them treated as the reading." }, { name: "Learn", plan: "Free", summary: "short animated explainers." }, { name: "Settlement", plan: "Desk", summary: "what a transaction actually DELIVERED against what it requested. A partial payment can return tesSUCCESS having delivered a fraction of the stated amount; this is the screen for that question." }, { name: "Ledger Garden", plan: "Desk", summary: "walk the ledger's relationships one validated read at a time — an issuer's assets, an asset's holders (from the first 200 of the issuer's trust lines, in ledger order; Issuance walks them all), an account's holdings and recent transactions, a transaction's settlement evidence — then hand the whole path to this agent as a question." }, { name: "Provenance", plan: "Desk", summary: "how long an account has existed and who sent it its first XRP. Note the sequence number is not a transaction count on modern accounts." }, { name: "Control Surface", plan: "Desk", summary: "how few signers can actually move a treasury, whether the master key bypasses the quorum, and how much balance is locked rather than spendable." }, { name: "Order Book", plan: "Desk", summary: "how much of an order book's quoted depth is backed by an owner who still holds the asset. An offer rests whether or not its owner kept the funds, and nothing removes it until someone tries to cross it — on some mainnet books over 90% of the visible depth cannot fill." }, { name: "Pool Governance", plan: "Desk", summary: "who votes an AMM's trading fee, on what share of the liquidity, and who holds the discounted auction slot." }, { name: "Issuance", plan: "Institution", summary: "holder concentration and enforcement history for an issuer, from the issuer's side." }, { name: "Authority Certificate", plan: "Desk", summary: "what authority an issuer has kept over an asset it issued — whether it can freeze a holder, whether it gave that power up irrevocably (lsfNoFreeze cannot be cleared once set), whether the asset is frozen right now, whether holding it needs the issuer's permission, whether one signer reaches the quorum alone, what it charges on a transfer between holders, and how concentrated the supply is. Each answer is a fact at one named ledger index, and the set is digested with SHA-256 so the same reading can be checked again later. It is NOT a score — no number is composited from the checks — and NOT a legal finding: whether an asset is decentralised or is a security is a determination for an agency applying statutory criteria, which this software does not evaluate. If the supply walk is skipped, or trust-line coverage falls below 95%, the concentration check abstains rather than passing." }, { name: "Ledger Watch", plan: "Free", summary: "screens an incoming payment to a deposit address before it is credited, read live from the ledger — it credits what actually arrived (delivered_amount, never the Amount of a partial payment), holds a familiar ticker whose issuer owes nothing as counterfeit, flags dust carrying a link as a phishing lure, notes a missing destination tag, the issuer's freeze and clawback rights, the Travel Rule threshold, and traces who created the sender and who created them, three hops back, against the organization's deny list. Verdicts are clear, review or hold; what could not be read holds the deposit. Deposit addresses and monitored accounts are read by the server every minute; each event goes to the organization's webhooks (xrpl_event, deposit_screened) and to a JSON/NDJSON feed API with a history endpoint; export schemas shape bulk exports and the feed. Requires Enterprise (deposit screening); monitoring any account, event feeds, custom schemas and retention need Strategic." }, { name: "Security Center", plan: "Free", summary: "ACCOUNT CHECK (free) grades any address A to F from who can sign (master key, regular key, signer list and its real quorum), recent key and settings changes, address-poisoning attempts and open doors (NFT offers, checks, payment channels), and writes an unsigned hardening plan the owner signs in their own wallet. SAFE SEND (free) checks a pasted destination against the operator's own address book for lookalikes and against the OFAC list. INCIDENT RESPONSE (Pro+; five hops and a case on Enterprise) follows stolen value through payments and AccountDelete sweeps past dust, says where it is, and rates every recovery path; validated transactions are never reversible. GUARDIAN (Strategic) sends security_alert webhooks when a watched account's keys change or it is deleted." }, { name: "Asset Passport", plan: "Enterprise", summary: "a signed, portable record of an asset’s compliance posture — issuer authority, freeze rights, concentration, domain eligibility — that travels with the asset and can be verified by any counterparty without re-running the checks." }, { name: "Growth", plan: "Free", summary: "platform-native drafts built from measured figures." }, { name: "Pricing", plan: "Free", summary: "plans, checkout and verification credits." }, { name: "Account", plan: "Free", summary: "subscription, two-factor authentication and API keys." }, { name: "Business Plan", plan: "Free", summary: "revenue streams, tiers and sequencing." }, { name: "Legal & Accessibility", plan: "Free", summary: "policies, accessibility statement and contact routes." }, { name: "Trust & Security", plan: "Free", summary: "the read-only data path from the ledger to the receipt, what NOSHASHI never does (no keys, custody, signing or broadcast), where data goes, and what it does not claim." }, { name: "Settings", plan: "Free", summary: "appearance, accessibility, wallet address, notifications, launch at login, global shortcut and Keychain storage." }], kt = {
  scenes: vs
}, ks = "https://www.noshashi.app";
function Ss() {
  const e = ws.map((n) => ({
    title: `Help › ${n.question}`,
    source: "NOSHX › Support",
    text: `${n.question}
${n.answer}`
  }));
  for (const n of bs)
    e.push({
      title: `Pricing › ${n.name}`,
      source: `${ks}/pricing/`,
      text: `${n.name} plan, for ${n.audience}. Price (cost): ${n.priceLabel} ${n.cadence}. Includes: ${n.features.join("; ")}.`
    });
  const t = kt.scenes;
  for (let n = 0; n < t.length; n += 6)
    e.push({
      title: "App screens",
      source: "NOSHASHI desktop app",
      text: t.slice(n, n + 6).map((s) => `${s.name} (${s.plan}): ${s.summary}`).join(`
`)
    });
  return e;
}
const $s = new Set(
  "a an and are as at be but by can do does for from has have how i if in is it its me my of on or our so that the their them then there these this to was we what when where which who why will with you your".split(" ")
), Ts = {
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
function L(e) {
  return (e.toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) ?? []).filter((t) => !$s.has(t) && t.length > 1).map((t) => Ts[t] ?? (t.length > 4 ? t.replace(/(ies|es|s|ing|ed)$/, (n) => n === "ies" ? "y" : "") : t));
}
function As(e) {
  const t = [], n = [];
  for (const i of e) {
    const r = L(i.title), c = L(i.text), l = /* @__PURE__ */ new Map();
    for (const d of r) l.set(d, (l.get(d) ?? 0) + 2);
    for (const d of c) l.set(d, (l.get(d) ?? 0) + 1);
    t.push(l), n.push(` ${r.join(" ")} ${c.join(" ")} `);
  }
  const s = t.map((i) => [...i.values()].reduce((r, c) => r + c, 0)), a = /* @__PURE__ */ new Map();
  for (const i of t) for (const r of i.keys()) a.set(r, (a.get(r) ?? 0) + 1);
  const o = s.reduce((i, r) => i + r, 0) / Math.max(1, s.length);
  return { passages: e, docs: t, sequences: n, lengths: s, df: a, avg: o };
}
function xs(e, t, n = 5) {
  const s = L(t), a = [...new Set(s)], o = s.slice(1).map((p, f) => ` ${s[f]} ${p} `);
  if (a.length === 0) return [];
  const i = e.passages.length, r = 1.4, c = 0.55, l = (p) => {
    const f = e.df.get(p) ?? 0;
    return Math.log(1 + (i - f + 0.5) / (f + 0.5));
  }, d = [];
  e.docs.forEach((p, f) => {
    let u = 0;
    for (const y of a) {
      const b = p.get(y);
      b && (u += l(y) * b * (r + 1) / (b + r * (1 - c + c * e.lengths[f] / e.avg)));
    }
    for (const y of o)
      if (e.sequences[f].includes(y)) {
        const [b, m] = y.trim().split(" ");
        u += 0.6 * (l(b) + l(m));
      }
    u > 0 && d.push({ ...e.passages[f], score: u * (e.passages[f].weight ?? 1) });
  }), d.sort((p, f) => f.score - p.score);
  const h = /* @__PURE__ */ new Set();
  return d.filter((p) => !h.has(p.title) && h.add(p.title)).slice(0, n);
}
let V = null, St = [];
function _s(e) {
  St = e, V = null;
}
function $t() {
  return V ?? (V = import("./pages-jd_FSlZL.js").then(({ default: e }) => As([...Ss(), ...St, ...e]))), V;
}
function Ns() {
  if (V) return;
  const e = () => {
    $t();
  };
  typeof requestIdleCallback == "function" ? requestIdleCallback(e, { timeout: 1500 }) : setTimeout(e, 0);
}
async function Tt(e, t = 5) {
  return xs(await $t(), e, t);
}
function X(e) {
  if (!/^[0-9A-F]{40}$/i.test(e)) return e;
  const t = (e.match(/../g) ?? []).map((n) => String.fromCharCode(parseInt(n, 16))).join("").replace(/\0+$/, "").trim();
  return t && /^[\x20-\x7E]+$/.test(t) ? t : e;
}
const Is = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(?:[a-z]{2,24})\b/i, Es = (e) => Is.test(e);
function At(e, t, n = 4) {
  for (const s of t)
    if (!(s === e || s.length < n * 2 + 1) && s.slice(0, n + 1) === e.slice(0, n + 1) && s.slice(-n) === e.slice(-n))
      return s;
  return null;
}
const Fs = 946684800, Y = {
  disableMaster: 1048576,
  depositAuth: 16777216,
  disallowIncomingNFTokenOffer: 67108864,
  disallowIncomingCheck: 134217728,
  disallowIncomingPayChan: 268435456
}, H = {
  disableMaster: 4,
  disallowIncomingNFTokenOffer: 12,
  disallowIncomingCheck: 13,
  disallowIncomingPayChan: 14
}, Be = {
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
}, Rs = (e) => typeof e == "number" ? new Date((e + Fs) * 1e3).toISOString() : null;
function Os(e) {
  return /^([0-9A-Fa-f]{2})+$/.test(e) ? new TextDecoder().decode(new Uint8Array((e.match(/../g) ?? []).map((t) => parseInt(t, 16)))) : e;
}
function Ds(e, t) {
  const n = e.map((a) => a.weight).sort((a, o) => o - a);
  let s = 0;
  for (let a = 0; a < n.length; a++)
    if (s += n[a], s >= t) return a + 1;
  return 1 / 0;
}
function We(e, t, n, s) {
  const a = t?.account_data ?? null, i = (t?.signer_lists ?? a?.signer_lists ?? [])[0], r = (i?.SignerEntries ?? []).map((b) => ({ account: String(b.SignerEntry?.Account ?? ""), weight: Number(b.SignerEntry?.SignerWeight ?? 0) })).filter((b) => b.account), c = Number(i?.SignerQuorum ?? 0), l = Number(a?.Flags ?? 0), d = [], h = /* @__PURE__ */ new Set(), p = [];
  let f = 0;
  for (const b of n) {
    const m = b.tx_json ?? b.tx ?? b;
    if ((b.meta ?? {}).TransactionResult !== "tesSUCCESS") continue;
    const w = Number(b.ledger_index ?? m.ledger_index ?? 0), v = String(m.hash ?? b.hash ?? ""), k = Rs(m.date ?? b.date), $ = m.Account === e;
    switch (m.TransactionType) {
      case "SetRegularKey":
        $ && d.push(
          m.RegularKey ? { kind: "regular_key_set", ledger: w, at: k, hash: v, detail: `Regular key set to ${m.RegularKey}: that key can now sign alone.` } : { kind: "regular_key_removed", ledger: w, at: k, hash: v, detail: "Regular key removed." }
        );
        break;
      case "SignerListSet":
        if ($) {
          const T = Number(m.SignerQuorum ?? 0), A = (m.SignerEntries ?? []).length;
          d.push(
            T > 0 ? { kind: "signer_list_set", ledger: w, at: k, hash: v, detail: `Signer list set: quorum ${T} across ${A} signer${A === 1 ? "" : "s"}.` } : { kind: "signer_list_removed", ledger: w, at: k, hash: v, detail: "Signer list removed." }
          );
        }
        break;
      case "AccountSet":
        $ && (m.SetFlag === H.disableMaster ? d.push({ kind: "master_disabled", ledger: w, at: k, hash: v, detail: "Master key disabled." }) : m.ClearFlag === H.disableMaster ? d.push({ kind: "master_enabled", ledger: w, at: k, hash: v, detail: "Master key re-enabled." }) : typeof m.SetFlag == "number" ? d.push({ kind: "flag_set", ledger: w, at: k, hash: v, detail: `Set: ${Be[m.SetFlag] ?? `flag ${m.SetFlag}`}.` }) : typeof m.ClearFlag == "number" && d.push({ kind: "flag_cleared", ledger: w, at: k, hash: v, detail: `Cleared: ${Be[m.ClearFlag] ?? `flag ${m.ClearFlag}`}.` }));
        break;
      case "AccountDelete":
        $ && d.push({ kind: "account_deleted", ledger: w, at: k, hash: v, detail: `Account deleted; its XRP went to ${m.Destination}.` });
        break;
      case "Payment":
        if ($ && typeof m.Destination == "string" && h.add(m.Destination), m.Destination === e && typeof m.Account == "string") {
          p.push({ from: m.Account, hash: v, ledger: w });
          const T = typeof m.Amount == "string" ? Number(m.Amount) : NaN;
          Number.isFinite(T) && T < 1e4 && (f += 1);
        }
        break;
    }
  }
  const u = [], y = /* @__PURE__ */ new Set();
  for (const b of p) {
    if (h.has(b.from) || y.has(b.from)) continue;
    const m = At(b.from, h);
    m && (y.add(b.from), u.push({ sender: b.from, imitates: m, hash: b.hash, ledger: b.ledger }));
  }
  return {
    address: e,
    exists: !!a,
    balanceXrp: a ? Number(a.Balance ?? 0) / 1e6 : 0,
    flags: l,
    masterEnabled: (l & Y.disableMaster) === 0,
    regularKey: a?.RegularKey ? String(a.RegularKey) : null,
    signerList: r.length ? { quorum: c, signers: r, minimumSigners: Ds(r, c) } : null,
    domain: typeof a?.Domain == "string" && a.Domain ? Os(a.Domain) : null,
    ledgerIndex: Number(t?.ledger_index ?? 0),
    events: d,
    poisoning: u,
    dustReceived: f,
    historyRead: n.length,
    historyComplete: s
  };
}
async function Ge(e, t = 200) {
  const n = await S("account_info", { account: e, ledger_index: "validated", signer_lists: !0 }).catch((o) => {
    if (/actNotFound|not found/i.test(o instanceof Error ? o.message : String(o))) return null;
    throw o;
  });
  if (!n) return We(e, null, [], !0);
  const s = await S("account_tx", { account: e, ledger_index_min: -1, ledger_index_max: -1, forward: !1, limit: t }).catch(() => ({ transactions: [] })), a = s.transactions ?? [];
  return We(e, n, a, !s.marker);
}
const Ke = { critical: 0, warn: 1, info: 2, ok: 3 }, Cs = 864e5;
function Ps(e, t = Date.now()) {
  const n = [], s = [], a = (u) => (e.flags & u) !== 0;
  if (!e.exists)
    return {
      score: 0,
      grade: "F",
      summary: "This account does not exist on the ledger: never funded, or deleted.",
      findings: [{ id: "not-found", severity: "info", title: "No account at this address", detail: "The validated ledger has no AccountRoot here. If you expected funds, check the address; if it was deleted, its XRP went to the account named in its AccountDelete." }],
      plan: []
    };
  const o = e.signerList;
  e.masterEnabled && !e.regularKey && !o && n.push({
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
  }), !e.masterEnabled && e.regularKey && !o && n.push({
    id: "regular-only",
    severity: "info",
    title: "A single regular key controls the account",
    detail: `The master key is disabled and the regular key ${e.regularKey} signs alone. That is a sound setup when that key lives in a hardware wallet or HSM, and a single point of failure when it does not.`
  }), o && (e.masterEnabled && n.push({
    id: "bypassable-multisig",
    severity: "critical",
    title: "The signer list can be bypassed",
    detail: `Quorum ${o.quorum} is configured, but the master key still signs alone, so one stolen seed skips every approval.`,
    action: "Disable the master key once the signers have been confirmed to sign."
  }), o.minimumSigners === 1 / 0 ? n.push({ id: "quorum-unreachable", severity: "critical", title: "The signers can never reach quorum", detail: `Quorum ${o.quorum} is more than the signers' combined weight. Unless another key exists, nothing can be moved.` }) : o.minimumSigners === 1 ? n.push({ id: "one-signer-enough", severity: "critical", title: "One signer can act alone", detail: `A single signer carries quorum ${o.quorum} by weight, so the list gives no second approval.`, action: "Rebalance weights so no single signer reaches quorum." }) : n.push({ id: "multisig", severity: "ok", title: `At least ${o.minimumSigners} of ${o.signers.length} signers must agree`, detail: `Quorum ${o.quorum}. A thief needs ${o.minimumSigners} separate secrets, usually on separate people's devices.` })), !e.masterEnabled && !e.regularKey && !o && n.push({ id: "blackholed", severity: "info", title: "Nothing can sign for this account", detail: "Master key disabled, no regular key, no signer list: the account is blackholed. Nothing can be stolen from it, and nothing can be moved out of it again." });
  const i = e.events.filter((u) => u.at && t - Date.parse(u.at) < 30 * Cs && u.kind !== "flag_set" && u.kind !== "flag_cleared");
  i.length && n.push({
    id: "recent-key-change",
    severity: "warn",
    title: `Signing keys changed ${i.length === 1 ? "once" : `${i.length} times`} in the last 30 days`,
    detail: `${i.map((u) => `${u.at.slice(0, 10)}: ${u.detail}`).join(" ")} Taking over an account usually starts with a new regular key or signer list, so every change should be one you made.`,
    action: "If you did not make these changes, treat the account as compromised: open Incident Response now."
  }), e.poisoning.length && n.push({
    id: "poisoning",
    severity: "warn",
    title: `${e.poisoning.length} address-poisoning attempt${e.poisoning.length === 1 ? "" : "s"} against this account`,
    detail: e.poisoning.slice(0, 5).map((u) => `${u.sender} imitates ${u.imitates}, which this account has paid.`).join(" ") + " They sent you something so the fake appears in your history next to the real one.",
    action: "Never copy a destination from transaction history. Keep an address book, and check a pasted address against it before signing."
  }), e.dustReceived >= 3 && n.push({ id: "dust", severity: "info", title: `${e.dustReceived} dust payments received`, detail: "Payments under 0.01 XRP are how links to fake wallets and airdrops reach an account's history. Do not open links that arrive on the ledger." });
  const c = [
    [Y.disallowIncomingNFTokenOffer, H.disallowIncomingNFTokenOffer, "NFT offers", "Unsolicited NFT offers are a common phishing carrier: their names and images point at fake claim sites."],
    [Y.disallowIncomingCheck, H.disallowIncomingCheck, "checks", "A check someone else created shows up as something to cash; scammers use them as lures."],
    [Y.disallowIncomingPayChan, H.disallowIncomingPayChan, "payment channels", "Unsolicited payment channels clutter the account and are rarely legitimate for a personal wallet."]
  ].filter(([u]) => !a(u));
  if (c.length) {
    n.push({
      id: "open-doors",
      severity: "info",
      title: `Strangers can send this account ${c.map((u) => u[2]).join(", ")}`,
      detail: "Refusing them costs nothing and removes channels phishing uses. You can still create them yourself."
    });
    for (const [, u, y, b] of c)
      s.push({ id: `refuse-${u}`, title: `Refuse incoming ${y}`, why: b, tx: { TransactionType: "AccountSet", Account: e.address, SetFlag: u } });
  } else
    n.push({ id: "doors-closed", severity: "ok", title: "Unsolicited NFT offers, checks and payment channels are refused", detail: "The account has closed the channels phishing usually arrives through." });
  a(Y.depositAuth) && n.push({ id: "deposit-auth", severity: "ok", title: "Only preauthorised senders can pay this account", detail: "Deposit authorisation is on: nothing arrives unless the account approved the sender, which also blocks dust and poisoning." }), e.masterEnabled && !o && (s.unshift({
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
      SignerEntries: [1, 2, 3].map((u) => ({ SignerEntry: { Account: `<signer ${u} address>`, SignerWeight: 1 } }))
    },
    caution: "Test that the signers can sign a small transaction before relying on the list."
  })), o && e.masterEnabled && s.unshift({
    id: "disable-master",
    title: "Disable the master key",
    why: "So the signer list actually binds: until then one stolen master seed skips the quorum.",
    tx: { TransactionType: "AccountSet", Account: e.address, SetFlag: H.disableMaster },
    caution: "Sign it only after a multisigned test transaction has succeeded. If the signers cannot reach quorum, disabling the master key locks the account permanently."
  }), n.sort((u, y) => Ke[u.severity] - Ke[y.severity]);
  const l = n.filter((u) => u.severity === "critical").length, d = n.filter((u) => u.severity === "warn").length, h = Math.max(0, Math.min(100, 100 - l * 30 - d * 12 - c.length * 3 - (o && o.minimumSigners >= 2 && !e.masterEnabled ? -5 : 0))), p = h >= 90 ? "A" : h >= 75 ? "B" : h >= 60 ? "C" : h >= 40 ? "D" : "F", f = l > 0 ? "Serious weaknesses: fix the critical findings before holding meaningful value here." : d > 0 ? "Workable, with changes worth making." : "Well protected by what the ledger can show.";
  return { score: h, grade: p, summary: f, findings: n, plan: s };
}
const Ls = 946684800, Ye = 131072, Xs = {
  accountTx: (e, t, n, s) => S("account_tx", { account: e, ledger_index_min: t, ledger_index_max: -1, forward: !0, limit: n, ...s ? { marker: s } : {} }),
  accountInfo: (e) => S("account_info", { account: e, ledger_index: "validated" }).catch((t) => {
    if (/actNotFound|not found/i.test(t instanceof Error ? t.message : String(t))) return null;
    throw t;
  }),
  sanctions: async (e) => (await ie(e))?.hits ?? null
}, ae = {
  standard: { depth: 2, perAccount: 400 },
  deep: { depth: 5, perAccount: 1e3 }
}, Hs = (e) => typeof e == "number" ? new Date((e + Ls) * 1e3).toISOString() : null;
function Ve(e) {
  if (typeof e == "string" && /^\d+$/.test(e)) return { currency: "XRP", issuer: null, value: Number(e) / 1e6 };
  if (e && typeof e == "object") {
    const t = e, n = Number(t.value);
    if (typeof t.currency == "string" && Number.isFinite(n)) return { currency: X(t.currency), issuer: t.issuer ?? null, value: n };
  }
  return null;
}
function qs(e, t) {
  const n = t.tx_json ?? t.tx ?? t, s = t.meta ?? {};
  if (t.validated === !1 || s.TransactionResult !== "tesSUCCESS" || n.Account !== e) return null;
  const a = {
    from: e,
    ledger: Number(t.ledger_index ?? n.ledger_index ?? 0),
    at: Hs(n.date ?? t.date),
    hash: String(n.hash ?? t.hash ?? ""),
    destinationTag: typeof n.DestinationTag == "number" ? n.DestinationTag : null
  }, o = Ve(s.delivered_amount ?? s.DeliveredAmount);
  if (n.TransactionType === "Payment" && typeof n.Destination == "string" && n.Destination !== e && o)
    return { ...a, to: n.Destination, kind: "payment", amount: o };
  if (n.TransactionType === "AccountDelete" && typeof n.Destination == "string" && o)
    return { ...a, to: n.Destination, kind: "account_delete", amount: o };
  if (n.TransactionType === "EscrowCreate" && typeof n.Destination == "string") {
    const i = Ve(n.Amount);
    if (i) return { ...a, to: n.Destination, kind: "escrow", amount: i };
  }
  return null;
}
async function Us(e, t) {
  const n = t.reader ?? Xs, s = t.depth ?? ae.standard.depth, a = t.perAccount ?? ae.standard.perAccount, o = t.minXrp ?? 1, i = /* @__PURE__ */ new Map(), r = [], c = { count: 0, xrp: 0 }, l = [{ address: e, from: t.sinceLedger, depth: 0 }];
  for (i.set(e, { address: e, depth: 0, status: "source", receivedXrp: 0, balanceXrp: null, domain: null, sanction: null, read: 0, truncated: !1 }); l.length; ) {
    const { address: u, from: y, depth: b } = l.shift(), m = i.get(u), g = await n.accountInfo(u).catch(() => {
    });
    g === void 0 && (m.status = m.status === "source" ? "source" : "unread");
    const w = g?.account_data;
    if (w ? (m.balanceXrp = Number(w.Balance ?? 0) / 1e6, typeof w.Domain == "string" && w.Domain && (m.domain = new TextDecoder().decode(new Uint8Array((w.Domain.match(/../g) ?? []).map((k) => parseInt(k, 16))))), m.status !== "source" && (m.status = m.tagged || (Number(w.Flags ?? 0) & Ye) !== 0 ? "custodial" : "holding")) : g === null && m.status !== "source" && (m.status = "deleted"), m.tagged && m.status !== "source" && (m.status = "custodial"), m.status === "custodial") continue;
    let v;
    do {
      const k = await n.accountTx(u, y, Math.min(400, a - m.read), v).catch(() => ({ transactions: [] })), $ = k.transactions ?? [];
      m.read += $.length;
      for (const T of $) {
        const A = qs(u, T);
        if (!A) continue;
        if (A.amount.currency === "XRP" && A.amount.value < o && A.kind === "payment") {
          c.count += 1, c.xrp += A.amount.value;
          continue;
        }
        r.push(A);
        const z = A.amount.currency === "XRP" ? A.amount.value : 0, j = i.get(A.to);
        if (j) {
          j.receivedXrp += z, A.destinationTag !== null && j.status !== "source" && (j.tagged = !0, j.status = "custodial");
          continue;
        }
        const B = A.destinationTag !== null;
        if (i.set(A.to, { address: A.to, depth: b + 1, status: B ? "custodial" : "holding", receivedXrp: z, balanceXrp: null, domain: null, sanction: null, read: 0, truncated: !1, tagged: B }), !B && b + 1 <= s) {
          l.push({ address: A.to, from: A.ledger, depth: b + 1 });
          continue;
        }
        const W = i.get(A.to), re = await n.accountInfo(A.to).catch(() => {
        });
        if (re === null) W.status = "deleted";
        else if (re?.account_data) {
          const G = re.account_data;
          W.balanceXrp = Number(G.Balance ?? 0) / 1e6, typeof G.Domain == "string" && G.Domain && (W.domain = new TextDecoder().decode(new Uint8Array((G.Domain.match(/../g) ?? []).map((Ot) => parseInt(Ot, 16))))), W.status = B || (Number(G.Flags ?? 0) & Ye) !== 0 ? "custodial" : "not_followed";
        } else B || (W.status = "not_followed");
      }
      v = k.marker, m.read >= a && v && (m.truncated = !0);
    } while (v && m.read < a);
  }
  const d = [...i.values()], h = await n.sanctions(d.map((u) => u.address)).catch(() => null);
  for (const u of d) u.sanction = h?.[u.address] ?? null;
  const p = /* @__PURE__ */ new Map();
  for (const u of d) {
    const y = u.address.slice(-4).toLowerCase();
    p.set(y, [...p.get(y) ?? [], u.address]);
  }
  const f = [...p].filter(([, u]) => u.length >= 2).map(([u, y]) => ({ ending: u, accounts: y }));
  return { root: e, sinceLedger: t.sinceLedger, depthLimit: s, minXrp: o, nodes: d, flows: r, dust: c, vanity: f, sanctionsChecked: h !== null };
}
const ue = (e) => `${e.value.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${e.currency}${e.issuer ? ` (issuer ${e.issuer})` : ""}`;
function Ms(e, t) {
  const n = [
    {
      id: "finality",
      title: "No one can reverse a validated XRP Ledger transaction",
      detail: "There is no chargeback on the XRP Ledger. Validators, Ripple, wallet makers and NOSHASHI cannot move funds out of an account without its keys, and anyone offering to 'recover' or 'reverse' stolen XRP for a fee is running the second half of the scam. What follows are the paths that do exist.",
      outlook: "not_possible"
    }
  ], s = e.nodes.filter((l) => l.status === "custodial");
  for (const l of s) {
    const d = e.flows.filter((h) => h.to === l.address);
    n.push({
      id: `freeze-${l.address}`,
      title: `Ask the service behind ${l.address}${l.domain ? ` (${l.domain})` : ""} to freeze the deposit`,
      detail: `This account requires destination tags, the mark of an exchange or custodial service that credits deposits to customer accounts. The service can identify and freeze the customer who received ${d.map((h) => ue(h.amount)).join(" and ") || "the funds"} if you reach it before the funds are withdrawn, usually with a police or court reference. Send it the evidence below.`,
      outlook: "possible",
      evidence: d.map((h) => `${h.at ?? `ledger ${h.ledger}`}: ${ue(h.amount)} to ${h.to}${h.destinationTag !== null ? ` tag ${h.destinationTag}` : ""}, transaction ${h.hash}`)
    });
  }
  const a = e.flows.filter((l) => l.amount.issuer), o = [...new Set(a.map((l) => l.amount.issuer))];
  for (const l of o) {
    const d = a.filter((h) => h.amount.issuer === l);
    n.push({
      id: `issuer-${l}`,
      title: `Ask the issuer ${l} to freeze, or claw back, its ${d[0].amount.currency}`,
      detail: "Issued tokens are the issuer's obligations. Unless it has given up the right (No Freeze), the issuer can freeze the trust lines now holding its token, and if it enabled clawback it can take the balance back and reissue it. Check the issuer's posture on the Authority screen, then contact it through its published domain with the evidence below.",
      outlook: "possible",
      evidence: d.map((h) => `${h.at ?? `ledger ${h.ledger}`}: ${ue(h.amount)} from ${h.from} to ${h.to}, transaction ${h.hash}`)
    });
  }
  const i = e.nodes.filter((l) => l.status === "holding" && l.depth > 0 && (l.balanceXrp ?? 0) > 0);
  i.length && n.push({
    id: "still-held",
    title: `${i.length} account${i.length === 1 ? " still holds" : "s still hold"} XRP from the trail`,
    detail: `${i.map((l) => `${l.address}: ${l.balanceXrp.toLocaleString("en-US")} XRP`).join("; ")}. Nothing on the ledger can move it without that account's key, but law enforcement can act on an identified owner, and Ledger Watch can alert you the moment it moves (and where to).`,
    outlook: "unlikely"
  });
  const r = e.nodes.filter((l) => l.status === "deleted" && l.depth > 0);
  r.length && n.push({
    id: "deleted",
    title: `${r.length} account${r.length === 1 ? " in the trail was" : "s in the trail were"} deleted after use`,
    detail: "Throwaway accounts that sweep their balance onward with AccountDelete: the value is not in them any more. It is followed to where it went.",
    outlook: "not_possible"
  });
  const c = e.nodes.filter((l) => l.sanction);
  if (c.length && n.push({
    id: "sanctioned",
    title: "The trail reaches an address on the OFAC SDN list",
    detail: `${c.map((l) => `${l.address} (${l.sanction.entityName})`).join("; ")}. Report it with this dossier; US and allied authorities act on listed parties.`,
    outlook: "possible"
  }), t && t.stillHoldsXrp > 0) {
    const l = t.keyEvents.find((d) => d.kind === "regular_key_set" || d.kind === "signer_list_set");
    n.push({
      id: "secure-remaining",
      title: `Move the remaining ${t.stillHoldsXrp.toLocaleString("en-US")} XRP to a new account now`,
      detail: `${l ? `The account's keys were changed (${l.detail}) If that was not you, the thief may still sign. ` : ""}Create a new account on a device that never held the old seed, and move what is left while you still can: whoever has the key can empty it at any time. Then never reuse the old seed.`,
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
async function zs(e) {
  const t = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e));
  return Array.from(new Uint8Array(t)).map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
}
function js(e, t, n) {
  const s = [], a = n.filter((l) => l.from === e).sort((l, d) => l.ledger - d.ledger), o = a[0], i = t.filter((l) => l.kind === "regular_key_set" || l.kind === "signer_list_set" || l.kind === "master_disabled"), r = o ? i.filter((l) => l.ledger <= o.ledger && o.ledger - l.ledger < 1e5) : [];
  r.length ? s.push({
    id: "key-then-drain",
    severity: "critical",
    title: "Signing keys changed, then value left",
    detail: `${r.map((l) => `${l.at?.slice(0, 16).replace("T", " ") ?? `ledger ${l.ledger}`}: ${l.detail}`).join(" ")} Value started leaving at ${o.at?.slice(0, 16).replace("T", " ") ?? `ledger ${o.ledger}`}. An attacker who adds their own key can keep signing after the owner notices.`
  }) : o && s.push({
    id: "seed-used",
    severity: "warn",
    title: "Value left with no change of keys",
    detail: "The account's existing key signed the transfers, which usually means the secret seed itself was exposed (a phishing site, a fake wallet, a cloud backup or a screenshot). Anything else secured by that seed is exposed too."
  });
  const c = a.filter((l) => l.amount.currency === "XRP").reduce((l, d) => l + d.amount.value, 0);
  if (a.length) {
    const l = new Set(a.map((d) => d.to));
    s.push({
      id: "outflow",
      severity: "info",
      title: `${c.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP left in ${a.length} transfer${a.length === 1 ? "" : "s"} to ${l.size} account${l.size === 1 ? "" : "s"}`,
      detail: a.slice(0, 5).map((d) => `${d.amount.value.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${d.amount.currency} to ${d.to}${d.kind === "account_delete" ? " (account deleted)" : ""}`).join("; ") + (a.length > 5 ? "; …" : "")
    });
  }
  return a.some((l) => l.kind === "account_delete") && s.push({ id: "deleted", severity: "info", title: "The account was deleted", detail: "Its remaining XRP was swept to the destination of its AccountDelete. The address can be funded again, but its history stays on the ledger." }), s;
}
const Bs = 131072, Ws = 1, Gs = 131072, Ks = 1e3;
async function Ys(e) {
  const t = e.trim();
  if (!t) throw new Error("Paste a transaction: its JSON, or the hex blob a site asks you to sign.");
  if (t.startsWith("{")) {
    let a;
    try {
      a = JSON.parse(t);
    } catch {
      throw new Error("That is not valid JSON.");
    }
    const o = a.tx_json ?? a.transaction ?? a.txJson ?? a.tx ?? a;
    if (typeof o.TransactionType != "string") throw new Error("The JSON has no TransactionType, so it is not an XRPL transaction.");
    return { tx: o, format: "json" };
  }
  const n = t.replace(/^0x/i, "").replace(/\s+/g, "");
  if (!/^([0-9A-Fa-f]{2})+$/.test(n)) throw new Error("Not JSON and not a hex blob.");
  let s;
  try {
    const { decode: a } = await import("./pages-Qi9358GC.js").then((o) => o.i);
    s = a(n.toUpperCase());
  } catch (a) {
    throw new Error(`The blob does not decode as an XRPL transaction (${a instanceof Error ? a.message : String(a)}).`);
  }
  if (typeof s.TransactionType != "string") throw new Error("The blob decoded, but not to a transaction.");
  return { tx: s, format: "blob" };
}
function C(e) {
  if (typeof e == "string" && /^\d+$/.test(e)) return `${(Number(e) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;
  if (e && typeof e == "object") {
    const t = e;
    return "mpt_issuance_id" in t ? `${t.value} of MPT ${String(t.mpt_issuance_id).slice(0, 12)}…` : `${t.value} ${X(String(t.currency ?? ""))}${t.issuer ? ` (issuer ${t.issuer})` : ""}`;
  }
  return String(e);
}
function Je(e) {
  return e == null ? !0 : typeof e == "string" ? Number(e) === 0 : typeof e == "object" ? Number(e.value) === 0 : !1;
}
function Vs(e) {
  const t = [];
  for (const n of e.Memos ?? []) {
    const s = n.Memo ?? n;
    for (const a of ["MemoData", "MemoType", "MemoFormat"]) {
      const o = s[a];
      if (!(typeof o != "string" || !/^([0-9A-Fa-f]{2})+$/.test(o)))
        try {
          t.push(new TextDecoder("utf-8", { fatal: !1 }).decode(new Uint8Array((o.match(/../g) ?? []).map((i) => parseInt(i, 16)))));
        } catch {
        }
    }
  }
  return t;
}
const Qe = {
  1: "require a destination tag on incoming payments",
  2: "require authorisation for its trust lines",
  3: "ask senders not to send XRP",
  4: "DISABLE THE MASTER KEY",
  5: "track the ID of its last transaction",
  6: "permanently give up the right to freeze (No Freeze)",
  7: "freeze every trust line it issued (global freeze)",
  8: "let balances ripple through it (Default Ripple)",
  9: "accept payments only from preauthorised senders",
  10: "let another account mint NFTs for it",
  12: "refuse incoming NFT offers",
  13: "refuse incoming checks",
  14: "refuse incoming payment channels",
  15: "refuse incoming trust lines",
  16: "allow clawback of its tokens"
};
function Js(e, t, n = {}) {
  const s = [], a = [], o = String(e.TransactionType), i = typeof e.Account == "string" ? e.Account : "", r = Number(e.Flags ?? 0), c = typeof e.TxnSignature == "string" || Array.isArray(e.Signers), l = (u, y) => {
    if (typeof u != "string" || !u) return;
    const b = n.sanctioned?.[u];
    b && a.push({ id: "sanctioned", severity: "danger", text: `The ${y} ${u} is on the OFAC SDN list (${b.entityName}). Dealing with it is prohibited for US persons and many others.` });
    const m = n.known ?? [];
    if (m.length && !m.includes(u)) {
      const g = At(u, m);
      g && a.push({ id: "lookalike", severity: "danger", text: `The ${y} ${u} starts and ends like ${g} from your address book but is a different account: address poisoning.` });
    }
  };
  switch (n.me && i && i !== n.me && a.push({ id: "other-account", severity: "warn", text: `This transaction is for account ${i}, not ${n.me}. Signing it with your key only works if you are a signer or its regular key.` }), o) {
    case "Payment": {
      const u = (r & Bs) !== 0;
      s.push(`Sends ${C(e.Amount ?? e.DeliverMax)} from ${i} to ${e.Destination}${typeof e.DestinationTag == "number" ? ` with destination tag ${e.DestinationTag}` : ""}.`), e.SendMax && s.push(`It may spend up to ${C(e.SendMax)} to deliver that.`), u && a.push({ id: "partial-payment", severity: "warn", text: "Partial payment flag set: the recipient may receive far less than the Amount shown. Legitimate for some conversions; used to fake large deposits." }), e.Destination === i && s.push("Sender and destination are the same account: a currency conversion through the DEX."), l(e.Destination, "destination");
      break;
    }
    case "SetRegularKey":
      e.RegularKey ? (s.push(`Gives the key of ${e.RegularKey} full power to sign for ${i}.`), a.push({ id: "regular-key", severity: "danger", text: `After this, whoever holds ${e.RegularKey} can move everything in the account, and keeps that power even if you change nothing else. A site asking you to sign this is taking over the account unless ${e.RegularKey} is a key you control.` }), l(e.RegularKey, "new key")) : (s.push("Removes the account's regular key."), a.push({ id: "regular-key-removed", severity: "warn", text: "If the master key is disabled and there is no signer list, removing the regular key leaves nothing that can sign: the account is locked forever." }));
      break;
    case "SignerListSet": {
      const u = (e.SignerEntries ?? []).map((y) => y.SignerEntry ?? y);
      if (Number(e.SignerQuorum ?? 0) === 0)
        s.push("Deletes the account's signer list."), a.push({ id: "signers-removed", severity: "warn", text: "Removes the multi-signature requirement. If the master key is disabled and there is no regular key, nothing can sign afterwards." });
      else {
        s.push(`Lets ${u.length} signer${u.length === 1 ? "" : "s"} sign for ${i} together (quorum ${e.SignerQuorum}): ${u.map((y) => `${y.Account} (weight ${y.SignerWeight})`).join(", ")}.`), a.push({ id: "signer-list", severity: "danger", text: "These accounts will be able to move everything in this account. Sign only if every one of them is yours or someone you have chosen." });
        for (const y of u) l(y.Account, "signer");
      }
      break;
    }
    case "AccountSet": {
      typeof e.SetFlag == "number" && s.push(`Turns on: ${Qe[e.SetFlag] ?? `flag ${e.SetFlag}`}.`), typeof e.ClearFlag == "number" && s.push(`Turns off: ${Qe[e.ClearFlag] ?? `flag ${e.ClearFlag}`}.`), e.SetFlag === H.disableMaster && a.push({ id: "disable-master", severity: "warn", text: "Disables the master key. Sound when a regular key or signer list you control is already set and tested; if not, the account can never sign again." }), e.ClearFlag === H.disableMaster && a.push({ id: "enable-master", severity: "warn", text: "Re-enables the master key: whoever has the original seed can sign alone again." }), e.SetFlag === 6 && a.push({ id: "no-freeze", severity: "info", text: "No Freeze is permanent: it cannot be turned off again." }), e.SetFlag === 7 && a.push({ id: "global-freeze", severity: "warn", text: "Global freeze stops every holder of this account's tokens from moving them." }), typeof e.Domain == "string" && s.push(`Sets the account's domain to ${e.Domain ? Qs(e.Domain) : "(none)"}.`), typeof e.TransferRate == "number" && s.push(`Sets a transfer fee of ${((e.TransferRate / 1e9 - 1) * 100).toFixed(3)}% on its tokens.`), s.length || s.push("Changes no flags: an AccountSet like this only bumps the sequence.");
      break;
    }
    case "AccountDelete":
      s.push(`DELETES account ${i} and sends all of its remaining XRP to ${e.Destination}${typeof e.DestinationTag == "number" ? ` (tag ${e.DestinationTag})` : ""}.`), a.push({ id: "account-delete", severity: "danger", text: `The account ceases to exist and every drop it holds goes to ${e.Destination}. Thieves ask victims to sign this to empty an account in one step. Sign only to close an account you are finished with, to a destination you own.` }), l(e.Destination, "destination");
      break;
    case "NFTokenCreateOffer": {
      const u = (r & Ws) !== 0;
      s.push(`${u ? "Offers to SELL" : "Offers to BUY"} NFT ${String(e.NFTokenID).slice(0, 16)}… for ${Je(e.Amount) ? "NOTHING" : C(e.Amount)}${e.Destination ? `, only to ${e.Destination}` : ", to anyone"}.`), u && Je(e.Amount) && a.push({ id: "nft-free", severity: "danger", text: "A sell offer for zero gives the NFT away. The classic NFT phishing prompt asks for exactly this, disguised as a 'claim' or 'verify'." }), u && e.Destination && l(e.Destination, "buyer"), u && e.Destination && !(n.known ?? []).includes(e.Destination) && a.push({ id: "nft-stranger", severity: "warn", text: `Only ${e.Destination} can accept this sell offer. Make sure that account is who you think it is.` });
      break;
    }
    case "NFTokenAcceptOffer":
      s.push(`Accepts NFT offer${e.NFTokenSellOffer && e.NFTokenBuyOffer ? "s (brokered)" : ""} ${e.NFTokenSellOffer ?? e.NFTokenBuyOffer}.`), a.push({ id: "nft-accept", severity: "info", text: "Accepting a sell offer pays its price; accepting a buy offer hands over your NFT. Check the offer's amount on the ledger (NFT explorer) before signing." });
      break;
    case "TrustSet": {
      const u = e.LimitAmount;
      s.push(`Sets a trust line to hold up to ${u?.value} ${X(String(u?.currency ?? ""))} issued by ${u?.issuer}.`), a.push({ id: "trustline", severity: "info", text: "A trust line only lets you hold a token. Airdropped tokens with a link in their name are a common lure; the token is only worth what its issuer stands behind." });
      break;
    }
    case "OfferCreate":
      s.push(`Places a DEX order: pay ${C(e.TakerGets)} to receive ${C(e.TakerPays)}.`);
      break;
    case "OfferCancel":
      s.push(`Cancels DEX order sequence ${e.OfferSequence}.`);
      break;
    case "EscrowCreate":
      s.push(`Locks ${C(e.Amount)} in escrow for ${e.Destination}.`), l(e.Destination, "destination");
      break;
    case "EscrowFinish":
    case "EscrowCancel":
      s.push(`${o === "EscrowFinish" ? "Releases" : "Cancels"} escrow ${e.OfferSequence} created by ${e.Owner}.`);
      break;
    case "CheckCreate":
      s.push(`Writes a check for up to ${C(e.SendMax)} that ${e.Destination} can cash.`), l(e.Destination, "payee");
      break;
    case "CheckCash":
      s.push(`Cashes check ${String(e.CheckID).slice(0, 16)}… for ${C(e.Amount ?? e.DeliverMin)}.`);
      break;
    case "CheckCancel":
      s.push(`Cancels check ${String(e.CheckID).slice(0, 16)}….`);
      break;
    case "PaymentChannelCreate":
      s.push(`Opens a payment channel funding ${e.Destination} with up to ${C(e.Amount)}.`), l(e.Destination, "destination");
      break;
    case "PaymentChannelClaim":
      s.push(`Claims from payment channel ${String(e.Channel).slice(0, 16)}…${(r & Gs) !== 0 ? " and asks to close it" : ""}.`);
      break;
    case "DepositPreauth":
      s.push(e.Authorize ? `Lets ${e.Authorize} pay this account while deposit authorisation is on.` : `Withdraws ${e.Unauthorize}'s permission to pay this account.`);
      break;
    case "TicketCreate":
      s.push(`Reserves ${e.TicketCount} ticket${e.TicketCount === 1 ? "" : "s"}: sequence numbers transactions can use later, in any order.`), a.push({ id: "tickets", severity: "info", text: "Tickets let pre-signed transactions be submitted later, out of order. Know who will hold transactions signed against them." });
      break;
    default:
      s.push(`A ${o} transaction from ${i}.`), a.push({ id: "unfamiliar", severity: "info", text: `${o} is not one of the transactions this explainer describes in detail. Read the fields below before signing.` });
  }
  const d = Number(e.Fee ?? 0);
  Number.isFinite(d) && d > Ks && a.push({ id: "high-fee", severity: d >= 1e6 ? "danger" : "warn", text: `The fee is ${(d / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP, destroyed whether or not the transaction does anything. A normal fee is 0.00001 XRP.` });
  const p = Vs(e).find(Es);
  p && a.push({ id: "memo-link", severity: "warn", text: `A memo carries a link or domain ("${p.slice(0, 80)}"). Never visit links that arrive on the ledger.` }), c && a.push({ id: "already-signed", severity: "warn", text: "This blob is already signed: anyone who has it can submit it, whether or not you approve." }), typeof e.LastLedgerSequence != "number" && a.push({ id: "no-expiry", severity: "info", text: "No LastLedgerSequence: once signed, it stays valid until its sequence is used." });
  const f = a.some((u) => u.severity === "danger") ? "DO NOT SIGN" : a.some((u) => u.severity === "warn") ? "CAREFUL" : "SAFE-LOOKING";
  return { tx: e, format: t, summary: s, flags: a, verdict: f, signed: c };
}
function Qs(e) {
  return /^([0-9A-Fa-f]{2})+$/.test(e) ? new TextDecoder().decode(new Uint8Array((e.match(/../g) ?? []).map((t) => parseInt(t, 16)))) : e;
}
function Zs(e) {
  const t = /* @__PURE__ */ new Set();
  for (const n of ["Destination", "RegularKey", "Owner", "Authorize"]) typeof e[n] == "string" && t.add(e[n]);
  for (const n of e.SignerEntries ?? []) typeof (n.SignerEntry ?? n).Account == "string" && t.add((n.SignerEntry ?? n).Account);
  return [...t];
}
const ea = 946684800, Te = { request: (e, t) => S(e, t) }, ta = (e) => /actNotFound|not found/i.test(e instanceof Error ? e.message : String(e));
async function Ze(e, t, n, s, a) {
  const o = [];
  let i;
  for (let r = 0; r < a; r++) {
    const c = await e.request(t, { ...n, ...i ? { marker: i } : {} });
    if (o.push(...c[s] ?? []), i = c.marker, !i) return { rows: o, complete: !0 };
  }
  return { rows: o, complete: !1 };
}
async function he(e, t = Te, n = 10) {
  const s = await t.request("ledger", { ledger_index: "validated" }), a = Number(s.ledger?.ledger_index ?? s.ledger_index), o = Number(s.ledger?.close_time ?? 0), r = (await t.request("server_info", {}).catch(() => ({}))).info?.validated_ledger ?? {}, c = Number(r.reserve_base_xrp ?? 1), l = Number(r.reserve_inc_xrp ?? 0.2), d = await t.request("account_info", { account: e, ledger_index: a }).catch((f) => {
    if (ta(f)) return null;
    throw f;
  });
  if (!d) return { address: e, root: null, objects: [], nfts: [], ledgerIndex: a, closeTime: o, reserveBaseXrp: c, reserveIncXrp: l, complete: !0 };
  const [h, p] = await Promise.all([
    Ze(t, "account_objects", { account: e, ledger_index: a, limit: 400 }, "account_objects", n),
    Ze(t, "account_nfts", { account: e, ledger_index: a, limit: 400 }, "account_nfts", n).catch(() => ({ rows: [], complete: !1 }))
  ]);
  return {
    address: e,
    root: d.account_data,
    objects: h.rows,
    nfts: p.rows,
    ledgerIndex: a,
    closeTime: o,
    reserveBaseXrp: c,
    reserveIncXrp: l,
    complete: h.complete && p.complete
  };
}
const I = (e) => typeof e == "number" && e > 0 ? new Date((e + ea) * 1e3).toISOString() : null, N = (e) => typeof e == "string" && /^\d+$/.test(e) ? Number(e) / 1e6 : null;
function oe(e, t) {
  const n = e.LowLimit?.issuer === t, s = Number(e.Balance?.value ?? 0);
  return {
    currency: String(e.Balance?.currency ?? e.LowLimit?.currency ?? ""),
    /** The other side of the line: for a holder, the issuer. */
    counterparty: String(n ? e.HighLimit?.issuer : e.LowLimit?.issuer),
    balance: n ? s : -s,
    limit: Number((n ? e.LowLimit : e.HighLimit)?.value ?? 0),
    counterpartyLimit: Number((n ? e.HighLimit : e.LowLimit)?.value ?? 0),
    reserved: (Number(e.Flags ?? 0) & (n ? 65536 : 131072)) !== 0,
    index: String(e.index ?? "")
  };
}
const et = 131072, na = 131072, sa = 8388608, aa = 1, ve = (e) => `${e.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;
function O(e) {
  const t = N(e);
  if (t !== null) return ve(t);
  const n = e;
  return `${n?.value} ${X(String(n?.currency ?? ""))}`;
}
function oa(e, t = {}) {
  const n = e.address, s = e.closeTime, a = e.reserveIncXrp, o = [], i = e.root, r = I(s);
  if (!i)
    return {
      address: n,
      exists: !1,
      ledgerIndex: e.ledgerIndex,
      at: r,
      balanceXrp: 0,
      lockedXrp: 0,
      spendableXrp: 0,
      items: [],
      recoverableNowXrp: 0,
      optionalReserveXrp: 0,
      laterXrp: 0,
      deletion: { possible: !1, returnsXrp: 0, blockers: ["The account does not exist."], tx: null },
      complete: !0
    };
  for (const g of e.objects) {
    const w = String(g.index ?? "");
    switch (g.LedgerEntryType) {
      case "Escrow": {
        const v = N(g.Amount) ?? 0, k = typeof g.FinishAfter == "number" ? g.FinishAfter : null, $ = typeof g.CancelAfter == "number" ? g.CancelAfter : null, T = $ !== null && $ <= s, z = t[w] ?? (typeof g.Sequence == "number" ? g.Sequence : null) ?? "<sequence of the EscrowCreate>";
        g.Destination === n && !T ? g.Condition ? o.push({ id: `escrow-${w}`, kind: "escrow_conditional", title: `${O(g.Amount)} in escrow for you, locked by a condition`, detail: `Escrow from ${g.Account}. It needs the fulfillment (the secret matching its crypto-condition), which only whoever set it up has.`, xrp: 0, reserveXrp: 0, when: "info", tx: null }) : k === null || k <= s ? o.push({
          id: `escrow-${w}`,
          kind: "escrow_finish",
          title: `Finish an escrow: ${O(g.Amount)} is waiting for you`,
          detail: `Escrow from ${g.Account}${k ? `, matured ${I(k)?.slice(0, 10)}` : ""}${$ ? `, cancellable by its owner from ${I($)?.slice(0, 10)}` : ""}. Nothing moves until someone submits EscrowFinish; ${$ ? "finish it before then." : "it waits forever."}`,
          xrp: v,
          reserveXrp: 0,
          when: "now",
          tx: { TransactionType: "EscrowFinish", Account: n, Owner: g.Account, OfferSequence: z }
        }) : o.push({ id: `escrow-${w}`, kind: "escrow_waiting", title: `${O(g.Amount)} in escrow for you, maturing ${I(k)?.slice(0, 10)}`, detail: `Escrow from ${g.Account}. From ${I(k)} anyone can finish it; this scan will list the transaction then.`, xrp: v, reserveXrp: 0, when: "later", availableAt: I(k), tx: null }) : g.Account === n ? T ? o.push({
          id: `escrow-${w}`,
          kind: "escrow_cancel",
          title: `Cancel an expired escrow: ${O(g.Amount)} comes back`,
          detail: `You escrowed it for ${g.Destination}${g.Destination === n ? " (yourself)" : ""}; it expired ${I($)?.slice(0, 10)} without being finished. Cancelling returns it and the ${a} XRP reserve it holds.`,
          xrp: v,
          reserveXrp: a,
          when: "now",
          tx: { TransactionType: "EscrowCancel", Account: n, Owner: n, OfferSequence: z }
        }) : $ !== null && g.Destination !== n && o.push({ id: `escrow-${w}`, kind: "escrow_waiting", title: `${O(g.Amount)} escrowed to ${g.Destination}, returnable ${I($)?.slice(0, 10)} if unfinished`, detail: "If the recipient has not finished it by then, you can cancel it back.", xrp: 0, reserveXrp: 0, when: "later", availableAt: I($), tx: null }) : g.Destination === n && T && o.push({ id: `escrow-${w}`, kind: "escrow_waiting", title: `An escrow for you from ${g.Account} expired unfinished`, detail: `${O(g.Amount)} can now only go back to its owner.`, xrp: 0, reserveXrp: 0, when: "info", tx: null });
        break;
      }
      case "Check": {
        const v = typeof g.Expiration == "number" && g.Expiration <= s;
        if (g.Destination === n && !v) {
          const k = N(g.SendMax) ?? 0;
          o.push({
            id: `check-${w}`,
            kind: "check_cash",
            title: `Cash a check for up to ${O(g.SendMax)}`,
            detail: `Written to you by ${g.Account}${g.Expiration ? `, valid until ${I(g.Expiration)?.slice(0, 10)}` : ""}. It pays only what the writer still has when you cash it.`,
            xrp: k,
            reserveXrp: 0,
            when: "now",
            tx: { TransactionType: "CheckCash", Account: n, CheckID: w, Amount: g.SendMax },
            caution: "Checks are also sent as lures. Cashing one moves value to you and cannot hurt you; never visit a link that came with it."
          });
        } else g.Account === n ? o.push({
          id: `check-${w}`,
          kind: "check_cancel",
          title: `Cancel a check you wrote to ${g.Destination}${v ? " (expired)" : ""}`,
          detail: `${v ? "It can no longer be cashed." : `While it exists, ${g.Destination} can pull up to ${O(g.SendMax)} from you.`} Cancelling frees its ${a} XRP reserve.`,
          xrp: 0,
          reserveXrp: a,
          when: v ? "now" : "optional",
          tx: { TransactionType: "CheckCancel", Account: n, CheckID: w }
        }) : g.Destination === n && v && o.push({ id: `check-${w}`, kind: "check_cancel", title: `Clear an expired check from ${g.Account}`, detail: "It can no longer be cashed. Cancelling removes it (the reserve is the writer's).", xrp: 0, reserveXrp: 0, when: "optional", tx: { TransactionType: "CheckCancel", Account: n, CheckID: w } });
        break;
      }
      case "PayChannel": {
        if (g.Account !== n) break;
        const v = (N(g.Amount) ?? 0) - (N(g.Balance) ?? 0), k = [g.Expiration, g.CancelAfter].filter(($) => typeof $ == "number").sort(($, T) => $ - T)[0];
        k !== void 0 && k <= s ? o.push({
          id: `channel-${w}`,
          kind: "channel_close",
          title: `Close an expired payment channel: ${ve(v)} comes back`,
          detail: `Channel to ${g.Destination}, expired ${I(k)?.slice(0, 10)}. Closing returns what was never claimed and its ${a} XRP reserve.`,
          xrp: v,
          reserveXrp: a,
          when: "now",
          tx: { TransactionType: "PaymentChannelClaim", Account: n, Channel: w, Flags: et }
        }) : o.push({
          id: `channel-${w}`,
          kind: "channel_request_close",
          title: `Payment channel to ${g.Destination} holds ${ve(v)} unclaimed`,
          detail: `Asking to close starts a ${Number(g.SettleDelay ?? 0).toLocaleString("en-US")}-second settle delay so ${g.Destination} can redeem claims you already signed; after that the rest (and the ${a} XRP reserve) comes back with a second close.${k ? ` It expires on its own ${I(k)?.slice(0, 10)}.` : ""}`,
          xrp: 0,
          reserveXrp: 0,
          when: "optional",
          availableAt: k ? I(k) : null,
          tx: { TransactionType: "PaymentChannelClaim", Account: n, Channel: w, Flags: et },
          caution: "Only if the channel is finished with: the recipient loses the ability to redeem further claims."
        });
        break;
      }
      case "Offer": {
        if (g.Account !== n) break;
        const v = typeof g.Expiration == "number" && g.Expiration <= s;
        o.push({
          id: `offer-${w}`,
          kind: "offer_cancel",
          title: `${v ? "Remove an expired" : "Cancel an open"} DEX order: pay ${O(g.TakerGets)} for ${O(g.TakerPays)}`,
          detail: `${v ? "It can no longer fill but still holds" : "While it is open anyone can fill it at that price. It holds"} ${a} XRP of reserve.`,
          xrp: 0,
          reserveXrp: a,
          when: v ? "now" : "optional",
          tx: { TransactionType: "OfferCancel", Account: n, OfferSequence: g.Sequence }
        });
        break;
      }
      case "NFTokenOffer": {
        if (g.Owner !== n) break;
        const v = typeof g.Expiration == "number" && g.Expiration <= s, k = (Number(g.Flags ?? 0) & aa) !== 0;
        o.push({
          id: `nftoffer-${w}`,
          kind: "nft_offer_cancel",
          title: `${v ? "Remove an expired" : "Cancel an open"} NFT ${k ? "sell" : "buy"} offer (${O(g.Amount)})`,
          detail: `NFT ${String(g.NFTokenID).slice(0, 16)}…${g.Destination ? `, only for ${g.Destination}` : ""}. It holds ${a} XRP of reserve${k && !v ? ", and while it is open the NFT can be taken at that price" : ""}.`,
          xrp: 0,
          reserveXrp: a,
          when: v ? "now" : "optional",
          tx: { TransactionType: "NFTokenCancelOffer", Account: n, NFTokenOffers: [w] }
        });
        break;
      }
      case "RippleState": {
        const v = oe(g, n);
        if (!v.reserved || v.balance !== 0) break;
        const k = (Number(i.Flags ?? 0) & sa) !== 0;
        o.push({
          id: `line-${w}`,
          kind: "trustline_remove",
          title: `Remove an empty trust line: ${X(v.currency)} from ${v.counterparty}`,
          detail: `Zero balance, and it holds ${a} XRP of reserve. Setting the limit to zero deletes it once every setting on your side is back to default.`,
          xrp: 0,
          reserveXrp: a,
          when: "optional",
          tx: {
            TransactionType: "TrustSet",
            Account: n,
            LimitAmount: { currency: v.currency, issuer: v.counterparty, value: "0" },
            ...k ? {} : { Flags: na }
          },
          caution: "If the line has a freeze or authorisation on your side, it stays until those are cleared too."
        });
        break;
      }
      case "DepositPreauth": {
        if (g.Account !== n || typeof g.Authorize != "string") break;
        o.push({ id: `preauth-${w}`, kind: "preauth_remove", title: `Withdraw ${g.Authorize}'s preauthorisation`, detail: `It lets ${g.Authorize} pay you while deposit authorisation is on, and holds ${a} XRP of reserve.`, xrp: 0, reserveXrp: a, when: "optional", tx: { TransactionType: "DepositPreauth", Account: n, Unauthorize: g.Authorize } });
        break;
      }
      case "Ticket": {
        o.push({ id: `ticket-${w}`, kind: "ticket_use", title: `Use up unused ticket ${g.TicketSequence}`, detail: `Each unused ticket holds ${a} XRP of reserve. A no-op AccountSet that spends the ticket releases it.`, xrp: 0, reserveXrp: a, when: "optional", tx: { TransactionType: "AccountSet", Account: n, Sequence: 0, TicketSequence: g.TicketSequence }, caution: "Skip it if you have transactions pre-signed against this ticket." });
        break;
      }
    }
  }
  const c = Number(i.Balance ?? 0) / 1e6, l = e.reserveBaseXrp + a * Number(i.OwnerCount ?? 0), d = { now: 0, optional: 1, later: 2, info: 3 };
  o.sort((g, w) => d[g.when] - d[w.when] || w.xrp + w.reserveXrp - (g.xrp + g.reserveXrp));
  const h = (g, w) => Math.round(g.reduce((v, k) => v + w(k), 0) * 1e6) / 1e6, p = o.filter((g) => g.when === "now"), f = [], u = (g) => e.objects.filter((w) => w.LedgerEntryType === g).length;
  u("Escrow") && f.push(`${u("Escrow")} escrow${u("Escrow") === 1 ? "" : "s"}`), u("PayChannel") && f.push(`${u("PayChannel")} payment channel${u("PayChannel") === 1 ? "" : "s"}`), u("Check") && f.push(`${u("Check")} check${u("Check") === 1 ? "" : "s"}`);
  const y = e.objects.filter((g) => g.LedgerEntryType === "RippleState" && oe(g, n).balance !== 0).length;
  y && f.push(`${y} trust line${y === 1 ? "" : "s"} with a balance`), (e.nfts.length || u("NFTokenPage")) && f.push(`${e.nfts.length || "some"} NFTs`), (u("AMM") || i.AMMID) && f.push("an AMM"), Number(i.Sequence ?? 0) + 256 > e.ledgerIndex && f.push("its sequence is too recent (wait 256 ledgers, about 15 minutes)");
  const b = a, m = Math.max(0, Math.round((c - b) * 1e6) / 1e6);
  return {
    address: n,
    exists: !0,
    ledgerIndex: e.ledgerIndex,
    at: r,
    balanceXrp: c,
    lockedXrp: Math.round(l * 1e6) / 1e6,
    spendableXrp: Math.max(0, Math.round((c - l) * 1e6) / 1e6),
    items: o,
    recoverableNowXrp: h(p, (g) => g.xrp + g.reserveXrp),
    optionalReserveXrp: h(o.filter((g) => g.when === "optional"), (g) => g.reserveXrp),
    laterXrp: h(o.filter((g) => g.when === "later"), (g) => g.xrp),
    deletion: {
      possible: f.length === 0,
      returnsXrp: m,
      blockers: f,
      tx: f.length === 0 ? { TransactionType: "AccountDelete", Account: n, Destination: "<an account you own>", Fee: String(Math.round(b * 1e6)) } : null
    },
    complete: e.complete
  };
}
async function ia(e, t = Te) {
  const n = {};
  for (const s of e.objects) {
    if (s.LedgerEntryType !== "Escrow" || typeof s.PreviousTxnID != "string") continue;
    const a = await t.request("tx", { transaction: s.PreviousTxnID, binary: !1 }).catch(() => null), o = a?.tx_json ?? a;
    if (o?.TransactionType !== "EscrowCreate") continue;
    const i = Number(o.TicketSequence ?? o.Sequence ?? 0);
    i > 0 && (n[String(s.index)] = i);
  }
  return n;
}
const ra = 1, ca = 8388608, la = 8, da = 10;
function K(e) {
  const t = N(e);
  if (t !== null) return `${t.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;
  const n = e;
  return `${n?.value} ${X(String(n?.currency ?? ""))}`;
}
function ua(e, t = []) {
  const n = e.address, s = e.closeTime, a = [], o = e.root;
  if (!o) return { address: n, exists: !1, ledgerIndex: e.ledgerIndex, exposures: [], atRiskXrp: 0, complete: !0 };
  const i = (d) => typeof d == "string" && t.includes(d);
  for (const d of e.objects) {
    const h = String(d.index ?? ""), p = typeof d.Expiration == "number" && d.Expiration <= s;
    switch (d.LedgerEntryType) {
      case "Check":
        d.Account === n && !p && a.push({
          id: `check-${h}`,
          risk: i(d.Destination) ? "low" : "high",
          kind: "check",
          title: `${d.Destination} can pull up to ${K(d.SendMax)} from you`,
          detail: `A check you wrote${d.Expiration ? `, valid until ${I(d.Expiration)?.slice(0, 10)}` : " with no expiry"}. It is cashable for as long as it exists.`,
          atRiskXrp: N(d.SendMax) ?? 0,
          revoke: { TransactionType: "CheckCancel", Account: n, CheckID: h }
        });
        break;
      case "NFTokenOffer": {
        if (d.Owner !== n || p || (Number(d.Flags ?? 0) & ra) === 0) break;
        const f = (N(d.Amount) ?? Number(d.Amount?.value ?? 1)) === 0;
        a.push({
          id: `nft-${h}`,
          risk: f ? "high" : i(d.Destination) ? "low" : "medium",
          kind: "nft_sell_offer",
          title: `${d.Destination ? d.Destination : "Anyone"} can take NFT ${String(d.NFTokenID).slice(0, 12)}… for ${f ? "NOTHING" : K(d.Amount)}`,
          detail: f ? "A zero-price sell offer gives the NFT away to whoever accepts it. Phishing sites ask for exactly this signature, disguised as a claim or a verification. If you did not mean to give it away, cancel it now." : "An open sell offer: it fills the moment someone accepts it at that price.",
          atRiskXrp: 0,
          revoke: { TransactionType: "NFTokenCancelOffer", Account: n, NFTokenOffers: [h] }
        });
        break;
      }
      case "PayChannel": {
        if (d.Account !== n) break;
        const f = (N(d.Amount) ?? 0) - (N(d.Balance) ?? 0);
        a.push({
          id: `channel-${h}`,
          risk: i(d.Destination) ? "low" : "medium",
          kind: "payment_channel",
          title: `${d.Destination} can redeem claims on ${f.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`,
          detail: "A payment channel you fund. Every claim you have signed for it can be redeemed until it closes. Signing claims on a site you do not trust hands that XRP over.",
          atRiskXrp: f,
          revoke: { TransactionType: "PaymentChannelClaim", Account: n, Channel: h, Flags: 131072 },
          caution: "Closing starts the settle delay; the recipient can still redeem claims you already signed until it ends."
        });
        break;
      }
      case "Offer":
        if (d.Account !== n || p) break;
        a.push({
          id: `offer-${h}`,
          risk: "low",
          kind: "dex_offer",
          title: `Open order: pay ${K(d.TakerGets)} for ${K(d.TakerPays)}`,
          detail: "Anyone can fill it at that price, now or months from now. Old orders left open are filled when the market moves through them.",
          atRiskXrp: N(d.TakerGets) ?? 0,
          revoke: { TransactionType: "OfferCancel", Account: n, OfferSequence: d.Sequence }
        });
        break;
      case "DepositPreauth":
        if (d.Account !== n || typeof d.Authorize != "string") break;
        a.push({ id: `preauth-${h}`, risk: "low", kind: "deposit_preauth", title: `${d.Authorize} is preauthorised to pay you`, detail: "With deposit authorisation on, this sender's payments are accepted. Remove it if you no longer deal with them.", atRiskXrp: 0, revoke: { TransactionType: "DepositPreauth", Account: n, Unauthorize: d.Authorize } });
        break;
      case "Escrow":
        if (d.Account !== n || d.Destination === n) break;
        a.push({
          id: `escrow-${h}`,
          risk: "low",
          kind: "escrow",
          title: `${K(d.Amount)} escrowed to ${d.Destination}`,
          detail: typeof d.CancelAfter == "number" ? `Returnable to you if not finished by ${I(d.CancelAfter)?.slice(0, 10)}.` : "It has no cancel time: once it matures it can only go to the destination.",
          atRiskXrp: N(d.Amount) ?? 0,
          revoke: null
        });
        break;
      case "SignerList": {
        const f = (d.SignerEntries ?? []).map((u) => u.SignerEntry ?? u);
        for (const u of f)
          a.push({
            id: `signer-${u.Account}`,
            risk: i(u.Account) ? "low" : "medium",
            kind: "signer",
            title: `${u.Account} is a signer (weight ${u.SignerWeight} of quorum ${d.SignerQuorum})`,
            detail: "Signers together can move everything. Each should be a key you or a trusted colleague control.",
            atRiskXrp: 0,
            revoke: null,
            caution: "Change signers with a new SignerListSet covering the whole list; removing one here would need the rest re-stated."
          });
        break;
      }
    }
  }
  typeof o.RegularKey == "string" && a.push({
    id: "regular-key",
    risk: i(o.RegularKey) ? "low" : "medium",
    kind: "regular_key",
    title: `${o.RegularKey} can sign for this account on its own`,
    detail: "The regular key has full power. If you do not recognise it, someone else can empty the account: open Incident Response.",
    atRiskXrp: Number(o.Balance ?? 0) / 1e6,
    revoke: { TransactionType: "SetRegularKey", Account: n },
    caution: "Removing the regular key when the master key is disabled and no signer list exists locks the account forever."
  }), typeof o.NFTokenMinter == "string" && a.push({ id: "nft-minter", risk: i(o.NFTokenMinter) ? "low" : "medium", kind: "nft_minter", title: `${o.NFTokenMinter} can mint NFTs in your name`, detail: "An authorised minter issues NFTs that name this account as issuer: fakes of your collection look genuine.", atRiskXrp: 0, revoke: { TransactionType: "AccountSet", Account: n, ClearFlag: da } });
  const r = e.objects.some((d) => d.LedgerEntryType === "RippleState" && oe(d, n).balance < 0);
  (Number(o.Flags ?? 0) & ca) !== 0 && !r && a.push({
    id: "default-ripple",
    risk: "low",
    kind: "default_ripple",
    title: "Default Ripple is on, but this account issues nothing",
    detail: "Balances in the same currency from different issuers can ripple through your trust lines, swapping one issuer's IOU for another's without you acting. Only issuers need it.",
    atRiskXrp: 0,
    revoke: { TransactionType: "AccountSet", Account: n, ClearFlag: la },
    caution: "Clearing it affects new trust lines; set No Ripple on existing lines to close them too."
  });
  const c = { high: 0, medium: 1, low: 2 };
  a.sort((d, h) => c[d.risk] - c[h.risk] || h.atRiskXrp - d.atRiskXrp);
  const l = Math.round(a.filter((d) => d.kind !== "regular_key" && d.kind !== "escrow").reduce((d, h) => d + h.atRiskXrp, 0) * 1e6) / 1e6;
  return { address: n, exists: !0, ledgerIndex: e.ledgerIndex, exposures: a, atRiskXrp: l, complete: e.complete };
}
const ha = (e) => /^03[0-9A-F]{38}$/i.test(e);
function pa(e) {
  const t = e.address, n = [];
  if (!e.root) return { address: t, exists: !1, ledgerIndex: e.ledgerIndex, xrpBalance: 0, items: n, valuedXrp: 0, priced: !1, complete: !0 };
  for (const s of e.objects)
    if (s.LedgerEntryType === "RippleState") {
      const a = oe(s, t);
      if (a.balance <= 0) continue;
      const o = ha(a.currency);
      n.push({
        id: `line-${s.index}`,
        kind: o ? "lp_token" : "token",
        label: o ? `AMM pool share (${a.counterparty.slice(0, 8)}…)` : X(a.currency),
        amount: a.balance,
        currency: a.currency,
        issuer: a.counterparty,
        valueXrp: null,
        priceSource: null,
        ...Number(s.Flags ?? 0) & 4194304 || Number(s.Flags ?? 0) & 8388608 ? { note: "A freeze is set on this trust line: a frozen balance cannot be sold until it is lifted." } : {}
      });
    } else if (s.LedgerEntryType === "Offer" && s.Account === t) {
      const a = s.TakerGets, o = N(a);
      n.push({
        id: `offer-${s.index}`,
        kind: "open_order",
        label: `Open order selling ${o !== null ? `${o} XRP` : `${a?.value} ${X(String(a?.currency))}`}`,
        amount: o ?? Number(a?.value ?? 0),
        currency: o !== null ? "XRP" : String(a?.currency),
        issuer: o !== null ? null : String(a?.issuer),
        valueXrp: o,
        priceSource: o !== null ? "xrp" : null,
        note: "Committed to the order until it fills or you cancel it (the balance is still yours meanwhile)."
      });
    }
  for (const s of e.nfts)
    n.push({
      id: `nft-${s.NFTokenID}`,
      kind: "nft",
      label: `NFT ${String(s.NFTokenID).slice(0, 12)}… (issuer ${s.Issuer}, taxon ${s.NFTokenTaxon})`,
      amount: 1,
      currency: String(s.NFTokenID),
      issuer: String(s.Issuer),
      valueXrp: null,
      priceSource: null
    });
  return { address: t, exists: !0, ledgerIndex: e.ledgerIndex, xrpBalance: Number(e.root.Balance ?? 0) / 1e6, items: n, valuedXrp: 0, priced: !1, complete: e.complete };
}
async function fa(e, t = Te, n = 60) {
  const s = [];
  let a = 0;
  for (const i of e.items) {
    if (i.valueXrp !== null || a >= n) {
      s.push(i);
      continue;
    }
    a += 1;
    try {
      if (i.kind === "lp_token" && i.issuer) {
        const r = (await t.request("amm_info", { amm_account: i.issuer, ledger_index: "validated" })).amm, c = Number(r?.lp_token?.value ?? 0), l = N(r?.amount) ?? N(r?.amount2);
        if (r && c > 0 && l !== null) {
          s.push({ ...i, valueXrp: pe(i.amount / c * l * 2), priceSource: "pool_share", note: `${(i.amount / c * 100).toPrecision(3)}% of the pool.` });
          continue;
        }
        s.push({ ...i, note: r ? "The pool has no XRP side; priced in its two tokens only." : "The pool no longer exists." });
        continue;
      }
      if (i.kind === "token" && i.issuer) {
        const r = { currency: i.currency, issuer: i.issuer }, [c, l] = await Promise.all([
          t.request("book_offers", { taker_gets: { currency: "XRP" }, taker_pays: r, limit: 5, ledger_index: "validated" }).catch(() => ({ offers: [] })),
          t.request("amm_info", { asset: { currency: "XRP" }, asset2: r, ledger_index: "validated" }).catch(() => null)
        ]), d = (c.offers ?? [])[0], h = d ? (N(d.taker_gets_funded ?? d.TakerGets) ?? 0) / Number((d.taker_pays_funded ?? d.TakerPays)?.value ?? 1 / 0) : 0, p = l?.amm, f = p ? (N(p.amount) ?? 0) / Number(p.amount2?.value ?? 1 / 0) : 0, u = Math.max(Number.isFinite(h) ? h : 0, Number.isFinite(f) ? f : 0);
        s.push(
          u > 0 ? { ...i, valueXrp: pe(i.amount * u), priceSource: u === h ? "order_book" : "amm", note: [i.note, `${u.toPrecision(4)} XRP each at the ${u === h ? "best bid" : "AMM spot price"}.`].filter(Boolean).join(" ") } : { ...i, valueXrp: 0, priceSource: null, note: [i.note, "Nobody is bidding XRP for it on the DEX or an AMM pool."].filter(Boolean).join(" ") }
        );
        continue;
      }
      if (i.kind === "nft") {
        const r = await t.request("nft_buy_offers", { nft_id: i.currency, ledger_index: "validated", limit: 50 }).catch(() => ({ offers: [] })), c = Math.max(0, ...(r.offers ?? []).map((l) => N(l.amount) ?? 0));
        s.push(c > 0 ? { ...i, valueXrp: c, priceSource: "order_book", note: `Highest standing buy offer: ${c} XRP.` } : { ...i, valueXrp: 0, note: "No XRP buy offers stand for it." });
        continue;
      }
      s.push(i);
    } catch {
      s.push({ ...i, note: [i.note, "Could not be priced just now."].filter(Boolean).join(" ") });
    }
  }
  s.sort((i, r) => (r.valueXrp ?? -1) - (i.valueXrp ?? -1));
  const o = pe(s.reduce((i, r) => i + (r.kind === "open_order" ? 0 : r.valueXrp ?? 0), 0));
  return { ...e, items: s, valuedXrp: o, priced: !0 };
}
const pe = (e) => Math.round(e * 1e6) / 1e6, ga = {
  tecDST_TAG_NEEDED: "The destination requires a destination tag and none was given, so the ledger refused the payment.",
  tecNO_DST: "The destination account does not exist, and the payment was too small to create it.",
  tecNO_DST_INSUF_XRP: "The destination account does not exist, and the payment was below the base reserve needed to create it.",
  tecNO_PERMISSION: "The destination only accepts payments from senders it has preauthorised (deposit authorisation).",
  tecUNFUNDED_PAYMENT: "The sender did not have enough spendable XRP (balance above the reserve) to send that amount.",
  tecPATH_DRY: "No path could deliver the token: the destination has no trust line for it, or there was no liquidity.",
  tecPATH_PARTIAL: "The path could not deliver the full amount, so nothing was delivered.",
  tecNO_LINE: "The destination has no trust line for that token.",
  tecNO_LINE_INSUF_RESERVE: "The destination has no trust line for that token and cannot afford the reserve to create one.",
  tecNO_AUTH: "The token's issuer requires authorisation and the destination is not authorised to hold it.",
  tecFROZEN: "The token is frozen, so it could not move.",
  tecINSUF_RESERVE_LINE: "The account could not afford the reserve the trust line needed.",
  tecEXPIRED: "The transaction expired before it could apply."
}, ma = 131072;
function tt(e) {
  if (e == null) return null;
  if (typeof e == "string" && /^\d+$/.test(e)) return `${(Number(e) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;
  const t = e;
  return `${t.value} ${X(String(t.currency ?? ""))}${t.issuer ? ` (issuer ${t.issuer})` : ""}`;
}
const ya = (e) => typeof e == "number" ? new Date((e + 946684800) * 1e3).toISOString() : null;
function wa(e) {
  return typeof e != "string" || !/^([0-9A-Fa-f]{2})+$/.test(e) ? null : new TextDecoder().decode(new Uint8Array((e.match(/../g) ?? []).map((t) => parseInt(t, 16))));
}
function ba(e, t) {
  const n = t.map((s) => s.tx_json ?? s.tx ?? s).filter((s) => s.TransactionType === "Payment" && s.Destination === e && s.Account !== e);
  return n.length < 5 ? null : n.filter((s) => typeof s.DestinationTag == "number").length / n.length;
}
async function va(e, t, n = {}) {
  const s = t.tx, a = s?.tx_json ?? s, o = s?.meta ?? {}, i = t.destination?.account_data ?? null, r = {
    result: o.TransactionResult ?? null,
    ledger: typeof s?.ledger_index == "number" ? s.ledger_index : null,
    at: ya(a?.date ?? s?.date) ?? (typeof s?.close_time_iso == "string" ? s.close_time_iso : null),
    from: a?.Account ?? null,
    to: a?.Destination ?? null,
    destinationTag: typeof a?.DestinationTag == "number" ? a.DestinationTag : null,
    requested: tt(a?.DeliverMax ?? a?.Amount),
    delivered: tt(o.delivered_amount ?? o.DeliveredAmount),
    feeXrp: a?.Fee ? Number(a.Fee) / 1e6 : null,
    destinationDomain: wa(i?.Domain),
    destinationRequiresTag: i ? (Number(i.Flags ?? 0) & ma) !== 0 : null,
    destinationExists: t.destination === null ? !1 : i ? !0 : null
  };
  if (!s || !a)
    return { hash: e, outcome: "not_found", headline: "No validated transaction has this hash", explanation: "The public ledger does not know it. Check the hash (it is 64 characters, from your wallet's history). If your wallet shows it as pending, it was never validated and nothing left your account.", steps: ["Copy the hash again from your wallet's transaction details.", "If it never validated, your balance was not changed: check it."], facts: r };
  if (a.TransactionType !== "Payment")
    return { hash: e, outcome: "not_payment", headline: `This is a ${a.TransactionType}, not a payment`, explanation: "This helper explains deposits. Open the transaction in Settlement Forensics for any other type.", steps: [], facts: r };
  const c = String(o.TransactionResult ?? "");
  if (c !== "tesSUCCESS") {
    const f = ga[c] ?? `The payment failed with ${c}.`;
    return {
      hash: e,
      outcome: "failed_nothing_lost",
      headline: "The payment failed. Your funds never left your account.",
      explanation: `${f} A failed transaction still pays its fee (${r.feeXrp ?? 1e-5} XRP, destroyed), but nothing else moved: the amount is still in ${r.from}.`,
      steps: c === "tecDST_TAG_NEEDED" ? ["Get the destination tag from the exchange's deposit page.", "Send again with that tag."] : ["Fix the cause above, then send again.", "Check your balance: the amount is still there."],
      facts: r
    };
  }
  const l = o.delivered_amount ?? o.DeliveredAmount, d = a.DeliverMax ?? a.Amount;
  if (typeof l == "object" && typeof d == "object" && Number(l.value) < Number(d.value))
    return { hash: e, outcome: "partial_delivery", headline: `Only ${r.delivered} arrived, not ${r.requested}`, explanation: "This was a partial payment: the Amount field is a ceiling, not what arrived. A recipient must credit delivered_amount, which is what reached them.", steps: ["Compare with what the recipient credited.", "If they credited the Amount field, they were misled by the partial-payment flag."], facts: r };
  if (typeof l == "string" && typeof d == "string" && Number(l) < Number(d))
    return { hash: e, outcome: "partial_delivery", headline: `Only ${r.delivered} arrived, not ${r.requested}`, explanation: "This was a partial payment: the Amount field is a ceiling, not what arrived.", steps: [], facts: r };
  const h = r.destinationRequiresTag === !0 || (t.taggedShare ?? 0) >= 0.5, p = t.expectedTag !== void 0 && t.expectedTag !== null && r.destinationTag !== t.expectedTag;
  if (h && (r.destinationTag === null || p)) {
    const f = r.destinationTag === null ? "delivered_no_tag_custodial" : "delivered_tag_custodial", u = await ka(e, r, { expectedTag: t.expectedTag ?? null, generatedAt: n.generatedAt, customerRef: n.customerRef });
    return {
      hash: e,
      outcome: f,
      headline: r.destinationTag === null ? `${r.delivered} reached the service, without a destination tag` : `${r.delivered} reached the service with tag ${r.destinationTag}, not your tag ${t.expectedTag}`,
      explanation: `The payment succeeded: the funds are in ${r.to}${r.destinationDomain ? ` (which claims ${r.destinationDomain})` : ""}, a pooled account where the service credits each customer by tag. Without the right tag it cannot tell the deposit is yours, so it sits unassigned. Only the service can credit it, and services routinely do when given the facts below. Nobody else can move it, so ignore anyone offering to "recover" it for a fee.`,
      steps: [
        "Open a support ticket with the service from your logged-in account (never through a link someone sent you).",
        "Paste the letter below; attach it as a file if they allow.",
        "Expect them to ask you to prove you own the sending address, usually by a small payment or signing a message from it."
      ],
      facts: r,
      letter: u
    };
  }
  return !h && r.destinationExists !== !1 ? {
    hash: e,
    outcome: "delivered_private",
    headline: `${r.delivered} was delivered to ${r.to}`,
    explanation: "The payment succeeded to an account that does not require destination tags: most likely a personal wallet. Only whoever holds its key can send it back. If you meant to send elsewhere (a mistyped or poisoned address), the only route is asking the owner; if the account belongs to someone who tricked you, see Incident Response.",
    steps: ["Compare the destination with the address you meant, character by character.", "If you know the owner, ask them to return it.", "If it was a scam, open Incident Response to trace it and prepare a report."],
    facts: r
  } : { hash: e, outcome: "delivered", headline: `${r.delivered} was delivered to ${r.to}${r.destinationTag !== null ? ` with tag ${r.destinationTag}` : ""}`, explanation: "The payment succeeded with a destination tag. If the service has not credited it, give it the hash: it can look up the deposit directly.", steps: ["Send the service the transaction hash and the tag.", "Deposits are usually credited after a few ledgers; delays mean a manual review."], facts: r };
}
async function ka(e, t, n) {
  const a = [
    `Subject: Unassigned XRP Ledger deposit, transaction ${e}`,
    "",
    `To the support team${t.destinationDomain ? ` of ${t.destinationDomain}` : ""},`,
    "",
    `I sent a deposit to your XRP Ledger address ${t.to} that was ${t.destinationTag === null ? "sent without a destination tag" : `sent with destination tag ${t.destinationTag} instead of my tag`}. It was validated on the ledger and is in your account. Please credit it to my account.`,
    "",
    "Transaction facts (from the validated XRP Ledger):",
    `- Transaction hash: ${e}`,
    `- Validated in ledger: ${t.ledger ?? "unknown"}${t.at ? ` at ${t.at}` : ""}`,
    `- Result: ${t.result}`,
    `- From (my address): ${t.from}`,
    `- To (your address): ${t.to}`,
    `- Destination tag used: ${t.destinationTag ?? "none"}`,
    `- My correct destination tag: ${n.expectedTag ?? "<your tag from the deposit page>"}`,
    `- Amount delivered: ${t.delivered}`,
    `- My account with you: ${n.customerRef ?? "<your account email or ID>"}`,
    "",
    "I can prove I control the sending address by any method you require (for example, a small payment from it or a signed message).",
    "",
    "Anyone can check these facts on any XRP Ledger explorer by the transaction hash.",
    `Prepared ${n.generatedAt ?? (/* @__PURE__ */ new Date()).toISOString()} with NOSHASHI.`
  ].join(`
`);
  return { text: a, sha256: await zs(a) };
}
async function Sa(e, t) {
  const n = e.trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(n)) throw new Error("A transaction hash is 64 hexadecimal characters.");
  const s = await S("tx", { transaction: n, binary: !1 }).catch((r) => {
    if (/txnNotFound|not found/i.test(r instanceof Error ? r.message : String(r))) return null;
    throw r;
  }), a = (s?.tx_json ?? s)?.Destination, o = typeof a == "string" ? await S("account_info", { account: a, ledger_index: "validated" }).catch((r) => /actNotFound|not found/i.test(r instanceof Error ? r.message : String(r)) ? null : void 0) : void 0, i = typeof a == "string" && o ? await S("account_tx", { account: a, ledger_index_min: -1, ledger_index_max: -1, forward: !1, limit: 100 }).catch(() => null) : null;
  return va(n, {
    tx: s && s.validated !== !1 ? s : null,
    destination: o === void 0 ? {} : o,
    expectedTag: t,
    taggedShare: i && typeof a == "string" ? ba(a, i.transactions ?? []) : null
  });
}
async function nt(e) {
  const t = "address" in e ? `address=${encodeURIComponent(e.address)}` : `domain=${encodeURIComponent(e.domain)}`, n = await fetch(`${ft}/noshashi-xrpl-watch/domain-verify?${t}`, { signal: AbortSignal.timeout(2e4) }), s = await n.json().catch(() => ({}));
  if (!n.ok || !s.check) throw new Error(s.message ?? `The domain check failed (HTTP ${n.status}).`);
  return { check: s.check, accounts: s.accounts };
}
const $a = {
  accountTx: (e, t, n) => S("account_tx", { account: e, ledger_index_min: -1, ledger_index_max: -1, forward: t, limit: n }),
  accountInfo: (e) => S("account_info", { account: e, ledger_index: "validated" }).catch((t) => {
    if (/actNotFound|not found/i.test(t instanceof Error ? t.message : String(t))) return null;
    throw t;
  }),
  sanctions: async (e) => (await ie(e))?.hits ?? null
}, J = {
  standard: { depth: 2, maxAccounts: 40, perAccount: 200 },
  deep: { depth: 4, maxAccounts: 200, perAccount: 400 }
}, Ta = 131072, Aa = 60;
function st(e, t) {
  return (e.AffectedNodes ?? []).some((n) => n.CreatedNode?.LedgerEntryType === "AccountRoot" && n.CreatedNode?.NewFields?.Account === t);
}
function fe(e) {
  const t = e.delivered_amount ?? e.DeliveredAmount;
  return typeof t == "string" && /^\d+$/.test(t) ? Number(t) / 1e6 : 0;
}
function xa(e) {
  const t = [];
  for (const n of e.Memos ?? []) {
    const s = (n.Memo ?? n).MemoData;
    if (typeof s != "string" || !/^([0-9A-Fa-f]{2})+$/.test(s)) continue;
    const o = new TextDecoder("utf-8", { fatal: !1 }).decode(new Uint8Array((s.match(/../g) ?? []).map((i) => parseInt(i, 16)))).replace(/\s+/g, " ").trim().toLowerCase();
    o.length >= 8 && /[a-z]/.test(o) && t.push(o.slice(0, 200));
  }
  return t;
}
function _a(e, t) {
  const n = [], s = /* @__PURE__ */ new Set();
  let a = 0;
  for (const o of t) {
    const i = o.tx_json ?? o.tx ?? o, r = o.meta ?? {};
    if (r.TransactionResult !== "tesSUCCESS") continue;
    const c = String(i.hash ?? o.hash ?? ""), l = Number(o.ledger_index ?? i.ledger_index ?? 0);
    if (i.Account === e) for (const d of xa(i)) s.add(d);
    i.TransactionType === "Payment" && typeof i.Destination == "string" && (i.Destination === e && i.Account !== e && st(r, e) ? n.push({ from: i.Account, to: e, kind: "funded", hash: c, ledger: l, xrp: fe(r) }) : i.Account === e && st(r, i.Destination) && (a += 1, n.push({ from: e, to: i.Destination, kind: "funded", hash: c, ledger: l, xrp: fe(r) }))), i.TransactionType === "AccountDelete" && typeof i.Destination == "string" && (i.Account === e || i.Destination === e) && n.push({ from: i.Account, to: i.Destination, kind: "swept", hash: c, ledger: l, xrp: fe(r) });
  }
  return { links: n, memos: [...s], funded: a };
}
async function Na(e, t = {}) {
  const n = t.reader ?? $a, s = t.depth ?? J.standard.depth, a = t.maxAccounts ?? J.standard.maxAccounts, o = t.perAccount ?? J.standard.perAccount, i = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), c = [{ address: e, depth: 0 }];
  i.set(e, { address: e, depth: 0, exists: !0, balanceXrp: null, stop: null, sanction: null, memos: [] });
  let l = !1;
  for (; c.length; ) {
    const { address: u, depth: y } = c.shift(), b = i.get(u), m = await n.accountInfo(u).catch(() => {
    }), g = m?.account_data;
    if (b.exists = m !== null, g && (b.balanceXrp = Number(g.Balance ?? 0) / 1e6, u !== e && (Number(g.Flags ?? 0) & Ta) !== 0)) {
      b.stop = "service";
      continue;
    }
    const [w, v] = await Promise.all([
      n.accountTx(u, !0, 20).catch(() => ({ transactions: [] })),
      n.accountTx(u, !1, o).catch(() => ({ transactions: [] }))
    ]), k = [...w.transactions ?? [], ...v.transactions ?? []], $ = _a(u, k);
    if (b.memos = $.memos, $.funded > Aa && u !== e) {
      b.stop = "hub";
      continue;
    }
    for (const T of $.links) {
      r.set(`${T.hash}:${T.from}:${T.to}`, T);
      const A = T.from === u ? T.to : T.from;
      if (!i.has(A)) {
        if (i.size >= a) {
          l = !0;
          continue;
        }
        i.set(A, { address: A, depth: y + 1, exists: !0, balanceXrp: null, stop: null, sanction: null, memos: [] }), y + 1 <= s && c.push({ address: A, depth: y + 1 });
      }
    }
  }
  const d = [...i.values()], h = await n.sanctions(d.map((u) => u.address)).catch(() => null);
  for (const u of d) u.sanction = h?.[u.address] ?? null;
  const p = /* @__PURE__ */ new Map();
  for (const u of d) p.set(u.address.slice(-4).toLowerCase(), [...p.get(u.address.slice(-4).toLowerCase()) ?? [], u.address]);
  const f = /* @__PURE__ */ new Map();
  for (const u of d) for (const y of u.memos) f.set(y, (f.get(y) ?? /* @__PURE__ */ new Set()).add(u.address));
  return {
    seed: e,
    nodes: d,
    links: [...r.values()].sort((u, y) => u.ledger - y.ledger),
    vanity: [...p].filter(([, u]) => u.length >= 2).map(([u, y]) => ({ ending: u, accounts: y })),
    sharedMemos: [...f].filter(([, u]) => u.size >= 2).map(([u, y]) => ({ text: u, accounts: [...y] })),
    capped: l,
    sanctionsChecked: h !== null
  };
}
const xt = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/, Ia = /^[0-9A-Fa-f]{64}$/;
class M extends Error {
}
function F(e, t = "address") {
  const n = String(e[t] ?? "").trim();
  if (!xt.test(n)) throw new M(`${t} must be a classic XRPL address starting with r.`);
  return n;
}
function ge(e, t) {
  const n = String(e[t] ?? "").trim();
  if (!Ia.test(n)) throw new M(`${t} must be 64 hexadecimal characters.`);
  return n;
}
const x = (e, t = Object.keys(e)) => ({ type: "object", properties: e, required: t, additionalProperties: !1 }), _ = (e) => ({ type: "string", description: e }), Ea = [
  {
    name: "search_noshashi",
    description: "Search NOSHASHI's own pages and help: every app screen and button, features, plans and prices, the Learn course and word list, docs (API, webhooks, receipts, policies, security, enterprise), trust, legal and privacy. Use it for any question about the product, what a customer should use, or how NOSHASHI handles compliance. Returns passages with their page address.",
    input_schema: x({ query: { type: "string", description: "What to look up, in plain words" } }),
    feature: null,
    screen: "NOSHASHI pages",
    run: async (e) => {
      const t = String(e.query ?? "").trim();
      if (!t) throw new M("query is empty.");
      const n = await Tt(t, 6);
      return n.length === 0 ? "Nothing in NOSHASHI's pages matches that. Say so rather than guess." : n.map((s) => ({ title: s.title, source: s.source, text: s.text }));
    }
  },
  {
    name: "ledger_status",
    description: "The latest validated XRP Ledger: index, hash, close time, reference fee and open-ledger fee. Call this to stamp an answer with the ledger it describes.",
    input_schema: x({}),
    feature: null,
    screen: "Mission Control",
    run: () => Ht()
  },
  {
    name: "ledger_sync",
    description: "What four public XRPL servers each report right now (ledger index, state, fees) and where they disagree.",
    input_schema: x({}),
    feature: null,
    screen: "Ledger Sync",
    run: () => as()
  },
  {
    name: "check_address",
    description: "What the ledger publishes about an account before someone pays it: existence, age, destination tag requirement, flags and anything recorded against it. Reports facts, never 'safe'.",
    input_schema: x({ address: _("Classic address, r…") }),
    feature: null,
    screen: "Check an Address",
    run: async (e, t) => {
      const n = F(e), s = !t.has("portfolios");
      if (s && !t.spendFreeCheck())
        throw new M("This month's 10 free address checks are used up. Pro includes unlimited checks.");
      const a = await en(n);
      if (a.verdict === "unknown" && !a.exists && a.findings.length === 0)
        throw s && t.refundFreeCheck?.(), new Error("The ledger could not be reached, so nothing about this address is known yet. Try again in a moment.");
      return a;
    }
  },
  {
    name: "read_claims",
    description: "Tokens and claims other accounts have sent to an address, and whether each is real or an impersonation (a familiar ticker from an issuer with no obligations).",
    input_schema: x({ address: _("Classic address whose inbox to read") }),
    feature: null,
    screen: "Inbox",
    run: (e) => Hn(F(e))
  },
  {
    name: "read_token_rights",
    description: "What an NFT's issuer can still do after someone owns it: burnable, transferable, transfer fee, taxon.",
    input_schema: x({ token_id: _("The 64-character NFTokenID") }),
    feature: null,
    screen: "Token Rights",
    run: (e) => Qn(ge(e, "token_id"))
  },
  {
    name: "certify_authority",
    description: "The six issuer checks (freeze surrendered, not globally frozen, open holding, no single key controls the issuer, transfer fee, supply concentration) with GO/HOLD/NO-GO, ledger index and SHA-256 digest.",
    input_schema: x({ issuer: _("Issuer's classic address") }),
    feature: "authority_certificate",
    screen: "Authority",
    run: (e) => ms(F(e, "issuer"), { walkSupply: !1 })
  },
  {
    name: "read_provenance",
    description: "Where an account came from: its real age (corrected for the Sequence misreading) and the account that first funded it.",
    input_schema: x({ address: _("Counterparty address") }),
    feature: "portfolios",
    screen: "Provenance",
    run: (e) => dn(F(e))
  },
  {
    name: "read_book",
    description: "An order book's listed versus funded depth (offers whose owners can really fill them), the unfunded share, spread and mid price. The book is the currency against XRP.",
    input_schema: x({
      currency: { type: "string", description: "Currency code, e.g. USD, or a 40-character hex code" },
      issuer: _("Issuer's classic address")
    }),
    feature: "portfolios",
    screen: "Order Book",
    run: (e) => {
      const t = String(e.currency ?? "").trim();
      if (!/^([A-Za-z0-9]{3}|[0-9A-Fa-f]{40})$/.test(t))
        throw new M("currency must be a 3-character code or 40 hexadecimal characters.");
      return yn(t, F(e, "issuer"));
    }
  },
  {
    name: "read_settlement",
    description: "What a transaction actually delivered: type, sender, result, whether the partial-payment flag was set, requested versus delivered amount, and the fee burned.",
    input_schema: x({ hash: _("Transaction hash, 64 hexadecimal characters") }),
    feature: "portfolios",
    screen: "Settlement",
    run: (e) => kn(ge(e, "hash"))
  },
  {
    name: "read_control_surface",
    description: "Who can move an account's funds: master key status, regular key, signer list and quorum, the fewest signers that reach quorum, master-key bypass, and XRP locked in reserve.",
    input_schema: x({ address: _("Treasury or issuer address") }),
    feature: "portfolios",
    screen: "Control Surface",
    run: (e) => gt(F(e))
  },
  {
    name: "read_pool",
    description: "An AMM pool's balances, trading fee, fee votes weighted by LP tokens, and who holds the auction slot.",
    input_schema: x({ amm_account: _("The AMM pool's own account address") }),
    feature: "portfolios",
    screen: "Pool Governance",
    run: (e) => An({ ammAccount: F(e, "amm_account") })
  },
  {
    name: "read_issuance",
    description: "A token from the issuer's side: currencies issued, outstanding obligations, holder lines read, the largest holder, concentration, and enforcement history (freezes and clawbacks).",
    input_schema: x({ issuer: _("Issuer's classic address") }),
    feature: "portfolios",
    screen: "Issuance",
    run: (e) => wt(F(e, "issuer"))
  },
  {
    name: "security_check",
    description: "How hard an XRP Ledger account is to take over: who can sign (master key, regular key, signer list and its real quorum), recent key and settings changes, address-poisoning attempts against it, the doors strangers can use (NFT offers, checks, payment channels), a 0–100 score, and an unsigned hardening plan to sign in the owner's own wallet.",
    input_schema: x({ address: _("The account to check, r…") }),
    feature: null,
    screen: "Security Center",
    run: async (e) => {
      const t = await Ge(F(e));
      return { posture: { ...t, events: t.events.slice(0, 10) }, assessment: Ps(t) };
    }
  },
  {
    name: "investigate_hack",
    description: "For an account that was drained or hacked: the key changes before it, the stolen value followed hop by hop (payments and AccountDelete sweeps, past the dust), what became of every account it reached, and every recovery path that exists. Validated XRP Ledger transactions cannot be reversed; this says which off-ledger paths apply.",
    input_schema: x(
      {
        address: _("The drained account, r…"),
        from_ledger: { type: "number", description: "Ledger the incident began at, if known" }
      },
      ["address"]
    ),
    feature: "incident_response",
    screen: "Security Center › Incident Response",
    run: async (e, t) => {
      const n = F(e), s = await Ge(n, 400), a = Number(e.from_ledger), o = [...s.events].reverse().find((l) => l.kind === "regular_key_set" || l.kind === "signer_list_set"), i = Number.isInteger(a) && a > 0 ? a : o?.ledger ?? Math.max(1, s.ledgerIndex - 21600 * 30), r = t.has("forensic_trace") ? ae.deep : ae.standard, c = await Us(n, { sinceLedger: i, depth: r.depth, perAccount: r.perAccount });
      return {
        signals: js(n, s.events, c.flows),
        trace: { ...c, flows: c.flows.slice(0, 40) },
        options: Ms(c, { stillHoldsXrp: s.exists ? s.balanceXrp : 0, keyEvents: s.events })
      };
    }
  },
  {
    name: "explain_transaction",
    description: "Before signing: what a transaction really does, from its JSON or the hex blob a site asks you to sign. Decoded locally. Flags new regular keys and signer lists, disabled master keys, AccountDelete, NFTs sold for nothing, partial payments, sanctioned destinations, high fees and links in memos, with a verdict: SAFE-LOOKING, CAREFUL or DO NOT SIGN.",
    input_schema: x({ transaction: { type: "string", description: "The transaction JSON, or its hex blob" } }),
    feature: null,
    screen: "Security Center › Pre-sign check",
    run: async (e) => {
      const { tx: t, format: n } = await Ys(String(e.transaction ?? "")), s = await ie(Zs(t));
      return Js(t, n, { sanctioned: s?.hits });
    },
    compose: (e) => {
      const t = e;
      return [
        `${t.verdict}. ${t.summary.join(" ")}`,
        ...t.flags.map((n) => `${n.severity === "danger" ? "✕" : n.severity === "warn" ? "!" : "·"} ${n.text}`),
        "NOSHASHI never signs: if you go ahead, sign it in your own wallet."
      ].join(`
`);
    }
  },
  {
    name: "find_stuck_funds",
    description: "XRP an account can get back: matured escrows waiting to be finished, expired escrows and payment channels that return when closed, checks written to it and never cashed, and owner reserve locked by old trust lines, orders, NFT offers, preauthorisations and tickets. Each with the unsigned transaction that releases it, and what AccountDelete would return.",
    input_schema: x({ address: _("The account to scan, r…") }),
    feature: null,
    screen: "Security Center › Recover funds",
    run: async (e) => {
      const t = await he(F(e));
      return oa(t, await ia(t));
    },
    compose: (e) => {
      const t = e;
      if (!t.exists) return `There is no account at ${t.address}.`;
      const n = (s) => `${s.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;
      return [
        `Recovery scan of ${t.address} at ledger ${t.ledgerIndex.toLocaleString("en-US")}: ${n(t.recoverableNowXrp)} recoverable now, ${n(t.optionalReserveXrp)} of reserve you could free by removing objects you no longer need${t.laterXrp ? `, ${n(t.laterXrp)} arriving later` : ""}. Balance ${n(t.balanceXrp)}, of which ${n(t.lockedXrp)} is locked as reserve.`,
        ...t.items.slice(0, 12).map((s) => `[${s.when.toUpperCase()}] ${s.title}. ${s.detail}${s.tx ? ` Transaction: ${JSON.stringify(s.tx)}` : ""}`),
        t.items.length > 12 ? `…and ${t.items.length - 12} more in SECURITY CENTER › RECOVER FUNDS.` : "",
        t.deletion.possible ? `Closing the account with AccountDelete would return ${n(t.deletion.returnsXrp)} to an account you own.` : `AccountDelete is blocked by: ${t.deletion.blockers.join(", ")}.`,
        "Every transaction is unsigned: review and sign it in your own wallet."
      ].filter(Boolean).join(`
`);
    }
  },
  {
    name: "audit_exposure",
    description: "The XRP Ledger's 'revoke approvals': every standing permission that lets someone else take value from an account (checks it wrote, NFT sell offers including zero-price giveaways, funded payment channels, open orders, preauthorisations, regular key, signers, NFT minter, Default Ripple on a non-issuer), each with the unsigned revoking transaction.",
    input_schema: x({ address: _("The account to audit, r…") }),
    feature: null,
    screen: "Security Center › Exposure audit",
    run: async (e) => ua(await he(F(e))),
    compose: (e) => {
      const t = e;
      return t.exists ? t.exposures.length ? [
        `Exposure audit of ${t.address} at ledger ${t.ledgerIndex.toLocaleString("en-US")}: ${t.exposures.length} open permission${t.exposures.length === 1 ? "" : "s"}${t.atRiskXrp ? `, up to ${t.atRiskXrp.toLocaleString("en-US")} XRP others could take` : ""}.`,
        ...t.exposures.slice(0, 12).map((n) => `[${n.risk.toUpperCase()}] ${n.title}. ${n.detail}${n.revoke ? ` Revoke: ${JSON.stringify(n.revoke)}` : ""}`),
        "Revoking transactions are unsigned: sign them in your own wallet."
      ].join(`
`) : `Exposure audit of ${t.address} at ledger ${t.ledgerIndex.toLocaleString("en-US")}: nothing open. No one else can take value from it.` : `There is no account at ${t.address}.`;
    }
  },
  {
    name: "asset_inventory",
    description: "Everything an account holds besides XRP: tokens, AMM LP shares, NFTs and value in open orders. On Pro and above each is valued in XRP at the live best bid, AMM spot price or pool share.",
    input_schema: x({ address: _("The account, r…") }),
    feature: null,
    screen: "Security Center › Recover funds",
    run: async (e, t) => {
      const n = pa(await he(F(e)));
      return t.has("asset_recovery") ? fa(n) : n;
    },
    compose: (e) => {
      const t = e;
      return t.exists ? t.items.length ? [
        `${t.address} holds ${t.xrpBalance.toLocaleString("en-US")} XRP and ${t.items.length} other holding${t.items.length === 1 ? "" : "s"}${t.priced ? `, worth about ${t.valuedXrp.toLocaleString("en-US")} XRP at the best bid` : ""}:`,
        ...t.items.slice(0, 15).map((n) => `· ${n.label}${n.kind === "nft" ? "" : `: ${n.amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}`}${n.valueXrp !== null && t.priced ? ` ≈ ${n.valueXrp.toLocaleString("en-US")} XRP` : ""}${n.note ? ` (${n.note})` : ""}`),
        t.priced ? "A top-of-book price is an indication; selling a large balance moves it." : "Pro values each holding in XRP at the live best bid."
      ].join(`
`) : `${t.address} holds ${t.xrpBalance.toLocaleString("en-US")} XRP and nothing else.` : `There is no account at ${t.address}.`;
    }
  },
  {
    name: "deposit_help",
    description: "A deposit that 'never arrived', explained from its transaction hash: a failed payment (tecDST_TAG_NEEDED, tecNO_DST_INSUF_XRP…) moved nothing but its fee; one that reached an exchange without the right destination tag can be credited by the exchange, with a ready letter and its SHA-256; one sent to a private wallet can only be returned by its owner.",
    input_schema: x(
      { hash: _("The transaction hash, 64 hexadecimal characters"), expected_tag: { type: "number", description: "The destination tag the person should have used, if known" } },
      ["hash"]
    ),
    feature: null,
    screen: "Security Center › Deposit help",
    run: (e) => {
      const t = Number(e.expected_tag);
      return Sa(ge(e, "hash"), Number.isInteger(t) ? t : null);
    },
    compose: (e) => {
      const t = e;
      return [
        `${t.headline}.`,
        t.explanation,
        t.steps.length ? t.steps.map((n, s) => `${s + 1}. ${n}`).join(`
`) : "",
        t.letter ? `The letter to send the service (SHA-256 ${t.letter.sha256.slice(0, 16)}…) is in SECURITY CENTER › DEPOSIT HELP:
${t.letter.text}` : ""
      ].filter(Boolean).join(`
`);
    }
  },
  {
    name: "verify_domain",
    description: "Whether an account's claimed Domain is real: the domain must list the account back in https://<domain>/.well-known/xrp-ledger.toml. Given a domain instead, which accounts it vouches for and whether each names it back. Catches accounts impersonating exchanges and issuers.",
    input_schema: x({ address: _("An account, r… (or leave empty and give domain)"), domain: { type: "string", description: "A domain such as example.com" } }, []),
    feature: null,
    screen: "Security Center › Domain check",
    run: (e) => {
      const t = String(e.address ?? "").trim();
      if (xt.test(t)) return nt({ address: t });
      const n = String(e.domain ?? "").trim();
      if (!n) throw new M("Give an address or a domain.");
      return nt({ domain: n });
    },
    compose: (e) => {
      const t = e;
      return [
        `${t.check.status.replace("_", " ").toUpperCase()}: ${t.check.detail}`,
        ...(t.accounts ?? []).map((n) => `· ${n.address}: ${n.exists === !1 ? "does not exist" : n.points_back ? "names the domain back" : `does not name it (${n.domain ?? "no domain"})`}`)
      ].join(`
`);
    }
  },
  {
    name: "map_cluster",
    description: "From one scam or drainer account, the other accounts the same operation runs: who funded it, accounts it created, where it swept on AccountDelete, shared vanity endings and memos. Services end a branch. Two hops and 40 accounts; four hops and 200 on Enterprise.",
    input_schema: x({ address: _("A known scam account, r…") }),
    feature: "asset_recovery",
    screen: "Security Center › Scam clusters",
    run: (e, t) => Na(F(e), t.has("forensic_trace") ? J.deep : J.standard),
    compose: (e) => {
      const t = e;
      return [
        `Cluster around ${t.seed}: ${t.nodes.length} accounts, ${t.links.length} links${t.capped ? " (capped)" : ""}.`,
        ...t.links.slice(0, 12).map((n) => `· ${n.kind === "funded" ? "funded" : "swept (AccountDelete)"} ${n.from} → ${n.to}, ${n.xrp} XRP (${n.hash.slice(0, 12)}…)`),
        ...t.vanity.map((n) => `${n.accounts.length} accounts end in "${n.ending}": a generated vanity series.`),
        ...t.sharedMemos.map((n) => `${n.accounts.length} accounts sent the memo "${n.text.slice(0, 80)}".`),
        ...t.nodes.filter((n) => n.sanction).map((n) => `${n.address} is on the OFAC SDN list (${n.sanction.entityName}).`),
        "Save the report or open a case from SECURITY CENTER › SCAM CLUSTERS."
      ].join(`
`);
    }
  }
];
function Q(e) {
  return Ea.find((t) => t.name === e);
}
async function me(e, t, n) {
  const s = Q(e);
  if (!s) return { ok: !1, error: `No tool named ${e}.` };
  if (s.feature && !n.has(s.feature))
    return { ok: !1, gated: !0, error: `${s.screen} needs a Pro plan or higher.` };
  try {
    return { ok: !0, value: await s.run(t ?? {}, n) };
  } catch (a) {
    return { ok: !1, error: a instanceof Error ? a.message : "The read failed." };
  }
}
const _t = /\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/g, Nt = /\b[0-9A-Fa-f]{64}\b/g, Fa = /\b[0-9A-F]{40}\b/g, Ra = /\b[A-Z][A-Z0-9]{2}\b/g, Oa = /* @__PURE__ */ new Set([
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
function Da(e) {
  const t = (o) => [...new Set(o)], n = t(e.match(Nt) ?? []).map((o) => o.toUpperCase()), s = (e.match(Fa) ?? []).filter((o) => !n.some((i) => i.includes(o))), a = (e.match(Ra) ?? []).filter((o) => !Oa.has(o));
  return {
    addresses: t(e.match(_t) ?? []),
    hashes: n,
    currencies: t([...a, ...s])
  };
}
const Ca = { certify_authority: "issuer", read_issuance: "issuer", read_pool: "amm_account" }, Pa = [
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
    tool: "find_stuck_funds",
    label: "XRP the account can get back",
    needs: "address",
    words: /stuck|reclaim|unlock|free (up )?(my |the )?reserve|reserve back|get (back )?(my |the )?reserve|recover(able)? (reserve|xrp|funds)|uncashed|matured|expired (escrow|channel|check)|payment channel|escrow.*(finish|release|claim)|forgotten (xrp|funds)|money (stuck|locked)/i
  },
  {
    tool: "audit_exposure",
    label: "permissions others hold",
    needs: "address",
    words: /exposure|revoke|approval|permission|allowance|who (else )?can (take|pull|spend|move)|open (offers?|checks?|orders?)|standing (offer|order|check)|give ?away|zero[- ]price/i
  },
  {
    tool: "asset_inventory",
    label: "everything the account holds",
    needs: "address",
    words: /inventory|what (else )?(do i|does (it|this account)) (own|hold)|forgotten (assets?|tokens?)|holdings|net worth|worth in xrp|value of (my|this|the|its) (tokens|nfts|assets|holdings)|lp (tokens?|shares?) (i|it) hold/i
  },
  {
    tool: "deposit_help",
    label: "why a deposit did not arrive",
    needs: "hash",
    words: /never arrived|didn'?t arrive|did not arrive|not (arrived|credited)|hasn'?t (arrived|been credited)|missing (deposit|payment)|lost (deposit|payment)|wrong (tag|destination tag|memo)|forgot (the |my )?(destination )?tag|without (a |the )?(destination )?tag|no (destination )?tag|exchange (didn'?t|did not|hasn'?t|won'?t) credit/i
  },
  {
    tool: "map_cluster",
    label: "the operation behind the account",
    needs: "address",
    words: /cluster|same (operator|scammer|gang|group|person|people)|related accounts|linked accounts|other accounts (of|run by|belonging|owned)|scam (network|ring|operation|gang)|who else (is|are)|sock ?puppet|drainer (network|accounts)/i
  },
  {
    tool: "verify_domain",
    label: "whether the claimed domain is real",
    needs: "address",
    words: /\bdomain\b|\.toml\b|xrp-ledger\.toml|really (belong|owned|theirs|from)|official (account|address|wallet)|is (this|it) (really|actually|the real)|genuine|verified (issuer|account)/i
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
], La = /noshashi|noshx|\bplans?\b|pricing|price|cost|which screen|how (do|can|should) i|what (is|are|does)|explain|difference between|what does .* mean|travel rule|\bkyc\b|\baml\b|mica|webhook|\bapi\b|examiner|auditor/i, Xa = /\bNSH-?\s?(\d{1,9})\b/gi, ye = /self[- ]?repair|\brepair\b|diagnos|troubleshoot|health ?check|not working|isn'?t working|doesn'?t work|stopped working|\bbroken\b|won'?t (load|connect|open|start|sign)|can'?t (connect|sign in|log in|load)|keeps? (disconnect|signing me out|failing)|\bfix (it|the app|this|noshashi|my app|yourself|everything)\b|something('?s| is) wrong|check (the app|everything|my setup)/i, Ha = /\b(my|our|open|active|all|pending|unresolved|resolved|recent|customer|support) tickets?\b|\btickets? (queue|inbox|waiting|list)\b|\blist (the |my |all )?tickets\b|\bany tickets\b|\bshow (me )?(the |my )?tickets\b/i, qa = /\b(open|file|create|raise|start|submit|log) (a |an |new |the )?(support )?(ticket|case with support|support request)\b|\b(contact|tell|email|message) support\b|\breport (a |this |the )?bug\b/i, at = /\b(with|attach|include|send) (this|the|a|my)? ?(self-?repair |repair |diagnostic )?(report|diagnostics|results)\b/i;
function ot(e, t) {
  const n = e.slice(t);
  return (/^\s*(?::|—|-|,)?\s*(?:saying|say|with|that|and say|telling (?:them|him|her))?\s*[:,]?\s*([\s\S]*)$/i.exec(n)?.[1] ?? "").trim().replace(/^["'“]|["'”]$/g, "").trim();
}
function Ua(e) {
  const t = [];
  let n = e;
  const s = [...e.matchAll(Xa)].map((i) => ({ ref: `NSH-${i[1]}`, index: i.index ?? 0, end: (i.index ?? 0) + i[0].length })), a = /\b(reply|respond|write|add|post|answer back|tell (?:them|the customer))(?: to| on| in)?\s+NSH-?\s?(\d{1,9})\b/i.exec(e);
  if (a) {
    const i = ot(e, (a.index ?? 0) + a[0].length);
    return i.length >= 10 ? (t.push({ tool: "reply_ticket", input: { ticket: `NSH-${a[2]}`, message: i }, why: "reply to the ticket" }), n = e.slice(0, a.index)) : t.push({ tool: "read_ticket", input: { ticket: `NSH-${a[2]}` }, why: "the ticket to reply to (no message given)" }), { calls: t, rest: n };
  }
  const o = qa.exec(e);
  if (o) {
    if (at.test(e) || ye.test(e))
      return t.push({ tool: "self_repair", input: { open_ticket: !0 }, why: "repair, then open a ticket with the report" }), { calls: t, rest: "" };
    const i = ot(e, (o.index ?? 0) + o[0].length).replace(/^(about|for|regarding|because|that)\s+/i, "");
    if (i.length >= 10) {
      const r = (i.split(/[.!?](?:\s|$)|\n/)[0] ?? i).trim().slice(0, 100);
      return t.push({ tool: "open_ticket", input: { subject: r.length >= 4 ? r : i.slice(0, 100), body: i }, why: "open a support ticket" }), { calls: t, rest: e.slice(0, o.index) };
    }
    return { calls: t, rest: "", note: "To open a ticket, say what happened after it, for example: open a ticket: the Ledger Watch tab shows no events since this morning." };
  }
  for (const { ref: i } of s) {
    const r = e;
    /\b(re-?open|not (solved|fixed|resolved))\b/i.test(r) ? t.push({ tool: "set_ticket_status", input: { ticket: i, status: "open" }, why: "reopen the ticket" }) : /\b(close|resolve|mark (it |this )?(as )?(resolved|solved|done|closed)|it'?s (solved|fixed))\b/i.test(r) ? t.push({ tool: "set_ticket_status", input: { ticket: i, status: "resolved" }, why: "resolve the ticket" }) : /\bmark (it |this )?(as )?answered\b/i.test(r) ? t.push({ tool: "set_ticket_status", input: { ticket: i, status: "answered" }, why: "mark the ticket answered" }) : /\b(answer|draft|suggest)\b/i.test(r) ? t.push({ tool: "answer_ticket", input: { ticket: i, send: /\b(send|post|and reply|submit) (it|that|this|the (draft|answer|reply))?\b|\band send\b/i.test(r) }, why: "answer the ticket from NOSHASHI's pages" }) : ye.test(r) || at.test(r) ? t.push({ tool: "self_repair", input: { post_to_ticket: i }, why: "repair and post the report to the ticket" }) : t.push({ tool: "read_ticket", input: { ticket: i }, why: "read the ticket" });
  }
  if (s.length) return { calls: t, rest: s.reduceRight((i, r) => i.slice(0, r.index) + i.slice(r.end), e) };
  if (Ha.test(e)) {
    const i = /\bresolved\b|\bclosed\b/i.test(e) && !/unresolved/i.test(e) ? "resolved" : /\ball\b/i.test(e) ? "any" : "active";
    return t.push({ tool: "list_tickets", input: { status: i }, why: "the support tickets" }), { calls: t, rest: "" };
  }
  return ye.test(e) && t.push({ tool: "self_repair", input: {}, why: "check and repair the app" }), { calls: t, rest: n };
}
function Ma(e) {
  const t = e.indexOf("{"), n = e.lastIndexOf("}");
  if (t >= 0 && n > t) {
    const a = e.slice(t, n + 1);
    if (/"TransactionType"\s*:/.test(a)) return a;
  }
  const s = /\b12[0-9A-Fa-f]{98,}\b/.exec(e);
  return s ? s[0] : null;
}
const za = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})\b/gi;
function It(e, t = {}) {
  const n = t.tickets ? Ua(e) : { calls: [], rest: e };
  e = n.rest;
  const s = [...n.calls], a = (c) => {
    s.some((l) => l.tool === c.tool && JSON.stringify(l.input) === JSON.stringify(c.input)) || s.push(c);
  }, o = Ma(e);
  o && (a({ tool: "explain_transaction", input: { transaction: o }, why: "what the transaction does if signed" }), e = e.replace(o, " "));
  const i = Da(e);
  for (const c of Pa)
    if (c.words.test(e)) {
      if (c.tool === "verify_domain" && i.addresses.length === 0) {
        const l = [...e.replace(/xrp-ledger\.toml/gi, " ").matchAll(za)].map((d) => d[1].toLowerCase()).filter((d) => !/(^|\.)noshashi\.com$/.test(d));
        l[0] && a({ tool: c.tool, input: { domain: l[0] }, why: c.label });
        continue;
      }
      if (c.needs === "address")
        for (const l of i.addresses) a({ tool: c.tool, input: { [Ca[c.tool] ?? "address"]: l }, why: c.label });
      else if (c.needs === "hash")
        for (const l of i.hashes)
          a({ tool: c.tool, input: c.tool === "read_token_rights" ? { token_id: l } : { hash: l }, why: c.label });
      else if (c.needs === "book") {
        const l = i.addresses[0];
        for (const d of i.currencies) l && a({ tool: c.tool, input: { currency: d, issuer: l }, why: c.label });
      } else
        a({ tool: c.tool, input: {}, why: c.label });
    }
  if (s.length === 0 && e.trim()) {
    for (const c of i.hashes) a({ tool: "read_settlement", input: { hash: c }, why: "a hash on its own" });
    for (const c of i.addresses) a({ tool: "check_address", input: { address: c }, why: "an address on its own" });
  }
  const r = s.length === 0 && e.trim().length > 0 || n.calls.length === 0 && La.test(e.replace(_t, " ").replace(Nt, " "));
  return { calls: s.slice(0, 6), knowledge: r, entities: i, note: n.note };
}
const ja = kt.scenes, Ba = L("noshashi noshx plan plans need use screen screens help feature which tool tools we our us want get way much many cost price pay"), Wa = /\bwhich\b|\bwhat (screen|tool|plan|should)|how (do|can|does|should) (i|we|noshashi)|\bhelp\b|\bneed\b|\buse\b|where (do|can)|feature/i;
function Ga(e, t = 3) {
  const n = new Set(L(e));
  for (const s of Ba) n.delete(s);
  return ja.map((s) => {
    const a = L(`${s.name} ${s.name} ${s.summary}`), o = a.filter((i) => n.has(i)).length;
    return { scene: s, score: o / Math.sqrt(a.length + 4) };
  }).filter((s) => s.score > 0.12).sort((s, a) => a.score - s.score).slice(0, t).map((s) => s.scene);
}
const it = { critical: 0, warn: 1, info: 2, ok: 3 }, Ka = { critical: "✕", warn: "!", info: "·", ok: "✓" };
function D(e, t = 6) {
  const n = [...e].sort((s, a) => it[s.severity] - it[a.severity]).slice(0, t);
  return n.length === 0 ? "Nothing notable was recorded." : n.map((s) => `${Ka[s.severity]} ${s.title}. ${s.detail}${s.action ? ` What to do: ${s.action}` : ""}`).join(`
`);
}
const P = (e) => e ? ` (validated ledger ${e.toLocaleString("en-US")})` : "", rt = (e) => e.length > 12 ? `${e.slice(0, 6)}…${e.slice(-4)}` : e;
function ct(e, t) {
  switch (e) {
    case "check_address": {
      const n = t, s = Z[n.verdict];
      return [
        `Address check for ${n.address}${P(n.ledgerIndex)}: ${s.label}.${n.headline === s.label ? "" : ` ${n.headline}`}`,
        n.exists ? `Balance ${n.balanceXrp.toLocaleString("en-US")} XRP${n.domain ? `, claims the domain ${n.domain} (claimed, not verified)` : ""}${n.isIssuer ? `, issues ${n.issuedCurrencies.join(", ") || "tokens"}` : ""}.` : "",
        D(n.findings),
        "This reports what the ledger publishes. Nothing recorded against an address is not the same as safe."
      ].filter(Boolean).join(`
`);
    }
    case "certify_authority": {
      const n = t, s = n.checks.map((a) => {
        const o = rs(a);
        return `${o === "PASS" ? "✓" : o === "FAIL" ? "✕" : "!"} ${a.label} (${a.severity === "block" ? "blocking" : "warning"}): ${o}. ${a.detail}`;
      }).join(`
`);
      return [
        `Authority certificate for issuer ${n.issuer}${n.currencyLabel ? ` (${n.currencyLabel})` : ""}${P(n.ledgerIndex)}: ${n.verdict.toUpperCase()}.`,
        s,
        `Digest ${n.digest.slice(0, 16)}…, so anyone can re-check this reading.`
      ].join(`
`);
    }
    case "read_control_surface": {
      const n = t;
      return [
        `Who controls ${n.address}${P(n.ledgerIndex)}: master key ${n.masterKeyEnabled ? "enabled" : "disabled"}${n.regularKey ? `, regular key ${rt(n.regularKey)}` : ""}${n.signers.present ? `, signer list quorum ${n.signers.quorum} with the fewest signers that reach it being ${n.signers.minimumSigners}` : ", no signer list"}. Balance ${n.balanceXrp.toLocaleString("en-US")} XRP, ${n.reserveLockedXrp.toLocaleString("en-US")} XRP locked in reserve${n.escrowedXrp ? `, ${n.escrowedXrp.toLocaleString("en-US")} XRP in escrow` : ""}.`,
        D(on(n))
      ].join(`
`);
    }
    case "read_provenance": {
      const n = t;
      return [`Provenance of ${n.address}${n.ageDays !== void 0 ? `, about ${Math.round(n.ageDays).toLocaleString("en-US")} days old` : ""}${n.fundedBy ? `, first funded by ${n.fundedBy}` : ""}:`, D(pn(n))].join(`
`);
    }
    case "read_book": {
      const n = t;
      return [`Order book${P(n.ledgerIndex)}:`, D(wn(n))].join(`
`);
    }
    case "read_settlement": {
      const n = t;
      return [
        `Transaction ${rt(n.hash)}${P(n.ledgerIndex)}: ${n.transactionType}, result ${n.result}${n.validated ? "" : " (not yet validated, so nothing here is final)"}.`,
        D($n(n))
      ].join(`
`);
    }
    case "read_pool": {
      const n = t;
      return [`AMM pool${P(n.ledgerIndex)}:`, D(Nn(n))].join(`
`);
    }
    case "read_issuance": {
      const n = t;
      return [`Issuance${P(n.ledgerIndex)}:`, D(Cn(n))].join(`
`);
    }
    case "read_claims": {
      const n = t;
      return [`Tokens sent to the account${P(n.ledgerIndex)}:`, D(Un(n))].join(`
`);
    }
    case "read_token_rights":
      return ["NFT rights:", D(Zn(t))].join(`
`);
    case "ledger_sync":
      return ["What the public servers report:", D(os(t))].join(`
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
${s.plan.map((o) => `→ ${o.title}: ${JSON.stringify(o.tx)}${o.caution ? ` Before signing: ${o.caution}` : ""}`).join(`
`)}` : "";
      return [`Security check for ${n.address}${P(n.ledgerIndex)}: grade ${s.grade}, ${s.score}/100. ${s.summary}`, D(s.findings), a].filter(Boolean).join(`
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
      return Q(e)?.compose?.(t) ?? "";
  }
}
function Ya(e) {
  return e.replace(/^Q: .*$/m, "").replace(/^A: /m, "").replace(/([.!?])\s+/g, `$1
`).split(/\n+/).map((t) => t.trim()).filter((t) => t.length > 25 && !/^[|·—-]/.test(t));
}
function Va(e, t) {
  if (t.length === 0) return "";
  const n = new Set(L(e)), s = t[0], a = /^(Help ›|Support ›|Learn NOSHASHI › Knowledge check|Pricing ›)/, o = t.slice(0, 2).find((p) => a.test(p.title) && p.score >= s.score * 0.85);
  if (o) {
    let p = o.text.replace(/^Q: .*\nA: /, "");
    return /^(Help|Support) ›/.test(o.title) && (p = p.split(`
`).slice(1).join(`
`) || p), `${p}

Source: ${o.title} · ${o.source}`;
  }
  if (s.title.startsWith("Learn NOSHASHI › Word list")) {
    const p = s.text.split(`
`).find((f) => L(f.split(":")[0]).some((u) => n.has(u)));
    if (p) return `${p}

Source: NOSHASHI word list · ${s.source}`;
  }
  const i = t.slice(0, 3).flatMap(
    (p, f) => Ya(p.text).map((u, y) => {
      const b = L(u), m = b.filter((g) => n.has(g)).length;
      return { hit: p, sentence: u, position: y, score: m / Math.sqrt(b.length + 1) + (f === 0 ? 0.3 : 0) - y * 0.01 };
    })
  ), r = /* @__PURE__ */ new Set(), c = i.filter((p) => p.score > 0).sort((p, f) => f.score - p.score).filter((p) => {
    const f = p.sentence.toLowerCase().replace(/\s+/g, " ");
    return !r.has(f) && r.add(f);
  }).slice(0, 4);
  if (c.length === 0) return `${s.text.slice(0, 600)}

Source: ${s.title} · ${s.source}`;
  const l = /* @__PURE__ */ new Map();
  for (const p of c) l.set(p.hit, [...l.get(p.hit) ?? [], p]);
  const d = [], h = [];
  for (const [p, f] of l)
    d.push(f.sort((u, y) => u.position - y.position).map((u) => u.sentence).join(" ")), h.push(`${p.title} · ${p.source}`);
  return `${d.join(`

`)}

Source${h.length > 1 ? "s" : ""}: ${h.join("; ")}`;
}
async function Ja(e, t, n) {
  const s = It(e, { tickets: !!Q("list_tickets") }), a = [], o = (h) => {
    a.push(h), n?.(h);
  }, i = await Promise.all(
    s.calls.map(async (h) => {
      const p = await me(h.tool, h.input, t), f = s.calls.some((u) => u.tool === "check_address" && u.input.address === h.input.issuer);
      if (p.ok === !1 && p.gated && h.tool === "certify_authority" && typeof h.input.issuer == "string" && !f) {
        const u = await me("check_address", { address: h.input.issuer }, t);
        if (u.ok)
          return o({ kind: "tool", name: "check_address", input: { address: h.input.issuer }, ok: !0, summary: "read" }), { call: { ...h, tool: "check_address", input: { ...h.input, address: h.input.issuer } }, result: u, gatedFrom: h };
      }
      if (!p.ok && h.tool === "read_settlement" && !p.gated) {
        const u = await me("read_token_rights", { token_id: h.input.hash }, t);
        if (u.ok)
          return o({ kind: "tool", name: "read_token_rights", input: { token_id: h.input.hash }, ok: !0, summary: "read" }), { call: { ...h, tool: "read_token_rights" }, result: u };
      }
      return o({
        kind: "tool",
        name: h.tool,
        input: h.input,
        ok: p.ok,
        summary: p.ok ? "read" : p.error
      }), { call: h, result: p };
    })
  ), r = [];
  for (const h of i) {
    const { call: p, result: f } = h, u = Q(p.tool)?.screen ?? p.tool;
    f.ok && "gatedFrom" in h ? r.push(
      `${ct(p.tool, f.value)}

That is the free address check. The six issuer checks with a GO/HOLD/NO-GO certificate need Pro in the app, and are free on the website without an account: https://www.noshashi.app/certificate/`
    ) : f.ok ? r.push(ct(p.tool, f.value)) : f.gated ? r.push(
      p.tool === "certify_authority" ? `${u}: ${f.error} The same six issuer checks are free on the website, without an account: https://www.noshashi.app/certificate/ (paste ${String(p.input.issuer ?? "the issuer address")}).` : `${u}: ${f.error} It is available after upgrading in Pricing.`
    ) : Q(p.tool)?.compose ? r.push(`${u}: ${f.error}`) : r.push(`${u}: could not be read. ${f.error}`);
  }
  let c = "";
  if (s.knowledge) {
    const h = await Tt(e, 5).catch(() => []);
    if (o({ kind: "tool", name: "search_noshashi", input: { query: e.slice(0, 60) }, ok: h.length > 0, summary: h.length ? `${h.length} passages` : "nothing matched" }), c = Va(e, h), Wa.test(e)) {
      const p = Ga(e);
      p.length > 0 && (c += `${c ? `

` : ""}Where in NOSHASHI:
${p.map((f) => `→ ${f.name} (${f.plan}): ${f.summary}`).join(`
`)}`);
    }
  }
  s.note && r.unshift(s.note);
  const l = r.join(`

`);
  let d = [l, c].filter(Boolean).join(`

`);
  return d || (d = "I could not find that in NOSHASHI's pages, and the question names nothing I can read from the ledger. Name an address (r…), an issuer and currency, or a 64-character transaction hash, or ask about a NOSHASHI screen, plan or feature."), { text: d, steps: a, plan: s, facts: l };
}
const U = {
  support: "support@noshashi.app",
  institutions: "institutions@noshashi.app",
  security: "security@noshashi.app",
  privacy: "privacy@noshashi.app",
  form: "/contact/"
}, Ae = [
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
    a: `The contact form reaches the team directly. For specific routes: ${U.support} for product support, ${U.institutions} for institutional enquiries, ${U.security} for vulnerability reports and ${U.privacy} for data questions.`,
    links: [{ label: "Contact form", href: "/contact/" }]
  }
], Qa = new Set(
  "a an the is are was were be been do does did can could would should i you it this that of for to in on at by with my your our we us and or if how what when where why not no yes please tell me about".split(" ")
);
function we(e) {
  return String(e || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !Qa.has(t));
}
function Za(e) {
  const t = we(e);
  return t.length ? Ae.map((n) => {
    const s = new Set(n.keywords), a = new Set(we(n.q)), o = new Set(we(n.a));
    let i = 0;
    for (const r of t)
      s.has(r) ? i += 3 : a.has(r) ? i += 2 : o.has(r) ? i += 0.5 : [...s].some((c) => c.startsWith(r) || r.startsWith(c)) && (i += 1.5);
    return { entry: n, score: i };
  }).filter((n) => n.score > 0).sort((n, s) => s.score - n.score) : [];
}
const lt = 3;
function eo(e) {
  const t = Za(e), n = t[0];
  if (!n || n.score < lt)
    return {
      grounded: !1,
      text: "I can answer questions about pricing, downloads and verification, what the paid tiers add, privacy and security posture, billing, and the XRPL data the product reads. I don't have a confident answer to that one — rather than guess, send it to the team and you'll get a real answer.",
      links: [{ label: "Contact the team", href: U.form }],
      matched: t.slice(0, 3).map((a) => a.entry.id)
    };
  const s = t.slice(1, 3).filter((a) => a.score > lt * 0.8).map((a) => a.entry.q);
  return {
    grounded: !0,
    text: n.entry.a,
    links: n.entry.links || [],
    related: s,
    matched: [n.entry.id]
  };
}
const dt = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz", to = /\bs[1-9A-HJ-NP-Za-km-z]{24,34}\b/g;
function no(e) {
  const t = [0];
  for (const o of e) {
    const i = dt.indexOf(o);
    if (i < 0) return null;
    let r = i;
    for (let c = t.length - 1; c >= 0; c -= 1)
      r += t[c] * 58, t[c] = r & 255, r >>= 8;
    for (; r > 0; )
      t.unshift(r & 255), r >>= 8;
  }
  let n = 0;
  for (; n < e.length && e[n] === dt[0]; ) n += 1;
  let s = 0;
  for (; s < t.length && t[s] === 0; ) s += 1;
  const a = new Uint8Array(n + t.length - s);
  return a.set(t.slice(s), n), a;
}
async function so(e) {
  const t = e.slice(0, e.length - 4), n = await crypto.subtle.digest("SHA-256", t), s = new Uint8Array(await crypto.subtle.digest("SHA-256", n));
  return e.slice(e.length - 4).every((o, i) => o === s[i]);
}
async function ao(e) {
  const t = no(e);
  if (!t) return !1;
  const n = t.length === 21 && t[0] === 33, s = t.length === 23 && t[0] === 1 && t[1] === 225 && t[2] === 75;
  return !n && !s ? !1 : so(t);
}
async function oo(e) {
  for (const t of e.matchAll(to))
    if (await ao(t[0])) return !0;
  return !1;
}
class io extends Error {
  constructor() {
    super(
      "That message contains an XRPL secret seed, so it was not sent. NOSHASHI never needs a seed. Treat this one as exposed: move the funds to a new account and stop using it."
    ), this.name = "SecretInMessageError";
  }
}
const Et = 10, Ft = "noshashi:web.checks", ke = () => {
  const e = /* @__PURE__ */ new Date();
  return `${e.getUTCFullYear()}-${String(e.getUTCMonth() + 1).padStart(2, "0")}`;
};
function ro() {
  try {
    const e = JSON.parse(localStorage.getItem(Ft) ?? "null");
    if (e && e.month === ke() && typeof e.count == "number" && Number.isFinite(e.count))
      return { month: e.month, count: Math.max(0, e.count) };
  } catch {
  }
  return { month: ke(), count: 0 };
}
let Rt = 0;
function ut(e) {
  Rt = e;
  try {
    localStorage.setItem(Ft, JSON.stringify({ month: ke(), count: e }));
  } catch {
  }
}
const Se = () => Math.max(ro().count, Rt), co = {
  has: () => !1,
  spendFreeCheck: () => {
    const e = Se();
    return e >= Et ? !1 : (ut(e + 1), !0);
  },
  refundFreeCheck: () => ut(Math.max(0, Se() - 1))
}, $e = "Support › ";
_s(
  Ae.map((e) => ({
    title: `${$e}${e.q}`,
    source: "noshashi.app support",
    text: `${e.q}
${e.a}`,
    // Written for exactly the questions visitors ask, so they lead a close call.
    weight: 1.25
  }))
);
const be = { label: "Contact the team", href: U.form };
function lo(e) {
  const t = /\n\nSources?: ([^\n]+)/.exec(e);
  if (!t) return { body: e, links: [] };
  const n = [];
  let s;
  for (const a of t[1].split("; ")) {
    const o = a.lastIndexOf(" · "), i = o >= 0 ? a.slice(0, o) : a, r = o >= 0 ? a.slice(o + 3) : "";
    i.startsWith($e) && (s = i.slice($e.length));
    const c = /^https:\/\/www\.noshashi\.app(\/[^\s]*)?$/.exec(r);
    if (!c) continue;
    const l = c[1] ?? "/";
    if (n.some((h) => h.href.split("#")[0] === l.split("#")[0])) continue;
    const d = (i.split(" › ").pop() ?? i).replace(/^NOSHASHI — /, "").trim();
    n.push({ label: d.length > 38 ? `${d.slice(0, 36)}…` : d, href: l });
  }
  return { body: e.replace(t[0], ""), links: n.slice(0, 3), support: s };
}
async function po(e, t) {
  const n = String(e ?? "").trim().slice(0, 600);
  if (!n)
    return { text: "Ask a question about NOSHASHI, or paste an XRPL address, token id or transaction hash.", steps: [], links: [], related: [], source: "none" };
  if (await oo(n))
    return { text: new io().message, steps: [], links: [], related: [], source: "refused" };
  const s = It(n).calls.length > 0, a = [];
  let o = !1;
  try {
    const i = await Ja(n, co, (f) => {
      if (f.kind !== "tool") return;
      if (f.name === "search_noshashi") {
        o = f.ok;
        return;
      }
      const u = { reader: uo[f.name] ?? f.name, ok: f.ok, summary: f.summary };
      a.push(u), t?.(u);
    });
    if (!i.facts && !o)
      return { text: eo(n).text, steps: a, links: [be], related: [], source: "none" };
    const { body: r, links: c, support: l } = lo(i.text), d = l ? Ae.find((f) => f.q === l) : void 0, h = r.includes("https://www.noshashi.app/certificate/") ? [{ label: "Free issuer certificate", href: "/certificate/" }] : [], p = [...d?.links ?? [], ...h, ...c];
    return {
      text: r,
      steps: a,
      links: p.some((f) => f.href === U.form) ? p.slice(0, 4) : [...p.slice(0, 3), be],
      related: [],
      source: i.facts ? "ledger" : d ? "support" : "pages"
    };
  } catch (i) {
    return {
      text: `NOSHX could not finish that: ${i instanceof Error ? i.message : "an unexpected error"}. Try again, or contact the team.`,
      steps: a,
      links: [be],
      related: [],
      source: s ? "ledger" : "none"
    };
  }
}
const uo = {
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
}, fo = () => Math.max(0, Et - Se()), go = () => Ns();
export {
  po as ask,
  fo as checksLeft,
  go as prewarm,
  lo as splitSources
};
