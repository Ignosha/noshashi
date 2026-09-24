import { diffPosture } from "@/lib/desk/watch";
import { decodeCurrency } from "@/lib/format";
import type { IssuerPosture } from "@/lib/xrpl/types";

/**
 * The Observer — the first of the agent's three roles (Observer, Analyst,
 * Advisor).
 *
 * It watches the wallets an operator names and reports what changed on the
 * validated ledger between two readings: an issuer freezing a line, a
 * credential about to lapse, a balance that fell, an issuer that changed
 * what it may do. The detection is deterministic and lives here, with no
 * model in it: a model cannot invent an observation, miss one, or phrase
 * one as a verdict. The model's part comes after, when a person asks it
 * to explain an observation — and it is handed the observation's evidence,
 * nothing else.
 *
 * Everything below is pure: two snapshots and a clock in, observations
 * out, so every rule is tested against the snapshots that trigger it.
 */

export type ObservedLine = {
  issuer: string;
  currency: string;
  balance: number;
  frozenByIssuer: boolean;
  deepFrozenByIssuer: boolean;
};

export type ObservedCredential = {
  issuer: string;
  type: string;
  accepted: boolean;
  revoked: boolean;
  /** Unix milliseconds, when the credential carries an expiry. */
  expiresAt?: number;
};

/** One wallet as read at one moment. */
export type WalletReading = {
  address: string;
  readAt: string;
  funded: boolean;
  balanceXrp: number;
  ownerCount: number;
  lines: ObservedLine[];
  credentials: ObservedCredential[];
  /** Posture of every issuer the wallet holds a line with. */
  issuers: Record<string, IssuerPosture>;
};

export type ObservationSeverity = "critical" | "warn" | "info";

export type Observation = {
  /** Stable for the same change at the same reading, so a sweep never duplicates. */
  id: string;
  at: string;
  address: string;
  severity: ObservationSeverity;
  kind: string;
  headline: string;
  detail: string;
  /** What was compared: the field, its value before and after, and when each was read. */
  evidence: { subject: string; field: string; from: string; to: string; readBefore: string; readAfter: string };
};

/** A balance change smaller than this share of the earlier balance is not reported. */
export const BALANCE_THRESHOLD = 0.1;
/** A credential expiring inside this window is reported once, when it enters it. */
export const EXPIRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 6 });
const short = (a: string) => (a.length <= 13 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`);
const lineKey = (l: { issuer: string; currency: string }) => `${l.issuer}.${l.currency}`;
const credKey = (c: { issuer: string; type: string }) => `${c.issuer}.${c.type}`;

/** Everything that materially changed between two readings of the same wallet. */
export function observe(before: WalletReading, after: WalletReading): Observation[] {
  const out: Observation[] = [];
  const add = (o: Omit<Observation, "id" | "at" | "address" | "evidence"> & { subject: string; field: string; from: string; to: string }) => {
    const { subject, field, from, to, ...rest } = o;
    out.push({
      ...rest,
      id: `${after.address}|${o.kind}|${subject}|${field}|${to}|${after.readAt}`,
      at: after.readAt,
      address: after.address,
      evidence: { subject, field, from, to, readBefore: before.readAt, readAfter: after.readAt },
    });
  };
  const wallet = short(after.address);

  if (before.funded && !after.funded) {
    add({ severity: "critical", kind: "account-deleted", subject: after.address, field: "AccountRoot", from: "present", to: "absent",
      headline: `${wallet} no longer exists on the ledger`,
      detail: "The account was deleted or the address no longer resolves. Anything addressed to it would have to create it again." });
    return out; // Nothing else can be compared against an account that is gone.
  }
  if (!before.funded && after.funded) {
    add({ severity: "info", kind: "account-funded", subject: after.address, field: "AccountRoot", from: "absent", to: "present",
      headline: `${wallet} was funded`, detail: `It now holds ${n(after.balanceXrp)} XRP.` });
  }
  if (!after.funded) return out;

  if (before.balanceXrp > 0) {
    const change = (after.balanceXrp - before.balanceXrp) / before.balanceXrp;
    if (change <= -BALANCE_THRESHOLD) {
      add({ severity: "warn", kind: "xrp-fell", subject: after.address, field: "Balance", from: `${n(before.balanceXrp)} XRP`, to: `${n(after.balanceXrp)} XRP`,
        headline: `${wallet}'s XRP balance fell ${Math.round(-change * 100)}%`,
        detail: `From ${n(before.balanceXrp)} to ${n(after.balanceXrp)} XRP between the two readings. The ledger records the transactions that moved it; this observation does not say why.` });
    } else if (change >= BALANCE_THRESHOLD) {
      add({ severity: "info", kind: "xrp-rose", subject: after.address, field: "Balance", from: `${n(before.balanceXrp)} XRP`, to: `${n(after.balanceXrp)} XRP`,
        headline: `${wallet}'s XRP balance rose ${Math.round(change * 100)}%`, detail: `From ${n(before.balanceXrp)} to ${n(after.balanceXrp)} XRP.` });
    }
  }

  const beforeLines = new Map(before.lines.map((l) => [lineKey(l), l]));
  const afterLines = new Map(after.lines.map((l) => [lineKey(l), l]));
  for (const [key, l] of afterLines) {
    const asset = `${decodeCurrency(l.currency)} from ${short(l.issuer)}`;
    const was = beforeLines.get(key);
    if (!was) {
      add({ severity: "info", kind: "line-added", subject: key, field: "RippleState", from: "none", to: `${n(l.balance)}`,
        headline: `${wallet} opened a trust line: ${asset}`, detail: `The line holds ${n(l.balance)}.` });
      continue;
    }
    if (!was.deepFrozenByIssuer && l.deepFrozenByIssuer) {
      add({ severity: "critical", kind: "line-deep-frozen", subject: key, field: "lsfHighDeepFreeze/lsfLowDeepFreeze", from: "clear", to: "set",
        headline: `The issuer deep-froze ${wallet}'s ${asset}`,
        detail: `The ${n(l.balance)} held can now be neither sent nor received until the issuer clears it.` });
    } else if (!was.frozenByIssuer && l.frozenByIssuer) {
      add({ severity: "critical", kind: "line-frozen", subject: key, field: "freeze_peer", from: "clear", to: "set",
        headline: `The issuer froze ${wallet}'s ${asset}`,
        detail: `The ${n(l.balance)} held can only be sent back to the issuer until the freeze is cleared.` });
    } else if ((was.frozenByIssuer || was.deepFrozenByIssuer) && !l.frozenByIssuer && !l.deepFrozenByIssuer) {
      add({ severity: "info", kind: "line-unfrozen", subject: key, field: "freeze_peer", from: "set", to: "clear",
        headline: `The issuer cleared the freeze on ${wallet}'s ${asset}`, detail: `${n(l.balance)} is movable again.` });
    }
    if (was.balance > 0) {
      const change = (l.balance - was.balance) / was.balance;
      if (change <= -BALANCE_THRESHOLD) {
        add({ severity: "warn", kind: "holding-fell", subject: key, field: "balance", from: n(was.balance), to: n(l.balance),
          headline: `${wallet}'s ${asset} fell ${Math.round(-change * 100)}%`,
          detail: `From ${n(was.balance)} to ${n(l.balance)}. A payment out, an offer crossing or an issuer clawback all look like this; the transactions between the readings say which.` });
      }
    }
  }
  for (const [key, was] of beforeLines) {
    if (!afterLines.has(key)) {
      add({ severity: "info", kind: "line-removed", subject: key, field: "RippleState", from: n(was.balance), to: "none",
        headline: `${wallet}'s trust line for ${decodeCurrency(was.currency)} from ${short(was.issuer)} is gone`,
        detail: "The line was removed, which the ledger allows only once its balance is zero and its limit cleared." });
    }
  }

  const beforeCreds = new Map(before.credentials.map((c) => [credKey(c), c]));
  const afterCreds = new Map(after.credentials.map((c) => [credKey(c), c]));
  const t0 = Date.parse(before.readAt);
  const t1 = Date.parse(after.readAt);
  for (const [key, c] of afterCreds) {
    const was = beforeCreds.get(key);
    const name = `${c.type} from ${short(c.issuer)}`;
    if (!was) {
      add({ severity: "info", kind: "credential-added", subject: key, field: "Credential", from: "none", to: c.accepted ? "accepted" : "not accepted",
        headline: `${wallet} received a credential: ${name}`, detail: c.accepted ? "It is accepted." : "It has not been accepted yet, so it proves nothing until it is." });
      continue;
    }
    if (!was.revoked && c.revoked) {
      add({ severity: "warn", kind: "credential-revoked", subject: key, field: "Revoked", from: "false", to: "true",
        headline: `${wallet}'s credential ${name} was revoked`, detail: "Domains that require it will now refuse this wallet." });
    }
    if (c.expiresAt !== undefined) {
      if (c.expiresAt > t0 && c.expiresAt <= t1) {
        add({ severity: "critical", kind: "credential-expired", subject: key, field: "Expiration", from: "valid", to: "expired",
          headline: `${wallet}'s credential ${name} expired`, detail: `It expired at ${new Date(c.expiresAt).toISOString()}. Domains that require it will refuse this wallet.` });
      } else if (c.expiresAt > t1 && c.expiresAt - t0 > EXPIRY_WINDOW_MS && c.expiresAt - t1 <= EXPIRY_WINDOW_MS) {
        add({ severity: "warn", kind: "credential-expiring", subject: key, field: "Expiration", from: "more than 7 days", to: "within 7 days",
          headline: `${wallet}'s credential ${name} expires within a week`, detail: `It expires at ${new Date(c.expiresAt).toISOString()}.` });
      }
    }
  }
  for (const [key, was] of beforeCreds) {
    if (!afterCreds.has(key)) {
      add({ severity: "warn", kind: "credential-removed", subject: key, field: "Credential", from: "present", to: "none",
        headline: `${wallet}'s credential ${was.type} from ${short(was.issuer)} is gone`, detail: "It was deleted from the ledger by its issuer or its subject." });
    }
  }

  // Issuer posture: the same transitions the issuer-drift watch reports.
  for (const [issuer, now] of Object.entries(after.issuers)) {
    const then = before.issuers[issuer];
    if (!then) continue;
    for (const d of diffPosture(then, now)) {
      add({ severity: d.severity, kind: "issuer-drift", subject: issuer, field: d.field, from: d.from, to: d.to,
        headline: `${d.headline} (${short(issuer)})`, detail: d.detail });
    }
  }

  return out;
}

/**
 * The question handed to the agent when a person asks it to explain an
 * observation: the observation and its evidence, and an instruction to
 * stay inside them.
 */
export function observationPrompt(o: Observation): string {
  return [
    "NOSHASHI's observer recorded this change on XRPL mainnet, comparing two validated readings:",
    `- Wallet: ${o.address}`,
    `- ${o.headline}`,
    `- Detail: ${o.detail}`,
    `- Evidence: ${o.evidence.field} on ${o.evidence.subject} went from "${o.evidence.from}" to "${o.evidence.to}" between ${o.evidence.readBefore} and ${o.evidence.readAfter}.`,
    "Explain what this means for the wallet's holder and what they should check next. Use only these facts; say so if they are not enough.",
  ].join("\n");
}
