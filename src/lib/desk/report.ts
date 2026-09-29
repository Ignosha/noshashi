import { BRAND } from "@/lib/brand";
import { checkState, CHECK_STATE_COPY, DOMAIN_REGISTRY, receiptCanonical } from "@/lib/policy";
import type { PolicyException } from "@/lib/org/governance";
import { exceptionStanding } from "@/lib/org/governance";
import type { ReceiptCheck } from "./evidence";
import type { LedgerEntry } from "./ledger";
import type { ReplayResult } from "./replay";

/**
 * The institutional report: one self-contained HTML document for a single
 * recorded decision, readable by an executive and checkable by an auditor.
 *
 * Executive summary → subject → policy → decision → findings → evidence →
 * ledger → exceptions → reviewer → verification instructions. Everything in
 * it is a field of the stored record, the result of re-verifying it, or a
 * replay; nothing is estimated. It prints to PDF from any browser.
 *
 * The verification section prints the exact canonical bytes the receipt's
 * SHA-256 was taken over, so the digest can be recomputed with a standard
 * tool (shasum, certutil, openssl) without trusting NOSHASHI.
 */

export type ReportInput = {
  entry: LedgerEntry;
  verification: ReceiptCheck;
  replay?: ReplayResult | null;
  /** Exceptions raised against this receipt, when the organization holds any. */
  exceptions?: PolicyException[];
  /** Who produced the report, as shown in the app. */
  preparedBy?: string;
  now?: Date;
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const MEANING: Record<LedgerEntry["verdict"], string> = {
  go: "Every blocking rule passed. Cleared to proceed, subject to the institution's own approval.",
  hold: "No blocking rule failed, but at least one needs review. A person signs off before anything moves.",
  "no-go": "A blocking rule failed. Do not proceed on this reading.",
  "insufficient-data": "The ledger could not supply what a rule needs, so no decision was issued.",
};

export function reportFilename(entry: LedgerEntry): string {
  return `noshashi-report-${entry.digest.slice(0, 12).toLowerCase()}-${entry.at.slice(0, 10)}.html`;
}

export function institutionalReport(input: ReportInput): string {
  const { entry, verification, replay, exceptions = [], preparedBy } = input;
  const now = input.now ?? new Date();
  const profile = DOMAIN_REGISTRY.find((d) => d.id === entry.domainId);
  const checks = entry.checks ?? [];
  const findings = checks.filter((c) => checkState(c) !== "PASS" && checkState(c) !== "NOT_APPLICABLE");
  const agreement = checks.find((c) => c.id === "SOURCE_AGREEMENT");
  const mine = exceptions.filter((x) => x.receiptDigest === entry.digest);
  const canonical =
    entry.checks && entry.domainId
      ? receiptCanonical({
          verdict: entry.verdict,
          domainId: entry.domainId,
          subject: entry.subject,
          amountXrp: entry.amountXrp,
          evaluatedAt: entry.at,
          checks: entry.checks,
          policy: entry.policy,
        })
      : null;

  const verified =
    verification.state === "verified"
      ? "Verified: the SHA-256 recomputed from the record equals the stored digest."
      : verification.state === "mismatch"
        ? `DOES NOT MATCH. Stored ${verification.stored}; recomputed ${verification.recomputed}. The record has changed since it was issued.`
        : `Unverifiable: ${verification.reason}`;

  const row = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
  const ruleRows = checks
    .map((c) => {
      const s = checkState(c);
      return `<tr><td>${esc(c.label)}<div class="id">${esc(c.id)}</div></td><td class="s ${CHECK_STATE_COPY[s].tone}">${esc(CHECK_STATE_COPY[s].label)}</td><td>${esc(c.detail)}</td></tr>`;
    })
    .join("");

  const replaySection = !replay
    ? `<p>Not replayed for this report.</p>`
    : replay.state === "not-replayable"
      ? `<p>Replay not possible: ${esc(replay.reason)}</p>`
      : `<p><strong>${replay.state === "matches" ? "Replay matches the record." : `Replay differs: ${replay.changed.length} rule(s) changed.`}</strong>
         Re-read at ledger ${replay.ledgerIndex.toLocaleString("en-US")}. Recorded ${esc(replay.recordedVerdict.toUpperCase())}, replayed ${esc(replay.replayedVerdict.toUpperCase())}.</p>
         ${replay.changed.length ? `<ul>${replay.changed.map((c) => `<li>${esc(c.label)}: recorded ${esc(c.recorded)}, replayed ${esc(c.replayed)}</li>`).join("")}</ul>` : ""}
         ${replay.carried.length ? `<p class="muted">${replay.carried.map(esc).join(" ")}</p>` : ""}`;

  const exceptionSection = mine.length
    ? `<table><tr><th>Status</th><th>Requested</th><th>Decided</th><th>Reason</th></tr>${mine
        .map((x) => {
          const st = exceptionStanding(x);
          const status = x.status === "approved" ? (st === "expired" ? "Approved, expired" : st === "no-expiry" ? "Approved (before expiry was recorded)" : `Approved, in force until ${esc(x.expiresAt)}`) : esc(x.status);
          return `<tr><td>${status}</td><td>${esc(x.requestedAt)}</td><td>${esc(x.decidedAt ?? "—")}</td><td>${esc(x.reason)}</td></tr>`;
        })
        .join("")}</table><p class="muted">An exception is a person's decision recorded beside the verdict. The verdict and its receipt are unchanged by it.</p>`
    : `<p>No exception has been raised against this receipt${exceptions.length ? "" : " on this device or organization"}.</p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>NOSHASHI decision report ${esc(entry.digest.slice(0, 12))}</title>
<style>
body{font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;color:#16201a;background:#fff;max-width:820px;margin:32px auto;padding:0 20px;font-size:13px;line-height:1.5}
h1{font-size:20px;letter-spacing:.06em;margin:0}h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#2f6b4a;border-bottom:1px solid #cfdcd3;padding-bottom:3px;margin:22px 0 8px}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #d5e0d8;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f1f6f2;width:190px;font-weight:600}
.verdict{display:inline-block;font-size:26px;font-weight:700;letter-spacing:.06em;padding:6px 14px;border:2px solid;margin:10px 0 4px}
.go{color:#1f7a45}.hold{color:#9a6a00}.no-go{color:#b3261e}.muted{color:#5b6b61}.id{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:#5b6b61}
.s{font-weight:700;white-space:nowrap}code,pre,.mono{font-family:ui-monospace,Menlo,monospace;font-size:11px;word-break:break-all}pre{background:#f5f7f5;border:1px solid #d5e0d8;padding:8px;white-space:pre-wrap}
@media print{body{margin:0}h2{break-after:avoid}}
</style></head><body>
<h1>NOSHASHI · DECISION REPORT</h1>
<p class="muted">Prepared ${esc(now.toISOString())}${preparedBy ? ` by ${esc(preparedBy)}` : ""} · NOSHASHI ${esc(BRAND.version)} · Receipt ${esc(entry.digest)}</p>

<h2>Executive summary</h2>
<div class="verdict ${entry.verdict === "go" ? "go" : entry.verdict === "no-go" ? "no-go" : "hold"}">${esc(entry.verdict === "insufficient-data" ? "INSUFFICIENT DATA" : entry.verdict.toUpperCase())}</div>
<p>${esc(MEANING[entry.verdict])} ${findings.length ? `${findings.length} rule(s) did not pass; they are listed under Key findings.` : "Every rule evaluated passed."}</p>
<p class="muted">NOSHASHI analyses and produces evidence. Authorized people at the institution make the decision.</p>

<h2>Subject</h2>
<table>${row("Account", `<span class="mono">${esc(entry.subject)}</span>`)}${entry.label ? row("Label", esc(entry.label)) : ""}${row("Amount", `${esc(entry.amountXrp.toLocaleString("en-US"))} XRP`)}${row("Evaluated at", esc(entry.at))}</table>

<h2>Policy</h2>
<table>${row("Rule profile", esc(profile ? `${profile.code} · ${profile.name}` : entry.domainCode))}${
    entry.policy
      ? row("Institutional policy", `${esc(entry.policy.name)} v${esc(entry.policy.version)}`) + row("Policy SHA-256", `<span class="mono">${esc(entry.policy.hash)}</span>`) + row("Engine", esc(entry.policy.engine))
      : row("Institutional policy", "None active. The rule profile alone decided.")
  }</table>

<h2>Key findings</h2>
${findings.length ? `<ul>${findings.map((c) => `<li><strong>${esc(c.label)}</strong> (${esc(CHECK_STATE_COPY[checkState(c)].label)}): ${esc(c.detail)}</li>`).join("")}</ul>` : "<p>None. Every rule evaluated passed.</p>"}

<h2>Rules evaluated</h2>
<table><tr><th>Rule</th><th>Result</th><th>Detail</th></tr>${ruleRows}</table>

<h2>Ledger and sources</h2>
<table>${row("Ledger index", entry.ledgerIndex ? entry.ledgerIndex.toLocaleString("en-US") : entry.offline ? "Offline snapshot" : "Not recorded (entry predates ledger indexing)")}${row("Mode", entry.offline ? "Adjudicated against a captured snapshot" : "Live read of XRPL mainnet")}${row("Source agreement", agreement ? esc(agreement.detail) : "Not recorded (entry predates source agreement)")}</table>

<h2>Evidence</h2>
<table>${row("Receipt SHA-256", `<span class="mono">${esc(entry.digest)}</span>`)}${row("Re-verification", esc(verified))}</table>
<h3 style="font-size:12px;margin:14px 0 4px">Replay</h3>
${replaySection}

<h2>Exceptions</h2>
${exceptionSection}

<h2>Reviewer</h2>
<table>${row("Reviewed by", "&nbsp;")}${row("Decision", "&nbsp;")}${row("Date", "&nbsp;")}${row("Signature", "&nbsp;")}</table>

<h2>How to verify this receipt</h2>
${
  canonical
    ? `<p>The receipt digest is SHA-256 over the exact bytes below (UTF-8, no trailing newline), written in upper case. Copy them into a file named <code>receipt.json</code> without adding a newline, then run:</p>
<pre>shasum -a 256 receipt.json          # macOS / Linux
certutil -hashfile receipt.json SHA256   # Windows</pre>
<p>The result must equal <span class="mono">${esc(entry.digest)}</span> (case-insensitive). Any change to the decision, the rules, the amount, the time or the policy changes it.</p>
<pre>${esc(canonical)}</pre>`
    : `<p>This entry was recorded before its full rule list was stored, so its canonical bytes cannot be rebuilt. The digest above is the one issued at the time.</p>`
}
<p class="muted">Generated from the stored record. Nothing in this report is estimated or produced by the AI assistant.</p>
</body></html>`;
}
