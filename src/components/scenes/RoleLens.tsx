import { useEffect, useState } from "react";
import type { SceneId } from "@/App";
import { Eyebrow } from "@/components/nova/Panel";
import { readSetting, writeSetting } from "@/lib/store";
import { useHandoff } from "@/lib/nav/handoff";
import { LENSES, LENS_FOR_ROLE, LENS_ORDER, type Lens, type LensMetrics } from "@/lib/desk/lenses";
import type { MemberRole } from "@/lib/org/governance";
import { cn } from "@/lib/utils";

const KEY = "control.lens";

/**
 * The control room seen through a role: the same figures and records,
 * ordered for compliance, risk, trading, operations, an executive or an
 * analyst. Every item opens the scene that holds the underlying record.
 */
export function RoleLens({
  metrics,
  role,
  onNavigate,
}: {
  metrics: LensMetrics;
  role: MemberRole | null;
  onNavigate?: (scene: SceneId) => void;
}) {
  const [lens, setLens] = useState<Lens | null>(null);
  const handOff = useHandoff();
  const open = (scene: SceneId, where?: string) => {
    if (where) handOff({ scene, value: where.toLowerCase(), as: "tab", from: "control" });
    else onNavigate?.(scene);
  };

  useEffect(() => {
    let alive = true;
    void readSetting<Lens | null>(KEY, null).then((stored) => {
      if (!alive) return;
      setLens(stored && LENS_ORDER.includes(stored) ? stored : role ? LENS_FOR_ROLE[role] : "executive");
    });
    return () => {
      alive = false;
    };
  }, [role]);

  const current = lens ?? (role ? LENS_FOR_ROLE[role] : "executive");
  const def = LENSES[current];
  const choose = (l: Lens) => {
    setLens(l);
    void writeSetting(KEY, l);
  };

  return (
    <div className="mt-3 border-t border-border pt-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>VIEW AS</Eyebrow>
        <div role="tablist" aria-label="Role view" className="flex flex-wrap gap-1">
          {LENS_ORDER.map((l) => (
            <button
              key={l}
              role="tab"
              aria-selected={l === current}
              onClick={() => choose(l)}
              className={cn(
                "stencil rounded border px-2 py-0.5 text-[7.5px] tracking-[0.2em]",
                l === current ? "border-foreground/50 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {LENSES[l].title}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[9.5px] text-muted-foreground">
        {def.purpose}
        {role && LENS_FOR_ROLE[role] === current ? ` Default for your role (${role}).` : ""}
      </p>
      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {def.items.map((item) => {
          const figure = item.figure ? item.figure(metrics) : undefined;
          return (
            <button
              key={item.id}
              onClick={() => open(item.scene, item.where)}
              disabled={!onNavigate}
              className="group border border-border p-2 text-left hover:border-foreground/40 disabled:cursor-default"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="stencil text-[7.5px] tracking-[0.2em] text-muted-foreground">{item.label}</span>
                {figure !== undefined && (
                  <span className={cn("data-font text-[11px]", figure === null ? "text-muted-foreground" : "text-foreground")}>
                    {figure ?? "unavailable"}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">{item.answers}</p>
              <p className="stencil mt-0.5 text-[7px] tracking-[0.2em] text-muted-foreground/70 group-hover:text-foreground">
                OPEN {item.where ? `${item.where} ` : ""}→
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
