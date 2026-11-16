/*
 * Stellar issuer authority: what an issuing account on the Stellar
 * network can still do to the assets it issues.
 *
 * The same question the XRPL certificate answers (api/_lib/authority.js),
 * asked of a ledger whose powers are named differently but map closely:
 *
 *   XRPL                 Stellar
 *   freeze a line        revoke authorization (AUTH_REVOCABLE, SetTrustLineFlags)
 *   clawback             clawback (AUTH_CLAWBACK_ENABLED, Clawback op)
 *   lsfRequireAuth       AUTH_REQUIRED
 *   lsfNoFreeze          AUTH_IMMUTABLE (locks every flag, not just freeze)
 *   signer list quorum   signer weights against low / medium / high thresholds
 *
 * Read from Horizon (horizon.stellar.org), the Stellar Development
 * Foundation's free public API. It serves ingested ledger state and
 * names the ledger it last closed, which the certificate records.
 *
 * Which threshold governs what is the part that is easy to get wrong:
 *
 *   low     SetTrustLineFlags / AllowTrust   (freezing a holder)
 *   medium  Payment, Clawback                (issuing more, clawing back)
 *   high    SetOptions                        (changing flags or signers)
 *
 * So "can freeze" needs the low threshold, "can claw back" or "can mint"
 * needs medium, and "can turn a power back on" needs high, and only while
 * AUTH_IMMUTABLE is clear. Each check below reads the threshold its
 * operation actually needs.
 */

import { verdictFor, digestOf } from "./authority.js";

export const HORIZON = "https://horizon.stellar.org";

/*
 * Bump when a rule decides differently. It is inside the digest scope,
 * so two certificates from different rule sets never share a digest.
 */
export const STELLAR_RULES_VERSION = 1;

/* ── StrKey ───────────────────────────────────────────────────────── */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const VERSION_ACCOUNT_ID = 6 << 3; // "G"

function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of text) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

function crc16xmodem(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/**
 * True only for a well-formed Stellar account ID (G…) whose checksum
 * verifies. A typo is caught here, before anything is sent to Horizon.
 */
export function isStellarAccountId(text) {
  if (typeof text !== "string" || !/^G[A-Z2-7]{55}$/.test(text)) return false;
  const bytes = base32Decode(text);
  if (!bytes || bytes.length !== 35 || bytes[0] !== VERSION_ACCOUNT_ID) return false;
  const crc = crc16xmodem(bytes.subarray(0, 33));
  return bytes[33] === (crc & 0xff) && bytes[34] === (crc >> 8);
}

/** Asset codes: 1–12 alphanumerics. */
export const ASSET_CODE_RE = /^[A-Za-z0-9]{1,12}$/;

/* ── Reads ────────────────────────────────────────────────────────── */

async function horizonGet(path, { fetchImpl = fetch, timeout = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetchImpl(`${HORIZON}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (res.status === 404) {
      const error = new Error("not found");
      error.code = "notFound";
      throw error;
    }
    if (!res.ok) throw new Error(`Horizon answered ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Everything a certificate needs, in three reads: the account (flags,
 * signers, thresholds), the assets it issues (holder counts, amounts,
 * per-asset flags) and the latest closed ledger. A failed read is
 * recorded in `unreadable`, never treated as an absence.
 */
export async function readStellarSurface(issuer, options = {}) {
  const unreadable = [];
  const readAt = new Date().toISOString();
  const [account, assets, ledger] = await Promise.all([
    horizonGet(`/accounts/${issuer}`, options).catch((error) => {
      if (error?.code === "notFound") return { notFound: true };
      unreadable.push(`account: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }),
    horizonGet(`/assets?asset_issuer=${issuer}&limit=200`, options).catch((error) => {
      unreadable.push(`assets: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }),
    horizonGet(`/ledgers?order=desc&limit=1`, options).catch((error) => {
      unreadable.push(`ledger: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }),
  ]);
  return {
    issuer,
    account,
    assets: assets?._embedded?.records ?? null,
    assetsTruncated: Boolean(assets?._embedded?.records?.length === 200),
    ledgerIndex: Number(ledger?._embedded?.records?.[0]?.sequence ?? 0),
    ledgerClosedAt: ledger?._embedded?.records?.[0]?.closed_at ?? null,
    unreadable,
    readAt,
  };
}

/* ── Signing power ────────────────────────────────────────────────── */

/**
 * The fewest signers whose weights reach `threshold`, or Infinity when
 * all of them together cannot. A threshold of 0 still needs one real
 * signature, so it is treated as 1: an account whose every signer has
 * weight 0 is locked, whatever its thresholds say.
 */
export function minimumSigners(signers, threshold) {
  const need = Math.max(Number(threshold) || 0, 1);
  const weights = signers
    .map((s) => Number(s.weight) || 0)
    .filter((w) => w > 0)
    .sort((a, b) => b - a);
  let total = 0;
  for (let i = 0; i < weights.length; i += 1) {
    total += weights[i];
    if (total >= need) return i + 1;
  }
  return Infinity;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ── Rules ────────────────────────────────────────────────────────── */

/** The asset the certificate is about: the one asked for, or the largest. */
export function primaryAsset(assets, code) {
  if (!Array.isArray(assets) || assets.length === 0) return null;
  if (code) return assets.find((a) => a.asset_code === code) ?? null;
  const amount = (a) => Number(a?.balances?.authorized ?? 0) + Number(a?.liquidity_pools_amount ?? 0);
  return [...assets].sort((a, b) => amount(b) - amount(a))[0];
}

export function stellarChecks(surface) {
  const checks = [];
  const account = surface.account;

  if (!account || account.notFound) {
    checks.push({
      id: "AUTHORITY_READABLE",
      label: "Issuer state readable",
      severity: "block",
      passed: false,
      detail: account?.notFound
        ? "No account with that ID exists on the Stellar network, so it issues nothing and no authority claim can be made about it."
        : surface.unreadable.join("; ") ||
          "The issuer account could not be read from Horizon, so no authority claim can be made about it.",
    });
    return checks;
  }

  const flags = account.flags ?? {};
  const signers = Array.isArray(account.signers) ? account.signers : [];
  const t = account.thresholds ?? {};
  const low = minimumSigners(signers, t.low_threshold);
  const med = minimumSigners(signers, t.med_threshold);
  const high = minimumSigners(signers, t.high_threshold);
  const canLow = Number.isFinite(low);
  const canMed = Number.isFinite(med);
  const canHigh = Number.isFinite(high);
  const locked = Boolean(flags.auth_immutable);
  const canReenable = !locked && canHigh;

  /* ── Freeze (revoke authorization) ── */
  checks.push({
    id: "FREEZE_SURRENDERED",
    label: "Freeze permanently surrendered",
    severity: "warn",
    passed: flags.auth_revocable ? !canLow : !canReenable,
    detail: flags.auth_revocable
      ? canLow
        ? "AUTH_REVOCABLE is set. The issuer can revoke any holder's authorization, freezing their balance, at any time and without notice (SetTrustLineFlags, low threshold)."
        : "AUTH_REVOCABLE is set, but the account's signers cannot reach even the low threshold, so no transaction can be signed and the power can never be used."
      : locked
        ? "AUTH_REVOCABLE is clear and AUTH_IMMUTABLE is set, so it can never be turned on. The issuer cannot freeze holders."
        : canReenable
          ? "AUTH_REVOCABLE is clear today, but AUTH_IMMUTABLE is not set and the signers can reach the high threshold, so the issuer can turn freezing on with one SetOptions transaction."
          : "AUTH_REVOCABLE is clear, and the signers cannot reach the high threshold needed to change it. The issuer cannot freeze holders.",
  });

  /* ── Clawback ── */
  checks.push({
    id: "CLAWBACK_SURRENDERED",
    label: "Clawback not available to the issuer",
    severity: "warn",
    passed: flags.auth_clawback_enabled ? !canMed : !canReenable,
    detail: flags.auth_clawback_enabled
      ? canMed
        ? "AUTH_CLAWBACK_ENABLED is set. Trust lines opened while it is set can have their balances taken back by the issuer at any time (Clawback, medium threshold)."
        : "AUTH_CLAWBACK_ENABLED is set, but the signers cannot reach the medium threshold the Clawback operation needs, so the power can never be used."
      : (locked || !canHigh
          ? "AUTH_CLAWBACK_ENABLED is clear and cannot be turned on."
          : "AUTH_CLAWBACK_ENABLED is clear today, but AUTH_IMMUTABLE is not set and the signers can reach the high threshold, so the issuer can turn clawback on for trust lines opened afterwards.") +
        " Trust lines opened while it was set, if it ever was, keep clawback; individual lines are not checked here.",
  });

  /* ── Permissioned holding ── */
  checks.push({
    id: "OPEN_HOLDING",
    label: "Holding does not require issuer permission",
    severity: "warn",
    passed: !flags.auth_required,
    detail: flags.auth_required
      ? "AUTH_REQUIRED is set. The issuer approves each holder individually, so who may hold this asset is the issuer's decision."
      : "AUTH_REQUIRED is clear. Any account may open a trust line and hold the asset without the issuer's approval.",
  });

  /* ── Who signs ── */
  const signing = signers.filter((s) => Number(s.weight) > 0);
  checks.push({
    id: "NO_UNILATERAL_SIGNER",
    label: "No single key controls the issuer",
    severity: "block",
    // Medium governs issuing more and clawing back: the powers a single
    // key would hold over holders' balances.
    passed: med !== 1,
    detail: !canMed
      ? `The signers cannot reach the medium threshold (${t.med_threshold ?? 0}). The account can never issue more of its assets or claw any back.`
      : med === 1
        ? `One signer reaches the medium threshold (${t.med_threshold ?? 0}) alone, so a single key can issue more and, where enabled, claw back. ${plural(signing.length, "signer has", "signers have")} weight.`
        : `${med} of ${signing.length} signers must agree to reach the medium threshold (${t.med_threshold ?? 0}) needed to issue more or claw back. Changing flags or signers needs ${Number.isFinite(high) ? high : "more than all of them"} (high threshold ${t.high_threshold ?? 0}).`,
  });

  return checks;
}

/* ── Certificate ──────────────────────────────────────────────────── */

export async function stellarCertificateFrom(surface, { asset: code } = {}) {
  const checks = stellarChecks(surface);
  const verdict = verdictFor(checks, { unreadable: surface.unreadable });
  const asset = primaryAsset(surface.assets, code);
  const digest = await digestOf({
    kind: "stellar-authority",
    subject: surface.issuer,
    scope: {
      network: "stellar-pubnet",
      asset: asset?.asset_code ?? "",
      ledgerIndex: surface.ledgerIndex,
      verdict,
      source: "horizon",
      rules: STELLAR_RULES_VERSION,
    },
    checks,
    evaluatedAt: surface.readAt,
  });

  return {
    network: "stellar-pubnet",
    verdict,
    issuer: surface.issuer,
    homeDomain: surface.account?.home_domain || undefined,
    asset: asset
      ? {
          code: asset.asset_code,
          // Trust lines, not holders: Horizon counts authorized lines,
          // including ones with a zero balance.
          trustLinesAuthorized: Number(asset.accounts?.authorized ?? 0),
          trustLinesNotAuthorized: Number(asset.accounts?.unauthorized ?? 0),
          amountHeld: asset.balances?.authorized,
          amountInLiquidityPools: asset.liquidity_pools_amount,
        }
      : undefined,
    assetsIssued: surface.assets ? surface.assets.length : undefined,
    assetsTruncated: surface.assetsTruncated || undefined,
    checks,
    digest,
    ledgerIndex: surface.ledgerIndex,
    ledgerClosedAt: surface.ledgerClosedAt,
    evaluatedAt: surface.readAt,
    source: "horizon",
    sourceUrl: HORIZON,
    rulesVersion: STELLAR_RULES_VERSION,
    unreadable: surface.unreadable.length > 0 ? surface.unreadable : undefined,
    disclaimer:
      "Ledger facts about authority retained by this Stellar issuer at the stated ledger, read from Horizon. Not a score, and not a determination that any asset is or is not decentralised, a security, or compliant with any statute.",
  };
}
