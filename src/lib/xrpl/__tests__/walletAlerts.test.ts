import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  describeWalletEvent,
  MAX_LINES,
  walletAlertText,
  walletEvents,
} from "../../../../supabase/functions/_shared/walletAlerts.ts";

/*
 * Hosted Treasury Guard rules, on five real account_tx entries read from
 * mainnet (tests/fixtures/README.md): two SOLO payments from rPBJGL… into
 * the SOLO issuer, two partial-payment self-conversions by rogue5… that
 * rippled through it, and an OfferCancel by a third account. Variations
 * change one field of a real entry, the way a different transaction would.
 */
const rows: any[] = JSON.parse(readFileSync("tests/fixtures/account-tx-solo-107587061.json", "utf8")).transactions;
const SOLO = "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz";
const SENDER = "rPBJGLCysYLSrfH6SttjoWkYW3Pvu2qPR";
const ROGUE = "rogue5HnPRSszD9CWGSUz8UGHMVwSSKF6";
const STOP = "https://www.noshashi.app/alerts/?unsubscribe=" + "a".repeat(48);

describe("walletEvents on real entries", () => {
  it("for the issuer: keeps the two incoming token payments, drops what only rippled through", () => {
    const events = walletEvents(rows, SOLO);
    expect(events.map((e) => e.type)).toEqual(["payment_in", "payment_in"]);
    expect(events.every((e) => e.counterparty === SENDER)).toBe(true);
  });

  it("orders events oldest ledger first", () => {
    const ledgers = walletEvents(rows, SOLO).map((e) => e.ledgerIndex);
    expect(ledgers).toEqual([...ledgers].sort((a, b) => a - b));
    expect(ledgers[0]).toBe(107584219);
  });

  it("for the sender: both payments are money out, marked high", () => {
    const events = walletEvents(rows, SENDER);
    expect(events.map((e) => e.type)).toEqual(["payment_out", "payment_out"]);
    for (const e of events) {
      const line = describeWalletEvent(e, SENDER);
      expect(line.severity).toBe("high");
      expect(line.text).toMatch(/^Sent .* SOLO.* to rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz/);
    }
  });

  it("for the converter: its own partial-payment conversions are reported, as its own", () => {
    const events = walletEvents(rows, ROGUE);
    expect(events.length).toBe(2);
    expect(events.every((e) => e.type === "payment_self")).toBe(true);
  });

  it("leaves out incoming XRP dust under 1 XRP, keeps 1 XRP and more", () => {
    const base = rows[0];
    const asXrp = (drops: string) => ({ ...base, meta: { ...base.meta, delivered_amount: drops }, tx: { ...base.tx, DeliverMax: drops, Amount: drops } });
    expect(walletEvents([asXrp("500000")], SOLO)).toEqual([]);
    expect(walletEvents([asXrp("1000000")], SOLO).map((e) => e.type)).toEqual(["payment_in"]);
  });

  it("skips entries the server marks unvalidated", () => {
    expect(walletEvents(rows.map((r) => ({ ...r, validated: false })), SOLO)).toEqual([]);
  });

  it("says when a transaction failed", () => {
    const failed = { ...rows[0], meta: { ...rows[0].meta, TransactionResult: "tecPATH_DRY" } };
    const [e] = walletEvents([failed], SENDER);
    expect(describeWalletEvent(e, SENDER).text).toContain("(failed: tecPATH_DRY)");
  });
});

describe("walletAlertText", () => {
  it("names the wallet, the last ledger, each line with its ledger, and the stop link", () => {
    const text = walletAlertText(SENDER, walletEvents(rows, SENDER), STOP);
    expect(text).toContain("NOSHASHI · treasury wallet activity");
    expect(text).toContain(`${SENDER} up to ledger 107585451`);
    expect(text.match(/· ledger \d+/g)?.length).toBe(2);
    expect(text).toContain(`Stop these alerts: ${STOP}`);
    expect(text).toContain("Ledger facts, not advice.");
  });

  it("counts lines past the limit instead of dropping them silently", () => {
    const many = Array.from({ length: MAX_LINES + 3 }, () => rows[0]);
    const text = walletAlertText(SENDER, walletEvents(many, SENDER), STOP);
    expect(text.match(/^🔴 Sent/gm)?.length).toBe(MAX_LINES);
    expect(text).toContain("…and 3 more.");
  });
});
