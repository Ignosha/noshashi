import type { NoshxStep } from "@/lib/noshx/loop";
import { useHandoff } from "@/lib/nav/handoff";

/**
 * SOURCES under an assistant answer: each reading it rests on, the ledger it
 * was read at, and a link to the screen that shows the same reading. The
 * line above them says which side wins when they differ.
 */
export function AnswerSources({ steps }: { steps: NoshxStep[] }) {
  const handOff = useHandoff();
  const cited = steps.flatMap((s) => (s.kind === "tool" && s.ok && s.citation ? [s.citation] : []));
  if (cited.length === 0) return null;
  return (
    <div className="mt-2 border-t border-border/60 pt-1.5">
      <p className="stencil text-[10px] tracking-[0.14em] text-muted-foreground">SOURCES · READINGS THIS ANSWER RESTS ON</p>
      <ul className="mt-1 space-y-0.5">
        {cited.map((c, i) => (
          <li key={`${c.tool}-${i}`} className="mono-font flex flex-wrap items-baseline gap-x-2 text-[10.5px] leading-snug text-muted-foreground">
            <span className="text-foreground/90">{c.screen}</span>
            {c.subject && <span className="truncate">{c.subject}</span>}
            <span>{c.ledgerIndex ? `ledger ${c.ledgerIndex.toLocaleString()}` : "no ledger index"}</span>
            <span>{new Date(c.readAt).toLocaleTimeString()}</span>
            {c.scene && (
              <button
                type="button"
                onClick={() => handOff({ scene: c.scene!, value: c.subject?.split(" · ")[0] ?? "", from: "agent", as: "cited by NOSHX" })}
                className="underline underline-offset-2 hover:text-foreground"
              >
                open
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground">
        Figures come from these readings. If the answer and a reading disagree, the reading and the deterministic engine are authoritative, not the assistant.
      </p>
    </div>
  );
}
