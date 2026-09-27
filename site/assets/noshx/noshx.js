var Xe = Object.defineProperty;
var Me = (e, t, n) => t in e ? Xe(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n;
var k = (e, t, n) => Me(e, typeof t != "symbol" ? t + "" : t, n);
function q(e) {
  const t = Number(e) / 1e6;
  return Number.isFinite(t) ? t.toFixed(6).replace(/\.?0+$/, "") : "0";
}
function Se(e) {
  return new Date((e + 946684800) * 1e3);
}
function F(e) {
  if (!/^[0-9A-F]{40}$/i.test(e)) return e;
  const t = (e.match(/../g) ?? []).map((n) => String.fromCharCode(parseInt(n, 16))).join("").replace(/\0+$/, "").trim();
  return t && /^[\x20-\x7E]+$/.test(t) ? t : e;
}
const Q = [
  "wss://xrplcluster.com",
  "wss://s1.ripple.com",
  "wss://s2.ripple.com"
], J = 12e3, Ue = 2e4;
class v extends Error {
  constructor(n, s) {
    super(n);
    k(this, "code");
    this.code = s, this.name = "XrplError";
  }
}
class Be {
  constructor() {
    k(this, "socket", null);
    k(this, "pending", /* @__PURE__ */ new Map());
    k(this, "nextId", 1);
    k(this, "endpointIndex", 0);
    k(this, "attempt", 0);
    k(this, "retryTimer", 0);
    k(this, "connecting", null);
    k(this, "streamHandlers", /* @__PURE__ */ new Set());
    k(this, "statusHandlers", /* @__PURE__ */ new Set());
    k(this, "latencyMs", 0);
    k(this, "connected", !1);
  }
  /** Round-trip time of the most recent successful command. */
  getLatencyMs() {
    return this.latencyMs;
  }
  isConnected() {
    return this.connected;
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
      const s = Q[this.endpointIndex % Q.length];
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
      }, J);
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
          window.clearTimeout(o.timer), o.reject(new v("Connection closed"));
        this.pending.clear(), n(new v("Connection closed")), this.scheduleReconnect();
      };
    }), this.connecting);
  }
  scheduleReconnect() {
    if (this.streamHandlers.size === 0 && this.pending.size === 0) return;
    window.clearTimeout(this.retryTimer), this.endpointIndex += 1, this.attempt += 1;
    const t = Math.min(Ue, 1e3 * 2 ** Math.min(this.attempt - 1, 4));
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
          new v(
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
        this.pending.delete(a), i(new v(`Timed out: ${t}`));
      }, J);
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
const je = new Be();
async function b(e, t = {}) {
  return je.request(e, t);
}
async function We() {
  const [e, t] = await Promise.all([
    b("ledger", { ledger_index: "validated", transactions: !1, expand: !1 }),
    b("fee").catch(() => ({}))
  ]), n = e.ledger ?? {};
  return {
    ledgerIndex: Number(n.ledger_index ?? e.ledger_index ?? 0),
    ledgerHash: String(n.ledger_hash ?? ""),
    closeTime: Se(Number(n.close_time ?? 0)).toLocaleString(),
    validated: !!(e.validated ?? !1),
    baseFeeXrp: q(Number(t.drops?.base_fee ?? 10)),
    openLedgerFeeXrp: q(Number(t.drops?.open_ledger_fee ?? 10)),
    queueSize: Number(t.current_queue_size ?? 0),
    txnCount: Number(n.transactions?.length ?? 0)
  };
}
function z(e) {
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
function Ge(e) {
  return { address: e, balanceXrp: "0.00", sequence: 0, ownerCount: 0, unfunded: !0 };
}
async function Ke(e) {
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
      domain: z(String(n.Domain ?? ""))
    };
  } catch (t) {
    if (t instanceof v && t.code === "actNotFound") return Ge(e);
    throw t instanceof v && t.code === "actMalformed" ? new v(
      "Address failed its base58 checksum — check for a mistyped character.",
      "actMalformed"
    ) : t;
  }
}
async function Ve(e) {
  return ((await b("account_objects", {
    account: e,
    ledger_index: "validated",
    type: "credential",
    limit: 100
  })).account_objects ?? []).map((s) => ({
    subject: String(s.Subject ?? ""),
    issuer: String(s.Issuer ?? ""),
    credentialType: z(String(s.CredentialType ?? "")) ?? String(s.CredentialType ?? "UNKNOWN"),
    // XLS-70 marks acceptance with the lsfAccepted flag (0x00010000).
    accepted: (Number(s.Flags ?? 0) & 65536) !== 0,
    revoked: !!(s.Revoked ?? !1),
    uri: s.URI ? z(String(s.URI)) : void 0,
    expiration: s.Expiration ? Number(s.Expiration) : void 0
  }));
}
async function Ye(e, t = 40) {
  try {
    return ((await b("account_tx", {
      account: e,
      ledger_index_min: -1,
      ledger_index_max: -1,
      binary: !1,
      forward: !1,
      limit: t
    })).transactions ?? []).map((a) => {
      const r = a.tx ?? a.tx_json ?? {}, o = a.meta ?? {}, i = o.delivered_amount ?? o.DeliveredAmount, c = typeof i == "string" ? Number(q(i)) : void 0, d = String(r.Account ?? ""), u = String(r.Destination ?? ""), f = d === e ? "out" : u === e ? "in" : "cross", l = Se(Number(r.date ?? 0));
      return {
        hash: String(r.hash ?? a.hash ?? ""),
        transactionType: String(r.TransactionType ?? "UNKNOWN"),
        result: String(o.TransactionResult ?? "—"),
        ledgerIndex: Number(a.ledger_index ?? r.ledger_index ?? 0),
        date: l.toLocaleString(),
        timestamp: l.getTime(),
        direction: f,
        counterparty: f === "out" ? u || "—" : d || "—",
        amountXrp: c,
        feeXrp: q(String(r.Fee ?? "0"))
      };
    });
  } catch (n) {
    if (n instanceof v && n.code === "actNotFound") return [];
    throw n;
  }
}
function Qe(e) {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(e.trim());
}
const Je = 262144, Ze = 4194304, et = 2097152, tt = 1048576;
async function nt(e) {
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
    if (t instanceof v && t.code === "actNotFound") return [];
    throw t;
  }
}
async function Te(e) {
  try {
    const n = (await b("account_info", {
      account: e,
      ledger_index: "validated"
    })).account_data ?? {}, s = Number(n.Flags ?? 0), a = Number(n.TransferRate ?? 0), r = a > 1e9 ? Math.round((a - 1e9) / 1e9 * 1e4) : 0;
    return {
      address: e,
      domain: z(String(n.Domain ?? "")),
      noFreeze: (s & et) !== 0,
      globalFreeze: (s & Ze) !== 0,
      requireAuth: (s & Je) !== 0,
      masterDisabled: (s & tt) !== 0,
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
async function st(e) {
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
const X = {
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
}, at = 60;
async function rt(e) {
  const t = e.trim(), n = {
    address: t,
    verdict: "unknown",
    headline: X.unknown.label,
    findings: [],
    exists: !1,
    funded: !1,
    balanceXrp: 0,
    activityCount: 0,
    isIssuer: !1,
    issuedCurrencies: [],
    credentials: [],
    ledgerIndex: 0,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (!Qe(t))
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
  const s = await Ke(t).catch(() => null);
  if (!s) return n;
  if (s.unfunded)
    return {
      ...n,
      exists: !0,
      funded: !1,
      domain: s.domain,
      verdict: "caution",
      headline: X.caution.label,
      findings: [
        {
          id: "unfunded",
          severity: "warn",
          title: "This address has never been funded",
          detail: "It is well-formed but does not exist on the ledger yet. Nobody has ever activated it with the base reserve, so it has no history at all.",
          action: "If someone gave you this address as a shop or a payee, confirm it with them another way first."
        }
      ]
    };
  const [a, r, o] = await Promise.all([
    Ve(t).catch(() => []),
    nt(t).catch(() => []),
    Ye(t, at).catch(() => [])
  ]), i = await st(t).catch(() => null), u = Object.keys(i?.obligations ?? {}).length > 0 ? await Te(t).catch(() => {
  }) : void 0;
  return it({
    address: t,
    account: s,
    credentials: a,
    lines: r,
    transactions: o,
    obligations: i,
    posture: u
  });
}
function it(e) {
  const { address: t, account: n, credentials: s, lines: a, transactions: r, obligations: o, posture: i } = e, c = Object.keys(o?.obligations ?? {}), d = c.length > 0, u = [];
  if (n.domain ? u.push({
    id: "domain",
    severity: "info",
    title: `Claims the domain ${n.domain}`,
    detail: "An account can write any domain it likes into this field. It becomes meaningful only when that domain publishes a matching xrp-ledger.toml naming this address back.",
    action: `Open https://${n.domain}/.well-known/xrp-ledger.toml and confirm this address is listed.`
  }) : u.push({
    id: "no-domain",
    severity: "info",
    title: "Claims no domain",
    detail: "The account has not published a domain, so there is no website to check it against. Common for personal wallets, unusual for a business asking to be paid."
  }), s.length > 0) {
    const m = s.filter((y) => y.accepted && !y.revoked);
    u.push({
      id: "credentials",
      severity: m.length > 0 ? "ok" : "warn",
      title: m.length > 0 ? `Holds ${m.length} accepted credential${m.length === 1 ? "" : "s"}` : "Holds credentials, but none currently valid",
      detail: m.length > 0 ? `Someone has attested to this account on-ledger: ${m.map((y) => y.credentialType).join(", ")}. The attestation is only worth as much as the issuer behind it.` : "Every credential attached to this account is either unaccepted or revoked."
    });
  }
  d && i && (i.globalFreeze && u.push({
    id: "global-freeze",
    severity: "critical",
    title: "This issuer has frozen everything it issued",
    detail: "lsfGlobalFreeze is set. Every balance of every currency this account issues is immobilised right now — holders cannot send or redeem.",
    action: "Do not buy this issuer's tokens while this flag stands."
  }), i.noFreeze ? u.push({
    id: "no-freeze",
    severity: "ok",
    title: "This issuer has permanently given up the right to freeze",
    detail: "lsfNoFreeze is set and cannot be undone. It can never immobilise a holder's balance."
  }) : i.globalFreeze || u.push({
    id: "can-freeze",
    severity: "warn",
    title: "This issuer can freeze your balance at any time",
    detail: "lsfNoFreeze is not set, so the issuer retains the right to immobilise what it issued — yours included — in a single transaction, without warning.",
    action: "Hold only what you would accept losing access to."
  }), i.transferRateBps > 0 && u.push({
    id: "transfer-fee",
    severity: "warn",
    title: `Charges ${i.transferRateBps} basis points to transfer`,
    detail: `Moving this issuer's token costs ${(i.transferRateBps / 100).toFixed(2)}%, taken by the issuer. It is not refundable and it applies every time the token changes hands.`
  }), i.requireAuth && u.push({
    id: "require-auth",
    severity: "info",
    title: "Requires authorisation before you can hold it",
    detail: "You cannot receive this issuance until the issuer explicitly authorises your account. Expect an onboarding step."
  }), u.push({
    id: "supply",
    severity: "info",
    title: `Issues ${c.length} currenc${c.length === 1 ? "y" : "ies"}`,
    detail: `Outstanding: ${c.slice(0, 6).map((m) => `${m} ${Math.round(o?.obligations[m] ?? 0).toLocaleString()}`).join(" · ")}`
  }));
  const f = a.filter((m) => m.frozenByIssuer || m.deepFrozenByIssuer);
  f.length > 0 && u.push({
    id: "freezes-others",
    severity: "warn",
    title: `Has frozen ${f.length} counterpart${f.length === 1 ? "y" : "ies"}`,
    detail: "This account has used freeze against people it deals with. That may be entirely legitimate — a sanctions response, for instance — but it demonstrates both the willingness and the ability to do it."
  });
  const l = new Set(
    r.map((m) => m.counterparty).filter(Boolean)
  );
  r.length === 0 ? u.push({
    id: "no-history",
    severity: "warn",
    title: "No recent transaction history",
    detail: "The account is funded but nothing recent is visible. A shop asking for payment should have a trail."
  }) : u.push({
    id: "history",
    severity: "info",
    title: `${r.length} recent transactions across ${l.size} counterparties`,
    detail: l.size <= 2 ? "Almost all activity is with the same one or two addresses, which is unusual for a business." : "Activity is spread across a range of counterparties."
  });
  const h = u.reduce((m, y) => {
    const p = { critical: 3, warn: 2, info: 1, ok: 0 };
    return p[y.severity] > p[m] ? y.severity : m;
  }, "ok"), g = h === "critical" ? "avoid" : h === "warn" ? "caution" : "clear";
  return {
    address: t,
    verdict: g,
    headline: X[g].label,
    findings: u.sort((m, y) => {
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
    ledgerIndex: o?.ledgerIndex ?? 0,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const ot = 946684800;
function Z(e) {
  return new Date((e + ot) * 1e3);
}
const ct = 1048576;
function dt(e, t) {
  const n = e.map((a) => a.weight).sort((a, r) => r - a);
  let s = 0;
  for (let a = 0; a < n.length; a += 1)
    if (s += n[a], s >= t) return a + 1;
  return 1 / 0;
}
async function $e(e) {
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
  })).filter((p) => p.account), u = Number(c?.SignerQuorum ?? 0), f = d.reduce((p, $) => p + $.weight, 0), h = (a.account_objects ?? []).filter((p) => typeof p.Amount == "string").map((p) => ({
    amountXrp: Number(p.Amount) / 1e6,
    finishAfter: p.FinishAfter !== void 0 ? Z(Number(p.FinishAfter)).toISOString() : void 0,
    cancelAfter: p.CancelAfter !== void 0 ? Z(Number(p.CancelAfter)).toISOString() : void 0,
    destination: p.Destination ? String(p.Destination) : void 0
  })), g = Number(r.OwnerCount ?? 0), m = Number(i.reserve_base_xrp ?? 1), y = Number(i.reserve_inc_xrp ?? 0.2);
  return {
    address: e,
    masterKeyEnabled: (o & ct) === 0,
    regularKey: r.RegularKey ? String(r.RegularKey) : void 0,
    signers: {
      present: d.length > 0,
      unreadable: s.__unreadable ? String(s.__unreadable) : void 0,
      quorum: u,
      signers: d,
      totalWeight: f,
      minimumSigners: d.length > 0 ? dt(d, u) : 0,
      unilateralSigners: d.filter((p) => u > 0 && p.weight >= u).map((p) => p.account)
    },
    ownerCount: g,
    reserveBaseXrp: m,
    reserveIncrementXrp: y,
    reserveLockedXrp: m + g * y,
    balanceXrp: Number(r.Balance ?? 0) / 1e6,
    escrows: h,
    escrowedXrp: h.reduce((p, $) => p + $.amountXrp, 0),
    truncated: !!(a.marker || s.marker),
    ledgerIndex: Number(t.ledger_index ?? 0),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function lt(e) {
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
const _e = 946684800, ut = 32570, ee = 10;
function ht(e, t) {
  const n = [];
  for (const s of e) {
    const a = s.tx_json ?? s.tx ?? s;
    if (a.Account !== t) continue;
    const r = Number(s.ledger_index ?? a.ledger_index ?? 0), o = Number(a.date), i = Number.isFinite(o) ? new Date((o + _e) * 1e3) : void 0;
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
function ft(e, t) {
  return e >= t ? e - t : Math.max(0, e - 1);
}
async function gt(e) {
  let t;
  try {
    t = await b("account_info", { account: e, ledger_index: "validated" });
  } catch (T) {
    throw T instanceof v && T.code === "actNotFound" ? new Error(
      "That address is not funded, so no account exists for it yet. An XRPL address only becomes an account once someone sends it enough XRP to meet the reserve — until then it has no history to read."
    ) : T instanceof v && T.code === "actMalformed" ? new Error("That is not a well-formed XRPL address.") : T;
  }
  const n = t.account_data ?? {}, s = Number(n.Sequence ?? 0);
  let a;
  try {
    const T = await b("server_info", {}), P = String(T.info?.complete_ledgers ?? ""), L = Number(P.split("-")[0]);
    Number.isFinite(L) && (a = L);
  } catch {
  }
  let r;
  const o = [];
  let i = !1, c;
  for (let T = 0; T < ee; T += 1) {
    let P;
    try {
      P = await b("account_tx", {
        account: e,
        ledger_index_min: -1,
        ledger_index_max: -1,
        binary: !1,
        forward: !0,
        limit: 200,
        ...c ? { marker: c } : {}
      });
    } catch {
      T > 0 && (i = !0);
      break;
    }
    const L = P.transactions ?? [];
    if (r || (r = L[0]), o.push(...L), c = P.marker, !c) break;
    T === ee - 1 && (i = !0);
  }
  const d = r?.tx_json ?? r?.tx ?? {}, u = Number(r?.ledger_index ?? d.ledger_index ?? 0) || void 0, f = Number(d.date), l = Number.isFinite(f) ? new Date((f + _e) * 1e3) : void 0, h = d.TransactionType ? String(d.TransactionType) : void 0, g = h === "Payment" && d.Destination === e && d.Account !== e, m = g ? String(d.Account) : void 0, y = d.Amount ?? d.DeliverMax, p = g && typeof y == "string" ? Number(y) / 1e6 : void 0, $ = u === void 0 ? void 0 : ft(s, u), w = u !== void 0 && a !== void 0 && a > ut && u <= a, O = l ? Math.floor((Date.now() - l.getTime()) / 864e5) : void 0;
  return {
    address: e,
    balanceXrp: Number(n.Balance ?? 0) / 1e6,
    ownerCount: Number(n.OwnerCount ?? 0),
    sequence: s,
    originLedger: u,
    originDate: l,
    fundedBy: m,
    fundingAmountXrp: p,
    originType: h,
    approxSentCount: $,
    historyIncomplete: w,
    nodeHistoryFrom: a,
    ageDays: O,
    lastActivityLedger: Number(n.PreviousTxnLgrSeq ?? 0) || void 0,
    controlEvents: ht(o, e),
    controlHistoryPartial: i,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const mt = 30, pt = 365;
function yt(e) {
  const t = [];
  if (e.historyIncomplete ? t.push({
    id: "history-incomplete",
    severity: "warn",
    title: "This account may be older than it appears",
    detail: `The earliest transaction found sits at ledger ${e.originLedger?.toLocaleString()}, which is the edge of what this node retains (from ${e.nodeHistoryFrom?.toLocaleString()}). Anything before that is not missing from the ledger, only from this node — so the age below is a floor, not a measurement.`,
    action: "Query a full-history node before treating the age as established."
  }) : e.originDate && e.ageDays !== void 0 && (e.ageDays < mt ? t.push({
    id: "young-account",
    severity: "warn",
    title: `This account is ${e.ageDays} day${e.ageDays === 1 ? "" : "s"} old`,
    detail: `First seen ${e.originDate.toISOString().slice(0, 10)}. An account this new has no track record — nothing about its history can corroborate or contradict what its operator tells you.`,
    action: "Weight the counterparty's off-ledger identity accordingly."
  }) : e.ageDays >= pt ? t.push({
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
const bt = 946684800, wt = 0.5, vt = 0.25, D = (e) => typeof e == "string" ? Number(e) / 1e6 : e && typeof e == "object" ? Number(e.value ?? 0) : 0;
function te(e, t, n) {
  const s = [];
  for (const o of e) {
    const i = D(o.TakerGets), c = D(o.TakerPays);
    if (i <= 0 || c <= 0) continue;
    const d = o.taker_gets_funded !== void 0 ? D(o.taker_gets_funded) : i, u = o.taker_pays_funded !== void 0 ? D(o.taker_pays_funded) : c, f = n ? i / c : c / i;
    if (!Number.isFinite(f) || f <= 0) continue;
    const l = n ? c : i, h = n ? u : d, g = Number.isFinite(h) ? Math.max(0, Math.min(h, l)) : 0, m = o.Expiration !== void 0 && Number(o.Expiration) < t;
    s.push({
      account: String(o.Account ?? ""),
      listed: l,
      fundable: m ? 0 : g,
      price: f,
      dead: m || g <= 0,
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
async function kt(e, t, n = 100) {
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
  ]), i = Number(o.ledger?.close_time ?? 0), c = te(a.offers ?? [], i, !0), d = te(r.offers ?? [], i, !1), u = /* @__PURE__ */ new Map();
  for (const h of [...c.offers, ...d.offers])
    u.set(h.account, (u.get(h.account) ?? 0) + h.listed);
  const f = c.listedDepth + d.listedDepth, l = [...u.entries()].sort((h, g) => g[1] - h[1]);
  return {
    pair: `${e}/XRP`,
    currency: e,
    issuer: t,
    bids: c,
    asks: d,
    makers: u.size,
    topMakerShare: f > 0 && l[0] ? l[0][1] / f : 0,
    topMaker: l[0]?.[0],
    ledgerIndex: Number(o.ledger_index ?? o.ledger?.ledger_index ?? 0),
    ledgerCloseTime: new Date((i + bt) * 1e3),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function St(e) {
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
    const u = 1 - d.fundedRatio;
    d.fundedRatio < wt ? t.push({
      id: `phantom-${c}`,
      severity: u > 0.9 ? "critical" : "warn",
      title: `${n(u)} of ${c.toLowerCase()} depth cannot fill`,
      detail: `The book advertises ${s(d.listedDepth)} but only ${s(d.fundableDepth)} is backed by an owner who still holds it. ${d.deadOffers} of ${d.offers.length} offers can deliver nothing at all. An offer rests whether or not its owner kept the funds, and nothing removes it until someone tries to cross it.`,
      action: "Size against the fundable figure. The advertised depth is what you would be quoted and not what you would receive."
    }) : t.push({
      id: `funded-${c}`,
      severity: "ok",
      title: `${c} are ${n(d.fundedRatio)} funded`,
      detail: `${s(d.fundableDepth)} of ${s(d.listedDepth)} advertised is backed by owners who still hold it.`
    });
  }
  e.topMakerShare >= vt && e.topMaker && t.push({
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
const Tt = 131072;
function ne(e) {
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
function H(e) {
  if (e.kind === "xrp")
    return `${e.value.toLocaleString(void 0, { maximumFractionDigits: 6 })} XRP`;
  let t = e.currency;
  if (/^[0-9A-F]{40}$/i.test(t)) {
    const n = (t.match(/../g) ?? []).map((s) => String.fromCharCode(parseInt(s, 16))).join("").replace(/\0+$/, "").trim();
    n && /^[\x20-\x7E]+$/.test(n) && (t = n);
  }
  return `${e.value.toLocaleString(void 0, { maximumFractionDigits: 10 })} ${t}`;
}
function $t(e, t) {
  return e.kind !== t.kind ? !1 : e.kind === "xrp" ? !0 : e.currency === t.currency && e.issuer === t.issuer;
}
async function _t(e) {
  let t;
  try {
    t = await b("tx", { transaction: e.trim() });
  } catch (n) {
    throw n instanceof v && n.code === "txnNotFound" ? new Error(
      "No transaction with that hash is in this node's history. It may never have existed, or the node may not retain ledgers that far back."
    ) : n;
  }
  return At(t, e);
}
function At(e, t = "") {
  const n = e.tx_json ?? e, s = e.meta ?? e.metaData ?? {}, a = String(n.TransactionType ?? "unknown"), r = String(s.TransactionResult ?? "unknown"), o = Number(n.Flags ?? 0), i = a === "Payment" ? ne(n.DeliverMax ?? n.Amount) : void 0, c = s.delivered_amount ?? s.DeliveredAmount, d = c === "unavailable", u = d ? void 0 : ne(c);
  let f;
  return i && u && $t(i, u) && i.value > 0 && (f = u.value / i.value), {
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
    delivered: u,
    deliveredUnavailable: d,
    partialFlagSet: (o & Tt) !== 0,
    deliveredFraction: f,
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const se = 0.999999;
function xt(e) {
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
    const s = e.deliveredFraction, a = s !== void 0 && s < se ? 1 / Math.max(s, Number.MIN_VALUE) : void 0;
    s !== void 0 && s < se ? t.push({
      id: "partial-shortfall",
      severity: "critical",
      title: `Only ${(s * 100).toFixed(4)}% of the requested amount arrived`,
      detail: `This payment is flagged tfPartialPayment and returned ${e.result}. It asked to deliver ${e.requested ? H(e.requested) : "—"} and actually delivered ${e.delivered ? H(e.delivered) : "—"}. Any system that credits the requested figure over-credits by roughly ${a && Number.isFinite(a) ? `${a.toFixed(0)}x` : "an unbounded factor"}.`,
      action: "Credit delivered_amount. The success code and the requested amount are both true and both irrelevant to what you received."
    }) : t.push({
      id: "partial-full",
      severity: "warn",
      title: "Partial payment permitted, but it delivered in full",
      detail: `The sender set tfPartialPayment, which allows the ledger to deliver less than requested. This time it delivered ${e.delivered ? H(e.delivered) : "—"}, the full requested amount. The flag is a property of the sender's instruction, not of this outcome.`,
      action: "The same sender can send less next time under the same flag. Read delivered_amount every time."
    });
  } else e.delivered && t.push({
    id: "settled",
    severity: "ok",
    title: `Settled in full — ${H(e.delivered)}`,
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
const ae = 1e5, M = 1e3, Ae = 946684800;
function Nt(e) {
  if (typeof e == "number" && Number.isFinite(e))
    return new Date((e + Ae) * 1e3);
  if (typeof e != "string" || e.length === 0) return null;
  const t = e.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"), n = new Date(t);
  return Number.isNaN(n.getTime()) ? null : n;
}
function re(e) {
  if (!e || typeof e != "object") return "XRP";
  const n = String(e.currency ?? "XRP");
  if (n === "XRP") return "XRP";
  if (/^[0-9A-F]{40}$/i.test(n)) {
    const s = (n.match(/../g) ?? []).map((a) => String.fromCharCode(parseInt(a, 16))).join("").replace(/\0+$/, "").trim();
    if (s && /^[\x20-\x7E]+$/.test(s)) return s;
  }
  return n;
}
async function It(e) {
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
  } catch (l) {
    throw l instanceof v && (l.code === "actNotFound" || l.code === "actMalformed") ? new Error(t) : l;
  }
  if (!n.amm) throw new Error(t);
  const a = n.amm, r = Number(s.ledger?.close_time ?? 0), o = new Date((r + Ae) * 1e3), i = a.vote_slots ?? [], c = i.reduce((l, h) => l + Number(h.vote_weight ?? 0), 0), d = i.map((l) => ({
    account: String(l.account ?? ""),
    votedFeePct: Number(l.trading_fee ?? 0) / M,
    weightOfSupply: Number(l.vote_weight ?? 0) / ae,
    weightOfCast: c > 0 ? Number(l.vote_weight ?? 0) / c : 0
  })).sort((l, h) => h.weightOfSupply - l.weightOfSupply);
  let u;
  const f = a.auction_slot;
  if (f?.account) {
    const l = Nt(f.expiration);
    l && (u = {
      holder: String(f.account),
      discountedFeePct: Number(f.discounted_fee ?? 0) / M,
      expiresAt: l,
      expired: l.getTime() < o.getTime(),
      pricePaid: Number(f.price?.value ?? 0),
      authAccounts: (f.auth_accounts ?? []).map((h) => String(h.account ?? "")).filter(Boolean)
    });
  }
  return {
    account: String(a.account ?? ""),
    pair: `${re(a.amount)} / ${re(a.amount2)}`,
    tradingFeePct: Number(a.trading_fee ?? 0) / M,
    participation: c / ae,
    votes: d,
    auction: u,
    lpTokenSupply: Number(a.lp_token?.value ?? 0),
    // Preserved as undefined for XRP: absent means inapplicable, not false.
    assetFrozen: typeof a.asset_frozen == "boolean" ? a.asset_frozen : void 0,
    asset2Frozen: typeof a.asset2_frozen == "boolean" ? a.asset2_frozen : void 0,
    ledgerCloseTime: o,
    ledgerIndex: Number(s.ledger_index ?? s.ledger?.ledger_index ?? 0),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const Ft = 0.1, Ot = 0.5;
function Et(e) {
  const t = [], n = (r) => `${(r * 100).toFixed(2)}%`, s = e.votes[0];
  if (e.votes.length === 0 ? t.push({
    id: "no-votes",
    severity: "warn",
    title: "Nobody is voting on this pool's fee",
    detail: `All eight vote slots are empty, so the trading fee sits at ${e.tradingFeePct.toFixed(3)}% by default. The first liquidity provider to cast a vote sets it, at whatever weight they hold.`,
    action: "If you hold LP tokens here, your vote is currently unopposed."
  }) : s && s.weightOfCast >= Ot ? t.push({
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
  }), e.participation < Ft && e.votes.length > 0 && t.push({
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
const ie = 250, Pt = 400, Lt = 262144, Rt = 4194304, Ct = 2097152;
function Dt(e) {
  const t = e.reduce((n, s) => n + s, 0);
  return t <= 0 ? 0 : e.reduce((n, s) => n + (s / t * 100) ** 2, 0);
}
async function xe(e, t) {
  const [n, s] = await Promise.all([
    b("account_info", { account: e, ledger_index: "validated" }),
    b("gateway_balances", { account: e, ledger_index: "validated" })
  ]), a = n.account_data ?? {}, r = Number(a.Flags ?? 0), o = {};
  for (const [h, g] of Object.entries(
    s.obligations ?? {}
  )) {
    const m = Number(g);
    Number.isFinite(m) && (o[h] = m);
  }
  const i = [];
  let c, d = 0, u = !1, f;
  for (; d < ie; ) {
    let h;
    try {
      h = await b("account_lines", {
        account: e,
        ledger_index: "validated",
        limit: Pt,
        ...c ? { marker: c } : {}
      });
    } catch (g) {
      if (d === 0) throw g;
      f = g instanceof Error ? g.message : "the walk was interrupted", u = !0;
      break;
    }
    for (const g of h.lines ?? [])
      i.push({
        account: String(g.account ?? ""),
        currency: String(g.currency ?? ""),
        // From the issuer's side a holder's balance is reported negative.
        held: Math.abs(Number(g.balance ?? 0)),
        limit: Number(g.limit_peer ?? g.limit ?? 0),
        // Present-and-true, never absent-means-false.
        frozenByIssuer: g.freeze === !0,
        authorized: g.authorized === !0
      });
    if (c = h.marker, d += 1, !c) break;
    d >= ie && (u = !0);
  }
  const l = Object.keys(o).map((h) => {
    const g = i.filter((w) => w.currency === h), m = g.filter((w) => w.held > 0).sort((w, O) => O.held - w.held), y = m.map((w) => w.held), p = y.reduce((w, O) => w + O, 0), $ = o[h];
    return {
      currency: h,
      outstanding: $,
      observedHeld: p,
      holders: g.length,
      activeHolders: m.length,
      hhi: Dt(y),
      topHolderPct: p > 0 ? (y[0] ?? 0) / p : 0,
      topFivePct: p > 0 ? y.slice(0, 5).reduce((w, O) => w + O, 0) / p : 0,
      frozenSeen: g.filter((w) => w.frozenByIssuer).length,
      authorizedSeen: g.filter((w) => w.authorized).length,
      coverage: $ > 0 ? p / $ : 0,
      top: m.slice(0, 10)
    };
  }).sort((h, g) => g.outstanding - h.outstanding);
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
    currencies: l,
    linesWalked: i.length,
    truncated: u,
    walkError: f,
    requiresAuth: (r & Lt) !== 0,
    canFreeze: (r & Ct) === 0,
    globalFreeze: (r & Rt) !== 0,
    ledgerIndex: Number(n.ledger_index ?? 0),
    readAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const Ht = 2500, oe = 0.95;
function qt(e) {
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
    s.coverage < oe && t.push({
      id: `coverage-${s.currency}`,
      severity: "warn",
      title: `${s.currency}: holder lines account for only ${(s.coverage * 100).toFixed(1)}% of supply`,
      detail: `gateway_balances reports ${s.outstanding.toLocaleString(void 0, { maximumFractionDigits: 2 })} outstanding, but the holder lines read sum to ${s.observedHeld.toLocaleString(void 0, { maximumFractionDigits: 2 })}. Those come from different commands and should agree, so the gap is holders this walk did not see.`,
      action: "Trust the outstanding figure; treat the holder breakdown as incomplete."
    }), s.coverage >= oe ? s.hhi >= Ht ? t.push({
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
const zt = /* @__PURE__ */ new Set([
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
]), Xt = 946684800;
function Mt(e) {
  if (!/^([0-9A-F]{2})+$/i.test(e)) return e;
  const t = (e.match(/../g) ?? []).map((n) => String.fromCharCode(parseInt(n, 16))).join("").replace(/\0+$/, "").trim();
  return t && /^[\x20-\x7E]+$/.test(t) ? t : e;
}
function ce(e) {
  return e.kind === "xrp" ? `${e.value.toLocaleString(void 0, { maximumFractionDigits: 6 })} XRP` : `${e.value.toLocaleString(void 0, { maximumFractionDigits: 6 })} ${F(e.currency)}`;
}
async function Ut(e) {
  let t;
  try {
    t = await b("account_objects", {
      account: e,
      ledger_index: "validated",
      type: "check",
      limit: 200
    });
  } catch (r) {
    throw r instanceof v && r.code === "actNotFound" ? new Error(
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
        ]), u = Number((c.obligations ?? {})[o.currency] ?? 0), f = d.account_data?.Domain;
        a.set(i, {
          obligations: Number.isFinite(u) ? u : 0,
          domain: f ? Mt(String(f)) : void 0
        });
      } catch {
      }
  }
  return Bt(e, n, a, Number(t.ledger_index ?? 0));
}
function Bt(e, t, n, s) {
  const a = t.filter((o) => o.Destination === e), r = a.map((o) => {
    const i = o.SendMax, c = typeof i == "object" && i !== null, d = c ? {
      kind: "iou",
      currency: String(i.currency ?? ""),
      issuer: String(i.issuer ?? ""),
      value: Number(i.value ?? 0)
    } : { kind: "xrp", value: Number(i ?? 0) / 1e6 }, u = c ? `${i.issuer}|${i.currency}` : "", f = n.get(u), l = c ? F(String(i.currency ?? "")) : "XRP";
    return {
      index: String(o.index ?? ""),
      from: String(o.Account ?? ""),
      amount: d,
      destinationTag: o.DestinationTag !== void 0 ? Number(o.DestinationTag) : void 0,
      expiration: o.Expiration !== void 0 ? new Date((Number(o.Expiration) + Xt) * 1e3) : void 0,
      issuerObligations: f?.obligations,
      issuerOwesNothing: f !== void 0 && f.obligations === 0,
      borrowedTicker: c && zt.has(l.toUpperCase()),
      issuerDomain: f?.domain
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
function jt(e) {
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
    const c = i.amount.kind === "iou" ? F(i.amount.currency) : "XRP";
    t.push({
      id: `impersonation-${i.index.slice(0, 12)}`,
      severity: "critical",
      title: `A claim for ${ce(i.amount)} that cannot be cashed for anything`,
      detail: `${i.from} has addressed a check for ${ce(i.amount)} to this account. A currency code is not a name anyone owns — any account can issue a token called ${c}, and the ledger renders them identically. This one's issuer has NO obligations outstanding at all, meaning it has never issued a balance to anyone, so there is nothing this check could pay out.${i.issuerDomain ? ` The issuer publishes the domain ${i.issuerDomain}.` : ""}`,
      action: "Do not visit any domain associated with it and do not enter a wallet key anywhere it leads. The check itself is inert — it cannot move your funds, and ignoring it costs you nothing."
    });
  }
  const s = e.inbound.filter((i) => i.borrowedTicker && !i.issuerOwesNothing);
  for (const i of s) {
    const c = i.amount.kind === "iou" ? F(i.amount.currency) : "XRP";
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
const Wt = 1, Gt = 2, Kt = 8, Vt = 16, Yt = 5, de = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";
function Qt(e) {
  let t = 0n;
  for (const s of e) t = t << 8n | BigInt(s);
  let n = "";
  for (; t > 0n; )
    n = de[Number(t % 58n)] + n, t /= 58n;
  for (const s of e) {
    if (s !== 0) break;
    n = de[0] + n;
  }
  return n;
}
async function le(e) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", e));
}
function Jt(e) {
  const t = new Uint8Array(e.length / 2);
  for (let n = 0; n < t.length; n += 1)
    t[n] = parseInt(e.slice(n * 2, n * 2 + 2), 16);
  return t;
}
async function Zt(e) {
  const t = new Uint8Array(21);
  t[0] = 0, t.set(Jt(e), 1);
  const n = (await le(await le(t))).slice(0, 4), s = new Uint8Array(25);
  return s.set(t, 0), s.set(n, 21), Qt(s);
}
async function en(e) {
  const t = e.trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(t))
    throw new Error(
      "An NFTokenID is 64 hexadecimal characters. Check for a truncated copy or stray whitespace."
    );
  const n = parseInt(t.slice(0, 4), 16), s = parseInt(t.slice(4, 8), 16);
  return {
    tokenId: t,
    issuer: await Zt(t.slice(8, 48)),
    burnable: (n & Wt) !== 0,
    mutable: (n & Vt) !== 0,
    transferable: (n & Kt) !== 0,
    onlyXrp: (n & Gt) !== 0,
    // TransferFee is in units of 0.001%, so 5000 is 5%.
    transferFeePct: s / 1e3,
    taxon: parseInt(t.slice(48, 56), 16),
    sequence: parseInt(t.slice(56, 64), 16)
  };
}
function tn(e) {
  return Array.isArray(e) ? e.map((t) => ({
    index: String(t.nft_offer_index ?? ""),
    owner: String(t.owner ?? ""),
    amountXrp: typeof t.amount == "string" ? Number(t.amount) / 1e6 : void 0,
    amountRaw: t.amount,
    destination: t.destination ? String(t.destination) : void 0
  })) : [];
}
async function nn(e) {
  const t = await en(e);
  let n = !1;
  const s = async (o) => {
    try {
      const i = await b(o, { nft_id: t.tokenId, ledger_index: "validated" });
      return tn(i.offers);
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
function sn(e) {
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
    severity: n.transferFeePct >= Yt ? "warn" : "info",
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
const ue = [
  "wss://xrplcluster.com",
  "wss://s1.ripple.com",
  "wss://s2.ripple.com",
  "wss://xrpl.ws"
], an = 2, rn = 4, Ne = 12e3;
function on(e) {
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
      Ne
    );
    a.onerror = () => {
      window.clearTimeout(o), r({ url: e, reachable: !1, error: "connection refused or blocked" });
    }, a.onopen = () => {
      a.send(JSON.stringify({ id: 1, command: "server_info" }));
    }, a.onmessage = (i) => {
      window.clearTimeout(o);
      try {
        const c = JSON.parse(String(i.data))?.result?.info ?? {}, d = c.validated_ledger ?? {}, u = String(c.complete_ledgers ?? "").split("-")[0];
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
          historyFrom: Number(u) || void 0,
          amendmentBlocked: typeof c.amendment_blocked == "boolean" ? c.amendment_blocked : void 0
        });
      } catch {
        r({ url: e, reachable: !1, error: "unreadable response" });
      }
    };
  });
}
function cn(e) {
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
    const r = window.setTimeout(() => a(void 0), Ne);
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
async function dn() {
  const [e, t] = await Promise.all([
    Promise.all(ue.map(on)),
    cn(ue[0])
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
function ln(e) {
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
      (d) => d.reachable && typeof d.ledgerSeq == "number" && e.leaderSeq - d.ledgerSeq >= rn
    );
    c.length > 0 ? t.push({
      id: "node-lag",
      severity: "warn",
      title: `${c.length} node${c.length === 1 ? " is" : "s are"} behind the others`,
      detail: c.map(
        (d) => `${d.url} is ${e.leaderSeq - d.ledgerSeq} ledgers back`
      ).join(". ") + ". Ledgers close every three to four seconds, so this is beyond normal cadence.",
      action: "Readings taken from a trailing node describe a ledger that has already moved on."
    }) : typeof e.spread == "number" && e.spread <= an && t.push({
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
function un(e) {
  return e.passed ? "PASS" : e.severity === "block" ? "FAIL" : "REVIEW";
}
function hn(e) {
  return e.state ?? un(e);
}
const fn = /* @__PURE__ */ new Set(["INSUFFICIENT_DATA", "NOT_APPLICABLE"]);
function gn(e) {
  return e.state && fn.has(e.state) ? [e.id, e.passed, e.state] : [e.id, e.passed];
}
async function mn(e) {
  const t = new TextEncoder().encode(e), n = await crypto.subtle.digest("SHA-256", t);
  return Array.from(new Uint8Array(n)).map((s) => s.toString(16).padStart(2, "0")).join("").toUpperCase();
}
async function pn(e) {
  return mn(
    JSON.stringify({
      kind: e.kind,
      subject: e.subject,
      scope: Object.keys(e.scope).sort().map((t) => [t, e.scope[t]]),
      evaluatedAt: e.evaluatedAt,
      checks: e.checks.map(gn)
    })
  );
}
const he = 0.95, yn = /* @__PURE__ */ new Set([
  "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
  // ACCOUNT_ZERO
  "rrrrrrrrrrrrrrrrrrrrBZbvji",
  // ACCOUNT_ONE
  "rrrrrrrrrrrrrrrrrNAMEtxvNvQ",
  // reserved for name lookups
  "rrrrrrrrrrrrrrrrrrrn5RM1rHd"
  // rippled's NaN sentinel
]);
function U(e) {
  return !!e && !yn.has(e);
}
const fe = 2500, ge = 2;
async function bn(e, t = {}) {
  const n = [], [s, a, r] = await Promise.all([
    $e(e).catch((i) => (n.push(`control: ${i instanceof Error ? i.message : String(i)}`), null)),
    Te(e).catch((i) => (n.push(`posture: ${i instanceof Error ? i.message : String(i)}`), null)),
    // The supply walk is the expensive read, so it is opt-in. When it is
    // skipped the concentration checks abstain rather than assume.
    t.walkSupply ? xe(e).catch((i) => (n.push(`issuance: ${i instanceof Error ? i.message : String(i)}`), null)) : Promise.resolve(null)
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
function Ie(e) {
  return !e || e.currencies.length === 0 ? null : e.currencies.reduce((t, n) => n.outstanding > t.outstanding ? n : t);
}
function wn(e) {
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
  const a = !!n.signers.unreadable, r = !n.masterKeyEnabled && !!n.regularKey && !U(n.regularKey), o = n.signers.present ? n.signers.minimumSigners <= 1 : U(n.regularKey) || n.masterKeyEnabled;
  t.push({
    id: "NO_UNILATERAL_SIGNER",
    label: "No single key controls the issuer",
    severity: "block",
    // A signer list that could not be read cannot be ruled out, and an
    // unverifiable absence must not read as an absence.
    passed: !o && !a,
    detail: a ? `The signer list could not be read (${n.signers.unreadable}), so it cannot be established whether a committee controls this account or one key does. This is an unknown, not a pass.` : n.signers.present ? n.signers.minimumSigners <= 1 ? `A signer list is present, but ${n.signers.unilateralSigners.length || 1} signer reaches the quorum of ${n.signers.quorum} alone. This is a single-key account wearing a committee's clothes.` : `${n.signers.minimumSigners} signers must agree to reach the quorum of ${n.signers.quorum}, derived from summed weights rather than a headcount.` : r ? `The master key is disabled and the regular key is set to ${n.regularKey}, an address whose private key does not exist. The account is blackholed: it can never sign another transaction, so no party can act on this issuance.` : U(n.regularKey) ? `No signer list. The master key is ${n.masterKeyEnabled ? "enabled" : "disabled"} and a regular key is set, so ${n.regularKey} signs for this issuer on its own.` : n.masterKeyEnabled ? "No signer list and no usable regular key, and the master key is enabled. One key signs for this issuer." : "The master key is disabled, no regular key is set and no signer list is present, so the account cannot currently be signed for at all."
  }), s.transferRateBps > 0 && t.push({
    id: "NO_TRANSFER_FEE",
    label: "No issuer transfer fee",
    severity: "warn",
    passed: !1,
    detail: `The issuer charges ${(s.transferRateBps / 100).toFixed(2)}% on every transfer between holders. The rate is set by the issuer and can be changed by them.`
  });
  const i = Ie(e.issuance), c = e.unreadable.find((d) => d.startsWith("issuance:"));
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
  else if (i.coverage < he)
    t.push({
      id: "SUPPLY_CONCENTRATION",
      label: `${F(i.currency)} supply concentration`,
      severity: "warn",
      passed: !1,
      state: "INSUFFICIENT_DATA",
      detail: `The holder lines read account for ${(i.coverage * 100).toFixed(1)}% of the outstanding ${F(i.currency)}. Below ${he * 100}% coverage no concentration figure is reported, high or low, because shares over that fraction describe the holders seen rather than the issuance.`
    });
  else {
    const d = i.hhi >= fe, u = e.issuance.source === "indexer" ? ` Holder balances are from ${e.issuance.sourceName}, not read from the ledger directly; their total was reconciled against the ledger's own obligations to within ${Math.abs(i.coverage - 1) * 100 < 0.01 ? "0.01" : (Math.abs(i.coverage - 1) * 100).toFixed(2)}%, which establishes that none are missing or invented but not that each is attributed correctly.` : " Holder balances were read from validated ledger state.";
    t.push({
      id: "SUPPLY_CONCENTRATION",
      label: `${F(i.currency)} supply not concentrated`,
      severity: "warn",
      passed: !d,
      detail: (d ? `HHI ${Math.round(i.hhi)} over ${i.holders} holders at ${(i.coverage * 100).toFixed(1)}% coverage. The largest holder carries ${i.topHolderPct.toFixed(1)}% and the top five carry ${i.topFivePct.toFixed(1)}%.` : `HHI ${Math.round(i.hhi)} over ${i.holders} holders at ${(i.coverage * 100).toFixed(1)}% coverage, below the ${fe} threshold.`) + u
    });
  }
  return t;
}
function vn(e, t = {}) {
  return e.some((n) => n.severity === "block" && !n.passed) ? "no-go" : (t.unreadable?.length ?? 0) > 0 ? "insufficient-data" : e.some((n) => !n.passed) ? "hold" : "go";
}
async function kn(e, t = {}) {
  const n = await bn(e, t);
  return Sn(n);
}
async function Sn(e) {
  const t = wn(e), n = vn(t, { unreadable: e.unreadable }), s = Ie(e.issuance)?.currency, a = e.readAt, r = await pn({
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
      rules: ge
    },
    checks: t,
    evaluatedAt: a
  });
  return {
    verdict: n,
    issuer: e.issuer,
    currency: s,
    currencyLabel: s ? F(s) : void 0,
    checks: t,
    digest: r,
    ledgerIndex: e.ledgerIndex,
    evaluatedAt: a,
    source: e.issuance?.source ?? "none",
    rulesVersion: ge
  };
}
const Tn = [
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
], $n = [
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
      "compliance_api"
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
      "White-labelled wallet",
      "Regulator read-only seats",
      "100,000 API verifications included",
      "99.9% uptime SLA with service credits",
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
      "custom_alert_logic"
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
      "Asset passports and issuer intelligence at institutional scope",
      "Portfolio monitoring, counterparty and liquidity intelligence",
      "Deterministic policy engine, adjudication and decision history",
      "Evidence records, hashes, audit exports and review workflow",
      "Institutional API, scoped keys and webhooks",
      "Dedicated environment options where supported",
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
      "dedicated_environment"
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
      "XRPL event feeds, webhooks and machine-readable delivery",
      "Custom schemas, retention and bulk export design",
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
      "event_feeds",
      "custom_schemas"
    ]
  }
], _n = [{ name: "Overview", plan: "Free", summary: "what NOSHASHI is and what it reads." }, { name: "Mission Control", plan: "Free", summary: "live mainnet telemetry, wallet gate, policy rule set." }, { name: "Verification", plan: "Free", summary: "describe a settlement, run it against a domain, get an explainable verdict and a SHA-256 receipt. Nothing is broadcast." }, { name: "Credentials", plan: "Free", summary: "XLS-70 objects held by the wallet, and which domains they unlock." }, { name: "Domain Grid", plan: "Free", summary: "XLS-80 permissioned domains and their rule sets." }, { name: "Audit Trail", plan: "Free", summary: "wallet history, filterable, exportable to CSV." }, { name: "NOSHX", plan: "Free", summary: "this assistant, NOSHASHI's agent. It reads the live ledger with read-only tools (authority, order book, settlement, control surface, provenance, pools, issuance, address check, claims, NFT rights, ledger status), each gated like its screen, answers questions about NOSHASHI itself from the product's own pages (features, screens, plans, docs, trust, legal), and by default runs on NOSHX Core, NOSHASHI's own engine, which uses no language model: it plans from the question, runs the readers and writes the answer itself. A language model can be added (the trained NOSHX model through Ollama, or a hosted one), with optional failover back to Core and a deep reasoning switch. It has an Observer that reads the wallets you name from validated mainnet on an interval and records what changed (freezes, balances, credentials, issuer powers) by fixed rules, and a one-click issuer investigation that reads an issuer's authority certificate and obligations and hands the findings to this assistant." }, { name: "Portfolio & Radar", plan: "Desk", summary: "multi-wallet surveillance and the compliance radar." }, { name: "Exposure Analysis", plan: "Desk", summary: "issuer freeze rights, Travel Rule scope, counterparty concentration." }, { name: "Ledger & Policy", plan: "Desk", summary: "local adjudication history, evidence chain and receipt verification, investigations (cases a person opens on a verdict, with notes and a written resolution; a resolution never changes the verdict), the versioned institutional policy (drafts, simulation, activation, audit trail), policy simulation, signed export." }, { name: "Check an Address", plan: "Free", summary: "read what the ledger publishes about any account." }, { name: "Token Rights", plan: "Free", summary: "what the issuer of an NFT can still do to it after someone owns it — destroy it (lsfBurnable), rewrite what its URI points at (lsfMutable), block resale entirely, or take a cut of every transfer. All of it is encoded in the NFTokenID itself and decoded offline, so no server is asked and none can answer wrongly." }, { name: "Inbox", plan: "Free", summary: "every check a stranger has addressed to an account, and whether the token each one offers has ever been issued by anyone. A currency code is not a name anyone owns — any account can issue a token called USDT — so an unsolicited claim for a large round sum from an issuer with no obligations is impersonation, not money. Receiving one costs nothing and cannot move funds." }, { name: "Ledger Sync", plan: "Free", summary: "four public XRPL nodes queried and compared, with disagreement between them treated as the reading." }, { name: "Learn", plan: "Free", summary: "short animated explainers." }, { name: "Settlement", plan: "Desk", summary: "what a transaction actually DELIVERED against what it requested. A partial payment can return tesSUCCESS having delivered a fraction of the stated amount; this is the screen for that question." }, { name: "Ledger Garden", plan: "Desk", summary: "walk the ledger's relationships one validated read at a time — an issuer's assets, an asset's holders (from the first 200 of the issuer's trust lines, in ledger order; Issuance walks them all), an account's holdings and recent transactions, a transaction's settlement evidence — then hand the whole path to this agent as a question." }, { name: "Provenance", plan: "Desk", summary: "how long an account has existed and who sent it its first XRP. Note the sequence number is not a transaction count on modern accounts." }, { name: "Control Surface", plan: "Desk", summary: "how few signers can actually move a treasury, whether the master key bypasses the quorum, and how much balance is locked rather than spendable." }, { name: "Order Book", plan: "Desk", summary: "how much of an order book's quoted depth is backed by an owner who still holds the asset. An offer rests whether or not its owner kept the funds, and nothing removes it until someone tries to cross it — on some mainnet books over 90% of the visible depth cannot fill." }, { name: "Pool Governance", plan: "Desk", summary: "who votes an AMM's trading fee, on what share of the liquidity, and who holds the discounted auction slot." }, { name: "Issuance", plan: "Institution", summary: "holder concentration and enforcement history for an issuer, from the issuer's side." }, { name: "Authority Certificate", plan: "Desk", summary: "what authority an issuer has kept over an asset it issued — whether it can freeze a holder, whether it gave that power up irrevocably (lsfNoFreeze cannot be cleared once set), whether the asset is frozen right now, whether holding it needs the issuer's permission, whether one signer reaches the quorum alone, what it charges on a transfer between holders, and how concentrated the supply is. Each answer is a fact at one named ledger index, and the set is digested with SHA-256 so the same reading can be checked again later. It is NOT a score — no number is composited from the checks — and NOT a legal finding: whether an asset is decentralised or is a security is a determination for an agency applying statutory criteria, which this software does not evaluate. If the supply walk is skipped, or trust-line coverage falls below 95%, the concentration check abstains rather than passing." }, { name: "Asset Passport", plan: "Enterprise", summary: "a signed, portable record of an asset’s compliance posture — issuer authority, freeze rights, concentration, domain eligibility — that travels with the asset and can be verified by any counterparty without re-running the checks." }, { name: "Growth", plan: "Free", summary: "platform-native drafts built from measured figures." }, { name: "Pricing", plan: "Free", summary: "plans, checkout and verification credits." }, { name: "Account", plan: "Free", summary: "subscription, two-factor authentication and API keys." }, { name: "Business Plan", plan: "Free", summary: "revenue streams, tiers and sequencing." }, { name: "Legal & Accessibility", plan: "Free", summary: "policies, accessibility statement and contact routes." }, { name: "Trust & Security", plan: "Free", summary: "the read-only data path from the ledger to the receipt, what NOSHASHI never does (no keys, custody, signing or broadcast), where data goes, and what it does not claim." }, { name: "Settings", plan: "Free", summary: "appearance, accessibility, wallet address, notifications, launch at login, global shortcut and Keychain storage." }], Fe = {
  scenes: _n
}, An = "https://www.noshashi.app";
function xn() {
  const e = Tn.map((n) => ({
    title: `Help › ${n.question}`,
    source: "NOSHX › Support",
    text: `${n.question}
${n.answer}`
  }));
  for (const n of $n)
    e.push({
      title: `Pricing › ${n.name}`,
      source: `${An}/pricing/`,
      text: `${n.name} plan, for ${n.audience}. Price (cost): ${n.priceLabel} ${n.cadence}. Includes: ${n.features.join("; ")}.`
    });
  const t = Fe.scenes;
  for (let n = 0; n < t.length; n += 6)
    e.push({
      title: "App screens",
      source: "NOSHASHI desktop app",
      text: t.slice(n, n + 6).map((s) => `${s.name} (${s.plan}): ${s.summary}`).join(`
`)
    });
  return e;
}
const Nn = new Set(
  "a an and are as at be but by can do does for from has have how i if in is it its me my of on or our so that the their them then there these this to was we what when where which who why will with you your".split(" ")
), In = {
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
function x(e) {
  return (e.toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) ?? []).filter((t) => !Nn.has(t) && t.length > 1).map((t) => In[t] ?? (t.length > 4 ? t.replace(/(ies|es|s|ing|ed)$/, (n) => n === "ies" ? "y" : "") : t));
}
function Fn(e) {
  const t = [], n = [];
  for (const o of e) {
    const i = x(o.title), c = x(o.text), d = /* @__PURE__ */ new Map();
    for (const u of i) d.set(u, (d.get(u) ?? 0) + 2);
    for (const u of c) d.set(u, (d.get(u) ?? 0) + 1);
    t.push(d), n.push(` ${i.join(" ")} ${c.join(" ")} `);
  }
  const s = t.map((o) => [...o.values()].reduce((i, c) => i + c, 0)), a = /* @__PURE__ */ new Map();
  for (const o of t) for (const i of o.keys()) a.set(i, (a.get(i) ?? 0) + 1);
  const r = s.reduce((o, i) => o + i, 0) / Math.max(1, s.length);
  return { passages: e, docs: t, sequences: n, lengths: s, df: a, avg: r };
}
function On(e, t, n = 5) {
  const s = x(t), a = [...new Set(s)], r = s.slice(1).map((l, h) => ` ${s[h]} ${l} `);
  if (a.length === 0) return [];
  const o = e.passages.length, i = 1.4, c = 0.55, d = (l) => {
    const h = e.df.get(l) ?? 0;
    return Math.log(1 + (o - h + 0.5) / (h + 0.5));
  }, u = [];
  e.docs.forEach((l, h) => {
    let g = 0;
    for (const m of a) {
      const y = l.get(m);
      y && (g += d(m) * y * (i + 1) / (y + i * (1 - c + c * e.lengths[h] / e.avg)));
    }
    for (const m of r)
      if (e.sequences[h].includes(m)) {
        const [y, p] = m.trim().split(" ");
        g += 0.6 * (d(y) + d(p));
      }
    g > 0 && u.push({ ...e.passages[h], score: g * (e.passages[h].weight ?? 1) });
  }), u.sort((l, h) => h.score - l.score);
  const f = /* @__PURE__ */ new Set();
  return u.filter((l) => !f.has(l.title) && f.add(l.title)).slice(0, n);
}
let R = null, Oe = [];
function En(e) {
  Oe = e, R = null;
}
function Ee() {
  return R ?? (R = import("./pages-RBNonDxZ.js").then(({ default: e }) => Fn([...xn(), ...Oe, ...e]))), R;
}
function Pn() {
  if (R) return;
  const e = () => {
    Ee();
  };
  typeof requestIdleCallback == "function" ? requestIdleCallback(e, { timeout: 1500 }) : setTimeout(e, 0);
}
async function Pe(e, t = 5) {
  return On(await Ee(), e, t);
}
const Ln = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/, Rn = /^[0-9A-Fa-f]{64}$/;
class C extends Error {
}
function N(e, t = "address") {
  const n = String(e[t] ?? "").trim();
  if (!Ln.test(n)) throw new C(`${t} must be a classic XRPL address starting with r.`);
  return n;
}
function me(e, t) {
  const n = String(e[t] ?? "").trim();
  if (!Rn.test(n)) throw new C(`${t} must be 64 hexadecimal characters.`);
  return n;
}
const S = (e, t = Object.keys(e)) => ({ type: "object", properties: e, required: t, additionalProperties: !1 }), _ = (e) => ({ type: "string", description: e }), Cn = [
  {
    name: "search_noshashi",
    description: "Search NOSHASHI's own pages and help: every app screen and button, features, plans and prices, the Learn course and word list, docs (API, webhooks, receipts, policies, security, enterprise), trust, legal and privacy. Use it for any question about the product, what a customer should use, or how NOSHASHI handles compliance. Returns passages with their page address.",
    input_schema: S({ query: { type: "string", description: "What to look up, in plain words" } }),
    feature: null,
    screen: "NOSHASHI pages",
    run: async (e) => {
      const t = String(e.query ?? "").trim();
      if (!t) throw new C("query is empty.");
      const n = await Pe(t, 6);
      return n.length === 0 ? "Nothing in NOSHASHI's pages matches that. Say so rather than guess." : n.map((s) => ({ title: s.title, source: s.source, text: s.text }));
    }
  },
  {
    name: "ledger_status",
    description: "The latest validated XRP Ledger: index, hash, close time, reference fee and open-ledger fee. Call this to stamp an answer with the ledger it describes.",
    input_schema: S({}),
    feature: null,
    screen: "Mission Control",
    run: () => We()
  },
  {
    name: "ledger_sync",
    description: "What four public XRPL servers each report right now (ledger index, state, fees) and where they disagree.",
    input_schema: S({}),
    feature: null,
    screen: "Ledger Sync",
    run: () => dn()
  },
  {
    name: "check_address",
    description: "What the ledger publishes about an account before someone pays it: existence, age, destination tag requirement, flags and anything recorded against it. Reports facts, never 'safe'.",
    input_schema: S({ address: _("Classic address, r…") }),
    feature: null,
    screen: "Check an Address",
    run: async (e, t) => {
      const n = N(e), s = !t.has("portfolios");
      if (s && !t.spendFreeCheck())
        throw new C("This month's 10 free address checks are used up. Pro includes unlimited checks.");
      const a = await rt(n);
      if (a.verdict === "unknown" && !a.exists && a.findings.length === 0)
        throw s && t.refundFreeCheck?.(), new Error("The ledger could not be reached, so nothing about this address is known yet. Try again in a moment.");
      return a;
    }
  },
  {
    name: "read_claims",
    description: "Tokens and claims other accounts have sent to an address, and whether each is real or an impersonation (a familiar ticker from an issuer with no obligations).",
    input_schema: S({ address: _("Classic address whose inbox to read") }),
    feature: null,
    screen: "Inbox",
    run: (e) => Ut(N(e))
  },
  {
    name: "read_token_rights",
    description: "What an NFT's issuer can still do after someone owns it: burnable, transferable, transfer fee, taxon.",
    input_schema: S({ token_id: _("The 64-character NFTokenID") }),
    feature: null,
    screen: "Token Rights",
    run: (e) => nn(me(e, "token_id"))
  },
  {
    name: "certify_authority",
    description: "The six issuer checks (freeze surrendered, not globally frozen, open holding, no single key controls the issuer, transfer fee, supply concentration) with GO/HOLD/NO-GO, ledger index and SHA-256 digest.",
    input_schema: S({ issuer: _("Issuer's classic address") }),
    feature: "authority_certificate",
    screen: "Authority",
    run: (e) => kn(N(e, "issuer"), { walkSupply: !1 })
  },
  {
    name: "read_provenance",
    description: "Where an account came from: its real age (corrected for the Sequence misreading) and the account that first funded it.",
    input_schema: S({ address: _("Counterparty address") }),
    feature: "portfolios",
    screen: "Provenance",
    run: (e) => gt(N(e))
  },
  {
    name: "read_book",
    description: "An order book's listed versus funded depth (offers whose owners can really fill them), the unfunded share, spread and mid price. The book is the currency against XRP.",
    input_schema: S({
      currency: { type: "string", description: "Currency code, e.g. USD, or a 40-character hex code" },
      issuer: _("Issuer's classic address")
    }),
    feature: "portfolios",
    screen: "Order Book",
    run: (e) => {
      const t = String(e.currency ?? "").trim();
      if (!/^([A-Za-z0-9]{3}|[0-9A-Fa-f]{40})$/.test(t))
        throw new C("currency must be a 3-character code or 40 hexadecimal characters.");
      return kt(t, N(e, "issuer"));
    }
  },
  {
    name: "read_settlement",
    description: "What a transaction actually delivered: type, sender, result, whether the partial-payment flag was set, requested versus delivered amount, and the fee burned.",
    input_schema: S({ hash: _("Transaction hash, 64 hexadecimal characters") }),
    feature: "portfolios",
    screen: "Settlement",
    run: (e) => _t(me(e, "hash"))
  },
  {
    name: "read_control_surface",
    description: "Who can move an account's funds: master key status, regular key, signer list and quorum, the fewest signers that reach quorum, master-key bypass, and XRP locked in reserve.",
    input_schema: S({ address: _("Treasury or issuer address") }),
    feature: "portfolios",
    screen: "Control Surface",
    run: (e) => $e(N(e))
  },
  {
    name: "read_pool",
    description: "An AMM pool's balances, trading fee, fee votes weighted by LP tokens, and who holds the auction slot.",
    input_schema: S({ amm_account: _("The AMM pool's own account address") }),
    feature: "portfolios",
    screen: "Pool Governance",
    run: (e) => It({ ammAccount: N(e, "amm_account") })
  },
  {
    name: "read_issuance",
    description: "A token from the issuer's side: currencies issued, outstanding obligations, holder lines read, the largest holder, concentration, and enforcement history (freezes and clawbacks).",
    input_schema: S({ issuer: _("Issuer's classic address") }),
    feature: "portfolios",
    screen: "Issuance",
    run: (e) => xe(N(e, "issuer"))
  }
];
function Le(e) {
  return Cn.find((t) => t.name === e);
}
async function B(e, t, n) {
  const s = Le(e);
  if (!s) return { ok: !1, error: `No tool named ${e}.` };
  if (s.feature && !n.has(s.feature))
    return { ok: !1, gated: !0, error: `${s.screen} needs a Pro plan or higher.` };
  try {
    return { ok: !0, value: await s.run(t ?? {}, n) };
  } catch (a) {
    return { ok: !1, error: a instanceof Error ? a.message : "The read failed." };
  }
}
const Re = /\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/g, Ce = /\b[0-9A-Fa-f]{64}\b/g, Dn = /\b[0-9A-F]{40}\b/g, Hn = /\b[A-Z][A-Z0-9]{2}\b/g, qn = /* @__PURE__ */ new Set([
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
function zn(e) {
  const t = (r) => [...new Set(r)], n = t(e.match(Ce) ?? []).map((r) => r.toUpperCase()), s = (e.match(Dn) ?? []).filter((r) => !n.some((o) => o.includes(r))), a = (e.match(Hn) ?? []).filter((r) => !qn.has(r));
  return {
    addresses: t(e.match(Re) ?? []),
    hashes: n,
    currencies: t([...a, ...s])
  };
}
const Xn = { certify_authority: "issuer", read_issuance: "issuer", read_pool: "amm_account" }, Mn = [
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
    words: /\bpay\b|paying|send (to|money|xrp)|safe|scam|legit|trust(worthy)?\b|check (this|the|an|that)? ?(address|account|wallet)|counterparty|risky|who is|is (this|it) (ok|fine|real)|destination tag/i
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
], Un = /noshashi|noshx|\bplans?\b|pricing|price|cost|which screen|how (do|can|should) i|what (is|are|does)|explain|difference between|what does .* mean|travel rule|\bkyc\b|\baml\b|mica|webhook|\bapi\b|examiner|auditor/i;
function De(e) {
  const t = zn(e), n = [], s = (r) => {
    n.some((o) => o.tool === r.tool && JSON.stringify(o.input) === JSON.stringify(r.input)) || n.push(r);
  };
  for (const r of Mn)
    if (r.words.test(e))
      if (r.needs === "address")
        for (const o of t.addresses) s({ tool: r.tool, input: { [Xn[r.tool] ?? "address"]: o }, why: r.label });
      else if (r.needs === "hash")
        for (const o of t.hashes)
          s({ tool: r.tool, input: r.tool === "read_token_rights" ? { token_id: o } : { hash: o }, why: r.label });
      else if (r.needs === "book") {
        const o = t.addresses[0];
        for (const i of t.currencies) o && s({ tool: r.tool, input: { currency: i, issuer: o }, why: r.label });
      } else
        s({ tool: r.tool, input: {}, why: r.label });
  if (n.length === 0) {
    for (const r of t.hashes) s({ tool: "read_settlement", input: { hash: r }, why: "a hash on its own" });
    for (const r of t.addresses) s({ tool: "check_address", input: { address: r }, why: "an address on its own" });
  }
  const a = n.length === 0 || Un.test(e.replace(Re, " ").replace(Ce, " "));
  return { calls: n.slice(0, 6), knowledge: a, entities: t };
}
const Bn = Fe.scenes, jn = x("noshashi noshx plan plans need use screen screens help feature which tool tools we our us want get way much many cost price pay"), Wn = /\bwhich\b|\bwhat (screen|tool|plan|should)|how (do|can|does|should) (i|we|noshashi)|\bhelp\b|\bneed\b|\buse\b|where (do|can)|feature/i;
function Gn(e, t = 3) {
  const n = new Set(x(e));
  for (const s of jn) n.delete(s);
  return Bn.map((s) => {
    const a = x(`${s.name} ${s.name} ${s.summary}`), r = a.filter((o) => n.has(o)).length;
    return { scene: s, score: r / Math.sqrt(a.length + 4) };
  }).filter((s) => s.score > 0.12).sort((s, a) => a.score - s.score).slice(0, t).map((s) => s.scene);
}
const pe = { critical: 0, warn: 1, info: 2, ok: 3 }, Kn = { critical: "✕", warn: "!", info: "·", ok: "✓" };
function A(e, t = 6) {
  const n = [...e].sort((s, a) => pe[s.severity] - pe[a.severity]).slice(0, t);
  return n.length === 0 ? "Nothing notable was recorded." : n.map((s) => `${Kn[s.severity]} ${s.title}. ${s.detail}${s.action ? ` What to do: ${s.action}` : ""}`).join(`
`);
}
const I = (e) => e ? ` (validated ledger ${e.toLocaleString("en-US")})` : "", ye = (e) => e.length > 12 ? `${e.slice(0, 6)}…${e.slice(-4)}` : e;
function be(e, t) {
  switch (e) {
    case "check_address": {
      const n = t, s = X[n.verdict];
      return [
        `Address check for ${n.address}${I(n.ledgerIndex)}: ${s.label}.${n.headline === s.label ? "" : ` ${n.headline}`}`,
        n.exists ? `Balance ${n.balanceXrp.toLocaleString("en-US")} XRP${n.domain ? `, claims the domain ${n.domain} (claimed, not verified)` : ""}${n.isIssuer ? `, issues ${n.issuedCurrencies.join(", ") || "tokens"}` : ""}.` : "",
        A(n.findings),
        "This reports what the ledger publishes. Nothing recorded against an address is not the same as safe."
      ].filter(Boolean).join(`
`);
    }
    case "certify_authority": {
      const n = t, s = n.checks.map((a) => {
        const r = hn(a);
        return `${r === "PASS" ? "✓" : r === "FAIL" ? "✕" : "!"} ${a.label} (${a.severity === "block" ? "blocking" : "warning"}): ${r}. ${a.detail}`;
      }).join(`
`);
      return [
        `Authority certificate for issuer ${n.issuer}${n.currencyLabel ? ` (${n.currencyLabel})` : ""}${I(n.ledgerIndex)}: ${n.verdict.toUpperCase()}.`,
        s,
        `Digest ${n.digest.slice(0, 16)}…, so anyone can re-check this reading.`
      ].join(`
`);
    }
    case "read_control_surface": {
      const n = t;
      return [
        `Who controls ${n.address}${I(n.ledgerIndex)}: master key ${n.masterKeyEnabled ? "enabled" : "disabled"}${n.regularKey ? `, regular key ${ye(n.regularKey)}` : ""}${n.signers.present ? `, signer list quorum ${n.signers.quorum} with the fewest signers that reach it being ${n.signers.minimumSigners}` : ", no signer list"}. Balance ${n.balanceXrp.toLocaleString("en-US")} XRP, ${n.reserveLockedXrp.toLocaleString("en-US")} XRP locked in reserve${n.escrowedXrp ? `, ${n.escrowedXrp.toLocaleString("en-US")} XRP in escrow` : ""}.`,
        A(lt(n))
      ].join(`
`);
    }
    case "read_provenance": {
      const n = t;
      return [`Provenance of ${n.address}${n.ageDays !== void 0 ? `, about ${Math.round(n.ageDays).toLocaleString("en-US")} days old` : ""}${n.fundedBy ? `, first funded by ${n.fundedBy}` : ""}:`, A(yt(n))].join(`
`);
    }
    case "read_book": {
      const n = t;
      return [`Order book${I(n.ledgerIndex)}:`, A(St(n))].join(`
`);
    }
    case "read_settlement": {
      const n = t;
      return [
        `Transaction ${ye(n.hash)}${I(n.ledgerIndex)}: ${n.transactionType}, result ${n.result}${n.validated ? "" : " (not yet validated, so nothing here is final)"}.`,
        A(xt(n))
      ].join(`
`);
    }
    case "read_pool": {
      const n = t;
      return [`AMM pool${I(n.ledgerIndex)}:`, A(Et(n))].join(`
`);
    }
    case "read_issuance": {
      const n = t;
      return [`Issuance${I(n.ledgerIndex)}:`, A(qt(n))].join(`
`);
    }
    case "read_claims": {
      const n = t;
      return [`Tokens sent to the account${I(n.ledgerIndex)}:`, A(jt(n))].join(`
`);
    }
    case "read_token_rights":
      return ["NFT rights:", A(sn(t))].join(`
`);
    case "ledger_sync":
      return ["What the public servers report:", A(ln(t))].join(`
`);
    case "ledger_status": {
      const n = t;
      return `Latest validated ledger ${n.ledgerIndex.toLocaleString("en-US")}, closed ${n.closeTime}. Reference fee ${n.baseFeeXrp} XRP; the open ledger is charging ${n.openLedgerFeeXrp} XRP with ${n.queueSize} transactions queued.`;
    }
    default:
      return "";
  }
}
function Vn(e) {
  return e.replace(/^Q: .*$/m, "").replace(/^A: /m, "").replace(/([.!?])\s+/g, `$1
`).split(/\n+/).map((t) => t.trim()).filter((t) => t.length > 25 && !/^[|·—-]/.test(t));
}
function Yn(e, t) {
  if (t.length === 0) return "";
  const n = new Set(x(e)), s = t[0], a = /^(Help ›|Support ›|Learn NOSHASHI › Knowledge check|Pricing ›)/, r = t.slice(0, 2).find((l) => a.test(l.title) && l.score >= s.score * 0.85);
  if (r) {
    let l = r.text.replace(/^Q: .*\nA: /, "");
    return /^(Help|Support) ›/.test(r.title) && (l = l.split(`
`).slice(1).join(`
`) || l), `${l}

Source: ${r.title} · ${r.source}`;
  }
  if (s.title.startsWith("Learn NOSHASHI › Word list")) {
    const l = s.text.split(`
`).find((h) => x(h.split(":")[0]).some((g) => n.has(g)));
    if (l) return `${l}

Source: NOSHASHI word list · ${s.source}`;
  }
  const o = t.slice(0, 3).flatMap(
    (l, h) => Vn(l.text).map((g, m) => {
      const y = x(g), p = y.filter(($) => n.has($)).length;
      return { hit: l, sentence: g, position: m, score: p / Math.sqrt(y.length + 1) + (h === 0 ? 0.3 : 0) - m * 0.01 };
    })
  ), i = /* @__PURE__ */ new Set(), c = o.filter((l) => l.score > 0).sort((l, h) => h.score - l.score).filter((l) => {
    const h = l.sentence.toLowerCase().replace(/\s+/g, " ");
    return !i.has(h) && i.add(h);
  }).slice(0, 4);
  if (c.length === 0) return `${s.text.slice(0, 600)}

Source: ${s.title} · ${s.source}`;
  const d = /* @__PURE__ */ new Map();
  for (const l of c) d.set(l.hit, [...d.get(l.hit) ?? [], l]);
  const u = [], f = [];
  for (const [l, h] of d)
    u.push(h.sort((g, m) => g.position - m.position).map((g) => g.sentence).join(" ")), f.push(`${l.title} · ${l.source}`);
  return `${u.join(`

`)}

Source${f.length > 1 ? "s" : ""}: ${f.join("; ")}`;
}
async function Qn(e, t, n) {
  const s = De(e), a = [], r = (f) => {
    a.push(f), n?.(f);
  }, o = await Promise.all(
    s.calls.map(async (f) => {
      const l = await B(f.tool, f.input, t), h = s.calls.some((g) => g.tool === "check_address" && g.input.address === f.input.issuer);
      if (l.ok === !1 && l.gated && f.tool === "certify_authority" && typeof f.input.issuer == "string" && !h) {
        const g = await B("check_address", { address: f.input.issuer }, t);
        if (g.ok)
          return r({ kind: "tool", name: "check_address", input: { address: f.input.issuer }, ok: !0, summary: "read" }), { call: { ...f, tool: "check_address", input: { ...f.input, address: f.input.issuer } }, result: g, gatedFrom: f };
      }
      if (!l.ok && f.tool === "read_settlement" && !l.gated) {
        const g = await B("read_token_rights", { token_id: f.input.hash }, t);
        if (g.ok)
          return r({ kind: "tool", name: "read_token_rights", input: { token_id: f.input.hash }, ok: !0, summary: "read" }), { call: { ...f, tool: "read_token_rights" }, result: g };
      }
      return r({
        kind: "tool",
        name: f.tool,
        input: f.input,
        ok: l.ok,
        summary: l.ok ? "read" : l.error
      }), { call: f, result: l };
    })
  ), i = [];
  for (const f of o) {
    const { call: l, result: h } = f, g = Le(l.tool)?.screen ?? l.tool;
    h.ok && "gatedFrom" in f ? i.push(
      `${be(l.tool, h.value)}

That is the free address check. The six issuer checks with a GO/HOLD/NO-GO certificate need Pro in the app, and are free on the website without an account: https://www.noshashi.app/certificate/`
    ) : h.ok ? i.push(be(l.tool, h.value)) : h.gated ? i.push(
      l.tool === "certify_authority" ? `${g}: ${h.error} The same six issuer checks are free on the website, without an account: https://www.noshashi.app/certificate/ (paste ${String(l.input.issuer ?? "the issuer address")}).` : `${g}: ${h.error} It is available after upgrading in Pricing.`
    ) : i.push(`${g}: could not be read. ${h.error}`);
  }
  let c = "";
  if (s.knowledge) {
    const f = await Pe(e, 5).catch(() => []);
    if (r({ kind: "tool", name: "search_noshashi", input: { query: e.slice(0, 60) }, ok: f.length > 0, summary: f.length ? `${f.length} passages` : "nothing matched" }), c = Yn(e, f), Wn.test(e)) {
      const l = Gn(e);
      l.length > 0 && (c += `${c ? `

` : ""}Where in NOSHASHI:
${l.map((h) => `→ ${h.name} (${h.plan}): ${h.summary}`).join(`
`)}`);
    }
  }
  const d = i.join(`

`);
  let u = [d, c].filter(Boolean).join(`

`);
  return u || (u = "I could not find that in NOSHASHI's pages, and the question names nothing I can read from the ledger. Name an address (r…), an issuer and currency, or a 64-character transaction hash, or ask about a NOSHASHI screen, plan or feature."), { text: u, steps: a, plan: s, facts: d };
}
const E = {
  support: "support@noshashi.app",
  institutions: "institutions@noshashi.app",
  security: "security@noshashi.app",
  privacy: "privacy@noshashi.app",
  form: "/contact/"
}, Y = [
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
    a: `The contact form reaches the team directly. For specific routes: ${E.support} for product support, ${E.institutions} for institutional enquiries, ${E.security} for vulnerability reports and ${E.privacy} for data questions.`,
    links: [{ label: "Contact form", href: "/contact/" }]
  }
], Jn = new Set(
  "a an the is are was were be been do does did can could would should i you it this that of for to in on at by with my your our we us and or if how what when where why not no yes please tell me about".split(" ")
);
function j(e) {
  return String(e || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !Jn.has(t));
}
function Zn(e) {
  const t = j(e);
  return t.length ? Y.map((n) => {
    const s = new Set(n.keywords), a = new Set(j(n.q)), r = new Set(j(n.a));
    let o = 0;
    for (const i of t)
      s.has(i) ? o += 3 : a.has(i) ? o += 2 : r.has(i) ? o += 0.5 : [...s].some((c) => c.startsWith(i) || i.startsWith(c)) && (o += 1.5);
    return { entry: n, score: o };
  }).filter((n) => n.score > 0).sort((n, s) => s.score - n.score) : [];
}
const we = 3;
function es(e) {
  const t = Zn(e), n = t[0];
  if (!n || n.score < we)
    return {
      grounded: !1,
      text: "I can answer questions about pricing, downloads and verification, what the paid tiers add, privacy and security posture, billing, and the XRPL data the product reads. I don't have a confident answer to that one — rather than guess, send it to the team and you'll get a real answer.",
      links: [{ label: "Contact the team", href: E.form }],
      matched: t.slice(0, 3).map((a) => a.entry.id)
    };
  const s = t.slice(1, 3).filter((a) => a.score > we * 0.8).map((a) => a.entry.q);
  return {
    grounded: !0,
    text: n.entry.a,
    links: n.entry.links || [],
    related: s,
    matched: [n.entry.id]
  };
}
const ve = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz", ts = /\bs[1-9A-HJ-NP-Za-km-z]{24,34}\b/g;
function ns(e) {
  const t = [0];
  for (const r of e) {
    const o = ve.indexOf(r);
    if (o < 0) return null;
    let i = o;
    for (let c = t.length - 1; c >= 0; c -= 1)
      i += t[c] * 58, t[c] = i & 255, i >>= 8;
    for (; i > 0; )
      t.unshift(i & 255), i >>= 8;
  }
  let n = 0;
  for (; n < e.length && e[n] === ve[0]; ) n += 1;
  let s = 0;
  for (; s < t.length && t[s] === 0; ) s += 1;
  const a = new Uint8Array(n + t.length - s);
  return a.set(t.slice(s), n), a;
}
async function ss(e) {
  const t = e.slice(0, e.length - 4), n = await crypto.subtle.digest("SHA-256", t), s = new Uint8Array(await crypto.subtle.digest("SHA-256", n));
  return e.slice(e.length - 4).every((r, o) => r === s[o]);
}
async function as(e) {
  const t = ns(e);
  if (!t) return !1;
  const n = t.length === 21 && t[0] === 33, s = t.length === 23 && t[0] === 1 && t[1] === 225 && t[2] === 75;
  return !n && !s ? !1 : ss(t);
}
async function rs(e) {
  for (const t of e.matchAll(ts))
    if (await as(t[0])) return !0;
  return !1;
}
class is extends Error {
  constructor() {
    super(
      "That message contains an XRPL secret seed, so it was not sent. NOSHASHI never needs a seed. Treat this one as exposed: move the funds to a new account and stop using it."
    ), this.name = "SecretInMessageError";
  }
}
const He = 10, qe = "noshashi:web.checks", G = () => {
  const e = /* @__PURE__ */ new Date();
  return `${e.getUTCFullYear()}-${String(e.getUTCMonth() + 1).padStart(2, "0")}`;
};
function os() {
  try {
    const e = JSON.parse(localStorage.getItem(qe) ?? "null");
    if (e && e.month === G() && typeof e.count == "number" && Number.isFinite(e.count))
      return { month: e.month, count: Math.max(0, e.count) };
  } catch {
  }
  return { month: G(), count: 0 };
}
let ze = 0;
function ke(e) {
  ze = e;
  try {
    localStorage.setItem(qe, JSON.stringify({ month: G(), count: e }));
  } catch {
  }
}
const K = () => Math.max(os().count, ze), cs = {
  has: () => !1,
  spendFreeCheck: () => {
    const e = K();
    return e >= He ? !1 : (ke(e + 1), !0);
  },
  refundFreeCheck: () => ke(Math.max(0, K() - 1))
}, V = "Support › ";
En(
  Y.map((e) => ({
    title: `${V}${e.q}`,
    source: "noshashi.app support",
    text: `${e.q}
${e.a}`,
    // Written for exactly the questions visitors ask, so they lead a close call.
    weight: 1.25
  }))
);
const W = { label: "Contact the team", href: E.form };
function ds(e) {
  const t = /\n\nSources?: ([^\n]+)/.exec(e);
  if (!t) return { body: e, links: [] };
  const n = [];
  let s;
  for (const a of t[1].split("; ")) {
    const r = a.lastIndexOf(" · "), o = r >= 0 ? a.slice(0, r) : a, i = r >= 0 ? a.slice(r + 3) : "";
    o.startsWith(V) && (s = o.slice(V.length));
    const c = /^https:\/\/www\.noshashi\.app(\/[^\s]*)?$/.exec(i);
    if (!c) continue;
    const d = c[1] ?? "/";
    if (n.some((f) => f.href.split("#")[0] === d.split("#")[0])) continue;
    const u = (o.split(" › ").pop() ?? o).replace(/^NOSHASHI — /, "").trim();
    n.push({ label: u.length > 38 ? `${u.slice(0, 36)}…` : u, href: d });
  }
  return { body: e.replace(t[0], ""), links: n.slice(0, 3), support: s };
}
async function hs(e, t) {
  const n = String(e ?? "").trim().slice(0, 600);
  if (!n)
    return { text: "Ask a question about NOSHASHI, or paste an XRPL address, token id or transaction hash.", steps: [], links: [], related: [], source: "none" };
  if (await rs(n))
    return { text: new is().message, steps: [], links: [], related: [], source: "refused" };
  const s = De(n).calls.length > 0, a = [];
  let r = !1;
  try {
    const o = await Qn(n, cs, (h) => {
      if (h.kind !== "tool") return;
      if (h.name === "search_noshashi") {
        r = h.ok;
        return;
      }
      const g = { reader: ls[h.name] ?? h.name, ok: h.ok, summary: h.summary };
      a.push(g), t?.(g);
    });
    if (!o.facts && !r)
      return { text: es(n).text, steps: a, links: [W], related: [], source: "none" };
    const { body: i, links: c, support: d } = ds(o.text), u = d ? Y.find((h) => h.q === d) : void 0, f = i.includes("https://www.noshashi.app/certificate/") ? [{ label: "Free issuer certificate", href: "/certificate/" }] : [], l = [...u?.links ?? [], ...f, ...c];
    return {
      text: i,
      steps: a,
      links: l.some((h) => h.href === E.form) ? l.slice(0, 4) : [...l.slice(0, 3), W],
      related: [],
      source: o.facts ? "ledger" : u ? "support" : "pages"
    };
  } catch (o) {
    return {
      text: `NOSHX could not finish that: ${o instanceof Error ? o.message : "an unexpected error"}. Try again, or contact the team.`,
      steps: a,
      links: [W],
      related: [],
      source: s ? "ledger" : "none"
    };
  }
}
const ls = {
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
}, fs = () => Math.max(0, He - K()), gs = () => Pn();
export {
  hs as ask,
  fs as checksLeft,
  gs as prewarm,
  ds as splitSources
};
