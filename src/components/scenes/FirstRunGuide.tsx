import { Panel } from "@/components/nova/Panel";
import { Button } from "@/components/ui/button";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useLedger } from "@/lib/desk/ledger";
import { usePolicyStore } from "@/lib/desk/policyStore";
import { useHandoff } from "@/lib/nav/handoff";
import { EVIDENCE_CHECKED_KEY, GUIDE_DISMISSED_KEY, firstRunSteps, nextStep, showGuide } from "@/lib/onboarding";
import { useSetting } from "@/lib/store";
import { cn } from "@/lib/utils";

type Mode = "executive" | "analyst";

/**
 * The first-run guide on Home: what NOSHASHI is for, then four steps, each
 * ticked by what the operator has actually done (see src/lib/onboarding.ts).
 * It disappears when every step is done, or when the operator hides it.
 */
export function FirstRunGuide({
  mode,
  modeChosen,
  onChooseMode,
  onNavigate,
}: {
  mode: Mode;
  modeChosen: boolean;
  onChooseMode: (mode: Mode) => void;
  onNavigate: (scene: string) => void;
}) {
  const { entries, loaded } = useLedger();
  const policies = usePolicyStore();
  const [evidenceChecked, , evidenceReady] = useSetting(EVIDENCE_CHECKED_KEY, false);
  const [dismissed, setDismissed, dismissedReady] = useSetting(GUIDE_DISMISSED_KEY, false);
  const handOff = useHandoff();
  const billing = useBilling();

  // Wait for every store, so a returning operator never sees the guide flash.
  if (!loaded || !evidenceReady || !dismissedReady || policies.state.status === "loading" || billing.loading) return null;

  const steps = firstRunSteps({
    modeChosen,
    verdicts: entries.length,
    evidenceChecked,
    activePolicy: Boolean(policies.active),
    workstation: billing.has("portfolios"),
  });
  if (!showGuide(steps, dismissed)) return null;
  const next = nextStep(steps);
  const doneCount = steps.filter((s) => s.done).length;

  const go = (step: (typeof steps)[number]) => {
    const { scene, tab } = step.action;
    if (!scene) return;
    if (tab) handOff({ scene, value: tab, as: "tab", from: "home" });
    else onNavigate(scene);
  };

  return (
    <Panel
      label={`GET STARTED · ${doneCount} OF ${steps.length}`}
      right={
        <button
          onClick={() => setDismissed(true)}
          className="stencil text-[10px] tracking-[0.12em] text-muted-foreground hover:text-foreground"
          aria-label="Hide the getting-started guide"
        >
          HIDE
        </button>
      }
      bodyClassName="p-4"
    >
      <p className="text-[13.5px] leading-relaxed text-foreground/85">
        <span className="font-[600] text-foreground">One ledger. Three questions.</span> Can this move under our
        policy? Is there enough real liquidity to exit? Can we prove why? NOSHASHI answers each from validated XRPL
        state and records evidence you can check. It reads only; it never signs or asks for a key.
      </p>

      <ol className="mt-4 grid gap-2 md:grid-cols-2">
        {steps.map((step, i) => {
          const isNext = next?.id === step.id;
          return (
            <li
              key={step.id}
              className={cn(
                "rounded-md border p-3",
                step.done ? "border-border/60 opacity-70" : isNext ? "border-go/50 bg-go/5" : "border-border"
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className={cn(
                    "data-font mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10.5px]",
                    step.done ? "border-go bg-go text-background" : "border-border text-muted-foreground"
                  )}
                >
                  {step.done ? "✓" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-[600] text-foreground">
                    {step.title}
                    <span className="sr-only">{step.done ? " (done)" : ""}</span>
                  </p>
                  <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{step.body}</p>
                  {step.requiresPlan && !step.done && (
                    <p className="stencil mt-1.5 text-[10px] tracking-[0.12em] text-hold">INCLUDED IN {step.requiresPlan.toUpperCase()}</p>
                  )}
                  {step.id === "view" ? (
                    <div role="radiogroup" aria-label="Choose your view" className="mt-2 flex gap-1.5">
                      {(["executive", "analyst"] as const).map((m) => (
                        <Button
                          key={m}
                          size="sm"
                          role="radio"
                          aria-checked={modeChosen && mode === m}
                          variant={modeChosen && mode === m ? "default" : "outline"}
                          onClick={() => onChooseMode(m)}
                        >
                          {m === "executive" ? "EXECUTIVE" : "ANALYST"}
                        </Button>
                      ))}
                    </div>
                  ) : step.blockedBy ? (
                    <p className="mt-2 text-[11.5px] text-faint">{step.blockedBy}</p>
                  ) : !step.done ? (
                    <Button size="sm" variant={isNext ? "default" : "outline"} className="mt-2" onClick={() => go(step)}>
                      {step.action.label}
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
