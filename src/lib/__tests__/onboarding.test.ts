import { describe, expect, it } from "vitest";
import { firstRunSteps, nextStep, showGuide, type FirstRunFacts } from "@/lib/onboarding";

const fresh: FirstRunFacts = { modeChosen: false, verdicts: 0, evidenceChecked: false, activePolicy: false, workstation: true };

describe("first-run steps", () => {
  it("runs purpose → view → analysis → evidence → policy, in that order", () => {
    expect(firstRunSteps(fresh).map((s) => s.id)).toEqual(["view", "analysis", "evidence", "policy"]);
  });

  it("marks nothing done on a fresh install", () => {
    expect(firstRunSteps(fresh).every((s) => !s.done)).toBe(true);
    expect(nextStep(firstRunSteps(fresh))?.id).toBe("view");
  });

  it("blocks the evidence step until a verdict exists", () => {
    const before = firstRunSteps(fresh).find((s) => s.id === "evidence")!;
    expect(before.blockedBy).toMatch(/Run an analysis first/);
    const after = firstRunSteps({ ...fresh, verdicts: 1 }).find((s) => s.id === "evidence")!;
    expect(after.blockedBy).toBeUndefined();
  });

  it("marks each step from what was actually done", () => {
    const steps = firstRunSteps({ ...fresh, modeChosen: true, verdicts: 3 });
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(["view", "analysis"]);
    expect(nextStep(steps)?.id).toBe("evidence");
  });

  it("skips a blocked step when choosing what to do next", () => {
    const steps = firstRunSteps({ ...fresh, modeChosen: true });
    // Evidence is blocked, but analysis comes first anyway.
    expect(nextStep(steps)?.id).toBe("analysis");
  });

  it("hides the guide when every step is done or it is dismissed", () => {
    const all = firstRunSteps({ ...fresh, modeChosen: true, verdicts: 1, evidenceChecked: true, activePolicy: true });
    expect(nextStep(all)).toBeNull();
    expect(showGuide(all, false)).toBe(false);
    expect(showGuide(firstRunSteps(fresh), true)).toBe(false);
    expect(showGuide(firstRunSteps(fresh), false)).toBe(true);
  });

  it("points each step at a real screen", () => {
    const steps = firstRunSteps(fresh);
    expect(steps.find((s) => s.id === "analysis")!.action.scene).toBe("verify");
    expect(steps.find((s) => s.id === "evidence")!.action).toMatchObject({ scene: "workstation", tab: "evidence" });
    expect(steps.find((s) => s.id === "policy")!.action).toMatchObject({ scene: "workstation", tab: "policy" });
  });

  it("says which steps need Pro instead of sending a free plan to a locked screen", () => {
    const steps = firstRunSteps({ ...fresh, verdicts: 1, workstation: false });
    for (const id of ["evidence", "policy"] as const) {
      const step = steps.find((s) => s.id === id)!;
      expect(step.requiresPlan).toBe("Pro");
      expect(step.action).toEqual({ label: "SEE PRO", scene: "plans" });
    }
    expect(steps.find((s) => s.id === "analysis")!.requiresPlan).toBeUndefined();
    // The view step, open on every plan, comes before a Pro step.
    expect(nextStep(steps)?.id).toBe("view");
  });
});
