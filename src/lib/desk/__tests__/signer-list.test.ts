import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { signerListOf } from "../control";
// @ts-expect-error — untyped JS module, imported deliberately.
import { signerListOf as serverSignerListOf } from "../../../../api/_lib/authority.js";

/*
 * RLUSD's issuer read from mainnet on 2026-10-11 (tests/fixtures). Both the
 * console and the public certificate read its signer list as absent: a
 * typed account_objects page of 10 came back empty because the list sits
 * further down a 19-object owner directory. account_info with
 * signer_lists: true returns it directly.
 */
const rlusd = JSON.parse(readFileSync("tests/fixtures/issuer-state-rlusd-107586974.json", "utf8")).result;
const solo = JSON.parse(readFileSync("tests/fixtures/issuer-state-solo-107586973.json", "utf8")).result;

describe("signer list from account_info", () => {
  for (const [name, read] of [["console", signerListOf], ["server", serverSignerListOf]] as const) {
    it(`${name}: finds RLUSD's 26-member list, quorum 25`, () => {
      const { list, unreadable } = read(rlusd);
      expect(unreadable).toBeUndefined();
      expect(list.SignerQuorum).toBe(25);
      expect(list.SignerEntries).toHaveLength(26);
    });

    it(`${name}: an empty array is "no list", a missing field is "could not look"`, () => {
      expect(read(solo)).toEqual({ list: undefined, unreadable: undefined });
      const { account_data: { signer_lists: _, ...data } } = solo;
      expect(read({ ...solo, account_data: data }).unreadable).toMatch(/did not return/);
    });

    it(`${name}: reads the API v2 shape too`, () => {
      const { signer_lists, ...data } = rlusd.account_data;
      expect(read({ ...rlusd, account_data: data, signer_lists }).list.SignerQuorum).toBe(25);
    });
  }
});
