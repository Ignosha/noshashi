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

const PUBLISHED_RIPPLE_HTTP = [
  "https://s1.ripple.com:51234/",
  "https://s2.ripple.com:51234/",
];

const ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

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
      held.add(String(credential.CredentialType ?? "").toUpperCase());
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
  account: { address: string; balanceXrp: string; sequence: number; ownerCount: number; domain?: string } | null;
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
    detail: account
      ? "Account is funded and has a validated sequence number."
      : "No validated account object found for this address.",
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
      const payload = (await response.json()) as { result?: Record<string, any>; error?: string };
      if (payload.error) throw new Error(payload.error);
      return payload.result ?? {};
    } catch (error) {
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
    };
  } catch (error) {
    if (String((error as Error).message).toLowerCase().includes("actnotfound")) {
      return null; // well-formed, never funded → the policy's ACCOUNT_ACTIVATED check refuses
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

async function authenticate(
  client: ReturnType<typeof createClient>,
  authorization: string | null
): Promise<ApiKeyAuth | null> {
  if (!authorization?.startsWith("Bearer nsh_live_")) return null;
  const raw = authorization.slice("Bearer ".length).trim();
  const keyHash = await sha256Hex(raw);

  const { data, error } = await client
    .schema("noshashi")
    .from("api_keys")
    .select("id, account_id, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.revoked_at) return null;
  return { accountId: String(data.account_id), keyId: String(data.id) };
}

/* ------------------------------------------------------------------ */
/* Basic per-instance rate limit (see README — replace with a managed  */
/* limiter before opening to third parties)                            */
/* ------------------------------------------------------------------ */

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_MAX;
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  const method = request.method.toUpperCase();
  const rateKey = `${request.headers.get("x-forwarded-for") ?? "unknown"}|${method}`;
  if (rateLimited(rateKey)) {
    return json(429, { error: "rate_limited", message: "Too many requests. Slow down and retry." });
  }

  if (method === "GET") {
    return json(200, {
      name: "noshashi-verify",
      contract: "POST JSON { subject, domain, amount_xrp } with Authorization: Bearer nsh_live_…",
      domains: DOMAIN_REGISTRY.map((domain) => domain.code),
    });
  }
  if (method !== "POST") {
    return json(405, { error: "method_not_allowed", message: "Only POST is supported." });
  }

  const started = performance.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 1. Authenticate the key.
  const auth = await authenticate(supabase, request.headers.get("authorization"));
  if (!auth) {
    return json(401, { error: "unauthorized", message: "Valid nsh_live_ key required." });
  }

  // 2. Parse and validate the request body.
  let body: { subject?: unknown; domain?: unknown; amount_xrp?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid_json", message: "Request body must be JSON." });
  }

  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const domainCode = typeof body.domain === "string" ? body.domain.trim().toUpperCase() : "";
  const amountXrp = Number(body.amount_xrp);

  if (!ADDRESS_RE.test(subject)) {
    return json(400, { error: "invalid_subject", message: "subject must be an XRPL classic address." });
  }
  if (!Number.isFinite(amountXrp) || amountXrp < 0) {
    return json(400, { error: "invalid_amount", message: "amount_xrp must be a non-negative number." });
  }
  const domain = DOMAIN_REGISTRY.find((entry) => entry.code === domainCode);
  if (!domain) {
    return json(404, {
      error: "unknown_domain",
      message: `Unknown domain. Known: ${DOMAIN_REGISTRY.map((entry) => entry.code).join(", ")}`,
    });
  }

  // 3. Feature gate (read-only; the authoritative decrement is in SQL).
  const { data: entitlements, error: entitlementError } = await supabase
    .schema("noshashi")
    .from("entitlements")
    .select("verification_quota, features, valid_until")
    .eq("account_id", auth.accountId)
    .maybeSingle();
  if (entitlementError) throw entitlementError;

  const features = (entitlements?.features as string[] | undefined) ?? [];
  if (!features.includes("compliance_api")) {
    return json(403, {
      error: "feature_not_enabled",
      message: "The Compliance API requires the Institution plan.",
    });
  }
  const expired =
    entitlements?.valid_until &&
    new Date(String(entitlements.valid_until)).getTime() < Date.now();
  if (expired) {
    return json(403, {
      error: "entitlement_expired",
      message: "Entitlement has expired. Renew to continue.",
    });
  }

  // 4. Atomically consume one prepaid credit. The SQL function is the
  //    single source of truth for the balance: it decrements only when
  //    quota >= 1, so concurrent calls can never overspend.
  const { data: consumed, error: consumeError } = await supabase
    .schema("noshashi")
    .rpc("consume_verification_credit", { p_account: auth.accountId });
  if (consumeError) throw consumeError;
  if (consumed !== true) {
    return json(402, {
      error: "quota_exhausted",
      message: "No verification credits remaining. Purchase a credit pack.",
    });
  }

  // 5. Read live ledger state. The credit is already consumed at this
  //    point; on an infra failure the credit can be refunded manually.
  let account: Awaited<ReturnType<typeof fetchLedgerAccount>>;
  let credentials: Awaited<ReturnType<typeof fetchLedgerCredentials>>;
  try {
    [account, credentials] = await Promise.all([
      fetchLedgerAccount(subject),
      fetchLedgerCredentials(subject),
    ]);
  } catch (error) {
    console.error("ledger read failed", error);
    return json(502, {
      error: "ledger_unavailable",
      message: "Could not read ledger state. Try again shortly.",
    });
  }

  // 6. Evaluate with the same rule set the console uses, and digest the
  //    receipt exactly as the client does so they can never disagree.
  const evaluation = evaluatePolicy({ account, credentials, domain, amountXrp });
  const digest = await receiptDigest(evaluation);
  const elapsedMs = Math.max(1, Math.round(performance.now() - started));
  const receipt = { ...evaluation, digest, latencyMs: elapsedMs };

  // 7. Audit trail: one row per verification, and a last-used stamp on
  //    the key so the console's key list shows real activity.
  await supabase
    .schema("noshashi")
    .from("verification_events")
    .insert({
      account_id: auth.accountId,
      api_key_id: auth.keyId,
      subject,
      domain_code: domain.code,
      amount_xrp: amountXrp,
      verdict: receipt.verdict,
      receipt_digest: receipt.digest,
      created_at: new Date().toISOString(),
    });
  await supabase
    .schema("noshashi")
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", auth.keyId);

  return json(200, {
    verdict: receipt.verdict,
    domain: domain.code,
    subject,
    amount_xrp: amountXrp,
    checks: receipt.checks,
    digest: receipt.digest,
    evaluated_at: receipt.evaluatedAt,
    latency_ms: receipt.latencyMs,
  });
});
