/*
 * An issuer's authority history: every validated transaction the issuer
 * itself signed that changed what it can do to holders. Freeze and
 * clawback switched on or off, holders frozen or unfrozen, balances
 * clawed back, keys and signer lists changed, the transfer fee changed.
 *
 * The certificate (api/_lib/authority.js) says what an issuer can do now.
 * This says what it has done, and when, so a listing team or a holder can
 * see whether a power that is still there has ever been used.
 *
 * Read from account_tx on validated ledgers only, and only transactions
 * that succeeded (tesSUCCESS) and that the issuer sent. Payments, offers
 * and everything else that does not change authority are skipped.
 *
 * Coverage is reported, never assumed. An account with a long payment
 * history may have more transactions than one request reads, so the
 * reading takes the earliest page (where setup happens) and the most
 * recent pages, and says whether anything in between went unread. A
 * history with a gap is never presented as complete.
 *
 * Pure except readIssuerHistory(), which does the ledger reads.
 */

import { rippleRpc, ADDRESS_RE, decodeCurrency } from "./authority.js";

export const HISTORY_SCHEMA = "noshashi.issuer-history.v1";

/** AccountSet flag numbers (SetFlag / ClearFlag), as rippled defines them. */
const ACCOUNT_FLAGS = {
  1: "require destination tags",
  2: "approval required to hold (RequireAuth)",
  3: "disallow XRP",
  4: "master key disabled",
  5: "account transaction id",
  6: "freeze permanently given up (NoFreeze)",
  7: "global freeze",
  8: "default rippling",
  9: "deposit authorization",
  10: "NFT minter authorized",
  12: "incoming NFT offers blocked",
  13: "incoming checks blocked",
  14: "incoming payment channels blocked",
  15: "incoming trust lines blocked",
  16: "clawback enabled (AllowTrustLineClawback)",
};

/** Which AccountSet flags change what an issuer can do to holders. */
const AUTHORITY_FLAGS = new Set([2, 4, 6, 7, 16]);

/** TrustSet flags an issuer uses on a holder's line. */
const TF_SET_AUTH = 0x00010000;
const TF_SET_FREEZE = 0x00100000;
const TF_CLEAR_FREEZE = 0x00200000;
const TF_SET_DEEP_FREEZE = 0x00400000;
const TF_CLEAR_DEEP_FREEZE = 0x00800000;

/** How serious an event is for someone holding the issuer's token. */
export const SEVERITY = { power_used: "power_used", power_change: "power_change", key_change: "key_change", info: "info" };

const RIPPLE_EPOCH = 946684800;

function whenOf(entry, tx) {
  if (entry.close_time_iso) return entry.close_time_iso;
  const date = tx.date ?? entry.date;
  return Number.isFinite(date) ? new Date((date + RIPPLE_EPOCH) * 1000).toISOString().replace(".000Z", "Z") : null;
}

function amountText(amount) {
  if (amount == null) return "";
  if (typeof amount === "string") return `${Number(amount) / 1e6} XRP`;
  return `${amount.value} ${decodeCurrency(amount.currency)}`;
}

/**
 * One account_tx entry (api_version 1 or 2) to a history event, or null
 * when it did not change the issuer's authority. `issuer` is the account
 * whose history this is: only transactions it sent count.
 */
export function eventOf(entry, issuer) {
  const tx = entry.tx_json ?? entry.tx ?? {};
  const meta = entry.meta ?? entry.metaData ?? {};
  if (tx.Account !== issuer) return null;
  if (meta.TransactionResult !== "tesSUCCESS") return null;
  if (entry.validated === false) return null;

  const base = {
    hash: entry.hash ?? tx.hash ?? null,
    ledger_index: entry.ledger_index ?? tx.ledger_index ?? null,
    date: whenOf(entry, tx),
    type: tx.TransactionType,
  };

  switch (tx.TransactionType) {
    case "AccountSet": {
      const out = [];
      if (Number.isInteger(tx.SetFlag) && AUTHORITY_FLAGS.has(tx.SetFlag)) {
        out.push(`Turned on: ${ACCOUNT_FLAGS[tx.SetFlag]}`);
      }
      if (Number.isInteger(tx.ClearFlag) && AUTHORITY_FLAGS.has(tx.ClearFlag)) {
        out.push(`Turned off: ${ACCOUNT_FLAGS[tx.ClearFlag]}`);
      }
      if (tx.TransferRate !== undefined) {
        const rate = Number(tx.TransferRate);
        out.push(rate === 0 || rate === 1e9 ? "Transfer fee removed" : `Transfer fee set to ${((rate - 1e9) / 1e7).toFixed(2).replace(/\.?0+$/, "")}%`);
      }
      if (!out.length) return null;
      const flag = tx.SetFlag ?? tx.ClearFlag;
      const severity = flag === 4 ? SEVERITY.key_change : SEVERITY.power_change;
      return { ...base, severity, summary: out.join("; ") };
    }
    case "SetRegularKey":
      return {
        ...base,
        severity: SEVERITY.key_change,
        summary: tx.RegularKey ? `Regular key set to ${tx.RegularKey}` : "Regular key removed",
      };
    case "SignerListSet": {
      const quorum = Number(tx.SignerQuorum ?? 0);
      const signers = tx.SignerEntries?.length ?? 0;
      return {
        ...base,
        severity: SEVERITY.key_change,
        summary: quorum === 0 ? "Signer list removed" : `Signer list set: ${signers} signer${signers === 1 ? "" : "s"}, quorum ${quorum}`,
      };
    }
    case "TrustSet": {
      const flags = Number(tx.Flags ?? 0);
      const holder = tx.LimitAmount?.issuer;
      const currency = decodeCurrency(tx.LimitAmount?.currency ?? "");
      const parts = [];
      if (flags & TF_SET_FREEZE) parts.push("froze");
      if (flags & TF_CLEAR_FREEZE) parts.push("unfroze");
      if (flags & TF_SET_DEEP_FREEZE) parts.push("deep-froze");
      if (flags & TF_CLEAR_DEEP_FREEZE) parts.push("lifted the deep freeze on");
      if (flags & TF_SET_AUTH) parts.push("authorized");
      if (!parts.length || !holder) return null;
      const used = flags & (TF_SET_FREEZE | TF_SET_DEEP_FREEZE);
      return {
        ...base,
        severity: used ? SEVERITY.power_used : SEVERITY.info,
        holder,
        summary: `${parts.join(" and ").replace(/^./, (c) => c.toUpperCase())} the ${currency} line of ${holder}`,
      };
    }
    case "Clawback": {
      const amount = tx.Amount ?? {};
      return {
        ...base,
        severity: SEVERITY.power_used,
        holder: amount.issuer ?? tx.Holder ?? null,
        summary: `Clawed back ${amountText(amount)} from ${amount.issuer ?? tx.Holder ?? "a holder"}`,
      };
    }
    case "AMMClawback":
      return {
        ...base,
        severity: SEVERITY.power_used,
        holder: tx.Holder ?? null,
        summary: `Clawed back ${amountText(tx.Amount ?? tx.Asset)} from an AMM position held by ${tx.Holder ?? "a holder"}`,
      };
    case "AccountDelete":
      return { ...base, severity: SEVERITY.key_change, summary: "Account deleted" };
    default:
      return null;
  }
}

/**
 * The events from one or more pages of account_tx, oldest first, each
 * transaction once (the earliest and the latest windows can overlap on a
 * short history).
 */
export function eventsFrom(entries, issuer) {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const event = eventOf(entry, issuer);
    if (!event) continue;
    const key = event.hash ?? `${event.ledger_index}:${event.summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out.sort((a, b) => (a.ledger_index ?? 0) - (b.ledger_index ?? 0));
}

/** Counts a reader can say in one line: how often each power was used. */
export function tally(events) {
  const count = (pred) => events.filter(pred).length;
  return {
    freezes: count((e) => e.type === "TrustSet" && /froze/.test(e.summary) && !/^Unfroze/.test(e.summary)),
    clawbacks: count((e) => e.type === "Clawback" || e.type === "AMMClawback"),
    key_changes: count((e) => e.severity === SEVERITY.key_change),
    power_changes: count((e) => e.severity === SEVERITY.power_change),
  };
}

const PAGE = 200;
const PUBLIC_ARCHIVE_START = 32_570;

function pageRange(reply, issuer) {
  const from = reply?.ledger_index_min;
  const to = reply?.ledger_index_max;
  if (reply?.validated !== true || reply.account !== issuer || !Array.isArray(reply.transactions) ||
      !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from <= 0 || to < from ||
      reply.transactions.some((entry) => !entry || typeof entry !== "object" || entry.validated === false)) return null;
  return { from, to };
}

function transactionHash(entry) {
  const hash = entry?.hash ?? entry?.tx_json?.hash ?? entry?.tx?.hash;
  return typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash) ? hash.toUpperCase() : null;
}

/** Read bounded issuer history within one validated range reported by the RPC. */
export async function readIssuerHistory(issuer, { recentPages = 4, rpc = rippleRpc } = {}) {
  if (!ADDRESS_RE.test(issuer)) throw new Error("Not an XRPL classic address");
  const params = { account: issuer, limit: PAGE, api_version: 2 };
  const first = await rpc("account_tx", { ...params, ledger_index_min: -1, ledger_index_max: -1, forward: true }, 15000);
  const range = pageRange(first, issuer);
  if (!range) throw new Error("Issuer history source did not return a validated account range.");

  const entries = [...first.transactions];
  let rangeComplete = !first.marker;
  let stoppedBecause = rangeComplete ? null : "page_budget";
  if (!rangeComplete) {
    const earliestHashes = new Set(entries.map(transactionHash).filter(Boolean));
    const seenMarkers = new Set();
    let marker;
    for (let page = 0; page < recentPages; page += 1) {
      let reply;
      try {
        reply = await rpc("account_tx", {
          ...params, ledger_index_min: range.from, ledger_index_max: range.to,
          forward: false, ...(marker ? { marker } : {}),
        }, 15000);
      } catch {
        stoppedBecause = "source_unavailable";
        break;
      }
      const nextRange = pageRange(reply, issuer);
      if (nextRange?.from !== range.from || nextRange?.to !== range.to) {
        stoppedBecause = "range_mismatch";
        break;
      }
      entries.push(...reply.transactions);
      if (!reply.marker || reply.transactions.some((entry) => earliestHashes.has(transactionHash(entry)))) {
        rangeComplete = true;
        stoppedBecause = null;
        break;
      }
      marker = reply.marker;
      const markerKey = JSON.stringify(marker);
      if (seenMarkers.has(markerKey)) {
        stoppedBecause = "cursor_repeated";
        break;
      }
      seenMarkers.add(markerKey);
    }
  }

  const complete = rangeComplete && range.from <= PUBLIC_ARCHIVE_START;
  const events = eventsFrom(entries, issuer);
  return {
    schema: HISTORY_SCHEMA,
    issuer,
    read_at: new Date().toISOString(),
    validated_to: range.to,
    coverage: {
      complete,
      range_complete: rangeComplete,
      ledger_index_min: range.from,
      ledger_index_max: range.to,
      stopped_because: stoppedBecause ?? (complete ? null : "archive_boundary"),
      transactions_read: entries.length,
      note: rangeComplete
        ? `The provider-reported range ${range.from}–${range.to} was scanned. Earlier ledgers are outside this observation.`
        : `The provider-reported range ${range.from}–${range.to} was not fully scanned. Events in unread pages may be missing.`,
    },
    tally: tally(events),
    events,
  };
}
