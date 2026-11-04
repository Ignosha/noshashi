import {
  credentialsOf,
  directoryDomains,
  domainsOwnedBy,
  readDomain,
  validatedLedger,
  type CredentialEntry,
  type DomainEntry,
  type LedgerAt,
} from "./registry";

const reader = {
  validatedLedger,
  directoryDomains,
  domainsOwnedBy,
  readDomain,
  credentialsOf,
};
export type AccountDomainReading = {
  ledger: LedgerAt;
  domains: DomainEntry[];
  held: CredentialEntry[];
  note: string;
  directoryError: string | null;
};

/** The directory discovers candidates; live ledger objects decide admission. */
export async function accountDomainReading(
  account: string,
  io = reader,
): Promise<AccountDomainReading> {
  const ledger = await io.validatedLedger();
  const [held, owned] = await Promise.all([
    io.credentialsOf(account, "subject", ledger.index),
    io.domainsOwnedBy(account, ledger.index),
  ]);
  const base = { ledger, held, domains: owned };
  if (!held.length)
    return {
      ...base,
      directoryError: null,
      note: "No held credentials were found. Only owned domains can admit this account; those were read directly, without the directory.",
    };
  try {
    const directory = await io.directoryDomains();
    const candidates = directory.domains.filter(
      (d) =>
        !d.removedAt &&
        d.owner !== account &&
        d.accepted.some((a) =>
          held.some((c) => c.issuer === a.issuer && c.typeHex === a.typeHex),
        ),
    );
    const unique = [...new Set(candidates.map((d) => d.domainId))];
    const results = await Promise.allSettled(
      unique.slice(0, 40).map((id) => io.readDomain(id, ledger.index)),
    );
    const live = results.flatMap((r) =>
      r.status === "fulfilled" && r.value ? [r.value] : [],
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    return {
      ...base,
      domains: [...owned, ...live],
      directoryError: null,
      note: `Directory used for discovery only; ${live.length} credential-matching domain objects re-read at the same ledger as the credentials. New domains may be absent from the directory.${failed ? ` ${failed} candidates could not be read; their admission is unknown.` : ""}${unique.length > 40 ? " Only the first 40 candidates were checked; coverage is incomplete." : ""}`,
    };
  } catch (error) {
    return {
      ...base,
      directoryError:
        error instanceof Error
          ? error.message
          : "The domain directory is unavailable.",
      note: "Only owned domains were checked. Admission to other domains is unknown. Retry discovery or check a known domain ID directly.",
    };
  }
}
