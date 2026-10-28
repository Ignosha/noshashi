import { describe, it, expect } from "vitest";
import { LABS, LAB_SUBJECTS, labById } from "@/lib/learn/labs";
import { EMPTY_PROGRESS, completeStep, stepKey } from "@/lib/learn/labProgress";
import { objectivesFor, recordEvent, resetLab, results, sanitizeLog, stepIdentifiers } from "../workstation";

const book = labById("book")!;
const amm = labById("amm")!;

describe("lab workstation objectives", () => {
  it("every lab step has open and answer objectives, and read where it hands over a value", () => {
    for (const lab of LABS) {
      for (const step of lab.steps) {
        const ids = objectivesFor(step).map((o) => o.id);
        expect(ids[0]).toBe("open");
        expect(ids[ids.length - 1]).toBe("answer");
        expect(ids.includes("read")).toBe(step.scene !== "agent" && stepIdentifiers(step).length > 0);
      }
    }
  });

  it("finds values typed by hand as well as handed over", () => {
    expect(stepIdentifiers(amm.steps[0])).toEqual([LAB_SUBJECTS.ammPool.toUpperCase()]);
    expect(stepIdentifiers(amm.steps[1])).toEqual([]);
  });

  it("opening a screen meets that objective on every step that uses it", () => {
    const log = recordEvent({}, book, { type: "scene", scene: "book" }, 1);
    for (const step of book.steps) expect(log[stepKey("book", step.id)]?.open).toBe(1);
    expect(recordEvent({}, book, { type: "scene", scene: "amm" }, 1)).toEqual({});
  });

  it("a read counts only when it names the step's value", () => {
    const other = recordEvent({}, book, { type: "read", values: [LAB_SUBJECTS.ammPool] }, 1);
    expect(other).toEqual({});
    const log = recordEvent({}, book, { type: "read", values: [LAB_SUBJECTS.bitstamp.toLowerCase()] }, 2);
    expect(log[stepKey("book", "read")]?.read).toBe(2);
  });

  it("scores every objective, with answers taken from course progress", () => {
    let log = recordEvent({}, book, { type: "scene", scene: "book" }, 1);
    log = recordEvent(log, book, { type: "read", values: [LAB_SUBJECTS.bitstamp] }, 2);
    const half = results(book, log, completeStep(EMPTY_PROGRESS, stepKey("book", "read"), 3));
    expect(half.total).toBe(6);
    expect(half.met).toBe(5);
    expect(half.percent).toBe(83);
    const reset = resetLab(log, book);
    expect(results(book, reset, EMPTY_PROGRESS).met).toBe(0);
  });

  it("keeps only well-formed stored entries", () => {
    expect(sanitizeLog({ "book/read": { open: 1, read: "x" }, bad: 3 })).toEqual({ "book/read": { open: 1 } });
    expect(sanitizeLog("nonsense")).toEqual({});
  });
});
