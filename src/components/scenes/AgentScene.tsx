import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SceneHeader } from "./SceneHeader";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { Panel, DataRow, Eyebrow } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { NovaLogo } from "@/components/nova/NovaLogo";
import { NovaBolt, NovaShield, NovaTerminal, NovaVault } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Kbd } from "@/components/nova/Kbd";
import {
  AgentUnavailableError,
  autodetect,
  chatStream,
  listModels,
  pickModel,
  type AgentModel,
  type ChatMessage,
} from "@/lib/agent/client";
import {
  PROVIDERS,
  defaultConfig,
  findProvider,
  isEndpointSafe,
  type AgentConfig,
} from "@/lib/agent/providers";
import { useSetting } from "@/lib/store";
import {
  SUGGESTED_PROMPTS,
  buildSystemPrompt,
  type AgentMode,
} from "@/lib/agent/context";
import { CONTACT } from "@/lib/brand";
import { clearProviderKey, hasProviderKey, storeProviderKey } from "@/lib/agent/keys";
import { findAnswers, fallbackAnswer, KNOWLEDGE } from "@/lib/support/knowledge";
import { runDiagnostics, type Diagnostic } from "@/lib/support/diagnostics";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/lib/utils";
import { useToast } from "@/lib/toast";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

type Turn = {
  id: number;
  role: "user" | "assistant";
  content: string;
  /** Set while the assistant turn is still streaming in. */
  streaming?: boolean;
  error?: boolean;
};

let turnId = 0;

/**
 * AgentScene — a compliance analyst that runs on the operator's machine.
 *
 * The model is local (Ollama / Hermes), so wallet addresses, receipts
 * and policy questions never leave the device. That is the point: an
 * assistant that ships your compliance context to a third party is
 * itself a compliance problem.
 */
export function AgentScene({ data }: { data: XrplState }) {
  const { push } = useToast();

  const [mode, setMode] = useState<AgentMode>("compliance");
  const [config, setConfig] = useSetting<AgentConfig>("agent.config", defaultConfig());
  const [models, setModels] = useState<AgentModel[]>([]);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [showRuntimePicker, setShowRuntimePicker] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [keyStored, setKeyStored] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[] | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [probing, setProbing] = useState(true);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const provider = findProvider(config.providerId);

  const probe = useCallback(
    async (target?: AgentConfig) => {
      const active = target ?? config;
      setProbing(true);
      setRuntimeError(null);
      try {
        const found = await listModels(active);
        setModels(found);
        if (found.length === 0) {
          setRuntimeError(
            `${findProvider(active.providerId).name} is reachable but exposes no models. ${findProvider(active.providerId).setupHint}`
          );
          return;
        }
        if (!active.model || !found.some((entry) => entry.name === active.model)) {
          setConfig({ ...active, model: pickModel(found) ?? "" });
        } else if (target) {
          setConfig(active);
        }
      } catch (error) {
        setModels([]);
        // Nothing at the configured endpoint — look for any local runtime
        // before telling the operator it is broken.
        const discovered = await autodetect();
        if (discovered) {
          setConfig(discovered);
          const found = await listModels(discovered).catch(() => []);
          setModels(found);
          setRuntimeError(null);
          return;
        }
        setRuntimeError(
          error instanceof Error
            ? `${error.message} Tried ${active.baseUrl}.`
            : "No model runtime reachable."
        );
      } finally {
        setProbing(false);
      }
    },
    [config, setConfig]
  );

  // Probe once on mount; `probe` changes with config so it is not a dep.
  useEffect(() => {
    void probe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void hasProviderKey(config.providerId).then((stored) => {
      if (!cancelled) setKeyStored(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [config.providerId]);

  // Follow the stream unless the operator has scrolled up to read.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const nearBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight < 120;
    if (nearBottom) node.scrollTop = node.scrollHeight;
  }, [turns]);

  const ready = Boolean(config.model) && models.length > 0 && !runtimeError;

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;

    // Support has to work on the free tier with nothing installed, so the
    // knowledge base answers directly whenever no model is available.
    if (mode === "support" && !ready) {
      const matches = findAnswers(prompt);
      const best = matches[0];
      setTurns((prev) => [
        ...prev,
        { id: ++turnId, role: "user", content: prompt },
        {
          id: ++turnId,
          role: "assistant",
          content: best ? best.answer.answer : fallbackAnswer(prompt),
        },
      ]);
      setDraft("");
      if (best?.answer.suggestsDiagnostics) void diagnose();
      return;
    }

    if (!config.model) return;

    const userTurn: Turn = { id: ++turnId, role: "user", content: prompt };
    const assistantTurn: Turn = {
      id: ++turnId,
      role: "assistant",
      content: "",
      streaming: true,
    };
    setTurns((prev) => [...prev, userTurn, assistantTurn]);
    setDraft("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Send the last few turns for continuity without blowing the window.
    const history: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(mode, data) },
      ...turns.slice(-6).map((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
      { role: "user", content: prompt },
    ];

    try {
      await chatStream({
        config,
        messages: history,
        signal: controller.signal,
        onToken: (token: string) => {
          setTurns((prev) =>
            prev.map((turn) =>
              turn.id === assistantTurn.id
                ? { ...turn, content: turn.content + token }
                : turn
            )
          );
        },
      });
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === assistantTurn.id ? { ...turn, streaming: false } : turn
        )
      );
    } catch (error) {
      const aborted = controller.signal.aborted;
      const message = aborted
        ? "Generation stopped."
        : error instanceof Error
          ? error.message
          : "The agent could not complete that request.";

      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === assistantTurn.id
            ? {
                ...turn,
                streaming: false,
                error: !aborted,
                content: turn.content || message,
              }
            : turn
        )
      );

      if (!aborted) {
        push({ title: "AGENT ERROR", body: message, tone: "no-go" });
        if (error instanceof AgentUnavailableError) setRuntimeError(message);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const stop = () => abortRef.current?.abort();

  const diagnose = async () => {
    setDiagnosing(true);
    try {
      setDiagnostics(
        await runDiagnostics({
          data,
          address: data.account?.address ?? "",
          onResync: () => {
            void data.refresh();
            void data.refreshAccount();
          },
        })
      );
    } finally {
      setDiagnosing(false);
    }
  };

  const suggestions = useMemo(
    () =>
      mode === "support"
        ? KNOWLEDGE.slice(0, 4).map((entry) => entry.question)
        : SUGGESTED_PROMPTS[mode],
    [mode]
  );

  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="07"
        kicker="ON-DEVICE ANALYST · OLLAMA / HERMES"
        title="COMPLIANCE AGENT"
        sub="A local model grounded in live ledger state and the real policy rule set. Nothing you type leaves this machine."
        status={ready ? "go" : probing ? "hold" : "no-go"}
        statusLabel={probing ? "PROBING" : ready ? "LOCAL RUNTIME" : "RUNTIME DOWN"}
        right={
          <div className="flex items-center gap-2">
            <Tabs value={mode} onValueChange={(value) => setMode(value as AgentMode)}>
              <TabsList>
                <TabsTrigger value="compliance">COMPLIANCE</TabsTrigger>
                <TabsTrigger value="support">SUPPORT</TabsTrigger>
              </TabsList>
            </Tabs>
            {turns.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setTurns([])}>
                CLEAR
              </Button>
            )}
          </div>
        }
      />

      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-4 gap-3">
        {/* Conversation */}
        <Panel
          label={mode === "compliance" ? "COMPLIANCE ANALYST" : "SUPPORT DESK"}
          corners
          className="col-span-3 min-h-0 min-w-0"
          bodyClassName="flex min-h-0 min-w-0 flex-col p-0"
          right={
            busy ? (
              <button
                onClick={stop}
                className="stencil text-[8px] tracking-[0.2em] text-no-go transition-opacity hover:opacity-70"
              >
                ■ STOP
              </button>
            ) : (
              config.model && (
                <span className="mono-font truncate text-[9px] text-muted-foreground">
                  {provider.name} · {config.model}
                </span>
              )
            )
          }
        >
          <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3">
            {runtimeError && turns.length === 0 && mode !== "support" ? (
              <EmptyState
                icon={<NovaBolt size={16} />}
                title="LOCAL RUNTIME NOT DETECTED"
                body={runtimeError}
                action={
                  <div className="flex flex-col items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => void probe()}>
                      RETRY DETECTION
                    </Button>
                    <a
                      href={provider.docsUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="stencil text-[8px] tracking-[0.2em] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
                    >
                      INSTALL {provider.name.toUpperCase()}
                    </a>
                  </div>
                }
              />
            ) : turns.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={SPRING}
                >
                  <NovaLogo size={40} className="text-foreground" />
                </motion.div>
                <div className="max-w-[420px]">
                  <p className="display text-[13px] font-[700] tracking-[0.1em] text-foreground">
                    ASK THE GRID
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    The agent can see the live ledger, this wallet's credentials and
                    the full domain rule set. It explains verdicts — it never issues
                    them.
                  </p>
                </div>
                <div className="grid w-full max-w-[520px] grid-cols-2 gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => void send(suggestion)}
                      disabled={!ready && mode !== "support"}
                      className="border border-border px-3 py-2 text-left text-[10px] leading-snug text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-40"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <AnimatePresence initial={false}>
                  {turns.map((turn) => (
                    <motion.div
                      key={turn.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={SPRING}
                      className="flex min-w-0 gap-3"
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid h-6 w-6 shrink-0 place-items-center border text-[8px]",
                          turn.role === "user"
                            ? "border-border text-muted-foreground"
                            : turn.error
                              ? "border-no-go/50 text-no-go"
                              : "border-foreground/50 text-foreground"
                        )}
                      >
                        {turn.role === "user" ? (
                          "YOU"
                        ) : (
                          <NovaLogo size={12} animated={false} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "selectable whitespace-pre-wrap break-words text-[11.5px] leading-relaxed",
                            turn.role === "user"
                              ? "text-foreground/85"
                              : turn.error
                                ? "text-no-go"
                                : "text-foreground",
                            turn.streaming && turn.content.length === 0 && "caret"
                          )}
                        >
                          {turn.content}
                        </p>
                        {turn.streaming && turn.content.length > 0 && (
                          <span className="mono-font mt-1 block text-[8px] tracking-[0.2em] text-muted-foreground">
                            GENERATING…
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="shrink-0 border-t border-border p-2.5">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(draft);
                  }
                }}
                rows={2}
                disabled={(!ready && mode !== "support") || busy}
                placeholder={
                  mode === "support"
                    ? "Ask anything about the console — this works without an AI runtime"
                    : ready
                      ? "Ask about a verdict, a credential, a domain rule…"
                      : "Start a model runtime to enable the compliance analyst"
                }
                className="min-w-0 flex-1 resize-none border border-input bg-transparent px-3 py-2 text-[11.5px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              />
              <Button
                className="shrink-0"
                onClick={() => void send(draft)}
                disabled={
                  (!ready && mode !== "support") || busy || draft.trim().length === 0
                }
              >
                SEND
              </Button>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                <Kbd keys="enter" /> send
                <span className="mx-1 opacity-40">·</span>
                <Kbd keys="shift+enter" /> newline
              </span>
              <span className="stencil text-[8px] tracking-[0.2em] text-muted-foreground/70">
                {provider.local ? "ON-DEVICE · NOTHING TRANSMITTED" : "REMOTE RUNTIME · TLS"}
              </span>
            </div>
          </div>
        </Panel>

        {/* Runtime + escalation */}
        <div className="col-span-1 flex min-h-0 min-w-0 flex-col gap-3">
          <Panel
            label="RUNTIME"
            className="shrink-0"
            right={
              <Badge variant={ready ? "go" : probing ? "hold" : "no-go"}>
                {probing ? "PROBING" : ready ? "READY" : "DOWN"}
              </Badge>
            }
          >
            <div className="relative">
              <PatternMark element="orbit" size={150} className="-right-10 -top-10" opacity={0.08} />
              <DataRow label="PROVIDER" value={provider.name} />
              <DataRow
                label="ENDPOINT"
                value={config.baseUrl.replace(/^https?:\/\//, "")}
              />
              <DataRow label="MODELS" value={models.length} />
              <DataRow
                label="ACTIVE"
                value={config.model || "none"}
                tone={config.model ? "go" : "no-go"}
              />
              <DataRow
                label="TRANSPORT"
                value={provider.local ? "ON-DEVICE" : "REMOTE (TLS)"}
                tone={provider.local ? "go" : "hold"}
              />
            </div>

            <button
              onClick={() => setShowRuntimePicker((open) => !open)}
              aria-expanded={showRuntimePicker}
              className="stencil mt-3 w-full border border-border py-1.5 text-[8px] tracking-[0.2em] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              {showRuntimePicker ? "HIDE RUNTIMES" : "CHANGE RUNTIME"}
            </button>

            {showRuntimePicker && (
              <div className="mt-2 space-y-1">
                {PROVIDERS.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      const next = {
                        providerId: entry.id,
                        baseUrl: entry.defaultBaseUrl,
                        model: "",
                        hasStoredKey: false,
                      };
                      setConfig(next);
                      setShowRuntimePicker(false);
                      void probe(next);
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 border px-2 py-1.5 text-left transition-colors",
                      entry.id === config.providerId
                        ? "border-foreground/60 bg-secondary/50"
                        : "border-border hover:border-foreground/30"
                    )}
                  >
                    <span className="mt-0.5 shrink-0">
                      {/* Local vs hosted is a deployment fact, not a verdict.
                          Telemetry cyan marks "runs on your machine"; hold
                          amber stays, because sending prompts off-device IS a
                          caution worth spending colour on. */}
                      {entry.local ? (
                        <NovaShield size={11} className="text-telemetry" />
                      ) : (
                        <NovaBolt size={11} className="text-hold" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="mono-font block truncate text-[9.5px] text-foreground">
                        {entry.name}
                        {entry.free && entry.local && (
                          <span className="ml-1.5 text-telemetry">FREE · LOCAL</span>
                        )}
                      </span>
                      <span className="block text-[8.5px] leading-snug text-muted-foreground">
                        {entry.blurb}
                      </span>
                    </span>
                  </button>
                ))}
                {!provider.local && (
                  <p className="border border-hold/40 bg-hold-dim p-2 text-[8.5px] leading-relaxed text-hold">
                    A remote endpoint sends your prompt off this machine.
                    {isEndpointSafe(config.baseUrl).ok
                      ? " TLS is enforced."
                      : ` ${isEndpointSafe(config.baseUrl).reason}`}
                  </p>
                )}
              </div>
            )}

            {provider.requiresKey && (
              <div className="inset-row mt-3 p-2.5">
                <Eyebrow className="mb-1.5">
                  {provider.name.toUpperCase()} API KEY
                </Eyebrow>
                <p className="mb-2 text-[9px] leading-relaxed text-muted-foreground">
                  Sealed in the OS keyring, scoped to this provider. Never written
                  to a preferences file or browser storage.
                </p>
                <div className="flex gap-1.5">
                  <Input
                    type="password"
                    value={keyDraft}
                    onChange={(event) => setKeyDraft(event.target.value)}
                    placeholder={keyStored ? "•••••••• sealed" : provider.setupHint}
                    className="mono-font h-7 text-[10px]"
                  />
                  <Button
                    size="sm"
                    disabled={keyDraft.trim().length === 0}
                    onClick={() =>
                      void (async () => {
                        try {
                          await storeProviderKey(config.providerId, keyDraft);
                          setKeyDraft("");
                          setKeyStored(true);
                          push({ title: "KEY SEALED", tone: "go" });
                          void probe();
                        } catch (error) {
                          push({
                            title: "COULD NOT STORE KEY",
                            body: error instanceof Error ? error.message : "Unknown error",
                            tone: "no-go",
                          });
                        }
                      })()
                    }
                  >
                    SEAL
                  </Button>
                </div>
                {keyStored && (
                  <button
                    onClick={() =>
                      void (async () => {
                        await clearProviderKey(config.providerId);
                        setKeyStored(false);
                        push({ title: "KEY CLEARED", tone: "info" });
                      })()
                    }
                    className="stencil mt-1.5 text-[8px] tracking-[0.2em] text-muted-foreground transition-colors hover:text-no-go"
                  >
                    CLEAR STORED KEY
                  </button>
                )}
              </div>
            )}

            {models.length > 0 && (
              <>
                <Eyebrow className="mb-1.5 mt-3">AVAILABLE MODELS</Eyebrow>
                <div className="max-h-[132px] space-y-1 overflow-y-auto">
                  {models.map((entry) => (
                    <button
                      key={entry.name}
                      onClick={() => setConfig({ ...config, model: entry.name })}
                      className={cn(
                        "flex w-full items-center gap-2 border px-2 py-1.5 text-left transition-colors",
                        entry.name === config.model
                          ? "border-foreground/60 bg-secondary/50"
                          : "border-border hover:border-foreground/30"
                      )}
                    >
                      <NovaTerminal size={11} className="shrink-0 text-muted-foreground" />
                      <span className="mono-font min-w-0 flex-1 truncate text-[9px] text-foreground">
                        {entry.name}
                      </span>
                      <span className="mono-font shrink-0 text-[8px] tabular-nums text-muted-foreground">
                        {entry.sizeBytes > 0 ? formatBytes(entry.sizeBytes, 1) : entry.detail}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <Button
              size="sm"
              variant="outline"
              className="mt-3 w-full"
              onClick={() => void probe()}
              disabled={probing}
            >
              {probing ? "PROBING…" : "RE-DETECT"}
            </Button>
          </Panel>

          {mode === "support" && (
            <Panel
              label="SELF-DIAGNOSTICS"
              corners
              className="shrink-0"
              right={
                <button
                  onClick={() => void diagnose()}
                  disabled={diagnosing}
                  className="stencil text-[8px] tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {diagnosing ? "RUNNING…" : "RUN"}
                </button>
              }
            >
              {!diagnostics ? (
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Checks the link, the watched wallet, reserve headroom, the
                  credential registry and the AI runtime — then repairs what it
                  can. Works offline and needs no account.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {diagnostics.map((check) => (
                    <div key={check.id} className="inset-row p-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0",
                            check.state === "pass" && "bg-go",
                            check.state === "warn" && "bg-hold",
                            check.state === "fail" && "bg-no-go",
                            check.state === "running" && "bg-muted-foreground"
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-[10px] text-foreground">
                          {check.label}
                        </span>
                        <span
                          className={cn(
                            "stencil shrink-0 text-[7px] tracking-[0.18em]",
                            check.state === "pass" && "text-go",
                            check.state === "warn" && "text-hold",
                            check.state === "fail" && "text-no-go"
                          )}
                        >
                          {check.state.toUpperCase()}
                        </span>
                      </div>
                      <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
                        {check.detail}
                      </p>
                      {check.fix && (
                        <button
                          onClick={() =>
                            void (async () => {
                              const outcome = await check.fix!.run();
                              push({ title: check.fix!.label.toUpperCase(), body: outcome, tone: "info" });
                              void diagnose();
                            })()
                          }
                          className="stencil mt-1.5 border border-border px-2 py-0.5 text-[7px] tracking-[0.18em] text-foreground transition-colors hover:border-foreground/50"
                        >
                          {check.fix.label.toUpperCase()}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          <Panel label="GUARDRAILS" className="shrink-0">
            {[
              { icon: <NovaShield size={11} />, text: "Never adjudicates — the deterministic engine decides." },
              { icon: <NovaVault size={11} />, text: "Refuses seed phrases, keys and passwords outright." },
              { icon: <NovaBolt size={11} />, text: "Answers only from live state; no invented rules." },
              {
                icon: <NovaTerminal size={11} />,
                text: provider.local
                  ? "Runs on this machine — prompts never leave the device."
                  : "Remote runtime selected — prompts leave this machine over TLS.",
              },
            ].map((rule) => (
              <div key={rule.text} className="flex gap-2 border-b border-border/30 py-1.5 last:border-0">
                <span className="mt-0.5 shrink-0 text-muted-foreground">{rule.icon}</span>
                <span className="text-[10px] leading-snug text-muted-foreground">
                  {rule.text}
                </span>
              </div>
            ))}
          </Panel>

          <Panel label="HUMAN ESCALATION" className="min-h-0 flex-1">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              The agent hands off anything that needs a person. Support replies
              within {CONTACT.responseTarget}.
            </p>
            <div className="mt-3 space-y-1.5">
              {[
                { label: "SUPPORT", email: CONTACT.support },
                { label: "SECURITY", email: CONTACT.security },
              ].map((route) => (
                <a
                  key={route.email}
                  href={`mailto:${route.email}`}
                  className="inset-row flex items-center justify-between px-2.5 py-2"
                >
                  <span className="stencil text-[8px] tracking-[0.2em] text-muted-foreground">
                    {route.label}
                  </span>
                  <span className="mono-font truncate text-[9px] text-foreground">
                    {route.email}
                  </span>
                </a>
              ))}
            </div>
            <p className="mono-font mt-2 text-[8px] text-muted-foreground/70">
              {CONTACT.hours}
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
