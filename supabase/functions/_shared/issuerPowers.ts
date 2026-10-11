/**
 * An issuer's powers over its holders, as a snapshot that can be compared.
 *
 * The authority certificate answers "what can this issuer do right now".
 * A holder's harder question is "tell me the moment that changes" — the
 * freeze switched on, a new key that signs alone, a fee raised, clawback
 * enabled. Every one of those is a single AccountSet, SetRegularKey or
 * SignerListSet, visible on the ledger the instant it validates and
 * noticed, today, by almost nobody until it is used.
 *
 * This module is the pure half of the issuer alerts
 * (supabase/functions/noshashi-issuer-alerts): account_info in, snapshot
 * out, two snapshots in, a list of plain-language changes out. It is
 * shared so the console and the tests read the same rules.
 *
 * Every field is a ledger fact, read from validated state. A field that
 * could not be read is null, and a change from or to null is never
 * reported as a change — an unreadable signer list is not a new signer
 * list, and an alert that fires because a node timed out is an alert
 * people learn to ignore.
 */

export type Powers = {
  noFreeze: boolean;
  globalFreeze: boolean;
  requireAuth: boolean;
  clawback: boolean;
  masterDisabled: boolean;
  regularKey: string | null;
  /** null when the signer list could not be read; [] when there is none. */
  signers: string[] | null;
  signerQuorum: number | null;
  transferRateBps: number;
  domain: string | null;
};

export type Change = {
  field: keyof Powers;
  /** critical: a holder could lose access or value; warn: worth knowing; info: in the holder's favour. */
  severity: "critical" | "warn" | "info";
  text: string;
};

const LSF_REQUIRE_AUTH = 0x0004_0000;
const LSF_DISABLE_MASTER = 0x0010_0000;
const LSF_NO_FREEZE = 0x0020_0000;
const LSF_GLOBAL_FREEZE = 0x0040_0000;
const LSF_ALLOW_CLAWBACK = 0x8000_0000;

// deno-lint-ignore no-explicit-any
type Json = any;

function hexToAscii(hex: string): string | null {
  if (!/^([0-9A-Fa-f]{2})+$/.test(hex)) return null;
  const text = (hex.match(/../g) ?? []).map((b) => String.fromCharCode(parseInt(b, 16))).join("");
  return /^[\x20-\x7E]+$/.test(text) ? text : null;
}

/**
 * From an account_info result requested with `signer_lists: true`.
 * Accepts API v1 (signer_lists inside account_data) and v2 (at the top).
 */
export function powersFrom(accountInfo: Json): Powers | null {
  const data = accountInfo?.account_data;
  if (!data || typeof data !== "object") return null;
  const flags = Number(data.Flags ?? 0) >>> 0;
  const rate = Number(data.TransferRate ?? 0);

  const lists = accountInfo.signer_lists ?? data.signer_lists;
  let signers: string[] | null = null;
  let quorum: number | null = null;
  if (Array.isArray(lists)) {
    const list = lists[0];
    if (list) {
      signers = (list.SignerEntries ?? [])
        .map((e: Json) => e?.SignerEntry ?? e)
        .filter((e: Json) => typeof e?.Account === "string")
        .map((e: Json) => `${e.Account}:${Number(e.SignerWeight ?? 0)}`)
        .sort();
      quorum = Number(list.SignerQuorum ?? 0);
    } else {
      signers = [];
      quorum = 0;
    }
  }

  return {
    noFreeze: (flags & LSF_NO_FREEZE) !== 0,
    globalFreeze: (flags & LSF_GLOBAL_FREEZE) !== 0,
    requireAuth: (flags & LSF_REQUIRE_AUTH) !== 0,
    clawback: (flags & LSF_ALLOW_CLAWBACK) !== 0,
    masterDisabled: (flags & LSF_DISABLE_MASTER) !== 0,
    regularKey: typeof data.RegularKey === "string" ? data.RegularKey : null,
    signers,
    signerQuorum: quorum,
    transferRateBps: rate > 1_000_000_000 ? Math.round(((rate - 1_000_000_000) / 1_000_000_000) * 10_000) : 0,
    domain: typeof data.Domain === "string" ? hexToAscii(data.Domain) ?? data.Domain : null,
  };
}

const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const list = (signers: string[]) => signers.map((s) => s.replace(":", " weight ")).join(", ");

/** What changed between two readings, most serious first. */
export function diffPowers(before: Powers | null, after: Powers | null): Change[] {
  if (!before || !after) return [];
  const out: Change[] = [];

  if (before.globalFreeze !== after.globalFreeze) {
    out.push(after.globalFreeze
      ? { field: "globalFreeze", severity: "critical", text: "Global freeze turned ON. Every trust line of this issuer is frozen: holders cannot move the asset." }
      : { field: "globalFreeze", severity: "info", text: "Global freeze turned off. Holders can move the asset again." });
  }
  if (!before.clawback && after.clawback) {
    out.push({ field: "clawback", severity: "critical", text: "Clawback enabled. The issuer can now take tokens back from holders' balances." });
  }
  if (before.regularKey !== after.regularKey) {
    out.push({
      field: "regularKey",
      severity: "critical",
      text: after.regularKey
        ? before.regularKey
          ? `Regular key changed from ${before.regularKey} to ${after.regularKey}. A different key now signs for this issuer.`
          : `Regular key set to ${after.regularKey}. That key can now sign for this issuer.`
        : `Regular key removed (was ${before.regularKey}).`,
    });
  }
  if (before.signers !== null && after.signers !== null) {
    const was = before.signers.join(",");
    const now = after.signers.join(",");
    if (was !== now || before.signerQuorum !== after.signerQuorum) {
      out.push({
        field: "signers",
        severity: "critical",
        text: after.signers.length
          ? `Signer list changed. Now quorum ${after.signerQuorum} of: ${list(after.signers)}.`
            + (before.signers.length ? ` Was quorum ${before.signerQuorum} of: ${list(before.signers)}.` : " There was no signer list before.")
          : `Signer list removed (was quorum ${before.signerQuorum} of: ${list(before.signers)}).`,
      });
    }
  }
  if (before.masterDisabled !== after.masterDisabled) {
    out.push(after.masterDisabled
      ? { field: "masterDisabled", severity: "info", text: "Master key disabled. Only the regular key or the signer list can sign now." }
      : { field: "masterDisabled", severity: "critical", text: "Master key re-enabled. The master key can sign for this issuer again." });
  }
  if (!before.requireAuth && after.requireAuth) {
    out.push({ field: "requireAuth", severity: "warn", text: "Authorization required. New holders now need the issuer's permission to hold this asset." });
  } else if (before.requireAuth && !after.requireAuth) {
    out.push({ field: "requireAuth", severity: "info", text: "Authorization no longer required. Anyone can open a line to this issuer." });
  }
  if (before.transferRateBps !== after.transferRateBps) {
    out.push({
      field: "transferRateBps",
      severity: after.transferRateBps > before.transferRateBps ? "warn" : "info",
      text: `Transfer fee changed from ${pct(before.transferRateBps)} to ${pct(after.transferRateBps)} on every transfer between holders.`,
    });
  }
  if (!before.noFreeze && after.noFreeze) {
    out.push({ field: "noFreeze", severity: "info", text: "Freeze permanently surrendered (lsfNoFreeze set). This cannot be undone." });
  }
  if (before.domain !== after.domain) {
    out.push({ field: "domain", severity: "warn", text: `Domain changed from ${before.domain ?? "none"} to ${after.domain ?? "none"}.` });
  }

  const rank = { critical: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** The current powers in one short paragraph, for a subscription receipt. */
export function describePowers(p: Powers): string {
  const signer = p.signers && p.signers.length
    ? `signer list, quorum ${p.signerQuorum} of ${p.signers.length}`
    : p.regularKey
      ? `regular key ${p.regularKey}${p.masterDisabled ? ", master key disabled" : ", master key also enabled"}`
      : p.masterDisabled ? "no usable key" : "master key";
  return [
    `Signs with: ${signer}.`,
    `Freeze: ${p.noFreeze ? "permanently surrendered" : "retained"}${p.globalFreeze ? " (GLOBAL FREEZE ON)" : ""}.`,
    `Clawback: ${p.clawback ? "enabled" : "not enabled"}.`,
    `Holding: ${p.requireAuth ? "needs issuer permission" : "open"}.`,
    `Transfer fee: ${pct(p.transferRateBps)}.`,
  ].join(" ");
}

const MARK = { critical: "🔴", warn: "🟠", info: "🟢" } as const;

/** The alert as plain text: Telegram and Discord both render it as-is. */
export function alertText(issuer: string, ledgerIndex: number | null, changes: Change[], unsubscribeUrl: string): string {
  return [
    `NOSHASHI · issuer power change`,
    `${issuer}${ledgerIndex ? ` at ledger ${ledgerIndex}` : ""}`,
    "",
    ...changes.map((c) => `${MARK[c.severity]} ${c.text}`),
    "",
    `Full reading: https://www.noshashi.app/certificate/?issuer=${issuer}`,
    `Ledger facts, not advice. Stop these alerts: ${unsubscribeUrl}`,
  ].join("\n");
}

export const ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
/**
 * The only Discord URLs this will ever post to. Anything else — another
 * host, a redirect, an internal address — is refused before a request is
 * made, so the subscribe endpoint cannot be turned into a way to make
 * our server call an arbitrary URL.
 */
export const DISCORD_WEBHOOK_RE = /^https:\/\/(?:discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d{15,22}\/[A-Za-z0-9_-]{30,100}$/;
