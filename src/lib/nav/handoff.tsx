import * as React from "react";
import type { SceneId } from "@/App";

/**
 * Subject handoff — carrying an address or hash from one scene to another.
 *
 * Six read scenes each take a subject and report on it, and until now they
 * were six dead ends: Issuance names the holder carrying 43% of an issuance
 * and you then had to select it, copy it, switch scene, and paste it to ask
 * who that holder is. The reading is the same either way; the difference is
 * whether the console supports an investigation or merely answers questions
 * one at a time.
 *
 * The mechanism is deliberately small. A handoff is a single pending value
 * addressed to one scene, and it is CONSUMED on read. That matters: if it
 * lingered, navigating back to Provenance an hour later would silently
 * re-run a lookup the operator had moved on from, and the screen would
 * describe something they were no longer asking about. Consume-once means a
 * handoff explains exactly one navigation and then stops existing.
 */

export type Subject = {
  /** Where this value is meant to be read. */
  scene: SceneId;
  value: string;
  /** Scene the operator came from, for the "why am I looking at this" line. */
  from?: SceneId;
  /** What the value meant where it came from, e.g. "largest holder". */
  as?: string;
};

type HandoffContext = {
  /** Send a subject to a scene and navigate there. */
  handOff: (subject: Subject) => void;
  /** Read and clear any subject addressed to this scene. */
  claim: (scene: SceneId) => Subject | null;
};

const Ctx = React.createContext<HandoffContext | null>(null);

export function HandoffProvider({
  onNavigate,
  children,
}: {
  onNavigate: (scene: SceneId) => void;
  children: React.ReactNode;
}) {
  /*
   * A ref rather than state. Claiming must not itself cause a render — the
   * claiming scene is already rendering when it asks, and setting state
   * during render is how you get an infinite loop or a React warning.
   */
  const pending = React.useRef<Subject | null>(null);

  const handOff = React.useCallback(
    (subject: Subject) => {
      pending.current = subject;
      onNavigate(subject.scene);
    },
    [onNavigate]
  );

  const claim = React.useCallback((scene: SceneId) => {
    const held = pending.current;
    if (!held || held.scene !== scene) return null;
    pending.current = null; // Consume: a handoff explains one navigation only.
    return held;
  }, []);

  const value = React.useMemo(() => ({ handOff, claim }), [handOff, claim]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Send a subject elsewhere. Returns a no-op outside a provider so a scene
 * rendered in isolation (tests, storybook) does not explode.
 */
export function useHandoff(): (subject: Subject) => void {
  const ctx = React.useContext(Ctx);
  return React.useCallback(
    (subject: Subject) => ctx?.handOff(subject),
    [ctx]
  );
}

/**
 * Claim a subject addressed to this scene, once, on mount.
 *
 * `onClaim` runs in an effect rather than during render because it drives a
 * network read. Scenes pass their lookup function straight in.
 */
export function useClaimedSubject(
  scene: SceneId,
  onClaim: (subject: Subject) => void
): Subject | null {
  const ctx = React.useContext(Ctx);
  const [claimed, setClaimed] = React.useState<Subject | null>(null);
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (fired.current || !ctx) return;
    const subject = ctx.claim(scene);
    if (!subject) return;
    fired.current = true;
    setClaimed(subject);
    onClaim(subject);
    // onClaim is intentionally not a dependency: this must run exactly once
    // per mount, and scenes define their handler inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, scene]);

  return claimed;
}

/**
 * TraceButton — the affordance that turns a reported address into the next
 * question. Deliberately quiet: it sits inside a row of data and must not
 * compete with the figure it hangs off.
 */
export function TraceButton({
  value,
  to,
  from,
  as,
  label = "TRACE",
  className,
}: {
  value: string;
  to: SceneId;
  from?: SceneId;
  as?: string;
  label?: string;
  className?: string;
}) {
  const handOff = useHandoff();
  return (
    <button
      type="button"
      onClick={() => handOff({ scene: to, value, from, as })}
      title={`Look up ${value} in ${String(to).toUpperCase()}`}
      className={
        "mono-font shrink-0 rounded-[3px] border border-border/60 px-1.5 py-0.5 " +
        "text-[8px] tracking-[0.14em] text-muted-foreground transition-colors " +
        "hover:border-brand/60 hover:text-brand focus-visible:outline-none " +
        "focus-visible:ring-1 focus-visible:ring-brand/60 " +
        (className ?? "")
      }
    >
      {label}
    </button>
  );
}
