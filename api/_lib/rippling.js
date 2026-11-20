/*
 * Rippling exposure: can a third party move this account's balances
 * between its own trust lines?
 *
 * On the XRP Ledger a payment can "ripple" through an account that holds
 * the same currency on two trust lines. The path takes value off one line
 * and adds it to the other, at par, without the account signing anything.
 * The account ends up holding, say, USD from issuer B instead of USD from
 * issuer A. That is the intended behaviour for an issuer (holders transfer
 * through it), and an unintended swap for everyone else.
 *
 * Rippling through an account between line A and line B needs, on this
 * account's side of the ledger:
 *   - NoRipple unset on both lines (`no_ripple` false in account_lines);
 *   - value to take off A: a positive balance (a path can also push the
 *     account into debt to a peer that extends it credit, `limit_peer`,
 *     but that is the peer's exposure, not this account's, and is not
 *     counted);
 *   - room to add value on B: the account's own limit minus its balance.
 * Lines with NoRipple set cannot be rippled through, whatever the flags on
 * the peer's side.
 *
 * Every number here is read from validated ledger state. The sums use
 * floating point and are rounded for display; the per-line strings are
 * the ledger's own. Nothing is signed or submitted: the fixes are unsigned
 * TrustSet templates for the account holder to review and sign elsewhere.
 */

import { decodeCurrency } from "./authority.js";

/** TrustSet flag that sets NoRipple on the sender's side of the line. */
export const TF_SET_NO_RIPPLE = 0x00020000;
/** AccountSet flag number for DefaultRipple (asfDefaultRipple). */
export const ASF_DEFAULT_RIPPLE = 8;
/** Holders needed before an account is treated as an issuer of a currency. */
export const ISSUER_MIN_HOLDERS = 3;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** Round a float sum for display without inventing precision. */
export const fmt = (n) => (n === 0 ? "0" : String(Number(n.toPrecision(15))));

/**
 * Analyse one account from its account_info and the account_lines it
 * returned. `lines` is the concatenated `lines` array of every page read.
 */
export function analyseRippling({ account, accountInfo, lines, truncated = false }) {
  const flags = accountInfo?.account_flags ?? {};
  const defaultRipple = Boolean(flags.defaultRipple);

  /** @type {Map<string, any[]>} */
  const byCurrency = new Map();
  for (const line of lines) {
    const list = byCurrency.get(line.currency) ?? [];
    list.push(line);
    byCurrency.set(line.currency, list);
  }

  const exposures = [];
  const issued = [];
  const fixes = [];
  let linesOpen = 0;

  for (const [currency, group] of byCurrency) {
    const open = group.filter((l) => !l.no_ripple);
    linesOpen += open.length;
    const owes = group.filter((l) => num(l.balance) < 0);
    if (owes.length >= ISSUER_MIN_HOLDERS) {
      // This account issues the currency: rippling through it is how its
      // holders transfer, and NoRipple would break that. Reported, not
      // flagged.
      issued.push({
        currency,
        currency_display: decodeCurrency(currency),
        holders: owes.length,
        outstanding: fmt(owes.reduce((s, l) => s - num(l.balance), 0)),
        lines_blocking_transfers: group.filter((l) => l.no_ripple).length,
      });
      continue;
    }
    // A currency the account owes on a line or two (credit between
    // friends, a stray negative balance) is neither an issuance nor a
    // holding it can lose; leave it out rather than guess.
    if (owes.length) continue;
    if (open.length < 2) continue;

    const rows = open.map((l) => {
      const balance = num(l.balance);
      const drainable = Math.max(balance, 0);
      const room = Math.max(num(l.limit) - balance, 0);
      return { line: l, drainable, room };
    });
    // Value can leave a line only if some OTHER open line can take it.
    let movable = 0;
    const atRisk = [];
    for (const row of rows) {
      if (row.drainable <= 0) continue;
      const roomElsewhere = rows.reduce((s, r) => (r === row ? s : s + r.room), 0);
      if (roomElsewhere <= 0) continue;
      const amount = Math.min(row.drainable, roomElsewhere);
      movable += amount;
      atRisk.push({ peer: row.line.account, balance: row.line.balance, can_lose: fmt(amount) });
    }
    const totalRoom = rows.reduce((s, r) => s + r.room, 0);
    const exposed = atRisk.length > 0;
    exposures.push({
      currency,
      currency_display: decodeCurrency(currency),
      open_lines: open.length,
      held_on_open_lines: fmt(rows.reduce((s, r) => s + Math.max(num(r.line.balance), 0), 0)),
      receiving_room: fmt(totalRoom),
      exposed,
      // A third party can move at most this much at par, in one or more
      // payments, before every receiving line is full.
      movable_at_par: fmt(Math.min(movable, totalRoom)),
      lines_at_risk: atRisk,
      lines: open.map((l) => ({
        peer: l.account,
        balance: l.balance,
        limit: l.limit,
        limit_peer: l.limit_peer,
        quality_in: l.quality_in ?? 0,
        quality_out: l.quality_out ?? 0,
      })),
    });
    if (exposed) {
      for (const l of open) {
        // NoRipple can only be set where the account's balance is zero or
        // positive; every line here qualifies because the currency has no
        // negative balance.
        fixes.push({
          TransactionType: "TrustSet",
          Account: account,
          LimitAmount: { currency, issuer: l.account, value: l.limit },
          Flags: TF_SET_NO_RIPPLE,
        });
      }
    }
  }

  const findings = [];
  const isIssuer = issued.length > 0;
  if (isIssuer && !defaultRipple) {
    findings.push({
      code: "ISSUER_DEFAULT_RIPPLE_OFF",
      detail:
        "This account issues tokens but DefaultRipple is off, so new holder lines are created with NoRipple on the issuer's side and holders cannot pay each other through it.",
    });
    fixes.push({ TransactionType: "AccountSet", Account: account, SetFlag: ASF_DEFAULT_RIPPLE });
  }
  if (isIssuer && issued.some((c) => c.lines_blocking_transfers > 0)) {
    findings.push({
      code: "ISSUER_LINES_BLOCK_TRANSFERS",
      detail: "Some of this issuer's lines have NoRipple set on its side; holders on those lines cannot transfer through the issuer.",
    });
  }
  if (!isIssuer && defaultRipple) {
    findings.push({
      code: "HOLDER_DEFAULT_RIPPLE_ON",
      detail:
        "DefaultRipple is on but this account issues nothing, so every new trust line is created open to rippling.",
    });
    fixes.push({ TransactionType: "AccountSet", Account: account, ClearFlag: ASF_DEFAULT_RIPPLE });
  }

  const exposed = exposures.filter((e) => e.exposed);
  const verdict = exposed.length ? "EXPOSED" : truncated ? "INCOMPLETE" : "CLEAR";
  return {
    account,
    role: isIssuer ? "issuer" : "holder",
    verdict,
    default_ripple: defaultRipple,
    summary: exposed.length
      ? `${exposed.length} currenc${exposed.length === 1 ? "y" : "ies"} can be swapped between this account's own lines by anyone's payment, at par, without its signature.`
      : truncated
        ? "No exposure in the lines read, but the account has more lines than were read."
        : "No currency on this account can be rippled between two of its own lines.",
    exposures,
    issued,
    findings,
    fixes,
    coverage: { lines_read: lines.length, lines_open_to_rippling: linesOpen, truncated },
  };
}
