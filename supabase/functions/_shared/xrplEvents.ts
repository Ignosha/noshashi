/**
 * XRPL events and deposit screening — pure, shared by the server watcher
 * (noshashi-xrpl-watch) and the app's tests. No imports, no I/O: callers
 * read the ledger and pass the replies in.
 *
 * classifyTransaction() turns one validated transaction into the events it
 * means for a watched account: a payment in or out, a trust line or its
 * freeze changing, account settings changing, offers, checks, escrows,
 * clawbacks, NFTs and AMM activity. Machine-readable, with the ledger index
 * and hash, so an institution's systems can act on them.
 *
 * screenDeposit() judges one incoming payment to a deposit address the way
 * an exchange's credit system has to, before it credits anything:
 *
 *   - what actually arrived (delivered_amount), never what was asked for:
 *     a partial payment that asks for 100,000 XRP and delivers 0.077 is a
 *     successful transaction, and crediting Amount is how exchanges have
 *     been drained;
 *   - whether it can be attributed (destination tag);
 *   - whether the token is the one its ticker suggests (a familiar code
 *     from an issuer that owes nothing is a counterfeit), and whether its
 *     issuer can freeze or claw it back;
 *   - who sent it: how new the sender is, who funded it and who funded
 *     them, checked against the institution's own deny list.
 *
 * It reports facts and a verdict (clear / review / hold) with the amount to
 * credit. It never guesses: a fact that could not be read is said to be
 * unknown and holds the deposit for review rather than passing it.
 */

// ── Amounts ──────────────────────────────────────────────────────────

export type Amount = { currency: string; issuer: string | null; value: number };

export function amountOf(raw: unknown): Amount | null {
  if (typeof raw === "string" && /^\d+$/.test(raw)) return { currency: "XRP", issuer: null, value: Number(raw) / 1_000_000 };
  if (raw && typeof raw === "object") {
    const a = raw as Record<string, unknown>;
    const value = Number(a.value);
    if (typeof a.currency === "string" && typeof a.issuer === "string" && Number.isFinite(value)) {
      return { currency: decodeCurrency(a.currency), issuer: a.issuer, value };
    }
  }
  return null;
}

export function decodeCurrency(code: string): string {
  if (!/^[0-9A-F]{40}$/i.test(code)) return code;
  const text = (code.match(/../g) ?? []).map((b) => String.fromCharCode(parseInt(b, 16))).join("").replace(/\0+$/, "").trim();
  return text && /^[\x20-\x7E]+$/.test(text) ? text : code;
}

export const formatAmount = (a: Amount) =>
  `${a.value.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${a.currency}${a.issuer ? `.${a.issuer.slice(0, 6)}…` : ""}`;

// ── Events ───────────────────────────────────────────────────────────

export type EventType =
  | "payment_in"
  | "payment_out"
  | "payment_self"
  | "trustline_changed"
  | "trustline_frozen"
  | "trustline_unfrozen"
  | "account_settings_changed"
  | "offer_created"
  | "offer_cancelled"
  | "check_created"
  | "check_cashed"
  | "check_cancelled"
  | "escrow"
  | "clawback"
  | "nft"
  | "amm"
  /** SetRegularKey or SignerListSet: who can sign changed. */
  | "keys_changed"
  /** AccountDelete by the watched account. */
  | "account_deleted"
  /** A transaction between other parties that touched the account only by rippling through it. */
  | "rippled_through"
  | "other";

export const EVENT_TYPES: EventType[] = [
  "payment_in", "payment_out", "payment_self", "trustline_changed", "trustline_frozen", "trustline_unfrozen",
  "account_settings_changed", "offer_created", "offer_cancelled", "check_created", "check_cashed", "check_cancelled",
  "escrow", "clawback", "nft", "amm", "keys_changed", "account_deleted", "rippled_through", "other",
];

/**
 * What a watch records unless told otherwise: everything the account did or
 * had done to it. Left out: other parties' trades and payments that only
 * rippled through it, which for a busy issuer are most of its history.
 */
export const DEFAULT_EVENT_TYPES: EventType[] = EVENT_TYPES.filter((t) => t !== "rippled_through" && t !== "other");

export type XrplEvent = {
  type: EventType;
  hash: string;
  ledgerIndex: number;
  /** Seconds since the Ripple epoch (2000-01-01), as the ledger records it. */
  rippleTime: number | null;
  txType: string;
  result: string;
  /** The account on the other side, where there is one. */
  counterparty: string | null;
  data: Record<string, unknown>;
};

const TF_PARTIAL_PAYMENT = 0x00020000;
const TF_SET_FREEZE = 0x00100000;
const TF_CLEAR_FREEZE = 0x00200000;

/** AccountSet flag numbers (asf*) with their names. */
export const ACCOUNT_SET_FLAGS: Record<number, string> = {
  1: "requireDestinationTag",
  2: "requireAuthorization",
  3: "disallowXRP",
  4: "disableMasterKey",
  5: "accountTxnID",
  6: "noFreeze",
  7: "globalFreeze",
  8: "defaultRipple",
  9: "depositAuth",
  10: "authorizedNFTokenMinter",
  12: "disallowIncomingNFTokenOffer",
  13: "disallowIncomingCheck",
  14: "disallowIncomingPayChan",
  15: "disallowIncomingTrustline",
  16: "allowTrustLineClawback",
};

type Tx = Record<string, any>;

/**
 * One transaction from a tx reply or an account_tx row, in either API
 * version: v1 puts the fields at the top (or under `tx`), v2 under
 * `tx_json` with the hash and ledger index beside it.
 */
export function normalizeTx(row: Tx): { tx: Tx; meta: Tx; ledgerIndex: number } {
  const inner = (row.tx_json ?? row.tx ?? row) as Tx;
  const tx: Tx = { ...inner, hash: inner.hash ?? row.hash, date: inner.date ?? row.date };
  const ledgerIndex = Number(row.ledger_index ?? inner.ledger_index ?? inner.inLedger);
  const meta = (row.meta ?? row.metaData ?? inner.meta ?? {}) as Tx;
  return { tx, meta, ledgerIndex: Number.isFinite(ledgerIndex) ? ledgerIndex : 0 };
}

/**
 * The events one validated transaction means for the watched account.
 *
 * A freeze on a trust line can only be set by a TrustSet from the side
 * doing the freezing, so an issuer freezing the watched account's balance
 * arrives here as that issuer's TrustSet naming the account, and is
 * reported as trustline_frozen with the issuer as counterparty.
 */
export function classifyTransaction(tx: Tx, meta: Tx, watched: string, ledgerIndex: number): XrplEvent[] {
  const base = {
    hash: String(tx.hash ?? ""),
    ledgerIndex,
    rippleTime: typeof tx.date === "number" ? tx.date : null,
    txType: String(tx.TransactionType ?? ""),
    result: String(meta?.TransactionResult ?? ""),
  };
  const events: XrplEvent[] = [];
  const from = String(tx.Account ?? "");
  const type = base.txType;
  const to = typeof tx.Destination === "string" ? tx.Destination : "";
  const clawbackHolder = type === "Clawback" ? amountOf(tx.Amount)?.issuer ?? null : null;
  const trustIssuer = type === "TrustSet" ? amountOf(tx.LimitAmount)?.issuer ?? null : null;
  const direct = from === watched || to === watched || tx.Owner === watched || clawbackHolder === watched || trustIssuer === watched;

  if (!direct) {
    // Someone else's trade or payment that moved a balance on one of this
    // account's trust lines. Recorded as such, never as the account's own act.
    events.push({
      ...base,
      type: "rippled_through",
      counterparty: from || null,
      data: type === "Payment" ? { from, to, delivered: amountOf(meta?.delivered_amount ?? meta?.DeliveredAmount) } : { from },
    });
  } else if (type === "Payment") {
    const amount = amountOf(tx.DeliverMax ?? tx.Amount);
    const delivered = amountOf(meta?.delivered_amount ?? meta?.DeliveredAmount);
    const kind: EventType = from === watched && to === watched ? "payment_self" : to === watched ? "payment_in" : "payment_out";
    events.push({
      ...base,
      type: kind,
      counterparty: kind === "payment_in" ? from : kind === "payment_out" ? to : null,
      data: {
        amount,
        delivered,
        partial: (Number(tx.Flags ?? 0) & TF_PARTIAL_PAYMENT) !== 0,
        destinationTag: typeof tx.DestinationTag === "number" ? tx.DestinationTag : null,
        sourceTag: typeof tx.SourceTag === "number" ? tx.SourceTag : null,
        sendMax: amountOf(tx.SendMax),
        memos: memosOf(tx),
      },
    });
  } else if (type === "AccountDelete") {
    const delivered = amountOf(meta?.delivered_amount ?? meta?.DeliveredAmount);
    if (to === watched && from !== watched) {
      // A sweep into the watched account: incoming value, screened like a payment.
      events.push({
        ...base,
        type: "payment_in",
        counterparty: from,
        data: { amount: delivered, delivered, partial: false, destinationTag: typeof tx.DestinationTag === "number" ? tx.DestinationTag : null, sourceTag: null, sendMax: null, memos: memosOf(tx), viaAccountDelete: true },
      });
    } else {
      events.push({ ...base, type: "account_deleted", counterparty: to || null, data: { delivered, destinationTag: typeof tx.DestinationTag === "number" ? tx.DestinationTag : null } });
    }
  } else if (type === "SetRegularKey" || type === "SignerListSet") {
    events.push({
      ...base,
      type: "keys_changed",
      counterparty: null,
      data: type === "SetRegularKey"
        ? { change: tx.RegularKey ? "regular_key_set" : "regular_key_removed", regularKey: tx.RegularKey ?? null }
        : {
            change: Number(tx.SignerQuorum ?? 0) > 0 ? "signer_list_set" : "signer_list_removed",
            quorum: Number(tx.SignerQuorum ?? 0),
            signers: ((tx.SignerEntries ?? []) as Tx[]).map((e) => ({ account: e.SignerEntry?.Account, weight: e.SignerEntry?.SignerWeight })),
          },
    });
  } else if (type === "TrustSet") {
    const limit = amountOf(tx.LimitAmount);
    const flags = Number(tx.Flags ?? 0);
    events.push({
      ...base,
      type: flags & TF_SET_FREEZE ? "trustline_frozen" : flags & TF_CLEAR_FREEZE ? "trustline_unfrozen" : "trustline_changed",
      counterparty: from === watched ? limit?.issuer ?? null : from,
      data: { limit, setBy: from, freeze: Boolean(flags & TF_SET_FREEZE), unfreeze: Boolean(flags & TF_CLEAR_FREEZE) },
    });
  } else if (type === "AccountSet") {
    const set = typeof tx.SetFlag === "number" ? ACCOUNT_SET_FLAGS[tx.SetFlag] ?? `flag ${tx.SetFlag}` : null;
    const clear = typeof tx.ClearFlag === "number" ? ACCOUNT_SET_FLAGS[tx.ClearFlag] ?? `flag ${tx.ClearFlag}` : null;
    events.push({
      ...base,
      type: "account_settings_changed",
      counterparty: null,
      data: {
        set,
        clear,
        transferRate: typeof tx.TransferRate === "number" ? tx.TransferRate : undefined,
        domain: typeof tx.Domain === "string" ? hexToText(tx.Domain) : undefined,
      },
    });
  } else if (type === "OfferCreate" || type === "OfferCancel") {
    events.push({
      ...base,
      type: type === "OfferCreate" ? "offer_created" : "offer_cancelled",
      counterparty: null,
      data: { takerGets: amountOf(tx.TakerGets), takerPays: amountOf(tx.TakerPays), offerSequence: tx.OfferSequence ?? null },
    });
  } else if (type === "CheckCreate" || type === "CheckCash" || type === "CheckCancel") {
    events.push({
      ...base,
      type: type === "CheckCreate" ? "check_created" : type === "CheckCash" ? "check_cashed" : "check_cancelled",
      counterparty: type === "CheckCreate" ? (from === watched ? String(tx.Destination ?? "") : from) : from === watched ? null : from,
      data: { sendMax: amountOf(tx.SendMax), amount: amountOf(tx.Amount) },
    });
  } else if (type.startsWith("Escrow")) {
    events.push({ ...base, type: "escrow", counterparty: from === watched ? String(tx.Destination ?? tx.Owner ?? "") || null : from, data: { amount: amountOf(tx.Amount) } });
  } else if (type === "Clawback") {
    const amount = amountOf(tx.Amount);
    // In a Clawback the Amount's "issuer" field names the holder.
    events.push({ ...base, type: "clawback", counterparty: from === watched ? amount?.issuer ?? null : from, data: { amount, issuer: from } });
  } else if (type.startsWith("NFToken")) {
    events.push({ ...base, type: "nft", counterparty: from === watched ? null : from, data: { nftokenId: tx.NFTokenID ?? null } });
  } else if (type.startsWith("AMM")) {
    events.push({ ...base, type: "amm", counterparty: null, data: { asset: tx.Asset ?? null, asset2: tx.Asset2 ?? null } });
  } else {
    events.push({ ...base, type: "other", counterparty: from === watched ? null : from, data: {} });
  }

  return events;
}

function hexToText(hex: string): string {
  if (!/^([0-9A-Fa-f]{2})*$/.test(hex)) return hex;
  const bytes = new Uint8Array((hex.match(/../g) ?? []).map((b) => parseInt(b, 16)));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** A transaction's memos as text, printable ones only, each cut to 280 characters. */
export function memosOf(tx: Tx): string[] {
  const out: string[] = [];
  for (const m of (Array.isArray(tx.Memos) ? tx.Memos : []) as Tx[]) {
    const data = m?.Memo?.MemoData;
    if (typeof data !== "string" || !data) continue;
    // Control characters stripped; a memo is shown to people, never run.
    const text = hexToText(data).replace(/[\u0000-\u001F\u007F]/g, " ").trim();
    if (text) out.push(text.slice(0, 280));
  }
  return out.slice(0, 5);
}

/** A domain or URL in free text: what a phishing memo is there to deliver. */
const LINK_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(?:[a-z]{2,24})\b/i;
export const containsLink = (text: string) => LINK_RE.test(text);

/** Below this an XRP deposit is dust: worth nothing, sent for another reason. */
export const DUST_XRP = 0.01;

// ── Deposit screening ────────────────────────────────────────────────

/** Tickers people assume mean one specific issuer's token. */
export const FAMILIAR_TICKERS = new Set(["USDT", "USDC", "USD", "EUR", "DAI", "BTC", "ETH", "XRP", "RLUSD", "GBP", "TUSD", "BUSD"]);

/** About a day of ledgers at the ~4-second close interval. */
export const NEW_SENDER_LEDGERS = 21_600;

export type IssuerFacts = {
  /** What the issuer owes holders of this currency (gateway_balances obligations); null when unread. */
  obligations: number | null;
  globalFreeze: boolean;
  noFreeze: boolean;
  clawback: boolean;
};

export type FundingHop = { account: string; fundedBy: string | null; activatedLedger: number | null };

export type DepositConfig = {
  /** Issuers the institution accepts per currency code, e.g. { USD: ["rvYAf…"] }. Empty = not configured. */
  acceptedIssuers: Record<string, string[]>;
  /** Addresses the institution will not accept funds from, directly or up to three hops back. */
  denylist: string[];
  /** Destination tags are how deposits are attributed; true when every deposit must carry one. */
  requireTag: boolean;
  /** XRP-denominated deposits at or above this need originator information (Travel Rule). 0 = off. */
  travelRuleXrp: number;
  /** Addresses the institution pays or is paid by; a sender imitating one of them is address poisoning. */
  trustedCounterparties: string[];
};

/** An address on a published sanctions list (noshashi.sanctioned_addresses). */
export type SanctionEntry = {
  address: string;
  list: string;
  entityNumber: number | null;
  entityName: string;
  program: string | null;
  sourceUrl: string;
};

/**
 * Address poisoning: an attacker makes an address whose first and last
 * characters match one the victim uses, then sends it dust so it sits in
 * the history next to the real one, waiting to be copied. Returns the
 * known address `address` imitates, or null. Wallets show the first and
 * last few characters, so four at each end is what an attacker matches.
 */
export function lookalikeOf(address: string, known: Iterable<string>, ends = 4): string | null {
  for (const k of known) {
    if (k === address || k.length < ends * 2 + 1) continue;
    if (k.slice(0, ends + 1) === address.slice(0, ends + 1) && k.slice(-ends) === address.slice(-ends)) return k;
  }
  return null;
}

export type ScreeningInput = {
  event: XrplEvent;
  config: DepositConfig;
  /** Facts about the issuer of the delivered token, when it is not XRP. */
  issuer: IssuerFacts | null;
  /** The sender, then who funded it, then who funded them. */
  chain: FundingHop[];
  /** The ledger the screening ran at; the sender is aged at the payment's own ledger when it has one. */
  currentLedger: number;
  /** Sanctions-list entries for any account in the chain, by address. */
  sanctions?: Record<string, SanctionEntry>;
  /** The organization's other watched addresses, which a poisoning sender would imitate. */
  knownAddresses?: string[];
};

export type ScreeningFinding = {
  id: string;
  severity: "critical" | "warn" | "info";
  title: string;
  detail: string;
};

export type Screening = {
  verdict: "clear" | "review" | "hold";
  /** What to credit: always the delivered amount. Null when nothing should be credited. */
  credit: Amount | null;
  findings: ScreeningFinding[];
};

export function screenDeposit(input: ScreeningInput): Screening {
  const { event, config, issuer, chain } = input;
  const findings: ScreeningFinding[] = [];
  const data = event.data as { amount: Amount | null; delivered: Amount | null; partial: boolean; destinationTag: number | null; memos?: string[] };

  if (event.result !== "tesSUCCESS") {
    return {
      verdict: "hold",
      credit: null,
      findings: [{ id: "not_applied", severity: "critical", title: "The payment did not succeed", detail: `The ledger recorded ${event.result}; nothing arrived. Do not credit it.` }],
    };
  }

  const delivered = data.delivered;
  if (!delivered) {
    findings.push({ id: "delivered_unknown", severity: "critical", title: "What arrived could not be read", detail: "The transaction's delivered_amount is missing, so the amount that arrived is not known. Hold it until it is read again." });
  }

  // 1. Partial payment: credit what arrived.
  if (data.partial && delivered && data.amount && (delivered.value < data.amount.value || delivered.currency !== data.amount.currency)) {
    findings.push({
      id: "partial_payment",
      severity: "warn",
      title: `Partial payment: credit ${formatAmount(delivered)}, not ${formatAmount(data.amount)}`,
      detail: `The sender set tfPartialPayment. The payment asked to deliver ${formatAmount(data.amount)} and delivered ${formatAmount(delivered)}. A system that credits the Amount field over-credits by ${delivered.value > 0 ? `${Math.round(data.amount.value / delivered.value).toLocaleString("en-US")}x` : "the whole amount"}.`,
    });
  } else if (data.partial) {
    findings.push({ id: "partial_flag", severity: "info", title: "Sent with the partial-payment flag", detail: "It delivered the full amount this time, but the flag let it deliver less. Credit delivered_amount, as always." });
  }

  // 1b. Dust. Addresses are sent a drop of XRP with a link in the memo
  // so the link shows up in the wallet's history: a phishing lure, not a deposit.
  if (delivered && delivered.currency === "XRP" && delivered.value < DUST_XRP) {
    const lure = (data.memos ?? []).find(containsLink);
    findings.push(
      lure
        ? { id: "phishing_dust", severity: "warn", title: "Dust carrying a link: a phishing lure", detail: `${formatAmount(delivered)} with the memo "${lure}". Nothing of value arrived; the payment exists to put the link in front of whoever reads this account's history. Do not follow it or credit it.` }
        : { id: "dust", severity: "info", title: "Dust", detail: `${formatAmount(delivered)} is below ${DUST_XRP} XRP: too little to be a deposit.` }
    );
  }

  // 2. Attribution.
  if (config.requireTag && data.destinationTag === null) {
    findings.push({ id: "no_destination_tag", severity: "warn", title: "No destination tag", detail: "This deposit address expects a tag to say whose deposit it is. Without one it cannot be credited to a customer automatically." });
  }

  // 3. The token.
  if (delivered && delivered.issuer) {
    const accepted = config.acceptedIssuers[delivered.currency.toUpperCase()] ?? [];
    const familiar = FAMILIAR_TICKERS.has(delivered.currency.toUpperCase());
    if (issuer === null || issuer.obligations === null) {
      findings.push({ id: "issuer_unknown", severity: "warn", title: "The issuer could not be read", detail: `The issuer ${delivered.issuer}'s obligations and flags could not be read, so whether this ${delivered.currency} is real is unknown. Hold it for review.` });
    } else {
      if (familiar && !accepted.includes(delivered.issuer) && issuer.obligations <= 0) {
        findings.push({
          id: "counterfeit",
          severity: "critical",
          title: `Counterfeit ${delivered.currency}: its issuer owes nothing`,
          detail: `A currency code is not a name anyone owns. This ${delivered.currency} was issued by ${delivered.issuer}, which has no obligations outstanding: it has never issued a balance anyone holds, so the token is worth nothing. Do not credit it as ${delivered.currency}.`,
        });
      } else if (Object.keys(config.acceptedIssuers).length > 0 && !accepted.includes(delivered.issuer)) {
        findings.push({ id: "issuer_not_accepted", severity: "warn", title: `${delivered.currency} from an issuer you do not accept`, detail: `${delivered.issuer} is not in your accepted issuers for ${delivered.currency}. It is a different token that shares the code.` });
      }
      if (issuer.globalFreeze) {
        findings.push({ id: "issuer_frozen", severity: "critical", title: "The issuer has frozen this token", detail: "The issuer has set a global freeze. The balance cannot be sent on, sold or redeemed while it holds." });
      }
      if (issuer.clawback) {
        findings.push({ id: "clawback", severity: "warn", title: "The issuer can claw this balance back", detail: "The issuer has enabled trust-line clawback: it can take this balance out of your account after you credit it." });
      } else if (!issuer.noFreeze) {
        findings.push({ id: "freezable", severity: "info", title: "The issuer can freeze this balance", detail: "The issuer has not given up the right to freeze, as most issuers have not." });
      }
    }
  }

  // 4. Who sent it. The sender's age is what it was when it paid: a
  // deposit screened a month later came from an account that was new then.
  const sender = chain[0];
  const paidAt = event.ledgerIndex > 0 ? Math.min(event.ledgerIndex, input.currentLedger) : input.currentLedger;
  if (!sender || sender.activatedLedger === null) {
    findings.push({ id: "sender_unknown", severity: "info", title: "The sender's origin could not be read", detail: "The ledger that created the sending account could not be found on the server that answered, so its age and funder are not known." });
  } else if (paidAt - sender.activatedLedger < NEW_SENDER_LEDGERS) {
    const seconds = Math.max(0, (paidAt - sender.activatedLedger) * 4);
    const age = seconds < 3600
      ? `${Math.max(1, Math.round(seconds / 60))} minute${Math.round(seconds / 60) === 1 ? "" : "s"}`
      : `${Math.round(seconds / 3600)} hour${Math.round(seconds / 3600) === 1 ? "" : "s"}`;
    findings.push({ id: "new_sender", severity: "warn", title: `The sender was about ${age} old when it paid`, detail: `${sender.account} was created in ledger ${sender.activatedLedger.toLocaleString("en-US")}, funded by ${sender.fundedBy ?? "an unknown account"}. Freshly created senders are how funds are layered before they reach an exchange.` });
  }
  const deny = new Set(config.denylist);
  chain.forEach((hop, i) => {
    if (deny.has(hop.account)) {
      findings.push({
        id: `denylist_hop_${i}`,
        severity: "critical",
        title: i === 0 ? "The sender is on your deny list" : `Funded ${i} hop${i === 1 ? "" : "s"} back by an account on your deny list`,
        detail: `${chain.slice(0, i + 1).map((h) => h.account).join(" ← ")}: ${hop.account} is on this organization's deny list.`,
      });
    }
  });

  // 4b. Sanctions: the sender, or who funded it up to three hops back,
  // is on a published sanctions list.
  const sanctions = input.sanctions ?? {};
  chain.forEach((hop, i) => {
    const hit = sanctions[hop.account];
    if (!hit) return;
    findings.push({
      id: `sanctioned_hop_${i}`,
      severity: "critical",
      title: i === 0
        ? `The sender is on the ${hit.list} list: ${hit.entityName}`
        : `Funded ${i} hop${i === 1 ? "" : "s"} back by an address on the ${hit.list} list: ${hit.entityName}`,
      detail: `${chain.slice(0, i + 1).map((h) => h.account).join(" ← ")}: ${hop.account} is listed under ${hit.entityName}${hit.entityNumber ? ` (entry ${hit.entityNumber}` : " ("}${hit.program ? `, program ${hit.program}` : ""}). Source: ${hit.sourceUrl}. Do not credit it; escalate to your sanctions officer, who decides on blocking and reporting.`,
    });
  });

  // 4c. Address poisoning: a sender that imitates an address this organization uses.
  const sender0 = chain[0]?.account ?? event.counterparty;
  if (sender0) {
    const known = new Set([...(config.trustedCounterparties ?? []), ...(input.knownAddresses ?? [])]);
    const imitated = lookalikeOf(sender0, known);
    if (imitated) {
      const dust = delivered && delivered.currency === "XRP" && delivered.value < 1;
      findings.push({
        id: "address_poisoning",
        severity: dust ? "critical" : "warn",
        title: `Address poisoning: the sender imitates ${imitated.slice(0, 6)}…${imitated.slice(-4)}`,
        detail: `${sender0} shares the first and last characters of ${imitated}, an address this organization uses, but is a different account.${dust ? " It sent a token amount so it sits in the history next to the real one, waiting to be copied into a withdrawal." : ""} Never copy an address from transaction history; take it from your own records.`,
      });
    }
  }

  // 5. Travel Rule scope.
  if (config.travelRuleXrp > 0 && delivered && delivered.currency === "XRP" && delivered.value >= config.travelRuleXrp) {
    findings.push({ id: "travel_rule", severity: "info", title: "In Travel Rule scope", detail: `${formatAmount(delivered)} is at or above your threshold of ${config.travelRuleXrp.toLocaleString("en-US")} XRP. Collect the originator's information before crediting.` });
  }

  const worst = findings.some((f) => f.severity === "critical") ? "hold" : findings.some((f) => f.severity === "warn") ? "review" : "clear";
  const counterfeit = findings.some((f) => f.id === "counterfeit" || f.id === "issuer_frozen" || f.id.startsWith("sanctioned_hop_"));
  return { verdict: worst, credit: counterfeit || !delivered ? null : delivered, findings };
}

/** From an account's first transaction (account_tx forward, limit 1), who created it and when. */
export function activationOf(account: string, firstTx: Tx | null): FundingHop {
  if (!firstTx) return { account, fundedBy: null, activatedLedger: null };
  const { tx, meta, ledgerIndex: ledger } = normalizeTx(firstTx);
  const created = ((meta.AffectedNodes ?? []) as Tx[]).some(
    (n) => n.CreatedNode?.LedgerEntryType === "AccountRoot" && n.CreatedNode?.NewFields?.Account === account
  );
  // The earliest transaction the server holds did not create the account:
  // the server's history starts later, so neither the age nor the funder is known.
  if (!created) return { account, fundedBy: null, activatedLedger: null };
  return { account, fundedBy: String(tx.Account ?? "") || null, activatedLedger: ledger > 0 ? ledger : null };
}

/**
 * The issuer facts screening needs, from account_info and gateway_balances
 * replies (the `result` objects). Either may be null when it could not be
 * read; the facts then say so rather than assume a harmless issuer.
 */
export function issuerFactsFrom(accountInfo: Tx | null, gatewayBalances: Tx | null, currency: string): IssuerFacts | null {
  if (!accountInfo) return null;
  const flags = (accountInfo.account_flags ?? {}) as Record<string, unknown>;
  const raw = Number(accountInfo.account_data?.Flags ?? 0);
  let obligations: number | null = null;
  if (gatewayBalances && gatewayBalances.obligations !== undefined) {
    obligations = 0;
    for (const [code, value] of Object.entries((gatewayBalances.obligations ?? {}) as Record<string, unknown>)) {
      if (decodeCurrency(code).toUpperCase() === currency.toUpperCase()) obligations += Number(value) || 0;
    }
  } else if (gatewayBalances && gatewayBalances.status === "success") {
    obligations = 0; // a successful reply with no obligations field: the issuer owes nothing
  }
  return {
    obligations,
    // account_flags when the server sends them; the AccountRoot bits otherwise.
    globalFreeze: typeof flags.globalFreeze === "boolean" ? flags.globalFreeze : (raw & 0x00400000) !== 0,
    noFreeze: typeof flags.noFreeze === "boolean" ? flags.noFreeze : (raw & 0x00200000) !== 0,
    clawback: typeof flags.allowTrustLineClawback === "boolean" ? flags.allowTrustLineClawback : (raw & 0x80000000) !== 0,
  };
}

export function sanitizeDepositConfig(raw: unknown): DepositConfig {
  const x = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const accepted: Record<string, string[]> = {};
  if (x.acceptedIssuers && typeof x.acceptedIssuers === "object") {
    for (const [code, list] of Object.entries(x.acceptedIssuers as Record<string, unknown>)) {
      if (!/^[A-Za-z0-9]{3,20}$/.test(code) || !Array.isArray(list)) continue;
      const issuers = list.filter((a): a is string => typeof a === "string" && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a));
      if (issuers.length) accepted[code.toUpperCase()] = issuers.slice(0, 20);
    }
  }
  const denylist = Array.isArray(x.denylist)
    ? (x.denylist as unknown[]).filter((a): a is string => typeof a === "string" && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a)).slice(0, 5000)
    : [];
  const travel = Number(x.travelRuleXrp);
  const trusted = Array.isArray(x.trustedCounterparties)
    ? (x.trustedCounterparties as unknown[]).filter((a): a is string => typeof a === "string" && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a)).slice(0, 500)
    : [];
  return {
    acceptedIssuers: accepted,
    denylist,
    requireTag: x.requireTag !== false,
    travelRuleXrp: Number.isFinite(travel) && travel > 0 ? travel : 0,
    trustedCounterparties: trusted,
  };
}
