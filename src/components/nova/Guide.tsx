import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { groupOf, guideFor, parseMarks, type Plan, type ScreenGuide } from "@/lib/tutorial";
import { openExternal } from "@/lib/external";
import { TUTORIAL_URL } from "@/lib/onboarding";
import { isMac } from "@/lib/env";
import { cn } from "@/lib/utils";

/**
 * The in-app guide: what the current screen is for and how to use it, in
 * three plain steps, plus a tour that walks screen by screen. The words
 * come from src/lib/tutorial/screens.json, the same file the website's
 * /tutorial/ is built from.
 */

const PLAN_TONE: Record<Plan, string> = {
  Free: "border-go/50 text-go",
  Pro: "border-brand/50 text-brand",
  Institutional: "border-hold/50 text-hold",
  Enterprise: "border-hold/50 text-hold",
};

function PlanBadge({ plan }: { plan: Plan }) {
  return (
    <span className={cn("stencil shrink-0 rounded-full border px-2 py-0.5 text-[10px] tracking-[0.12em]", PLAN_TONE[plan])}>
      {plan === "Free" ? "FREE" : `${plan.toUpperCase()} PLAN`}
    </span>
  );
}

/** A step, with **bold** labels and `key` marks rendered. */
function Step({ text }: { text: string }) {
  return (
    <>
      {parseMarks(text).map((run, i) =>
        run.mark === "bold" ? (
          <b key={i} className="font-[600] text-foreground">{run.text}</b>
        ) : run.mark === "key" ? (
          <kbd key={i} className="rounded border border-border bg-card px-1 font-mono text-[10.5px] text-foreground">
            {run.text === "Ctrl/⌘" ? (isMac ? "⌘" : "Ctrl") : run.text}
          </kbd>
        ) : (
          <span key={i}>{run.text}</span>
        )
      )}
    </>
  );
}

function Steps({ guide }: { guide: ScreenGuide }) {
  return (
    <ol className="mt-3 space-y-2">
      {guide.steps.map((step, i) => (
        <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground/85">
          <span
            aria-hidden
            className="data-font mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-go/60 text-[10.5px] text-go"
          >
            {i + 1}
          </span>
          <span className="min-w-0">
            <Step text={step} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/** "Explain this screen": opened from the title bar, `?` or the palette. */
export function GuideDialog({
  scene,
  open,
  onOpenChange,
  onStartTour,
}: {
  scene: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartTour: () => void;
}) {
  const guide = guideFor(scene);
  const group = groupOf(scene);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <p className="stencil text-[10px] tracking-[0.14em] text-muted-foreground">
          GUIDE{group ? ` · ${group.title.toUpperCase()}` : ""}
        </p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <DialogTitle className="text-[18px] font-[600] text-foreground">{guide ? guide.label : "This screen"}</DialogTitle>
          {guide && <PlanBadge plan={guide.plan} />}
        </div>
        <DialogDescription className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
          {guide ? guide.answers : "Reference information about NOSHASHI. Use the tour to see every working screen."}
        </DialogDescription>
        {guide && <Steps guide={guide} />}
        {guide && guide.plan !== "Free" && (
          <p className="mt-3 text-[12px] text-muted-foreground">
            On the Free plan this screen shows what it does, with <b className="text-foreground">Sign in</b> and{" "}
            <b className="text-foreground">See plans</b>.
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onStartTour}>
            TAKE THE TOUR
          </Button>
          <Button size="sm" variant="outline" onClick={() => void openExternal(TUTORIAL_URL)}>
            FULL TUTORIAL
          </Button>
          <span className="ml-auto text-[11px] text-faint">
            Press <kbd className="rounded border border-border px-1 font-mono">?</kbd> on any screen
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The tour: a card that walks the screens in sidebar order. It moves the
 * app to each screen as it goes, so the operator sees the real thing
 * beside the explanation. Escape or Close ends it; it never blocks the
 * screen it is describing.
 */
export function TourCard({
  stops,
  index,
  onIndex,
  onClose,
}: {
  stops: ScreenGuide[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const guide = stops[index];
  const nextRef = useRef<HTMLButtonElement>(null);
  const last = index === stops.length - 1;

  useEffect(() => {
    nextRef.current?.focus();
  }, [index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!guide) return null;
  const group = groupOf(guide.scene);

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label={`Tour, stop ${index + 1} of ${stops.length}: ${guide.label}`}
      className="fixed bottom-14 right-4 z-[80] w-[min(400px,calc(100vw-2rem))] border border-border bg-popover p-4 shadow-[0_24px_80px_-24px_hsl(0_0%_0%/0.9)]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="stencil text-[10px] tracking-[0.14em] text-muted-foreground">
          TOUR · {index + 1} OF {stops.length}
          {group ? ` · ${group.title.toUpperCase()}` : ""}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="stencil text-[10px] tracking-[0.12em] text-muted-foreground hover:text-foreground"
          aria-label="End the tour"
        >
          CLOSE
        </button>
      </div>
      <div className="mt-2 h-[2px] w-full bg-border" aria-hidden>
        <div className="h-full bg-go transition-[width]" style={{ width: `${((index + 1) / stops.length) * 100}%` }} />
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <h2 className="text-[16px] font-[600] text-foreground">{guide.label}</h2>
        <PlanBadge plan={guide.plan} />
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{guide.answers}</p>
      <Steps guide={guide} />
      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={index === 0} onClick={() => onIndex(index - 1)}>
          BACK
        </Button>
        <button
          ref={nextRef}
          type="button"
          className={buttonVariants({ size: "sm" })}
          onClick={() => (last ? onClose() : onIndex(index + 1))}
        >
          {last ? "FINISH" : "NEXT"}
        </button>
      </div>
    </section>
  );
}
