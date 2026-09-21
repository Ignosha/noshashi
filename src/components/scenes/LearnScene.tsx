import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SceneHeader } from "./SceneHeader";
import { Panel } from "@/components/nova/Panel";
import { TutorialStage } from "@/components/nova/TutorialStage";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { Button } from "@/components/ui/button";
import { TUTORIALS, type Tutorial } from "@/lib/tutorials";
import { usePrefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * LearnScene — the animated explainers.
 *
 * A player rather than a video: the beats are data, the diagrams are SVG,
 * and the whole thing weighs a few kilobytes instead of a few hundred
 * megabytes. It also means the copy stays greppable and the numbers stay
 * the measured ones rather than whatever was true the day a video was
 * rendered.
 *
 * Under `prefers-reduced-motion` the player is replaced by the same beats
 * as a static list. The information is the point; the movement is not, and
 * autoplaying motion at somebody who has asked for none is not a trade
 * worth making.
 */
export function LearnScene() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState<Tutorial>(TUTORIALS[0]);
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(false);

  const timerRef = useRef<number | null>(null);

  const clear = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const select = useCallback((t: Tutorial) => {
    clear();
    setActive(t);
    setBeat(0);
    setPlaying(false);
  }, []);

  // Advance on a timer rather than rAF: the beats are seconds long, and a
  // timer keeps running when the window is occluded instead of stranding
  // the player mid-sequence.
  useEffect(() => {
    if (!playing || reduced) return;
    const current = active.beats[beat];
    if (!current) return;
    timerRef.current = window.setTimeout(() => {
      if (beat + 1 < active.beats.length) {
        setBeat((b) => b + 1);
      } else {
        setPlaying(false);
      }
    }, current.hold);
    return clear;
  }, [playing, beat, active, reduced]);

  // Progress by beat, not by elapsed time. `elapsed` only advances when a
  // beat completes, so on the final beat it read short of 100% and never
  // arrived — which looks like a stall rather than an ending.
  const progress = (beat + 1) / active.beats.length;
  const current = active.beats[beat];

  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="12"
        kicker="GUIDED EXPLAINERS · NOTHING HERE IS A ROADMAP"
        title="LEARN"
        sub="Four short explainers covering what the gate does, why a balance can stop being yours, why a price can be false, and what the public address check will not tell you."
        status="go"
        statusLabel={`${TUTORIALS.length} EXPLAINERS`}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
        {/* Chooser */}
        <div className="flex min-h-0 flex-col gap-2 lg:col-span-2">
          {TUTORIALS.map((t) => {
            const on = t.id === active.id;
            return (
              <button
                key={t.id}
                onClick={() => select(t)}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "inset-row w-full px-3.5 py-3 text-left transition-colors",
                  on && "border-brand/50 bg-brand/10"
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "text-[12.5px] font-medium",
                      on ? "text-brand" : "text-foreground"
                    )}
                  >
                    {t.title}
                  </span>
                  <span className="ml-auto font-mono text-[9px] text-faint">
                    {t.minutes} MIN
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {t.promise}
                </p>
              </button>
            );
          })}

          <Panel label="WHY NOT VIDEO" className="mt-1 shrink-0">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              These are drawn live from the same design system as the console,
              so they weigh kilobytes rather than megabytes, stay searchable,
              and cannot go stale. Every figure shown is one NOSHASHI actually
              measured against mainnet.
            </p>
          </Panel>
        </div>

        {/* Player */}
        <Panel
          label={active.title.toUpperCase()}
          className="relative min-h-0 lg:col-span-3"
          bodyClassName="flex min-h-0 flex-col p-0"
          right={
            !reduced && (
              <span className="font-mono text-[9px] tabular-nums text-faint">
                {beat + 1}/{active.beats.length}
              </span>
            )
          }
        >
          <PatternMark element="dots" size={160} opacity={0.05} className="-right-8 -top-6" />

          {reduced ? (
            /* Reduced motion: the same content, as a list. */
            <div className="min-h-0 flex-1 overflow-y-auto">
              {active.beats.map((b, i) => (
                <div key={i} className="border-b border-border/40 px-4 py-3.5">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[9px] text-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[12.5px] font-medium text-foreground">
                      {b.title}
                    </span>
                  </div>
                  <p className="mt-1.5 max-w-2xl text-[11.5px] leading-relaxed text-muted-foreground">
                    {b.body}
                  </p>
                  {b.caption && (
                    <p className="mt-1.5 font-mono text-[9px] tracking-[0.14em] text-telemetry">
                      {b.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="relative min-h-[210px] flex-1 px-4 pt-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${active.id}-${beat}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="h-full w-full"
                  >
                    <TutorialStage scene={current.scene} />
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="shrink-0 border-t border-border/60 px-4 py-3.5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${active.id}-copy-${beat}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {current.caption && (
                      <p className="font-mono text-[9px] tracking-[0.18em] text-telemetry">
                        {current.caption}
                      </p>
                    )}
                    <p className="mt-1.5 text-[14px] font-medium text-foreground">
                      {current.title}
                    </p>
                    <p className="mt-1.5 max-w-2xl text-[11.5px] leading-relaxed text-muted-foreground">
                      {current.body}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {/* Beat scrubber — every beat is directly reachable. */}
                <div className="mt-3.5 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={playing ? "outline" : "default"}
                    onClick={() => {
                      if (beat === active.beats.length - 1 && !playing) {
                        setBeat(0);
                                          }
                      setPlaying((p) => !p);
                    }}
                  >
                    {playing ? "PAUSE" : beat === active.beats.length - 1 ? "REPLAY" : "PLAY"}
                  </Button>
                  <div className="flex flex-1 gap-1">
                    {active.beats.map((b, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          clear();
                          setBeat(i);
                        }}
                        aria-label={`Beat ${i + 1}: ${b.title}`}
                        className={cn(
                          "h-1 flex-1 rounded-full transition-colors",
                          i < beat
                            ? "bg-brand/50"
                            : i === beat
                              ? "bg-brand"
                              : "bg-border"
                        )}
                      />
                    ))}
                  </div>
                  <span className="w-9 shrink-0 text-right font-mono text-[9px] tabular-nums text-faint">
                    {Math.round(progress * 100)}%
                  </span>
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
