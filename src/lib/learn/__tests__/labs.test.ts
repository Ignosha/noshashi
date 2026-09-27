import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LABS, LAB_SUBJECTS, allSteps } from "../labs";
import { decodeTokenId } from "@/lib/desk/nft";
import { minimumSignersForQuorum } from "@/lib/desk/control";
import { isValidAddress } from "@/lib/xrpl/client";
import misread from "../misread.cases.json";
import mainnet from "@/lib/desk/__tests__/fixtures/xrpl-mainnet-107193471.json";

/**
 * Labs are only worth doing if what they tell you to look for is true, so
 * every fact a step states is checked here against the mainnet replies
 * recorded in the repository, and every screen a step hands a value to must
 * actually pick it up.
 */

const text = (key: string) => {
  const found = allSteps().find((s) => s.key === key);
  if (!found) throw new Error(`no step ${key}`);
  return `${found.step.task} ${found.step.lookFor} ${found.step.check.question} ${found.step.check.options.join(" ")} ${found.step.check.why}`;
};
const answerOf = (key: string) => {
  const { step } = allSteps().find((s) => s.key === key)!;
  return step.check.options[step.check.answer];
};

describe("lab content is well formed", () => {
  it("has unique lab ids and step keys", () => {
    const labIds = LABS.map((l) => l.id);
    expect(new Set(labIds).size).toBe(labIds.length);
    const keys = allSteps().map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every checkpoint at least three distinct options and a valid answer", () => {
    for (const { key, step } of allSteps()) {
      const { options, answer, why } = step.check;
      expect(options.length, key).toBeGreaterThanOrEqual(3);
      expect(new Set(options).size, key).toBe(options.length);
      expect(Number.isInteger(answer) && answer >= 0 && answer < options.length, key).toBe(true);
      expect(why.length, key).toBeGreaterThan(20);
    }
  });

  it("hands values only to screens that pick them up", () => {
    const dir = "src/components/scenes";
    const source = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    for (const { key, step } of allSteps()) {
      if (!step.subject) continue;
      expect(source.includes(`useClaimedSubject("${step.scene}"`), `${key} → ${step.scene}`).toBe(true);
    }
  });

  it("uses only real, well-formed subjects", () => {
    for (const address of [LAB_SUBJECTS.bitstamp, LAB_SUBJECTS.unfunded, LAB_SUBJECTS.multisig]) {
      expect(isValidAddress(address), address).toBe(true);
    }
    expect(LAB_SUBJECTS.nftFixed).toMatch(/^[0-9A-F]{64}$/);
    expect(LAB_SUBJECTS.nftMutable).toMatch(/^[0-9A-F]{64}$/);
  });

  it("marks the treasury lab as needing the plan its screen needs", () => {
    const treasury = LABS.find((l) => l.id === "treasury")!;
    expect(treasury.requires).toBe("portfolios");
    expect(LABS.filter((l) => l.id !== "treasury").every((l) => !l.requires)).toBe(true);
  });
});

describe("lab facts match the recorded mainnet replies", () => {
  const bitstamp = mainnet.account_info_bitstamp;

  it("Bitstamp: the address, its domain, its freeze right and its 15 bps fee", () => {
    expect(bitstamp.account_data.Account).toBe(LAB_SUBJECTS.bitstamp);
    expect(Buffer.from(bitstamp.account_data.Domain, "hex").toString()).toBe("bitstamp.net");
    expect(bitstamp.account_flags.noFreeze).toBe(false);
    expect(text("address/freeze")).toContain("107,193,471");

    const bps = Math.round((bitstamp.account_data.TransferRate / 1_000_000_000 - 1) * 10_000);
    expect(bps).toBe(15);
    expect(text("address/fee")).toContain(`Charges ${bps} basis points`);
    expect(text("address/fee")).toContain(String(bitstamp.account_data.TransferRate));
    // 1,000 sent at 15 bps: the sender pays 1.50 on top.
    expect(1000 * (bps / 10_000)).toBe(1.5);
    expect(answerOf("address/fee")).toContain("1.50");
  });

  it("the unfunded address answered actNotFound at the ledger the lab names", () => {
    expect(misread.absent.address).toBe(LAB_SUBJECTS.unfunded);
    expect(misread.absent.reply.error).toBe("actNotFound");
    expect(text("address/unfunded")).toContain(misread.absent.ledger.toLocaleString("en-US"));
  });

  it("the multi-signature account: quorum 2 over three weight-1 signers, so two sign", () => {
    const list = misread.quorum.signerList;
    expect(list.Owner).toBe(LAB_SUBJECTS.multisig);
    const signers = list.SignerEntries.map((e) => ({ account: e.SignerEntry.Account, weight: e.SignerEntry.SignerWeight }));
    expect(signers.map((s) => s.weight)).toEqual([1, 1, 1]);
    expect(list.SignerQuorum).toBe(2);
    expect(text("treasury/quorum")).toContain(misread.quorum.ledger.toLocaleString("en-US"));
    expect(answerOf("treasury/quorum")).toBe(String(minimumSignersForQuorum(signers, list.SignerQuorum)));
  });

  it("the weights question is answered by the same rule CONTROL SURFACE uses", () => {
    const signers = [2, 1, 1].map((weight, i) => ({ account: `r${i}`, weight }));
    expect(minimumSignersForQuorum(signers, 3)).toBe(2);
    expect(answerOf("treasury/weights").startsWith("2")).toBe(true);
  });

  it("the fixed NFT decodes to the issuer, fee and rights the lab states", async () => {
    const rights = await decodeTokenId(LAB_SUBJECTS.nftFixed);
    expect(rights.issuer).toBe("r4qHM7vWeLTtWPVoEzDjT6AskpQjSmui7B");
    expect(rights.transferFeePct).toBe(5);
    expect(rights.burnable).toBe(false);
    expect(rights.mutable).toBe(false);
    expect(rights.transferable).toBe(true);
    expect(text("nft/decode")).toContain(rights.issuer);
    expect(text("nft/decode")).toContain(`${rights.transferFeePct.toFixed(3)}% of every resale`);
    // 5% of a 200 XRP resale.
    expect(answerOf("nft/royalty")).toBe(`${(200 * rights.transferFeePct) / 100} XRP`);
  });

  it("the mutable NFT decodes as mutable with a 10% fee", async () => {
    const rights = await decodeTokenId(LAB_SUBJECTS.nftMutable);
    expect(rights.mutable).toBe(true);
    expect(rights.transferFeePct).toBe(10);
    expect(rights.issuer).toBe("rKDFM3xaC3B7ijWkX4iHcMTcLFgxW2dK74");
    expect(text("nft/mutable")).toContain("10% resale fee");
  });

  it("the NOSHX step asks about the same real token", () => {
    const step = allSteps().find((s) => s.key === "noshx/same-readers")!.step;
    expect(step.subject).toContain(LAB_SUBJECTS.nftFixed);
  });
});
