var Yt = Object.defineProperty;
var Vt = (e, t, n) => t in e ? Yt(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n;
var N = (e, t, n) => Vt(e, typeof t != "symbol" ? t + "" : t, n);
function ce(e) {
  const t = Number(e) / 1e6;
  return Number.isFinite(t) ? t.toFixed(6).replace(/\.?0+$/, "") : "0";
}
function Tt(e) {
  return new Date((e + 946684800) * 1e3);
}
function U(e) {
  if (!/^[0-9A-F]{40}$/i.test(e)) return e;
  const t = (e.match(/../g) ?? []).map((n) => String.fromCharCode(parseInt(n, 16))).join("").replace(/\0+$/, "").trim();
  return t && /^[\x20-\x7E]+$/.test(t) ? t : e;
}
const Jt = /* @__PURE__ */ new Set(["slowDown", "tooBusy"]), Qt = /* @__PURE__ */ new Set(["noNetwork", "noCurrent", "noClosed", "notReady", "disconnected"]), Zt = 4, en = 3, Ce = 1e3, tn = 8e3, nn = "Public XRPL servers are limiting requests from this network right now. NOSHASHI slowed down and retried on more than one server. Wait a minute and try again; nothing was decided on a partial read.", sn = {
  now: () => Date.now(),
  sleep: (e) => new Promise((t) => setTimeout(t, e))
};
class an {
  constructor(t, n, s = sn, a = () => Math.random() * 250) {
    N(this, "rotate");
    N(this, "giveUp");
    N(this, "clock");
    N(this, "jitter");
    N(this, "inFlight", 0);
    N(this, "waiting", []);
    N(this, "coolUntil", 0);
    N(this, "streak", 0);
    this.rotate = t, this.giveUp = n, this.clock = s, this.jitter = a;
  }
  /** Outstanding commands, for tests and diagnostics. */
  get pending() {
    return this.inFlight;
  }
  /** How long new commands are held back from now, in ms. */
  coolingFor() {
    return Math.max(0, this.coolUntil - this.clock.now());
  }
  async acquire() {
    for (; ; ) {
      const t = this.coolingFor();
      if (t > 0) {
        await this.clock.sleep(t);
        continue;
      }
      if (this.inFlight < Zt) {
        this.inFlight += 1;
        return;
      }
      await new Promise((n) => this.waiting.push(n));
    }
  }
  release() {
    this.inFlight -= 1, this.waiting.shift()?.();
  }
  throttled() {
    this.streak += 1;
    const t = Math.min(tn, Ce * 2 ** (this.streak - 1)) + this.jitter();
    this.coolUntil = Math.max(this.coolUntil, this.clock.now() + t), this.streak % 2 === 0 && this.rotate();
  }
  /**
   * Run one read through the pacer. `send` issues the command once and
   * rejects with an error carrying the server's `code`.
   */
  async run(t) {
    for (let n = 0; ; n += 1) {
      await this.acquire();
      let s;
      try {
        const r = await t();
        return this.streak = 0, r;
      } catch (r) {
        s = r;
      } finally {
        this.release();
      }
      const a = s?.code ?? "", o = Jt.has(a);
      if (!o && !Qt.has(a)) throw s;
      if (o ? this.throttled() : await this.clock.sleep(Ce + this.jitter()), n >= en)
        throw o ? this.giveUp(nn, a) : s;
    }
  }
}
const se = [
  "wss://xrplcluster.com",
  "wss://s1.ripple.com",
  "wss://s2.ripple.com"
], _t = 12e3, on = /* @__PURE__ */ new Set(["gateway_balances", "account_lines"]), rn = 45e3, cn = (e) => on.has(e) ? rn : _t, dn = 2e4;
class F extends Error {
  constructor(n, s) {
    super(n);
    N(this, "code");
    this.code = s, this.name = "XrplError";
  }
}
class ln {
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
    // Every read goes through the pacer: bounded concurrency, and a cool-down
    // plus retry (then the next server) when a public node says slowDown.
    N(this, "pacer", new an(
      () => {
        this.reconnect();
      },
      (t, n) => new F(t, n)
    ));
  }
  /** Round-trip time of the most recent successful command. */
  getLatencyMs() {
    return this.latencyMs;
  }
  isConnected() {
    return this.connected;
  }
  /** The public server this link uses now, or will try next. */
  currentEndpoint() {
    return se[this.endpointIndex % se.length];
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
      window.clearTimeout(n.timer), n.reject(new F("Connection reset", "disconnected"));
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
      const s = se[this.endpointIndex % se.length];
      let a;
      try {
        a = new WebSocket(s);
      } catch (r) {
        this.connecting = null, n(r instanceof Error ? r : new Error(String(r)));
        return;
      }
      this.socket = a;
      const o = window.setTimeout(() => {
        a.close();
      }, _t);
      a.onopen = () => {
        window.clearTimeout(o), this.attempt = 0, this.connecting = null, this.setConnected(!0), a.send(
          JSON.stringify({
            id: this.nextId++,
            command: "subscribe",
            streams: ["ledger", "transactions"]
          })
        ), t(a);
      }, a.onmessage = (r) => this.handleMessage(r), a.onerror = () => {
        window.clearTimeout(o);
      }, a.onclose = () => {
        window.clearTimeout(o), this.connecting = null, this.socket = null, this.setConnected(!1);
        for (const [, r] of this.pending)
          window.clearTimeout(r.timer), r.reject(new F("Connection closed", "disconnected"));
        this.pending.clear(), n(new F("Connection closed", "disconnected")), this.scheduleReconnect();
      };
    }), this.connecting);
  }
  scheduleReconnect() {
    if (this.streamHandlers.size === 0 && this.pending.size === 0) return;
    window.clearTimeout(this.retryTimer), this.endpointIndex += 1, this.attempt += 1;
    const t = Math.min(dn, 1e3 * 2 ** Math.min(this.attempt - 1, 4));
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
          new F(
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
  /** Issue a rippled command and await its response, paced. */
  request(t, n = {}) {
    return this.pacer.run(() => this.send(t, n));
  }
  async send(t, n = {}) {
    const s = await this.ensureSocket(), a = this.nextId++, o = performance.now();
    return new Promise((r, i) => {
      const c = window.setTimeout(() => {
        this.pending.delete(a), i(new F(`Timed out: ${t}`));
      }, cn(t));
      this.pending.set(a, {
        resolve: (d) => {
          this.latencyMs = Math.max(1, Math.round(performance.now() - o)), r(d);
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
const un = new ln();
async function S(e, t = {}) {
  return un.request(e, t);
}
async function hn() {
  const [e, t] = await Promise.all([
    S("ledger", { ledger_index: "validated", transactions: !1, expand: !1 }),
    S("fee").catch(() => ({}))
  ]), n = e.ledger ?? {};
  return {
    ledgerIndex: Number(n.ledger_index ?? e.ledger_index ?? 0),
    ledgerHash: String(n.ledger_hash ?? ""),
    closeTime: Tt(Number(n.close_time ?? 0)).toLocaleString(),
    validated: !!(e.validated ?? !1),
    baseFeeXrp: ce(Number(t.drops?.base_fee ?? 10)),
    openLedgerFeeXrp: ce(Number(t.drops?.open_ledger_fee ?? 10)),
    queueSize: Number(t.current_queue_size ?? 0),
    txnCount: Number(n.transactions?.length ?? 0)
  };
}
function de(e) {
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
function fn(e) {
  return { address: e, balanceXrp: "0.00", sequence: 0, ownerCount: 0, unfunded: !0 };
}
async function gn(e, t = "validated") {
  try {
    const s = (await S("account_info", {
      account: e,
      ledger_index: t
    })).account_data ?? {};
    return {
      address: e,
      balanceXrp: (Number(s.Balance ?? 0) / 1e6).toFixed(2),
      sequence: Number(s.Sequence ?? 0),
      ownerCount: Number(s.OwnerCount ?? 0),
      domain: de(String(s.Domain ?? ""))
    };
  } catch (n) {
    if (n instanceof F && n.code === "actNotFound") return fn(e);
    throw n instanceof F && n.code === "actMalformed" ? new F(
      "Address failed its base58 checksum — check for a mistyped character.",
      "actMalformed"
    ) : n;
  }
}
async function pn(e, t = "validated") {
  return ((await S("account_objects", {
    account: e,
    ledger_index: t,
    type: "credential",
    limit: 100
  })).account_objects ?? []).map((a) => ({
    subject: String(a.Subject ?? ""),
    issuer: String(a.Issuer ?? ""),
    credentialType: de(String(a.CredentialType ?? "")) ?? String(a.CredentialType ?? "UNKNOWN"),
    // XLS-70 marks acceptance with the lsfAccepted flag (0x00010000).
    accepted: (Number(a.Flags ?? 0) & 65536) !== 0,
    revoked: !!(a.Revoked ?? !1),
    uri: a.URI ? de(String(a.URI)) : void 0,
    expiration: a.Expiration ? Number(a.Expiration) : void 0
  }));
}
async function mn(e, t = 40) {
  try {
    return ((await S("account_tx", {
      account: e,
      ledger_index_min: -1,
      ledger_index_max: -1,
      binary: !1,
      forward: !1,
      limit: t
    })).transactions ?? []).map((a) => {
      const o = a.tx ?? a.tx_json ?? {}, r = a.meta ?? {}, i = r.delivered_amount ?? r.DeliveredAmount, c = typeof i == "string" ? Number(ce(i)) : void 0, d = String(o.Account ?? ""), l = String(o.Destination ?? ""), h = d === e ? "out" : l === e ? "in" : "cross", g = Tt(Number(o.date ?? 0));
      return {
        hash: String(o.hash ?? a.hash ?? ""),
        transactionType: String(o.TransactionType ?? "UNKNOWN"),
        result: String(r.TransactionResult ?? "—"),
        ledgerIndex: Number(a.ledger_index ?? o.ledger_index ?? 0),
        date: g.toLocaleString(),
        timestamp: g.getTime(),
        direction: h,
        counterparty: h === "out" ? l || "—" : d || "—",
        amountXrp: c,
        feeXrp: ce(String(o.Fee ?? "0"))
      };
    });
  } catch (n) {
    if (n instanceof F && n.code === "actNotFound") return [];
    throw n;
  }
}
function yn(e) {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(e.trim());
}
const wn = 262144, bn = 4194304, vn = 2097152, kn = 1048576;
async function Sn(e) {
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
    if (t instanceof F && t.code === "actNotFound") return [];
    throw t;
  }
}
async function xt(e) {
  try {
    const n = (await S("account_info", {
      account: e,
      ledger_index: "validated"
    })).account_data ?? {}, s = Number(n.Flags ?? 0), a = Number(n.TransferRate ?? 0), o = a > 1e9 ? Math.round((a - 1e9) / 1e9 * 1e4) : 0;
    return {
      address: e,
      domain: de(String(n.Domain ?? "")),
      noFreeze: (s & vn) !== 0,
      globalFreeze: (s & bn) !== 0,
      requireAuth: (s & wn) !== 0,
      masterDisabled: (s & kn) !== 0,
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
async function $n(e) {
  try {
    const t = await S("gateway_balances", {
      account: e,
      ledger_index: "validated"
    }), n = t.obligations ?? {}, s = {};
    for (const [a, o] of Object.entries(n)) {
      const r = Number(o);
      Number.isFinite(r) && (s[a] = r);
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
const Tn = "https://xiurbiwuwcfowqnpmwki.supabase.co", ue = `${Tn}/functions/v1`, Pe = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
async function ne(e, t) {
  const n = [...new Set(e.filter((s) => Pe.test(s)))].slice(0, 50);
  if (n.length === 0) return { hits: {}, listAsOf: null, listed: 0 };
  try {
    const s = await fetch(`${ue}/noshashi-xrpl-watch/sanctions?addresses=${n.join(",")}`, {
      signal: t ?? AbortSignal.timeout(8e3)
    });
    if (!s.ok) return null;
    const a = await s.json(), o = {};
    for (const r of a.hits ?? []) Pe.test(r.address) && (o[r.address] = r);
    return { hits: o, listAsOf: a.list_as_of ?? null, listed: Number(a.listed ?? 0) };
  } catch {
    return null;
  }
}
function _n(e, t) {
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
function fe(e, t) {
  const n = _n(e.address, t);
  if (!n) return e;
  const s = [n, ...e.findings], a = t?.hits[e.address], o = a ? "avoid" : e.verdict;
  return {
    ...e,
    findings: n.severity === "ok" ? [...e.findings, n] : s,
    verdict: o,
    headline: a ? ee.avoid.label : e.headline,
    sanction: a,
    sanctionsChecked: t !== null,
    sanctionsAsOf: t?.listAsOf ?? null
  };
}
const ee = {
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
}, xn = 60;
async function An(e) {
  const t = e.trim(), n = {
    address: t,
    verdict: "unknown",
    headline: ee.unknown.label,
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
  if (!yn(t))
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
  const [s, a] = await Promise.all([gn(t).catch(() => null), ne([t])]);
  if (!s)
    return a?.hits[t] ? fe(n, a) : n;
  if (s.unfunded)
    return fe({
      ...n,
      exists: !0,
      funded: !1,
      domain: s.domain,
      verdict: "caution",
      headline: ee.caution.label,
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
  const [o, r, i] = await Promise.all([
    pn(t).catch(() => []),
    Sn(t).catch(() => []),
    mn(t, xn).catch(() => [])
  ]), c = await $n(t).catch(() => null), h = Object.keys(c?.obligations ?? {}).length > 0 ? await xt(t).catch(() => {
  }) : void 0;
  return fe(
    Nn({
      address: t,
      account: s,
      credentials: o,
      lines: r,
      transactions: i,
      obligations: c,
      posture: h
    }),
    a
  );
}
function Nn(e) {
  const { address: t, account: n, credentials: s, lines: a, transactions: o, obligations: r, posture: i } = e, c = Object.keys(r?.obligations ?? {}), d = c.length > 0, l = [];
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
    detail: `Outstanding: ${c.slice(0, 6).map((m) => `${m} ${Math.round(r?.obligations[m] ?? 0).toLocaleString()}`).join(" · ")}`
  }));
  const h = a.filter((m) => m.frozenByIssuer || m.deepFrozenByIssuer);
  h.length > 0 && l.push({
    id: "freezes-others",
    severity: "warn",
    title: `Has frozen ${h.length} counterpart${h.length === 1 ? "y" : "ies"}`,
    detail: "This account has used freeze against people it deals with. That may be entirely legitimate — a sanctions response, for instance — but it demonstrates both the willingness and the ability to do it."
  });
  const g = new Set(
    o.map((m) => m.counterparty).filter(Boolean)
  );
  o.length === 0 ? l.push({
    id: "no-history",
    severity: "warn",
    title: "No recent transaction history",
    detail: "The account is funded but nothing recent is visible. A shop asking for payment should have a trail."
  }) : l.push({
    id: "history",
    severity: "info",
    title: `${o.length} recent transactions across ${g.size} counterparties`,
    detail: g.size <= 2 ? "Almost all activity is with the same one or two addresses, which is unusual for a business." : "Activity is spread across a range of counterparties."
  });
  const f = l.reduce((m, y) => {
    const w = { critical: 3, warn: 2, info: 1, ok: 0 };
    return w[y.severity] > w[m] ? y.severity : m;
  }, "ok"), u = f === "critical" ? "avoid" : f === "warn" ? "caution" : "clear";
  return {
    address: t,
    verdict: u,
    headline: ee[u].label,
    findings: l.sort((m, y) => {
      const w = { critical: 0, warn: 1, info: 2, ok: 3 };
      return w[m.severity] - w[y.severity];
    }),
    exists: !0,
    funded: !0,
    balanceXrp: Number(n.balanceXrp),
    domain: n.domain,
    activityCount: o.length,
    isIssuer: d,
    issuedCurrencies: c,
    posture: i,
    credentials: s,
    sanctionsChecked: !1,
    ledgerIndex: r?.ledgerIndex ?? 0,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const In = 946684800;
function Le(e) {
  return new Date((e + In) * 1e3);
}
const En = 1048576;
function Fn(e, t) {
  const n = e.map((a) => a.weight).sort((a, o) => o - a);
  let s = 0;
  for (let a = 0; a < n.length; a += 1)
    if (s += n[a], s >= t) return a + 1;
  return 1 / 0;
}
function Rn(e) {
  const t = Array.isArray(e?.signer_lists) ? e.signer_lists : Array.isArray(e?.account_data?.signer_lists) ? e.account_data.signer_lists : null;
  return t ? { list: t[0] } : { unreadable: "the server did not return signer_lists" };
}
async function At(e) {
  const [t, n, s] = await Promise.all([
    // signer_lists: true, NOT account_objects { type: "signer_list" }. The
    // typed account_objects query pages through the whole owner directory,
    // and with limit 10 it returned an empty page for RLUSD's issuer (19
    // owned objects, the list further on), so its 26-member signer list
    // read as absent. Found live on 2026-10-11; mirrored in
    // api/_lib/authority.js.
    S("account_info", { account: e, ledger_index: "validated", signer_lists: !0 }),
    S("server_info").catch(() => ({})),
    S("account_objects", {
      account: e,
      type: "escrow",
      ledger_index: "validated",
      limit: 200
    }).catch(() => ({}))
  ]), a = t.account_data ?? {}, o = Number(a.Flags ?? 0), r = n.info?.validated_ledger ?? {}, { list: i, unreadable: c } = Rn(t), d = { __unreadable: c }, l = (i?.SignerEntries ?? []).map((p) => ({
    account: String(p.SignerEntry?.Account ?? ""),
    weight: Number(p.SignerEntry?.SignerWeight ?? 0)
  })).filter((p) => p.account), h = Number(i?.SignerQuorum ?? 0), g = l.reduce((p, v) => p + v.weight, 0), u = (s.account_objects ?? []).filter((p) => typeof p.Amount == "string").map((p) => ({
    amountXrp: Number(p.Amount) / 1e6,
    finishAfter: p.FinishAfter !== void 0 ? Le(Number(p.FinishAfter)).toISOString() : void 0,
    cancelAfter: p.CancelAfter !== void 0 ? Le(Number(p.CancelAfter)).toISOString() : void 0,
    destination: p.Destination ? String(p.Destination) : void 0
  })), m = Number(a.OwnerCount ?? 0), y = Number(r.reserve_base_xrp ?? 1), w = Number(r.reserve_inc_xrp ?? 0.2);
  return {
    address: e,
    masterKeyEnabled: (o & En) === 0,
    regularKey: a.RegularKey ? String(a.RegularKey) : void 0,
    signers: {
      present: l.length > 0,
      unreadable: d.__unreadable ? String(d.__unreadable) : void 0,
      quorum: h,
      signers: l,
      totalWeight: g,
      minimumSigners: l.length > 0 ? Fn(l, h) : 0,
      unilateralSigners: l.filter((p) => h > 0 && p.weight >= h).map((p) => p.account)
    },
    ownerCount: m,
    reserveBaseXrp: y,
    reserveIncrementXrp: w,
    reserveLockedXrp: y + m * w,
    balanceXrp: Number(a.Balance ?? 0) / 1e6,
    escrows: u,
    escrowedXrp: u.reduce((p, v) => p + v.amountXrp, 0),
    truncated: !!s.marker,
    ledgerIndex: Number(t.ledger_index ?? 0),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function On(e) {
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
    const { quorum: a, totalWeight: o, minimumSigners: r, signers: i, unilateralSigners: c } = e.signers;
    r === 1 / 0 ? t.push({
      id: "quorum-unreachable",
      severity: "critical",
      title: "Quorum can never be met",
      detail: `Quorum is ${a} but the signers' weights total only ${o}. No combination of the configured signers can authorise a transaction.`,
      action: "Lower the quorum or add weight before this account needs to move."
    }) : r === 1 ? t.push({
      id: "effective-single",
      severity: "critical",
      title: `${i.length} signers, but one can act alone`,
      detail: `Quorum is ${a} and at least one signer carries that weight by themselves${c.length ? ` (${c.length} of them can)` : ""}. XRPL compares quorum against the sum of signing weights, not a count of signers, so this list provides no second approval in practice.`,
      action: "Rebalance the weights so no single signer reaches quorum unaided."
    }) : t.push({
      id: "quorum-ok",
      severity: "ok",
      title: `Requires at least ${r} of ${i.length} signers`,
      detail: `Quorum ${a} against a total weight of ${o}. Taking the heaviest signers first, ${r} must agree before anything moves.`
    });
  }
  const n = e.balanceXrp - e.reserveLockedXrp - e.escrowedXrp;
  if (t.push({
    id: "reserve",
    severity: "info",
    title: `${e.reserveLockedXrp.toLocaleString(void 0, { maximumFractionDigits: 1 })} XRP locked by reserve`,
    detail: `${e.reserveBaseXrp} XRP base plus ${e.ownerCount.toLocaleString()} owned objects at ${e.reserveIncrementXrp} XRP each. This is not spendable while those objects exist — every trust line, offer and escrow adds to it.`
  }), e.escrows.length > 0) {
    const a = e.escrows.filter((o) => o.finishAfter).sort((o, r) => o.finishAfter < r.finishAfter ? -1 : 1)[0];
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
const Nt = 946684800, Dn = 32570, Xe = 10;
function Cn(e, t) {
  const n = [];
  for (const s of e) {
    const a = s.tx_json ?? s.tx ?? s;
    if (a.Account !== t) continue;
    const o = Number(s.ledger_index ?? a.ledger_index ?? 0), r = Number(a.date), i = Number.isFinite(r) ? new Date((r + Nt) * 1e3) : void 0;
    if (a.TransactionType === "SetRegularKey") {
      const c = !!a.RegularKey;
      n.push({
        ledgerIndex: o,
        at: i,
        kind: c ? "regular-key-set" : "regular-key-removed",
        label: c ? "A regular key was assigned — a second key able to sign" : "The regular key was removed"
      });
    } else if (a.TransactionType === "SignerListSet") {
      const c = Number(a.SignerQuorum ?? 0) === 0;
      n.push({
        ledgerIndex: o,
        at: i,
        kind: c ? "signer-list-removed" : "signer-list-set",
        label: c ? "The signer list was deleted — multi-party approval ended" : "A signer list was configured or replaced"
      });
    } else a.TransactionType === "AccountSet" && (Number(a.SetFlag) === 4 ? n.push({
      ledgerIndex: o,
      at: i,
      kind: "master-key-disabled",
      label: "The master key was disabled"
    }) : Number(a.ClearFlag) === 4 && n.push({
      ledgerIndex: o,
      at: i,
      kind: "master-key-enabled",
      label: "The master key was re-enabled"
    }));
  }
  return n.sort((s, a) => s.ledgerIndex - a.ledgerIndex);
}
function Pn(e, t) {
  return e >= t ? e - t : Math.max(0, e - 1);
}
async function Ln(e) {
  let t;
  try {
    t = await S("account_info", { account: e, ledger_index: "validated" });
  } catch (b) {
    throw b instanceof F && b.code === "actNotFound" ? new Error(
      "That address is not funded, so no account exists for it yet. An XRPL address only becomes an account once someone sends it enough XRP to meet the reserve — until then it has no history to read."
    ) : b instanceof F && b.code === "actMalformed" ? new Error("That is not a well-formed XRPL address.") : b;
  }
  const n = t.account_data ?? {}, s = Number(n.Sequence ?? 0);
  let a;
  try {
    const b = await S("server_info", {}), $ = String(b.info?.complete_ledgers ?? ""), _ = Number($.split("-")[0]);
    Number.isFinite(_) && (a = _);
  } catch {
  }
  let o;
  const r = [];
  let i = !1, c;
  for (let b = 0; b < Xe; b += 1) {
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
      b > 0 && (i = !0);
      break;
    }
    const _ = $.transactions ?? [];
    if (o || (o = _[0]), r.push(..._), c = $.marker, !c) break;
    b === Xe - 1 && (i = !0);
  }
  const d = o?.tx_json ?? o?.tx ?? {}, l = Number(o?.ledger_index ?? d.ledger_index ?? 0) || void 0, h = Number(d.date), g = Number.isFinite(h) ? new Date((h + Nt) * 1e3) : void 0, f = d.TransactionType ? String(d.TransactionType) : void 0, u = f === "Payment" && d.Destination === e && d.Account !== e, m = u ? String(d.Account) : void 0, y = d.Amount ?? d.DeliverMax, w = u && typeof y == "string" ? Number(y) / 1e6 : void 0, p = l === void 0 ? void 0 : Pn(s, l), v = l !== void 0 && a !== void 0 && a > Dn && l <= a, k = g ? Math.floor((Date.now() - g.getTime()) / 864e5) : void 0;
  return {
    address: e,
    balanceXrp: Number(n.Balance ?? 0) / 1e6,
    ownerCount: Number(n.OwnerCount ?? 0),
    sequence: s,
    originLedger: l,
    originDate: g,
    fundedBy: m,
    fundingAmountXrp: w,
    originType: f,
    approxSentCount: p,
    historyIncomplete: v,
    nodeHistoryFrom: a,
    ageDays: k,
    lastActivityLedger: Number(n.PreviousTxnLgrSeq ?? 0) || void 0,
    controlEvents: Cn(r, e),
    controlHistoryPartial: i,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const Xn = 30, Hn = 365;
function qn(e) {
  const t = [];
  if (e.historyIncomplete ? t.push({
    id: "history-incomplete",
    severity: "warn",
    title: "This account may be older than it appears",
    detail: `The earliest transaction found sits at ledger ${e.originLedger?.toLocaleString()}, which is the edge of what this node retains (from ${e.nodeHistoryFrom?.toLocaleString()}). Anything before that is not missing from the ledger, only from this node — so the age below is a floor, not a measurement.`,
    action: "Query a full-history node before treating the age as established."
  }) : e.originDate && e.ageDays !== void 0 && (e.ageDays < Xn ? t.push({
    id: "young-account",
    severity: "warn",
    title: `This account is ${e.ageDays} day${e.ageDays === 1 ? "" : "s"} old`,
    detail: `First seen ${e.originDate.toISOString().slice(0, 10)}. An account this new has no track record — nothing about its history can corroborate or contradict what its operator tells you.`,
    action: "Weight the counterparty's off-ledger identity accordingly."
  }) : e.ageDays >= Hn ? t.push({
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
const Un = 946684800, Mn = 0.5, zn = 0.25, ae = (e) => typeof e == "string" ? Number(e) / 1e6 : e && typeof e == "object" ? Number(e.value ?? 0) : 0;
function He(e, t, n) {
  const s = [];
  for (const r of e) {
    const i = ae(r.TakerGets), c = ae(r.TakerPays);
    if (i <= 0 || c <= 0) continue;
    const d = r.taker_gets_funded !== void 0 ? ae(r.taker_gets_funded) : i, l = r.taker_pays_funded !== void 0 ? ae(r.taker_pays_funded) : c, h = n ? i / c : c / i;
    if (!Number.isFinite(h) || h <= 0) continue;
    const g = n ? c : i, f = n ? l : d, u = Number.isFinite(f) ? Math.max(0, Math.min(f, g)) : 0, m = r.Expiration !== void 0 && Number(r.Expiration) < t;
    s.push({
      account: String(r.Account ?? ""),
      listed: g,
      fundable: m ? 0 : u,
      price: h,
      dead: m || u <= 0,
      expired: m
    });
  }
  s.sort((r, i) => n ? i.price - r.price : r.price - i.price);
  const a = s.reduce((r, i) => r + i.listed, 0), o = s.reduce((r, i) => r + i.fundable, 0);
  return {
    offers: s,
    listedDepth: a,
    fundableDepth: o,
    fundedRatio: a > 0 ? o / a : 1,
    deadOffers: s.filter((r) => r.dead).length,
    bestPrice: s.find((r) => !r.dead)?.price
  };
}
async function jn(e, t, n = 100) {
  const s = { currency: e, issuer: t }, [a, o, r] = await Promise.all([
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
  ]), i = Number(r.ledger?.close_time ?? 0), c = He(a.offers ?? [], i, !0), d = He(o.offers ?? [], i, !1), l = /* @__PURE__ */ new Map();
  for (const f of [...c.offers, ...d.offers])
    l.set(f.account, (l.get(f.account) ?? 0) + f.listed);
  const h = c.listedDepth + d.listedDepth, g = [...l.entries()].sort((f, u) => u[1] - f[1]);
  return {
    pair: `${e}/XRP`,
    currency: e,
    issuer: t,
    bids: c,
    asks: d,
    makers: l.size,
    topMakerShare: h > 0 && g[0] ? g[0][1] / h : 0,
    topMaker: g[0]?.[0],
    ledgerIndex: Number(r.ledger_index ?? r.ledger?.ledger_index ?? 0),
    ledgerCloseTime: new Date((i + Un) * 1e3),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function Bn(e) {
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
    d.fundedRatio < Mn ? t.push({
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
  e.topMakerShare >= zn && e.topMaker && t.push({
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
  const o = e.bids.bestPrice, r = e.asks.bestPrice;
  if (o !== void 0 && r !== void 0)
    if (o >= r)
      t.push({
        id: "crossed",
        severity: "warn",
        title: "The fundable touch is crossed",
        detail: `Best fundable bid ${o.toFixed(6)} is at or above best fundable ask ${r.toFixed(6)}. On a live book this resolves in moments, so it usually means the read caught a moment mid-cross rather than a standing arbitrage.`
      });
    else {
      const c = r - o;
      t.push({
        id: "spread",
        severity: "info",
        title: `Fundable spread ${(c / r * 100).toFixed(2)}%`,
        detail: `Between ${o.toFixed(6)} and ${r.toFixed(6)}, measured on offers that can actually fill. A spread taken from the advertised touch would be narrower and would not be tradeable.`
      });
    }
  const i = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((c, d) => i[c.severity] - i[d.severity]);
}
const Wn = 131072;
function qe(e) {
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
function ie(e) {
  if (e.kind === "xrp")
    return `${e.value.toLocaleString(void 0, { maximumFractionDigits: 6 })} XRP`;
  let t = e.currency;
  if (/^[0-9A-F]{40}$/i.test(t)) {
    const n = (t.match(/../g) ?? []).map((s) => String.fromCharCode(parseInt(s, 16))).join("").replace(/\0+$/, "").trim();
    n && /^[\x20-\x7E]+$/.test(n) && (t = n);
  }
  return `${e.value.toLocaleString(void 0, { maximumFractionDigits: 10 })} ${t}`;
}
function Gn(e, t) {
  return e.kind !== t.kind ? !1 : e.kind === "xrp" ? !0 : e.currency === t.currency && e.issuer === t.issuer;
}
async function Kn(e) {
  let t;
  try {
    t = await S("tx", { transaction: e.trim() });
  } catch (n) {
    throw n instanceof F && n.code === "txnNotFound" ? new Error(
      "No transaction with that hash is in this node's history. It may never have existed, or the node may not retain ledgers that far back."
    ) : n;
  }
  return Yn(t, e);
}
function Yn(e, t = "") {
  const n = e.tx_json ?? e, s = e.meta ?? e.metaData ?? {}, a = String(n.TransactionType ?? "unknown"), o = String(s.TransactionResult ?? "unknown"), r = Number(n.Flags ?? 0), i = a === "Payment" ? qe(n.DeliverMax ?? n.Amount) : void 0, c = s.delivered_amount ?? s.DeliveredAmount, d = c === "unavailable", l = d ? void 0 : qe(c);
  let h;
  return i && l && Gn(i, l) && i.value > 0 && (h = l.value / i.value), {
    hash: String(n.hash ?? e.hash ?? t),
    validated: e.validated === !0,
    transactionType: a,
    result: o,
    succeeded: o.startsWith("tes"),
    account: String(n.Account ?? ""),
    destination: n.Destination ? String(n.Destination) : void 0,
    ledgerIndex: Number(e.ledger_index ?? n.ledger_index ?? 0) || void 0,
    feeDrops: Number(n.Fee ?? 0),
    requested: i,
    delivered: l,
    deliveredUnavailable: d,
    partialFlagSet: (r & Wn) !== 0,
    deliveredFraction: h,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const Ue = 0.999999;
function Vn(e) {
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
    const s = e.deliveredFraction, a = s !== void 0 && s < Ue ? 1 / Math.max(s, Number.MIN_VALUE) : void 0;
    s !== void 0 && s < Ue ? t.push({
      id: "partial-shortfall",
      severity: "critical",
      title: `Only ${(s * 100).toFixed(4)}% of the requested amount arrived`,
      detail: `This payment is flagged tfPartialPayment and returned ${e.result}. It asked to deliver ${e.requested ? ie(e.requested) : "—"} and actually delivered ${e.delivered ? ie(e.delivered) : "—"}. Any system that credits the requested figure over-credits by roughly ${a && Number.isFinite(a) ? `${a.toFixed(0)}x` : "an unbounded factor"}.`,
      action: "Credit delivered_amount. The success code and the requested amount are both true and both irrelevant to what you received."
    }) : t.push({
      id: "partial-full",
      severity: "warn",
      title: "Partial payment permitted, but it delivered in full",
      detail: `The sender set tfPartialPayment, which allows the ledger to deliver less than requested. This time it delivered ${e.delivered ? ie(e.delivered) : "—"}, the full requested amount. The flag is a property of the sender's instruction, not of this outcome.`,
      action: "The same sender can send less next time under the same flag. Read delivered_amount every time."
    });
  } else e.delivered && t.push({
    id: "settled",
    severity: "ok",
    title: `Settled in full — ${ie(e.delivered)}`,
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
const Me = 1e5, ge = 1e3, It = 946684800;
function Jn(e) {
  if (typeof e == "number" && Number.isFinite(e))
    return new Date((e + It) * 1e3);
  if (typeof e != "string" || e.length === 0) return null;
  const t = e.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"), n = new Date(t);
  return Number.isNaN(n.getTime()) ? null : n;
}
function ze(e) {
  if (!e || typeof e != "object") return "XRP";
  const n = String(e.currency ?? "XRP");
  if (n === "XRP") return "XRP";
  if (/^[0-9A-F]{40}$/i.test(n)) {
    const s = (n.match(/../g) ?? []).map((a) => String.fromCharCode(parseInt(a, 16))).join("").replace(/\0+$/, "").trim();
    if (s && /^[\x20-\x7E]+$/.test(s)) return s;
  }
  return n;
}
async function Qn(e) {
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
  } catch (g) {
    throw g instanceof F && (g.code === "actNotFound" || g.code === "actMalformed") ? new Error(t) : g;
  }
  if (!n.amm) throw new Error(t);
  const a = n.amm, o = Number(s.ledger?.close_time ?? 0), r = new Date((o + It) * 1e3), i = a.vote_slots ?? [], c = i.reduce((g, f) => g + Number(f.vote_weight ?? 0), 0), d = i.map((g) => ({
    account: String(g.account ?? ""),
    votedFeePct: Number(g.trading_fee ?? 0) / ge,
    weightOfSupply: Number(g.vote_weight ?? 0) / Me,
    weightOfCast: c > 0 ? Number(g.vote_weight ?? 0) / c : 0
  })).sort((g, f) => f.weightOfSupply - g.weightOfSupply);
  let l;
  const h = a.auction_slot;
  if (h?.account) {
    const g = Jn(h.expiration);
    g && (l = {
      holder: String(h.account),
      discountedFeePct: Number(h.discounted_fee ?? 0) / ge,
      expiresAt: g,
      expired: g.getTime() < r.getTime(),
      pricePaid: Number(h.price?.value ?? 0),
      authAccounts: (h.auth_accounts ?? []).map((f) => String(f.account ?? "")).filter(Boolean)
    });
  }
  return {
    account: String(a.account ?? ""),
    pair: `${ze(a.amount)} / ${ze(a.amount2)}`,
    tradingFeePct: Number(a.trading_fee ?? 0) / ge,
    participation: c / Me,
    votes: d,
    auction: l,
    lpTokenSupply: Number(a.lp_token?.value ?? 0),
    // Preserved as undefined for XRP: absent means inapplicable, not false.
    assetFrozen: typeof a.asset_frozen == "boolean" ? a.asset_frozen : void 0,
    asset2Frozen: typeof a.asset2_frozen == "boolean" ? a.asset2_frozen : void 0,
    ledgerCloseTime: r,
    ledgerIndex: Number(s.ledger_index ?? s.ledger?.ledger_index ?? 0),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const Zn = 0.1, es = 0.5;
function ts(e) {
  const t = [], n = (o) => `${(o * 100).toFixed(2)}%`, s = e.votes[0];
  if (e.votes.length === 0 ? t.push({
    id: "no-votes",
    severity: "warn",
    title: "Nobody is voting on this pool's fee",
    detail: `All eight vote slots are empty, so the trading fee sits at ${e.tradingFeePct.toFixed(3)}% by default. The first liquidity provider to cast a vote sets it, at whatever weight they hold.`,
    action: "If you hold LP tokens here, your vote is currently unopposed."
  }) : s && s.weightOfCast >= es ? t.push({
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
  }), e.participation < Zn && e.votes.length > 0 && t.push({
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
      const r = o.discountedFeePct > 0 ? e.tradingFeePct / o.discountedFeePct : 1 / 0;
      t.push({
        id: "auction-active",
        severity: "warn",
        title: `${o.holder} is trading this pool at a discount right now`,
        detail: `The auction slot holder pays ${o.discountedFeePct.toFixed(3)}% while every other participant pays ${e.tradingFeePct.toFixed(3)}%${Number.isFinite(r) ? ` — ${r.toFixed(0)}x cheaper` : " — the holder trades free"}. The window closes ${o.expiresAt.toISOString().replace("T", " ").slice(0, 16)} UTC.${o.authAccounts.length > 0 ? ` ${o.authAccounts.length} further account${o.authAccounts.length === 1 ? " has" : "s have"} been nominated to share the discount.` : ""}`,
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
  for (const [o, r] of [
    ["First asset", e.assetFrozen],
    ["Second asset", e.asset2Frozen]
  ])
    r === !0 && t.push({
      id: `frozen-${o}`,
      severity: "critical",
      title: `${o} in this pair is frozen by its issuer`,
      detail: "A frozen asset cannot leave the pool. Liquidity in this AMM is not withdrawable while the freeze stands, regardless of what the pool balance shows.",
      action: "Do not treat this pool's depth as available liquidity."
    });
  const a = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((o, r) => a[o.severity] - a[r.severity]);
}
const je = 250, ns = 400, ss = 262144, as = 4194304, is = 2097152;
function os(e) {
  const t = e.reduce((n, s) => n + s, 0);
  return t <= 0 ? 0 : e.reduce((n, s) => n + (s / t * 100) ** 2, 0);
}
async function Et(e, t) {
  let n;
  const [s, a] = await Promise.all([
    S("account_info", { account: e, ledger_index: "validated" }),
    S("gateway_balances", { account: e, ledger_index: "validated" }).catch(
      (m) => (n = m instanceof Error ? m.message : "gateway_balances failed", {})
    )
  ]), o = s.account_data ?? {}, r = Number(o.Flags ?? 0), i = {};
  for (const [m, y] of Object.entries(
    a.obligations ?? {}
  )) {
    const w = Number(y);
    Number.isFinite(w) && (i[m] = w);
  }
  const c = [];
  let d, l = 0, h = !1, g;
  for (; l < je; ) {
    let m;
    try {
      m = await S("account_lines", {
        account: e,
        ledger_index: "validated",
        limit: ns,
        ...d ? { marker: d } : {}
      });
    } catch (y) {
      if (l === 0) throw y;
      g = y instanceof Error ? y.message : "the walk was interrupted", h = !0;
      break;
    }
    for (const y of m.lines ?? [])
      c.push({
        account: String(y.account ?? ""),
        currency: String(y.currency ?? ""),
        // From the issuer's side a holder's balance is reported negative.
        held: Math.abs(Number(y.balance ?? 0)),
        limit: Number(y.limit_peer ?? y.limit ?? 0),
        // Present-and-true, never absent-means-false.
        frozenByIssuer: y.freeze === !0,
        authorized: y.authorized === !0
      });
    if (d = m.marker, l += 1, !d) break;
    l >= je && (h = !0);
  }
  const u = (n ? [...new Set(c.map((m) => m.currency))] : Object.keys(i)).map((m) => {
    const y = c.filter((b) => b.currency === m), w = y.filter((b) => b.held > 0).sort((b, $) => $.held - b.held), p = w.map((b) => b.held), v = p.reduce((b, $) => b + $, 0), k = i[m] ?? 0;
    return {
      currency: m,
      outstanding: k,
      observedHeld: v,
      holders: y.length,
      activeHolders: w.length,
      hhi: os(p),
      topHolderPct: v > 0 ? (p[0] ?? 0) / v : 0,
      topFivePct: v > 0 ? p.slice(0, 5).reduce((b, $) => b + $, 0) / v : 0,
      frozenSeen: y.filter((b) => b.frozenByIssuer).length,
      authorizedSeen: y.filter((b) => b.authorized).length,
      coverage: k > 0 ? v / k : 0,
      top: w.slice(0, 10)
    };
  }).sort((m, y) => y.outstanding - m.outstanding || y.observedHeld - m.observedHeld);
  return {
    issuer: e,
    domain: o.Domain ? (() => {
      try {
        return decodeURIComponent(
          String(o.Domain).replace(/(..)/g, "%$1")
        );
      } catch {
        return;
      }
    })() : void 0,
    currencies: u,
    linesWalked: c.length,
    truncated: h,
    walkError: g,
    obligationsError: n,
    requiresAuth: (r & ss) !== 0,
    canFreeze: (r & is) === 0,
    globalFreeze: (r & as) !== 0,
    ledgerIndex: Number(s.ledger_index ?? 0),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const rs = 2500, Be = 0.95;
function cs(e) {
  const t = [];
  e.obligationsError && t.push({
    id: "obligations-unreadable",
    severity: "warn",
    title: "Outstanding supply could not be read",
    detail: `The public server did not answer gateway_balances for this issuer: ${e.obligationsError}. Large issuers can take longer than a public server allows. Holder lines were still read, but without the outstanding figure no coverage or concentration can be measured.`,
    action: "Run the survey again in a minute; a different public server often answers."
  }), e.walkError ? t.push({
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
    s.coverage < Be && t.push({
      id: `coverage-${s.currency}`,
      severity: "warn",
      title: `${s.currency}: holder lines account for only ${(s.coverage * 100).toFixed(1)}% of supply`,
      detail: `gateway_balances reports ${s.outstanding.toLocaleString(void 0, { maximumFractionDigits: 2 })} outstanding, but the holder lines read sum to ${s.observedHeld.toLocaleString(void 0, { maximumFractionDigits: 2 })}. Those come from different commands and should agree, so the gap is holders this walk did not see.`,
      action: "Trust the outstanding figure; treat the holder breakdown as incomplete."
    }), s.coverage >= Be ? s.hhi >= rs ? t.push({
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
const ds = /* @__PURE__ */ new Set([
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
]), ls = 946684800;
function us(e) {
  if (!/^([0-9A-F]{2})+$/i.test(e)) return e;
  const t = (e.match(/../g) ?? []).map((n) => String.fromCharCode(parseInt(n, 16))).join("").replace(/\0+$/, "").trim();
  return t && /^[\x20-\x7E]+$/.test(t) ? t : e;
}
function We(e) {
  return e.kind === "xrp" ? `${e.value.toLocaleString(void 0, { maximumFractionDigits: 6 })} XRP` : `${e.value.toLocaleString(void 0, { maximumFractionDigits: 6 })} ${U(e.currency)}`;
}
async function hs(e) {
  let t;
  try {
    t = await S("account_objects", {
      account: e,
      ledger_index: "validated",
      type: "check",
      limit: 200
    });
  } catch (o) {
    throw o instanceof F && o.code === "actNotFound" ? new Error(
      "That address is not funded, so it has no account and nothing can be addressed to it yet."
    ) : o;
  }
  const n = t.account_objects ?? [], s = n.filter((o) => o.Destination === e), a = /* @__PURE__ */ new Map();
  for (const o of s) {
    const r = o.SendMax;
    if (typeof r != "object" || !r?.issuer) continue;
    const i = `${r.issuer}|${r.currency}`;
    if (!a.has(i))
      try {
        const [c, d] = await Promise.all([
          S("gateway_balances", { account: r.issuer, ledger_index: "validated" }),
          S("account_info", { account: r.issuer, ledger_index: "validated" })
        ]), l = Number((c.obligations ?? {})[r.currency] ?? 0), h = d.account_data?.Domain;
        a.set(i, {
          obligations: Number.isFinite(l) ? l : 0,
          domain: h ? us(String(h)) : void 0
        });
      } catch {
      }
  }
  return fs(e, n, a, Number(t.ledger_index ?? 0));
}
function fs(e, t, n, s) {
  const a = t.filter((r) => r.Destination === e), o = a.map((r) => {
    const i = r.SendMax, c = typeof i == "object" && i !== null, d = c ? {
      kind: "iou",
      currency: String(i.currency ?? ""),
      issuer: String(i.issuer ?? ""),
      value: Number(i.value ?? 0)
    } : { kind: "xrp", value: Number(i ?? 0) / 1e6 }, l = c ? `${i.issuer}|${i.currency}` : "", h = n.get(l), g = c ? U(String(i.currency ?? "")) : "XRP";
    return {
      index: String(r.index ?? ""),
      from: String(r.Account ?? ""),
      amount: d,
      destinationTag: r.DestinationTag !== void 0 ? Number(r.DestinationTag) : void 0,
      expiration: r.Expiration !== void 0 ? new Date((Number(r.Expiration) + ls) * 1e3) : void 0,
      issuerObligations: h?.obligations,
      issuerOwesNothing: h !== void 0 && h.obligations === 0,
      borrowedTicker: c && ds.has(g.toUpperCase()),
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
function gs(e) {
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
    const c = i.amount.kind === "iou" ? U(i.amount.currency) : "XRP";
    t.push({
      id: `impersonation-${i.index.slice(0, 12)}`,
      severity: "critical",
      title: `A claim for ${We(i.amount)} that cannot be cashed for anything`,
      detail: `${i.from} has addressed a check for ${We(i.amount)} to this account. A currency code is not a name anyone owns — any account can issue a token called ${c}, and the ledger renders them identically. This one's issuer has NO obligations outstanding at all, meaning it has never issued a balance to anyone, so there is nothing this check could pay out.${i.issuerDomain ? ` The issuer publishes the domain ${i.issuerDomain}.` : ""}`,
      action: "Do not visit any domain associated with it and do not enter a wallet key anywhere it leads. The check itself is inert — it cannot move your funds, and ignoring it costs you nothing."
    });
  }
  const s = e.inbound.filter((i) => i.borrowedTicker && !i.issuerOwesNothing);
  for (const i of s) {
    const c = i.amount.kind === "iou" ? U(i.amount.currency) : "XRP";
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
  const o = e.inbound.filter(
    (i) => !i.borrowedTicker && (i.issuerObligations !== void 0 || i.amount.kind === "xrp")
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
  const r = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((i, c) => r[i.severity] - r[c.severity]);
}
const ps = 1, ms = 2, ys = 8, ws = 16, bs = 5, Ge = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";
function vs(e) {
  let t = 0n;
  for (const s of e) t = t << 8n | BigInt(s);
  let n = "";
  for (; t > 0n; )
    n = Ge[Number(t % 58n)] + n, t /= 58n;
  for (const s of e) {
    if (s !== 0) break;
    n = Ge[0] + n;
  }
  return n;
}
async function Ke(e) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", e));
}
function ks(e) {
  const t = new Uint8Array(e.length / 2);
  for (let n = 0; n < t.length; n += 1)
    t[n] = parseInt(e.slice(n * 2, n * 2 + 2), 16);
  return t;
}
async function Ss(e) {
  const t = new Uint8Array(21);
  t[0] = 0, t.set(ks(e), 1);
  const n = (await Ke(await Ke(t))).slice(0, 4), s = new Uint8Array(25);
  return s.set(t, 0), s.set(n, 21), vs(s);
}
async function $s(e) {
  const t = e.trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(t))
    throw new Error(
      "An NFTokenID is 64 hexadecimal characters. Check for a truncated copy or stray whitespace."
    );
  const n = parseInt(t.slice(0, 4), 16), s = parseInt(t.slice(4, 8), 16);
  return {
    tokenId: t,
    issuer: await Ss(t.slice(8, 48)),
    burnable: (n & ps) !== 0,
    mutable: (n & ws) !== 0,
    transferable: (n & ys) !== 0,
    onlyXrp: (n & ms) !== 0,
    // TransferFee is in units of 0.001%, so 5000 is 5%.
    transferFeePct: s / 1e3,
    taxon: parseInt(t.slice(48, 56), 16),
    sequence: parseInt(t.slice(56, 64), 16)
  };
}
function Ts(e) {
  return Array.isArray(e) ? e.map((t) => ({
    index: String(t.nft_offer_index ?? ""),
    owner: String(t.owner ?? ""),
    amountXrp: typeof t.amount == "string" ? Number(t.amount) / 1e6 : void 0,
    amountRaw: t.amount,
    destination: t.destination ? String(t.destination) : void 0
  })) : [];
}
async function _s(e) {
  const t = await $s(e);
  let n = !1;
  const s = async (r) => {
    try {
      const i = await S(r, { nft_id: t.tokenId, ledger_index: "validated" });
      return Ts(i.offers);
    } catch (i) {
      return i?.code !== "objectNotFound" && (n = !0), [];
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
function xs(e) {
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
    severity: n.transferFeePct >= bs ? "warn" : "info",
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
const Ye = [
  "wss://xrplcluster.com",
  "wss://s1.ripple.com",
  "wss://s2.ripple.com",
  "wss://xrpl.ws"
], As = 2, Ns = 4, Ft = 12e3;
function Is(e) {
  return new Promise((t) => {
    const n = Date.now();
    let s = !1, a;
    const o = (i) => {
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
      o({
        url: e,
        reachable: !1,
        error: i instanceof Error ? i.message : "could not open socket"
      });
      return;
    }
    const r = window.setTimeout(
      () => o({ url: e, reachable: !1, error: "no response within 12s" }),
      Ft
    );
    a.onerror = () => {
      window.clearTimeout(r), o({ url: e, reachable: !1, error: "connection refused or blocked" });
    }, a.onopen = () => {
      a.send(JSON.stringify({ id: 1, command: "server_info" }));
    }, a.onmessage = (i) => {
      window.clearTimeout(r);
      try {
        const c = JSON.parse(String(i.data))?.result?.info ?? {}, d = c.validated_ledger ?? {}, l = String(c.complete_ledgers ?? "").split("-")[0];
        o({
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
        o({ url: e, reachable: !1, error: "unreadable response" });
      }
    };
  });
}
function Es(e) {
  return new Promise((t) => {
    let n = !1, s;
    const a = (r) => {
      if (!n) {
        n = !0;
        try {
          s?.close();
        } catch {
        }
        t(r);
      }
    };
    try {
      s = new WebSocket(e);
    } catch {
      a(void 0);
      return;
    }
    const o = window.setTimeout(() => a(void 0), Ft);
    s.onerror = () => {
      window.clearTimeout(o), a(void 0);
    }, s.onopen = () => s.send(JSON.stringify({ id: 1, command: "fee" })), s.onmessage = (r) => {
      window.clearTimeout(o);
      try {
        const i = JSON.parse(String(r.data))?.result ?? {}, c = i.levels ?? {}, d = Number(c.reference_level) || 256;
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
async function Fs() {
  const [e, t] = await Promise.all([
    Promise.all(Ye.map(Is)),
    Es(Ye[0])
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
let z = null;
function Rs(e = 6e4) {
  const t = Date.now();
  if (z && t - z.at < e) return z.report;
  const n = Fs();
  return z = { at: t, report: n }, n.catch(() => {
    z?.report === n && (z = null);
  }), n;
}
function Os(e) {
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
      (d) => d.reachable && typeof d.ledgerSeq == "number" && e.leaderSeq - d.ledgerSeq >= Ns
    );
    c.length > 0 ? t.push({
      id: "node-lag",
      severity: "warn",
      title: `${c.length} node${c.length === 1 ? " is" : "s are"} behind the others`,
      detail: c.map(
        (d) => `${d.url} is ${e.leaderSeq - d.ledgerSeq} ledgers back`
      ).join(". ") + ". Ledgers close every three to four seconds, so this is beyond normal cadence.",
      action: "Readings taken from a trailing node describe a ledger that has already moved on."
    }) : typeof e.spread == "number" && e.spread <= As && t.push({
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
  const r = e.nodes.filter((c) => c.reachable && c.version === void 0);
  r.length > 0 && t.push({
    id: "undisclosed",
    severity: "info",
    title: `${r.length} node${r.length === 1 ? " does" : "s do"} not disclose their software version`,
    detail: `${r.map((c) => c.url).join(", ")} answered normally but omit build version, server state and peer count. That is an operator's choice about what to publish — it is not a fault, and it is not something this tool can infer.`
  });
  const i = { critical: 0, warn: 1, info: 2, ok: 3 };
  return t.sort((c, d) => i[c.severity] - i[d.severity]);
}
function Ds(e) {
  return e.passed ? "PASS" : e.severity === "block" ? "FAIL" : "REVIEW";
}
function Cs(e) {
  return e.state ?? Ds(e);
}
const Ps = /* @__PURE__ */ new Set(["INSUFFICIENT_DATA", "NOT_APPLICABLE"]);
function Ls(e) {
  return e.state && Ps.has(e.state) ? [e.id, e.passed, e.state] : [e.id, e.passed];
}
async function Xs(e) {
  const t = new TextEncoder().encode(e), n = await crypto.subtle.digest("SHA-256", t);
  return Array.from(new Uint8Array(n)).map((s) => s.toString(16).padStart(2, "0")).join("").toUpperCase();
}
async function Hs(e) {
  return Xs(
    JSON.stringify({
      kind: e.kind,
      subject: e.subject,
      scope: Object.keys(e.scope).sort().map((t) => [t, e.scope[t]]),
      evaluatedAt: e.evaluatedAt,
      checks: e.checks.map(Ls)
    })
  );
}
const Ve = {
  ledger_status: "control",
  ledger_sync: "network",
  check_address: "risk",
  read_claims: "claims",
  read_token_rights: "nft",
  certify_authority: "authority",
  read_provenance: "provenance",
  read_book: "book",
  read_settlement: "settlement",
  read_control_surface: "authority",
  read_pool: "amm",
  read_issuance: "issuance",
  security_check: "security",
  investigate_hack: "security",
  explain_transaction: "security",
  find_stuck_funds: "security",
  audit_exposure: "security",
  asset_inventory: "security",
  deposit_help: "security",
  verify_domain: "security",
  map_cluster: "security",
  drainer_check: "security",
  emergency_kit: "security",
  who_is: "security",
  scam_registry: "security",
  check_link: "security",
  screen_withdrawal: "security",
  surveil_market: "security",
  search_noshashi: "learn"
}, qs = ["ledgerIndex", "ledger_index", "leaderSeq", "validatedLedger"];
function xe(e, t = 0) {
  if (t > 5 || e === null || typeof e != "object") return;
  const n = e;
  for (const s of qs) {
    const a = n[s];
    if (typeof a == "number" && Number.isInteger(a) && a > 32570) return a;
    if (typeof a == "string" && /^\d{5,}$/.test(a) && Number(a) > 32570) return Number(a);
  }
  for (const s of Array.isArray(e) ? e.slice(0, 20) : Object.values(n)) {
    const a = xe(s, t + 1);
    if (a !== void 0) return a;
  }
}
function pe(e, t, n, s, a = /* @__PURE__ */ new Date()) {
  const o = Object.values(n ?? {}).filter((r) => typeof r == "string" || typeof r == "number").map(String).join(" · ");
  return {
    tool: e,
    screen: t,
    ...Ve[e] ? { scene: Ve[e] } : {},
    ...o ? { subject: o } : {},
    ...xe(s) !== void 0 ? { ledgerIndex: xe(s) } : {},
    readAt: a.toISOString()
  };
}
const Je = 0.95, Us = /* @__PURE__ */ new Set([
  "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
  // ACCOUNT_ZERO
  "rrrrrrrrrrrrrrrrrrrrBZbvji",
  // ACCOUNT_ONE
  "rrrrrrrrrrrrrrrrrNAMEtxvNvQ",
  // reserved for name lookups
  "rrrrrrrrrrrrrrrrrrrn5RM1rHd"
  // rippled's NaN sentinel
]);
function me(e) {
  return !!e && !Us.has(e);
}
const Qe = 2500, Ze = 2;
async function Ms(e, t = {}) {
  const n = [], [s, a, o] = await Promise.all([
    At(e).catch((i) => (n.push(`control: ${i instanceof Error ? i.message : String(i)}`), null)),
    xt(e).catch((i) => (n.push(`posture: ${i instanceof Error ? i.message : String(i)}`), null)),
    // The supply walk is the expensive read, so it is opt-in. When it is
    // skipped the concentration checks abstain rather than assume.
    t.walkSupply ? (t.issuance ?? Et(e)).then(
      (i) => i.obligationsError ? (n.push(`issuance: outstanding supply unreadable (${i.obligationsError})`), null) : i,
      (i) => (n.push(`issuance: ${i instanceof Error ? i.message : String(i)}`), null)
    ) : Promise.resolve(null)
  ]), r = a?.unreadable ? null : a;
  return a?.unreadable && n.push(`posture: ${a.unreadable}`), {
    issuer: e,
    control: s,
    posture: r,
    issuance: o,
    unreadable: n,
    ledgerIndex: s?.ledgerIndex ?? o?.ledgerIndex ?? 0,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function Rt(e) {
  return !e || e.currencies.length === 0 ? null : e.currencies.reduce((t, n) => n.outstanding > t.outstanding ? n : t);
}
function zs(e) {
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
  const a = !!n.signers.unreadable, o = !n.masterKeyEnabled && !!n.regularKey && !me(n.regularKey), r = n.signers.present ? n.signers.minimumSigners <= 1 : me(n.regularKey) || n.masterKeyEnabled;
  t.push({
    id: "NO_UNILATERAL_SIGNER",
    label: "No single key controls the issuer",
    severity: "block",
    // A signer list that could not be read cannot be ruled out, and an
    // unverifiable absence must not read as an absence.
    passed: !r && !a,
    detail: a ? `The signer list could not be read (${n.signers.unreadable}), so it cannot be established whether a committee controls this account or one key does. This is an unknown, not a pass.` : n.signers.present ? n.signers.minimumSigners <= 1 ? `A signer list is present, but ${n.signers.unilateralSigners.length || 1} signer reaches the quorum of ${n.signers.quorum} alone. This is a single-key account wearing a committee's clothes.` : `${n.signers.minimumSigners} signers must agree to reach the quorum of ${n.signers.quorum}, derived from summed weights rather than a headcount.` : o ? `The master key is disabled and the regular key is set to ${n.regularKey}, an address whose private key does not exist. The account is blackholed: it can never sign another transaction, so no party can act on this issuance.` : me(n.regularKey) ? `No signer list. The master key is ${n.masterKeyEnabled ? "enabled" : "disabled"} and a regular key is set, so ${n.regularKey} signs for this issuer on its own.` : n.masterKeyEnabled ? "No signer list and no usable regular key, and the master key is enabled. One key signs for this issuer." : "The master key is disabled, no regular key is set and no signer list is present, so the account cannot currently be signed for at all."
  }), s.transferRateBps > 0 && t.push({
    id: "NO_TRANSFER_FEE",
    label: "No issuer transfer fee",
    severity: "warn",
    passed: !1,
    detail: `The issuer charges ${(s.transferRateBps / 100).toFixed(2)}% on every transfer between holders. The rate is set by the issuer and can be changed by them.`
  });
  const i = Rt(e.issuance), c = e.unreadable.find((d) => d.startsWith("issuance:"));
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
  else if (i.coverage < Je)
    t.push({
      id: "SUPPLY_CONCENTRATION",
      label: `${U(i.currency)} supply concentration`,
      severity: "warn",
      passed: !1,
      state: "INSUFFICIENT_DATA",
      detail: `The holder lines read account for ${(i.coverage * 100).toFixed(1)}% of the outstanding ${U(i.currency)}. Below ${Je * 100}% coverage no concentration figure is reported, high or low, because shares over that fraction describe the holders seen rather than the issuance.`
    });
  else {
    const d = i.hhi >= Qe, l = e.issuance.source === "indexer" ? ` Holder balances are from ${e.issuance.sourceName}, not read from the ledger directly; their total was reconciled against the ledger's own obligations to within ${Math.abs(i.coverage - 1) * 100 < 0.01 ? "0.01" : (Math.abs(i.coverage - 1) * 100).toFixed(2)}%, which establishes that none are missing or invented but not that each is attributed correctly.` : " Holder balances were read from validated ledger state.";
    t.push({
      id: "SUPPLY_CONCENTRATION",
      label: `${U(i.currency)} supply not concentrated`,
      severity: "warn",
      passed: !d,
      detail: (d ? `HHI ${Math.round(i.hhi)} over ${i.holders} holders at ${(i.coverage * 100).toFixed(1)}% coverage. The largest holder carries ${i.topHolderPct.toFixed(1)}% and the top five carry ${i.topFivePct.toFixed(1)}%.` : `HHI ${Math.round(i.hhi)} over ${i.holders} holders at ${(i.coverage * 100).toFixed(1)}% coverage, below the ${Qe} threshold.`) + l
    });
  }
  return t;
}
function js(e, t = {}) {
  return e.some((n) => n.severity === "block" && !n.passed) ? "no-go" : (t.unreadable?.length ?? 0) > 0 ? "insufficient-data" : e.some((n) => !n.passed) ? "hold" : "go";
}
async function Bs(e, t = {}) {
  const n = await Ms(e, t);
  return Ws(n);
}
async function Ws(e) {
  const t = zs(e), n = js(t, { unreadable: e.unreadable }), s = Rt(e.issuance)?.currency, a = e.readAt, o = await Hs({
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
      rules: Ze
    },
    checks: t,
    evaluatedAt: a
  });
  return {
    verdict: n,
    issuer: e.issuer,
    currency: s,
    currencyLabel: s ? U(s) : void 0,
    checks: t,
    digest: o,
    ledgerIndex: e.ledgerIndex,
    evaluatedAt: a,
    source: e.issuance?.source ?? "none",
    rulesVersion: Ze
  };
}
const Gs = [
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
    id: "coming-soon",
    question: "Is there an uptime SLA, single sign-on or a dedicated environment?",
    answer: "Not yet. All three are coming soon. No plan includes an uptime SLA today, and NOSHASHI does not promise an uptime figure. Sign-in is by email and password with two-factor authentication until single sign-on (SAML or OIDC) arrives. Every organization uses the shared service, kept apart by row-level security, until dedicated environments are offered.",
    keywords: ["sla", "uptime", "availability", "guarantee", "sso", "saml", "oidc", "scim", "single", "sign-on", "dedicated", "environment", "isolated", "private", "coming", "soon"]
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
], Ks = [
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
      "asset_recovery",
      "proof_of_reserves",
      "threat_registry",
      "issuance_surveillance"
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
    annualUsd: 12e4,
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
      "Dedicated environment (coming soon)",
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
      "asset_recovery",
      "proof_of_reserves",
      "threat_registry",
      "issuance_surveillance",
      "customer_protection",
      "withdrawal_screening",
      "market_surveillance"
    ]
  },
  {
    id: "strategic",
    name: "STRATEGIC INFRASTRUCTURE",
    audience: "Institutions building their own XRPL intelligence layer",
    priceLabel: "$20,833",
    // $250,000 a year divided by twelve, rounded to the dollar.
    monthlyUsd: 20833,
    cadence: "per month",
    // No Stripe price exists yet: contract tiers are invoiced per deal.
    priceId: null,
    annualUsd: 25e4,
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
      "asset_recovery",
      "proof_of_reserves",
      "threat_registry",
      "issuance_surveillance",
      "customer_protection",
      "withdrawal_screening",
      "market_surveillance",
      "protection_monitoring",
      "phishing_feed"
    ]
  }
], Ys = [{ name: "Overview", plan: "Free", summary: "what NOSHASHI is and what it reads." }, { name: "Mission Control", plan: "Free", summary: "live mainnet telemetry, wallet gate, policy rule set." }, { name: "Verification", plan: "Free", summary: "describe a settlement, run it against a domain, get an explainable verdict and a SHA-256 receipt. Nothing is broadcast." }, { name: "Credentials", plan: "Free", summary: "XLS-70 credentials held by the wallet and the real mainnet domains they admit it to; a counterparty's credentials (who vouched, expiry); an issuer register (issued, not accepted, expiring, expired), each exportable to CSV." }, { name: "Domain Grid", plan: "Free", summary: "every XLS-80 permissioned domain on mainnet (from a sweep of the whole ledger), read live by domain ID or owner, and an admission check of any counterparty saved with its ledger index and SHA-256." }, { name: "Audit Trail", plan: "Free", summary: "any account's validated history with delivered amounts, destination tags, memos and partial payments; every counterparty screened against the OFAC SDN list and the scam registry; exported as CSV with a SHA-256 manifest." }, { name: "NOSHX", plan: "Free", summary: "this assistant, NOSHASHI's agent. It reads the live ledger with read-only tools (authority, order book, settlement, control surface, provenance, pools, issuance, address check, claims, NFT rights, ledger status), each gated like its screen, answers questions about NOSHASHI itself from the product's own pages (features, screens, plans, docs, trust, legal), and by default runs on NOSHX Core, NOSHASHI's own engine, which uses no language model: it plans from the question, runs the readers and writes the answer itself. A language model can be added (the trained NOSHX model through Ollama, or a hosted one), with optional failover back to Core and a deep reasoning switch. It has an Observer that reads the wallets you name from validated mainnet on an interval and records what changed (freezes, balances, credentials, issuer powers) by fixed rules, and a one-click issuer investigation that reads an issuer's authority certificate and obligations and hands the findings to this assistant." }, { name: "Portfolio & Radar", plan: "Desk", summary: "multi-wallet surveillance and the compliance radar." }, { name: "Exposure Analysis", plan: "Desk", summary: "issuer freeze rights, Travel Rule scope, counterparty concentration." }, { name: "Ledger & Policy", plan: "Desk", summary: "local adjudication history, evidence chain and receipt verification, investigations (cases a person opens on a verdict, with notes and a written resolution; a resolution never changes the verdict), the versioned institutional policy (drafts, simulation, activation, audit trail), policy simulation, signed export." }, { name: "Check an Address", plan: "Free", summary: "read what the ledger publishes about any account." }, { name: "Token Rights", plan: "Free", summary: "what the issuer of an NFT can still do to it after someone owns it — destroy it (lsfBurnable), rewrite what its URI points at (lsfMutable), block resale entirely, or take a cut of every transfer. All of it is encoded in the NFTokenID itself and decoded offline, so no server is asked and none can answer wrongly." }, { name: "Inbox", plan: "Free", summary: "every check a stranger has addressed to an account, and whether the token each one offers has ever been issued by anyone. A currency code is not a name anyone owns — any account can issue a token called USDT — so an unsolicited claim for a large round sum from an issuer with no obligations is impersonation, not money. Receiving one costs nothing and cannot move funds." }, { name: "Ledger Sync", plan: "Free", summary: "four public XRPL nodes queried and compared, with disagreement between them treated as the reading." }, { name: "Learn", plan: "Free", summary: "short animated explainers." }, { name: "Settlement", plan: "Desk", summary: "what a transaction actually DELIVERED against what it requested. A partial payment can return tesSUCCESS having delivered a fraction of the stated amount; this is the screen for that question." }, { name: "Ledger Garden", plan: "Desk", summary: "walk the ledger's relationships one validated read at a time — an issuer's assets, an asset's holders (from the first 200 of the issuer's trust lines, in ledger order; Issuance walks them all), an account's holdings and recent transactions, a transaction's settlement evidence — then hand the whole path to this agent as a question." }, { name: "Provenance", plan: "Desk", summary: "how long an account has existed and who sent it its first XRP. Note the sequence number is not a transaction count on modern accounts." }, { name: "Control Surface", plan: "Desk", summary: "how few signers can actually move a treasury, whether the master key bypasses the quorum, and how much balance is locked rather than spendable." }, { name: "Order Book", plan: "Desk", summary: "how much of an order book's quoted depth is backed by an owner who still holds the asset. An offer rests whether or not its owner kept the funds, and nothing removes it until someone tries to cross it — on some mainnet books over 90% of the visible depth cannot fill." }, { name: "Pool Governance", plan: "Desk", summary: "who votes an AMM's trading fee, on what share of the liquidity, and who holds the discounted auction slot." }, { name: "Issuance", plan: "Institution", summary: "holder concentration and enforcement history for an issuer, from the issuer's side." }, { name: "Authority Certificate", plan: "Desk", summary: "what authority an issuer has kept over an asset it issued — whether it can freeze a holder, whether it gave that power up irrevocably (lsfNoFreeze cannot be cleared once set), whether the asset is frozen right now, whether holding it needs the issuer's permission, whether one signer reaches the quorum alone, what it charges on a transfer between holders, and how concentrated the supply is. Each answer is a fact at one named ledger index, and the set is digested with SHA-256 so the same reading can be checked again later. It is NOT a score — no number is composited from the checks — and NOT a legal finding: whether an asset is decentralised or is a security is a determination for an agency applying statutory criteria, which this software does not evaluate. If the supply walk is skipped, or trust-line coverage falls below 95%, the concentration check abstains rather than passing." }, { name: "Ledger Watch", plan: "Free", summary: "screens an incoming payment to a deposit address before it is credited, read live from the ledger — it credits what actually arrived (delivered_amount, never the Amount of a partial payment), holds a familiar ticker whose issuer owes nothing as counterfeit, flags dust carrying a link as a phishing lure, notes a missing destination tag, the issuer's freeze and clawback rights, the Travel Rule threshold, and traces who created the sender and who created them, three hops back, against the organization's deny list. Verdicts are clear, review or hold; what could not be read holds the deposit. Deposit addresses and monitored accounts are read by the server every minute; each event goes to the organization's webhooks (xrpl_event, deposit_screened) and to a JSON/NDJSON feed API with a history endpoint; export schemas shape bulk exports and the feed. Requires Enterprise (deposit screening); monitoring any account, event feeds, custom schemas and retention need Strategic." }, { name: "Security Center", plan: "Free", summary: "ACCOUNT CHECK (free) grades any address A to F from who can sign (master key, regular key, signer list and its real quorum), recent key and settings changes, address-poisoning attempts and open doors (NFT offers, checks, payment channels), and writes an unsigned hardening plan the owner signs in their own wallet. SAFE SEND (free) checks a pasted destination against the operator's own address book for lookalikes and against the OFAC list. INCIDENT RESPONSE (Pro+; five hops and a case on Enterprise) follows stolen value through payments and AccountDelete sweeps past dust, says where it is, and rates every recovery path; validated transactions are never reversible. GUARDIAN (Strategic) sends security_alert webhooks when a watched account's keys change or it is deleted." }, { name: "Asset Passport", plan: "Enterprise", summary: "a signed, portable record of an asset’s compliance posture — issuer authority, freeze rights, concentration, domain eligibility — that travels with the asset and can be verified by any counterparty without re-running the checks." }, { name: "Pricing", plan: "Free", summary: "plans, checkout and verification credits." }, { name: "Account", plan: "Free", summary: "subscription, two-factor authentication and API keys." }, { name: "Legal & Accessibility", plan: "Free", summary: "policies, accessibility statement and contact routes." }, { name: "Trust & Security", plan: "Free", summary: "the read-only data path from the ledger to the receipt, what NOSHASHI never does (no keys, custody, signing or broadcast), where data goes, and what it does not claim." }, { name: "Settings", plan: "Free", summary: "appearance, accessibility, wallet address, notifications, launch at login, global shortcut and Keychain storage." }], Ot = {
  scenes: Ys
}, Vs = "https://www.noshashi.app";
function Js() {
  const e = Gs.map((n) => ({
    title: `Help › ${n.question}`,
    source: "NOSHX › Support",
    text: `${n.question}
${n.answer}`
  }));
  for (const n of Ks)
    e.push({
      title: `Pricing › ${n.name}`,
      source: `${Vs}/pricing/`,
      text: `${n.name} plan, for ${n.audience}. Price (cost): ${n.priceLabel} ${n.cadence}. Includes: ${n.features.join("; ")}.`
    });
  const t = Ot.scenes;
  for (let n = 0; n < t.length; n += 6)
    e.push({
      title: "App screens",
      source: "NOSHASHI desktop app",
      text: t.slice(n, n + 6).map((s) => `${s.name} (${s.plan}): ${s.summary}`).join(`
`)
    });
  return e;
}
const Qs = new Set(
  "a an and are as at be but by can do does for from has have how i if in is it its me my of on or our so that the their them then there these this to was we what when where which who why will with you your".split(" ")
), Zs = {
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
function X(e) {
  return (e.toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) ?? []).filter((t) => !Qs.has(t) && t.length > 1).map((t) => Zs[t] ?? (t.length > 4 ? t.replace(/(ies|es|s|ing|ed)$/, (n) => n === "ies" ? "y" : "") : t));
}
function ea(e) {
  const t = [], n = [];
  for (const r of e) {
    const i = X(r.title), c = X(r.text), d = /* @__PURE__ */ new Map();
    for (const l of i) d.set(l, (d.get(l) ?? 0) + 2);
    for (const l of c) d.set(l, (d.get(l) ?? 0) + 1);
    t.push(d), n.push(` ${i.join(" ")} ${c.join(" ")} `);
  }
  const s = t.map((r) => [...r.values()].reduce((i, c) => i + c, 0)), a = /* @__PURE__ */ new Map();
  for (const r of t) for (const i of r.keys()) a.set(i, (a.get(i) ?? 0) + 1);
  const o = s.reduce((r, i) => r + i, 0) / Math.max(1, s.length);
  return { passages: e, docs: t, sequences: n, lengths: s, df: a, avg: o };
}
function ta(e, t, n = 5) {
  const s = X(t), a = [...new Set(s)], o = s.slice(1).map((g, f) => ` ${s[f]} ${g} `);
  if (a.length === 0) return [];
  const r = e.passages.length, i = 1.4, c = 0.55, d = (g) => {
    const f = e.df.get(g) ?? 0;
    return Math.log(1 + (r - f + 0.5) / (f + 0.5));
  }, l = [];
  e.docs.forEach((g, f) => {
    let u = 0;
    for (const m of a) {
      const y = g.get(m);
      y && (u += d(m) * y * (i + 1) / (y + i * (1 - c + c * e.lengths[f] / e.avg)));
    }
    for (const m of o)
      if (e.sequences[f].includes(m)) {
        const [y, w] = m.trim().split(" ");
        u += 0.6 * (d(y) + d(w));
      }
    u > 0 && l.push({ ...e.passages[f], score: u * (e.passages[f].weight ?? 1) });
  }), l.sort((g, f) => f.score - g.score);
  const h = /* @__PURE__ */ new Set();
  return l.filter((g) => !h.has(g.title) && h.add(g.title)).slice(0, n);
}
let Q = null, Dt = [];
function na(e) {
  Dt = e, Q = null;
}
function Ct() {
  return Q ?? (Q = import("./pages-DaOiRREg.js").then(({ default: e }) => ea([...Js(), ...Dt, ...e]))), Q;
}
function sa() {
  if (Q) return;
  const e = () => {
    Ct();
  };
  typeof requestIdleCallback == "function" ? requestIdleCallback(e, { timeout: 1500 }) : setTimeout(e, 0);
}
async function Pt(e, t = 5) {
  return ta(await Ct(), e, t);
}
function C(e) {
  if (!/^[0-9A-F]{40}$/i.test(e)) return e;
  const t = (e.match(/../g) ?? []).map((n) => String.fromCharCode(parseInt(n, 16))).join("").replace(/\0+$/, "").trim();
  return t && /^[\x20-\x7E]+$/.test(t) ? t : e;
}
function aa(e) {
  const t = e.tx_json ?? e.tx ?? e, n = { ...t, hash: t.hash ?? e.hash, date: t.date ?? e.date }, s = Number(e.ledger_index ?? t.ledger_index ?? t.inLedger), a = e.meta ?? e.metaData ?? t.meta ?? {};
  return { tx: n, meta: a, ledgerIndex: Number.isFinite(s) ? s : 0 };
}
const ia = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(?:[a-z]{2,24})\b/i, oa = (e) => ia.test(e), ra = 21600;
function Re(e, t, n = 4) {
  for (const s of t)
    if (!(s === e || s.length < n * 2 + 1) && s.slice(0, n + 1) === e.slice(0, n + 1) && s.slice(-n) === e.slice(-n))
      return s;
  return null;
}
function ca(e, t) {
  if (!t) return { account: e, fundedBy: null, activatedLedger: null };
  const { tx: n, meta: s, ledgerIndex: a } = aa(t);
  return (s.AffectedNodes ?? []).some(
    (r) => r.CreatedNode?.LedgerEntryType === "AccountRoot" && r.CreatedNode?.NewFields?.Account === e
  ) ? { account: e, fundedBy: String(n.Account ?? "") || null, activatedLedger: a > 0 ? a : null } : { account: e, fundedBy: null, activatedLedger: null };
}
function da(e) {
  const t = e.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/)[0].replace(/\.$/, "").toLowerCase();
  return t.length > 253 || !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(t) || t === "localhost" || t.endsWith(".localhost") || t.endsWith(".local") || t.endsWith(".internal") ? null : t;
}
const la = (e) => `confirmed in ${e.reports} report${e.reports === 1 ? "" : "s"} to the shared scam registry (${e.categories.join(", ")}) since ${e.firstConfirmed.slice(0, 10)}. Reports carry transaction evidence and are reviewed before they count.`;
function ua(e) {
  const t = [], n = e.destinationInfo?.account_data ?? null, s = Number(n?.Flags ?? 0), a = e.destination;
  n ? ((s & 131072) !== 0 && e.destinationTag === null && t.push({ id: "will_fail_tag", severity: "critical", title: "The payment will fail: the destination requires a tag", detail: `${a} refuses payments without a destination tag (tecDST_TAG_NEEDED). Ask the customer for the tag their exchange gave them.` }), (s & 16777216) !== 0 && t.push({ id: "deposit_auth", severity: "warn", title: "The destination only accepts preauthorised senders", detail: "Unless it has preauthorised the sending account, the payment will fail (tecNO_PERMISSION)." })) : e.amountXrp !== null && e.amountXrp < e.reserveBaseXrp ? t.push({ id: "will_fail_reserve", severity: "critical", title: "The payment will fail: the destination does not exist", detail: `${a} is not a funded account, and ${e.amountXrp} XRP is below the ${e.reserveBaseXrp} XRP needed to create it (tecNO_DST_INSUF_XRP).` }) : t.push({ id: "new_destination_account", severity: "warn", title: "The payment would create a brand-new account", detail: `${a} does not exist yet. Withdrawals to never-used addresses are common in account takeovers; confirm with the customer.` });
  const o = e.ownAddresses ?? [], r = e.previousDestinations ?? [], i = Re(a, [...r, ...o]);
  i ? t.push({
    id: "address_poisoning",
    severity: "critical",
    title: `Lookalike destination: it imitates ${i.slice(0, 6)}…${i.slice(-4)}`,
    detail: `${a} starts and ends like ${i}, ${o.includes(i) ? "one of your own addresses" : "an address this customer has withdrawn to before"}, but is a different account. This is how address poisoning steals withdrawals. Hold it and confirm with the customer.`
  }) : r.length && !r.includes(a) && t.push({ id: "first_withdrawal_here", severity: "info", title: "First withdrawal to this destination", detail: "The customer has not withdrawn here before." });
  const c = e.chain[0];
  if (n && c?.activatedLedger !== null && c?.activatedLedger !== void 0 && e.currentLedger - c.activatedLedger < ra) {
    const g = Math.max(1, Math.round((e.currentLedger - c.activatedLedger) * 4 / 3600));
    t.push({ id: "fresh_destination", severity: "warn", title: `The destination is about ${g} hour${g === 1 ? "" : "s"} old`, detail: `${a} was created in ledger ${c.activatedLedger.toLocaleString("en-US")}, funded by ${c.fundedBy ?? "an unknown account"}. Freshly created destinations receive most stolen withdrawals.` });
  }
  const d = e.sanctions ?? {};
  e.chain.forEach((g, f) => {
    const u = d[g.account];
    u && t.push({ id: `sanctioned_hop_${f}`, severity: "critical", title: f === 0 ? `The destination is on the ${u.list} list: ${u.entityName}` : `The destination was funded ${f} hop${f === 1 ? "" : "s"} back by a listed address: ${u.entityName}`, detail: `${g.account}. Do not send; escalate to your sanctions officer. Source: ${u.sourceUrl}.` });
  });
  const l = e.threats ?? {};
  return e.chain.forEach((g, f) => {
    const u = l[g.account];
    u && t.push({ id: `reported_hop_${f}`, severity: f === 0 ? "critical" : "warn", title: f === 0 ? `The destination is in the scam registry (${u.categories.join(", ")})` : `The destination was funded ${f} hop${f === 1 ? "" : "s"} back by a reported account`, detail: `${g.account}: ${la(u)}` });
  }), o.includes(a) && t.push({ id: "own_address", severity: "info", title: "The destination is one of your own addresses", detail: "An internal transfer." }), { verdict: t.some((g) => g.severity === "critical") ? "hold" : t.some((g) => g.severity === "warn") ? "review" : "clear", findings: t };
}
const ha = 946684800, J = {
  disableMaster: 1048576,
  depositAuth: 16777216,
  disallowIncomingNFTokenOffer: 67108864,
  disallowIncomingCheck: 134217728,
  disallowIncomingPayChan: 268435456
}, q = {
  disableMaster: 4,
  disallowIncomingNFTokenOffer: 12,
  disallowIncomingCheck: 13,
  disallowIncomingPayChan: 14
}, et = {
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
}, fa = (e) => typeof e == "number" ? new Date((e + ha) * 1e3).toISOString() : null;
function ga(e) {
  return /^([0-9A-Fa-f]{2})+$/.test(e) ? new TextDecoder().decode(new Uint8Array((e.match(/../g) ?? []).map((t) => parseInt(t, 16)))) : e;
}
function pa(e, t) {
  const n = e.map((a) => a.weight).sort((a, o) => o - a);
  let s = 0;
  for (let a = 0; a < n.length; a++)
    if (s += n[a], s >= t) return a + 1;
  return 1 / 0;
}
function tt(e, t, n, s) {
  const a = t?.account_data ?? null, r = (t?.signer_lists ?? a?.signer_lists ?? [])[0], i = (r?.SignerEntries ?? []).map((y) => ({ account: String(y.SignerEntry?.Account ?? ""), weight: Number(y.SignerEntry?.SignerWeight ?? 0) })).filter((y) => y.account), c = Number(r?.SignerQuorum ?? 0), d = Number(a?.Flags ?? 0), l = [], h = /* @__PURE__ */ new Set(), g = [];
  let f = 0;
  for (const y of n) {
    const w = y.tx_json ?? y.tx ?? y;
    if ((y.meta ?? {}).TransactionResult !== "tesSUCCESS") continue;
    const v = Number(y.ledger_index ?? w.ledger_index ?? 0), k = String(w.hash ?? y.hash ?? ""), b = fa(w.date ?? y.date), $ = w.Account === e;
    switch (w.TransactionType) {
      case "SetRegularKey":
        $ && l.push(
          w.RegularKey ? { kind: "regular_key_set", ledger: v, at: b, hash: k, detail: `Regular key set to ${w.RegularKey}: that key can now sign alone.` } : { kind: "regular_key_removed", ledger: v, at: b, hash: k, detail: "Regular key removed." }
        );
        break;
      case "SignerListSet":
        if ($) {
          const _ = Number(w.SignerQuorum ?? 0), x = (w.SignerEntries ?? []).length;
          l.push(
            _ > 0 ? { kind: "signer_list_set", ledger: v, at: b, hash: k, detail: `Signer list set: quorum ${_} across ${x} signer${x === 1 ? "" : "s"}.` } : { kind: "signer_list_removed", ledger: v, at: b, hash: k, detail: "Signer list removed." }
          );
        }
        break;
      case "AccountSet":
        $ && (w.SetFlag === q.disableMaster ? l.push({ kind: "master_disabled", ledger: v, at: b, hash: k, detail: "Master key disabled." }) : w.ClearFlag === q.disableMaster ? l.push({ kind: "master_enabled", ledger: v, at: b, hash: k, detail: "Master key re-enabled." }) : typeof w.SetFlag == "number" ? l.push({ kind: "flag_set", ledger: v, at: b, hash: k, detail: `Set: ${et[w.SetFlag] ?? `flag ${w.SetFlag}`}.` }) : typeof w.ClearFlag == "number" && l.push({ kind: "flag_cleared", ledger: v, at: b, hash: k, detail: `Cleared: ${et[w.ClearFlag] ?? `flag ${w.ClearFlag}`}.` }));
        break;
      case "AccountDelete":
        $ && l.push({ kind: "account_deleted", ledger: v, at: b, hash: k, detail: `Account deleted; its XRP went to ${w.Destination}.` });
        break;
      case "Payment":
        if ($ && typeof w.Destination == "string" && h.add(w.Destination), w.Destination === e && typeof w.Account == "string") {
          g.push({ from: w.Account, hash: k, ledger: v });
          const _ = typeof w.Amount == "string" ? Number(w.Amount) : NaN;
          Number.isFinite(_) && _ < 1e4 && (f += 1);
        }
        break;
    }
  }
  const u = [], m = /* @__PURE__ */ new Set();
  for (const y of g) {
    if (h.has(y.from) || m.has(y.from)) continue;
    const w = Re(y.from, h);
    w && (m.add(y.from), u.push({ sender: y.from, imitates: w, hash: y.hash, ledger: y.ledger }));
  }
  return {
    address: e,
    exists: !!a,
    balanceXrp: a ? Number(a.Balance ?? 0) / 1e6 : 0,
    flags: d,
    masterEnabled: (d & J.disableMaster) === 0,
    regularKey: a?.RegularKey ? String(a.RegularKey) : null,
    signerList: i.length ? { quorum: c, signers: i, minimumSigners: pa(i, c) } : null,
    domain: typeof a?.Domain == "string" && a.Domain ? ga(a.Domain) : null,
    ledgerIndex: Number(t?.ledger_index ?? 0),
    events: l,
    poisoning: u,
    dustReceived: f,
    historyRead: n.length,
    historyComplete: s
  };
}
async function nt(e, t = 200) {
  const n = await S("account_info", { account: e, ledger_index: "validated", signer_lists: !0 }).catch((o) => {
    if (/actNotFound|not found/i.test(o instanceof Error ? o.message : String(o))) return null;
    throw o;
  });
  if (!n) return tt(e, null, [], !0);
  const s = await S("account_tx", { account: e, ledger_index_min: -1, ledger_index_max: -1, forward: !1, limit: t }).catch(() => ({ transactions: [] })), a = s.transactions ?? [];
  return tt(e, n, a, !s.marker);
}
const st = { critical: 0, warn: 1, info: 2, ok: 3 }, ma = 864e5;
function ya(e, t = Date.now()) {
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
  const r = e.events.filter((u) => u.at && t - Date.parse(u.at) < 30 * ma && u.kind !== "flag_set" && u.kind !== "flag_cleared");
  r.length && n.push({
    id: "recent-key-change",
    severity: "warn",
    title: `Signing keys changed ${r.length === 1 ? "once" : `${r.length} times`} in the last 30 days`,
    detail: `${r.map((u) => `${u.at.slice(0, 10)}: ${u.detail}`).join(" ")} Taking over an account usually starts with a new regular key or signer list, so every change should be one you made.`,
    action: "If you did not make these changes, treat the account as compromised: open Incident Response now."
  }), e.poisoning.length && n.push({
    id: "poisoning",
    severity: "warn",
    title: `${e.poisoning.length} address-poisoning attempt${e.poisoning.length === 1 ? "" : "s"} against this account`,
    detail: e.poisoning.slice(0, 5).map((u) => `${u.sender} imitates ${u.imitates}, which this account has paid.`).join(" ") + " They sent you something so the fake appears in your history next to the real one.",
    action: "Never copy a destination from transaction history. Keep an address book, and check a pasted address against it before signing."
  }), e.dustReceived >= 3 && n.push({ id: "dust", severity: "info", title: `${e.dustReceived} dust payments received`, detail: "Payments under 0.01 XRP are how links to fake wallets and airdrops reach an account's history. Do not open links that arrive on the ledger." });
  const c = [
    [J.disallowIncomingNFTokenOffer, q.disallowIncomingNFTokenOffer, "NFT offers", "Unsolicited NFT offers are a common phishing carrier: their names and images point at fake claim sites."],
    [J.disallowIncomingCheck, q.disallowIncomingCheck, "checks", "A check someone else created shows up as something to cash; scammers use them as lures."],
    [J.disallowIncomingPayChan, q.disallowIncomingPayChan, "payment channels", "Unsolicited payment channels clutter the account and are rarely legitimate for a personal wallet."]
  ].filter(([u]) => !a(u));
  if (c.length) {
    n.push({
      id: "open-doors",
      severity: "info",
      title: `Strangers can send this account ${c.map((u) => u[2]).join(", ")}`,
      detail: "Refusing them costs nothing and removes channels phishing uses. You can still create them yourself."
    });
    for (const [, u, m, y] of c)
      s.push({ id: `refuse-${u}`, title: `Refuse incoming ${m}`, why: y, tx: { TransactionType: "AccountSet", Account: e.address, SetFlag: u } });
  } else
    n.push({ id: "doors-closed", severity: "ok", title: "Unsolicited NFT offers, checks and payment channels are refused", detail: "The account has closed the channels phishing usually arrives through." });
  a(J.depositAuth) && n.push({ id: "deposit-auth", severity: "ok", title: "Only preauthorised senders can pay this account", detail: "Deposit authorisation is on: nothing arrives unless the account approved the sender, which also blocks dust and poisoning." }), e.masterEnabled && !o && (s.unshift({
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
    tx: { TransactionType: "AccountSet", Account: e.address, SetFlag: q.disableMaster },
    caution: "Sign it only after a multisigned test transaction has succeeded. If the signers cannot reach quorum, disabling the master key locks the account permanently."
  }), n.sort((u, m) => st[u.severity] - st[m.severity]);
  const d = n.filter((u) => u.severity === "critical").length, l = n.filter((u) => u.severity === "warn").length, h = Math.max(0, Math.min(100, 100 - d * 30 - l * 12 - c.length * 3 - (o && o.minimumSigners >= 2 && !e.masterEnabled ? -5 : 0))), g = h >= 90 ? "A" : h >= 75 ? "B" : h >= 60 ? "C" : h >= 40 ? "D" : "F", f = d > 0 ? "Serious weaknesses: fix the critical findings before holding meaningful value here." : l > 0 ? "Workable, with changes worth making." : "Well protected by what the ledger can show.";
  return { score: h, grade: g, summary: f, findings: n, plan: s };
}
const wa = 946684800, at = 131072, ba = {
  accountTx: (e, t, n, s) => S("account_tx", { account: e, ledger_index_min: t, ledger_index_max: -1, forward: !0, limit: n, ...s ? { marker: s } : {} }),
  accountInfo: (e) => S("account_info", { account: e, ledger_index: "validated" }).catch((t) => {
    if (/actNotFound|not found/i.test(t instanceof Error ? t.message : String(t))) return null;
    throw t;
  }),
  sanctions: async (e) => (await ne(e))?.hits ?? null
}, le = {
  standard: { depth: 2, perAccount: 400 },
  deep: { depth: 5, perAccount: 1e3 }
}, va = (e) => typeof e == "number" ? new Date((e + wa) * 1e3).toISOString() : null;
function it(e) {
  if (typeof e == "string" && /^\d+$/.test(e)) return { currency: "XRP", issuer: null, value: Number(e) / 1e6 };
  if (e && typeof e == "object") {
    const t = e, n = Number(t.value);
    if (typeof t.currency == "string" && Number.isFinite(n)) return { currency: C(t.currency), issuer: t.issuer ?? null, value: n };
  }
  return null;
}
function ka(e, t) {
  const n = t.tx_json ?? t.tx ?? t, s = t.meta ?? {};
  if (t.validated === !1 || s.TransactionResult !== "tesSUCCESS" || n.Account !== e) return null;
  const a = {
    from: e,
    ledger: Number(t.ledger_index ?? n.ledger_index ?? 0),
    at: va(n.date ?? t.date),
    hash: String(n.hash ?? t.hash ?? ""),
    destinationTag: typeof n.DestinationTag == "number" ? n.DestinationTag : null
  }, o = it(s.delivered_amount ?? s.DeliveredAmount);
  if (n.TransactionType === "Payment" && typeof n.Destination == "string" && n.Destination !== e && o)
    return { ...a, to: n.Destination, kind: "payment", amount: o };
  if (n.TransactionType === "AccountDelete" && typeof n.Destination == "string" && o)
    return { ...a, to: n.Destination, kind: "account_delete", amount: o };
  if (n.TransactionType === "EscrowCreate" && typeof n.Destination == "string") {
    const r = it(n.Amount);
    if (r) return { ...a, to: n.Destination, kind: "escrow", amount: r };
  }
  return null;
}
async function Sa(e, t) {
  const n = t.reader ?? ba, s = t.depth ?? le.standard.depth, a = t.perAccount ?? le.standard.perAccount, o = t.minXrp ?? 1, r = /* @__PURE__ */ new Map(), i = [], c = { count: 0, xrp: 0 }, d = [{ address: e, from: t.sinceLedger, depth: 0 }];
  for (r.set(e, { address: e, depth: 0, status: "source", receivedXrp: 0, balanceXrp: null, domain: null, sanction: null, read: 0, truncated: !1 }); d.length; ) {
    const { address: u, from: m, depth: y } = d.shift(), w = r.get(u), p = await n.accountInfo(u).catch(() => {
    });
    p === void 0 && (w.status = w.status === "source" ? "source" : "unread");
    const v = p?.account_data;
    if (v ? (w.balanceXrp = Number(v.Balance ?? 0) / 1e6, typeof v.Domain == "string" && v.Domain && (w.domain = new TextDecoder().decode(new Uint8Array((v.Domain.match(/../g) ?? []).map((b) => parseInt(b, 16))))), w.status !== "source" && (w.status = w.tagged || (Number(v.Flags ?? 0) & at) !== 0 ? "custodial" : "holding")) : p === null && w.status !== "source" && (w.status = "deleted"), w.tagged && w.status !== "source" && (w.status = "custodial"), w.status === "custodial") continue;
    let k;
    do {
      const b = await n.accountTx(u, m, Math.min(400, a - w.read), k).catch(() => ({ transactions: [] })), $ = b.transactions ?? [];
      w.read += $.length;
      for (const _ of $) {
        const x = ka(u, _);
        if (!x) continue;
        if (x.amount.currency === "XRP" && x.amount.value < o && x.kind === "payment") {
          c.count += 1, c.xrp += x.amount.value;
          continue;
        }
        i.push(x);
        const B = x.amount.currency === "XRP" ? x.amount.value : 0, W = r.get(x.to);
        if (W) {
          W.receivedXrp += B, x.destinationTag !== null && W.status !== "source" && (W.tagged = !0, W.status = "custodial");
          continue;
        }
        const G = x.destinationTag !== null;
        if (r.set(x.to, { address: x.to, depth: y + 1, status: G ? "custodial" : "holding", receivedXrp: B, balanceXrp: null, domain: null, sanction: null, read: 0, truncated: !1, tagged: G }), !G && y + 1 <= s) {
          d.push({ address: x.to, from: x.ledger, depth: y + 1 });
          continue;
        }
        const K = r.get(x.to), he = await n.accountInfo(x.to).catch(() => {
        });
        if (he === null) K.status = "deleted";
        else if (he?.account_data) {
          const Y = he.account_data;
          K.balanceXrp = Number(Y.Balance ?? 0) / 1e6, typeof Y.Domain == "string" && Y.Domain && (K.domain = new TextDecoder().decode(new Uint8Array((Y.Domain.match(/../g) ?? []).map((Kt) => parseInt(Kt, 16))))), K.status = G || (Number(Y.Flags ?? 0) & at) !== 0 ? "custodial" : "not_followed";
        } else G || (K.status = "not_followed");
      }
      k = b.marker, w.read >= a && k && (w.truncated = !0);
    } while (k && w.read < a);
  }
  const l = [...r.values()], h = await n.sanctions(l.map((u) => u.address)).catch(() => null);
  for (const u of l) u.sanction = h?.[u.address] ?? null;
  const g = /* @__PURE__ */ new Map();
  for (const u of l) {
    const m = u.address.slice(-4).toLowerCase();
    g.set(m, [...g.get(m) ?? [], u.address]);
  }
  const f = [...g].filter(([, u]) => u.length >= 2).map(([u, m]) => ({ ending: u, accounts: m }));
  return { root: e, sinceLedger: t.sinceLedger, depthLimit: s, minXrp: o, nodes: l, flows: i, dust: c, vanity: f, sanctionsChecked: h !== null };
}
const ye = (e) => `${e.value.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${e.currency}${e.issuer ? ` (issuer ${e.issuer})` : ""}`;
function $a(e, t) {
  const n = [
    {
      id: "finality",
      title: "No one can reverse a validated XRP Ledger transaction",
      detail: "There is no chargeback on the XRP Ledger. Validators, Ripple, wallet makers and NOSHASHI cannot move funds out of an account without its keys, and anyone offering to 'recover' or 'reverse' stolen XRP for a fee is running the second half of the scam. What follows are the paths that do exist.",
      outlook: "not_possible"
    }
  ], s = e.nodes.filter((d) => d.status === "custodial");
  for (const d of s) {
    const l = e.flows.filter((h) => h.to === d.address);
    n.push({
      id: `freeze-${d.address}`,
      title: `Ask the service behind ${d.address}${d.domain ? ` (${d.domain})` : ""} to freeze the deposit`,
      detail: `This account requires destination tags, the mark of an exchange or custodial service that credits deposits to customer accounts. The service can identify and freeze the customer who received ${l.map((h) => ye(h.amount)).join(" and ") || "the funds"} if you reach it before the funds are withdrawn, usually with a police or court reference. Send it the evidence below.`,
      outlook: "possible",
      evidence: l.map((h) => `${h.at ?? `ledger ${h.ledger}`}: ${ye(h.amount)} to ${h.to}${h.destinationTag !== null ? ` tag ${h.destinationTag}` : ""}, transaction ${h.hash}`)
    });
  }
  const a = e.flows.filter((d) => d.amount.issuer), o = [...new Set(a.map((d) => d.amount.issuer))];
  for (const d of o) {
    const l = a.filter((h) => h.amount.issuer === d);
    n.push({
      id: `issuer-${d}`,
      title: `Ask the issuer ${d} to freeze, or claw back, its ${l[0].amount.currency}`,
      detail: "Issued tokens are the issuer's obligations. Unless it has given up the right (No Freeze), the issuer can freeze the trust lines now holding its token, and if it enabled clawback it can take the balance back and reissue it. Check the issuer's posture on the Authority screen, then contact it through its published domain with the evidence below.",
      outlook: "possible",
      evidence: l.map((h) => `${h.at ?? `ledger ${h.ledger}`}: ${ye(h.amount)} from ${h.from} to ${h.to}, transaction ${h.hash}`)
    });
  }
  const r = e.nodes.filter((d) => d.status === "holding" && d.depth > 0 && (d.balanceXrp ?? 0) > 0);
  r.length && n.push({
    id: "still-held",
    title: `${r.length} account${r.length === 1 ? " still holds" : "s still hold"} XRP from the trail`,
    detail: `${r.map((d) => `${d.address}: ${d.balanceXrp.toLocaleString("en-US")} XRP`).join("; ")}. Nothing on the ledger can move it without that account's key, but law enforcement can act on an identified owner, and Ledger Watch can alert you the moment it moves (and where to).`,
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
async function Ta(e) {
  const t = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e));
  return Array.from(new Uint8Array(t)).map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
}
function _a(e, t, n) {
  const s = [], a = n.filter((d) => d.from === e).sort((d, l) => d.ledger - l.ledger), o = a[0], r = t.filter((d) => d.kind === "regular_key_set" || d.kind === "signer_list_set" || d.kind === "master_disabled"), i = o ? r.filter((d) => d.ledger <= o.ledger && o.ledger - d.ledger < 1e5) : [];
  i.length ? s.push({
    id: "key-then-drain",
    severity: "critical",
    title: "Signing keys changed, then value left",
    detail: `${i.map((d) => `${d.at?.slice(0, 16).replace("T", " ") ?? `ledger ${d.ledger}`}: ${d.detail}`).join(" ")} Value started leaving at ${o.at?.slice(0, 16).replace("T", " ") ?? `ledger ${o.ledger}`}. An attacker who adds their own key can keep signing after the owner notices.`
  }) : o && s.push({
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
const xa = 131072, Aa = 1, Na = 131072, Ia = 1e3;
async function Ea(e) {
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
function P(e) {
  if (typeof e == "string" && /^\d+$/.test(e)) return `${(Number(e) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;
  if (e && typeof e == "object") {
    const t = e;
    return "mpt_issuance_id" in t ? `${t.value} of MPT ${String(t.mpt_issuance_id).slice(0, 12)}…` : `${t.value} ${C(String(t.currency ?? ""))}${t.issuer ? ` (issuer ${t.issuer})` : ""}`;
  }
  return String(e);
}
function ot(e) {
  return e == null ? !0 : typeof e == "string" ? Number(e) === 0 : typeof e == "object" ? Number(e.value) === 0 : !1;
}
function Fa(e) {
  const t = [];
  for (const n of e.Memos ?? []) {
    const s = n.Memo ?? n;
    for (const a of ["MemoData", "MemoType", "MemoFormat"]) {
      const o = s[a];
      if (!(typeof o != "string" || !/^([0-9A-Fa-f]{2})+$/.test(o)))
        try {
          t.push(new TextDecoder("utf-8", { fatal: !1 }).decode(new Uint8Array((o.match(/../g) ?? []).map((r) => parseInt(r, 16)))));
        } catch {
        }
    }
  }
  return t;
}
const rt = {
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
function Ra(e, t, n = {}) {
  const s = [], a = [], o = String(e.TransactionType), r = typeof e.Account == "string" ? e.Account : "", i = Number(e.Flags ?? 0), c = typeof e.TxnSignature == "string" || Array.isArray(e.Signers), d = (u, m) => {
    if (typeof u != "string" || !u) return;
    const y = n.sanctioned?.[u];
    y && a.push({ id: "sanctioned", severity: "danger", text: `The ${m} ${u} is on the OFAC SDN list (${y.entityName}). Dealing with it is prohibited for US persons and many others.` });
    const w = n.known ?? [];
    if (w.length && !w.includes(u)) {
      const p = Re(u, w);
      p && a.push({ id: "lookalike", severity: "danger", text: `The ${m} ${u} starts and ends like ${p} from your address book but is a different account: address poisoning.` });
    }
  };
  switch (n.me && r && r !== n.me && a.push({ id: "other-account", severity: "warn", text: `This transaction is for account ${r}, not ${n.me}. Signing it with your key only works if you are a signer or its regular key.` }), o) {
    case "Payment": {
      const u = (i & xa) !== 0;
      s.push(`Sends ${P(e.Amount ?? e.DeliverMax)} from ${r} to ${e.Destination}${typeof e.DestinationTag == "number" ? ` with destination tag ${e.DestinationTag}` : ""}.`), e.SendMax && s.push(`It may spend up to ${P(e.SendMax)} to deliver that.`), u && a.push({ id: "partial-payment", severity: "warn", text: "Partial payment flag set: the recipient may receive far less than the Amount shown. Legitimate for some conversions; used to fake large deposits." }), e.Destination === r && s.push("Sender and destination are the same account: a currency conversion through the DEX."), d(e.Destination, "destination");
      break;
    }
    case "SetRegularKey":
      e.RegularKey ? (s.push(`Gives the key of ${e.RegularKey} full power to sign for ${r}.`), a.push({ id: "regular-key", severity: "danger", text: `After this, whoever holds ${e.RegularKey} can move everything in the account, and keeps that power even if you change nothing else. A site asking you to sign this is taking over the account unless ${e.RegularKey} is a key you control.` }), d(e.RegularKey, "new key")) : (s.push("Removes the account's regular key."), a.push({ id: "regular-key-removed", severity: "warn", text: "If the master key is disabled and there is no signer list, removing the regular key leaves nothing that can sign: the account is locked forever." }));
      break;
    case "SignerListSet": {
      const u = (e.SignerEntries ?? []).map((m) => m.SignerEntry ?? m);
      if (Number(e.SignerQuorum ?? 0) === 0)
        s.push("Deletes the account's signer list."), a.push({ id: "signers-removed", severity: "warn", text: "Removes the multi-signature requirement. If the master key is disabled and there is no regular key, nothing can sign afterwards." });
      else {
        s.push(`Lets ${u.length} signer${u.length === 1 ? "" : "s"} sign for ${r} together (quorum ${e.SignerQuorum}): ${u.map((m) => `${m.Account} (weight ${m.SignerWeight})`).join(", ")}.`), a.push({ id: "signer-list", severity: "danger", text: "These accounts will be able to move everything in this account. Sign only if every one of them is yours or someone you have chosen." });
        for (const m of u) d(m.Account, "signer");
      }
      break;
    }
    case "AccountSet": {
      typeof e.SetFlag == "number" && s.push(`Turns on: ${rt[e.SetFlag] ?? `flag ${e.SetFlag}`}.`), typeof e.ClearFlag == "number" && s.push(`Turns off: ${rt[e.ClearFlag] ?? `flag ${e.ClearFlag}`}.`), e.SetFlag === q.disableMaster && a.push({ id: "disable-master", severity: "warn", text: "Disables the master key. Sound when a regular key or signer list you control is already set and tested; if not, the account can never sign again." }), e.ClearFlag === q.disableMaster && a.push({ id: "enable-master", severity: "warn", text: "Re-enables the master key: whoever has the original seed can sign alone again." }), e.SetFlag === 6 && a.push({ id: "no-freeze", severity: "info", text: "No Freeze is permanent: it cannot be turned off again." }), e.SetFlag === 7 && a.push({ id: "global-freeze", severity: "warn", text: "Global freeze stops every holder of this account's tokens from moving them." }), typeof e.Domain == "string" && s.push(`Sets the account's domain to ${e.Domain ? Oa(e.Domain) : "(none)"}.`), typeof e.TransferRate == "number" && s.push(`Sets a transfer fee of ${((e.TransferRate / 1e9 - 1) * 100).toFixed(3)}% on its tokens.`), s.length || s.push("Changes no flags: an AccountSet like this only bumps the sequence.");
      break;
    }
    case "AccountDelete":
      s.push(`DELETES account ${r} and sends all of its remaining XRP to ${e.Destination}${typeof e.DestinationTag == "number" ? ` (tag ${e.DestinationTag})` : ""}.`), a.push({ id: "account-delete", severity: "danger", text: `The account ceases to exist and every drop it holds goes to ${e.Destination}. Thieves ask victims to sign this to empty an account in one step. Sign only to close an account you are finished with, to a destination you own.` }), d(e.Destination, "destination");
      break;
    case "NFTokenCreateOffer": {
      const u = (i & Aa) !== 0;
      s.push(`${u ? "Offers to SELL" : "Offers to BUY"} NFT ${String(e.NFTokenID).slice(0, 16)}… for ${ot(e.Amount) ? "NOTHING" : P(e.Amount)}${e.Destination ? `, only to ${e.Destination}` : ", to anyone"}.`), u && ot(e.Amount) && a.push({ id: "nft-free", severity: "danger", text: "A sell offer for zero gives the NFT away. The classic NFT phishing prompt asks for exactly this, disguised as a 'claim' or 'verify'." }), u && e.Destination && d(e.Destination, "buyer"), u && e.Destination && !(n.known ?? []).includes(e.Destination) && a.push({ id: "nft-stranger", severity: "warn", text: `Only ${e.Destination} can accept this sell offer. Make sure that account is who you think it is.` });
      break;
    }
    case "NFTokenAcceptOffer":
      s.push(`Accepts NFT offer${e.NFTokenSellOffer && e.NFTokenBuyOffer ? "s (brokered)" : ""} ${e.NFTokenSellOffer ?? e.NFTokenBuyOffer}.`), a.push({ id: "nft-accept", severity: "info", text: "Accepting a sell offer pays its price; accepting a buy offer hands over your NFT. Check the offer's amount on the ledger (NFT explorer) before signing." });
      break;
    case "TrustSet": {
      const u = e.LimitAmount;
      s.push(`Sets a trust line to hold up to ${u?.value} ${C(String(u?.currency ?? ""))} issued by ${u?.issuer}.`), a.push({ id: "trustline", severity: "info", text: "A trust line only lets you hold a token. Airdropped tokens with a link in their name are a common lure; the token is only worth what its issuer stands behind." });
      break;
    }
    case "OfferCreate":
      s.push(`Places a DEX order: pay ${P(e.TakerGets)} to receive ${P(e.TakerPays)}.`);
      break;
    case "OfferCancel":
      s.push(`Cancels DEX order sequence ${e.OfferSequence}.`);
      break;
    case "EscrowCreate":
      s.push(`Locks ${P(e.Amount)} in escrow for ${e.Destination}.`), d(e.Destination, "destination");
      break;
    case "EscrowFinish":
    case "EscrowCancel":
      s.push(`${o === "EscrowFinish" ? "Releases" : "Cancels"} escrow ${e.OfferSequence} created by ${e.Owner}.`);
      break;
    case "CheckCreate":
      s.push(`Writes a check for up to ${P(e.SendMax)} that ${e.Destination} can cash.`), d(e.Destination, "payee");
      break;
    case "CheckCash":
      s.push(`Cashes check ${String(e.CheckID).slice(0, 16)}… for ${P(e.Amount ?? e.DeliverMin)}.`);
      break;
    case "CheckCancel":
      s.push(`Cancels check ${String(e.CheckID).slice(0, 16)}….`);
      break;
    case "PaymentChannelCreate":
      s.push(`Opens a payment channel funding ${e.Destination} with up to ${P(e.Amount)}.`), d(e.Destination, "destination");
      break;
    case "PaymentChannelClaim":
      s.push(`Claims from payment channel ${String(e.Channel).slice(0, 16)}…${(i & Na) !== 0 ? " and asks to close it" : ""}.`);
      break;
    case "DepositPreauth":
      s.push(e.Authorize ? `Lets ${e.Authorize} pay this account while deposit authorisation is on.` : `Withdraws ${e.Unauthorize}'s permission to pay this account.`);
      break;
    case "TicketCreate":
      s.push(`Reserves ${e.TicketCount} ticket${e.TicketCount === 1 ? "" : "s"}: sequence numbers transactions can use later, in any order.`), a.push({ id: "tickets", severity: "info", text: "Tickets let pre-signed transactions be submitted later, out of order. Know who will hold transactions signed against them." });
      break;
    default:
      s.push(`A ${o} transaction from ${r}.`), a.push({ id: "unfamiliar", severity: "info", text: `${o} is not one of the transactions this explainer describes in detail. Read the fields below before signing.` });
  }
  const l = Number(e.Fee ?? 0);
  Number.isFinite(l) && l > Ia && a.push({ id: "high-fee", severity: l >= 1e6 ? "danger" : "warn", text: `The fee is ${(l / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP, destroyed whether or not the transaction does anything. A normal fee is 0.00001 XRP.` });
  const g = Fa(e).find(oa);
  g && a.push({ id: "memo-link", severity: "warn", text: `A memo carries a link or domain ("${g.slice(0, 80)}"). Never visit links that arrive on the ledger.` }), c && a.push({ id: "already-signed", severity: "warn", text: "This blob is already signed: anyone who has it can submit it, whether or not you approve." }), typeof e.LastLedgerSequence != "number" && a.push({ id: "no-expiry", severity: "info", text: "No LastLedgerSequence: once signed, it stays valid until its sequence is used." });
  const f = a.some((u) => u.severity === "danger") ? "DO NOT SIGN" : a.some((u) => u.severity === "warn") ? "CAREFUL" : "SAFE-LOOKING";
  return { tx: e, format: t, summary: s, flags: a, verdict: f, signed: c };
}
function Oa(e) {
  return /^([0-9A-Fa-f]{2})+$/.test(e) ? new TextDecoder().decode(new Uint8Array((e.match(/../g) ?? []).map((t) => parseInt(t, 16)))) : e;
}
function Da(e) {
  const t = /* @__PURE__ */ new Set();
  for (const n of ["Destination", "RegularKey", "Owner", "Authorize"]) typeof e[n] == "string" && t.add(e[n]);
  for (const n of e.SignerEntries ?? []) typeof (n.SignerEntry ?? n).Account == "string" && t.add((n.SignerEntry ?? n).Account);
  return [...t];
}
const Ca = 946684800, Oe = { request: (e, t) => S(e, t) }, Pa = (e) => /actNotFound|not found/i.test(e instanceof Error ? e.message : String(e));
async function ct(e, t, n, s, a) {
  const o = [];
  let r;
  for (let i = 0; i < a; i++) {
    const c = await e.request(t, { ...n, ...r ? { marker: r } : {} });
    if (o.push(...c[s] ?? []), r = c.marker, !r) return { rows: o, complete: !0 };
  }
  return { rows: o, complete: !1 };
}
async function oe(e, t = Oe, n = 10) {
  const s = await t.request("ledger", { ledger_index: "validated" }), a = Number(s.ledger?.ledger_index ?? s.ledger_index), o = Number(s.ledger?.close_time ?? 0), i = (await t.request("server_info", {}).catch(() => ({}))).info?.validated_ledger ?? {}, c = Number(i.reserve_base_xrp ?? 1), d = Number(i.reserve_inc_xrp ?? 0.2), l = await t.request("account_info", { account: e, ledger_index: a }).catch((f) => {
    if (Pa(f)) return null;
    throw f;
  });
  if (!l) return { address: e, root: null, objects: [], nfts: [], ledgerIndex: a, closeTime: o, reserveBaseXrp: c, reserveIncXrp: d, complete: !0 };
  const [h, g] = await Promise.all([
    ct(t, "account_objects", { account: e, ledger_index: a, limit: 400 }, "account_objects", n),
    ct(t, "account_nfts", { account: e, ledger_index: a, limit: 400 }, "account_nfts", n).catch(() => ({ rows: [], complete: !1 }))
  ]);
  return {
    address: e,
    root: l.account_data,
    objects: h.rows,
    nfts: g.rows,
    ledgerIndex: a,
    closeTime: o,
    reserveBaseXrp: c,
    reserveIncXrp: d,
    complete: h.complete && g.complete
  };
}
const R = (e) => typeof e == "number" && e > 0 ? new Date((e + Ca) * 1e3).toISOString() : null, E = (e) => typeof e == "string" && /^\d+$/.test(e) ? Number(e) / 1e6 : null;
function te(e, t) {
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
const dt = 131072, La = 131072, Xa = 8388608, Ha = 1, Ae = (e) => `${e.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;
function O(e) {
  const t = E(e);
  if (t !== null) return Ae(t);
  const n = e;
  return `${n?.value} ${C(String(n?.currency ?? ""))}`;
}
function Lt(e, t = {}) {
  const n = e.address, s = e.closeTime, a = e.reserveIncXrp, o = [], r = e.root, i = R(s);
  if (!r)
    return {
      address: n,
      exists: !1,
      ledgerIndex: e.ledgerIndex,
      at: i,
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
  for (const p of e.objects) {
    const v = String(p.index ?? "");
    switch (p.LedgerEntryType) {
      case "Escrow": {
        const k = E(p.Amount) ?? 0, b = typeof p.FinishAfter == "number" ? p.FinishAfter : null, $ = typeof p.CancelAfter == "number" ? p.CancelAfter : null, _ = $ !== null && $ <= s, B = t[v] ?? (typeof p.Sequence == "number" ? p.Sequence : null) ?? "<sequence of the EscrowCreate>";
        p.Destination === n && !_ ? p.Condition ? o.push({ id: `escrow-${v}`, kind: "escrow_conditional", title: `${O(p.Amount)} in escrow for you, locked by a condition`, detail: `Escrow from ${p.Account}. It needs the fulfillment (the secret matching its crypto-condition), which only whoever set it up has.`, xrp: 0, reserveXrp: 0, when: "info", tx: null }) : b === null || b <= s ? o.push({
          id: `escrow-${v}`,
          kind: "escrow_finish",
          title: `Finish an escrow: ${O(p.Amount)} is waiting for you`,
          detail: `Escrow from ${p.Account}${b ? `, matured ${R(b)?.slice(0, 10)}` : ""}${$ ? `, cancellable by its owner from ${R($)?.slice(0, 10)}` : ""}. Nothing moves until someone submits EscrowFinish; ${$ ? "finish it before then." : "it waits forever."}`,
          xrp: k,
          reserveXrp: 0,
          when: "now",
          tx: { TransactionType: "EscrowFinish", Account: n, Owner: p.Account, OfferSequence: B }
        }) : o.push({ id: `escrow-${v}`, kind: "escrow_waiting", title: `${O(p.Amount)} in escrow for you, maturing ${R(b)?.slice(0, 10)}`, detail: `Escrow from ${p.Account}. From ${R(b)} anyone can finish it; this scan will list the transaction then.`, xrp: k, reserveXrp: 0, when: "later", availableAt: R(b), tx: null }) : p.Account === n ? _ ? o.push({
          id: `escrow-${v}`,
          kind: "escrow_cancel",
          title: `Cancel an expired escrow: ${O(p.Amount)} comes back`,
          detail: `You escrowed it for ${p.Destination}${p.Destination === n ? " (yourself)" : ""}; it expired ${R($)?.slice(0, 10)} without being finished. Cancelling returns it and the ${a} XRP reserve it holds.`,
          xrp: k,
          reserveXrp: a,
          when: "now",
          tx: { TransactionType: "EscrowCancel", Account: n, Owner: n, OfferSequence: B }
        }) : $ !== null && p.Destination !== n && o.push({ id: `escrow-${v}`, kind: "escrow_waiting", title: `${O(p.Amount)} escrowed to ${p.Destination}, returnable ${R($)?.slice(0, 10)} if unfinished`, detail: "If the recipient has not finished it by then, you can cancel it back.", xrp: 0, reserveXrp: 0, when: "later", availableAt: R($), tx: null }) : p.Destination === n && _ && o.push({ id: `escrow-${v}`, kind: "escrow_waiting", title: `An escrow for you from ${p.Account} expired unfinished`, detail: `${O(p.Amount)} can now only go back to its owner.`, xrp: 0, reserveXrp: 0, when: "info", tx: null });
        break;
      }
      case "Check": {
        const k = typeof p.Expiration == "number" && p.Expiration <= s;
        if (p.Destination === n && !k) {
          const b = E(p.SendMax) ?? 0;
          o.push({
            id: `check-${v}`,
            kind: "check_cash",
            title: `Cash a check for up to ${O(p.SendMax)}`,
            detail: `Written to you by ${p.Account}${p.Expiration ? `, valid until ${R(p.Expiration)?.slice(0, 10)}` : ""}. It pays only what the writer still has when you cash it.`,
            xrp: b,
            reserveXrp: 0,
            when: "now",
            tx: { TransactionType: "CheckCash", Account: n, CheckID: v, Amount: p.SendMax },
            caution: "Checks are also sent as lures. Cashing one moves value to you and cannot hurt you; never visit a link that came with it."
          });
        } else p.Account === n ? o.push({
          id: `check-${v}`,
          kind: "check_cancel",
          title: `Cancel a check you wrote to ${p.Destination}${k ? " (expired)" : ""}`,
          detail: `${k ? "It can no longer be cashed." : `While it exists, ${p.Destination} can pull up to ${O(p.SendMax)} from you.`} Cancelling frees its ${a} XRP reserve.`,
          xrp: 0,
          reserveXrp: a,
          when: k ? "now" : "optional",
          tx: { TransactionType: "CheckCancel", Account: n, CheckID: v }
        }) : p.Destination === n && k && o.push({ id: `check-${v}`, kind: "check_cancel", title: `Clear an expired check from ${p.Account}`, detail: "It can no longer be cashed. Cancelling removes it (the reserve is the writer's).", xrp: 0, reserveXrp: 0, when: "optional", tx: { TransactionType: "CheckCancel", Account: n, CheckID: v } });
        break;
      }
      case "PayChannel": {
        if (p.Account !== n) break;
        const k = (E(p.Amount) ?? 0) - (E(p.Balance) ?? 0), b = [p.Expiration, p.CancelAfter].filter(($) => typeof $ == "number").sort(($, _) => $ - _)[0];
        b !== void 0 && b <= s ? o.push({
          id: `channel-${v}`,
          kind: "channel_close",
          title: `Close an expired payment channel: ${Ae(k)} comes back`,
          detail: `Channel to ${p.Destination}, expired ${R(b)?.slice(0, 10)}. Closing returns what was never claimed and its ${a} XRP reserve.`,
          xrp: k,
          reserveXrp: a,
          when: "now",
          tx: { TransactionType: "PaymentChannelClaim", Account: n, Channel: v, Flags: dt }
        }) : o.push({
          id: `channel-${v}`,
          kind: "channel_request_close",
          title: `Payment channel to ${p.Destination} holds ${Ae(k)} unclaimed`,
          detail: `Asking to close starts a ${Number(p.SettleDelay ?? 0).toLocaleString("en-US")}-second settle delay so ${p.Destination} can redeem claims you already signed; after that the rest (and the ${a} XRP reserve) comes back with a second close.${b ? ` It expires on its own ${R(b)?.slice(0, 10)}.` : ""}`,
          xrp: 0,
          reserveXrp: 0,
          when: "optional",
          availableAt: b ? R(b) : null,
          tx: { TransactionType: "PaymentChannelClaim", Account: n, Channel: v, Flags: dt },
          caution: "Only if the channel is finished with: the recipient loses the ability to redeem further claims."
        });
        break;
      }
      case "Offer": {
        if (p.Account !== n) break;
        const k = typeof p.Expiration == "number" && p.Expiration <= s;
        o.push({
          id: `offer-${v}`,
          kind: "offer_cancel",
          title: `${k ? "Remove an expired" : "Cancel an open"} DEX order: pay ${O(p.TakerGets)} for ${O(p.TakerPays)}`,
          detail: `${k ? "It can no longer fill but still holds" : "While it is open anyone can fill it at that price. It holds"} ${a} XRP of reserve.`,
          xrp: 0,
          reserveXrp: a,
          when: k ? "now" : "optional",
          tx: { TransactionType: "OfferCancel", Account: n, OfferSequence: p.Sequence }
        });
        break;
      }
      case "NFTokenOffer": {
        if (p.Owner !== n) break;
        const k = typeof p.Expiration == "number" && p.Expiration <= s, b = (Number(p.Flags ?? 0) & Ha) !== 0;
        o.push({
          id: `nftoffer-${v}`,
          kind: "nft_offer_cancel",
          title: `${k ? "Remove an expired" : "Cancel an open"} NFT ${b ? "sell" : "buy"} offer (${O(p.Amount)})`,
          detail: `NFT ${String(p.NFTokenID).slice(0, 16)}…${p.Destination ? `, only for ${p.Destination}` : ""}. It holds ${a} XRP of reserve${b && !k ? ", and while it is open the NFT can be taken at that price" : ""}.`,
          xrp: 0,
          reserveXrp: a,
          when: k ? "now" : "optional",
          tx: { TransactionType: "NFTokenCancelOffer", Account: n, NFTokenOffers: [v] }
        });
        break;
      }
      case "RippleState": {
        const k = te(p, n);
        if (!k.reserved || k.balance !== 0) break;
        const b = (Number(r.Flags ?? 0) & Xa) !== 0;
        o.push({
          id: `line-${v}`,
          kind: "trustline_remove",
          title: `Remove an empty trust line: ${C(k.currency)} from ${k.counterparty}`,
          detail: `Zero balance, and it holds ${a} XRP of reserve. Setting the limit to zero deletes it once every setting on your side is back to default.`,
          xrp: 0,
          reserveXrp: a,
          when: "optional",
          tx: {
            TransactionType: "TrustSet",
            Account: n,
            LimitAmount: { currency: k.currency, issuer: k.counterparty, value: "0" },
            ...b ? {} : { Flags: La }
          },
          caution: "If the line has a freeze or authorisation on your side, it stays until those are cleared too."
        });
        break;
      }
      case "DepositPreauth": {
        if (p.Account !== n || typeof p.Authorize != "string") break;
        o.push({ id: `preauth-${v}`, kind: "preauth_remove", title: `Withdraw ${p.Authorize}'s preauthorisation`, detail: `It lets ${p.Authorize} pay you while deposit authorisation is on, and holds ${a} XRP of reserve.`, xrp: 0, reserveXrp: a, when: "optional", tx: { TransactionType: "DepositPreauth", Account: n, Unauthorize: p.Authorize } });
        break;
      }
      case "Ticket": {
        o.push({ id: `ticket-${v}`, kind: "ticket_use", title: `Use up unused ticket ${p.TicketSequence}`, detail: `Each unused ticket holds ${a} XRP of reserve. A no-op AccountSet that spends the ticket releases it.`, xrp: 0, reserveXrp: a, when: "optional", tx: { TransactionType: "AccountSet", Account: n, Sequence: 0, TicketSequence: p.TicketSequence }, caution: "Skip it if you have transactions pre-signed against this ticket." });
        break;
      }
    }
  }
  const c = Number(r.Balance ?? 0) / 1e6, d = e.reserveBaseXrp + a * Number(r.OwnerCount ?? 0), l = { now: 0, optional: 1, later: 2, info: 3 };
  o.sort((p, v) => l[p.when] - l[v.when] || v.xrp + v.reserveXrp - (p.xrp + p.reserveXrp));
  const h = (p, v) => Math.round(p.reduce((k, b) => k + v(b), 0) * 1e6) / 1e6, g = o.filter((p) => p.when === "now"), f = [], u = (p) => e.objects.filter((v) => v.LedgerEntryType === p).length;
  u("Escrow") && f.push(`${u("Escrow")} escrow${u("Escrow") === 1 ? "" : "s"}`), u("PayChannel") && f.push(`${u("PayChannel")} payment channel${u("PayChannel") === 1 ? "" : "s"}`), u("Check") && f.push(`${u("Check")} check${u("Check") === 1 ? "" : "s"}`);
  const m = e.objects.filter((p) => p.LedgerEntryType === "RippleState" && te(p, n).balance !== 0).length;
  m && f.push(`${m} trust line${m === 1 ? "" : "s"} with a balance`), (e.nfts.length || u("NFTokenPage")) && f.push(`${e.nfts.length || "some"} NFTs`), (u("AMM") || r.AMMID) && f.push("an AMM"), Number(r.Sequence ?? 0) + 256 > e.ledgerIndex && f.push("its sequence is too recent (wait 256 ledgers, about 15 minutes)");
  const y = a, w = Math.max(0, Math.round((c - y) * 1e6) / 1e6);
  return {
    address: n,
    exists: !0,
    ledgerIndex: e.ledgerIndex,
    at: i,
    balanceXrp: c,
    lockedXrp: Math.round(d * 1e6) / 1e6,
    spendableXrp: Math.max(0, Math.round((c - d) * 1e6) / 1e6),
    items: o,
    recoverableNowXrp: h(g, (p) => p.xrp + p.reserveXrp),
    optionalReserveXrp: h(o.filter((p) => p.when === "optional"), (p) => p.reserveXrp),
    laterXrp: h(o.filter((p) => p.when === "later"), (p) => p.xrp),
    deletion: {
      possible: f.length === 0,
      returnsXrp: w,
      blockers: f,
      tx: f.length === 0 ? { TransactionType: "AccountDelete", Account: n, Destination: "<an account you own>", Fee: String(Math.round(y * 1e6)) } : null
    },
    complete: e.complete
  };
}
async function qa(e, t = Oe) {
  const n = {};
  for (const s of e.objects) {
    if (s.LedgerEntryType !== "Escrow" || typeof s.PreviousTxnID != "string") continue;
    const a = await t.request("tx", { transaction: s.PreviousTxnID, binary: !1 }).catch(() => null), o = a?.tx_json ?? a;
    if (o?.TransactionType !== "EscrowCreate") continue;
    const r = Number(o.TicketSequence ?? o.Sequence ?? 0);
    r > 0 && (n[String(s.index)] = r);
  }
  return n;
}
const Ua = 1, Ma = 8388608, za = 8, ja = 10;
function V(e) {
  const t = E(e);
  if (t !== null) return `${t.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;
  const n = e;
  return `${n?.value} ${C(String(n?.currency ?? ""))}`;
}
function Ba(e, t = []) {
  const n = e.address, s = e.closeTime, a = [], o = e.root;
  if (!o) return { address: n, exists: !1, ledgerIndex: e.ledgerIndex, exposures: [], atRiskXrp: 0, complete: !0 };
  const r = (l) => typeof l == "string" && t.includes(l);
  for (const l of e.objects) {
    const h = String(l.index ?? ""), g = typeof l.Expiration == "number" && l.Expiration <= s;
    switch (l.LedgerEntryType) {
      case "Check":
        l.Account === n && !g && a.push({
          id: `check-${h}`,
          risk: r(l.Destination) ? "low" : "high",
          kind: "check",
          title: `${l.Destination} can pull up to ${V(l.SendMax)} from you`,
          detail: `A check you wrote${l.Expiration ? `, valid until ${R(l.Expiration)?.slice(0, 10)}` : " with no expiry"}. It is cashable for as long as it exists.`,
          atRiskXrp: E(l.SendMax) ?? 0,
          revoke: { TransactionType: "CheckCancel", Account: n, CheckID: h }
        });
        break;
      case "NFTokenOffer": {
        if (l.Owner !== n || g || (Number(l.Flags ?? 0) & Ua) === 0) break;
        const f = (E(l.Amount) ?? Number(l.Amount?.value ?? 1)) === 0;
        a.push({
          id: `nft-${h}`,
          risk: f ? "high" : r(l.Destination) ? "low" : "medium",
          kind: "nft_sell_offer",
          title: `${l.Destination ? l.Destination : "Anyone"} can take NFT ${String(l.NFTokenID).slice(0, 12)}… for ${f ? "NOTHING" : V(l.Amount)}`,
          detail: f ? "A zero-price sell offer gives the NFT away to whoever accepts it. Phishing sites ask for exactly this signature, disguised as a claim or a verification. If you did not mean to give it away, cancel it now." : "An open sell offer: it fills the moment someone accepts it at that price.",
          atRiskXrp: 0,
          revoke: { TransactionType: "NFTokenCancelOffer", Account: n, NFTokenOffers: [h] }
        });
        break;
      }
      case "PayChannel": {
        if (l.Account !== n) break;
        const f = (E(l.Amount) ?? 0) - (E(l.Balance) ?? 0);
        a.push({
          id: `channel-${h}`,
          risk: r(l.Destination) ? "low" : "medium",
          kind: "payment_channel",
          title: `${l.Destination} can redeem claims on ${f.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`,
          detail: "A payment channel you fund. Every claim you have signed for it can be redeemed until it closes. Signing claims on a site you do not trust hands that XRP over.",
          atRiskXrp: f,
          revoke: { TransactionType: "PaymentChannelClaim", Account: n, Channel: h, Flags: 131072 },
          caution: "Closing starts the settle delay; the recipient can still redeem claims you already signed until it ends."
        });
        break;
      }
      case "Offer":
        if (l.Account !== n || g) break;
        a.push({
          id: `offer-${h}`,
          risk: "low",
          kind: "dex_offer",
          title: `Open order: pay ${V(l.TakerGets)} for ${V(l.TakerPays)}`,
          detail: "Anyone can fill it at that price, now or months from now. Old orders left open are filled when the market moves through them.",
          atRiskXrp: E(l.TakerGets) ?? 0,
          revoke: { TransactionType: "OfferCancel", Account: n, OfferSequence: l.Sequence }
        });
        break;
      case "DepositPreauth":
        if (l.Account !== n || typeof l.Authorize != "string") break;
        a.push({ id: `preauth-${h}`, risk: "low", kind: "deposit_preauth", title: `${l.Authorize} is preauthorised to pay you`, detail: "With deposit authorisation on, this sender's payments are accepted. Remove it if you no longer deal with them.", atRiskXrp: 0, revoke: { TransactionType: "DepositPreauth", Account: n, Unauthorize: l.Authorize } });
        break;
      case "Escrow":
        if (l.Account !== n || l.Destination === n) break;
        a.push({
          id: `escrow-${h}`,
          risk: "low",
          kind: "escrow",
          title: `${V(l.Amount)} escrowed to ${l.Destination}`,
          detail: typeof l.CancelAfter == "number" ? `Returnable to you if not finished by ${R(l.CancelAfter)?.slice(0, 10)}.` : "It has no cancel time: once it matures it can only go to the destination.",
          atRiskXrp: E(l.Amount) ?? 0,
          revoke: null
        });
        break;
      case "SignerList": {
        const f = (l.SignerEntries ?? []).map((u) => u.SignerEntry ?? u);
        for (const u of f)
          a.push({
            id: `signer-${u.Account}`,
            risk: r(u.Account) ? "low" : "medium",
            kind: "signer",
            title: `${u.Account} is a signer (weight ${u.SignerWeight} of quorum ${l.SignerQuorum})`,
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
    risk: r(o.RegularKey) ? "low" : "medium",
    kind: "regular_key",
    title: `${o.RegularKey} can sign for this account on its own`,
    detail: "The regular key has full power. If you do not recognise it, someone else can empty the account: open Incident Response.",
    atRiskXrp: Number(o.Balance ?? 0) / 1e6,
    revoke: { TransactionType: "SetRegularKey", Account: n },
    caution: "Removing the regular key when the master key is disabled and no signer list exists locks the account forever."
  }), typeof o.NFTokenMinter == "string" && a.push({ id: "nft-minter", risk: r(o.NFTokenMinter) ? "low" : "medium", kind: "nft_minter", title: `${o.NFTokenMinter} can mint NFTs in your name`, detail: "An authorised minter issues NFTs that name this account as issuer: fakes of your collection look genuine.", atRiskXrp: 0, revoke: { TransactionType: "AccountSet", Account: n, ClearFlag: ja } });
  const i = e.objects.some((l) => l.LedgerEntryType === "RippleState" && te(l, n).balance < 0);
  (Number(o.Flags ?? 0) & Ma) !== 0 && !i && a.push({
    id: "default-ripple",
    risk: "low",
    kind: "default_ripple",
    title: "Default Ripple is on, but this account issues nothing",
    detail: "Balances in the same currency from different issuers can ripple through your trust lines, swapping one issuer's IOU for another's without you acting. Only issuers need it.",
    atRiskXrp: 0,
    revoke: { TransactionType: "AccountSet", Account: n, ClearFlag: za },
    caution: "Clearing it affects new trust lines; set No Ripple on existing lines to close them too."
  });
  const c = { high: 0, medium: 1, low: 2 };
  a.sort((l, h) => c[l.risk] - c[h.risk] || h.atRiskXrp - l.atRiskXrp);
  const d = Math.round(a.filter((l) => l.kind !== "regular_key" && l.kind !== "escrow").reduce((l, h) => l + h.atRiskXrp, 0) * 1e6) / 1e6;
  return { address: n, exists: !0, ledgerIndex: e.ledgerIndex, exposures: a, atRiskXrp: d, complete: e.complete };
}
const Wa = (e) => /^03[0-9A-F]{38}$/i.test(e);
function Ga(e) {
  const t = e.address, n = [];
  if (!e.root) return { address: t, exists: !1, ledgerIndex: e.ledgerIndex, xrpBalance: 0, items: n, valuedXrp: 0, priced: !1, complete: !0 };
  for (const s of e.objects)
    if (s.LedgerEntryType === "RippleState") {
      const a = te(s, t);
      if (a.balance <= 0) continue;
      const o = Wa(a.currency);
      n.push({
        id: `line-${s.index}`,
        kind: o ? "lp_token" : "token",
        label: o ? `AMM pool share (${a.counterparty.slice(0, 8)}…)` : C(a.currency),
        amount: a.balance,
        currency: a.currency,
        issuer: a.counterparty,
        valueXrp: null,
        priceSource: null,
        ...Number(s.Flags ?? 0) & 4194304 || Number(s.Flags ?? 0) & 8388608 ? { note: "A freeze is set on this trust line: a frozen balance cannot be sold until it is lifted." } : {}
      });
    } else if (s.LedgerEntryType === "Offer" && s.Account === t) {
      const a = s.TakerGets, o = E(a);
      n.push({
        id: `offer-${s.index}`,
        kind: "open_order",
        label: `Open order selling ${o !== null ? `${o} XRP` : `${a?.value} ${C(String(a?.currency))}`}`,
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
async function Ka(e, t = Oe, n = 60) {
  const s = [];
  let a = 0;
  for (const r of e.items) {
    if (r.valueXrp !== null || a >= n) {
      s.push(r);
      continue;
    }
    a += 1;
    try {
      if (r.kind === "lp_token" && r.issuer) {
        const i = (await t.request("amm_info", { amm_account: r.issuer, ledger_index: "validated" })).amm, c = Number(i?.lp_token?.value ?? 0), d = E(i?.amount) ?? E(i?.amount2);
        if (i && c > 0 && d !== null) {
          s.push({ ...r, valueXrp: we(r.amount / c * d * 2), priceSource: "pool_share", note: `${(r.amount / c * 100).toPrecision(3)}% of the pool.` });
          continue;
        }
        s.push({ ...r, note: i ? "The pool has no XRP side; priced in its two tokens only." : "The pool no longer exists." });
        continue;
      }
      if (r.kind === "token" && r.issuer) {
        const i = { currency: r.currency, issuer: r.issuer }, [c, d] = await Promise.all([
          t.request("book_offers", { taker_gets: { currency: "XRP" }, taker_pays: i, limit: 5, ledger_index: "validated" }).catch(() => ({ offers: [] })),
          t.request("amm_info", { asset: { currency: "XRP" }, asset2: i, ledger_index: "validated" }).catch(() => null)
        ]), l = (c.offers ?? [])[0], h = l ? (E(l.taker_gets_funded ?? l.TakerGets) ?? 0) / Number((l.taker_pays_funded ?? l.TakerPays)?.value ?? 1 / 0) : 0, g = d?.amm, f = g ? (E(g.amount) ?? 0) / Number(g.amount2?.value ?? 1 / 0) : 0, u = Math.max(Number.isFinite(h) ? h : 0, Number.isFinite(f) ? f : 0);
        s.push(
          u > 0 ? { ...r, valueXrp: we(r.amount * u), priceSource: u === h ? "order_book" : "amm", note: [r.note, `${u.toPrecision(4)} XRP each at the ${u === h ? "best bid" : "AMM spot price"}.`].filter(Boolean).join(" ") } : { ...r, valueXrp: 0, priceSource: null, note: [r.note, "Nobody is bidding XRP for it on the DEX or an AMM pool."].filter(Boolean).join(" ") }
        );
        continue;
      }
      if (r.kind === "nft") {
        const i = await t.request("nft_buy_offers", { nft_id: r.currency, ledger_index: "validated", limit: 50 }).catch(() => ({ offers: [] })), c = Math.max(0, ...(i.offers ?? []).map((d) => E(d.amount) ?? 0));
        s.push(c > 0 ? { ...r, valueXrp: c, priceSource: "order_book", note: `Highest standing buy offer: ${c} XRP.` } : { ...r, valueXrp: 0, note: "No XRP buy offers stand for it." });
        continue;
      }
      s.push(r);
    } catch {
      s.push({ ...r, note: [r.note, "Could not be priced just now."].filter(Boolean).join(" ") });
    }
  }
  s.sort((r, i) => (i.valueXrp ?? -1) - (r.valueXrp ?? -1));
  const o = we(s.reduce((r, i) => r + (i.kind === "open_order" ? 0 : i.valueXrp ?? 0), 0));
  return { ...e, items: s, valuedXrp: o, priced: !0 };
}
const we = (e) => Math.round(e * 1e6) / 1e6, Ya = {
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
}, Va = 131072;
function lt(e) {
  if (e == null) return null;
  if (typeof e == "string" && /^\d+$/.test(e)) return `${(Number(e) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;
  const t = e;
  return `${t.value} ${C(String(t.currency ?? ""))}${t.issuer ? ` (issuer ${t.issuer})` : ""}`;
}
const Ja = (e) => typeof e == "number" ? new Date((e + 946684800) * 1e3).toISOString() : null;
function Qa(e) {
  return typeof e != "string" || !/^([0-9A-Fa-f]{2})+$/.test(e) ? null : new TextDecoder().decode(new Uint8Array((e.match(/../g) ?? []).map((t) => parseInt(t, 16))));
}
function Xt(e, t) {
  const n = t.map((s) => s.tx_json ?? s.tx ?? s).filter((s) => s.TransactionType === "Payment" && s.Destination === e && s.Account !== e);
  return n.length < 5 ? null : n.filter((s) => typeof s.DestinationTag == "number").length / n.length;
}
async function Za(e, t, n = {}) {
  const s = t.tx, a = s?.tx_json ?? s, o = s?.meta ?? {}, r = t.destination?.account_data ?? null, i = {
    result: o.TransactionResult ?? null,
    ledger: typeof s?.ledger_index == "number" ? s.ledger_index : null,
    at: Ja(a?.date ?? s?.date) ?? (typeof s?.close_time_iso == "string" ? s.close_time_iso : null),
    from: a?.Account ?? null,
    to: a?.Destination ?? null,
    destinationTag: typeof a?.DestinationTag == "number" ? a.DestinationTag : null,
    requested: lt(a?.DeliverMax ?? a?.Amount),
    delivered: lt(o.delivered_amount ?? o.DeliveredAmount),
    feeXrp: a?.Fee ? Number(a.Fee) / 1e6 : null,
    destinationDomain: Qa(r?.Domain),
    destinationRequiresTag: r ? (Number(r.Flags ?? 0) & Va) !== 0 : null,
    destinationExists: t.destination === null ? !1 : r ? !0 : null
  };
  if (!s || !a)
    return { hash: e, outcome: "not_found", headline: "No validated transaction has this hash", explanation: "The public ledger does not know it. Check the hash (it is 64 characters, from your wallet's history). If your wallet shows it as pending, it was never validated and nothing left your account.", steps: ["Copy the hash again from your wallet's transaction details.", "If it never validated, your balance was not changed: check it."], facts: i };
  if (a.TransactionType !== "Payment")
    return { hash: e, outcome: "not_payment", headline: `This is a ${a.TransactionType}, not a payment`, explanation: "This helper explains deposits. Open the transaction in Settlement Forensics for any other type.", steps: [], facts: i };
  const c = String(o.TransactionResult ?? "");
  if (c !== "tesSUCCESS") {
    const f = Ya[c] ?? `The payment failed with ${c}.`;
    return {
      hash: e,
      outcome: "failed_nothing_lost",
      headline: "The payment failed. Your funds never left your account.",
      explanation: `${f} A failed transaction still pays its fee (${i.feeXrp ?? 1e-5} XRP, destroyed), but nothing else moved: the amount is still in ${i.from}.`,
      steps: c === "tecDST_TAG_NEEDED" ? ["Get the destination tag from the exchange's deposit page.", "Send again with that tag."] : ["Fix the cause above, then send again.", "Check your balance: the amount is still there."],
      facts: i
    };
  }
  const d = o.delivered_amount ?? o.DeliveredAmount, l = a.DeliverMax ?? a.Amount;
  if (typeof d == "object" && typeof l == "object" && Number(d.value) < Number(l.value))
    return { hash: e, outcome: "partial_delivery", headline: `Only ${i.delivered} arrived, not ${i.requested}`, explanation: "This was a partial payment: the Amount field is a ceiling, not what arrived. A recipient must credit delivered_amount, which is what reached them.", steps: ["Compare with what the recipient credited.", "If they credited the Amount field, they were misled by the partial-payment flag."], facts: i };
  if (typeof d == "string" && typeof l == "string" && Number(d) < Number(l))
    return { hash: e, outcome: "partial_delivery", headline: `Only ${i.delivered} arrived, not ${i.requested}`, explanation: "This was a partial payment: the Amount field is a ceiling, not what arrived.", steps: [], facts: i };
  const h = i.destinationRequiresTag === !0 || (t.taggedShare ?? 0) >= 0.5, g = t.expectedTag !== void 0 && t.expectedTag !== null && i.destinationTag !== t.expectedTag;
  if (h && (i.destinationTag === null || g)) {
    const f = i.destinationTag === null ? "delivered_no_tag_custodial" : "delivered_tag_custodial", u = await ei(e, i, { expectedTag: t.expectedTag ?? null, generatedAt: n.generatedAt, customerRef: n.customerRef });
    return {
      hash: e,
      outcome: f,
      headline: i.destinationTag === null ? `${i.delivered} reached the service, without a destination tag` : `${i.delivered} reached the service with tag ${i.destinationTag}, not your tag ${t.expectedTag}`,
      explanation: `The payment succeeded: the funds are in ${i.to}${i.destinationDomain ? ` (which claims ${i.destinationDomain})` : ""}, a pooled account where the service credits each customer by tag. Without the right tag it cannot tell the deposit is yours, so it sits unassigned. Only the service can credit it, and services routinely do when given the facts below. Nobody else can move it, so ignore anyone offering to "recover" it for a fee.`,
      steps: [
        "Open a support ticket with the service from your logged-in account (never through a link someone sent you).",
        "Paste the letter below; attach it as a file if they allow.",
        "Expect them to ask you to prove you own the sending address, usually by a small payment or signing a message from it."
      ],
      facts: i,
      letter: u
    };
  }
  return !h && i.destinationExists !== !1 ? {
    hash: e,
    outcome: "delivered_private",
    headline: `${i.delivered} was delivered to ${i.to}`,
    explanation: "The payment succeeded to an account that does not require destination tags: most likely a personal wallet. Only whoever holds its key can send it back. If you meant to send elsewhere (a mistyped or poisoned address), the only route is asking the owner; if the account belongs to someone who tricked you, see Incident Response.",
    steps: ["Compare the destination with the address you meant, character by character.", "If you know the owner, ask them to return it.", "If it was a scam, open Incident Response to trace it and prepare a report."],
    facts: i
  } : { hash: e, outcome: "delivered", headline: `${i.delivered} was delivered to ${i.to}${i.destinationTag !== null ? ` with tag ${i.destinationTag}` : ""}`, explanation: "The payment succeeded with a destination tag. If the service has not credited it, give it the hash: it can look up the deposit directly.", steps: ["Send the service the transaction hash and the tag.", "Deposits are usually credited after a few ledgers; delays mean a manual review."], facts: i };
}
async function ei(e, t, n) {
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
  return { text: a, sha256: await Ta(a) };
}
async function ti(e, t) {
  const n = e.trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(n)) throw new Error("A transaction hash is 64 hexadecimal characters.");
  const s = await S("tx", { transaction: n, binary: !1 }).catch((i) => {
    if (/txnNotFound|not found/i.test(i instanceof Error ? i.message : String(i))) return null;
    throw i;
  }), a = (s?.tx_json ?? s)?.Destination, o = typeof a == "string" ? await S("account_info", { account: a, ledger_index: "validated" }).catch((i) => /actNotFound|not found/i.test(i instanceof Error ? i.message : String(i)) ? null : void 0) : void 0, r = typeof a == "string" && o ? await S("account_tx", { account: a, ledger_index_min: -1, ledger_index_max: -1, forward: !1, limit: 100 }).catch(() => null) : null;
  return Za(n, {
    tx: s && s.validated !== !1 ? s : null,
    destination: o === void 0 ? {} : o,
    expectedTag: t,
    taggedShare: r && typeof a == "string" ? Xt(a, r.transactions ?? []) : null
  });
}
async function Ne(e) {
  const t = "address" in e ? `address=${encodeURIComponent(e.address)}` : `domain=${encodeURIComponent(e.domain)}`, n = await fetch(`${ue}/noshashi-xrpl-watch/domain-verify?${t}`, { signal: AbortSignal.timeout(2e4) }), s = await n.json().catch(() => ({}));
  if (!n.ok || !s.check) throw new Error(s.message ?? `The domain check failed (HTTP ${n.status}).`);
  return { check: s.check, accounts: s.accounts };
}
const ni = {
  accountTx: (e, t, n) => S("account_tx", { account: e, ledger_index_min: -1, ledger_index_max: -1, forward: t, limit: n }),
  accountInfo: (e) => S("account_info", { account: e, ledger_index: "validated" }).catch((t) => {
    if (/actNotFound|not found/i.test(t instanceof Error ? t.message : String(t))) return null;
    throw t;
  }),
  sanctions: async (e) => (await ne(e))?.hits ?? null
}, Z = {
  standard: { depth: 2, maxAccounts: 40, perAccount: 200 },
  deep: { depth: 4, maxAccounts: 200, perAccount: 400 }
}, si = 131072, ai = 60;
function ut(e, t) {
  return (e.AffectedNodes ?? []).some((n) => n.CreatedNode?.LedgerEntryType === "AccountRoot" && n.CreatedNode?.NewFields?.Account === t);
}
function be(e) {
  const t = e.delivered_amount ?? e.DeliveredAmount;
  return typeof t == "string" && /^\d+$/.test(t) ? Number(t) / 1e6 : 0;
}
function ii(e) {
  const t = [];
  for (const n of e.Memos ?? []) {
    const s = (n.Memo ?? n).MemoData;
    if (typeof s != "string" || !/^([0-9A-Fa-f]{2})+$/.test(s)) continue;
    const o = new TextDecoder("utf-8", { fatal: !1 }).decode(new Uint8Array((s.match(/../g) ?? []).map((r) => parseInt(r, 16)))).replace(/\s+/g, " ").trim().toLowerCase();
    o.length >= 8 && /[a-z]/.test(o) && t.push(o.slice(0, 200));
  }
  return t;
}
function oi(e, t) {
  const n = [], s = /* @__PURE__ */ new Set();
  let a = 0;
  for (const o of t) {
    const r = o.tx_json ?? o.tx ?? o, i = o.meta ?? {};
    if (i.TransactionResult !== "tesSUCCESS") continue;
    const c = String(r.hash ?? o.hash ?? ""), d = Number(o.ledger_index ?? r.ledger_index ?? 0);
    if (r.Account === e) for (const l of ii(r)) s.add(l);
    r.TransactionType === "Payment" && typeof r.Destination == "string" && (r.Destination === e && r.Account !== e && ut(i, e) ? n.push({ from: r.Account, to: e, kind: "funded", hash: c, ledger: d, xrp: be(i) }) : r.Account === e && ut(i, r.Destination) && (a += 1, n.push({ from: e, to: r.Destination, kind: "funded", hash: c, ledger: d, xrp: be(i) }))), r.TransactionType === "AccountDelete" && typeof r.Destination == "string" && (r.Account === e || r.Destination === e) && n.push({ from: r.Account, to: r.Destination, kind: "swept", hash: c, ledger: d, xrp: be(i) });
  }
  return { links: n, memos: [...s], funded: a };
}
async function ri(e, t = {}) {
  const n = t.reader ?? ni, s = t.depth ?? Z.standard.depth, a = t.maxAccounts ?? Z.standard.maxAccounts, o = t.perAccount ?? Z.standard.perAccount, r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), c = [{ address: e, depth: 0 }];
  r.set(e, { address: e, depth: 0, exists: !0, balanceXrp: null, stop: null, sanction: null, memos: [] });
  let d = !1;
  for (; c.length; ) {
    const { address: u, depth: m } = c.shift(), y = r.get(u), w = await n.accountInfo(u).catch(() => {
    }), p = w?.account_data;
    if (y.exists = w !== null, p && (y.balanceXrp = Number(p.Balance ?? 0) / 1e6, u !== e && (Number(p.Flags ?? 0) & si) !== 0)) {
      y.stop = "service";
      continue;
    }
    const [v, k] = await Promise.all([
      n.accountTx(u, !0, 20).catch(() => ({ transactions: [] })),
      n.accountTx(u, !1, o).catch(() => ({ transactions: [] }))
    ]), b = [...v.transactions ?? [], ...k.transactions ?? []], $ = oi(u, b);
    if (y.memos = $.memos, $.funded > ai && u !== e) {
      y.stop = "hub";
      continue;
    }
    for (const _ of $.links) {
      i.set(`${_.hash}:${_.from}:${_.to}`, _);
      const x = _.from === u ? _.to : _.from;
      if (!r.has(x)) {
        if (r.size >= a) {
          d = !0;
          continue;
        }
        r.set(x, { address: x, depth: m + 1, exists: !0, balanceXrp: null, stop: null, sanction: null, memos: [] }), m + 1 <= s && c.push({ address: x, depth: m + 1 });
      }
    }
  }
  const l = [...r.values()], h = await n.sanctions(l.map((u) => u.address)).catch(() => null);
  for (const u of l) u.sanction = h?.[u.address] ?? null;
  const g = /* @__PURE__ */ new Map();
  for (const u of l) g.set(u.address.slice(-4).toLowerCase(), [...g.get(u.address.slice(-4).toLowerCase()) ?? [], u.address]);
  const f = /* @__PURE__ */ new Map();
  for (const u of l) for (const m of u.memos) f.set(m, (f.get(m) ?? /* @__PURE__ */ new Set()).add(u.address));
  return {
    seed: e,
    nodes: l,
    links: [...i.values()].sort((u, m) => u.ledger - m.ledger),
    vanity: [...g].filter(([, u]) => u.length >= 2).map(([u, m]) => ({ ending: u, accounts: m })),
    sharedMemos: [...f].filter(([, u]) => u.size >= 2).map(([u, m]) => ({ text: u, accounts: [...m] })),
    capped: d,
    sanctionsChecked: h !== null
  };
}
const ve = 3e3, ci = 1e4;
function di(e) {
  return e.map((t) => {
    const n = t.tx_json ?? t.tx ?? t;
    return { tx: n, meta: t.meta ?? {}, ledger: Number(t.ledger_index ?? n.ledger_index ?? 0), hash: String(n.hash ?? t.hash ?? "") };
  }).filter((t) => t.meta.TransactionResult === "tesSUCCESS").sort((t, n) => t.ledger - n.ledger);
}
const re = (e) => {
  const t = e.meta.delivered_amount ?? e.meta.DeliveredAmount;
  return typeof t == "string" && /^\d+$/.test(t) ? Number(t) : 0;
};
function li(e, t, n = 100) {
  const s = di(t), a = [], o = s.filter((i) => i.tx.Account === e);
  for (const i of o.filter((c) => c.tx.TransactionType === "SetRegularKey" || c.tx.TransactionType === "SignerListSet" || c.tx.TransactionType === "AccountSet" && c.tx.SetFlag === 4)) {
    const c = o.filter((d) => d.ledger >= i.ledger && d.ledger - i.ledger <= ve && d.hash !== i.hash && (d.tx.TransactionType === "AccountDelete" || d.tx.TransactionType === "Payment" && d.tx.Destination !== e && re(d) >= n * 1e6));
    if (c.length) {
      const d = c.reduce((l, h) => l + re(h), 0) / 1e6;
      a.push({
        id: "key_then_drain",
        severity: "critical",
        title: `Keys changed, then ${d.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP left within ${c[c.length - 1].ledger - i.ledger} ledgers`,
        detail: `${i.tx.TransactionType} in ledger ${i.ledger}, then ${c.length} outflow${c.length === 1 ? "" : "s"}. A thief adds a key of their own first so they can keep signing.`,
        evidence: [i.hash, ...c.map((l) => l.hash)],
        fromLedger: i.ledger,
        toLedger: c[c.length - 1].ledger
      });
      break;
    }
  }
  const r = o.find((i) => i.tx.TransactionType === "AccountDelete");
  if (r) {
    const i = o.filter((d) => d.tx.TransactionType === "Payment" && d.ledger <= r.ledger && re(d) > 0 && re(d) < ci), c = new Set(i.map((d) => d.tx.Destination));
    i.length >= 20 && c.size >= 10 && a.push({
      id: "spray_then_sweep",
      severity: "critical",
      title: `${i.length} dust payments to ${c.size} accounts, then the account deleted itself into ${r.tx.Destination}`,
      detail: "The pattern of a phishing relay: spray links or lookalike addresses into many histories, then pass the balance on and disappear.",
      evidence: [i[0].hash, i[i.length - 1].hash, r.hash],
      fromLedger: i[0].ledger,
      toLedger: r.ledger
    });
  }
  for (const i of o.filter((c) => c.tx.TransactionType === "NFTokenCreateOffer" && (Number(c.tx.Flags ?? 0) & 1) !== 0 && String(c.tx.Amount ?? "") === "0")) {
    const c = s.find((d) => d.tx.TransactionType === "NFTokenAcceptOffer" && d.tx.Account !== e && d.ledger >= i.ledger && d.ledger - i.ledger <= ve);
    c && a.push({ id: "nft_giveaway", severity: "critical", title: `An NFT was offered for nothing, and ${c.tx.Account} took it`, detail: `NFT ${String(i.tx.NFTokenID).slice(0, 16)}…: the zero-price offer in ledger ${i.ledger} was accepted in ledger ${c.ledger}.`, evidence: [i.hash, c.hash], fromLedger: i.ledger, toLedger: c.ledger });
  }
  for (const i of o.filter((c) => c.tx.TransactionType === "CheckCreate")) {
    const c = s.find((d) => d.tx.TransactionType === "CheckCash" && d.tx.Account === i.tx.Destination && d.ledger >= i.ledger && d.ledger - i.ledger <= ve);
    c && a.push({ id: "check_then_cash", severity: "warn", title: `A check to ${i.tx.Destination} was cashed ${c.ledger - i.ledger} ledgers after it was written`, detail: "Checks let the payee pull value later; a phishing site can ask for one signature and cash it at once.", evidence: [i.hash, c.hash], fromLedger: i.ledger, toLedger: c.ledger });
  }
  return a;
}
async function ui(e, t = 2) {
  const n = [];
  let s;
  for (let a = 0; a < t; a++) {
    const o = await S("account_tx", { account: e, ledger_index_min: -1, ledger_index_max: -1, forward: !1, limit: 200, ...s ? { marker: s } : {} });
    if (n.push(...o.transactions ?? []), s = o.marker, !s) break;
  }
  return { patterns: li(e, n), transactions: n.length };
}
const hi = 1;
function fi(e, t) {
  const n = e.address;
  if (!e.root) throw new Error("There is no account at this address to protect.");
  if (t.cold === n) throw new Error("The cold account must be a different account.");
  const s = String(t.feeDrops ?? 5e3), a = [], o = e.objects.filter((u) => u.LedgerEntryType === "NFTokenOffer" && u.Owner === n && (Number(u.Flags ?? 0) & hi) !== 0);
  for (let u = 0; u < o.length; u += 200) {
    const m = o.slice(u, u + 200);
    a.push({ id: `nft-offers-${u}`, title: `Cancel ${m.length} NFT sell offer${m.length === 1 ? "" : "s"}`, why: "Anyone holding one of these can take the NFT at its price, including a thief's own zero-price offer.", tx: { TransactionType: "NFTokenCancelOffer", Account: n, NFTokenOffers: m.map((y) => String(y.index)) } });
  }
  for (const u of e.objects.filter((m) => m.LedgerEntryType === "Check" && m.Account === n))
    a.push({ id: `check-${u.index}`, title: `Cancel the check to ${u.Destination}`, why: "Its payee can pull from the account until it is cancelled.", tx: { TransactionType: "CheckCancel", Account: n, CheckID: String(u.index) } });
  const r = Lt(e), i = r.deletion.blockers.filter((u) => !/sequence is too recent/.test(u)), c = Math.max(0, Number(e.root.OwnerCount ?? 0) - e.objects.length - e.nfts.length);
  (!e.complete || c > 0) && i.push(`${c || "some"} object${c === 1 ? "" : "s"} the read did not reach (NFT pages, for example)`);
  const d = i.length === 0;
  if (d)
    a.push({
      id: "sweep-delete",
      title: `Delete the account into ${t.cold}`,
      why: `AccountDelete sends every drop the account holds (${r.balanceXrp.toLocaleString("en-US")} XRP today, less its fee) to the cold account in one transaction, however the balance changes before it is submitted.`,
      tx: { TransactionType: "AccountDelete", Account: n, Destination: t.cold, Fee: String(Math.max(Number(s), Math.round(e.reserveIncXrp * 1e6))) },
      caution: "The account must be at least 256 ledgers past its last sequence when this is submitted. It is gone afterwards; anything sent to it later needs the reserve anew."
    });
  else {
    const u = e.objects.filter((y) => y.LedgerEntryType === "RippleState").map((y) => te(y, n)).filter((y) => y.balance > 0);
    for (const y of u)
      a.push({
        id: `token-${y.currency}-${y.counterparty}`,
        title: `Send the ${y.balance.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${C(y.currency)} to ${t.cold}`,
        why: "Tokens are taken as easily as XRP.",
        tx: { TransactionType: "Payment", Account: n, Destination: t.cold, Amount: { currency: y.currency, issuer: y.counterparty, value: String(y.balance) } },
        caution: `The cold account needs a trust line to ${y.counterparty} for ${C(y.currency)}, set before the emergency.`
      });
    a.push({
      id: "sweep-xrp",
      title: `Send the spendable XRP to ${t.cold}`,
      why: `AccountDelete is blocked by ${i.join(", ")}, so the XRP above the reserve is paid out instead.`,
      tx: { TransactionType: "Payment", Account: n, Destination: t.cold, Amount: "0" },
      caution: "The amount is fixed when signed, leaving the fees of the kit (and the reserve of its unused tickets) behind. If the balance has fallen by the time it is submitted, it fails: rebuild it with the amount shown then."
    });
    const m = e.objects.filter((y) => y.LedgerEntryType === "Offer" && y.Account === n);
    for (const y of m) a.push({ id: `offer-${y.index}`, title: `Cancel order ${y.Sequence}`, why: "An open order can be filled at a stale price while you are busy.", tx: { TransactionType: "OfferCancel", Account: n, OfferSequence: y.Sequence } });
  }
  d || (t.newRegularKey ? (a.push({ id: "rotate", title: "Hand signing to a new key", why: "A thief holding the old regular key loses it.", tx: { TransactionType: "SetRegularKey", Account: n, RegularKey: t.newRegularKey } }), a.push({ id: "disable-master", title: "Disable the master key", why: "If the master seed is what leaked, this is the only way to stop it signing.", tx: { TransactionType: "AccountSet", Account: n, SetFlag: 4 }, caution: "Only after the new regular key has signed a test transaction, or the account locks for good." })) : a.push({ id: "rotate", title: "Hand signing to a new key", why: "Choose a key from a hardware wallet that never held this seed.", tx: { TransactionType: "SetRegularKey", Account: n, RegularKey: "<a new key's address>" } }));
  const l = a.map((u, m) => ({ ...u, order: m + 1 }));
  let h = null;
  t.useTickets && (h = { TransactionType: "TicketCreate", Account: n, TicketCount: l.length, Fee: s }, l.forEach((u, m) => {
    u.tx = { ...u.tx, Sequence: 0, TicketSequence: `<ticket ${m + 1} from the TicketCreate>` };
  }));
  for (const u of l) u.tx.Fee || (u.tx.Fee = s);
  const g = l.find((u) => u.id === "sweep-xrp");
  if (g) {
    const u = l.reduce((w, p) => w + Number(p.tx.Fee), 0) + (h ? Number(s) : 0), m = h ? l.length - g.order + 1 : 0, y = Math.max(0, Math.floor(r.spendableXrp * 1e6 - u - m * Math.round(e.reserveIncXrp * 1e6)));
    g.tx.Amount = String(y), g.title = `Send the spendable ${(y / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP to ${t.cold}`;
  }
  const f = [
    "Submit the steps in order, as fast as you can: a thief with the key is racing you.",
    t.useTickets ? "Sign the TicketCreate now, read the ticket numbers it creates, fill them in and sign every step now. Keep the signed kit offline; it stays valid whatever happens to the account's sequence." : "Signing needs the account's current key: prepare the kit now, sign it the moment it is needed.",
    `Each ticket and each open object holds ${e.reserveIncXrp} XRP of reserve while it exists.`
  ];
  return { address: n, cold: t.cold, steps: l, tickets: h, sweepsEverything: d, notes: f };
}
const Ht = (e) => typeof e == "string" && /^([0-9A-Fa-f]{2})+$/.test(e) ? new TextDecoder().decode(new Uint8Array((e.match(/../g) ?? []).map((t) => parseInt(t, 16)))) : null;
function ht(e, t, n, s, a = 0) {
  const o = t?.account_data ?? null;
  if (!o) return { address: e, kind: "not_found", name: null, confidence: "none", evidence: ["No account exists at this address."], advice: "Nothing is held here now. If value passed through, follow where it went in Incident Response." };
  const r = [], i = (Number(o.Flags ?? 0) & 131072) !== 0, c = Xt(e, n);
  i && r.push("It requires a destination tag on every incoming payment."), c !== null && r.push(`${Math.round(c * 100)}% of the incoming payments read carried a destination tag.`), a > 0 && r.push("It has issued tokens other accounts hold.");
  const d = Ht(o.Domain);
  d && r.push(`Its Domain field names ${d}.`), s && r.push(s.detail);
  const l = i || (c ?? 0) >= 0.5, h = l ? "custodial_service" : a > 0 ? "issuer" : "personal_or_unknown";
  return s?.status === "verified" ? {
    address: e,
    kind: h,
    name: s.domain,
    confidence: "verified",
    evidence: r,
    advice: h === "custodial_service" ? `Contact ${s.domain} through the support pages on its own website, with the transaction hashes and destination tags, and ask it to freeze the deposit. A police report number makes it act faster.` : `${s.domain} vouches for this account.`
  } : d ? {
    address: e,
    kind: h,
    name: d,
    confidence: "claimed",
    evidence: r,
    advice: `The account claims ${d}, but the site does not confirm it. Contact ${d} through its own website, never through a link found on the ledger, and say the claim is unverified.`
  } : l ? { address: e, kind: h, name: null, confidence: "behaviour", evidence: r, advice: "A service pooling customers' funds, which does not name itself. Law enforcement can ask the major exchanges to identify it; include the tags and hashes." } : { address: e, kind: h, name: null, confidence: "none", evidence: r.length ? r : ["Nothing on the ledger identifies who controls it."], advice: "Nothing identifies the owner. Only the key holder can move what it holds." };
}
async function gi(e) {
  const t = await S("account_info", { account: e, ledger_index: "validated" }).catch((r) => {
    if (/actNotFound|not found/i.test(r instanceof Error ? r.message : String(r))) return null;
    throw r;
  });
  if (!t) return ht(e, null, [], null);
  const [n, s, a] = await Promise.all([
    S("account_tx", { account: e, ledger_index_min: -1, ledger_index_max: -1, forward: !1, limit: 100 }).catch(() => ({ transactions: [] })),
    Ht(t.account_data?.Domain) ? Ne({ address: e }).then((r) => r.check).catch(() => null) : Promise.resolve(null),
    S("gateway_balances", { account: e, ledger_index: "validated" }).catch(() => null)
  ]), o = Object.values(a?.obligations ?? {}).reduce((r, i) => r + (Number(i) || 0), 0);
  return ht(e, t, n.transactions ?? [], s, o);
}
function pi(e) {
  const t = e.tx_json ?? e.tx ?? e, n = e.meta ?? {};
  if (n.TransactionResult !== "tesSUCCESS") return [];
  const s = [];
  for (const a of n.AffectedNodes ?? []) {
    const o = a.ModifiedNode ?? a.DeletedNode;
    if (!o || o.LedgerEntryType !== "Offer") continue;
    const r = o.PreviousFields;
    if (!r || !("TakerGets" in r || "TakerPays" in r)) continue;
    const i = String(o.FinalFields?.Account ?? "");
    i && i !== t.Account && s.push({ hash: String(t.hash ?? ""), ledger: Number(e.ledger_index ?? t.ledger_index ?? 0), taker: String(t.Account), maker: i });
  }
  return s;
}
function ft(e, t, n = {}) {
  const s = /* @__PURE__ */ new Map(), a = (f) => (s.has(f) || s.set(f, { account: f, placed: 0, replaced: 0, cancelled: 0, filledAsMaker: 0, tookAsTaker: 0 }), s.get(f)), o = [];
  let r = 1 / 0, i = 0;
  for (const f of t) {
    const u = f.tx_json ?? f.tx ?? f, m = Number(f.ledger_index ?? u.ledger_index ?? 0);
    if (r = Math.min(r, m), i = Math.max(i, m), (f.meta ?? {}).TransactionResult !== "tesSUCCESS") continue;
    const y = String(u.Account ?? "");
    if (u.TransactionType === "OfferCreate") {
      const w = a(y);
      w.placed += 1, typeof u.OfferSequence == "number" && (w.replaced += 1);
    } else u.TransactionType === "OfferCancel" && (a(y).cancelled += 1);
    for (const w of pi(f))
      o.push(w), a(w.maker).filledAsMaker += 1, a(w.taker).tookAsTaker += 1;
  }
  const c = [...s.values()].sort((f, u) => u.placed + u.cancelled - (f.placed + f.cancelled)), d = [], l = c.reduce((f, u) => f + u.placed + u.cancelled, 0);
  for (const f of c) {
    const u = f.replaced + f.cancelled;
    f.placed >= 20 && u / f.placed >= 0.8 && f.filledAsMaker === 0 && d.push({
      id: `quote-churn-${f.account}`,
      severity: "warn",
      title: `${f.account} placed ${f.placed} orders, replaced or cancelled ${u}, and none filled`,
      detail: `Over ledgers ${r.toLocaleString("en-US")}–${i.toLocaleString("en-US")}. Depth that is constantly re-quoted and never trades makes the book look deeper than it is: check what can actually be filled before relying on the quoted price.`,
      accounts: [f.account]
    });
  }
  const h = c[0];
  h && l >= 20 && (h.placed + h.cancelled) / l >= 0.5 && d.push({
    id: "concentration",
    severity: "info",
    title: `One account supplied ${Math.round((h.placed + h.cancelled) / l * 100)}% of the order activity`,
    detail: `${h.account}: ${h.placed + h.cancelled} of ${l} order placements and cancellations in the transactions read.`,
    accounts: [h.account]
  });
  const g = o.filter((f) => n[f.maker] && n[f.maker] === n[f.taker]);
  if (g.length) {
    const f = [...new Set(g.map((u) => `${u.taker} ↔ ${u.maker}`))];
    d.push({ id: "self-cluster-trades", severity: "warn", title: `${g.length} trade${g.length === 1 ? "" : "s"} between accounts funded by the same account`, detail: `${f.slice(0, 5).join("; ")}. Trading between accounts of one owner moves the price and volume without changing who holds what.`, accounts: [...new Set(g.flatMap((u) => [u.maker, u.taker]))] });
  }
  return d.length || d.push({ id: "nothing", severity: "info", title: "No manipulation indicators in the transactions read", detail: `${t.length} transactions, ${o.length} trade${o.length === 1 ? "" : "s"}.`, accounts: [] }), { issuer: e, transactions: t.length, ledgers: { from: r === 1 / 0 ? 0 : r, to: i }, traders: c, fills: o, findings: d };
}
async function mi(e, t = 3) {
  const n = [];
  let s;
  for (let i = 0; i < t; i++) {
    const c = await S("account_tx", { account: e, ledger_index_min: -1, ledger_index_max: -1, forward: !1, limit: 200, ...s ? { marker: s } : {} });
    if (n.push(...c.transactions ?? []), s = c.marker, !s) break;
  }
  const a = ft(e, n), o = [.../* @__PURE__ */ new Set([...a.traders.slice(0, 10).map((i) => i.account), ...a.fills.flatMap((i) => [i.maker, i.taker])])].slice(0, 30), r = {};
  for (const i of o) {
    const d = ((await S("account_tx", { account: i, ledger_index_min: -1, ledger_index_max: -1, forward: !0, limit: 1 }).catch(() => null))?.transactions ?? [])[0], l = d?.tx_json ?? d?.tx;
    l?.TransactionType === "Payment" && l.Destination === i && (r[i] = String(l.Account));
  }
  return ft(e, n, r);
}
const yi = 3;
async function wi(e) {
  return ((await S("account_tx", { account: e, ledger_index_min: -1, ledger_index_max: -1, forward: !0, limit: 1 })).transactions ?? [])[0] ?? null;
}
async function bi(e, t = yi) {
  const n = [];
  let s = e;
  const a = /* @__PURE__ */ new Set();
  for (; s && n.length < t && !a.has(s); ) {
    a.add(s);
    let o;
    try {
      o = ca(s, await wi(s));
    } catch {
      o = { account: s, fundedBy: null, activatedLedger: null };
    }
    n.push(o), s = o.fundedBy;
  }
  return n;
}
const gt = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
async function qt(e) {
  const t = [...new Set(e.filter((n) => gt.test(n)))].slice(0, 50);
  if (!t.length) return {};
  try {
    const n = await fetch(`${ue}/noshashi-xrpl-watch/threats?addresses=${t.join(",")}`, { signal: AbortSignal.timeout(8e3) });
    if (!n.ok) return null;
    const s = await n.json(), a = {};
    for (const o of s.hits ?? [])
      gt.test(o.address) && (a[o.address] = { address: o.address, reports: o.reports, categories: o.categories, firstConfirmed: o.first_confirmed, evidenceTx: o.evidence_tx ?? [] });
    return a;
  } catch {
    return null;
  }
}
async function vi(e) {
  const t = da(e);
  if (!t) throw new Error("That is not a public domain name or link.");
  const n = await fetch(`${ue}/noshashi-xrpl-watch/phishing?domain=${encodeURIComponent(t)}`, { signal: AbortSignal.timeout(1e4) }), s = await n.json().catch(() => ({}));
  if (!n.ok) throw new Error(s.message ?? `The phishing check failed (HTTP ${n.status}).`);
  return s;
}
async function ki(e) {
  const [t, n, s] = await Promise.all([
    S("ledger", { ledger_index: "validated" }),
    S("account_info", { account: e.destination, ledger_index: "validated" }).catch((f) => f instanceof F && f.code === "actNotFound" ? null : Promise.reject(f)),
    S("server_info", {})
  ]), a = Number(t.ledger_index ?? t.ledger?.ledger_index), o = Number(s.info?.validated_ledger?.reserve_base_xrp);
  if (!Number.isFinite(o) || o <= 0) throw new Error("The base reserve could not be read.");
  const r = n ? await bi(e.destination) : [{ account: e.destination, fundedBy: null, activatedLedger: null }], i = r.map((f) => f.account), [c, d] = await Promise.all([ne(i), qt(i)]), l = [...c === null ? ["the OFAC SDN list"] : [], ...d === null ? ["the scam registry"] : []], h = ua({
    destination: e.destination,
    destinationTag: e.destinationTag,
    amountXrp: e.amountXrp,
    destinationInfo: n,
    chain: r,
    currentLedger: a,
    reserveBaseXrp: o,
    sanctions: c?.hits ?? {},
    threats: d ?? {},
    previousDestinations: e.previousDestinations,
    ownAddresses: e.ownAddresses
  }), g = l.length && h.verdict === "clear" ? "review" : h.verdict;
  return { ...h, verdict: g, chain: r, ledger: a, unchecked: l };
}
const Ut = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/, Si = /^[0-9A-Fa-f]{64}$/;
class j extends Error {
}
function I(e, t = "address") {
  const n = String(e[t] ?? "").trim();
  if (!Ut.test(n)) throw new j(`${t} must be a classic XRPL address starting with r.`);
  return n;
}
function ke(e, t) {
  const n = String(e[t] ?? "").trim();
  if (!Si.test(n)) throw new j(`${t} must be 64 hexadecimal characters.`);
  return n;
}
const T = (e, t = Object.keys(e)) => ({ type: "object", properties: e, required: t, additionalProperties: !1 }), A = (e) => ({ type: "string", description: e }), $i = [
  {
    name: "search_noshashi",
    description: "Search NOSHASHI's own pages and help: every app screen and button, features, plans and prices, the Learn course and word list, docs (API, webhooks, receipts, policies, security, enterprise), trust, legal and privacy. Use it for any question about the product, what a customer should use, or how NOSHASHI handles compliance. Returns passages with their page address.",
    input_schema: T({ query: { type: "string", description: "What to look up, in plain words" } }),
    feature: null,
    screen: "NOSHASHI pages",
    run: async (e) => {
      const t = String(e.query ?? "").trim();
      if (!t) throw new j("query is empty.");
      const n = await Pt(t, 6);
      return n.length === 0 ? "Nothing in NOSHASHI's pages matches that. Say so rather than guess." : n.map((s) => ({ title: s.title, source: s.source, text: s.text }));
    }
  },
  {
    name: "ledger_status",
    description: "The latest validated XRP Ledger: index, hash, close time, reference fee and open-ledger fee. Call this to stamp an answer with the ledger it describes.",
    input_schema: T({}),
    feature: null,
    screen: "Mission Control",
    run: () => hn()
  },
  {
    name: "ledger_sync",
    description: "What four public XRPL servers each report right now (ledger index, state, fees) and where they disagree.",
    input_schema: T({}),
    feature: null,
    screen: "Ledger Sync",
    run: () => Rs(3e4)
  },
  {
    name: "check_address",
    description: "What the ledger publishes about an account before someone pays it: existence, age, destination tag requirement, flags and anything recorded against it. Reports facts, never 'safe'.",
    input_schema: T({ address: A("Classic address, r…") }),
    feature: null,
    screen: "Check an Address",
    run: async (e, t) => {
      const n = I(e), s = !t.has("portfolios");
      if (s && !t.spendFreeCheck())
        throw new j("This month's 10 free address checks are used up. Pro includes unlimited checks.");
      const a = await An(n);
      if (a.verdict === "unknown" && !a.exists && a.findings.length === 0)
        throw s && t.refundFreeCheck?.(), new Error("The ledger could not be reached, so nothing about this address is known yet. Try again in a moment.");
      return a;
    }
  },
  {
    name: "read_claims",
    description: "Tokens and claims other accounts have sent to an address, and whether each is real or an impersonation (a familiar ticker from an issuer with no obligations).",
    input_schema: T({ address: A("Classic address whose inbox to read") }),
    feature: null,
    screen: "Inbox",
    run: (e) => hs(I(e))
  },
  {
    name: "read_token_rights",
    description: "What an NFT's issuer can still do after someone owns it: burnable, transferable, transfer fee, taxon.",
    input_schema: T({ token_id: A("The 64-character NFTokenID") }),
    feature: null,
    screen: "Token Rights",
    run: (e) => _s(ke(e, "token_id"))
  },
  {
    name: "certify_authority",
    description: "The six issuer checks (freeze surrendered, not globally frozen, open holding, no single key controls the issuer, transfer fee, supply concentration) with GO/HOLD/NO-GO, ledger index and SHA-256 digest.",
    input_schema: T({ issuer: A("Issuer's classic address") }),
    feature: "authority_certificate",
    screen: "Authority",
    run: (e) => Bs(I(e, "issuer"), { walkSupply: !1 })
  },
  {
    name: "read_provenance",
    description: "Where an account came from: its real age (corrected for the Sequence misreading) and the account that first funded it.",
    input_schema: T({ address: A("Counterparty address") }),
    feature: "portfolios",
    screen: "Provenance",
    run: (e) => Ln(I(e))
  },
  {
    name: "read_book",
    description: "An order book's listed versus funded depth (offers whose owners can really fill them), the unfunded share, spread and mid price. The book is the currency against XRP.",
    input_schema: T({
      currency: { type: "string", description: "Currency code, e.g. USD, or a 40-character hex code" },
      issuer: A("Issuer's classic address")
    }),
    feature: "portfolios",
    screen: "Order Book",
    run: (e) => {
      const t = String(e.currency ?? "").trim();
      if (!/^([A-Za-z0-9]{3}|[0-9A-Fa-f]{40})$/.test(t))
        throw new j("currency must be a 3-character code or 40 hexadecimal characters.");
      return jn(t, I(e, "issuer"));
    }
  },
  {
    name: "read_settlement",
    description: "What a transaction actually delivered: type, sender, result, whether the partial-payment flag was set, requested versus delivered amount, and the fee burned.",
    input_schema: T({ hash: A("Transaction hash, 64 hexadecimal characters") }),
    feature: "portfolios",
    screen: "Settlement",
    run: (e) => Kn(ke(e, "hash"))
  },
  {
    name: "read_control_surface",
    description: "Who can move an account's funds: master key status, regular key, signer list and quorum, the fewest signers that reach quorum, master-key bypass, and XRP locked in reserve.",
    input_schema: T({ address: A("Treasury or issuer address") }),
    feature: "portfolios",
    screen: "Control Surface",
    run: (e) => At(I(e))
  },
  {
    name: "read_pool",
    description: "An AMM pool's balances, trading fee, fee votes weighted by LP tokens, and who holds the auction slot.",
    input_schema: T({ amm_account: A("The AMM pool's own account address") }),
    feature: "portfolios",
    screen: "Pool Governance",
    run: (e) => Qn({ ammAccount: I(e, "amm_account") })
  },
  {
    name: "read_issuance",
    description: "A token from the issuer's side: currencies issued, outstanding obligations, holder lines read, the largest holder, concentration, and enforcement history (freezes and clawbacks).",
    input_schema: T({ issuer: A("Issuer's classic address") }),
    feature: "issuance_surveillance",
    screen: "Issuance",
    run: (e) => Et(I(e, "issuer"))
  },
  {
    name: "security_check",
    description: "How hard an XRP Ledger account is to take over: who can sign (master key, regular key, signer list and its real quorum), recent key and settings changes, address-poisoning attempts against it, the doors strangers can use (NFT offers, checks, payment channels), a 0–100 score, and an unsigned hardening plan to sign in the owner's own wallet.",
    input_schema: T({ address: A("The account to check, r…") }),
    feature: null,
    screen: "Security Center",
    run: async (e) => {
      const t = await nt(I(e));
      return { posture: { ...t, events: t.events.slice(0, 10) }, assessment: ya(t) };
    }
  },
  {
    name: "investigate_hack",
    description: "For an account that was drained or hacked: the key changes before it, the stolen value followed hop by hop (payments and AccountDelete sweeps, past the dust), what became of every account it reached, and every recovery path that exists. Validated XRP Ledger transactions cannot be reversed; this says which off-ledger paths apply.",
    input_schema: T(
      {
        address: A("The drained account, r…"),
        from_ledger: { type: "number", description: "Ledger the incident began at, if known" }
      },
      ["address"]
    ),
    feature: "incident_response",
    screen: "Security Center › Incident Response",
    run: async (e, t) => {
      const n = I(e), s = await nt(n, 400), a = Number(e.from_ledger), o = [...s.events].reverse().find((d) => d.kind === "regular_key_set" || d.kind === "signer_list_set"), r = Number.isInteger(a) && a > 0 ? a : o?.ledger ?? Math.max(1, s.ledgerIndex - 21600 * 30), i = t.has("forensic_trace") ? le.deep : le.standard, c = await Sa(n, { sinceLedger: r, depth: i.depth, perAccount: i.perAccount });
      return {
        signals: _a(n, s.events, c.flows),
        trace: { ...c, flows: c.flows.slice(0, 40) },
        options: $a(c, { stillHoldsXrp: s.exists ? s.balanceXrp : 0, keyEvents: s.events })
      };
    }
  },
  {
    name: "explain_transaction",
    description: "Before signing: what a transaction really does, from its JSON or the hex blob a site asks you to sign. Decoded locally. Flags new regular keys and signer lists, disabled master keys, AccountDelete, NFTs sold for nothing, partial payments, sanctioned destinations, high fees and links in memos, with a verdict: SAFE-LOOKING, CAREFUL or DO NOT SIGN.",
    input_schema: T({ transaction: { type: "string", description: "The transaction JSON, or its hex blob" } }),
    feature: null,
    screen: "Security Center › Pre-sign check",
    run: async (e) => {
      const { tx: t, format: n } = await Ea(String(e.transaction ?? "")), s = await ne(Da(t));
      return Ra(t, n, { sanctioned: s?.hits });
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
    input_schema: T({ address: A("The account to scan, r…") }),
    feature: null,
    screen: "Security Center › Recover funds",
    run: async (e) => {
      const t = await oe(I(e));
      return Lt(t, await qa(t));
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
    input_schema: T({ address: A("The account to audit, r…") }),
    feature: null,
    screen: "Security Center › Exposure audit",
    run: async (e) => Ba(await oe(I(e))),
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
    input_schema: T({ address: A("The account, r…") }),
    feature: null,
    screen: "Security Center › Recover funds",
    run: async (e, t) => {
      const n = Ga(await oe(I(e)));
      return t.has("asset_recovery") ? Ka(n) : n;
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
    input_schema: T(
      { hash: A("The transaction hash, 64 hexadecimal characters"), expected_tag: { type: "number", description: "The destination tag the person should have used, if known" } },
      ["hash"]
    ),
    feature: null,
    screen: "Security Center › Deposit help",
    run: (e) => {
      const t = Number(e.expected_tag);
      return ti(ke(e, "hash"), Number.isInteger(t) ? t : null);
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
    input_schema: T({ address: A("An account, r… (or leave empty and give domain)"), domain: { type: "string", description: "A domain such as example.com" } }, []),
    feature: null,
    screen: "Security Center › Domain check",
    run: (e) => {
      const t = String(e.address ?? "").trim();
      if (Ut.test(t)) return Ne({ address: t });
      const n = String(e.domain ?? "").trim();
      if (!n) throw new j("Give an address or a domain.");
      return Ne({ domain: n });
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
    input_schema: T({ address: A("A known scam account, r…") }),
    feature: "asset_recovery",
    screen: "Security Center › Scam clusters",
    run: (e, t) => ri(I(e), t.has("forensic_trace") ? Z.deep : Z.standard),
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
  },
  {
    name: "drainer_check",
    description: "Whether an account is being drained right now, from its latest transactions: keys changed and then value out, a spray of dust payments followed by an AccountDelete, a zero-price NFT offer taken by someone else, or a check cashed at once. Each pattern names its transactions.",
    input_schema: T({ address: A("The account, r…") }),
    feature: null,
    screen: "Security Center › Emergency kit",
    run: (e) => ui(I(e)),
    compose: (e) => {
      const t = e;
      return t.patterns.length ? [
        ...t.patterns.map((n) => `[${n.id.replace(/_/g, " ").toUpperCase()}] ${n.title}. ${n.detail} Evidence: ${n.evidence.map((s) => s.slice(0, 12) + "…").join(", ")}`),
        "If the account is yours and a pattern is live, prepare the EMERGENCY KIT in the Security Center now."
      ].join(`
`) : `No drainer pattern in the last ${t.transactions} transactions.`;
    }
  },
  {
    name: "emergency_kit",
    description: "For a compromised account: the ordered, unsigned transactions that save the most: cancel what others can pull (NFT sell offers, checks), move every token and the spendable XRP to a cold account (or AccountDelete when nothing blocks it), then hand signing to a new key.",
    input_schema: T({ address: A("The compromised account, r…"), cold: A("A cold account the owner controls, r…") }),
    feature: null,
    screen: "Security Center › Emergency kit",
    run: async (e) => fi(await oe(I(e)), { cold: I(e, "cold") }),
    compose: (e) => {
      const t = e;
      return [
        `Emergency kit for ${t.address} → ${t.cold}: ${t.steps.length} step${t.steps.length === 1 ? "" : "s"}${t.sweepsEverything ? ", sweeping everything in one AccountDelete" : ""}.`,
        ...t.steps.map((n) => `${n.order}. ${n.title}. ${n.why}${n.caution ? ` Caution: ${n.caution}` : ""} Transaction: ${JSON.stringify(n.tx)}`),
        ...t.notes,
        "NOSHASHI never signs: sign each step in your own wallet, in order."
      ].join(`
`);
    }
  },
  {
    name: "who_is",
    description: "Who runs an address: a domain that vouches for it in its xrp-ledger.toml, a domain it merely claims, or the behaviour of an exchange or other service pooling customers' funds (required destination tags). With what to do next, for a theft victim asking an exchange to freeze a deposit.",
    input_schema: T({ address: A("The address, r…") }),
    feature: null,
    screen: "Security Center › Who is this?",
    run: (e) => gi(I(e)),
    compose: (e) => {
      const t = e;
      return [`${t.address}: ${t.name ?? "unnamed"} (${t.kind.replace(/_/g, " ")}, ${t.confidence}).`, ...t.evidence.map((n) => `· ${n}`), t.advice].join(`
`);
    }
  },
  {
    name: "scam_registry",
    description: "Whether addresses are in the shared scam registry: reports filed by institutions with transaction evidence and confirmed by a NOSHASHI reviewer who did not file them. Categories, how many organizations and since when; never who reported.",
    input_schema: T({ address: A("The address, r…") }),
    feature: null,
    screen: "Security Center › Scam registry",
    run: async (e) => {
      const t = I(e), n = await qt([t]);
      if (n === null) throw new Error("The scam registry could not be reached.");
      return { address: t, hit: n[t] ?? null };
    },
    compose: (e) => {
      const t = e;
      return t.hit ? `${t.address} is in the scam registry: ${t.hit.categories.join(", ")}, confirmed in ${t.hit.reports} report${t.hit.reports === 1 ? "" : "s"} since ${t.hit.firstConfirmed.slice(0, 10)}.` : `${t.address} has no confirmed report in the scam registry. That is not a clearance.`;
    }
  },
  {
    name: "check_link",
    description: "Whether a domain or link has been advertised in XRP dust on the ledger, the way wallet drainers spread their sites: how many accounts it was sent to, by how many senders, when, and a sample memo. Read from a validated ledger every minute.",
    input_schema: T({ domain: A("A domain or link, e.g. example.com") }),
    feature: null,
    screen: "Security Center › Scam registry",
    run: (e) => vi(String(e.domain ?? "")),
    compose: (e) => {
      const t = e, n = t.sightings[0];
      return [
        t.listed ? `${t.domain} has been sprayed in XRP dust to many accounts: treat it as a phishing site.` : t.seen ? `${t.domain} has appeared in XRP dust memos.` : `${t.domain} has not been seen in XRP dust memos.`,
        n ? `Sent to ${n.recipients} account${n.recipients === 1 ? "" : "s"} by ${n.senders}, last ${n.last_seen.slice(0, 16).replace("T", " ")}: "${n.sample_memo.slice(0, 120)}".` : "",
        t.note
      ].filter(Boolean).join(`
`);
    }
  },
  {
    name: "screen_withdrawal",
    description: "Screen an outbound payment before it is signed: will it bounce (missing destination tag, unfunded destination, deposit authorisation), is the destination brand new or hours old, is it OFAC-listed or in the scam registry up to three funding hops back.",
    input_schema: T({ destination: A("The destination, r…"), destination_tag: { type: "number", description: "The destination tag, if any" }, amount_xrp: { type: "number", description: "The amount in XRP, if known" } }, ["destination"]),
    feature: "withdrawal_screening",
    screen: "Security Center › Withdrawals",
    run: (e) => {
      const t = Number(e.destination_tag), n = Number(e.amount_xrp);
      return ki({ destination: I(e, "destination"), destinationTag: Number.isInteger(t) ? t : null, amountXrp: Number.isFinite(n) && n > 0 ? n : null, previousDestinations: [], ownAddresses: [] });
    },
    compose: (e) => {
      const t = e;
      return [
        `${t.verdict.toUpperCase()} at validated ledger ${t.ledger.toLocaleString("en-US")}.`,
        ...t.unchecked.length ? [`Not checked: ${t.unchecked.join(" and ")} could not be reached.`] : [],
        ...t.findings.map((n) => `[${n.severity.toUpperCase()}] ${n.title}. ${n.detail}`)
      ].join(`
`);
    }
  },
  {
    name: "surveil_market",
    description: "A token issuer's recent order-book history read for manipulation indicators: accounts placing and replacing orders that never fill, one account supplying most of the activity, and trades between accounts funded by the same account. Indicators with numbers, not verdicts.",
    input_schema: T({ issuer: A("The token issuer, r…") }),
    feature: "market_surveillance",
    screen: "Security Center › Surveillance",
    run: (e) => mi(I(e, "issuer")),
    compose: (e) => {
      const t = e;
      return [
        `${t.transactions} transactions of ${t.issuer}, ledgers ${t.ledgers.from.toLocaleString("en-US")}–${t.ledgers.to.toLocaleString("en-US")}, ${t.fills.length} trade${t.fills.length === 1 ? "" : "s"}.`,
        ...t.findings.map((n) => `[${n.severity.toUpperCase()}] ${n.title}. ${n.detail}`)
      ].join(`
`);
    }
  }
];
function H(e) {
  return $i.find((t) => t.name === e);
}
async function Se(e, t, n) {
  const s = H(e);
  if (!s) return { ok: !1, error: `No tool named ${e}.` };
  if (s.feature && !n.has(s.feature))
    return { ok: !1, gated: !0, error: `${s.screen} needs a Pro plan or higher.` };
  try {
    return { ok: !0, value: await s.run(t ?? {}, n) };
  } catch (a) {
    return { ok: !1, error: a instanceof Error ? a.message : "The read failed." };
  }
}
const Mt = /\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/g, zt = /\b[0-9A-Fa-f]{64}\b/g, Ti = /\b[0-9A-F]{40}\b/g, _i = /\b[A-Z][A-Z0-9]{2}\b/g, xi = /* @__PURE__ */ new Set([
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
function Ai(e) {
  const t = (o) => [...new Set(o)], n = t(e.match(zt) ?? []).map((o) => o.toUpperCase()), s = (e.match(Ti) ?? []).filter((o) => !n.some((r) => r.includes(o))), a = (e.match(_i) ?? []).filter((o) => !xi.has(o));
  return {
    addresses: t(e.match(Mt) ?? []),
    hashes: n,
    currencies: t([...a, ...s])
  };
}
const Ni = { certify_authority: "issuer", read_issuance: "issuer", read_pool: "amm_account", surveil_market: "issuer", screen_withdrawal: "destination" }, Ii = [
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
    tool: "drainer_check",
    label: "whether it is being drained now",
    needs: "address",
    words: /being (drained|emptied)|drainer|drain(ing)? (right )?now|dust spray|sprayed|spraying/i
  },
  {
    tool: "emergency_kit",
    label: "the emergency kit",
    needs: "address",
    words: /emergency kit|emergency plan|move everything to (a |my )?cold|sweep (everything|it all) to|(seed|key) (has )?(leaked|been leaked|exposed|been exposed)/i
  },
  {
    tool: "who_is",
    label: "who runs the address",
    needs: "address",
    words: /which exchange|what exchange|who (runs|owns|operates|controls) (this|that|the) (address|account|wallet)|attribut|where did (it|the (xrp|money|funds)) land/i
  },
  {
    tool: "scam_registry",
    label: "the scam registry",
    needs: "address",
    words: /scam registry|registry|been reported|reported (as|for)/i
  },
  {
    tool: "check_link",
    label: "whether the link is spread by drainers",
    needs: "domain",
    words: /phishing|\blink\b|\burl\b|claim (my|the|a|your) (airdrop|gift|reward)|airdrop|giveaway site|is (this|that) (site|website) (safe|legit|real)/i
  },
  {
    tool: "screen_withdrawal",
    label: "the withdrawal screened",
    needs: "address",
    words: /screen (a |the |this )?withdrawal|withdrawal screen|safe to withdraw|withdraw(al)? to\b/i
  },
  {
    tool: "surveil_market",
    label: "manipulation indicators",
    needs: "address",
    words: /manipulat|spoof|wash[- ]trad|layering|fake (volume|depth)|market surveillance|surveil/i
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
], Ei = /noshashi|noshx|\bplans?\b|pricing|price|cost|which screen|how (do|can|should) i|what (is|are|does)|explain|difference between|what does .* mean|travel rule|\bkyc\b|\baml\b|mica|webhook|\bapi\b|examiner|auditor/i, Fi = /\bNSH-?\s?(\d{1,9})\b/gi, $e = /self[- ]?repair|\brepair\b|diagnos|troubleshoot|health ?check|not working|isn'?t working|doesn'?t work|stopped working|\bbroken\b|won'?t (load|connect|open|start|sign)|can'?t (connect|sign in|log in|load)|keeps? (disconnect|signing me out|failing)|\bfix (it|the app|this|noshashi|my app|yourself|everything)\b|something('?s| is) wrong|check (the app|everything|my setup)/i, Ri = /\b(my|our|open|active|all|pending|unresolved|resolved|recent|customer|support) tickets?\b|\btickets? (queue|inbox|waiting|list)\b|\blist (the |my |all )?tickets\b|\bany tickets\b|\bshow (me )?(the |my )?tickets\b/i, Oi = /\b(open|file|create|raise|start|submit|log) (a |an |new |the )?(support )?(ticket|case with support|support request)\b|\b(contact|tell|email|message) support\b|\breport (a |this |the )?bug\b/i, pt = /\b(with|attach|include|send) (this|the|a|my)? ?(self-?repair |repair |diagnostic )?(report|diagnostics|results)\b/i;
function mt(e, t) {
  const n = e.slice(t);
  return (/^\s*(?::|—|-|,)?\s*(?:saying|say|with|that|and say|telling (?:them|him|her))?\s*[:,]?\s*([\s\S]*)$/i.exec(n)?.[1] ?? "").trim().replace(/^["'“]|["'”]$/g, "").trim();
}
function Di(e) {
  const t = [];
  let n = e;
  const s = [...e.matchAll(Fi)].map((r) => ({ ref: `NSH-${r[1]}`, index: r.index ?? 0, end: (r.index ?? 0) + r[0].length })), a = /\b(reply|respond|write|add|post|answer back|tell (?:them|the customer))(?: to| on| in)?\s+NSH-?\s?(\d{1,9})\b/i.exec(e);
  if (a) {
    const r = mt(e, (a.index ?? 0) + a[0].length);
    return r.length >= 10 ? (t.push({ tool: "reply_ticket", input: { ticket: `NSH-${a[2]}`, message: r }, why: "reply to the ticket" }), n = e.slice(0, a.index)) : t.push({ tool: "read_ticket", input: { ticket: `NSH-${a[2]}` }, why: "the ticket to reply to (no message given)" }), { calls: t, rest: n };
  }
  const o = Oi.exec(e);
  if (o) {
    if (pt.test(e) || $e.test(e))
      return t.push({ tool: "self_repair", input: { open_ticket: !0 }, why: "repair, then open a ticket with the report" }), { calls: t, rest: "" };
    const r = mt(e, (o.index ?? 0) + o[0].length).replace(/^(about|for|regarding|because|that)\s+/i, "");
    if (r.length >= 10) {
      const i = (r.split(/[.!?](?:\s|$)|\n/)[0] ?? r).trim().slice(0, 100);
      return t.push({ tool: "open_ticket", input: { subject: i.length >= 4 ? i : r.slice(0, 100), body: r }, why: "open a support ticket" }), { calls: t, rest: e.slice(0, o.index) };
    }
    return { calls: t, rest: "", note: "To open a ticket, say what happened after it, for example: open a ticket: the Ledger Watch tab shows no events since this morning." };
  }
  for (const { ref: r } of s) {
    const i = e;
    /\b(re-?open|not (solved|fixed|resolved))\b/i.test(i) ? t.push({ tool: "set_ticket_status", input: { ticket: r, status: "open" }, why: "reopen the ticket" }) : /\b(close|resolve|mark (it |this )?(as )?(resolved|solved|done|closed)|it'?s (solved|fixed))\b/i.test(i) ? t.push({ tool: "set_ticket_status", input: { ticket: r, status: "resolved" }, why: "resolve the ticket" }) : /\bmark (it |this )?(as )?answered\b/i.test(i) ? t.push({ tool: "set_ticket_status", input: { ticket: r, status: "answered" }, why: "mark the ticket answered" }) : /\b(answer|draft|suggest)\b/i.test(i) ? t.push({ tool: "answer_ticket", input: { ticket: r, send: /\b(send|post|and reply|submit) (it|that|this|the (draft|answer|reply))?\b|\band send\b/i.test(i) }, why: "answer the ticket from NOSHASHI's pages" }) : $e.test(i) || pt.test(i) ? t.push({ tool: "self_repair", input: { post_to_ticket: r }, why: "repair and post the report to the ticket" }) : t.push({ tool: "read_ticket", input: { ticket: r }, why: "read the ticket" });
  }
  if (s.length) return { calls: t, rest: s.reduceRight((r, i) => r.slice(0, i.index) + r.slice(i.end), e) };
  if (Ri.test(e)) {
    const r = /\bresolved\b|\bclosed\b/i.test(e) && !/unresolved/i.test(e) ? "resolved" : /\ball\b/i.test(e) ? "any" : "active";
    return t.push({ tool: "list_tickets", input: { status: r }, why: "the support tickets" }), { calls: t, rest: "" };
  }
  return $e.test(e) && t.push({ tool: "self_repair", input: {}, why: "check and repair the app" }), { calls: t, rest: n };
}
function Ci(e) {
  const t = e.indexOf("{"), n = e.lastIndexOf("}");
  if (t >= 0 && n > t) {
    const a = e.slice(t, n + 1);
    if (/"TransactionType"\s*:/.test(a)) return a;
  }
  const s = /\b12[0-9A-Fa-f]{98,}\b/.exec(e);
  return s ? s[0] : null;
}
const yt = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})\b/gi;
function jt(e, t = {}) {
  const n = t.tickets ? Di(e) : { calls: [], rest: e };
  e = n.rest;
  const s = [...n.calls], a = (c) => {
    s.some((d) => d.tool === c.tool && JSON.stringify(d.input) === JSON.stringify(c.input)) || s.push(c);
  }, o = Ci(e);
  o && (a({ tool: "explain_transaction", input: { transaction: o }, why: "what the transaction does if signed" }), e = e.replace(o, " "));
  const r = Ai(e);
  for (const c of Ii)
    if (c.words.test(e)) {
      if (c.tool === "emergency_kit") {
        r.addresses.length >= 2 && a({ tool: c.tool, input: { address: r.addresses[0], cold: r.addresses[1] }, why: c.label });
        continue;
      }
      if (c.needs === "domain") {
        const d = [...e.matchAll(yt)].map((l) => l[1].toLowerCase()).filter((l) => !/(^|\.)noshashi\.(com|app)$/.test(l));
        d[0] && a({ tool: c.tool, input: { domain: d[0] }, why: c.label });
        continue;
      }
      if (c.tool === "verify_domain" && r.addresses.length === 0) {
        const d = [...e.replace(/xrp-ledger\.toml/gi, " ").matchAll(yt)].map((l) => l[1].toLowerCase()).filter((l) => !/(^|\.)noshashi\.com$/.test(l));
        d[0] && a({ tool: c.tool, input: { domain: d[0] }, why: c.label });
        continue;
      }
      if (c.needs === "address")
        for (const d of r.addresses) a({ tool: c.tool, input: { [Ni[c.tool] ?? "address"]: d }, why: c.label });
      else if (c.needs === "hash")
        for (const d of r.hashes)
          a({ tool: c.tool, input: c.tool === "read_token_rights" ? { token_id: d } : { hash: d }, why: c.label });
      else if (c.needs === "book") {
        const d = r.addresses[0];
        for (const l of r.currencies) d && a({ tool: c.tool, input: { currency: l, issuer: d }, why: c.label });
      } else
        a({ tool: c.tool, input: {}, why: c.label });
    }
  if (s.length === 0 && e.trim()) {
    for (const c of r.hashes) a({ tool: "read_settlement", input: { hash: c }, why: "a hash on its own" });
    for (const c of r.addresses) a({ tool: "check_address", input: { address: c }, why: "an address on its own" });
  }
  const i = s.length === 0 && e.trim().length > 0 || n.calls.length === 0 && Ei.test(e.replace(Mt, " ").replace(zt, " "));
  return { calls: s.slice(0, 6), knowledge: i, entities: r, note: n.note };
}
const Pi = Ot.scenes, Li = X("noshashi noshx plan plans need use screen screens help feature which tool tools we our us want get way much many cost price pay"), Xi = /\bwhich\b|\bwhat (screen|tool|plan|should)|how (do|can|does|should) (i|we|noshashi)|\bhelp\b|\bneed\b|\buse\b|where (do|can)|feature/i;
function Hi(e, t = 3) {
  const n = new Set(X(e));
  for (const s of Li) n.delete(s);
  return Pi.map((s) => {
    const a = X(`${s.name} ${s.name} ${s.summary}`), o = a.filter((r) => n.has(r)).length;
    return { scene: s, score: o / Math.sqrt(a.length + 4) };
  }).filter((s) => s.score > 0.12).sort((s, a) => a.score - s.score).slice(0, t).map((s) => s.scene);
}
const wt = { critical: 0, warn: 1, info: 2, ok: 3 }, qi = { critical: "✕", warn: "!", info: "·", ok: "✓" };
function D(e, t = 6) {
  const n = [...e].sort((s, a) => wt[s.severity] - wt[a.severity]).slice(0, t);
  return n.length === 0 ? "Nothing notable was recorded." : n.map((s) => `${qi[s.severity]} ${s.title}. ${s.detail}${s.action ? ` What to do: ${s.action}` : ""}`).join(`
`);
}
const L = (e) => e ? ` (validated ledger ${e.toLocaleString("en-US")})` : "", bt = (e) => e.length > 12 ? `${e.slice(0, 6)}…${e.slice(-4)}` : e;
function vt(e, t) {
  switch (e) {
    case "check_address": {
      const n = t, s = ee[n.verdict];
      return [
        `Address check for ${n.address}${L(n.ledgerIndex)}: ${s.label}.${n.headline === s.label ? "" : ` ${n.headline}`}`,
        n.exists ? `Balance ${n.balanceXrp.toLocaleString("en-US")} XRP${n.domain ? `, claims the domain ${n.domain} (claimed, not verified)` : ""}${n.isIssuer ? `, issues ${n.issuedCurrencies.join(", ") || "tokens"}` : ""}.` : "",
        D(n.findings),
        "This reports what the ledger publishes. Nothing recorded against an address is not the same as safe."
      ].filter(Boolean).join(`
`);
    }
    case "certify_authority": {
      const n = t, s = n.checks.map((a) => {
        const o = Cs(a);
        return `${o === "PASS" ? "✓" : o === "FAIL" ? "✕" : "!"} ${a.label} (${a.severity === "block" ? "blocking" : "warning"}): ${o}. ${a.detail}`;
      }).join(`
`);
      return [
        `Authority certificate for issuer ${n.issuer}${n.currencyLabel ? ` (${n.currencyLabel})` : ""}${L(n.ledgerIndex)}: ${n.verdict.toUpperCase()}.`,
        s,
        `Digest ${n.digest.slice(0, 16)}…, so anyone can re-check this reading.`
      ].join(`
`);
    }
    case "read_control_surface": {
      const n = t;
      return [
        `Who controls ${n.address}${L(n.ledgerIndex)}: master key ${n.masterKeyEnabled ? "enabled" : "disabled"}${n.regularKey ? `, regular key ${bt(n.regularKey)}` : ""}${n.signers.present ? `, signer list quorum ${n.signers.quorum} with the fewest signers that reach it being ${n.signers.minimumSigners}` : ", no signer list"}. Balance ${n.balanceXrp.toLocaleString("en-US")} XRP, ${n.reserveLockedXrp.toLocaleString("en-US")} XRP locked in reserve${n.escrowedXrp ? `, ${n.escrowedXrp.toLocaleString("en-US")} XRP in escrow` : ""}.`,
        D(On(n))
      ].join(`
`);
    }
    case "read_provenance": {
      const n = t;
      return [`Provenance of ${n.address}${n.ageDays !== void 0 ? `, about ${Math.round(n.ageDays).toLocaleString("en-US")} days old` : ""}${n.fundedBy ? `, first funded by ${n.fundedBy}` : ""}:`, D(qn(n))].join(`
`);
    }
    case "read_book": {
      const n = t;
      return [`Order book${L(n.ledgerIndex)}:`, D(Bn(n))].join(`
`);
    }
    case "read_settlement": {
      const n = t;
      return [
        `Transaction ${bt(n.hash)}${L(n.ledgerIndex)}: ${n.transactionType}, result ${n.result}${n.validated ? "" : " (not yet validated, so nothing here is final)"}.`,
        D(Vn(n))
      ].join(`
`);
    }
    case "read_pool": {
      const n = t;
      return [`AMM pool${L(n.ledgerIndex)}:`, D(ts(n))].join(`
`);
    }
    case "read_issuance": {
      const n = t;
      return [`Issuance${L(n.ledgerIndex)}:`, D(cs(n))].join(`
`);
    }
    case "read_claims": {
      const n = t;
      return [`Tokens sent to the account${L(n.ledgerIndex)}:`, D(gs(n))].join(`
`);
    }
    case "read_token_rights":
      return ["NFT rights:", D(xs(t))].join(`
`);
    case "ledger_sync":
      return ["What the public servers report:", D(Os(t))].join(`
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
      return [`Security check for ${n.address}${L(n.ledgerIndex)}: grade ${s.grade}, ${s.score}/100. ${s.summary}`, D(s.findings), a].filter(Boolean).join(`
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
      return H(e)?.compose?.(t) ?? "";
  }
}
function Ui(e) {
  return e.replace(/^Q: .*$/m, "").replace(/^A: /m, "").replace(/([.!?])\s+/g, `$1
`).split(/\n+/).map((t) => t.trim()).filter((t) => t.length > 25 && !/^[|·—-]/.test(t));
}
function Mi(e, t) {
  if (t.length === 0) return "";
  const n = new Set(X(e)), s = t[0], a = /^(Help ›|Support ›|Learn NOSHASHI › Knowledge check|Pricing ›)/, o = t.slice(0, 2).find((g) => a.test(g.title) && g.score >= s.score * 0.85);
  if (o) {
    let g = o.text.replace(/^Q: .*\nA: /, "");
    return /^(Help|Support) ›/.test(o.title) && (g = g.split(`
`).slice(1).join(`
`) || g), `${g}

Source: ${o.title} · ${o.source}`;
  }
  if (s.title.startsWith("Learn NOSHASHI › Word list")) {
    const g = s.text.split(`
`).find((f) => X(f.split(":")[0]).some((u) => n.has(u)));
    if (g) return `${g}

Source: NOSHASHI word list · ${s.source}`;
  }
  const r = t.slice(0, 3).flatMap(
    (g, f) => Ui(g.text).map((u, m) => {
      const y = X(u), w = y.filter((p) => n.has(p)).length;
      return { hit: g, sentence: u, position: m, score: w / Math.sqrt(y.length + 1) + (f === 0 ? 0.3 : 0) - m * 0.01 };
    })
  ), i = /* @__PURE__ */ new Set(), c = r.filter((g) => g.score > 0).sort((g, f) => f.score - g.score).filter((g) => {
    const f = g.sentence.toLowerCase().replace(/\s+/g, " ");
    return !i.has(f) && i.add(f);
  }).slice(0, 4);
  if (c.length === 0) return `${s.text.slice(0, 600)}

Source: ${s.title} · ${s.source}`;
  const d = /* @__PURE__ */ new Map();
  for (const g of c) d.set(g.hit, [...d.get(g.hit) ?? [], g]);
  const l = [], h = [];
  for (const [g, f] of d)
    l.push(f.sort((u, m) => u.position - m.position).map((u) => u.sentence).join(" ")), h.push(`${g.title} · ${g.source}`);
  return `${l.join(`

`)}

Source${h.length > 1 ? "s" : ""}: ${h.join("; ")}`;
}
async function zi(e, t, n) {
  const s = jt(e, { tickets: !!H("list_tickets") }), a = [], o = (h) => {
    a.push(h), n?.(h);
  }, r = await Promise.all(
    s.calls.map(async (h) => {
      const g = await Se(h.tool, h.input, t), f = s.calls.some((u) => u.tool === "check_address" && u.input.address === h.input.issuer);
      if (g.ok === !1 && g.gated && h.tool === "certify_authority" && typeof h.input.issuer == "string" && !f) {
        const u = await Se("check_address", { address: h.input.issuer }, t);
        if (u.ok)
          return o({ kind: "tool", name: "check_address", input: { address: h.input.issuer }, ok: !0, summary: "read", citation: pe("check_address", H("check_address")?.screen ?? "check_address", { address: h.input.issuer }, u.value) }), { call: { ...h, tool: "check_address", input: { ...h.input, address: h.input.issuer } }, result: u, gatedFrom: h };
      }
      if (!g.ok && h.tool === "read_settlement" && !g.gated) {
        const u = await Se("read_token_rights", { token_id: h.input.hash }, t);
        if (u.ok)
          return o({ kind: "tool", name: "read_token_rights", input: { token_id: h.input.hash }, ok: !0, summary: "read", citation: pe("read_token_rights", H("read_token_rights")?.screen ?? "read_token_rights", { token_id: h.input.hash }, u.value) }), { call: { ...h, tool: "read_token_rights" }, result: u };
      }
      return o({
        kind: "tool",
        name: h.tool,
        input: h.input,
        ok: g.ok,
        summary: g.ok ? "read" : g.error,
        ...g.ok ? { citation: pe(h.tool, H(h.tool)?.screen ?? h.tool, h.input, g.value) } : {}
      }), { call: h, result: g };
    })
  ), i = [];
  for (const h of r) {
    const { call: g, result: f } = h, u = H(g.tool)?.screen ?? g.tool;
    f.ok && "gatedFrom" in h ? i.push(
      `${vt(g.tool, f.value)}

That is the free address check. The six issuer checks with a GO/HOLD/NO-GO certificate need Pro in the app, and are free on the website without an account: https://www.noshashi.app/certificate/`
    ) : f.ok ? i.push(vt(g.tool, f.value)) : f.gated ? i.push(
      g.tool === "certify_authority" ? `${u}: ${f.error} The same six issuer checks are free on the website, without an account: https://www.noshashi.app/certificate/ (paste ${String(g.input.issuer ?? "the issuer address")}).` : `${u}: ${f.error} It is available after upgrading in Pricing.`
    ) : H(g.tool)?.compose ? i.push(`${u}: ${f.error}`) : i.push(`${u}: could not be read. ${f.error}`);
  }
  let c = "";
  if (s.knowledge) {
    const h = await Pt(e, 5).catch(() => []);
    if (o({ kind: "tool", name: "search_noshashi", input: { query: e.slice(0, 60) }, ok: h.length > 0, summary: h.length ? `${h.length} passages` : "nothing matched" }), c = Mi(e, h), Xi.test(e)) {
      const g = Hi(e);
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
const M = {
  support: "support@noshashi.app",
  institutions: "institutions@noshashi.app",
  security: "security@noshashi.app",
  privacy: "privacy@noshashi.app",
  form: "/contact/"
}, De = [
  {
    id: "what",
    keywords: ["what", "noshashi", "do", "product", "about", "purpose", "explain", "is"],
    q: "What does NOSHASHI do?",
    a: "NOSHASHI reads validated XRP Ledger state and answers two questions from it at the same moment: whether a transfer is permitted under the rules you configured, and whether you could actually exit the position. It returns a GO, HOLD or NO-GO verdict with the evidence attached. It is informational tooling — it never holds, signs or moves an asset.",
    links: [{ label: "The product brief", href: "/brief/" }]
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
    links: [{ label: "What it actually does", href: "/brief/" }, { label: "Legal", href: "/legal/" }]
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
    links: [{ label: "Security posture", href: "/trust/" }]
  },
  {
    id: "privacy",
    keywords: ["privacy", "data", "telemetry", "analytics", "tracking", "collect", "gdpr", "store", "egress"],
    q: "What data do you collect?",
    a: "Without an account there is no server-side state: no analytics, no telemetry, no crash reporting. The compliance agent runs on your own machine with zero egress. Secrets are held by the OS keychain rather than by the app. Typefaces are self-hosted, so opening a page does not announce you to a font CDN.",
    links: [{ label: "Security posture", href: "/trust/" }, { label: "Legal", href: "/legal/" }]
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
    a: "Free is for individuals and single desks. Pro ($749 per seat per month) is for trading desks and funds. Institutional ($4,000 a month) is for regulated venues and custodians. Enterprise ($10,000 a month, $120,000 a year) is for institutional teams operating at scale. Strategic Infrastructure ($20,833 a month, $250,000 a year) is for institutions building their own XRPL intelligence layer. The pricing page lists what each one includes.",
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
    id: "coming-soon",
    keywords: ["sla", "uptime", "availability", "guarantee", "sso", "saml", "oidc", "scim", "sign-on", "dedicated", "environment", "isolated", "coming"],
    q: "Is there an uptime SLA, single sign-on or a dedicated environment?",
    a: "Not yet. All three are coming soon and are marked that way on the pricing page. No plan includes an uptime SLA today, and NOSHASHI does not promise an uptime figure. Sign-in is by email and password with two-factor authentication until single sign-on arrives, and every organization uses the shared service until dedicated environments are offered.",
    links: [{ label: "Pricing", href: "/pricing/#compare" }]
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
    a: `The contact form reaches the team directly. For specific routes: ${M.support} for product support, ${M.institutions} for institutional enquiries, ${M.security} for vulnerability reports and ${M.privacy} for data questions.`,
    links: [{ label: "Contact form", href: "/contact/" }]
  }
], ji = new Set(
  "a an the is are was were be been do does did can could would should i you it this that of for to in on at by with my your our we us and or if how what when where why not no yes please tell me about".split(" ")
);
function Te(e) {
  return String(e || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !ji.has(t));
}
function Bi(e) {
  const t = Te(e);
  return t.length ? De.map((n) => {
    const s = new Set(n.keywords), a = new Set(Te(n.q)), o = new Set(Te(n.a));
    let r = 0;
    for (const i of t)
      s.has(i) ? r += 3 : a.has(i) ? r += 2 : o.has(i) ? r += 0.5 : [...s].some((c) => c.startsWith(i) || i.startsWith(c)) && (r += 1.5);
    return { entry: n, score: r };
  }).filter((n) => n.score > 0).sort((n, s) => s.score - n.score) : [];
}
const kt = 3;
function Wi(e) {
  const t = Bi(e), n = t[0];
  if (!n || n.score < kt)
    return {
      grounded: !1,
      text: "I can answer questions about pricing, downloads and verification, what the paid tiers add, privacy and security posture, billing, and the XRPL data the product reads. I don't have a confident answer to that one — rather than guess, send it to the team and you'll get a real answer.",
      links: [{ label: "Contact the team", href: M.form }],
      matched: t.slice(0, 3).map((a) => a.entry.id)
    };
  const s = t.slice(1, 3).filter((a) => a.score > kt * 0.8).map((a) => a.entry.q);
  return {
    grounded: !0,
    text: n.entry.a,
    links: n.entry.links || [],
    related: s,
    matched: [n.entry.id]
  };
}
const St = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz", Gi = /\bs[1-9A-HJ-NP-Za-km-z]{24,34}\b/g;
function Ki(e) {
  const t = [0];
  for (const o of e) {
    const r = St.indexOf(o);
    if (r < 0) return null;
    let i = r;
    for (let c = t.length - 1; c >= 0; c -= 1)
      i += t[c] * 58, t[c] = i & 255, i >>= 8;
    for (; i > 0; )
      t.unshift(i & 255), i >>= 8;
  }
  let n = 0;
  for (; n < e.length && e[n] === St[0]; ) n += 1;
  let s = 0;
  for (; s < t.length && t[s] === 0; ) s += 1;
  const a = new Uint8Array(n + t.length - s);
  return a.set(t.slice(s), n), a;
}
async function Yi(e) {
  const t = e.slice(0, e.length - 4), n = await crypto.subtle.digest("SHA-256", t), s = new Uint8Array(await crypto.subtle.digest("SHA-256", n));
  return e.slice(e.length - 4).every((o, r) => o === s[r]);
}
async function Vi(e) {
  const t = Ki(e);
  if (!t) return !1;
  const n = t.length === 21 && t[0] === 33, s = t.length === 23 && t[0] === 1 && t[1] === 225 && t[2] === 75;
  return !n && !s ? !1 : Yi(t);
}
async function Ji(e) {
  for (const t of e.matchAll(Gi))
    if (await Vi(t[0])) return !0;
  return !1;
}
class Qi extends Error {
  constructor() {
    super(
      "That message contains an XRPL secret seed, so it was not sent. NOSHASHI never needs a seed. Treat this one as exposed: move the funds to a new account and stop using it."
    ), this.name = "SecretInMessageError";
  }
}
const Bt = 10, Wt = "noshashi:web.checks", Ie = () => {
  const e = /* @__PURE__ */ new Date();
  return `${e.getUTCFullYear()}-${String(e.getUTCMonth() + 1).padStart(2, "0")}`;
};
function Zi() {
  try {
    const e = JSON.parse(localStorage.getItem(Wt) ?? "null");
    if (e && e.month === Ie() && typeof e.count == "number" && Number.isFinite(e.count))
      return { month: e.month, count: Math.max(0, e.count) };
  } catch {
  }
  return { month: Ie(), count: 0 };
}
let Gt = 0;
function $t(e) {
  Gt = e;
  try {
    localStorage.setItem(Wt, JSON.stringify({ month: Ie(), count: e }));
  } catch {
  }
}
const Ee = () => Math.max(Zi().count, Gt), eo = {
  has: () => !1,
  spendFreeCheck: () => {
    const e = Ee();
    return e >= Bt ? !1 : ($t(e + 1), !0);
  },
  refundFreeCheck: () => $t(Math.max(0, Ee() - 1))
}, Fe = "Support › ";
na(
  De.map((e) => ({
    title: `${Fe}${e.q}`,
    source: "noshashi.app support",
    text: `${e.q}
${e.a}`,
    // Written for exactly the questions visitors ask, so they lead a close call.
    weight: 1.25
  }))
);
const _e = { label: "Contact the team", href: M.form };
function to(e) {
  const t = /\n\nSources?: ([^\n]+)/.exec(e);
  if (!t) return { body: e, links: [] };
  const n = [];
  let s;
  for (const a of t[1].split("; ")) {
    const o = a.lastIndexOf(" · "), r = o >= 0 ? a.slice(0, o) : a, i = o >= 0 ? a.slice(o + 3) : "";
    r.startsWith(Fe) && (s = r.slice(Fe.length));
    const c = /^https:\/\/www\.noshashi\.app(\/[^\s]*)?$/.exec(i);
    if (!c) continue;
    const d = c[1] ?? "/";
    if (n.some((h) => h.href.split("#")[0] === d.split("#")[0])) continue;
    const l = (r.split(" › ").pop() ?? r).replace(/^NOSHASHI — /, "").trim();
    n.push({ label: l.length > 38 ? `${l.slice(0, 36)}…` : l, href: d });
  }
  return { body: e.replace(t[0], ""), links: n.slice(0, 3), support: s };
}
async function ao(e, t) {
  const n = String(e ?? "").trim().slice(0, 600);
  if (!n)
    return { text: "Ask a question about NOSHASHI, or paste an XRPL address, token id or transaction hash.", steps: [], links: [], related: [], source: "none" };
  if (await Ji(n))
    return { text: new Qi().message, steps: [], links: [], related: [], source: "refused" };
  const s = jt(n).calls.length > 0, a = [];
  let o = !1;
  try {
    const r = await zi(n, eo, (f) => {
      if (f.kind !== "tool") return;
      if (f.name === "search_noshashi") {
        o = f.ok;
        return;
      }
      const u = { reader: no[f.name] ?? f.name, ok: f.ok, summary: f.summary };
      a.push(u), t?.(u);
    });
    if (!r.facts && !o)
      return { text: Wi(n).text, steps: a, links: [_e], related: [], source: "none" };
    const { body: i, links: c, support: d } = to(r.text), l = d ? De.find((f) => f.q === d) : void 0, h = i.includes("https://www.noshashi.app/certificate/") ? [{ label: "Free issuer certificate", href: "/certificate/" }] : [], g = [...l?.links ?? [], ...h, ...c];
    return {
      text: i,
      steps: a,
      links: g.some((f) => f.href === M.form) ? g.slice(0, 4) : [...g.slice(0, 3), _e],
      related: [],
      source: r.facts ? "ledger" : l ? "support" : "pages"
    };
  } catch (r) {
    return {
      text: `NOSHX could not finish that: ${r instanceof Error ? r.message : "an unexpected error"}. Try again, or contact the team.`,
      steps: a,
      links: [_e],
      related: [],
      source: s ? "ledger" : "none"
    };
  }
}
const no = {
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
}, io = () => Math.max(0, Bt - Ee()), oo = () => sa();
export {
  ao as ask,
  io as checksLeft,
  oo as prewarm,
  to as splitSources
};
