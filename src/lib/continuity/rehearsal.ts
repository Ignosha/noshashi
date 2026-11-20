import { admission, RIPPLE_EPOCH, type AcceptedCredential, type CredentialEntry, type DomainEntry } from "../../../supabase/functions/_shared/ledgerRegistry.ts";
import { compareDomainRules } from "./access.ts";

export type Commitment = {
  id: string;
  activity: "trade" | "payment" | "bridge" | "loan" | "offboarding";
  plannedAt: string;
  dependencies: { account: string; domainId: string }[];
};
export type AccessSnapshot = {
  domain: DomainEntry;
  closeTime: number;
  accounts: { account: string; credentials: CredentialEntry[] }[];
};
const activities = new Set(["trade", "payment", "bridge", "loan", "offboarding"]);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 128;

/** Accept operator-declared requirements, keeping missing ledger coverage explicit. */
export function parseCommitments(value: unknown, closeTime: number): Commitment[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) throw new Error("Import 1–500 planned activities.");
  const ids = new Set<string>();
  return value.map(row => {
    if (!row || typeof row !== "object" || !text(row.id) || ids.has(row.id) || !activities.has(row.activity)) {
      throw new Error("Every activity needs a unique ID and a supported activity type.");
    }
    ids.add(row.id);
    const when = Date.parse(row.plannedAt);
    if (typeof row.plannedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(row.plannedAt) ||
        !Number.isFinite(when) || new Date(when).toISOString() !== row.plannedAt.replace("Z", ".000Z") ||
        when < (closeTime + RIPPLE_EPOCH) * 1000 || when > (closeTime + RIPPLE_EPOCH + 365 * 86400) * 1000) {
      throw new Error("Use a UTC plannedAt time such as 2026-11-27T12:00:00Z, from the snapshot through 365 days ahead.");
    }
    if (!Array.isArray(row.dependencies) || !row.dependencies.length || row.dependencies.length > 10 ||
        row.dependencies.some((dependency: Record<string, unknown> | null) => !dependency || !text(dependency.account) ||
          !text(dependency.domainId) || !/^[A-Fa-f0-9]{64}$/.test(dependency.domainId))) {
      throw new Error("Each activity needs 1–10 account and domainId dependencies.");
    }
    const dependencies = row.dependencies.map((dependency: { account: string; domainId: string }) => ({
      account: dependency.account.trim(), domainId: dependency.domainId.toUpperCase(),
    }));
    if (new Set(dependencies.map((dependency: { account: string; domainId: string }) => `${dependency.account}:${dependency.domainId}`)).size !== dependencies.length) {
      throw new Error("List each account and domain dependency once per activity.");
    }
    return { id: row.id, activity: row.activity, plannedAt: row.plannedAt, dependencies };
  });
}

export function rehearseWork(snapshot: AccessSnapshot, proposed: AcceptedCredential[], values: unknown) {
  // Reuse the existing scenario validator, including the domain owner's exception.
  compareDomainRules({ ...snapshot, account: snapshot.domain.owner, credentials: [], horizonDays: 1 }, proposed);
  const commitments = parseCommitments(values, snapshot.closeTime);
  return commitments.map(commitment => {
    const deadline = Date.parse(commitment.plannedAt) / 1000 - RIPPLE_EPOCH;
    const requirements = commitment.dependencies.map(dependency => {
      const held = snapshot.accounts.find(item => item.account === dependency.account);
      if (!held || dependency.domainId !== snapshot.domain.domainId) {
        return { ...dependency, baseline: null, scenario: null, reason: "Account or domain outside this ledger read" };
      }
      const baseline = admission(snapshot.domain, dependency.account, held.credentials, deadline);
      const scenario = admission({ ...snapshot.domain, accepted: proposed }, dependency.account, held.credentials, deadline);
      return { ...dependency, baseline, scenario, reason: scenario.admitted ? "Access prerequisite met at planned time" : "Access prerequisite unmet at planned time" };
    });
    const unmet = requirements.some(requirement => requirement.scenario?.admitted === false);
    const missingEvidence = requirements.some(requirement => requirement.scenario === null);
    return {
      ...commitment,
      outcome: unmet ? "Access prerequisite unmet" : missingEvidence ? "Needs ledger evidence" : "Access prerequisite met",
      changedByScenario: requirements.some(requirement => requirement.baseline?.admitted && !requirement.scenario?.admitted),
      missingEvidence,
      requirements,
      scope: "Operator-declared domain access requirements only. Amounts, balances, bridge execution, loan terms and settlement remain separate checks.",
    };
  }).sort((left, right) => left.plannedAt.localeCompare(right.plannedAt) || left.id.localeCompare(right.id));
}
