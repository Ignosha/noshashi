import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NoshashiMark } from "./brand/NoshashiMark";
import { usePrefersReducedMotion } from "@/lib/motion";

/**
 * Mission-control preloader.
 *
 * Four real subsystems, named honestly. The temptation in a screen like
 * this is to list impressive-sounding modules — MACRO, SENTIMENT — and
 * flip them to ONLINE on a timer. NOSHASHI is sold to regulated
 * institutions on the claim that it does not fabricate, so the first
 * frame a buyer sees is the worst possible place to start. Every module
 * below is something the application actually connects to.
 *
 * The sequence never blocks. `onDone` fires on the later of the
 * choreography and the caller's own readiness, so a fast machine is never
 * held back to admire the animation, and Escape or any key skips it.
 */

type ModuleState = "idle" | "connecting" | "online";

const MODULES = [
  { id: "ledger", label: "XRPL MAINNET", detail: "wss · xrplcluster", at: 750 },
  { id: "policy", label: "POLICY ENGINE", detail: "deterministic", at: 840 },
  { id: "credentials", label: "CREDENTIAL INDEX", detail: "XLS-70 · XLS-80", at: 930 },
  { id: "vault", label: "LEDGER VAULT", detail: "on device", at: 1020 },
] as const;

/** Beat boundaries, in ms from mount. Matches the specified choreography. */
const T = {
  system: 0,
  mark: 150,
  orbit: 300,
  telemetry: 450,
  modules: 750,
  online: 1100,
  sweep: 1400,
  exit: 1600,
} as const;

const ONLINE_STAGGER = 90;

export function Preloader({ onDone }: { onDone: () => void }) {
  const reduced = usePrefersReducedMotion();
  const [t, setT] = useState(0);
  const [exiting, setExiting] = useState(false);
  const doneRef = useRef(false);
  const rafRef = useRef(0);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    cancelAnimationFrame(rafRef.current);
    setExiting(true);
    window.setTimeout(onDone, reduced ? 0 : 420);
  }, [onDone, reduced]);

  useEffect(() => {
    if (reduced) {
      // Reduced motion still shows the state, just without the movement.
      setT(T.exit);
      const timer = window.setTimeout(finish, 260);
      return () => window.clearTimeout(timer);
    }
    const start = performance.now();
    const tick = (now: number) => {
      const ms = now - start;
      setT(ms);
      if (ms >= T.exit) finish();
      else rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    /*
     * A timer backstop, because rAF does not run in a hidden window.
     *
     * The choreography is driven by rAF for smoothness, but rAF is paused
     * while the window is occluded — so an operator who launches NOSHASHI
     * and immediately switches away would come back to a preloader that
     * never finished, with the whole application stuck behind it. Timers
     * still fire when hidden (throttled), so this guarantees the boot
     * stage always ends.
     */
    const backstop = window.setTimeout(finish, T.exit + 400);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(backstop);
    };
  }, [reduced, finish]);

  useEffect(() => {
    const skip = () => finish();
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [finish]);

  const moduleState = (i: number): ModuleState => {
    if (t >= T.online + i * ONLINE_STAGGER) return "online";
    if (t >= MODULES[i].at) return "connecting";
    return "idle";
  };

  const progress = Math.min(1, t / T.exit);

  return (
    <motion.div
      className="fixed inset-0 z-100 grid place-items-center bg-background"
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      role="status"
      aria-live="polite"
      aria-label="Initialising NOSHASHI"
    >
      {/* Micro-grid. Static, cheap, and it gives the mark something to sit
          against without becoming a starfield. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px)," +
            "linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="relative flex w-[min(560px,86vw)] flex-col items-center">
        {/* 0.00s — system indicator */}
        <motion.p
          className="font-display text-[9px] tracking-[0.34em] text-faint"
          initial={{ opacity: 0 }}
          animate={{ opacity: t >= T.system ? 1 : 0 }}
          transition={{ duration: 0.24 }}
        >
          NOSHASHI SYSTEM
        </motion.p>

        {/* 0.15s mark · 0.30s orbit */}
        <div className="relative mt-7 grid h-[132px] w-[132px] place-items-center">
          <motion.svg
            aria-hidden
            viewBox="0 0 132 132"
            className="absolute inset-0 h-full w-full text-brand"
            initial={{ opacity: 0 }}
            animate={{ opacity: t >= T.orbit ? 1 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.circle
              cx="66"
              cy="66"
              r="62"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeOpacity="0.5"
              pathLength={1}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: t >= T.orbit ? 1 : 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            />
            {/* 0.45s — telemetry points on the ring */}
            {[0, 72, 144, 216, 288].map((deg, i) => {
              const rad = ((deg - 90) * Math.PI) / 180;
              return (
                <motion.circle
                  key={deg}
                  cx={66 + 62 * Math.cos(rad)}
                  cy={66 + 62 * Math.sin(rad)}
                  r="2"
                  fill="currentColor"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: t >= T.telemetry + i * 40 ? 1 : 0 }}
                  transition={{ duration: 0.2 }}
                />
              );
            })}
          </motion.svg>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{
              opacity: t >= T.mark ? 1 : 0,
              scale: t >= T.mark ? 1 : 0.96,
            }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <NoshashiMark size={64} tone="color" />
          </motion.div>
        </div>

        <motion.p
          className="mt-7 font-display text-[11px] tracking-[0.26em] text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: t >= T.telemetry ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        >
          INITIALISING MARKET INTELLIGENCE
        </motion.p>

        {/* 0.75s — modules connect, 1.10s — modules online */}
        <div className="mt-6 w-full border-t border-border/60">
          {MODULES.map((m, i) => {
            const state = moduleState(i);
            return (
              <motion.div
                key={m.id}
                className="flex items-baseline gap-3 border-b border-border/60 px-1 py-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: state === "idle" ? 0.25 : 1 }}
                transition={{ duration: 0.22 }}
              >
                <span
                  aria-hidden
                  className={
                    "mt-[1px] h-[5px] w-[5px] shrink-0 " +
                    (state === "online"
                      ? "bg-go"
                      : state === "connecting"
                        ? "bg-telemetry"
                        : "bg-faint")
                  }
                />
                <span className="font-display text-[10px] tracking-[0.18em] text-foreground">
                  {m.label}
                </span>
                <span className="font-mono text-[9px] tracking-[0.1em] text-faint">
                  {m.detail}
                </span>
                <span
                  className={
                    "ml-auto font-mono text-[9px] tracking-[0.16em] " +
                    (state === "online"
                      ? "text-go"
                      : state === "connecting"
                        ? "text-telemetry"
                        : "text-faint")
                  }
                >
                  {state === "online"
                    ? "ONLINE"
                    : state === "connecting"
                      ? "CONNECTING"
                      : "—"}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Progress. A real fraction of the choreography, not a fake loader. */}
        <div className="mt-5 h-[2px] w-full bg-border/50">
          <motion.div
            className="h-full bg-brand"
            style={{ width: `${progress * 100}%` }}
            aria-hidden
          />
        </div>

        <p className="mt-4 font-mono text-[9px] tracking-[0.2em] text-faint">
          ANALYZE · DISCOVER · NAVIGATE
        </p>
      </div>

      {/* 1.40s — a single signal sweep, then out. */}
      <AnimatePresence>
        {t >= T.sweep && !reduced && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 h-px bg-linear-to-r from-transparent via-telemetry to-transparent"
            initial={{ top: "0%", opacity: 0 }}
            animate={{ top: "100%", opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.6, ease: "linear" }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
