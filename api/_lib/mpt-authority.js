/*
 * What the issuer of a Multi-Purpose Token (MPT, XLS-33) can do to the
 * people holding it, read from validated ledger state.
 *
 * MPTs are the XRPL's newer token type. Their powers are not on the
 * issuer's account, as they are for trust-line tokens: each issuance
 * carries its own flags. A single issuer can hold many issuances with
 * different powers, so every issuance is read and reported on its own.
 *
 * Read only: account_info for who controls the issuer's keys,
 * account_objects (type mpt_issuance, every page) for the issuances, or
 * ledger_entry for one issuance by its 48-hex-character ID.
 *
 * Pure except readMptAuthority(), which does the ledger reads.
 */

import { rippleRpc, ADDRESS_RE, regularKeyCanSign, signerListOf, minimumSignersForQuorum } from "./authority.js";

export const MPT_SCHEMA = "noshashi.mpt-authority.v1";

/** MPTokenIssuance ledger flags, as rippled defines them (XLS-33). */
export const MPT_FLAGS = {
  locked: 0x00000001,
  canLock: 0x00000002,
  requireAuth: 0x00000004,
  canEscrow: 0x00000008,
  canTrade: 0x00000010,
  canTransfer: 0x00000020,
  canClawback: 0x00000040,
};

const LSF_DISABLE_MASTER = 0x00100000;

export const MPT_ID_RE = /^[0-9A-Fa-f]{48}$/;

const ALPHABET = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";

/** The 20-byte AccountID behind a classic address, as 40 hex characters. */
export function accountIdHex(address) {
  let n = 0n;
  for (const c of address) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error("Not an XRPL classic address");
    n = n * 58n + BigInt(i);
  }
  const hex = n.toString(16).padStart(50, "0");
  return hex.slice(2, 42).toUpperCase();
}

/**
 * An MPTokenIssuanceID: the issuing transaction's sequence (4 bytes, big
 * endian) followed by the issuer's AccountID (20 bytes). XLS-33.
 */
export function issuanceIdOf(sequence, issuer) {
  return Number(sequence).toString(16).padStart(8, "0").toUpperCase() + accountIdHex(issuer);
}

/** The issuer's metadata (XLS-89 JSON, hex encoded), decoded when it is printable JSON. */
export function decodeMetadata(hex) {
  if (typeof hex !== "string" || !/^[0-9A-Fa-f]*$/.test(hex) || hex.length % 2) return null;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16)));
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** A short name for the issuance, from its own metadata, or null. */
function nameOf(meta) {
  if (!meta) return null;
  const ticker = meta.ticker ?? meta.t;
  const name = meta.name ?? meta.n;
  const parts = [ticker, name].filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim());
  return [...new Set(parts)].join(" · ") || null;
}

/** A raw integer amount (a string on the ledger) at the issuance's asset scale. */
function scaled(raw, scale) {
  if (raw === undefined || raw === null) return null;
  const n = BigInt(String(raw));
  const s = Number(scale ?? 0);
  if (!s) return n.toString();
  const text = n.toString().padStart(s + 1, "0");
  return `${text.slice(0, -s)}.${text.slice(-s)}`.replace(/\.?0+$/, "");
}

/**
 * One MPTokenIssuance ledger entry to the facts a holder cares about.
 * Every power is stated as a yes/no read from the flags, with what it
 * means in plain words.
 */
export function issuanceFacts(entry) {
  const flags = Number(entry.Flags ?? 0);
  const has = (bit) => (flags & bit) !== 0;
  const meta = decodeMetadata(entry.MPTokenMetadata);
  const fee = Number(entry.TransferFee ?? 0);
  const powers = [
    {
      id: "CAN_CLAWBACK",
      label: "Can the issuer take tokens back?",
      retained: has(MPT_FLAGS.canClawback),
      means: has(MPT_FLAGS.canClawback)
        ? "Yes. The issuer can claw tokens back from any holder."
        : "No. This issuance was created without clawback, and that cannot be added later.",
    },
    {
      id: "CAN_LOCK",
      label: "Can the issuer freeze holders?",
      retained: has(MPT_FLAGS.canLock),
      means: has(MPT_FLAGS.canLock)
        ? "Yes. The issuer can lock any one holder, or every holder at once."
        : "No. This issuance was created without the power to lock holders.",
    },
    {
      id: "REQUIRE_AUTH",
      label: "Does holding need the issuer's approval?",
      retained: has(MPT_FLAGS.requireAuth),
      means: has(MPT_FLAGS.requireAuth)
        ? "Yes. Each holder must be approved by the issuer before they can hold it."
        : "No. Anyone can hold it without asking the issuer.",
    },
    {
      id: "TRANSFERABLE",
      label: "Can holders send it to each other?",
      retained: !has(MPT_FLAGS.canTransfer),
      means: has(MPT_FLAGS.canTransfer)
        ? "Yes. Holders can send it to anyone, not only back to the issuer."
        : "No. Holders can only send it back to the issuer.",
    },
  ];
  return {
    mpt_issuance_id:
      entry.mpt_issuance_id ?? entry.MPTokenIssuanceID ?? (entry.Sequence !== undefined && entry.Issuer ? issuanceIdOf(entry.Sequence, entry.Issuer) : null),
    name: nameOf(meta),
    issuer: entry.Issuer,
    locked_now: has(MPT_FLAGS.locked),
    can_trade: has(MPT_FLAGS.canTrade),
    can_escrow: has(MPT_FLAGS.canEscrow),
    transfer_fee_percent: fee ? fee / 1000 : 0,
    asset_scale: Number(entry.AssetScale ?? 0),
    outstanding: scaled(entry.OutstandingAmount ?? "0", entry.AssetScale),
    maximum: entry.MaximumAmount !== undefined ? scaled(entry.MaximumAmount, entry.AssetScale) : null,
    // Held in escrow (or otherwise locked by the ledger) out of what is outstanding.
    locked_amount: entry.LockedAmount !== undefined ? scaled(entry.LockedAmount, entry.AssetScale) : null,
    powers,
    retained_powers: powers.filter((p) => p.retained && p.id !== "TRANSFERABLE").map((p) => p.id),
    metadata: meta,
    flags,
    // The ledger entry exactly as the server returned it, for the evidence file.
    ledger_entry: entry,
  };
}

/** Who can sign for the issuer, from an account_info reply with signer_lists. */
export function keyControl(info) {
  const data = info.account_data ?? {};
  const masterOn = (Number(data.Flags ?? 0) & LSF_DISABLE_MASTER) === 0;
  const regular = regularKeyCanSign(data.RegularKey);
  const { list, unreadable } = signerListOf(info);
  if (unreadable) return { readable: false, summary: "The signer list could not be read." };
  const signers = (list?.SignerEntries ?? []).map((e) => ({ account: e.SignerEntry.Account, weight: e.SignerEntry.SignerWeight }));
  const quorum = Number(list?.SignerQuorum ?? 0);
  const multisig = signers.length ? minimumSignersForQuorum(signers, quorum) : null;
  const singleKey = masterOn || regular || multisig === 1;
  return {
    readable: true,
    master_key: masterOn ? "enabled" : "disabled",
    regular_key: regular ? data.RegularKey : null,
    signer_list: signers.length ? { signers: signers.length, quorum, keys_needed: multisig } : null,
    single_key: singleKey,
    summary: singleKey
      ? "One key alone can act for this issuer."
      : multisig
        ? `${multisig} of ${signers.length} signers must agree to act for this issuer.`
        : "No key can sign for this issuer.",
  };
}

const PAGE = 400;
const MAX_PAGES = 10;

/**
 * Read an issuer's MPT issuances and key control, or one issuance by ID.
 * Pass `{ issuer }` or `{ id }`.
 */
export async function readMptAuthority({ issuer, id } = {}, { rpc = rippleRpc } = {}) {
  let entries;
  let ledgerIndex = null;
  let complete = true;
  if (id) {
    if (!MPT_ID_RE.test(id)) throw new Error("An MPT issuance ID is 48 hexadecimal characters");
    const reply = await rpc("ledger_entry", { mpt_issuance: id.toUpperCase(), ledger_index: "validated" }, 10000);
    entries = [{ ...reply.node, mpt_issuance_id: id.toUpperCase() }];
    ledgerIndex = reply.ledger_index ?? null;
    issuer = reply.node?.Issuer;
  } else {
    if (!ADDRESS_RE.test(issuer ?? "")) throw new Error("Not an XRPL classic address");
    entries = [];
    let marker;
    let pages = 0;
    do {
      const reply = await rpc("account_objects", { account: issuer, type: "mpt_issuance", limit: PAGE, ledger_index: "validated", ...(marker ? { marker } : {}) }, 10000);
      entries.push(...(reply.account_objects ?? []));
      ledgerIndex ??= reply.ledger_index ?? null;
      marker = reply.marker;
      pages += 1;
    } while (marker && pages < MAX_PAGES);
    complete = !marker;
  }
  const info = await rpc("account_info", { account: issuer, ledger_index: "validated", signer_lists: true }, 10000);
  const issuances = entries.map(issuanceFacts);
  return {
    schema: MPT_SCHEMA,
    issuer,
    ledger_index: ledgerIndex ?? info.ledger_index ?? null,
    read_at: new Date().toISOString(),
    key_control: keyControl(info),
    issuances,
    coverage: {
      complete,
      note: complete ? "Every MPT issuance this account holds was read." : `The first ${PAGE * MAX_PAGES} objects were read; this account has more.`,
    },
  };
}
