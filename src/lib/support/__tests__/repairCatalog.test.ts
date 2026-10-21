import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCESS_EVENT_LABEL, REPAIR_ACTIONS, REPAIR_IDS, REPAIR_REFUSALS, RepairError } from "../repairCatalog";

/*
 * The repair allowlist exists twice: here (what the app can run and how it
 * is described) and in the database (what NOSHREPAIR may propose). If they
 * drift, either staff can propose something the app does not know, or the
 * app offers something the database refuses. Both copies must match exactly.
 */
const sql = readFileSync(new URL("../../../../supabase/migrations/20261021120000_noshrepair.sql", import.meta.url), "utf8");

function sqlLists(): string[][] {
  const lists: string[][] = [];
  for (const match of sql.matchAll(/in \(((?:\s*'[a-z_]+',?)+)\s*\)/g)) {
    const ids = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    if (ids.includes("run_self_repair")) lists.push(ids);
  }
  return lists;
}

describe("repair allowlist", () => {
  it("matches the database in both places it is enforced", () => {
    const lists = sqlLists();
    expect(lists.length).toBe(2); // the table's check constraint and request_support_repair
    for (const list of lists) expect([...list].sort()).toEqual([...REPAIR_IDS].sort());
  });

  it("describes every repair to the customer and to staff", () => {
    for (const a of REPAIR_ACTIONS) {
      expect(a.title.length).toBeGreaterThan(5);
      expect(a.customer.length).toBeGreaterThan(20);
      expect(a.staff.length).toBeGreaterThan(10);
    }
  });

  it("has a label for every access-log event the database writes", () => {
    const events = [...sql.matchAll(/'(access_[a-z]+|account_viewed|repair_[a-z]+|diagnostics_attached)'/g)].map((m) => m[1]);
    for (const e of new Set(events)) expect(ACCESS_EVENT_LABEL).toHaveProperty(e);
  });

  it("explains every refusal code the database returns", () => {
    const codes = new Set([...sql.matchAll(/'code',\s*'([A-Z_]+)'/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(3);
    for (const c of codes) expect(REPAIR_REFUSALS).toHaveProperty(c);
    expect(new RepairError("NO_ACCESS").message).toMatch(/not allowed access/);
  });
});
