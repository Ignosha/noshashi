import { describe, expect, it } from "vitest";
import { sanctionsFinding } from "../counterparty";

/*
 * The address check's sanctions finding. CHATEX is the XRP address the
 * US Treasury lists (OFAC SDN entry 33854, program CYBER2), as the daily
 * refresh read it from treasury.gov.
 */

const CHATEX = {
  address: "rnXyVQzgxZe7TR1EPzTkGj2jxH4LMJYh66",
  list: "OFAC SDN",
  entityNumber: 33854,
  entityName: "CHATEX",
  program: "CYBER2",
  sourceUrl: "https://www.treasury.gov/ofac/downloads/sdn_comments.csv",
};
const LIST = { hits: { [CHATEX.address]: CHATEX }, listAsOf: "2026-09-28T04:30:00Z", listed: 1 };

describe("sanctions in the address check", () => {
  it("names the listing, its entry and its source, as the most serious finding", () => {
    const f = sanctionsFinding(CHATEX.address, LIST);
    expect(f).toMatchObject({ id: "sanctioned", severity: "critical", title: "On the OFAC SDN sanctions list: CHATEX" });
    expect(f?.detail).toContain("entry 33854, program CYBER2");
    expect(f?.detail).toContain("as of 2026-09-28");
    expect(f?.detail).toContain("treasury.gov");
  });

  it("says an unlisted address is not a clearance", () => {
    const f = sanctionsFinding("rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", LIST);
    expect(f).toMatchObject({ id: "not-sanctioned", severity: "ok" });
    expect(f?.detail).toMatch(/not a clearance/);
  });

  it("never reads a failed lookup as unlisted", () => {
    expect(sanctionsFinding(CHATEX.address, null)).toMatchObject({ id: "sanctions-unchecked", severity: "info" });
  });
});
