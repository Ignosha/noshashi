import { canonical, sha256Hex, type LedgerAt } from "../compliance/registry";
import { credentialFromEntry, domainFromEntry, RIPPLE_EPOCH, type AcceptedCredential } from "../../../supabase/functions/_shared/ledgerRegistry.ts";
import { rehearseWork, type AccessSnapshot } from "./rehearsal";

export type WorkFinding = ReturnType<typeof rehearseWork>[number];
export type ReviewNote = { owner: string; nextAction: string };
export type WorkReview = { assumptions: string; rows: (WorkFinding & { review: ReviewNote })[] };
export type ReviewedWork = WorkFinding & { review: ReviewNote };
export type DecisionEvidence = AccessSnapshot & {
  version: 1;
  source: "fictional sample" | "validated ledger";
  ledger: LedgerAt | null;
  proposedRules: AcceptedCredential[];
  horizonDays: number;
  rehearsal: WorkReview;
  provenance?: string;
};

export function summarizeWork(rows: ReviewedWork[]) {
  const requirements = rows.flatMap(row => row.requirements);
  return {
    activities: rows.length,
    requiredChecks: requirements.length,
    coveredChecks: requirements.filter(requirement => requirement.scenario !== null).length,
    affectedByChange: rows.filter(row => row.changedByScenario).length,
    baselineAccessGaps: rows.filter(row => row.requirements.some(requirement => requirement.baseline?.admitted === false)).length,
    missingEvidence: rows.filter(row => row.missingEvidence).length,
    missingOwner: rows.filter(row => !row.review.owner.trim()).length,
    missingNextAction: rows.filter(row => !row.review.nextAction.trim()).length,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid evidence object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 128): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Invalid evidence text.");
  return value;
}
function integer(value: unknown, max = 0xffffffff): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) throw new Error("Invalid evidence number.");
  return value;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("Invalid evidence list.");
  return value;
}
function hex(value: unknown, exact = false): string {
  const candidate = text(value);
  if (!/^(?:[0-9A-F]{2})+$/.test(candidate) || (exact && candidate.length !== 64)) throw new Error("Invalid evidence identifier.");
  return candidate;
}
function rule(value: unknown): AcceptedCredential {
  const row = record(value);
  if (row.type !== null && typeof row.type !== "string") throw new Error("Invalid credential type label.");
  return { issuer: text(row.issuer), typeHex: hex(row.typeHex), type: row.type as string | null };
}

/** Verify integrity and recompute the saved findings. Source authenticity needs a fresh read. */
export async function verifyDecisionPack(value: unknown) {
  const pack = record(value);
  const evidence = record(pack.evidence);
  if (typeof pack.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(pack.sha256) || await sha256Hex(canonical(evidence)) !== pack.sha256) {
    throw new Error("Evidence digest does not match the saved file.");
  }
  if (evidence.version !== 1 || !["fictional sample", "validated ledger"].includes(String(evidence.source))) {
    throw new Error("Unsupported evidence version or source label.");
  }
  const closeTime = integer(evidence.closeTime);
  const rawDomain = record(evidence.domain);
  const accepted = list(rawDomain.accepted, 10).map(rule);
  const domain = domainFromEntry({ LedgerEntryType: "PermissionedDomain", Owner: text(rawDomain.owner),
    AcceptedCredentials: accepted.map(item => ({ Credential: { Issuer: item.issuer, CredentialType: item.typeHex } })) }, hex(rawDomain.domainId, true));
  if (!domain || !accepted.length) throw new Error("Invalid saved domain.");
  domain.accepted = accepted;
  domain.sequence = rawDomain.sequence === null ? null : integer(rawDomain.sequence);
  domain.previousTxnId = rawDomain.previousTxnId === null ? null : hex(rawDomain.previousTxnId, true);
  domain.previousTxnLedger = rawDomain.previousTxnLedger === null ? null : integer(rawDomain.previousTxnLedger);
  if (new Set(accepted.map(item => item.issuer + ":" + item.typeHex)).size !== accepted.length) throw new Error("Duplicate domain rules.");
  const accounts = list(evidence.accounts, 20).map(value => {
    const row = record(value);
    const account = text(row.account);
    const credentials = list(row.credentials, 4000).map(value => {
      const credential = record(value);
      if (typeof credential.accepted !== "boolean") throw new Error("Invalid credential acceptance flag.");
      const parsed = credentialFromEntry({ LedgerEntryType: "Credential", Subject: text(credential.subject),
        Issuer: text(credential.issuer), CredentialType: hex(credential.typeHex), Flags: credential.accepted ? 65536 : 0,
        ...(credential.expiration === null ? {} : { Expiration: integer(credential.expiration) }),
      }, hex(credential.credentialId, true));
      if (!parsed) throw new Error("Invalid saved credential.");
      parsed.uri = credential.uri === null ? null : text(credential.uri, 4096);
      parsed.previousTxnId = credential.previousTxnId === null ? null : hex(credential.previousTxnId, true);
      parsed.previousTxnLedger = credential.previousTxnLedger === null ? null : integer(credential.previousTxnLedger);
      return parsed;
    });
    if (new Set(credentials.map(item => item.credentialId)).size !== credentials.length ||
        new Set(credentials.map(item => `${item.subject}:${item.issuer}:${item.typeHex}`)).size !== credentials.length) {
      throw new Error("Duplicate saved credentials.");
    }
    return { account, credentials };
  });
  if (new Set(accounts.map(item => item.account)).size !== accounts.length) throw new Error("Duplicate saved accounts.");
  const proposedRules = list(evidence.proposedRules, 10).map(rule);
  for (const rules of [accepted, proposedRules]) {
    if (new Set(rules.map(item => item.issuer + ":" + item.typeHex)).size !== rules.length) throw new Error("Duplicate credential rules.");
  }
  if (new Set(proposedRules.map(item => item.issuer + ":" + item.typeHex)).size !== proposedRules.length) throw new Error("Duplicate proposed rules.");
  const rehearsal = record(evidence.rehearsal);
  const savedRows = list(rehearsal.rows, 500).map(record);
  const snapshot: AccessSnapshot = { domain, accounts, closeTime };
  const rows = rehearseWork(snapshot, proposedRules, savedRows);
  const savedFindings = savedRows.map(({ review: _review, ...finding }) => finding);
  if (canonical(rows) !== canonical(savedFindings)) throw new Error("Saved findings do not match a replay of the observed inputs.");
  const reviewed = rows.map((row, index) => {
    const note = record(savedRows[index].review);
    if (typeof note.owner !== "string" || note.owner.length > 120 || typeof note.nextAction !== "string" || note.nextAction.length > 1000) {
      throw new Error("Invalid saved review notes.");
    }
    return { ...row, review: { owner: note.owner, nextAction: note.nextAction } };
  });
  let ledger: LedgerAt | null = null;
  if (evidence.source === "validated ledger") {
    const raw = record(evidence.ledger);
    if (integer(raw.closeTime) !== closeTime || raw.closeIso !== new Date((closeTime + RIPPLE_EPOCH) * 1000).toISOString()) {
      throw new Error("Saved ledger time is inconsistent.");
    }
    ledger = { index: integer(raw.index), closeTime, closeIso: raw.closeIso as string };
  }
  const horizonDays = integer(evidence.horizonDays, 365);
  if (!horizonDays) throw new Error("Invalid forecast horizon.");
  return { snapshot, source: evidence.source as DecisionEvidence["source"], ledger, horizonDays, proposedRules,
    rehearsal: { assumptions: text(rehearsal.assumptions, 2000), rows: reviewed }, digest: pack.sha256 };
}

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));

export function renderDecisionReport(evidence: DecisionEvidence, digest: string) {
  const summary = summarizeWork(evidence.rehearsal.rows);
  const sourceLabel = evidence.provenance?.startsWith("Imported") ? "Imported snapshot · source unverified" : evidence.source;
  const rows = evidence.rehearsal.rows.map(row => `<tr><th scope="row">${escape(row.id)}<br><small>${escape(row.activity)}</small></th>
    <td>${escape(row.plannedAt)}</td><td>${escape(row.outcome)}<br>${row.changedByScenario ? "Affected by proposed rules" : row.missingEvidence ? "Change effect requires more evidence" : "No additional access loss from proposed rules"}</td>
    <td>${escape(row.review.owner || "Unassigned")}<br>${escape(row.review.nextAction || "Next action required")}</td></tr>`).join("");
  const details = evidence.rehearsal.rows.map(row => `<section><h3>${escape(row.id)}</h3>${row.requirements.map(requirement => `<p>${escape(requirement.account)}<br><small>Domain ${escape(requirement.domainId)}</small><br>${escape(requirement.reason)}<br>Current rules at planned time · ${requirement.baseline === null ? "Unobserved" : requirement.baseline.admitted ? "Met" : "Unmet"}<br>Proposed rules at planned time · ${requirement.scenario === null ? "Unobserved" : requirement.scenario.admitted ? "Met" : "Unmet"}</p>`).join("")}</section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <title>NOSHASHI Continuity decision report</title><style>
    body{max-width:1100px;margin:40px auto;padding:0 24px;font:16px/1.6 system-ui,sans-serif;color:#202a24;background:#faf9f5}
    h1{font:normal 42px/1.1 Georgia,serif}header{border-bottom:3px solid #384e3e;padding-bottom:20px}small{color:#566159}p,small,code{overflow-wrap:anywhere}
    table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #b8beb8;padding:12px 8px;overflow-wrap:anywhere;white-space:pre-wrap}
    .notice{border-left:4px solid #8c6429;padding:12px 18px;background:#f0ebe1}section{border-top:1px solid #b8beb8;margin-top:24px}code{overflow-wrap:anywhere}
    @media print{body{margin:0;background:white;font-size:11pt}h1{font-size:26pt}tr,section{break-inside:avoid}thead{display:table-header-group}}
    </style></head><body><header><p>NOSHASHI LABS · Continuity</p><h1>Operational change review</h1>
    <p>${escape(sourceLabel)} · ${escape(evidence.ledger?.closeIso ?? "Fictional snapshot")}</p>
    <p>Ledger ${escape(evidence.ledger?.index ?? "sample")} · Domain <code>${escape(evidence.domain.domainId)}</code></p></header>
    <h2>Review coverage</h2><p>${summary.activities} activities · ${summary.coveredChecks}/${summary.requiredChecks} declared prerequisites covered · ${summary.affectedByChange} activities affected by proposed rules.</p>
    <p>${summary.baselineAccessGaps} activities with baseline access gaps · ${summary.missingEvidence} with missing evidence · ${summary.missingOwner} without an owner · ${summary.missingNextAction} without a next action.</p>
    <p class="notice">${escape(evidence.provenance ?? "Source observations require independent verification.")} Findings cover declared domain-access prerequisites. Bridge execution, balances, credit analysis and settlement require additional evidence.</p>
    <h2>Proposed credential rules</h2><ul>${evidence.proposedRules.map(item => `<li>${escape(item.issuer)} · ${escape(item.type ?? item.typeHex)}</li>`).join("")}</ul>
    <h2>Planned work and follow-up</h2><table><thead><tr><th>Activity</th><th>Planned time</th><th>Access finding</th><th>Owner and next action</th></tr></thead><tbody>${rows}</tbody></table>
    <h2>Requirement evidence</h2>${details}<h2>Assumptions and integrity</h2><p>${escape(evidence.rehearsal.assumptions)}</p>
    <p>The digest covers the companion evidence JSON. An independent ledger read is required to establish the observations. Renewals, revocations and rule changes can alter the projection.</p>
    <p>SHA-256 <code>${escape(digest)}</code></p></body></html>`;
}
