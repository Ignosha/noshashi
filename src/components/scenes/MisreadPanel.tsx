import { Panel } from "@/components/nova/Panel";
import { StatusDot } from "@/components/nova/StatusDot";
import { misreadCases } from "@/lib/learn/misread";
import { useHandoff } from "@/lib/nav/handoff";

const CASES = misreadCases();

/** Scenes that take the handed-over value and read it at once. */
const READS_ON_ARRIVAL = new Set(["settlement", "control", "provenance", "book"]);

/**
 * THE LEDGER CAN BE TRANSPARENT AND STILL BE MISREAD.
 *
 * Six recorded mainnet replies, each shown two ways: the obvious field
 * taken at face value, and what NOSHASHI's own interpreter reports for the
 * same reply. "Run it live" opens the scene that makes the verified
 * reading on current data.
 */
export function MisreadPanel() {
  const handOff = useHandoff();
  return (
    <Panel label="THE LEDGER CAN BE TRANSPARENT AND STILL BE MISREAD" className="min-h-0 lg:col-span-3" bodyClassName="min-h-0 overflow-y-auto p-3">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Six real replies from XRPL mainnet, each read two ways. The right-hand column is not written for this page: it is what
        NOSHASHI&apos;s own code returns for the recorded reply, and a test pins it.
      </p>
      <ol className="mt-3 space-y-3">
        {CASES.map((c) => (
          <li key={c.id} className="border border-border p-2.5">
            <p className="stencil text-[10px] tracking-[0.18em] text-foreground">{c.title}</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="border-l-2 border-hold/60 pl-2">
                <p className="stencil flex items-center gap-1 text-[8px] tracking-[0.2em] text-hold">
                  <StatusDot status="hold" size={5} /> WHAT A BASIC INTERFACE SEES
                </p>
                <p className="mt-0.5 text-[9px] text-muted-foreground">{c.basic.label}</p>
                <p className="data-font text-[12px] text-foreground">{c.basic.value}</p>
              </div>
              <div className="border-l-2 border-go/60 pl-2">
                <p className="stencil flex items-center gap-1 text-[8px] tracking-[0.2em] text-go">
                  <StatusDot status="go" size={5} /> WHAT NOSHASHI VERIFIES
                </p>
                <p className="mt-0.5 text-[9px] text-muted-foreground">{c.verified.label}</p>
                <p className="data-font text-[12px] text-foreground">{c.verified.value}</p>
              </div>
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-foreground/85">{c.why}</p>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <p className="data-font selectable min-w-0 truncate text-[9px] text-muted-foreground">
                LEDGER {c.evidence.ledger.toLocaleString("en-US")} · {c.evidence.refLabel.toUpperCase()} {c.evidence.ref} · {c.module}
              </p>
              <button
                type="button"
                onClick={() => handOff({ scene: c.scene, from: "learn", value: c.evidence.ref })}
                className="stencil shrink-0 border border-border px-2 py-1 text-[8px] tracking-[0.2em] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              >
                {READS_ON_ARRIVAL.has(c.scene) ? "RUN IT LIVE →" : `OPEN ${c.scene.toUpperCase()} →`}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
