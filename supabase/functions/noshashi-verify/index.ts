/**
 * noshashi-verify — the Compliance API.
 *
 * The server-side twin of the console's policy engine (src/lib/policy.ts).
 * It answers the same question the UI asks on every settlement:
 *
 *   "Given this subject account, the credentials it holds on-ledger,
 *    and this Permissioned Domain, is this transfer clear to broadcast?"
 *
 * The evaluation rules are a byte-for-byte mirror of the client engine so
 * a verdict never differs between the app and the API. The only things
 * this function adds are authentication, entitlement and prepaid credit
 * enforcement, and an audit event row.
 *
 * Auth:    Authorization: Bearer nsh_live_…
 *          The key is hashed with SHA-256 and looked up in noshashi.api_keys
 *          (revoked keys are refused). Losing the database leaks no key.
 * Billing: One verification draws one credit from
 *          noshashi.entitlements.verification_quota. The decrement is a
 *          guarded UPDATE so concurrent calls can never overspend.
 * Ledger:  Reads account_info + credential objects straight from public
 *          rippled HTTP (server-side, so CORS is not an issue).
 *
 * Deploy:  supabase functions deploy noshashi-verify
 * Public:  POST https://<project>.supabase.co/functions/v1/noshashi-verify
 */

import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * The service-role client, and its type.
 *
 * Both exist because `ReturnType<typeof createClient>` does not describe
 * what `createClient(url, key)` actually returns. Read off the generic
 * signature rather than off a call, its type parameters fall back to
 * their declared defaults and the schema parameter resolves to `never` —
 * so a client typed that way rejects the very value it was meant to
 * describe, and `.schema("noshashi")` on it is an error because no string
 * is assignable to `never`.
 *
 * Nothing caught this: tsconfig.json includes only `src`, so no build
 * step type-checked this file. `deno check` reported seven errors here,
 * all of them this one cause.
 *
 * Wrapping the call fixes it at the root. `ServiceClient` is the return
 * type of a *call site* with concrete arguments, so it is exactly the
 * type of the value every helper below is handed.
 */
function createServiceClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type ServiceClient = ReturnType<typeof createServiceClient>;

const PUBLISHED_RIPPLE_HTTP = [
  "https://s1.ripple.com:51234/",
  "https://s2.ripple.com:51234/",
];

const ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

/** Largest body this endpoint will read. The contract is three fields. */
const MAX_BODY_BYTES = 4096;

/**
 * Published rate limits, by entitlement tier.
 *
 * Two windows per tier because one number cannot describe both a burst
 * and a sustained rate: a caller allowed 50/sec is not thereby allowed
 * 3,000 every second of every minute. `institution` is the ceiling for a
 * contract that has not negotiated its own; a negotiated limit is set
 * per-account and read from entitlements.
 */
const TIER_LIMITS: Record<string, { perSecond: number; perMinute: number }> = {
  operator:    { perSecond: 2,   perMinute: 30 },
  desk:        { perSecond: 50,  perMinute: 1_500 },
  institution: { perSecond: 200, perMinute: 9_000 },
};

/* ------------------------------------------------------------------ */
/* Address validation                                                  */
/* ------------------------------------------------------------------ */

const BASE58_XRPL = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";

/**
 * Full base58check validation of a classic XRPL address.
 *
 * The regex above only describes the *shape* of an address. It accepts a
 * mistyped character, and a mistyped address is a different, usually
 * unfunded, account. That mattered here more than on the client: this
 * endpoint charges a credit and then adjudicates whatever the caller
 * sent, so a single wrong character produced a billed, digested,
 * audit-logged NO-GO receipt about an account the caller never meant to
 * ask about. The checksum is what distinguishes "this account fails the
 * policy" from "this is not an account".
 *
 * Payload is a one-byte type prefix (0x00 for an AccountID), 20 bytes of
 * account id, and four bytes of double-SHA-256 checksum.
 */
async function isValidClassicAddress(address: string): Promise<boolean> {
  if (!ADDRESS_RE.test(address)) return false;

  // base58 → big-endian bytes, by repeated multiply-and-carry.
  const bytes: number[] = [0];
  for (const char of address) {
    const value = BASE58_XRPL.indexOf(char);
    if (value < 0) return false;
    let carry = value;
    for (let i = bytes.length - 1; i >= 0; i -= 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.unshift(carry & 0xff);
      carry >>= 8;
    }
  }

  // A leading zero byte is not representable in the arithmetic above — it
  // multiplies away — so base58 encodes each one as a leading alphabet[0]
  // character instead. In this alphabet that character is 'r', which is
  // exactly why every classic address begins with one: it *is* the 0x00
  // AccountID type prefix. Count them back on, and drop the zero padding
  // the accumulator started with.
  let encodedZeros = 0;
  while (encodedZeros < address.length && address[encodedZeros] === BASE58_XRPL[0]) {
    encodedZeros += 1;
  }
  let significant = 0;
  while (significant < bytes.length && bytes[significant] === 0) significant += 1;

  const decoded = new Uint8Array(encodedZeros + (bytes.length - significant));
  decoded.set(bytes.slice(significant), encodedZeros);

  if (decoded.length !== 25) return false;
  if (decoded[0] !== 0x00) return false;

  const payload = decoded.slice(0, 21);
  const checksum = decoded.slice(21);
  const first = await crypto.subtle.digest("SHA-256", payload);
  const second = new Uint8Array(await crypto.subtle.digest("SHA-256", first));
  for (let i = 0; i < 4; i += 1) {
    if (second[i] !== checksum[i]) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Policy engine — mirror of src/lib/policy.ts                         */
/* ------------------------------------------------------------------ */

type Status = "go" | "hold" | "no-go";

type CredentialType =
  | "KYC_LEVEL_1"
  | "KYC_LEVEL_2"
  | "ACCREDITED_INVESTOR"
  | "SANCTIONS_CLEARANCE"
  | "PEP_SCREENING"
  | "INSTITUTIONAL_CUSTODY";

type PermissionedDomain = {
  id: string;
  name: string;
  code: string;
  institution: string;
  requirements: CredentialType[];
  transferCeilingXrp: number;
  governance: "active" | "review" | "suspended";
  members: number;
};

/** Reference domain registry — keep in sync with the client registry. */
const DOMAIN_REGISTRY: PermissionedDomain[] = [
  {
    id: "d-dex-us",
    name: "US_REGULATED_DEX",
    code: "DEX-US",
    institution: "Reference Liquidity Pool",
    requirements: ["KYC_LEVEL_1", "SANCTIONS_CLEARANCE"],
    transferCeilingXrp: 250_000,
    governance: "active",
    members: 18_422,
  },
  {
    id: "d-lend-inst",
    name: "INSTITUTIONAL_LENDING",
    code: "LEND-INST",
    institution: "Reference Lending Desk",
    requirements: ["ACCREDITED_INVESTOR", "SANCTIONS_CLEARANCE"],
    transferCeilingXrp: 5_000_000,
    governance: "active",
    members: 4_093,
  },
  {
    id: "d-token-pvt",
    name: "PRIVATE_TOKEN_SALES",
    code: "TOKEN-PVT",
    institution: "Reference Issuance Agent",
    requirements: ["ACCREDITED_INVESTOR", "PEP_SCREENING"],
    transferCeilingXrp: 1_000_000,
    governance: "review",
    members: 1_207,
  },
  {
    id: "d-mint-us",
    name: "STABLECOIN_MINTING",
    code: "MINT-US",
    institution: "Reference Stablecoin Reserve",
    requirements: [
      "KYC_LEVEL_2",
      "ACCREDITED_INVESTOR",
      "SANCTIONS_CLEARANCE",
      "INSTITUTIONAL_CUSTODY",
    ],
    transferCeilingXrp: 0,
    governance: "suspended",
    members: 77,
  },
  {
    id: "d-custody",
    name: "QUALIFIED_CUSTODY",
    code: "CUST-Q",
    institution: "Reference Qualified Custodian",
    requirements: ["KYC_LEVEL_2", "INSTITUTIONAL_CUSTODY"],
    transferCeilingXrp: 20_000_000,
    governance: "active",
    members: 312,
  },
  {
    id: "d-retail",
    name: "RETAIL_SETTLEMENT",
    code: "RTL-OPEN",
    institution: "Open Payments Rail",
    requirements: ["KYC_LEVEL_1"],
    transferCeilingXrp: 10_000,
    governance: "active",
    members: 96_540,
  },
];

function heldCredentialTypes(credentials: Array<Record<string, unknown>>): Set<string> {
  const held = new Set<string>();
  for (const credential of credentials) {
    const accepted = Number(credential.Flags ?? 0) & 0x00010000;
    if (accepted !== 0 && !credential.Revoked) {
      // CredentialType is a variable-length blob and arrives hex-encoded —
      // "KYC_LEVEL_1" reaches us as 4B59435F4C4556454C5F31. The console
      // decodes it in fetchWalletCredentials; this side did not, so the
      // requirement comparison was hex against plain text, never matched,
      // and every credential check failed for subjects who genuinely hold
      // the credential. Decode first, exactly as the client does.
      const raw = String(credential.CredentialType ?? "");
      held.add((decodeHexDomain(raw) ?? raw).toUpperCase());
    }
  }
  return held;
}

function reserveRequirementXrp(ownerCount: number): number {
  return 1 + ownerCount * 0.2;
}

function decodeHexDomain(hex: string): string | undefined {
  try {
    if (!hex) return undefined;
    const bytes = Uint8Array.from(
      hex.match(/.{2}/g)?.map((pair) => parseInt(pair, 16)) ?? []
    );
    const text = new TextDecoder().decode(bytes).trim();
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

/** The full rule set, identical to evaluatePolicy in src/lib/policy.ts. */
function evaluatePolicy(body: {
  account: {
    address: string;
    balanceXrp: string;
    sequence: number;
    ownerCount: number;
    domain?: string;
    unfunded?: boolean;
  } | null;
  credentials: Array<Record<string, unknown>>;
  domain: PermissionedDomain;
  amountXrp: number;
}) {
  const { account, credentials, domain, amountXrp } = body;
  const held = heldCredentialTypes(credentials);
  const balance = account ? Number(account.balanceXrp) : 0;
  const reserve = reserveRequirementXrp(account?.ownerCount ?? 0);
  const spendable = Math.max(0, balance - reserve);

  const checks: Array<{ id: string; label: string; severity: "block" | "warn"; passed: boolean; detail: string }> = [];

  checks.push({
    id: "ACCOUNT_ACTIVATED",
    label: "Account activated on mainnet",
    severity: "block",
    passed: Boolean(account) && (account?.sequence ?? 0) >= 1,
    detail: !account
      ? "No validated account object found for this address."
      : account.unfunded
        ? "Address is well-formed but has never been funded on mainnet."
        : "Account is funded and has a validated sequence number.",
  });

  for (const requirement of domain.requirements) {
    checks.push({
      id: `CREDENTIAL_${requirement}`,
      label: `Holds ${requirement.replace(/_/g, " ").toLowerCase()}`,
      severity: "block",
      passed: held.has(requirement),
      detail: held.has(requirement)
        ? "Credential is accepted on-ledger and not revoked."
        : `Domain ${domain.code} requires an accepted ${requirement} credential.`,
    });
  }

  checks.push({
    id: "RESERVE_SOLVENCY",
    label: "Clears XRPL owner reserve",
    severity: "block",
    passed: balance >= reserve,
    detail: `Reserve requirement is ${reserve.toFixed(1)} XRP for ${account?.ownerCount ?? 0} owned objects.`,
  });

  checks.push({
    id: "SPENDABLE_BALANCE",
    label: "Spendable balance covers transfer",
    severity: "block",
    passed: amountXrp <= spendable,
    detail: `${spendable.toFixed(2)} XRP is spendable after reserve; transfer is ${amountXrp.toFixed(2)} XRP.`,
  });

  if (domain.transferCeilingXrp > 0) {
    checks.push({
      id: "TRANSFER_CEILING",
      label: "Within domain transfer ceiling",
      severity: "block",
      passed: amountXrp <= domain.transferCeilingXrp,
      detail: `${domain.code} caps single settlements at ${domain.transferCeilingXrp.toLocaleString()} XRP.`,
    });
  } else {
    checks.push({
      id: "TRANSFER_CEILING",
      label: "Domain accepts settlements",
      severity: "block",
      passed: false,
      detail: `${domain.code} has no active transfer ceiling — settlement is closed.`,
    });
  }

  checks.push({
    id: "DOMAIN_GOVERNANCE",
    label: "Domain governance is active",
    severity: domain.governance === "suspended" ? "block" : "warn",
    passed: domain.governance === "active",
    detail:
      domain.governance === "active"
        ? "Domain policy set is current and enforced."
        : domain.governance === "review"
          ? "Domain policy is under governance review — settlements are held for manual sign-off."
          : "Domain is suspended by its issuer; no settlements are being enforced.",
  });

  checks.push({
    id: "DOMAIN_ATTESTATION",
    label: "Account publishes a domain attestation",
    severity: "warn",
    passed: Boolean(account?.domain),
    detail: account?.domain
      ? `Attested domain: ${account.domain}`
      : "No Domain field set on the account — attestation strengthens the audit trail.",
  });

  const blocked = checks.some((check) => check.severity === "block" && !check.passed);
  const warned = checks.some((check) => check.severity === "warn" && !check.passed);
  const verdict: Status = blocked ? "no-go" : warned ? "hold" : "go";

  return {
    verdict,
    domainId: domain.id,
    subject: account?.address ?? "unknown",
    amountXrp,
    checks,
    evaluatedAt: new Date().toISOString(),
  };
}

/** Canonical JSON → SHA-256 hex, uppercase — mirror of receiptDigest. */
async function receiptDigest(
  body: ReturnType<typeof evaluatePolicy>
): Promise<string> {
  const canonical = JSON.stringify({
    verdict: body.verdict,
    domainId: body.domainId,
    subject: body.subject,
    amountXrp: body.amountXrp,
    evaluatedAt: body.evaluatedAt,
    checks: body.checks.map((check) => [check.id, check.passed]),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Ledger reads (public rippled JSON-RPC, server-side)                 */
/* ------------------------------------------------------------------ */

/** A refusal from rippled itself, carrying the ledger's own error code. */
class RippledError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "RippledError";
  }
}

async function rippleRpc(command: string, params: Record<string, unknown>): Promise<Record<string, any>> {
  let lastError: Error | null = null;
  for (const endpoint of PUBLISHED_RIPPLE_HTTP) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: command, params: [params] }),
      });
      if (!response.ok) throw new Error(`rippled replied ${response.status}`);
      const payload = (await response.json()) as {
        result?: Record<string, any>;
        error?: string;
        error_message?: string;
      };

      // rippled's HTTP JSON-RPC reports a command error INSIDE `result` —
      // {"result":{"status":"error","error":"actNotFound",...}} — and sends
      // HTTP 200 while doing it. Only the WebSocket API puts the error at
      // the top level. Testing `payload.error` alone therefore saw no error
      // at all: an unknown or unreadable account came back as an empty
      // result, and fetchLedgerAccount below turned that into a real-looking
      // account with a zero balance. The API then adjudicated invented
      // ledger state instead of saying it could not read it.
      const result = payload.result ?? {};
      const code = String(result.error ?? payload.error ?? "");
      if (code) {
        throw new RippledError(
          String(result.error_message ?? payload.error_message ?? code),
          code
        );
      }
      return result;
    } catch (error) {
      // A refusal is the ledger's answer, not a sick node — the next
      // endpoint would only repeat it. Transport failures do get retried.
      if (error instanceof RippledError) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error("Ledger unreachable");
}

async function fetchLedgerAccount(subject: string) {
  try {
    const result = await rippleRpc("account_info", {
      account: subject,
      ledger_index: "validated",
    });
    const data = (result.account_data ?? {}) as Record<string, any>;
    return {
      address: subject,
      balanceXrp: (Number(data.Balance ?? 0) / 1_000_000).toFixed(2),
      sequence: Number(data.Sequence ?? 0),
      ownerCount: Number(data.OwnerCount ?? 0),
      domain: decodeHexDomain(String(data.Domain ?? "")),
      unfunded: false,
    };
  } catch (error) {
    if (error instanceof RippledError && error.code === "actNotFound") {
      // Well-formed but never funded. The console's fetchAccount returns the
      // same shape rather than null, and it has to: `subject` in the receipt
      // body is `account?.address ?? "unknown"`, so returning null here would
      // digest "unknown" on this side and the address on the client's — two
      // different receipts for one set of facts. ACCOUNT_ACTIVATED still
      // refuses it, on both sides, because the sequence is zero.
      return {
        address: subject,
        balanceXrp: "0.00",
        sequence: 0,
        ownerCount: 0,
        domain: undefined,
        unfunded: true,
      };
    }
    throw error;
  }
}

async function fetchLedgerCredentials(subject: string): Promise<Array<Record<string, unknown>>> {
  try {
    const result = await rippleRpc("account_objects", {
      account: subject,
      ledger_index: "validated",
      type: "credential",
      limit: 100,
    });
    return (result.account_objects ?? []) as Array<Record<string, unknown>>;
  } catch {
    return []; // a node without the Credentials amendment has no registry — honest empty answer
  }
}

/* ------------------------------------------------------------------ */
/* Auth + entitlement                                                  */
/* ------------------------------------------------------------------ */

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type ApiKeyAuth = { accountId: string; keyId: string };

/** Why a key was refused. Never returned to the caller — see below. */
type AuthFailure = "malformed" | "unknown" | "revoked" | "expired" | "out_of_scope";

async function authenticate(
  client: ServiceClient,
  authorization: string | null
): Promise<{ auth: ApiKeyAuth } | { failure: AuthFailure }> {
  if (!authorization?.startsWith("Bearer nsh_live_")) return { failure: "malformed" };
  const raw = authorization.slice("Bearer ".length).trim();
  const keyHash = await sha256Hex(raw);

  const { data, error } = await client
    .schema("noshashi")
    .from("api_keys")
    .select("id, account_id, revoked_at, expires_at, scopes")
    .eq("key_hash", keyHash)
    .maybeSingle();
  if (error) throw error;

  if (!data) return { failure: "unknown" };
  if (data.revoked_at) return { failure: "revoked" };

  // Hard expiry. A key handed to a counterparty or an examiner for a
  // defined engagement has to stop working when the engagement ends,
  // without anyone having to remember to revoke it.
  if (data.expires_at && new Date(String(data.expires_at)).getTime() <= Date.now()) {
    return { failure: "expired" };
  }

  // Scopes exist so a key can be narrower than the account. A key issued
  // for a webhook receiver or a usage reader should not be able to spend
  // verification credits just because it authenticates.
  const scopes = (data.scopes as string[] | null) ?? [];
  if (!scopes.includes("verify")) return { failure: "out_of_scope" };

  return { auth: { accountId: String(data.account_id), keyId: String(data.id) } };
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

/**
 * Durable, per-key, tier-aware rate limiting.
 *
 * What this replaces was a Map in module scope keyed on
 * `x-forwarded-for`. Three things were wrong with it and all three are
 * the kind an institutional review finds:
 *
 *   - It was per-instance. Edge Functions scale horizontally and cold
 *     start, so the counter reset whenever the platform felt like it and
 *     never aggregated across concurrent instances. The published limit
 *     was not the enforced limit.
 *   - It was keyed on a caller-supplied header, and checked BEFORE
 *     authentication. Anyone could rotate the header to get a fresh
 *     bucket, and one noisy IP could exhaust a bucket shared with
 *     paying callers behind the same NAT.
 *   - It was one flat 60/minute for everybody, which is neither the
 *     50/sec Pro is sold nor anything an Institutional contract would
 *     accept.
 *
 * The counter now lives in Postgres, keyed on the api_key id, and is
 * taken after the key is known to be good. The IP pre-filter below is
 * kept, but only as a cheap shield on the unauthenticated path.
 */
type RateDecision = { allowed: boolean; limit: number; remaining: number; resetAt: string };

async function takeRate(
  client: ServiceClient,
  keyId: string,
  windowSeconds: number,
  limit: number
): Promise<RateDecision> {
  const { data, error } = await client
    .schema("noshashi")
    .rpc("api_rate_take", {
      p_key: keyId,
      p_window_seconds: windowSeconds,
      p_limit: limit,
    });
  if (error) throw error;
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    allowed: row.allowed === true,
    limit: Number(row.limit ?? limit),
    remaining: Number(row.remaining ?? 0),
    resetAt: String(row.reset_at ?? new Date(Date.now() + windowSeconds * 1000).toISOString()),
  };
}

/**
 * Unauthenticated pre-filter. Deliberately generous: its only job is to
 * keep an unauthenticated flood from reaching the database at all. It is
 * not the enforced limit and is not sold as one.
 */
const PREFILTER_WINDOW_MS = 10_000;
const PREFILTER_MAX = 100;
const prefilter = new Map<string, { count: number; resetAt: number }>();

function prefilterExceeded(request: Request): boolean {
  // x-forwarded-for is a list; the platform appends, so the left-most
  // entry is the closest thing to a client address available here.
  const forwarded = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const key = forwarded || "unattributed";
  const now = Date.now();
  const bucket = prefilter.get(key);

  // Bound the map. Without this a spray of spoofed headers grows it until
  // the instance is evicted for memory.
  if (prefilter.size > 10_000) prefilter.clear();

  if (!bucket || bucket.resetAt < now) {
    prefilter.set(key, { count: 1, resetAt: now + PREFILTER_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > PREFILTER_MAX;
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Headers every response carries.
 *
 * `no-store` is the load-bearing one. A response body here is a
 * compliance verdict about a named account at a named moment; a shared
 * cache holding one and serving it to the next caller would be both a
 * disclosure and a stale adjudication. There is no CORS header by design:
 * this is a server-to-server endpoint, and a browser holding a
 * `nsh_live_` key has already leaked it.
 */
function baseHeaders(requestId: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Request-Id": requestId,
  };
}

function json(
  status: number,
  body: Record<string, unknown>,
  requestId: string,
  extra: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify({ ...body, request_id: requestId }), {
    status,
    headers: { ...baseHeaders(requestId), ...extra },
  });
}

/* ------------------------------------------------------------------ */
/* Request handling                                                    */
/* ------------------------------------------------------------------ */

/**
 * Every response carries a request id, and every refusal is explained in
 * the body rather than by the status code alone.
 *
 * The outer wrapper exists because the handler previously let errors from
 * `authenticate`, the entitlement read and the credit RPC propagate out
 * of the top-level Deno.serve callback. The runtime turns an uncaught
 * throw into a 500 whose body is the platform's own error rendering —
 * which can carry the message and stack of a database error, and which
 * is not JSON, so a caller parsing the documented error envelope gets a
 * parse failure instead of an error. Now: one shape for every outcome,
 * details in the logs, and a correlation id shared by both.
 */
Deno.serve(async (request: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  try {
    return await handle(request, requestId);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        request_id: requestId,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    );
    return json(
      500,
      {
        error: "internal_error",
        message:
          "The request could not be completed. Quote request_id when reporting this.",
      },
      requestId
    );
  }
});

async function handle(request: Request, requestId: string): Promise<Response> {
  const method = request.method.toUpperCase();

  // Cheap shield on the unauthenticated path. Not the published limit.
  if (prefilterExceeded(request)) {
    return json(
      429,
      { error: "rate_limited", message: "Too many unauthenticated requests." },
      requestId,
      { "Retry-After": "10" }
    );
  }

  if (method === "GET") {
    return json(
      200,
      {
        name: "noshashi-verify",
        contract:
          "POST JSON { subject, domain, amount_xrp } with Authorization: Bearer nsh_live_…",
        domains: DOMAIN_REGISTRY.map((domain) => domain.code),
        idempotency: "Send Idempotency-Key to make a retry replay rather than re-charge.",
        published_limits: TIER_LIMITS,
      },
      requestId
    );
  }
  if (method !== "POST") {
    return json(
      405,
      { error: "method_not_allowed", message: "Only GET and POST are supported." },
      requestId,
      { Allow: "GET, POST" }
    );
  }

  const started = performance.now();

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceKey) {
    // The non-null assertions this replaces threw a TypeError deep inside
    // createClient on a misconfigured deploy, which surfaced as an opaque
    // 500 on every request. Say what is wrong, once, in the log.
    console.error(
      JSON.stringify({
        level: "error",
        request_id: requestId,
        message: "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      })
    );
    return json(
      503,
      { error: "not_configured", message: "Service is not configured. This is not your fault." },
      requestId
    );
  }
  const supabase = createServiceClient(projectUrl, serviceKey);

  /* 1. Authenticate the key. ---------------------------------------- */
  const authResult = await authenticate(supabase, request.headers.get("authorization"));
  if ("failure" in authResult) {
    // One message for every failure mode. Distinguishing "revoked" from
    // "unknown" in the response would confirm that a key had once been
    // valid, which turns this endpoint into an oracle for testing
    // harvested keys. The reason goes to the log, where the account's own
    // operator can be told it.
    console.warn(
      JSON.stringify({
        level: "warn",
        request_id: requestId,
        event: "auth_refused",
        reason: authResult.failure,
      })
    );
    return json(
      401,
      {
        error: "unauthorized",
        message: "A valid, unexpired nsh_live_ key with the verify scope is required.",
      },
      requestId,
      { "WWW-Authenticate": 'Bearer realm="noshashi"' }
    );
  }
  const auth = authResult.auth;

  /* 2. Entitlement and tier. ---------------------------------------- */
  const { data: entitlements, error: entitlementError } = await supabase
    .schema("noshashi")
    .from("entitlements")
    .select("tier, verification_quota, features, valid_until, rate_limit_per_second")
    .eq("account_id", auth.accountId)
    .maybeSingle();
  if (entitlementError) throw entitlementError;

  const tier = String(entitlements?.tier ?? "operator");
  const features = (entitlements?.features as string[] | undefined) ?? [];
  const expired =
    entitlements?.valid_until &&
    new Date(String(entitlements.valid_until)).getTime() < Date.now();

  /* 3. Rate limit — durable, per key, two windows. ------------------- */
  const published = TIER_LIMITS[tier] ?? TIER_LIMITS.operator;
  // A negotiated Institutional limit overrides the published ceiling.
  // Null means "use the published figure for the tier".
  const negotiated = entitlements?.rate_limit_per_second;
  const hasNegotiated = negotiated !== null && negotiated !== undefined;
  const perSecond = hasNegotiated ? Number(negotiated) : published.perSecond;
  // Sustained allowance is 30x the burst rate rather than 60x: a caller
  // is not expected to hold their peak rate for every second of a
  // minute, and pricing the sustained window at the full product would
  // make the per-second limit decorative.
  const perMinute = hasNegotiated ? Number(negotiated) * 30 : published.perMinute;

  for (const [windowSeconds, limit] of [[1, perSecond], [60, perMinute]] as const) {
    const decision = await takeRate(supabase, auth.keyId, windowSeconds, limit);
    if (!decision.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((new Date(decision.resetAt).getTime() - Date.now()) / 1000)
      );
      return json(
        429,
        {
          error: "rate_limited",
          message: `Exceeded ${limit} requests per ${windowSeconds}s for the ${tier} tier.`,
        },
        requestId,
        {
          "Retry-After": String(retryAfter),
          "RateLimit-Limit": String(decision.limit),
          "RateLimit-Remaining": "0",
          "RateLimit-Reset": String(retryAfter),
        }
      );
    }
  }

  /* 4. Read and validate the body. ---------------------------------- */
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return json(
      415,
      { error: "unsupported_media_type", message: "Content-Type must be application/json." },
      requestId
    );
  }

  // Two checks, not one. The declared length is a courtesy that lets an
  // oversized body be refused without reading it; the measured length is
  // the one that is true, because Content-Length can lie or be absent
  // under chunked transfer.
  const declaredLength = Number(request.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json(
      413,
      { error: "payload_too_large", message: `Body must be under ${MAX_BODY_BYTES} bytes.` },
      requestId
    );
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return json(
      413,
      { error: "payload_too_large", message: `Body must be under ${MAX_BODY_BYTES} bytes.` },
      requestId
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "invalid_json", message: "Request body must be JSON." }, requestId);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return json(
      400,
      { error: "invalid_json", message: "Request body must be a JSON object." },
      requestId
    );
  }
  const body = parsed as { subject?: unknown; domain?: unknown; amount_xrp?: unknown };

  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const domainCode = typeof body.domain === "string" ? body.domain.trim().toUpperCase() : "";
  const amountXrp = Number(body.amount_xrp);

  if (!(await isValidClassicAddress(subject))) {
    return json(
      400,
      {
        error: "invalid_subject",
        message: "subject must be an XRPL classic address that passes its base58 checksum.",
      },
      requestId
    );
  }
  if (!Number.isFinite(amountXrp) || amountXrp < 0) {
    return json(
      400,
      { error: "invalid_amount", message: "amount_xrp must be a non-negative number." },
      requestId
    );
  }
  // XRP is capped at 100 billion by protocol. An amount above that is not
  // a transfer anyone can make, and letting it through would produce a
  // confident, billed NO-GO about an impossible transaction.
  if (amountXrp > 100_000_000_000) {
    return json(
      400,
      { error: "invalid_amount", message: "amount_xrp exceeds the total XRP supply." },
      requestId
    );
  }
  const domain = DOMAIN_REGISTRY.find((entry) => entry.code === domainCode);
  if (!domain) {
    return json(
      404,
      {
        error: "unknown_domain",
        message: `Unknown domain. Known: ${DOMAIN_REGISTRY.map((entry) => entry.code).join(", ")}`,
      },
      requestId
    );
  }

  /* 5. Feature gate. ------------------------------------------------- */
  if (!features.includes("compliance_api")) {
    return json(
      403,
      {
        error: "feature_not_enabled",
        message: "The Compliance API requires the Institutional plan.",
      },
      requestId
    );
  }
  if (expired) {
    return json(
      403,
      { error: "entitlement_expired", message: "Entitlement has expired. Renew to continue." },
      requestId
    );
  }

  /* 6. Idempotent retry. --------------------------------------------- */
  // Checked before the credit is spent. A caller whose request timed out
  // has no way to know whether it was adjudicated, so without this the
  // safe behaviour on their side — retry — costs them a second credit and
  // writes a second audit row for one decision.
  const idempotencyKey = (request.headers.get("idempotency-key") ?? "").trim() || null;
  if (idempotencyKey) {
    if (idempotencyKey.length > 255) {
      return json(
        400,
        {
          error: "invalid_idempotency_key",
          message: "Idempotency-Key must be 255 characters or fewer.",
        },
        requestId
      );
    }
    const replay = await replayStoredReceipt(supabase, auth.accountId, idempotencyKey, requestId);
    if (replay) return replay;
  }

  /* 7. Consume one prepaid credit, atomically. ----------------------- */
  const { data: consumed, error: consumeError } = await supabase
    .schema("noshashi")
    .rpc("consume_verification_credit", { p_account: auth.accountId });
  if (consumeError) throw consumeError;
  if (consumed !== true) {
    return json(
      402,
      {
        error: "quota_exhausted",
        message: "No verification credits remaining. Purchase a credit pack.",
      },
      requestId
    );
  }

  /** Give the credit back. Called on every path that fails after step 7. */
  const refund = async (reason: string) => {
    const { error } = await supabase
      .schema("noshashi")
      .rpc("refund_verification_credit", { p_account: auth.accountId });
    console.warn(
      JSON.stringify({
        level: "warn",
        request_id: requestId,
        event: "credit_refunded",
        reason,
        refund_failed: error ? error.message : undefined,
      })
    );
  };

  /* 8. Read live ledger state. --------------------------------------- */
  let account: Awaited<ReturnType<typeof fetchLedgerAccount>>;
  let credentials: Awaited<ReturnType<typeof fetchLedgerCredentials>>;
  try {
    [account, credentials] = await Promise.all([
      fetchLedgerAccount(subject),
      fetchLedgerCredentials(subject),
    ]);
  } catch (error) {
    // The credit was spent a moment ago for a verdict that will never
    // exist. Returning it here is the difference between an outage and a
    // billing dispute.
    await refund("ledger_unavailable");
    console.error(
      JSON.stringify({
        level: "error",
        request_id: requestId,
        event: "ledger_read_failed",
        message: error instanceof Error ? error.message : String(error),
      })
    );
    return json(
      502,
      { error: "ledger_unavailable", message: "Could not read ledger state. Try again shortly." },
      requestId
    );
  }

  /* 9. Adjudicate, and digest exactly as the console does. ----------- */
  const evaluation = evaluatePolicy({ account, credentials, domain, amountXrp });
  const digest = await receiptDigest(evaluation);
  const elapsedMs = Math.max(1, Math.round(performance.now() - started));

  const responseBody = {
    verdict: evaluation.verdict,
    domain: domain.code,
    subject,
    amount_xrp: amountXrp,
    checks: evaluation.checks,
    digest,
    evaluated_at: evaluation.evaluatedAt,
    latency_ms: elapsedMs,
  };

  /* 10. Audit trail — fail closed. ----------------------------------- */
  // A verdict served without a record of having served it is exactly the
  // gap an examiner asks about, so the record is written before the
  // response, and a failure to write it refuses the response. The stored
  // receipt is also what makes step 6 able to replay a retry.
  const { error: auditError } = await supabase
    .schema("noshashi")
    .from("verification_events")
    .insert({
      account_id: auth.accountId,
      api_key_id: auth.keyId,
      request_id: requestId,
      idempotency_key: idempotencyKey,
      subject_address: subject,
      domain_code: domain.code,
      amount_xrp: amountXrp,
      verdict: evaluation.verdict,
      receipt_digest: digest,
      receipt: responseBody,
      latency_ms: elapsedMs,
      created_at: new Date().toISOString(),
    });

  if (auditError) {
    // 23505 on the idempotency index means a concurrent request with the
    // same key won the race. That is not an error to the caller — it is
    // precisely the outcome they asked for by sending the header.
    if (auditError.code === "23505" && idempotencyKey) {
      await refund("idempotent_duplicate");
      const replay = await replayStoredReceipt(supabase, auth.accountId, idempotencyKey, requestId);
      if (replay) return replay;
    }
    await refund("audit_write_failed");
    console.error(
      JSON.stringify({
        level: "error",
        request_id: requestId,
        event: "audit_write_failed",
        message: auditError.message,
      })
    );
    return json(
      503,
      {
        error: "receipt_not_recorded",
        message:
          "The verdict could not be written to the audit trail, so it was not served. No credit was charged. Retry.",
      },
      requestId
    );
  }

  // Best-effort. The key list showing a stale "last used" is a cosmetic
  // defect; failing the request over it would not be.
  const { error: touchError } = await supabase
    .schema("noshashi")
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", auth.keyId);
  if (touchError) {
    console.warn(
      JSON.stringify({
        level: "warn",
        request_id: requestId,
        event: "last_used_not_stamped",
        message: touchError.message,
      })
    );
  }

  return json(200, responseBody, requestId, { "RateLimit-Limit": String(perSecond) });
}

/**
 * Serve a stored receipt for a previously-seen Idempotency-Key.
 *
 * Replays the stored bytes rather than re-adjudicating. Re-running the
 * policy would read a ledger that has moved on, so a retry could return a
 * different verdict and a different digest under the same idempotency
 * key — which is the one thing the key is supposed to rule out.
 */
async function replayStoredReceipt(
  client: ServiceClient,
  accountId: string,
  idempotencyKey: string,
  requestId: string
): Promise<Response | null> {
  const { data, error } = await client
    .schema("noshashi")
    .from("verification_events")
    .select("receipt, request_id")
    .eq("account_id", accountId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  if (!data?.receipt) return null;

  return json(200, data.receipt as Record<string, unknown>, requestId, {
    "X-Idempotent-Replay": "true",
    "X-Original-Request-Id": String(data.request_id ?? ""),
  });
}

