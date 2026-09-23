import { describe, it, expect } from "vitest";
import { exportCase, mutate, openCase, stateOf, verifyCase, type CaseData } from "../investigations";
import { receiptToEntry, type LedgerEntry } from "../ledger";
import { runPolicy, type PermissionedDomain } from "@/lib/policy";
import { verifyEntry } from "../evidence";

const domain: PermissionedDomain = { id: "d", name: "D", code: "DEX-US", institution: "D", requirements: ["KYC_LEVEL_1"], transferCeilingXrp: 1e6, governance: "active", members: 1 };
const account = { address: "rSubjectAAAA", balanceXrp: "1000", sequence: 3, ownerCount: 1, domain: "x.com" };

async function verdict(held = false): Promise<LedgerEntry> {
  const creds = held ? [{ subject: "rS", issuer: "rI", credentialType: "KYC_LEVEL_1", accepted: true, revoked: false }] : [];
  return receiptToEntry(await runPolicy({ account, credentials: creds, domain, amountXrp: 50 }), { domainCode: "DEX-US" });
}

const empty = (): CaseData => ({ schema: 1, cases: [] });
const t = (n: number) => new Date(Date.UTC(2026, 8, 23, 12, n)).toISOString();

describe("investigations", () => {
  it("opens a case on a verdict, freezing what the verdict was", async () => {
    const e = await verdict();
    const { data, id } = await openCase(empty(), { entry: e, actor: "alice@x", now: t(0) });
    const c = data.cases[0];
    const s = stateOf(c);
    expect(c.id).toBe(id);
    expect(s).toMatchObject({ status: "open", priority: "high", openedBy: "alice@x" });
    expect(s.linked[0]).toMatchObject({ verdict: "no-go", digest: e.digest, exceptions: ["CREDENTIAL_KYC_LEVEL_1"] });
    expect((await verifyCase(c)).ok).toBe(true);
  });

  it("records a person's resolution without touching the verdict or its receipt", async () => {
    const e = await verdict();
    const before = JSON.stringify(e);
    let { data, id } = await openCase(empty(), { entry: e, actor: "alice", now: t(0) });
    data = await mutate(data, id, { kind: "status", to: "in-review" }, "alice", t(1));
    data = await mutate(data, id, { kind: "note", text: "Credential issuance confirmed out of band with the issuer." }, "alice", t(2));
    data = await mutate(data, id, { kind: "close", outcome: "exception-approved", rationale: "Issuer confirmed the credential; approved by compliance lead." }, "bob", t(3));
    const s = stateOf(data.cases[0]);
    expect(s).toMatchObject({ status: "closed", outcome: "exception-approved", closedAt: t(3) });
    expect(JSON.stringify(e)).toBe(before);
    expect(e.verdict).toBe("no-go");
    expect((await verifyEntry(e)).state).toBe("verified");
  });

  it("requires a rationale to close and a reason to reopen; a closed case is fixed", async () => {
    let { data, id } = await openCase(empty(), { entry: await verdict(), actor: "a", now: t(0) });
    await expect(mutate(data, id, { kind: "close", outcome: "cleared", rationale: "ok" }, "a", t(1))).rejects.toThrow(/rationale/);
    data = await mutate(data, id, { kind: "close", outcome: "cleared", rationale: "Reviewed; the domain requirement was met." }, "a", t(1));
    await expect(mutate(data, id, { kind: "note", text: "late note" }, "a", t(2))).rejects.toThrow(/closed case is fixed/);
    await expect(mutate(data, id, { kind: "reopen", reason: "no" }, "a", t(2))).rejects.toThrow(/reason/);
    data = await mutate(data, id, { kind: "reopen", reason: "New transfer from the same subject." }, "a", t(2));
    expect(stateOf(data.cases[0]).status).toBe("open");
  });

  it("links further verdicts once each", async () => {
    let { data, id } = await openCase(empty(), { entry: await verdict(), actor: "a", now: t(0) });
    const second = await verdict(true);
    data = await mutate(data, id, { kind: "link", entry: second }, "a", t(1));
    expect(stateOf(data.cases[0]).linked.map((l) => l.verdict)).toEqual(["no-go", "go"]);
    await expect(mutate(data, id, { kind: "link", entry: second }, "a", t(2))).rejects.toThrow(/already linked/);
  });

  it("detects an edited, removed or reordered event, and refuses to write to a broken case", async () => {
    let { data, id } = await openCase(empty(), { entry: await verdict(), actor: "a", now: t(0) });
    data = await mutate(data, id, { kind: "note", text: "first note" }, "a", t(1));
    data = await mutate(data, id, { kind: "note", text: "second note" }, "a", t(2));
    const c = data.cases[0];

    const edited = structuredClone(c);
    edited.events[1].text = "rewritten";
    expect(await verifyCase(edited)).toMatchObject({ ok: false, at: 1 });

    const removed = structuredClone(c);
    removed.events.splice(1, 1);
    expect((await verifyCase(removed)).ok).toBe(false);

    const reordered = structuredClone(c);
    [reordered.events[1], reordered.events[2]] = [reordered.events[2], reordered.events[1]];
    expect((await verifyCase(reordered)).ok).toBe(false);

    await expect(mutate({ schema: 1, cases: [edited] }, id, { kind: "note", text: "x" }, "a", t(3))).rejects.toThrow(/integrity/);
  });

  it("exports a self-describing, verifiable case file", async () => {
    const { data } = await openCase(empty(), { entry: await verdict(), actor: "a", now: t(0) });
    const out = JSON.parse(await exportCase(data.cases[0]));
    expect(out.format).toBe("noshashi.investigation/1");
    expect(out.integrity.chain).toBe("intact");
    expect(out.integrity.head).toBe(data.cases[0].events[0].hash);
  });
});
