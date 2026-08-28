import { useMemo, useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel } from "@/components/nova/Panel";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/lib/toast";
import {
  ANGLES,
  PLATFORMS,
  draft,
  type Platform,
} from "@/lib/growth/posts";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import { cn } from "@/lib/utils";

/**
 * GrowthScene — drafts to post yourself.
 *
 * There is no "publish" button and there will not be one. Automating posts
 * outside a platform's own API breaks the terms of every major network and
 * is precisely what their spam systems are built to catch; doing it to
 * market a compliance product would be an odd choice.
 *
 * The human step is load-bearing rather than a limitation. Every draft here
 * carries figures this codebase measured, and measurements go stale — a
 * person reading their own post before it goes out is the check that stops
 * a stale number being broadcast as current. The VERIFY FIRST list says
 * exactly what to re-check.
 */
export function GrowthScene({ data }: { data: XrplState }) {
  const { push } = useToast();
  const [platform, setPlatform] = useState<Platform>("x");
  const [angleId, setAngleId] = useState(ANGLES[0].id);

  const spec = PLATFORMS.find((p) => p.id === platform)!;
  const angle = ANGLES.find((a) => a.id === angleId)!;
  const result = useMemo(() => draft(platform, angleId, data), [platform, angleId, data]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.body);
      push({ title: "COPIED", body: `${spec.label} draft on the clipboard.`, tone: "go" });
    } catch {
      push({
        title: "CLIPBOARD UNAVAILABLE",
        body: "Select the text and copy it manually.",
        tone: "hold",
      });
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="13"
        kicker="CONTENT STUDIO · DRAFTS ONLY · NOTHING IS POSTED"
        title="GROWTH"
        sub="Platform-native drafts built from figures this build actually measured. You post them."
        status="go"
        statusLabel="NO AUTOMATION"
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
          <Panel label="ANGLE" className="shrink-0">
            <div className="grid gap-1.5">
              {ANGLES.map((a) => {
                const on = a.id === angleId;
                return (
                  <button
                    key={a.id}
                    onClick={() => setAngleId(a.id)}
                    aria-pressed={on}
                    className={cn(
                      "inset-row px-3 py-2.5 text-left",
                      on && "border-brand/50 bg-brand/10"
                    )}
                  >
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "text-[12px] font-medium",
                          on ? "text-brand" : "text-foreground"
                        )}
                      >
                        {a.title}
                      </span>
                      {a.usesLiveData && (
                        <span className="ml-auto font-mono text-[8.5px] tracking-[0.14em] text-telemetry">
                          LIVE
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                      {a.hook}
                    </p>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel label="WHY THERE IS NO PUBLISH BUTTON" className="min-h-0 flex-1">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Posting to X, LinkedIn or Reddit outside their own APIs breaks
              those platforms&rsquo; terms, and automated promotional posting is
              what their spam systems exist to catch. The realistic outcome is a
              banned account.
            </p>
            <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
              The human step also earns its place. Every draft here quotes a
              figure NOSHASHI measured, and measurements go stale — reading your
              own post before it goes out is what stops an old number being
              broadcast as current.
            </p>
          </Panel>
        </div>

        <Panel
          label={`${spec.label.toUpperCase()} DRAFT`}
          className="relative min-h-0 lg:col-span-3"
          bodyClassName="flex min-h-0 flex-col p-0"
          right={
            <Tabs value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
              <TabsList>
                {PLATFORMS.map((p) => (
                  <TabsTrigger key={p.id} value={p.id}>
                    {p.id.toUpperCase()}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          }
        >
          <PatternMark element="hatch" size={150} opacity={0.05} className="-right-8 -top-4" />

          <div className="border-b border-border/50 px-4 py-2.5">
            <p className="text-[10.5px] leading-relaxed text-faint">
              <span className="font-mono tracking-[0.14em] text-muted-foreground">
                REGISTER
              </span>{" "}
              {spec.register}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-foreground">
              {result.body}
            </pre>
          </div>

          {result.verifyBefore.length > 0 && (
            <div className="shrink-0 border-t border-border/50 px-4 py-3">
              <p className="font-mono text-[9px] tracking-[0.18em] text-hold">
                VERIFY FIRST
              </p>
              <ul className="mt-1.5 grid gap-1">
                {result.verifyBefore.map((v) => (
                  <li key={v} className="text-[10.5px] leading-relaxed text-muted-foreground">
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex shrink-0 items-center gap-3 border-t border-border/60 px-4 py-3">
            <Button size="sm" onClick={() => void copy()}>
              COPY DRAFT
            </Button>
            <span
              className={cn(
                "font-mono text-[10px] tabular-nums",
                result.overLimit ? "text-no-go" : "text-faint"
              )}
            >
              {result.chars.toLocaleString()}
              {spec.limit ? ` / ${spec.limit.toLocaleString()}` : ""}
              {result.overLimit ? " — OVER LIMIT" : ""}
            </span>
            <span className="ml-auto font-mono text-[9px] tracking-[0.14em] text-faint">
              {angle.title.toUpperCase()}
            </span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
