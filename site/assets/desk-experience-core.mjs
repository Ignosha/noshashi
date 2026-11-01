/* Certificate verification mirrors the published authority digest contract.
 * No UI, network requests, sample readings or inferred verdicts live here. */
export const ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const REQUIRED = [
  "FREEZE_SURRENDERED",
  "NOT_GLOBALLY_FROZEN",
  "OPEN_HOLDING",
  "NO_UNILATERAL_SIGNER",
  "NO_TRANSFER_FEE",
  "SUPPLY_CONCENTRATION",
];

export function completeCertificate(c, issuer) {
  if (
    !c ||
    c.issuer !== issuer ||
    !ADDRESS_RE.test(issuer) ||
    !Number.isInteger(c.ledgerIndex) ||
    c.ledgerIndex <= 0 ||
    !Number.isInteger(c.rulesVersion) ||
    c.rulesVersion <= 0 ||
    !["go", "hold", "no-go"].includes(c.verdict) ||
    typeof c.evaluatedAt !== "string" ||
    !Number.isFinite(Date.parse(c.evaluatedAt)) ||
    typeof c.source !== "string" ||
    !c.source ||
    (c.currency !== undefined && typeof c.currency !== "string") ||
    typeof c.digest !== "string" ||
    !/^[a-f0-9]{64}$/i.test(c.digest) ||
    !Array.isArray(c.checks) ||
    (c.unreadable !== undefined &&
      (!Array.isArray(c.unreadable) || c.unreadable.length))
  )
    return false;
  if (
    c.checks.some(
      (k) => !k || typeof k.id !== "string" || typeof k.passed !== "boolean",
    ) ||
    new Set(c.checks.map((k) => k.id)).size !== c.checks.length
  )
    return false;
  if (c.checks.some((k) => k.id === "AUTHORITY_READABLE" && !k.passed))
    return false;
  return REQUIRED.every((id) =>
    c.checks.some(
      (k) =>
        k.id === id &&
        (id === "SUPPLY_CONCENTRATION" || k.state !== "INSUFFICIENT_DATA"),
    ),
  );
}

export function canonicalCertificate(c) {
  const scope = {
    currency: c.currency ?? "",
    ledgerIndex: c.ledgerIndex,
    verdict: c.verdict,
    source: c.source,
    rules: c.rulesVersion,
  };
  return JSON.stringify({
    kind: "authority",
    subject: c.issuer,
    scope: Object.keys(scope)
      .sort()
      .map((key) => [key, scope[key]]),
    evaluatedAt: c.evaluatedAt,
    checks: c.checks.map((k) =>
      k.state && ["INSUFFICIENT_DATA", "NOT_APPLICABLE"].includes(k.state)
        ? [k.id, k.passed, k.state]
        : [k.id, k.passed],
    ),
  });
}

export async function verifyCertificate(c, issuer) {
  if (!completeCertificate(c, issuer)) return false;
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalCertificate(c)),
  );
  const digest = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .toUpperCase();
  return digest === c.digest.toUpperCase();
}
