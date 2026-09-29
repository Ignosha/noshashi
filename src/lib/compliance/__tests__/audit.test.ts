import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import deposit from "@/lib/xrpl/__tests__/deposit.cases.json";
import recovery from "@/lib/security/__tests__/recovery.mainnet.json";
import inst from "@/lib/security/__tests__/institutional.mainnet.json";
import { auditRowFromTx, evidencePackage } from "../audit";

/**
 * Audit-trail rows from real mainnet account_tx replies (recorded in the
 * existing fixtures): what was delivered, tags, memos, partial payments.
 */

type Entry = Record<string, any>;

describe("audit trail rows", () => {
  it("reads a phishing dust payment: 1 drop in, the sender as counterparty, the memo decoded", () => {
    const c = (deposit as Entry).phishingDust;
    const row = auditRowFromTx({ tx: c.tx, meta: c.meta, ledger_index: c.tx.ledger_index }, c.watched);
    expect(row.hash).toBe("9D10722A2FD8AAB5DCD5BD1166A06884F881A7724AE57E686E51EDD553C434AD");
    expect(row.direction).toBe("in");
    expect(row.counterparty).toBe("rfWPjcbY5QT2shRFY2SSQHFKPYSMzxaMaN");
    expect(row.delivered).toEqual({ currency: "XRP", issuer: null, value: "0.000001" });
    expect(row.deliveredXrp).toBe(0.000001);
    expect(row.memos[0]).toContain("XAMAN.LA");
    expect(row.partial).toBe(false);
    expect(row.ledger).toBe(104503230);
    // close time 833154001 on the XRPL epoch
    expect(row.date).toBe(new Date((833154001 + 946684800) * 1000).toISOString());
  });

  it("flags a partial payment that delivered less than its Amount", () => {
    const c = (deposit as Entry).rippledThrough;
    const row = auditRowFromTx({ tx: c.tx, meta: c.meta, ledger_index: c.tx.ledger_index }, c.watched);
    expect(row.partial).toBe(true);
    expect(row.delivered).toEqual({ currency: "XLM", issuer: "rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y", value: "593.8292727371549" });
    expect(row.deliveredXrp).toBeNull();
    // The watched account was neither sender nor destination.
    expect(row.direction).toBe("other");
  });

  it("finds the one partial payment in the RLUSD issuer's history and nothing else", () => {
    const rows = (inst as Entry).rlusd_tx.map((e: Entry) => auditRowFromTx(e, "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De"));
    const partial = rows.filter((r: { partial: boolean }) => r.partial);
    expect(partial).toHaveLength(1);
    expect(partial[0].hash).toBe("82597CC998B7A0F71BE2539032B945C888D8077FD93B1C304E5A8E9EABC9266D");
    expect(partial[0].deliveredXrp).toBe(0.100022);
    expect(rows).toHaveLength(200);
  });

  it("keeps the destination tag that ties a deposit to a customer", () => {
    const e = (recovery as Entry).exchange_tx[2];
    const row = auditRowFromTx(e, "rBpXtXVs5b2HjApREMyrT2zhTCQ2fHwWF5");
    expect(row.hash).toBe("20E7CD65F693C2444F96EDB81CE99523BDD0FCEF8B8527A5FDA006FA7C513FA3");
    expect(row.direction).toBe("in");
    expect(row.destinationTag).toBe(124867324);
    expect(row.counterparty).toBe("rEni1epjkJfVXMmMaDDWuz3hFe1mYnqfsk");
  });
});

describe("evidence package", () => {
  it("names the SHA-256 of the exact CSV it ships with, and the ledger range", async () => {
    const subject = "rBpXtXVs5b2HjApREMyrT2zhTCQ2fHwWF5";
    const rows = (recovery as Entry).exchange_tx.map((e: Entry) => auditRowFromTx(e, subject));
    const pkg = await evidencePackage(subject, rows, { sanctions: {}, threats: {}, unchecked: [], screened: 0 }, 10_000);
    expect(pkg.digest).toBe(createHash("sha256").update(pkg.csv).digest("hex"));
    const manifest = JSON.parse(pkg.manifest);
    expect(manifest.csv_sha256).toBe(pkg.digest);
    expect(manifest.rows).toBe(rows.length);
    const ledgers = rows.map((r: { ledger: number }) => r.ledger);
    expect(manifest.ledger_min).toBe(Math.min(...ledgers));
    expect(manifest.ledger_max).toBe(Math.max(...ledgers));
    expect(pkg.csv.split("\n")[0]).toContain("destination_tag");
  });

  it("marks rows at or above the reporting threshold", async () => {
    const subject = "rBpXtXVs5b2HjApREMyrT2zhTCQ2fHwWF5";
    const rows = (recovery as Entry).exchange_tx.map((e: Entry) => auditRowFromTx(e, subject));
    const pkg = await evidencePackage(subject, rows, null, 1);
    const header = pkg.csv.split("\n")[0].split(",");
    const col = header.indexOf("above_threshold");
    const flagged = pkg.csv.split("\n").slice(1).filter((l) => l.split(",")[col] === "true").length;
    expect(flagged).toBe(rows.filter((r: { deliveredXrp: number | null }) => r.deliveredXrp !== null && r.deliveredXrp >= 1).length);
  });
});
