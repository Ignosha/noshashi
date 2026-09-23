import { useEffect, useState } from "react";
import { readSetting, writeSetting } from "@/lib/store";
import { DEFAULT_RULES, type RuleSet } from "@/lib/desk/rules";
import {
  diffParams,
  policyHash,
  validateParams,
  type InstitutionalPolicy,
  type ParamChange,
  type PolicyError,
  type PolicyParams,
} from "@/lib/desk/institutional";

/**
 * Versioned institutional policies, kept on this workstation.
 *
 * - A DRAFT can be edited and simulated; it never affects a verdict.
 * - Exactly one version is ACTIVE; every new verdict uses it.
 * - Activating a draft ARCHIVES the previous active version. Archived
 *   versions stay here so any historical verdict can be shown against the
 *   exact policy that produced it.
 * - Every version is hashed; a stored version whose hash no longer
 *   matches its content makes the store UNAVAILABLE rather than silently
 *   trusted, and no institutional verdict is produced until it is fixed.
 * - Every change writes an audit event.
 *
 * There is no organisation or role model in this build, so policies are
 * local to this workstation and the actor recorded is the signed-in
 * account, or "local operator" when no one is signed in.
 */

export type PolicyAuditEvent = {
  at: string;
  action: "draft-created" | "draft-saved" | "draft-discarded" | "activated" | "archived";
  policyId: string;
  name: string;
  version: number;
  fromVersion?: number;
  changes: ParamChange[];
  actor: string;
  hash: string;
  status: "success";
};

export type PolicyData = {
  schema: 1;
  versions: InstitutionalPolicy[];
  audit: PolicyAuditEvent[];
};

const KEY = "engine.policies";
const LEGACY_RULES_KEY = "engine.ruleset";
const MAX_AUDIT = 5_000;

export const DEFAULT_PROFILE = { id: "policy_settlement", name: "Institutional Settlement" };

/** The thresholds the product shipped with (src/lib/desk/rules.ts), as policy parameters. */
export function paramsFromRules(rules: RuleSet, rateKnown: boolean): PolicyParams {
  return {
    hhiLimit: rules.hhiMaxBeforeHold,
    counterpartyShareLimitPct: rules.counterpartyMaxSharePct,
    travelRule: {
      thresholdFiat: rules.travelRuleThresholdFiat,
      currency: rules.travelRuleCurrency,
      // A reference price is only carried over if the operator saved one.
      xrpReferenceRate: rateKnown ? rules.xrpReferenceRate : null,
    },
    reserveHeadroomMinXrp: rules.minReserveHeadroomXrp,
    strictFreeze: rules.strictFreezeRights,
    outcomes: { hhi: "review", counterparty: "review", travelRule: "review", reserve: "review", freeze: "fail" },
  };
}

export const keyOf = (p: Pick<InstitutionalPolicy, "id" | "version">) => `${p.id}@${p.version}`;

/* ── Pure transitions (tested directly) ───────────────────────────── */

export async function createDraft(
  data: PolicyData,
  input: { id?: string; name?: string; params: PolicyParams; actor: string; now: string; origin?: string }
): Promise<PolicyData> {
  const id = input.id ?? DEFAULT_PROFILE.id;
  const siblings = data.versions.filter((v) => v.id === id);
  if (siblings.some((v) => v.status === "draft")) {
    throw new Error("This policy already has an open draft. Save, activate or discard it first.");
  }
  const name = (input.name ?? siblings[0]?.name ?? DEFAULT_PROFILE.name).trim().slice(0, 60) || DEFAULT_PROFILE.name;
  const version = Math.max(0, ...siblings.map((v) => v.version)) + 1;
  const params = structuredClone(input.params);
  const draft: InstitutionalPolicy = {
    id,
    name,
    version,
    status: "draft",
    params,
    hash: await policyHash({ id, name, version, params }),
    createdAt: input.now,
    updatedAt: input.now,
    createdBy: input.actor,
    origin: input.origin,
  };
  const active = data.versions.find((v) => v.status === "active" && v.id === id);
  return {
    ...data,
    versions: [...data.versions, draft],
    audit: [
      auditOf("draft-created", draft, input.actor, input.now, active ? diffParams(active.params, params) : [], active?.version),
      ...data.audit,
    ].slice(0, MAX_AUDIT),
  };
}

export async function saveDraft(
  data: PolicyData,
  key: string,
  patch: { name?: string; params?: PolicyParams },
  actor: string,
  now: string
): Promise<PolicyData> {
  const draft = data.versions.find((v) => keyOf(v) === key);
  if (!draft || draft.status !== "draft") throw new Error("Only a draft can be edited. Active and archived versions are fixed.");
  const name = (patch.name ?? draft.name).trim().slice(0, 60) || draft.name;
  const params = structuredClone(patch.params ?? draft.params);
  const next: InstitutionalPolicy = {
    ...draft,
    name,
    params,
    hash: await policyHash({ id: draft.id, name, version: draft.version, params }),
    updatedAt: now,
    origin: undefined,
  };
  return {
    ...data,
    versions: data.versions.map((v) => (keyOf(v) === key ? next : v)),
    audit: [auditOf("draft-saved", next, actor, now, diffParams(draft.params, params)), ...data.audit].slice(0, MAX_AUDIT),
  };
}

export function discardDraft(data: PolicyData, key: string, actor: string, now: string): PolicyData {
  const draft = data.versions.find((v) => keyOf(v) === key);
  if (!draft || draft.status !== "draft") throw new Error("Only a draft can be discarded.");
  return {
    ...data,
    versions: data.versions.filter((v) => keyOf(v) !== key),
    audit: [auditOf("draft-discarded", draft, actor, now, []), ...data.audit].slice(0, MAX_AUDIT),
  };
}

export type ActivationResult = { ok: true; data: PolicyData } | { ok: false; errors: PolicyError[] };

/**
 * Make a draft the active policy. The previous active version, of any
 * profile, is archived: one policy governs the settlement gate at a time.
 */
export function activate(data: PolicyData, key: string, actor: string, now: string): ActivationResult {
  const draft = data.versions.find((v) => keyOf(v) === key);
  if (!draft || draft.status !== "draft") {
    return { ok: false, errors: [{ field: "status", message: "Only a draft can be activated." }] };
  }
  const errors = validateParams(draft.params);
  if (errors.length) return { ok: false, errors };

  const previous = data.versions.find((v) => v.status === "active");
  const versions = data.versions.map((v): InstitutionalPolicy => {
    if (keyOf(v) === key) return { ...v, status: "active", effectiveAt: now, activatedBy: actor, updatedAt: now, origin: undefined };
    if (v.status === "active") return { ...v, status: "archived", archivedAt: now, updatedAt: now };
    return v;
  });
  const events: PolicyAuditEvent[] = [
    auditOf(
      "activated",
      draft,
      actor,
      now,
      previous ? diffParams(previous.params, draft.params) : [],
      previous && previous.id === draft.id ? previous.version : undefined
    ),
  ];
  if (previous) events.push(auditOf("archived", previous, actor, now, []));
  return { ok: true, data: { ...data, versions, audit: [...events, ...data.audit].slice(0, MAX_AUDIT) } };
}

function auditOf(
  action: PolicyAuditEvent["action"],
  p: InstitutionalPolicy,
  actor: string,
  at: string,
  changes: ParamChange[],
  fromVersion?: number
): PolicyAuditEvent {
  return { at, action, policyId: p.id, name: p.name, version: p.version, fromVersion, changes, actor, hash: p.hash, status: "success" };
}

/** Recompute every stored hash. Any mismatch means the store cannot be trusted. */
export async function verifyStore(data: unknown): Promise<{ ok: true; data: PolicyData } | { ok: false; reason: string }> {
  const d = data as PolicyData;
  if (!d || d.schema !== 1 || !Array.isArray(d.versions) || !Array.isArray(d.audit)) {
    return { ok: false, reason: "The stored policy file is not in a recognised format." };
  }
  if (d.versions.filter((v) => v.status === "active").length > 1) {
    return { ok: false, reason: "More than one policy version is marked active." };
  }
  for (const v of d.versions) {
    const expected = await policyHash(v).catch(() => null);
    if (expected !== v.hash) {
      return { ok: false, reason: `Stored policy ${v.name} v${v.version} does not match its hash; it may have been edited outside NOSHASHI.` };
    }
  }
  return { ok: true, data: d };
}

/* ── Shared store ─────────────────────────────────────────────────── */

export type PolicyStoreState =
  | { status: "loading" }
  | { status: "unavailable"; reason: string }
  | { status: "ready"; data: PolicyData };

let state: PolicyStoreState = { status: "loading" };
let loading: Promise<void> | null = null;
const listeners = new Set<(s: PolicyStoreState) => void>();

function set(next: PolicyStoreState) {
  state = next;
  for (const l of listeners) l(next);
}

async function load() {
  try {
    const stored = await readSetting<unknown>(KEY, null);
    if (stored === null) {
      // First run: carry the thresholds the operator already saved (or the
      // shipped defaults) into a DRAFT. Nothing becomes active by itself.
      const legacy = await readSetting<Partial<RuleSet> | null>(LEGACY_RULES_KEY, null);
      const rules = { ...DEFAULT_RULES, ...(legacy ?? {}) } as RuleSet;
      const now = new Date().toISOString();
      const data = await createDraft(
        { schema: 1, versions: [], audit: [] },
        {
          params: paramsFromRules(rules, legacy !== null),
          actor: "system",
          now,
          origin: legacy
            ? "Imported from the thresholds saved in the previous rule editor."
            : "Pre-filled with the product's shipped defaults. These are placeholders, not recommendations, legal requirements or XRPL policy.",
        }
      );
      await writeSetting(KEY, data);
      set({ status: "ready", data });
      return;
    }
    const verified = await verifyStore(stored);
    set(verified.ok ? { status: "ready", data: verified.data } : { status: "unavailable", reason: verified.reason });
  } catch (error) {
    set({ status: "unavailable", reason: error instanceof Error ? error.message : "Policy storage could not be read." });
  }
}

async function commit(next: PolicyData) {
  await writeSetting(KEY, next);
  set({ status: "ready", data: next });
}

export function usePolicyStore() {
  const [s, setS] = useState<PolicyStoreState>(state);
  useEffect(() => {
    listeners.add(setS);
    if (!loading) loading = load();
    setS(state);
    return () => {
      listeners.delete(setS);
    };
  }, []);

  const data = s.status === "ready" ? s.data : null;
  const require = () => {
    if (state.status !== "ready") throw new Error("Policy store is not available.");
    return state.data;
  };

  return {
    state: s,
    active: data?.versions.find((v) => v.status === "active") ?? null,
    drafts: data?.versions.filter((v) => v.status === "draft") ?? [],
    versions: data?.versions ?? [],
    audit: data?.audit ?? [],
    createDraft: async (input: Parameters<typeof createDraft>[1]) => commit(await createDraft(require(), input)),
    saveDraft: async (key: string, patch: { name?: string; params?: PolicyParams }, actor: string) =>
      commit(await saveDraft(require(), key, patch, actor, new Date().toISOString())),
    discardDraft: async (key: string, actor: string) => commit(discardDraft(require(), key, actor, new Date().toISOString())),
    activate: async (key: string, actor: string): Promise<PolicyError[]> => {
      const result = activate(require(), key, actor, new Date().toISOString());
      if (!result.ok) return result.errors;
      await commit(result.data);
      return [];
    },
    /** Look up the exact version a historical verdict names. */
    find: (id: string, version: number) => data?.versions.find((v) => v.id === id && v.version === version) ?? null,
  };
}

/** For tests: forget the shared state. */
export function __resetPolicyStore() {
  state = { status: "loading" };
  loading = null;
}
