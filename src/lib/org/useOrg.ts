import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { readSetting, writeSetting } from "@/lib/store";
import { usePolicyStore } from "@/lib/desk/policyStore";
import type { InstitutionalPolicy } from "@/lib/desk/institutional";
import type { Investigation } from "@/lib/desk/investigations";
import { listOrgCases } from "@/lib/org/cases";
import {
  can,
  listDirectory,
  listExceptions,
  listGovernanceAudit,
  listMemberships,
  listPolicies,
  verifiedActive,
  type AuditRow,
  type DirectoryEntry,
  type Membership,
  type OrgPolicy,
  type PolicyException,
} from "@/lib/org/governance";

/**
 * Which organization governs this workstation's verdicts, and its
 * server-held state.
 *
 * Signed in and a member of an organization → that organization's ACTIVE
 * policy governs the gate, as read from the server and re-hashed here.
 * If it cannot be read, the gate is UNAVAILABLE: it never falls back to
 * the workstation's own policy, because that would let a verdict be
 * issued under a policy nobody in the organization approved.
 *
 * Not signed in, or no membership, or the person chose WORKSTATION →
 * the local, single-operator policy store, as before. Its verdicts and
 * exceptions are labelled as local records, not organization approvals.
 */

export type OrgData = {
  membership: Membership;
  policies: OrgPolicy[];
  directory: DirectoryEntry[];
  exceptions: PolicyException[];
  /** Null when the role may not read the audit log (RLS). */
  audit: AuditRow[] | null;
  /** Shared investigations, as stored by the server (verified by the client on display). */
  cases: Investigation[];
  active: { ok: true; policy: InstitutionalPolicy | null } | { ok: false; reason: string };
  loadedAt: string;
};

export type OrgState =
  | { status: "signed-out" }
  | { status: "loading" }
  | { status: "error"; reason: string }
  | { status: "ready"; memberships: Membership[]; selectedId: string | null; data: OrgData | null; dataError: string | null };

const LOCAL = "workstation";
const keyFor = (accountId: string) => `org.selected.${accountId}`;

let state: OrgState = { status: "signed-out" };
let loadedFor: string | null = null;
const listeners = new Set<(s: OrgState) => void>();

function set(next: OrgState) {
  state = next;
  for (const l of listeners) l(next);
}

async function loadOrg(membership: Membership): Promise<OrgData> {
  const id = membership.organizationId;
  const [policies, directory, exceptions, cases] = await Promise.all([listPolicies(id), listDirectory(id), listExceptions(id), listOrgCases(id)]);
  const audit = can.readAudit(membership.role) ? await listGovernanceAudit(id) : null;
  return { membership, policies, directory, exceptions, audit, cases, active: await verifiedActive(policies), loadedAt: new Date().toISOString() };
}

async function load(accountId: string, keepSelection?: string | null) {
  if (state.status !== "ready") set({ status: "loading" });
  try {
    const memberships = await listMemberships(accountId);
    const stored = keepSelection !== undefined ? keepSelection : await readSetting<string | null>(keyFor(accountId), null);
    let selectedId: string | null;
    if (stored === LOCAL) selectedId = null;
    else if (stored && memberships.some((m) => m.organizationId === stored)) selectedId = stored;
    else selectedId = memberships[0]?.organizationId ?? null;

    const membership = memberships.find((m) => m.organizationId === selectedId) ?? null;
    if (!membership) {
      set({ status: "ready", memberships, selectedId: null, data: null, dataError: null });
      return;
    }
    try {
      set({ status: "ready", memberships, selectedId, data: await loadOrg(membership), dataError: null });
    } catch (error) {
      set({ status: "ready", memberships, selectedId, data: null, dataError: error instanceof Error ? error.message : String(error) });
    }
  } catch (error) {
    set({ status: "error", reason: error instanceof Error ? error.message : String(error) });
  }
}

export function useOrg() {
  const { user, loading: authLoading } = useAuth();
  const accountId = user?.id ?? null;
  const [s, setS] = useState<OrgState>(state);

  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => {
      listeners.delete(setS);
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!accountId) {
      loadedFor = null;
      if (state.status !== "signed-out") set({ status: "signed-out" });
      return;
    }
    if (loadedFor !== accountId) {
      loadedFor = accountId;
      set({ status: "loading" });
      void load(accountId);
    }
  }, [accountId, authLoading]);

  const refresh = useCallback(async () => {
    if (!accountId) return;
    const current = state.status === "ready" ? (state.selectedId ?? LOCAL) : undefined;
    await load(accountId, current);
  }, [accountId]);

  const select = useCallback(
    async (organizationId: string | null) => {
      if (!accountId) return;
      const value = organizationId ?? LOCAL;
      await writeSetting(keyFor(accountId), value);
      set({ status: "loading" });
      await load(accountId, value);
    },
    [accountId]
  );

  const ready = s.status === "ready" ? s : null;
  return {
    state: s,
    accountId,
    memberships: ready?.memberships ?? [],
    selectedId: ready?.selectedId ?? null,
    data: ready?.data ?? null,
    dataError: ready?.dataError ?? null,
    role: ready?.data?.membership.role ?? null,
    authLoading,
    refresh,
    select,
  };
}

/** Who a server-recorded account id is, for AUTHOR / ACTIVATED BY / REQUESTED BY. */
export function nameOf(directory: DirectoryEntry[], accountId: string | null | undefined): string {
  if (!accountId) return "—";
  const d = directory.find((x) => x.accountId === accountId);
  return d ? d.displayName || d.email : `former member ${accountId.slice(0, 8)}`;
}

export type GoverningPolicy = {
  source: "organization" | "workstation";
  organizationName?: string;
  state: { status: "loading" } | { status: "unavailable"; reason: string } | { status: "ready" };
  active: InstitutionalPolicy | null;
};

/**
 * The policy every new verdict uses. One answer for the gate, the status
 * rail and the agent, so they can never disagree about which is in force.
 */
export function useGoverningPolicy(): GoverningPolicy {
  const local = usePolicyStore();
  const org = useOrg();

  // Until sign-in state is known, it is not known which policy governs.
  if (org.authLoading) return { source: "workstation", state: { status: "loading" }, active: null };

  const orgMode =
    org.state.status === "loading" ||
    org.state.status === "error" ||
    (org.state.status === "ready" && org.selectedId !== null);

  if (!orgMode) {
    return {
      source: "workstation",
      state: local.state.status === "ready" ? { status: "ready" } : local.state,
      active: local.active,
    };
  }
  if (org.state.status === "loading") return { source: "organization", state: { status: "loading" }, active: null };
  if (org.state.status === "error") {
    return { source: "organization", state: { status: "unavailable", reason: `Organization policy could not be loaded: ${org.state.reason}` }, active: null };
  }
  if (!org.data) {
    return {
      source: "organization",
      state: { status: "unavailable", reason: `Organization policy could not be loaded: ${org.dataError ?? "unknown error"}` },
      active: null,
    };
  }
  const a = org.data.active;
  return a.ok
    ? { source: "organization", organizationName: org.data.membership.name, state: { status: "ready" }, active: a.policy }
    : { source: "organization", organizationName: org.data.membership.name, state: { status: "unavailable", reason: a.reason }, active: null };
}

/** For tests. */
export function __resetOrg() {
  state = { status: "signed-out" };
  loadedFor = null;
}
