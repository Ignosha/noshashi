import type { AccountInfo, CredentialRecord, Status } from "./xrpl/types";

/**
 * NOSHASHI policy engine — the deterministic core of the
 * Autonomous Compliance Layer.
 *
 * Given a subject account, the credentials it holds on-ledger, and a
 * destination Permissioned Domain (XLS-80), it produces a verdict —
 * GO / HOLD / NO-GO — plus an itemised, explainable check list and a
 * cryptographic receipt digest suitable for audit logging.
 *
 * Every rule is pure and synchronous so the same evaluation can run
 * client-side for instant feedback and server-side for enforcement.
 */

export type CredentialType =
  | "KYC_LEVEL_1"
  | "KYC_LEVEL_2"
  | "ACCREDITED_INVESTOR"
  | "SANCTIONS_CLEARANCE"
  | "PEP_SCREENING"
  | "INSTITUTIONAL_CUSTODY";

export type PermissionedDomain = {
  id: string;
  name: string;
  code: string;
  institution: string;
  /** Credential types that must be held, accepted and unrevoked. */
  requirements: CredentialType[];
  /** Ceiling per settlement, in XRP. Zero means uncapped. */
  transferCeilingXrp: number;
  /** Domains under governance review gate to HOLD rather than GO. */
  governance: "active" | "review" | "suspended";
  members: number;
};

export type PolicyCheck = {
  /** Stable machine-readable rule id — appears in the audit trail. */
  id: string;
  label: string;
  /** `fail` blocks outright, `warn` degrades a GO to a HOLD. */
  severity: "block" | "warn";
  passed: boolean;
  /** Plain-language reason shown when the check does not pass. */
  detail: string;
};

export type PolicyReceipt = {
  verdict: Status;
  domainId: string;
  subject: string;
  amountXrp: number;
  checks: PolicyCheck[];
  /** SHA-256 over the canonical receipt body. */
  digest: string;
  evaluatedAt: string;
  latencyMs: number;
};

/**
 * Reference domain registry.
 *
 * These are ILLUSTRATIVE FIXTURES, not real permissioned domains, and
 * the operator names are deliberately generic: naming an actual firm
 * here would assert a commercial relationship that does not exist. In
 * production these rows are read from XLS-80 `PermissionedDomain`
 * ledger objects, whose shape is identical.
 */
export const DOMAIN_REGISTRY: PermissionedDomain[] = [
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

/** Credential types the subject currently holds in a usable state. */
export function heldCredentialTypes(
  credentials: CredentialRecord[]
): Set<string> {
  const held = new Set<string>();
  for (const credential of credentials) {
    if (credential.accepted && !credential.revoked) {
      held.add(credential.credentialType.toUpperCase());
    }
  }
  return held;
}

/** XRPL account reserve: 1 XRP base + 0.2 XRP per owned object. */
export function reserveRequirementXrp(ownerCount: number): number {
  return 1 + ownerCount * 0.2;
}

/**
 * Run the full rule set. Pure — no I/O, no clock beyond the timestamp.
 */
export function evaluatePolicy(input: {
  account: AccountInfo | null;
  credentials: CredentialRecord[];
  domain: PermissionedDomain;
  amountXrp: number;
}): Omit<PolicyReceipt, "digest" | "latencyMs"> {
  const { account, credentials, domain, amountXrp } = input;
  const held = heldCredentialTypes(credentials);
  const balance = account ? Number(account.balanceXrp) : 0;
  const reserve = reserveRequirementXrp(account?.ownerCount ?? 0);
  const spendable = Math.max(0, balance - reserve);

  const checks: PolicyCheck[] = [];

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
    detail: `Reserve requirement is ${reserve.toFixed(1)} XRP for ${
      account?.ownerCount ?? 0
    } owned objects.`,
  });

  checks.push({
    id: "SPENDABLE_BALANCE",
    label: "Spendable balance covers transfer",
    severity: "block",
    passed: amountXrp <= spendable,
    detail: `${spendable.toFixed(2)} XRP is spendable after reserve; transfer is ${amountXrp.toFixed(
      2
    )} XRP.`,
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

/** Canonical JSON → SHA-256 hex. The receipt's tamper-evident digest. */
export async function receiptDigest(
  body: Omit<PolicyReceipt, "digest" | "latencyMs">
): Promise<string> {
  const canonical = JSON.stringify({
    verdict: body.verdict,
    domainId: body.domainId,
    subject: body.subject,
    amountXrp: body.amountXrp,
    evaluatedAt: body.evaluatedAt,
    checks: body.checks.map((check) => [check.id, check.passed]),
  });
  const bytes = new TextEncoder().encode(canonical);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Full evaluation with timing and digest — what the UI actually calls. */
export async function runPolicy(input: {
  account: AccountInfo | null;
  credentials: CredentialRecord[];
  domain: PermissionedDomain;
  amountXrp: number;
}): Promise<PolicyReceipt> {
  const started = performance.now();
  const body = evaluatePolicy(input);
  const digest = await receiptDigest(body);
  return {
    ...body,
    digest,
    latencyMs: Math.max(1, Math.round(performance.now() - started)),
  };
}

export const VERDICT_COPY: Record<Status, { title: string; blurb: string }> = {
  go: {
    title: "GO",
    blurb: "Every blocking rule passed. Settlement is cleared to broadcast.",
  },
  hold: {
    title: "HOLD",
    blurb: "Blocking rules passed but an advisory rule failed. Manual sign-off required.",
  },
  "no-go": {
    title: "NO-GO",
    blurb: "A blocking rule failed. Settlement is refused by the compliance layer.",
  },
};
