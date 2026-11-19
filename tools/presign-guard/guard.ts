/**
 * NOSHASHI Pre-Sign Guard: the decision, as a pure function.
 *
 * The Fireblocks API Co-signer asks the institution's Callback Handler
 * before it signs (POST /v2/tx_sign_request); the handler answers APPROVE,
 * REJECT or RETRY. This file turns one such request, plus facts read from
 * the XRP Ledger (ledger.ts), into that answer and a receipt. It does no
 * I/O, so every rule here is tested against real requests and real ledger
 * replies (tests/presign-guard.test.ts).
 *
 * What it checks, in order:
 *  1. That what is about to be signed is what Fireblocks shows. The signing
 *     hash is recomputed from the transaction (rawTx, or the XRP SDK's
 *     unhashedTxPayload) and compared with the hash the Co-signer will sign,
 *     and the destination, tag and amount are compared with Fireblocks'
 *     own fields.
 *  2. The transaction type: key and signer changes, account deletion and
 *     disabling the master key are refused unless the policy allows them.
 *  3. The destination: sanctions and the scam registry three hops back,
 *     lookalike addresses, fresh accounts, a missing required tag
 *     (screenWithdrawal, shared with the app and the watcher).
 *  4. Every issued-token amount: the issuer must be the one the policy
 *     accepts for that ticker (a counterfeit uses the same ticker from
 *     another issuer), and must not be globally frozen.
 *  5. The ledger's own answer: the transaction is simulated on two
 *     independent servers, and one that would fail is not signed.
 */
import { createHash } from "node:crypto";
import codec from "ripple-binary-codec";
import { screenWithdrawal, type FundingHop, type SanctionEntry, type ThreatEntry, type ScreeningFinding } from "../../supabase/functions/_shared/xrplEvents.ts";

export const RECEIPT_VERSION = "presign-guard/1";

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>;

export type Action = "APPROVE" | "REJECT" | "RETRY";

export type Policy = {
  /** Your name for this policy, recorded in every receipt. */
  version: string;
  /** observe: always APPROVE and record what enforce would have done. Run this first. */
  mode: "enforce" | "observe";
  /** Fireblocks asset IDs that settle on the XRP Ledger, e.g. ["XRP"] or ["XRP_TEST"]. */
  xrplAssets: string[];
  /** What to answer for assets on other chains, which this guard does not inspect. */
  otherAssets: "approve" | "reject";
  /** What to answer on /v2/config_change_sign_request. */
  configChanges: "approve" | "reject" | "ignore";
  /** Your vault accounts' XRPL addresses. A transaction from any other account is refused. Empty: not checked. */
  sourceAccounts: string[];
  /** Transaction types that may be signed at all. */
  allowedTypes: string[];
  /** SetRegularKey, SignerListSet, AccountDelete and disabling the master key. Even when listed in allowedTypes. */
  allowKeyChanges: boolean;
  /** Issuers accepted per ticker, e.g. { "RLUSD": ["rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De"] }. */
  acceptedIssuers: Record<string, string[]>;
  /** Tokens whose ticker is not in acceptedIssuers. */
  unlistedTokens: "approve" | "reject";
  /** Destinations you have paid before: a lookalike of one is address poisoning. */
  knownDestinations: string[];
  /** Findings that warrant a person's look (a brand-new destination, deposit authorisation). The Co-signer cannot hand over to a person, so this decides. */
  onReview: "approve" | "reject";
  /** Refuse when the exact transaction cannot be seen (no rawTx and no unhashedTxPayload). */
  requireExactTransaction: boolean;
};

const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const ENUMS: Record<string, string[]> = {
  mode: ["enforce", "observe"],
  otherAssets: ["approve", "reject"],
  configChanges: ["approve", "reject", "ignore"],
  unlistedTokens: ["approve", "reject"],
  onReview: ["approve", "reject"],
};

/** Read a policy file. Every field is required: a missing one is a refusal to start, never a default. */
export function loadPolicy(raw: unknown): Policy {
  const p = raw as Json;
  if (!p || typeof p !== "object") throw new Error("The policy is not a JSON object.");
  const missing = ["version", "mode", "xrplAssets", "otherAssets", "configChanges", "sourceAccounts", "allowedTypes", "allowKeyChanges", "acceptedIssuers", "unlistedTokens", "knownDestinations", "onReview", "requireExactTransaction"].filter((k) => p[k] === undefined);
  if (missing.length) throw new Error(`The policy is missing: ${missing.join(", ")}.`);
  for (const [k, values] of Object.entries(ENUMS)) if (!values.includes(p[k])) throw new Error(`policy.${k} must be one of ${values.join(", ")}.`);
  for (const k of ["xrplAssets", "sourceAccounts", "allowedTypes", "knownDestinations"]) {
    if (!Array.isArray(p[k]) || p[k].some((v: unknown) => typeof v !== "string")) throw new Error(`policy.${k} must be a list of strings.`);
  }
  for (const k of ["sourceAccounts", "knownDestinations"]) {
    const bad = (p[k] as string[]).find((a) => !ADDRESS.test(a));
    if (bad) throw new Error(`policy.${k} has an invalid address: ${bad}.`);
  }
  for (const [ticker, issuers] of Object.entries((p.acceptedIssuers ?? {}) as Json)) {
    if (!Array.isArray(issuers) || !issuers.length || issuers.some((a) => !ADDRESS.test(String(a)))) throw new Error(`policy.acceptedIssuers.${ticker} must be a non-empty list of addresses.`);
  }
  if (typeof p.allowKeyChanges !== "boolean" || typeof p.requireExactTransaction !== "boolean") throw new Error("policy.allowKeyChanges and policy.requireExactTransaction must be true or false.");
  if (!p.xrplAssets.length) throw new Error("policy.xrplAssets is empty: name the Fireblocks asset IDs on the XRP Ledger.");
  return p as Policy;
}

// ── 1. What is about to be signed ────────────────────────────────────

export type Finding = { id: string; severity: "critical" | "retry" | "warn" | "info"; title: string; detail: string };

export type Seen = {
  /** The XRPL transaction, as decoded. */
  tx: Json;
  /** SHA-512Half of the signing serialisation: what the Co-signer signs. Null when only Fireblocks' fields were available. */
  signingHash: string | null;
  /** Where the transaction came from. */
  source: "rawTx" | "unhashedTxPayload" | "fields";
};

const sha512Half = (hex: string) => createHash("sha512").update(Buffer.from(hex, "hex")).digest().subarray(0, 32).toString("hex").toUpperCase();
/** The hash an XRPL single signature covers. */
export const signingHash = (tx: Json) => sha512Half(codec.encodeForSigning(tx));
const SIGNING_PREFIX = "53545800";

function decodeBlob(hex: string): Json {
  const clean = hex.replace(/^0x/i, "");
  if (!/^[0-9a-f]+$/i.test(clean) || clean.length % 2) throw new Error("not hex");
  return codec.decode(clean.toUpperCase().startsWith(SIGNING_PREFIX) ? clean.slice(SIGNING_PREFIX.length) : clean) as Json;
}

/** XRP drops from a decimal XRP string, or null if it has more than 6 decimals or is not a number. */
export function xrpToDrops(value: unknown): string | null {
  const m = String(value ?? "").trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  const frac = (m[2] ?? "").replace(/0+$/, "");
  if (frac.length > 6) return null;
  const drops = (m[1] + frac.padEnd(6, "0")).replace(/^0+(?=\d)/, "");
  return drops;
}

export type Extracted = { kind: "other" } | ({ kind: "xrpl"; findings: Finding[] } & (Seen | { tx: null; signingHash: null; source: null }));

/**
 * Find the XRPL transaction in a tx_sign_request and prove it is the one
 * being signed. A request for another chain's asset is "other".
 */
export function extract(req: Json, policy: Policy): Extracted {
  const extra = (req.extraParameters ?? {}) as Json;
  const unhashed = extra.unhashedTxPayload as Json | undefined;
  const isXrpl = policy.xrplAssets.includes(String(req.asset ?? "")) || (unhashed && typeof unhashed === "object");
  if (!isXrpl) return { kind: "other" };

  const findings: Finding[] = [];
  const candidates: Array<Seen & { claimed: string | null }> = [];

  // The XRP SDK's raw-signing path: the payload, and the hash it will sign.
  if (unhashed && typeof unhashed === "object") {
    const messages = ((extra.rawMessageData ?? {}) as Json).messages as Json[] | undefined;
    if (Array.isArray(messages) && messages.length > 1) {
      findings.push({ id: "several_messages", severity: "critical", title: "One request signs several messages", detail: `rawMessageData carries ${messages.length} messages, but unhashedTxPayload describes one transaction. The others cannot be reviewed.` });
    }
    try {
      candidates.push({ tx: unhashed, signingHash: signingHash(unhashed), source: "unhashedTxPayload", claimed: messages?.[0]?.content ? String(messages[0].content).toUpperCase() : null });
    } catch (e) {
      findings.push({ id: "payload_unreadable", severity: "critical", title: "The transaction payload cannot be serialised", detail: `unhashedTxPayload is not a valid XRPL transaction (${(e as Error).message}).` });
    }
  }

  // Fireblocks' rawTx (an opt-in): the bytes sent to the ledger, and the hash signed.
  const raws = Array.isArray(req.rawTx) ? (req.rawTx as Json[]) : [];
  if (raws.length > 1) findings.push({ id: "several_raw_tx", severity: "critical", title: "One request signs several XRPL transactions", detail: `rawTx lists ${raws.length} transactions. Each must be reviewed on its own.` });
  for (const r of raws.slice(0, 1)) {
    try {
      const tx = decodeBlob(String(r.rawTx ?? ""));
      candidates.push({ tx, signingHash: signingHash(tx), source: "rawTx", claimed: r.payload ? String(r.payload).replace(/^0x/i, "").toUpperCase() : null });
    } catch (e) {
      findings.push({ id: "raw_tx_unreadable", severity: "critical", title: "rawTx is not an XRPL transaction", detail: `The bytes to be signed could not be decoded (${(e as Error).message}).` });
    }
  }

  for (const c of candidates) {
    if (c.claimed && c.claimed !== c.signingHash) {
      findings.push({ id: "hash_mismatch", severity: "critical", title: "The hash being signed is not this transaction's", detail: `${c.source} hashes to ${c.signingHash}, but the Co-signer was asked to sign ${c.claimed}. What would be signed is not what is shown.` });
    }
  }
  const hashes = new Set(candidates.map((c) => c.signingHash));
  if (hashes.size > 1) findings.push({ id: "conflicting_payloads", severity: "critical", title: "rawTx and unhashedTxPayload describe different transactions", detail: [...hashes].join(" vs ") });

  let seen: Seen | null = candidates.find((c) => c.source === "rawTx") ?? candidates[0] ?? null;
  if (!seen) {
    // Only Fireblocks' summary fields: a plain XRP transfer without rawTx enabled.
    const drops = String(req.asset ?? "").startsWith("XRP") ? xrpToDrops(req.amountStr) : null;
    if (req.destAddress && drops) {
      const tag = (req.destinations as Json[] | undefined)?.[0]?.dstTag;
      seen = { tx: { TransactionType: "Payment", Destination: String(req.destAddress), Amount: drops, ...(tag !== undefined && tag !== null && tag !== "" ? { DestinationTag: Number(tag) } : {}) }, signingHash: null, source: "fields" };
    }
    findings.push({
      id: "transaction_not_visible",
      severity: policy.requireExactTransaction ? "critical" : "warn",
      title: "The exact transaction is not visible",
      detail: "The request carries neither rawTx nor unhashedTxPayload, so the bytes to be signed cannot be checked; only Fireblocks' destination and amount fields were screened. Ask Fireblocks Support to enable rawTx for the workspace.",
    });
    if (!seen) return { kind: "xrpl", tx: null, signingHash: null, source: null, findings };
  } else {
    findings.push(...crossCheck(seen.tx, req));
  }
  return { kind: "xrpl", ...seen, findings };
}

/** What Fireblocks shows (destination, tag, amount) against what is signed. */
export function crossCheck(tx: Json, req: Json): Finding[] {
  const out: Finding[] = [];
  if (req.destAddress && tx.Destination && String(req.destAddress) !== String(tx.Destination)) {
    out.push({ id: "destination_mismatch", severity: "critical", title: "The signed destination is not the one Fireblocks shows", detail: `Fireblocks shows ${req.destAddress}; the transaction pays ${tx.Destination}.` });
  }
  const tag = (req.destinations as Json[] | undefined)?.[0]?.dstTag;
  if (tag !== undefined && tag !== null && tag !== "" && tx.TransactionType === "Payment" && String(tx.DestinationTag ?? "") !== String(tag)) {
    out.push({ id: "tag_mismatch", severity: "critical", title: "The signed destination tag is not the one Fireblocks shows", detail: `Fireblocks shows tag ${tag}; the transaction carries ${tx.DestinationTag ?? "none"}.` });
  }
  if (tx.TransactionType === "Payment" && typeof tx.Amount === "string" && String(req.asset ?? "").startsWith("XRP")) {
    const shown = [xrpToDrops(req.amountStr), xrpToDrops(req.requestedAmountStr)].filter(Boolean);
    if (shown.length && !shown.includes(tx.Amount)) {
      out.push({ id: "amount_mismatch", severity: "critical", title: "The signed amount is not the one Fireblocks shows", detail: `Fireblocks shows ${req.amountStr ?? req.requestedAmountStr} XRP; the transaction sends ${Number(tx.Amount) / 1e6} XRP (${tx.Amount} drops).` });
    }
  }
  return out;
}

// ── 2-5. The checks ──────────────────────────────────────────────────

/** Facts read from validated ledgers for one transaction (ledger.ts). */
export type Facts = {
  ledgerIndex: number;
  reserveBaseXrp: number;
  /** account_info of the destination (the result object), null when it does not exist. Undefined when the transaction has none. */
  destinationInfo?: Json | null;
  chain?: FundingHop[];
  /** null: the list could not be read. */
  sanctions: Record<string, SanctionEntry> | null;
  threats: Record<string, ThreatEntry> | null;
  /** account_info of each issuer named in the transaction; null when unread. */
  issuers: Record<string, Json | null>;
  /** simulate on each server. */
  simulations: Array<{ server: string; engineResult?: string; message?: string; ledgerIndex?: number; error?: string }>;
};

const KEY_CHANGES = new Set(["SetRegularKey", "SignerListSet", "AccountDelete"]);
const ASF_DISABLE_MASTER = 4;
const LSF_GLOBAL_FREEZE = 0x00400000;
const AMOUNT_FIELDS = ["Amount", "SendMax", "DeliverMin", "TakerGets", "TakerPays", "LimitAmount"];

/** A currency code as people write it: 3-letter codes as is, 40-hex codes as their ASCII when printable. */
export function ticker(code: string): string {
  if (/^[0-9A-F]{40}$/i.test(code) && !code.startsWith("00")) {
    const text = Buffer.from(code, "hex").toString("latin1").replace(/\0+$/, "");
    if (/^[\x20-\x7E]+$/.test(text)) return text;
  }
  return code;
}

/** Issued-token amounts named anywhere in the transaction. */
export function issuedAmounts(tx: Json): Array<{ field: string; currency: string; issuer: string; value: string }> {
  const out: Array<{ field: string; currency: string; issuer: string; value: string }> = [];
  for (const f of AMOUNT_FIELDS) {
    const a = tx[f];
    if (a && typeof a === "object" && a.issuer && a.currency) out.push({ field: f, currency: String(a.currency), issuer: String(a.issuer), value: String(a.value) });
  }
  return out;
}

/** The accounts ledger.ts must read for this transaction. */
export function accountsToRead(tx: Json): { destination: string | null; issuers: string[] } {
  const destination = typeof tx.Destination === "string" && ADDRESS.test(tx.Destination) ? tx.Destination : null;
  return { destination, issuers: [...new Set(issuedAmounts(tx).map((a) => a.issuer))] };
}

const fromScreening = (f: ScreeningFinding): Finding => ({ id: f.id, severity: f.severity === "critical" ? "critical" : f.severity === "warn" ? "warn" : "info", title: f.title, detail: f.detail });

export function checks(tx: Json, facts: Facts, policy: Policy): Finding[] {
  const out: Finding[] = [];
  const type = String(tx.TransactionType ?? "");

  if (!policy.allowedTypes.includes(type)) {
    out.push({ id: "type_not_allowed", severity: "critical", title: `${type || "This transaction type"} is not on the policy's list`, detail: `The policy allows ${policy.allowedTypes.join(", ") || "nothing"}.` });
  }
  const disablesMaster = type === "AccountSet" && Number(tx.SetFlag) === ASF_DISABLE_MASTER;
  if ((KEY_CHANGES.has(type) || disablesMaster) && !policy.allowKeyChanges) {
    const what = disablesMaster ? "disables the master key" : type === "SetRegularKey" ? (tx.RegularKey ? `hands signing to ${tx.RegularKey}` : "removes the regular key") : type === "SignerListSet" ? "replaces who can sign for the account" : `deletes the account and sends its XRP to ${tx.Destination}`;
    out.push({ id: "key_change", severity: "critical", title: "This transaction changes who controls the account", detail: `It ${what}. Takeovers of institutional accounts start this way; the policy does not allow it (allowKeyChanges).` });
  }
  if (policy.sourceAccounts.length && tx.Account && !policy.sourceAccounts.includes(String(tx.Account))) {
    out.push({ id: "unknown_source", severity: "critical", title: "The signing account is not one of yours", detail: `${tx.Account} is not in policy.sourceAccounts.` });
  }

  if (facts.destinationInfo !== undefined && typeof tx.Destination === "string") {
    const drops = typeof tx.Amount === "string" ? Number(tx.Amount) : null;
    const screening = screenWithdrawal({
      destination: tx.Destination,
      destinationTag: tx.DestinationTag === undefined ? null : Number(tx.DestinationTag),
      amountXrp: drops === null ? null : drops / 1e6,
      destinationInfo: facts.destinationInfo,
      chain: facts.chain ?? [{ account: tx.Destination, fundedBy: null, activatedLedger: null }],
      currentLedger: facts.ledgerIndex,
      reserveBaseXrp: facts.reserveBaseXrp,
      sanctions: facts.sanctions ?? {},
      threats: facts.threats ?? {},
      previousDestinations: policy.knownDestinations,
      ownAddresses: policy.sourceAccounts,
    });
    out.push(...screening.findings.map(fromScreening));
    if (facts.sanctions === null) out.push({ id: "sanctions_unread", severity: "retry", title: "The sanctions list could not be read", detail: "Whether the destination or its funders are on the OFAC SDN list is unknown, so it is not signed yet." });
    if (facts.threats === null) out.push({ id: "registry_unread", severity: "retry", title: "The scam registry could not be read", detail: "Asked again on retry." });
  }

  for (const a of issuedAmounts(tx)) {
    const name = ticker(a.currency);
    const accepted = policy.acceptedIssuers[name] ?? policy.acceptedIssuers[a.currency];
    if (accepted && !accepted.includes(a.issuer)) {
      out.push({ id: "counterfeit_issuer", severity: "critical", title: `${name} from an issuer you do not accept`, detail: `${a.field} names ${name} issued by ${a.issuer}. The policy accepts ${name} only from ${accepted.join(", ")}. Lookalike tokens reuse a real ticker under another issuer.` });
    } else if (!accepted && policy.unlistedTokens === "reject") {
      out.push({ id: "unlisted_token", severity: "critical", title: `${name} is not a token the policy lists`, detail: `${a.field} names ${name} issued by ${a.issuer}. Add it to policy.acceptedIssuers to allow it.` });
    }
    const info = facts.issuers[a.issuer];
    if (info === null || info === undefined) {
      out.push({ id: `issuer_unread_${a.issuer}`, severity: "retry", title: `The issuer of ${name} could not be read`, detail: a.issuer });
    } else if ((Number(info.account_data?.Flags ?? 0) & LSF_GLOBAL_FREEZE) !== 0) {
      out.push({ id: "issuer_frozen", severity: "critical", title: `The issuer has frozen all ${name}`, detail: `${a.issuer} has Global Freeze set at ledger ${facts.ledgerIndex}: ${name} cannot move except back to the issuer.` });
    }
  }

  out.push(...simulationFindings(facts.simulations));
  return out;
}

/**
 * Two independent servers must agree. tes: it would succeed. tec, tef and
 * tem: it would fail or be malformed, so it is not signed. ter and tel
 * depend on the moment (a sequence ahead of the account because other
 * transactions are in flight, a full queue), so they are noted, not refused.
 */
export function simulationFindings(sims: Facts["simulations"]): Finding[] {
  const answered = sims.filter((s) => s.engineResult);
  if (answered.length < 2) {
    return [{ id: "simulation_unavailable", severity: "retry", title: "The transaction could not be simulated on two servers", detail: sims.map((s) => `${s.server}: ${s.engineResult ?? s.error ?? "no answer"}`).join("; ") }];
  }
  const results = new Set(answered.map((s) => s.engineResult));
  if (results.size > 1) {
    return [{ id: "simulation_disagrees", severity: "retry", title: "The servers disagree on the outcome", detail: answered.map((s) => `${s.server}: ${s.engineResult} at ledger ${s.ledgerIndex ?? "?"}`).join("; ") }];
  }
  const [r] = [...results] as string[];
  const where = answered.map((s) => `${s.server}${s.ledgerIndex ? ` at ledger ${s.ledgerIndex}` : ""}`).join(" and ");
  if (r.startsWith("tes")) return [{ id: "simulated_ok", severity: "info", title: "The ledger would accept it", detail: `${r} on ${where}.` }];
  if (/^te[cfm]/.test(r)) return [{ id: "would_fail", severity: "critical", title: `The ledger would refuse it: ${r}`, detail: `${answered[0].message ?? r} (${where}). Signing it would spend the fee for nothing or reveal a malformed request.` }];
  return [{ id: "simulation_transient", severity: "info", title: `The ledger answered ${r} for now`, detail: `${answered[0].message ?? r} (${where}). Not a failure of the transaction itself.` }];
}

// ── The answer and its receipt ───────────────────────────────────────

export type Decision = {
  action: Action;
  /** What enforce mode decided, also in observe mode. */
  enforced: Action;
  rejectionReason?: string;
  findings: Finding[];
  receipt: Json;
  receiptHash: string;
};

/** JSON with sorted keys, so the same receipt always hashes the same. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as Json).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Json)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function decide(req: Json, findings: Finding[], policy: Policy, context: { seen: Pick<Seen, "signingHash" | "source"> | null; ledgerIndex: number | null; policyHash: string; decidedAt: string; tx?: Json | null }): Decision {
  const critical = findings.filter((f) => f.severity === "critical");
  const retry = findings.filter((f) => f.severity === "retry");
  const warn = findings.filter((f) => f.severity === "warn");
  let enforced: Action = "APPROVE";
  let reason: string | undefined;
  if (critical.length) {
    enforced = "REJECT";
    reason = critical.map((f) => f.title).join("; ");
  } else if (retry.length) {
    enforced = "RETRY";
  } else if (warn.length && policy.onReview === "reject") {
    enforced = "REJECT";
    reason = `Needs review: ${warn.map((f) => f.title).join("; ")}`;
  }
  const action: Action = policy.mode === "observe" ? "APPROVE" : enforced;
  const receipt = {
    version: RECEIPT_VERSION,
    requestId: String(req.requestId ?? ""),
    txId: String(req.txId ?? ""),
    asset: String(req.asset ?? ""),
    signingHash: context.seen?.signingHash ?? null,
    seenFrom: context.seen?.source ?? null,
    transactionType: context.tx?.TransactionType ?? null,
    account: context.tx?.Account ?? null,
    destination: context.tx?.Destination ?? null,
    action,
    enforced,
    mode: policy.mode,
    findings: findings.map((f) => ({ id: f.id, severity: f.severity })),
    ledgerIndex: context.ledgerIndex,
    policyVersion: policy.version,
    policyHash: context.policyHash,
    decidedAt: context.decidedAt,
  };
  return { action, enforced, rejectionReason: action === "REJECT" ? reason?.slice(0, 500) : undefined, findings, receipt, receiptHash: sha256(canonical(receipt)) };
}
