import { useAuth } from "@/lib/auth/useAuth";
import { useInvestigations, type Investigation, type Mutation } from "@/lib/desk/investigations";
import type { LedgerEntry } from "@/lib/desk/ledger";
import { can, type PolicyException } from "@/lib/org/governance";
import { appendOrgCase, openOrgCase } from "@/lib/org/cases";
import { nameOf, useOrg } from "@/lib/org/useOrg";

/**
 * The case store the CASES tab and OPEN INVESTIGATION use: the
 * organization's shared, server-held cases when an organization governs
 * this workstation, otherwise the workstation's own. One interface, so the
 * case screens are identical in both modes and only the storage differs.
 */
export type CaseStore = {
  scope: "organization" | "workstation";
  organizationName?: string;
  loaded: boolean;
  error: string | null;
  cases: Investigation[];
  /** Whether this person may write to cases (viewers may not). */
  canWrite: boolean;
  /** The actor string recorded on new events. */
  actor: string;
  /** Display name for a recorded actor. */
  who: (actor: string | undefined) => string;
  /** Organization mode: approved exceptions a closure can rest on. */
  approvedExceptions: PolicyException[];
  open: (entry: LedgerEntry) => Promise<string>;
  mutate: (id: string, m: Mutation) => Promise<void>;
};

export function useCaseStore(): CaseStore {
  const local = useInvestigations();
  const org = useOrg();
  const { user } = useAuth();

  const orgMode = org.state.status === "ready" && org.selectedId !== null;
  if (orgMode) {
    const data = org.data;
    const accountId = org.accountId!;
    const find = (id: string) => data?.cases.find((c) => c.id === id);
    return {
      scope: "organization",
      organizationName: data?.membership.name,
      loaded: data !== null,
      error: data ? null : org.dataError,
      cases: data?.cases ?? [],
      canWrite: can.editDraft(org.role),
      actor: accountId,
      who: (actor) => (data ? nameOf(data.directory, actor) : actor ?? "—"),
      approvedExceptions: data?.exceptions.filter((x) => x.status === "approved") ?? [],
      open: async (entry) => {
        if (!data) throw new Error("The organization is still loading.");
        try {
          return await openOrgCase(data.membership.organizationId, { entry, actor: accountId });
        } finally {
          await org.refresh();
        }
      },
      mutate: async (id, m) => {
        const c = find(id);
        if (!c) throw new Error("Case not found.");
        try {
          await appendOrgCase(c, m, accountId);
        } finally {
          await org.refresh();
        }
      },
    };
  }

  const actor = user?.email ?? "local operator";
  return {
    scope: "workstation",
    loaded: local.loaded,
    error: null,
    cases: local.cases,
    canWrite: true,
    actor,
    who: (a) => a ?? "—",
    approvedExceptions: [],
    open: (entry) => local.open({ entry, actor, now: new Date().toISOString() }),
    mutate: (id, m) => local.mutate(id, m, actor),
  };
}
