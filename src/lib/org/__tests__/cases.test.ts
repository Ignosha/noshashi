import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { mutate, openCase, verifyCase, type Investigation } from "@/lib/desk/investigations";
import type { LedgerEntry } from "@/lib/desk/ledger";
import { eventFromRow, wireOf } from "@/lib/org/cases";

/**
 * The server (noshashi.append_org_case_event) accepts an event only if
 * SHA-256 of the exact text it receives equals the hash sent, and the text
 * names the next seq, the previous hash and the caller as actor. These
 * tests hold the client to that contract, and prove a case read back from
 * the server verifies with the same code the workstation uses.
 */

const actor = "7d1c3a52-9a1e-4c55-8f0b-3c2f7c1d9e10";
const entry = {
  id: "e1",
  subject: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
  domainCode: "SETL",
  verdict: "hold",
  digest: "A".repeat(64),
  amountXrp: 25_000,
  failedRules: ["POLICY_HHI_LIMIT"],
  checksPassed: 7,
  checksTotal: 8,
  latencyMs: 3,
  at: "2026-09-23T12:00:00.000Z",
  offline: false,
} as LedgerEntry;

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex").toUpperCase();

async function build(): Promise<Investigation> {
  const { data } = await openCase({ schema: 1, cases: [] }, { entry, actor, now: new Date().toISOString() });
  let d = data;
  const id = d.cases[0].id;
  d = await mutate(d, id, { kind: "note", text: "Spoke to the desk — counterparty confirmed ✓ 取引" }, actor, new Date().toISOString());
  d = await mutate(d, id, { kind: "close", outcome: "exception-approved", rationale: "Exception approved by compliance.", exceptionId: "0b7f6c1e-1111-4222-8333-944455556666" }, actor, new Date().toISOString());
  return d.cases[0];
}

describe("organization case events meet the server's contract", () => {
  it("SHA-256 of the transmitted text is the transmitted hash (as Postgres computes it, over UTF-8)", async () => {
    const c = await build();
    for (const e of c.events) {
      const w = wireOf(e);
      expect(sha(w.body)).toBe(w.hash);
    }
  });

  it("each event names its seq, the previous hash and the actor, as the server checks", async () => {
    const c = await build();
    c.events.forEach((e, i) => {
      const b = JSON.parse(wireOf(e).body);
      expect(b.seq).toBe(i);
      expect(b.prev).toBe(i === 0 ? "GENESIS" : c.events[i - 1].hash);
      expect(b.actor).toBe(actor);
      expect(Math.abs(Date.parse(b.at) - Date.now())).toBeLessThan(60_000);
    });
  });

  it("a closure on an approved exception carries the exception id inside the hashed text", async () => {
    const c = await build();
    const b = JSON.parse(wireOf(c.events[2]).body);
    expect(b).toMatchObject({ kind: "closed", outcome: "exception-approved", exceptionId: "0b7f6c1e-1111-4222-8333-944455556666" });
  });

  it("a case read back from stored rows verifies with the workstation's own check", async () => {
    const c = await build();
    const rows = c.events.map((e) => ({ case_id: c.id, seq: e.seq, ...wireOf(e) }));
    const back: Investigation = { ...c, events: rows.map(eventFromRow) };
    expect(await verifyCase(back)).toMatchObject({ ok: true });
  });

  it("a stored row altered after the fact fails verification", async () => {
    const c = await build();
    const rows = c.events.map((e) => ({ case_id: c.id, seq: e.seq, ...wireOf(e) }));
    rows[1] = { ...rows[1], body: rows[1].body.replace("confirmed", "denied") };
    const back: Investigation = { ...c, events: rows.map(eventFromRow) };
    expect((await verifyCase(back)).ok).toBe(false);
  });

  it("unreadable stored text fails verification rather than being skipped", async () => {
    const c = await build();
    const rows = c.events.map((e) => ({ case_id: c.id, seq: e.seq, ...wireOf(e) }));
    rows[1] = { ...rows[1], body: "{not json" };
    const back: Investigation = { ...c, events: rows.map(eventFromRow) };
    expect((await verifyCase(back)).ok).toBe(false);
  });

  it("the case id matches the server's pattern", async () => {
    const c = await build();
    expect(c.id).toMatch(/^case-[a-z0-9-]{4,80}$/);
  });

  it("local cases without an exception id hash exactly as before (no new field appears)", async () => {
    const { data } = await openCase({ schema: 1, cases: [] }, { entry, actor: "local operator", now: "2026-09-23T12:00:00.000Z" });
    const d = await mutate(data, data.cases[0].id, { kind: "close", outcome: "cleared", rationale: "Nothing found on review." }, "local operator", "2026-09-23T12:05:00.000Z");
    expect(wireOf(d.cases[0].events[1]).body).not.toContain("exceptionId");
  });
});
