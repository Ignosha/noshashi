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
      body: "Executive shows the eight screens that answer the three questions. Analyst shows every tool with the raw ledger detail. You can switch at any time from the sidebar.",
      done: f.modeChosen,
      action: { label: "CHOOSE", scene: null },
    },
    {
      id: "analysis",
      title: "Run your first analysis",
      body: "Enter an XRPL account and an amount in Verification. NOSHASHI reads the validated ledger, checks that several public servers agree, runs the rules and records GO, HOLD or NO-GO with a receipt.",
      done: f.verdicts > 0,
      action: { label: "OPEN VERIFICATION", scene: "verify" },
    },
    {
      id: "evidence",
      title: "Check the evidence",
      body: "Re-verify the receipt, replay it at its ledger, or export the decision report an auditor can check with shasum.",
      done: f.evidenceChecked,
      blockedBy: f.verdicts > 0 ? undefined : "Run an analysis first: there is no receipt to check yet.",
      ...onWorkstation("OPEN EVIDENCE", "evidence"),
    },
    {
      id: "policy",
      title: "Set your institution's policy",
      body: "Thresholds for concentration, counterparty share, the Travel Rule, reserve headroom and freeze risk, each with what it reads and what it does when triggered. Optional; the base rules apply without it.",
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
