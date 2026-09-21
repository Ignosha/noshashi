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
import { AUDIENCES, EVIDENCE, composePitch } from "@/lib/growth/pitch";
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
  const [mode, setMode] = useState<"posts" | "pitch">("posts");
  const [platform, setPlatform] = useState<Platform>("x");
  const [angleId, setAngleId] = useState(ANGLES[0].id);
  const [audienceId, setAudienceId] = useState(AUDIENCES[0].id);
  const [picked, setPicked] = useState<string[]>([EVIDENCE[0].id]);

  const pitch = useMemo(() => composePitch(audienceId, picked), [audienceId, picked]);

  const togglePick = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const copyPitch = async () => {
    try {
      await navigator.clipboard.writeText(
        `${pitch.subject}\n\n${pitch.body}`
      );
      push({ title: "COPIED", body: "Read it before you send it.", tone: "go" });
    } catch {
      push({ title: "CLIPBOARD UNAVAILABLE", body: "Select and copy manually.", tone: "hold" });
    }
  };

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

      <div className="flex shrink-0 gap-1.5">
        {([["posts", "SOCIAL DRAFTS"], ["pitch", "PITCH COMPOSER"]] as const).map(
          ([id, label]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
              className={cn(
                "mono-font rounded-[3px] border px-3 py-1.5 text-[9px] tracking-[0.16em] transition-colors",
                mode === id
                  ? "border-brand/50 bg-brand/10 text-brand"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          )
        )}
      </div>

      {mode === "pitch" ? (
        <PitchComposer
          audienceId={audienceId}
          setAudienceId={setAudienceId}
          picked={picked}
          togglePick={togglePick}
          pitch={pitch}
          onCopy={copyPitch}
        />
      ) : (
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
      )}
    </div>
  );
}

/**
 * PitchComposer — an outreach note built from findings, not adjectives.
 *
 * There is no send button, for the same reason there is no publish button
 * on the social drafts, plus one specific to this: the reader of a pitch
 * like this can verify the claim in about a minute, and arriving as
 * automated volume costs exactly the credibility a real measurement buys.
 *
 * BEFORE YOU SEND is not a disclaimer. Order books move, so a depth figure
 * quoted three weeks after it was taken is wrong in front of the one
 * audience equipped to check it.
 */
function PitchComposer({
  audienceId,
  setAudienceId,
  picked,
  togglePick,
  pitch,
  onCopy,
}: {
  audienceId: string;
  setAudienceId: (id: string) => void;
  picked: string[];
  togglePick: (id: string) => void;
  pitch: ReturnType<typeof composePitch>;
  onCopy: () => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
      <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
        <Panel label="WHO IS READING" className="shrink-0">
          <div className="grid gap-1.5">
            {AUDIENCES.map((a) => {
              const on = a.id === audienceId;
              return (
                <button
                  key={a.id}
                  onClick={() => setAudienceId(a.id)}
                  aria-pressed={on}
                  className={cn(
                    "inset-row px-3 py-2.5 text-left",
                    on && "border-brand/50 bg-brand/10"
                  )}
                >
                  <span
                    className={cn(
                      "text-[12px] font-medium",
                      on ? "text-brand" : "text-foreground"
                    )}
                  >
                    {a.label}
                  </span>
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                    {a.reader}
                  </p>
                  {on && (
                    <p className="mt-1.5 border-t border-border/40 pt-1.5 text-[10px] leading-snug text-faint">
                      <span className="text-hold">Usual mistake:</span> {a.pitfall}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel
          label="WHAT YOU MEASURED"
          className="min-h-0 flex-1"
          bodyClassName="min-h-0 overflow-y-auto p-0"
        >
          {EVIDENCE.map((e) => {
            const on = picked.includes(e.id);
            return (
              <button
                key={e.id}
                onClick={() => togglePick(e.id)}
                aria-pressed={on}
                className={cn(
                  "block w-full border-b border-border/30 px-3.5 py-2.5 text-left transition-colors",
                  on ? "bg-brand/10" : "hover:bg-popover/40"
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "mono-font text-[8px] tracking-[0.16em]",
                      on ? "text-brand" : "text-faint"
                    )}
                  >
                    {on ? "INCLUDED" : "ADD"}
                  </span>
                  <span className="ml-auto font-mono text-[8.5px] tabular-nums text-faint">
                    {e.measuredOn}
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-1 text-[11px] leading-snug",
                    on ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {e.headline}
                </p>
              </button>
            );
          })}
          <p className="mono-font px-3.5 py-2.5 text-[9px] leading-relaxed text-faint">
            The first one selected leads the pitch. A note that opens with a
            measurement can be checked; one that opens with a category cannot
            be ranked against anything.
          </p>
        </Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-3 lg:col-span-3">
        <Panel
          label="DRAFT"
          className="relative min-h-0 flex-1"
          bodyClassName="min-h-0 overflow-y-auto"
          right={
            <span className="mono-font text-[8.5px] tracking-[0.16em] text-faint">
              {pitch.audience.lengthHint}
            </span>
          }
        >
          <PatternMark element="orbit" size={180} opacity={0.04} className="-right-8 -top-6" />
          {pitch.subject && (
            <p className="mb-2 border-b border-border/40 pb-2 text-[12px] font-medium text-foreground">
              {pitch.subject}
            </p>
          )}
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">
            {pitch.body}
          </p>
        </Panel>

        <Panel label="BEFORE YOU SEND" className="shrink-0" bodyClassName="p-0">
          {pitch.beforeYouSend.map((line, i) => (
            <p
              key={i}
              className="border-b border-border/30 px-3.5 py-2 text-[10px] leading-snug text-faint last:border-0"
            >
              {line}
            </p>
          ))}
          <div className="px-3.5 py-2.5">
            <Button variant="outline" className="w-full" onClick={onCopy}>
              COPY DRAFT — YOU SEND IT
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
