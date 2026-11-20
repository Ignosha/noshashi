import {
  admission,
  rippleToIso,
  type AcceptedCredential,
  type CredentialEntry,
  type DomainEntry,
} from "../../../supabase/functions/_shared/ledgerRegistry.ts";

/** The caller supplies a complete credential list from one validated ledger. */
export type AccessInput = {
  domain: DomainEntry;
  account: string;
  credentials: CredentialEntry[];
  closeTime: number;
  horizonDays: number;
};

function validate(input: AccessInput) {
  if (!Number.isSafeInteger(input.closeTime) || input.closeTime < 0 ||
      !Number.isInteger(input.horizonDays) || input.horizonDays < 1 || input.horizonDays > 365) {
    throw new Error("Choose a horizon of 1–365 days and a valid ledger close time.");
  }
  if (!input.account || input.domain.accepted.length < 1 || input.domain.accepted.length > 10) {
    throw new Error("An account and a domain with 1–10 accepted credentials are required.");
  }
}

export function forecastAccess(input: AccessInput) {
  validate(input);
  const { domain, account, credentials, closeTime, horizonDays } = input;
  const now = admission(domain, account, credentials, closeTime);
  const horizon = closeTime + horizonDays * 86_400;
  const future = admission(domain, account, credentials, horizon);
  const usable = now.lines.filter(line => line.status === "valid");
  const expirations = usable.map(line => line.expiresAt);
  // Any usable credential without expiry preserves access. The final expiry
  // matters when several credentials independently qualify the account.
  const finalExpiry = expirations.length && expirations.every(value => value !== null)
    ? expirations.reduce((latest, value) => value! > latest ? value! : latest, "")
    : null;
  const losesAccess = now.admitted && !future.admitted;
  return {
    account,
    domainId: domain.domainId,
    now,
    future,
    horizonAt: rippleToIso(horizon),
    lossAt: losesAccess ? finalExpiry : null,
    outcome: !now.admitted ? "No qualifying access at snapshot"
      : losesAccess ? "Access expires within horizon" : "Access survives horizon",
    assumption: "Domain rules and credentials stay as observed. Renewal, deletion and rule changes can alter this projection.",
  };
}

export function compareDomainRules(input: AccessInput, proposed: AcceptedCredential[]) {
  validate(input);
  if (proposed.length < 1 || proposed.length > 10 || proposed.some(candidate =>
    !input.domain.accepted.some(current => current.issuer === candidate.issuer && current.typeHex === candidate.typeHex))) {
    throw new Error("Keep 1–10 existing credential rules for this removal scenario.");
  }
  const current = admission(input.domain, input.account, input.credentials, input.closeTime);
  const scenario = admission({ ...input.domain, accepted: proposed }, input.account, input.credentials, input.closeTime);
  return {
    account: input.account,
    current,
    scenario,
    outcome: current.admitted && !scenario.admitted ? "Would lose access"
      : !current.admitted && scenario.admitted ? "Would gain access" : "Access unchanged",
    assumption: "Hypothetical rule removal at the snapshot time. Credentials stay as observed.",
  };
}
