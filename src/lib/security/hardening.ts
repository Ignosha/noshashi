import { rpc } from "@/lib/xrpl/client";
import { lookalikeOf } from "../../../supabase/functions/_shared/xrplEvents.ts";

/**
 * Account security — how hard an XRP Ledger account is to take over, and
 * what to change so it gets harder.
 *
 * Read from validated ledger state and the account's own recent history:
 * who can sign (master key, regular key, signer list and its real quorum),
 * which doors strangers can use (unsolicited trust lines, checks, payment
 * channels and NFT offers, the carriers of most XRPL phishing), recent key
 * and settings changes (the first thing a thief does is add a key of their
 * own), and address-poisoning attempts against the account.
 *
 * The hardening plan is a list of unsigned transactions. NOSHASHI never
 * signs or submits: the owner reviews each one and signs it in their own
 * wallet. Nothing here asks for, or could use, a secret key.
 */

const RIPPLE_EPOCH = 946_684_800;

/** AccountRoot flags (lsf). */
export const LSF = {
  requireDestTag: 0x00020000,
  requireAuth: 0x00040000,
  disallowXrp: 0x00080000,
  disableMaster: 0x00100000,
  noFreeze: 0x00200000,
  globalFreeze: 0x00400000,
  defaultRipple: 0x00800000,
  depositAuth: 0x01000000,
  disallowIncomingNFTokenOffer: 0x04000000,
  disallowIncomingCheck: 0x08000000,
  disallowIncomingPayChan: 0x10000000,
  disallowIncomingTrustline: 0x20000000,
} as const;

/** AccountSet flags (asf), as used in SetFlag / ClearFlag. */
export const ASF = {
  requireDest: 1,
  disableMaster: 4,
  depositAuth: 9,
  disallowIncomingNFTokenOffer: 12,
  disallowIncomingCheck: 13,
  disallowIncomingPayChan: 14,
  disallowIncomingTrustline: 15,
} as const;

const ASF_NAMES: Record<number, string> = {
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
  16: "allow trust-line clawback",
};

export type SecurityEventKind =
  | "regular_key_set"
  | "regular_key_removed"
  | "signer_list_set"
  | "signer_list_removed"
  | "master_disabled"
  | "master_enabled"
  | "flag_set"
  | "flag_cleared"
  | "account_deleted";

export type SecurityEvent = {
  kind: SecurityEventKind;
  ledger: number;
  at: string | null;
  hash: string;
  detail: string;
};

export type Signer = { account: string; weight: number };

export type SecurityPosture = {
  address: string;
  exists: boolean;
  balanceXrp: number;
  flags: number;
  masterEnabled: boolean;
  regularKey: string | null;
  signerList: { quorum: number; signers: Signer[]; minimumSigners: number } | null;
  domain: string | null;
  ledgerIndex: number;
  /** Key and settings changes in the history read, newest first. */
  events: SecurityEvent[];
  /** Incoming payments from senders imitating an address this account has paid. */
  poisoning: Array<{ sender: string; imitates: string; hash: string; ledger: number }>;
  /** Incoming payments below 0.01 XRP: the carrier of most phishing links. */
  dustReceived: number;
  /** Transactions read from the account's history. */
  historyRead: number;
  /** False when the history read stopped at its limit, so older events were not seen. */
  historyComplete: boolean;
};

type Json = Record<string, any>;

const rippleIso = (t: unknown) => (typeof t === "number" ? new Date((t + RIPPLE_EPOCH) * 1000).toISOString() : null);

function hexText(hex: string): string {
  if (!/^([0-9A-Fa-f]{2})+$/.test(hex)) return hex;
  return new TextDecoder().decode(new Uint8Array((hex.match(/../g) ?? []).map((b) => parseInt(b, 16))));
}

export function minimumSigners(signers: Signer[], quorum: number): number {
  const weights = signers.map((s) => s.weight).sort((a, b) => b - a);
  let total = 0;
  for (let i = 0; i < weights.length; i++) {
    total += weights[i];
    if (total >= quorum) return i + 1;
  }
  return Infinity;
}

/** The posture from an account_info reply (signer_lists requested) and account_tx rows, newest first. Pure. */
export function postureFrom(address: string, info: Json | null, rows: Json[], complete: boolean): SecurityPosture {
  const data = (info?.account_data ?? null) as Json | null;
  const lists = (info?.signer_lists ?? data?.signer_lists ?? []) as Json[];
  const list = lists[0];
  const signers: Signer[] = ((list?.SignerEntries ?? []) as Json[])
    .map((e) => ({ account: String(e.SignerEntry?.Account ?? ""), weight: Number(e.SignerEntry?.SignerWeight ?? 0) }))
    .filter((s) => s.account);
  const quorum = Number(list?.SignerQuorum ?? 0);
  const flags = Number(data?.Flags ?? 0);

  const events: SecurityEvent[] = [];
  const paid = new Set<string>();
  const incoming: Array<{ from: string; hash: string; ledger: number }> = [];
  let dust = 0;
  for (const row of rows) {
    const tx = (row.tx_json ?? row.tx ?? row) as Json;
    const meta = (row.meta ?? {}) as Json;
    if (meta.TransactionResult !== "tesSUCCESS") continue;
    const ledger = Number(row.ledger_index ?? tx.ledger_index ?? 0);
    const hash = String(tx.hash ?? row.hash ?? "");
    const at = rippleIso(tx.date ?? row.date);
    const mine = tx.Account === address;
    switch (tx.TransactionType) {
      case "SetRegularKey":
        if (mine) {
          events.push(
            tx.RegularKey
              ? { kind: "regular_key_set", ledger, at, hash, detail: `Regular key set to ${tx.RegularKey}: that key can now sign alone.` }
              : { kind: "regular_key_removed", ledger, at, hash, detail: "Regular key removed." }
          );
        }
        break;
      case "SignerListSet":
        if (mine) {
          const q = Number(tx.SignerQuorum ?? 0);
          const n = ((tx.SignerEntries ?? []) as Json[]).length;
          events.push(
            q > 0
              ? { kind: "signer_list_set", ledger, at, hash, detail: `Signer list set: quorum ${q} across ${n} signer${n === 1 ? "" : "s"}.` }
              : { kind: "signer_list_removed", ledger, at, hash, detail: "Signer list removed." }
          );
        }
        break;
      case "AccountSet":
        if (mine) {
          if (tx.SetFlag === ASF.disableMaster) events.push({ kind: "master_disabled", ledger, at, hash, detail: "Master key disabled." });
          else if (tx.ClearFlag === ASF.disableMaster) events.push({ kind: "master_enabled", ledger, at, hash, detail: "Master key re-enabled." });
          else if (typeof tx.SetFlag === "number") events.push({ kind: "flag_set", ledger, at, hash, detail: `Set: ${ASF_NAMES[tx.SetFlag] ?? `flag ${tx.SetFlag}`}.` });
          else if (typeof tx.ClearFlag === "number") events.push({ kind: "flag_cleared", ledger, at, hash, detail: `Cleared: ${ASF_NAMES[tx.ClearFlag] ?? `flag ${tx.ClearFlag}`}.` });
        }
        break;
      case "AccountDelete":
        if (mine) events.push({ kind: "account_deleted", ledger, at, hash, detail: `Account deleted; its XRP went to ${tx.Destination}.` });
        break;
      case "Payment":
        if (mine && typeof tx.Destination === "string") paid.add(tx.Destination);
        if (tx.Destination === address && typeof tx.Account === "string") {
          incoming.push({ from: tx.Account, hash, ledger });
          const drops = typeof tx.Amount === "string" ? Number(tx.Amount) : NaN;
          if (Number.isFinite(drops) && drops < 10_000) dust += 1;
        }
        break;
    }
  }

  const poisoning: SecurityPosture["poisoning"] = [];
  const seen = new Set<string>();
  for (const p of incoming) {
    if (paid.has(p.from) || seen.has(p.from)) continue;
    const imitates = lookalikeOf(p.from, paid);
    if (imitates) {
      seen.add(p.from);
      poisoning.push({ sender: p.from, imitates, hash: p.hash, ledger: p.ledger });
    }
  }

  return {
    address,
    exists: Boolean(data),
    balanceXrp: data ? Number(data.Balance ?? 0) / 1_000_000 : 0,
    flags,
    masterEnabled: (flags & LSF.disableMaster) === 0,
    regularKey: data?.RegularKey ? String(data.RegularKey) : null,
    signerList: signers.length ? { quorum, signers, minimumSigners: minimumSigners(signers, quorum) } : null,
    domain: typeof data?.Domain === "string" && data.Domain ? hexText(data.Domain) : null,
    ledgerIndex: Number(info?.ledger_index ?? 0),
    events,
    poisoning,
    dustReceived: dust,
    historyRead: rows.length,
    historyComplete: complete,
  };
}

/** Read an account's security posture live: its state and up to `limit` recent transactions. */
export async function readSecurityPosture(address: string, limit = 200): Promise<SecurityPosture> {
  const info = (await rpc("account_info", { account: address, ledger_index: "validated", signer_lists: true }).catch((error: unknown) => {
    if (/actNotFound|not found/i.test(error instanceof Error ? error.message : String(error))) return null;
    throw error;
  })) as Json | null;
  if (!info) return postureFrom(address, null, [], true);
  const history = (await rpc("account_tx", { account: address, ledger_index_min: -1, ledger_index_max: -1, forward: false, limit }).catch(() => ({ transactions: [] }))) as Json;
  const rows = (history.transactions ?? []) as Json[];
  return postureFrom(address, info, rows, !history.marker);
}

// ————— Assessment —————

export type SecurityFinding = {
  id: string;
  severity: "critical" | "warn" | "info" | "ok";
  title: string;
  detail: string;
  action?: string;
};

export type PlanStep = {
  id: string;
  title: string;
  why: string;
  /** Unsigned transaction to review and sign in your own wallet. Values in <angle brackets> are yours to fill in. */
  tx: Json;
  /** Read before signing. */
  caution?: string;
};

export type SecurityAssessment = {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
  findings: SecurityFinding[];
  plan: PlanStep[];
};

const RANK = { critical: 0, warn: 1, info: 2, ok: 3 } as const;
const DAY = 86_400_000;

/**
 * Findings, a 0–100 score and the hardening plan. `now` dates "recent"
 * key changes; it defaults to the clock.
 */
export function assessSecurity(p: SecurityPosture, now = Date.now()): SecurityAssessment {
  const f: SecurityFinding[] = [];
  const plan: PlanStep[] = [];
  const has = (flag: number) => (p.flags & flag) !== 0;

  if (!p.exists) {
    return {
      score: 0,
      grade: "F",
      summary: "This account does not exist on the ledger: never funded, or deleted.",
      findings: [{ id: "not-found", severity: "info", title: "No account at this address", detail: "The validated ledger has no AccountRoot here. If you expected funds, check the address; if it was deleted, its XRP went to the account named in its AccountDelete." }],
      plan: [],
    };
  }

  // Who can sign.
  const list = p.signerList;
  if (p.masterEnabled && !p.regularKey && !list) {
    f.push({
      id: "single-key",
      severity: "warn",
      title: "One secret key controls everything",
      detail: `The master key can sign alone and there is no second key or signer list, so anyone who obtains that one secret can move all ${p.balanceXrp.toLocaleString("en-US")} XRP at once. Stolen seeds (phishing sites, cloud backups, screenshots, clipboard malware) are how most XRPL accounts are emptied.`,
      action: "For a personal wallet: keep the master seed offline and sign day to day with a regular key on a hardware wallet. For a treasury: require several signers.",
    });
  }
  if (p.masterEnabled && p.regularKey) {
    f.push({
      id: "two-keys",
      severity: "warn",
      title: "Two separate keys can each move everything",
      detail: `Both the master key and the regular key ${p.regularKey} sign alone. Either one leaking loses the account, so the account is only as safe as the less protected of the two.`,
      action: "If the master seed is not kept offline, disable it once you have confirmed the regular key signs.",
    });
  }
  if (!p.masterEnabled && p.regularKey && !list) {
    f.push({
      id: "regular-only",
      severity: "info",
      title: "A single regular key controls the account",
      detail: `The master key is disabled and the regular key ${p.regularKey} signs alone. That is a sound setup when that key lives in a hardware wallet or HSM, and a single point of failure when it does not.`,
    });
  }
  if (list) {
    if (p.masterEnabled) {
      f.push({
        id: "bypassable-multisig",
        severity: "critical",
        title: "The signer list can be bypassed",
        detail: `Quorum ${list.quorum} is configured, but the master key still signs alone, so one stolen seed skips every approval.`,
        action: "Disable the master key once the signers have been confirmed to sign.",
      });
    }
    if (list.minimumSigners === Infinity) {
      f.push({ id: "quorum-unreachable", severity: "critical", title: "The signers can never reach quorum", detail: `Quorum ${list.quorum} is more than the signers' combined weight. Unless another key exists, nothing can be moved.` });
    } else if (list.minimumSigners === 1) {
      f.push({ id: "one-signer-enough", severity: "critical", title: "One signer can act alone", detail: `A single signer carries quorum ${list.quorum} by weight, so the list gives no second approval.`, action: "Rebalance weights so no single signer reaches quorum." });
    } else {
      f.push({ id: "multisig", severity: "ok", title: `At least ${list.minimumSigners} of ${list.signers.length} signers must agree`, detail: `Quorum ${list.quorum}. A thief needs ${list.minimumSigners} separate secrets, usually on separate people's devices.` });
    }
  }
  if (!p.masterEnabled && !p.regularKey && !list) {
    f.push({ id: "blackholed", severity: "info", title: "Nothing can sign for this account", detail: "Master key disabled, no regular key, no signer list: the account is blackholed. Nothing can be stolen from it, and nothing can be moved out of it again." });
  }

  // Recent key and settings changes: what a thief does first.
  const recent = p.events.filter((e) => e.at && now - Date.parse(e.at) < 30 * DAY && e.kind !== "flag_set" && e.kind !== "flag_cleared");
  if (recent.length) {
    f.push({
      id: "recent-key-change",
      severity: "warn",
      title: `Signing keys changed ${recent.length === 1 ? "once" : `${recent.length} times`} in the last 30 days`,
      detail: `${recent.map((e) => `${e.at!.slice(0, 10)}: ${e.detail}`).join(" ")} Taking over an account usually starts with a new regular key or signer list, so every change should be one you made.`,
      action: "If you did not make these changes, treat the account as compromised: open Incident Response now.",
    });
  }

  // Poisoning and phishing.
  if (p.poisoning.length) {
    f.push({
      id: "poisoning",
      severity: "warn",
      title: `${p.poisoning.length} address-poisoning attempt${p.poisoning.length === 1 ? "" : "s"} against this account`,
      detail: p.poisoning.slice(0, 5).map((x) => `${x.sender} imitates ${x.imitates}, which this account has paid.`).join(" ") + " They sent you something so the fake appears in your history next to the real one.",
      action: "Never copy a destination from transaction history. Keep an address book, and check a pasted address against it before signing.",
    });
  }
  if (p.dustReceived >= 3) {
    f.push({ id: "dust", severity: "info", title: `${p.dustReceived} dust payments received`, detail: "Payments under 0.01 XRP are how links to fake wallets and airdrops reach an account's history. Do not open links that arrive on the ledger." });
  }

  // Doors strangers can use.
  const doors: Array<[number, number, string, string]> = [
    [LSF.disallowIncomingNFTokenOffer, ASF.disallowIncomingNFTokenOffer, "NFT offers", "Unsolicited NFT offers are a common phishing carrier: their names and images point at fake claim sites."],
    [LSF.disallowIncomingCheck, ASF.disallowIncomingCheck, "checks", "A check someone else created shows up as something to cash; scammers use them as lures."],
    [LSF.disallowIncomingPayChan, ASF.disallowIncomingPayChan, "payment channels", "Unsolicited payment channels clutter the account and are rarely legitimate for a personal wallet."],
  ];
  const open = doors.filter(([lsf]) => !has(lsf));
  if (open.length) {
    f.push({
      id: "open-doors",
      severity: "info",
      title: `Strangers can send this account ${open.map((d) => d[2]).join(", ")}`,
      detail: "Refusing them costs nothing and removes channels phishing uses. You can still create them yourself.",
    });
    for (const [, asf, name, why] of open) {
      plan.push({ id: `refuse-${asf}`, title: `Refuse incoming ${name}`, why, tx: { TransactionType: "AccountSet", Account: p.address, SetFlag: asf } });
    }
  } else {
    f.push({ id: "doors-closed", severity: "ok", title: "Unsolicited NFT offers, checks and payment channels are refused", detail: "The account has closed the channels phishing usually arrives through." });
  }
  if (has(LSF.depositAuth)) {
    f.push({ id: "deposit-auth", severity: "ok", title: "Only preauthorised senders can pay this account", detail: "Deposit authorisation is on: nothing arrives unless the account approved the sender, which also blocks dust and poisoning." });
  }

  // Plan: keys.
  if (p.masterEnabled && !list) {
    plan.unshift({
      id: "regular-key",
      title: "Sign day to day with a regular key",
      why: "A regular key on a hardware wallet does the signing; the master seed goes offline (paper or steel, never a photo or cloud). If the regular key is ever exposed, the master key replaces it in one transaction.",
      tx: { TransactionType: "SetRegularKey", Account: p.address, RegularKey: "<address of the key on your hardware wallet>" },
    });
    plan.splice(1, 0, {
      id: "signer-list",
      title: "Or, for a treasury: require two of three signers",
      why: "Three keys held by different people or devices, any two of which must sign. A single stolen seed can no longer move anything.",
      tx: {
        TransactionType: "SignerListSet",
        Account: p.address,
        SignerQuorum: 2,
        SignerEntries: [1, 2, 3].map((n) => ({ SignerEntry: { Account: `<signer ${n} address>`, SignerWeight: 1 } })),
      },
      caution: "Test that the signers can sign a small transaction before relying on the list.",
    });
  }
  if (list && p.masterEnabled) {
    plan.unshift({
      id: "disable-master",
      title: "Disable the master key",
      why: "So the signer list actually binds: until then one stolen master seed skips the quorum.",
      tx: { TransactionType: "AccountSet", Account: p.address, SetFlag: ASF.disableMaster },
      caution: "Sign it only after a multisigned test transaction has succeeded. If the signers cannot reach quorum, disabling the master key locks the account permanently.",
    });
  }

  f.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const critical = f.filter((x) => x.severity === "critical").length;
  const warn = f.filter((x) => x.severity === "warn").length;
  const score = Math.max(0, Math.min(100, 100 - critical * 30 - warn * 12 - open.length * 3 - (list && list.minimumSigners >= 2 && !p.masterEnabled ? -5 : 0)));
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  const summary =
    critical > 0
      ? "Serious weaknesses: fix the critical findings before holding meaningful value here."
      : warn > 0
        ? "Workable, with changes worth making."
        : "Well protected by what the ledger can show.";
  return { score, grade, summary, findings: f, plan };
}
