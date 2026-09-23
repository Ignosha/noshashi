import { describe, it, expect } from "vitest";
import { activate, createDraft, discardDraft, keyOf, paramsFromRules, saveDraft, verifyStore, type PolicyData } from "../policyStore";
import { DEFAULT_RULES } from "../rules";

const empty = (): PolicyData => ({ schema: 1, versions: [], audit: [] });
const now = "2026-09-23T14:00:00.000Z";
const later = "2026-09-23T15:00:00.000Z";
const withRate = () => {
  const p = paramsFromRules(DEFAULT_RULES, false);
  return { ...p, travelRule: { ...p.travelRule!, xrpReferenceRate: 2 } };
};

describe("policy versions", () => {
  it("a new draft is never active", async () => {
    const d = await createDraft(empty(), { params: withRate(), actor: "a@x", now });
    expect(d.versions).toHaveLength(1);
    expect(d.versions[0]).toMatchObject({ version: 1, status: "draft" });
    expect(d.versions.find((v) => v.status === "active")).toBeUndefined();
  });

  it("imports shipped defaults without inventing a price", () => {
    const p = paramsFromRules(DEFAULT_RULES, false);
    expect(p.travelRule!.xrpReferenceRate).toBeNull();
    expect(p.hhiLimit).toBe(DEFAULT_RULES.hhiMaxBeforeHold);
    expect(p.strictFreeze).toBe(DEFAULT_RULES.strictFreezeRights);
  });

  it("refuses to activate an invalid draft", async () => {
    const d = await createDraft(empty(), { params: paramsFromRules(DEFAULT_RULES, false), actor: "a", now });
    const r = activate(d, keyOf(d.versions[0]), "a", now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].field).toBe("travelRule.xrpReferenceRate");
  });

  it("activation archives the previous version and records who, when and what changed", async () => {
    let d = await createDraft(empty(), { params: withRate(), actor: "a", now });
    const v1 = activate(d, keyOf(d.versions[0]), "alice", now);
    if (!v1.ok) throw new Error("v1");
    d = await createDraft(v1.data, { params: { ...withRate(), hhiLimit: 3000 }, actor: "bob", now: later });
    const v2key = keyOf(d.versions.find((v) => v.status === "draft")!);
    // The draft does not replace the active policy.
    expect(d.versions.find((v) => v.status === "active")!.version).toBe(1);
    const v2 = activate(d, v2key, "bob", later);
    if (!v2.ok) throw new Error("v2");
    const byVersion = Object.fromEntries(v2.data.versions.map((v) => [v.version, v]));
    expect(byVersion[1].status).toBe("archived");
    expect(byVersion[2]).toMatchObject({ status: "active", effectiveAt: later, activatedBy: "bob" });
    expect(v2.data.audit[0]).toMatchObject({ action: "activated", version: 2, fromVersion: 1, actor: "bob" });
    expect(v2.data.audit[0].changes).toEqual([{ field: "hhiLimit", label: "HHI limit", from: "2,500", to: "3,000" }]);
    // Archived v1 is still there, unchanged, for historical verdicts.
    expect(byVersion[1].params.hhiLimit).toBe(2500);
    expect(byVersion[1].hash).toBe(d.versions.find((v) => v.version === 1)!.hash);
  });

  it("active and archived versions cannot be edited; drafts rehash on save", async () => {
    const d = await createDraft(empty(), { params: withRate(), actor: "a", now });
    const k = keyOf(d.versions[0]);
    const saved = await saveDraft(d, k, { params: { ...withRate(), hhiLimit: 1234 } }, "a", later);
    expect(saved.versions[0].hash).not.toBe(d.versions[0].hash);
    const act = activate(saved, k, "a", later);
    if (!act.ok) throw new Error("act");
    await expect(saveDraft(act.data, k, { params: withRate() }, "a", later)).rejects.toThrow(/Only a draft/);
    expect(() => discardDraft(act.data, k, "a", later)).toThrow();
  });

  it("only one open draft per policy", async () => {
    const d = await createDraft(empty(), { params: withRate(), actor: "a", now });
    await expect(createDraft(d, { params: withRate(), actor: "a", now })).rejects.toThrow(/open draft/);
  });

  it("a stored version edited outside the app makes the store unavailable", async () => {
    const d = await createDraft(empty(), { params: withRate(), actor: "a", now });
    expect((await verifyStore(d)).ok).toBe(true);
    const tampered = structuredClone(d);
    tampered.versions[0].params.hhiLimit = 9999;
    const r = await verifyStore(tampered);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("does not match its hash");
    expect((await verifyStore({ nonsense: true })).ok).toBe(false);
  });
});
