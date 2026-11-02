/* Certificate verification mirrors the published authority digest contract.
 * No UI, network requests, sample readings or inferred verdicts live here. */
export const ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const REQUIRED = [
  "FREEZE_SURRENDERED",
  "NOT_GLOBALLY_FROZEN",
  "OPEN_HOLDING",
  "NO_UNILATERAL_SIGNER",
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
    c.rulesVersion !== 2 ||
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
      (k) => !k || typeof k.id !== "string" || typeof k.passed !== "boolean" ||
        (k.state !== undefined && !["PASS", "FAIL", "REVIEW", "INSUFFICIENT_DATA", "NOT_APPLICABLE"].includes(k.state)),
    ) ||
    new Set(c.checks.map((k) => k.id)).size !== c.checks.length
  )
    return false;
  if (c.checks.some((k) => k.id === "AUTHORITY_READABLE" && !k.passed))
    return false;
  if (c.checks.some((k) => k.id !== "SUPPLY_CONCENTRATION" && k.state === "INSUFFICIENT_DATA")) return false;
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

// Rule v2 emits NO_TRANSFER_FEE only for a positive transfer fee. Its
// absence is not a finding, and is never filled in before hashing.
export class AuthorityReadError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function readingProvenance(certificate, headers, now = Date.now()) {
  const elapsed = Math.max(0, Math.floor((now - Date.parse(certificate.evaluatedAt)) / 1000));
  const edge = headers?.get("x-vercel-cache")?.toUpperCase();
  const rawAge = headers?.get("age");
  const age = rawAge !== null && rawAge !== undefined && /^\d+$/.test(rawAge) ? Number(rawAge) : 0;
  const stale = edge === "STALE" || elapsed > 300 || age > 300;
  const cached = ["STALE", "HIT", "REVALIDATED"].includes(edge) || age > 0;
  return {
    stale, cached, ageSeconds: Math.max(elapsed, age),
    label: `${stale ? (cached ? "Stale cached reading" : "Stale recorded reading") : cached ? "Cached reading" : "Recorded reading; cache status not established"}. Read ${new Date(certificate.evaluatedAt).toISOString()} · issuer authority, rules ${certificate.rulesVersion}. Not continuous monitoring.`,
  };
}

/** One bounded request, including body decoding and integrity verification.
 * Never compare a new request's digest with a different receipt or scope. */
export async function readVerifiedAuthority(issuer, { signal, timeoutMs = 20000, fetcher = fetch, now = Date.now } = {}) {
  if (!ADDRESS_RE.test(issuer)) throw new AuthorityReadError("invalid");
  if (signal?.aborted) throw new AuthorityReadError("cancelled");
  const controller = new AbortController();
  let timer, onAbort;
  const stop = new Promise((_, reject) => {
    onAbort = () => { controller.abort(); reject(new AuthorityReadError("cancelled")); };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new AuthorityReadError("timeout")); }, timeoutMs);
  });
  const read = async () => {
    const response = await fetcher("/api/authority?issuer=" + encodeURIComponent(issuer), { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new AuthorityReadError("http");
    const certificate = await response.json();
    if (!completeCertificate(certificate, issuer)) throw new AuthorityReadError("incomplete");
    if (!await verifyCertificate(certificate, issuer)) throw new AuthorityReadError("integrity");
    return { certificate, provenance: readingProvenance(certificate, response.headers, now()) };
  };
  try { return await Promise.race([stop, read()]); }
  catch (error) { throw error instanceof AuthorityReadError ? error : new AuthorityReadError("unavailable"); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
}

export function authorityReadMessage(error) {
  const reason = {
    timeout: "The issuer read exceeded 20 seconds.",
    http: "The issuer service could not complete this request.",
    incomplete: "The reply did not contain a complete, supported issuer-controls record.",
    integrity: "The receipt fingerprint did not match its canonical payload.",
    invalid: "Enter a public XRPL classic address beginning with r.",
  }[error?.code] || "A verifiable issuer reading was unavailable.";
  return reason + " No analysis is shown. Retry the read; a healthy ledger connection alone does not confirm an analysis.";
}

export function downloadCertificate(certificate) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(certificate, null, 2) + "\n"], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `noshashi-authority-${certificate.issuer}-${certificate.ledgerIndex}.json`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Bind the image URL and caption to the same committed capture manifest. */
export function capturedView(manifest, name) {
  if (!/^[a-z0-9-]+$/i.test(name) || !Array.isArray(manifest?.shots))
    return null;
  const capture = manifest.shots.find((shot) => shot.name === name);
  if (
    !capture ||
    !Number.isInteger(capture.ledger) ||
    capture.ledger <= 0 ||
    typeof capture.captured_at !== "string" ||
    !Number.isFinite(Date.parse(capture.captured_at))
  )
    return null;
  const date = new Date(capture.captured_at).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    src: `/assets/shots/${name}.webp?capture=${encodeURIComponent(capture.captured_at)}`,
    caption: `Recorded ${date} · ${typeof manifest.network === "string" ? manifest.network : "Network not recorded"} · ledger ${capture.ledger.toLocaleString("en-US")}. This is a captured view, not a live result.`,
    alt:
      typeof capture.alt === "string"
        ? capture.alt
        : `Recorded desktop view: ${name}`,
  };
}
