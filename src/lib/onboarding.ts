import { writeSetting } from "@/lib/store";

/**
 * First run: purpose → view → first analysis → evidence → policy.
 *
 * Each step is marked done by what the operator has actually done, read
 * from the same stores the screens use: a recorded verdict in the ledger,
 * a receipt they re-verified, replayed or reported on, an active policy.
 * Nothing is marked done for having been shown.
 */

export const MODE_CHOSEN_KEY = "onboarding.modeChosen";
export const EVIDENCE_CHECKED_KEY = "onboarding.evidenceChecked";
export const GUIDE_DISMISSED_KEY = "onboarding.guideDismissed";

export type FirstRunFacts = {
  /** The operator picked Executive or Analyst, rather than inheriting the default. */
  modeChosen: boolean;
  /** Verdicts recorded on this device. */
  verdicts: number;
  /** A receipt was re-verified, replayed or exported as a report. */
  evidenceChecked: boolean;
  /** An institutional policy version is active. */
  activePolicy: boolean;
  /** The plan includes Ledger & Policy, where evidence and policy live (Pro and above). */
  workstation: boolean;
};

export type FirstRunStepId = "view" | "analysis" | "evidence" | "policy";

export type FirstRunStep = {
  id: FirstRunStepId;
  title: string;
  body: string;
  done: boolean;
  /** Why the step cannot start yet, when an earlier one is needed first. */
  blockedBy?: string;
  /** The plan that includes this step, when the operator's does not. */
  requiresPlan?: "Pro";
  action: { label: string; scene: "verify" | "workstation" | "plans" | null; tab?: "evidence" | "policy" };
};

export function firstRunSteps(f: FirstRunFacts): FirstRunStep[] {
  const onWorkstation = (label: string, tab: "evidence" | "policy"): Pick<FirstRunStep, "action" | "requiresPlan"> =>
    f.workstation
      ? { action: { label, scene: "workstation", tab } }
      : { action: { label: "SEE PRO", scene: "plans" }, requiresPlan: "Pro" };
  return [
    {
      id: "view",
      title: "Choose your view",
      body: "Executive: the key screens. Analyst: every tool. Switch any time.",
      done: f.modeChosen,
      action: { label: "CHOOSE", scene: null },
    },
    {
      id: "analysis",
      title: "Run your first analysis",
      body: "Paste an XRPL address and an amount. Get GO, HOLD or NO-GO with a receipt.",
      done: f.verdicts > 0,
      action: { label: "OPEN VERIFICATION", scene: "verify" },
    },
    {
      id: "evidence",
      title: "Check the evidence",
      body: "Re-check a receipt or export a report for your auditor.",
      done: f.evidenceChecked,
      blockedBy: f.verdicts > 0 ? undefined : "Run a check first.",
      ...onWorkstation("OPEN EVIDENCE", "evidence"),
    },
    {
      id: "policy",
      title: "Set your institution's policy",
      body: "Set your own limits. Optional: default rules apply without it.",
      done: f.activePolicy,
      ...onWorkstation("OPEN POLICY", "policy"),
    },
  ];
}

/** The first step not yet done that can start on this plan, else the first not done, else null. */
export function nextStep(steps: FirstRunStep[]): FirstRunStep | null {
  return (
    steps.find((s) => !s.done && !s.blockedBy && !s.requiresPlan) ??
    steps.find((s) => !s.done && !s.blockedBy) ??
    steps.find((s) => !s.done) ??
    null
  );
}

/** Whether the guide is shown: until every step is done, or the operator hides it. */
export function showGuide(steps: FirstRunStep[], dismissed: boolean): boolean {
  return !dismissed && steps.some((s) => !s.done);
}

/** Called by the evidence actions (re-verify, replay, report). */
export function markEvidenceChecked(): Promise<void> {
  return writeSetting(EVIDENCE_CHECKED_KEY, true);
}

/** The step-by-step guide to every screen, on the website. */
export const TUTORIAL_URL = "https://www.noshashi.app/tutorial/";
