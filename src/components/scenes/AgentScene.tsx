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
  HISTORY_TURNS,
  listModels,
  pickModel,
  type AgentModel,
  type ChatMessage,
} from "@/lib/agent/client";
import { askNoshx, NOSHX_PREAMBLE, type NoshxStep } from "@/lib/noshx/loop";
import { useBilling } from "@/lib/billing/useEntitlements";
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
import { dataBoundary, recordFor, useAiUseLog, type AiUseRecord } from "@/lib/agent/governance";
import { AgentGovernance } from "./AgentGovernance";
import { useLedger } from "@/lib/desk/ledger";
import { useGoverningPolicy } from "@/lib/org/useOrg";
import { buildPolicyBrief, parseWhatIf, simulationFact } from "@/lib/agent/policyContext";
import { useClaimedSubject } from "@/lib/nav/handoff";
import { clearProviderKey, hasProviderKey, storeProviderKey } from "@/lib/agent/keys";
import { findAnswers, fallbackAnswer, KNOWLEDGE } from "@/lib/support/knowledge";
import { runDiagnostics, type Diagnostic } from "@/lib/support/diagnostics";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/lib/utils";
import { useToast } from "@/lib/toast";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";
import { containsLedgerSeed, SecretInMessageError } from "@/lib/agent/secrets";
import { useObserver } from "@/lib/agent/useObserver";
import { ObserverPanel } from "./ObserverPanel";

type Turn = {
  id: number;
  role: "user" | "assistant";
  content: string;
  /** Set while the assistant turn is still streaming in. */
  streaming?: boolean;
  error?: boolean;
  /** Output of the deterministic policy simulation, not of the model. */
  simulation?: boolean;
  /** NOSHX's ledger reads for this answer, in the order they finished. */
  steps?: NoshxStep[];
  /** Set when this answer came from a failover runtime. */
  via?: string;
};

/** The last endpoint and model used with each provider, so switching back restores them. */
type Profiles = Record<string, { baseUrl: string; model: string; okAt?: number }>;

/** Free-plan address checks, shared with the Check an Address screen. */
const FREE_CHECKS_PER_MONTH = 10;
function monthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

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
  const [config, setConfig, configLoaded] = useSetting<AgentConfig>("agent.config", defaultConfig());
  const [profiles, setProfiles, profilesLoaded] = useSetting<Profiles>("agent.profiles", {});
  const [failover, setFailover] = useSetting<boolean>("agent.failover", true);
  const [checks, setChecks] = useSetting<{ month: string; count: number }>("public.checks", { month: monthKey(), count: 0 });
  const [endpointDraft, setEndpointDraft] = useState<string | null>(null);
  const { has } = useBilling();
  const [models, setModels] = useState<AgentModel[]>([]);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [showRuntimePicker, setShowRuntimePicker] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [keyStored, setKeyStored] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[] | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [probing, setProbing] = useState(true);
  const [probeMs, setProbeMs] = useState<number | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [testingRuntime, setTestingRuntime] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"chat" | "governance" | "observer">("chat");
  const observer = useObserver();
  const observerAlerts = observer.log.filter((o) => o.severity !== "info").length;
  const useLog = useAiUseLog();
  const { entries: ledgerEntries } = useLedger();
  const { active: activePolicy } = useGoverningPolicy();
  // A question handed over from a verdict ("ASK NOSHASHI WHY") arrives pre-filled.
  useClaimedSubject("agent", (subject) => {
    setMode("compliance");
    setDraft(subject.value);
  });

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const provider = findProvider(config.providerId);
  const boundary = dataBoundary(config);

  // Every model call is recorded as digests and sizes — never the text.
  const recordUse = (
    mode: AiUseRecord["mode"],
    messages: ChatMessage[],
    response: string,
    outcome: AiUseRecord["outcome"],
    used: AgentConfig = config
  ) =>
    void recordFor({ at: new Date().toISOString(), mode, config: used, messages, response, outcome })
      .then(useLog.append)
      .catch(() => undefined);

  // Remember what worked per provider, so switching back is one click.
  const remember = useCallback(
    (next: AgentConfig, ok: boolean) => {
      setProfiles({
        ...profiles,
        [next.providerId]: { baseUrl: next.baseUrl, model: next.model, okAt: ok ? Date.now() : profiles[next.providerId]?.okAt },
      });
    },
    [profiles, setProfiles]
  );

  // Each probe gets a number; a slower, older probe that answers after a
  // newer one must not overwrite the operator's newer choice.
  const probeSeq = useRef(0);

  const probe = useCallback(
    async (target?: AgentConfig, options: { allowAutodetect?: boolean } = {}) => {
      const seq = ++probeSeq.current;
      const current = () => seq === probeSeq.current;
      const active = target ?? config;
      const activeProvider = findProvider(active.providerId);
      const started = performance.now();
      setProbing(true);
      setRuntimeError(null);
      try {
        const found = await listModels(active);
        if (!current()) return;
        setModels(found);
        if (found.length === 0) {
          setRuntimeError(`${activeProvider.name} is reachable but exposes no models. ${activeProvider.setupHint}`);
          return;
        }
        const model =
          active.model && found.some((entry) => entry.name === active.model) ? active.model : (pickModel(found) ?? "");
        const next = { ...active, model };
        setConfig(next);
        remember(next, true);
      } catch (error) {
        if (!current()) return;
        setModels([]);
        // Only at startup, and only when a local runtime was configured, is
        // it right to go looking for another local runtime. An explicit
        // choice, above all a hosted one, is never silently replaced: that
        // replacement is what made switching look stuck.
        if (options.allowAutodetect && activeProvider.local) {
          const discovered = await autodetect();
          if (!current()) return;
          if (discovered) {
            setConfig(discovered);
            remember(discovered, true);
            setModels(await listModels(discovered).catch(() => []));
            setRuntimeError(null);
            return;
          }
        }
        setRuntimeError(
          error instanceof Error
            ? `${error.message.replace(/[.!?]?$/, ".")}${activeProvider.requiresKey ? "" : ` Tried ${active.baseUrl}.`}`
            : "No model runtime reachable."
        );
      } finally {
        if (current()) {
          setProbeMs(Math.round(performance.now() - started));
          setProbing(false);
        }
      }
    },
    [config, setConfig, remember]
  );

  // Probe once the saved choice has loaded. Probing before that checked
  // the built-in default (Ollama) and wrote it back over the operator's
  // saved runtime on every launch.
  const probedOnLoad = useRef(false);
  useEffect(() => {
    // Profiles too: the first probe records one, and must not overwrite
    // the saved set before it has been read.
    if (!configLoaded || !profilesLoaded || probedOnLoad.current) return;
    probedOnLoad.current = true;
    void probe(undefined, { allowAutodetect: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configLoaded, profilesLoaded]);

  /** Switch runtime, restoring the endpoint and model last used with it. */
  const switchTo = (providerId: string, baseUrl?: string) => {
    const entry = findProvider(providerId);
    const saved = profiles[providerId];
    const next: AgentConfig = {
      providerId,
      baseUrl: baseUrl ?? saved?.baseUrl ?? entry.defaultBaseUrl,
      model: baseUrl ? "" : (saved?.model ?? ""),
      hasStoredKey: false,
    };
    abortRef.current?.abort();
    setConfig(next);
    setModels([]);
    setEndpointDraft(null);
    void probe(next);
  };

  /** Another runtime that worked before, for failover. Local first: it is free and private. */
  const failoverTarget = (): AgentConfig | null => {
    const candidates = Object.entries(profiles)
      .filter(([id, profile]) => id !== config.providerId && profile.model && profile.okAt)
      .sort(([a, pa], [b, pb]) => {
        const la = findProvider(a).local ? 1 : 0;
        const lb = findProvider(b).local ? 1 : 0;
        return lb - la || (pb.okAt ?? 0) - (pa.okAt ?? 0);
      });
    const [id, profile] = candidates[0] ?? [];
    return id && profile ? { providerId: id, baseUrl: profile.baseUrl, model: profile.model, hasStoredKey: false } : null;
  };

  // Address checks NOSHX makes on the free plan count against the same
  // monthly allowance as the Check an Address screen.
  // A ref, because one answer can run several checks before a re-render.
  const checksRef = useRef(checks);
  checksRef.current = checks;
  const spendFreeCheck = () => {
    const used = checksRef.current.month === monthKey() ? checksRef.current.count : 0;
    if (used >= FREE_CHECKS_PER_MONTH) return false;
    const next = { month: monthKey(), count: used + 1 };
    checksRef.current = next;
    setChecks(next);
    return true;
  };

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
  const visibleModels = models.filter((entry) => {
    const query = modelFilter.trim().toLowerCase();
    return (
      !query ||
      entry.name.toLowerCase().includes(query) ||
      entry.detail.toLowerCase().includes(query)
    );
  });

  const testRuntime = async () => {
    if (!ready || testingRuntime) return;
    setTestingRuntime(true);
    const probeMessages: ChatMessage[] = [{ role: "user", content: "Reply with READY only." }];
    let response = "";
    try {
      await chatStream({
        config,
        messages: probeMessages,
        onToken: (token) => {
          response += token;
        },
        temperature: 0,
      });
      push({
        title: "MODEL RESPONDED",
        body: response.trim() ? `Probe returned: ${response.trim().slice(0, 80)}` : "The runtime accepted the request.",
        tone: "go",
      });
      recordUse("runtime-test", probeMessages, response, "complete");
    } catch (error) {
      recordUse("runtime-test", probeMessages, response, "error");
      push({
        title: "MODEL TEST FAILED",
        body: error instanceof Error ? error.message : "The runtime did not return a response.",
        tone: "no-go",
      });
    } finally {
      setTestingRuntime(false);
    }
  };

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;

    // A ledger secret is never echoed into the transcript or sent to a
    // model, local or hosted. chatStream refuses it too; stopping it here
    // keeps it out of the history every later message would carry.
    if (await containsLedgerSeed(prompt)) {
      setTurns((prev) => [...prev, { id: ++turnId, role: "assistant", content: new SecretInMessageError().message }]);
      setDraft("");
      return;
    }

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

    // A "what if" about a policy threshold runs the real simulation first.
    // Its numbers come from the engine; the model may only explain them.
    const whatIf = activePolicy ? parseWhatIf(prompt, activePolicy.params) : null;
    const simText = whatIf && activePolicy ? simulationFact(ledgerEntries, activePolicy, whatIf) : null;

    if (!config.model) {
      if (simText) {
        setTurns((prev) => [
          ...prev,
          { id: ++turnId, role: "user", content: prompt },
          { id: ++turnId, role: "assistant", content: simText, simulation: true },
        ]);
        setDraft("");
      }
      return;
    }

    const userTurn: Turn = { id: ++turnId, role: "user", content: prompt };
    const simTurn: Turn | null = simText
      ? { id: ++turnId, role: "assistant", content: simText, simulation: true }
      : null;
    const assistantTurn: Turn = {
      id: ++turnId,
      role: "assistant",
      content: "",
      streaming: true,
      steps: mode === "compliance" ? [] : undefined,
    };
    setTurns((prev) => [...prev, userTurn, ...(simTurn ? [simTurn] : []), assistantTurn]);
    setDraft("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const patch = (update: (turn: Turn) => Turn) =>
      setTurns((prev) => prev.map((turn) => (turn.id === assistantTurn.id ? update(turn) : turn)));

    const grounding =
      buildSystemPrompt(mode, data, boundary, buildPolicyBrief(activePolicy, ledgerEntries[0] ?? null)) +
      (simText ? `\n\n${simText}` : "");
    // Send the last few turns for continuity without blowing the window.
    const earlier: ChatMessage[] = turns
      .filter((turn) => !turn.simulation && !turn.error && turn.content)
      .slice(-HISTORY_TURNS)
      .map((turn) => ({ role: turn.role, content: turn.content }));
    // A conversation sent to a model starts with the operator's turn.
    while (earlier[0]?.role === "assistant") earlier.shift();
    const history: ChatMessage[] = [
      { role: "system", content: mode === "compliance" ? `${NOSHX_PREAMBLE}\n\n${grounding}` : grounding },
      ...earlier,
      { role: "user", content: prompt },
    ];

    // One attempt on a given runtime. NOSHX (compliance mode) reads the
    // ledger through tools; support mode streams a plain answer.
    const attempt = async (target: AgentConfig): Promise<string> => {
      if (mode === "compliance") {
        const result = await askNoshx({
          config: target,
          system: history[0].content,
          messages: history.slice(1),
          context: { has, spendFreeCheck },
          signal: controller.signal,
          onStep: (step) => patch((turn) => ({ ...turn, steps: [...(turn.steps ?? []), step] })),
        });
        if (result.usedTools) {
          patch((turn) => ({ ...turn, content: result.text }));
          return result.text;
        }
        // The model cannot call tools: answer from the grounding alone.
      }
      let streamed = "";
      await chatStream({
        config: target,
        messages: history,
        signal: controller.signal,
        onToken: (token: string) => {
          streamed += token;
          patch((turn) => ({ ...turn, content: turn.content + token }));
        },
      });
      return streamed;
    };

    let response = "";
    let used = config;
    try {
      try {
        response = await attempt(config);
      } catch (error) {
        // Seamless failover: when this runtime cannot be reached or refuses
        // the request, and nothing has been shown yet, ask the runtime that
        // last worked instead, and say so.
        const fallback = failover && !controller.signal.aborted && error instanceof AgentUnavailableError ? failoverTarget() : null;
        if (!fallback) throw error;
        used = fallback;
        const reason = error instanceof Error ? error.message : "request failed";
        patch((turn) => ({ ...turn, content: "", steps: turn.steps ? [] : undefined, via: findProvider(fallback.providerId).name }));
        push({
          title: `SWITCHED TO ${findProvider(fallback.providerId).name.toUpperCase()}`,
          body: `${provider.name} failed: ${reason}`,
          tone: "hold",
        });
        response = await attempt(fallback);
        setConfig(fallback);
        remember(fallback, true);
        setModels(await listModels(fallback).catch(() => []));
        setRuntimeError(null);
      }
      patch((turn) => ({ ...turn, streaming: false }));
      recordUse(mode, history, response, "complete", used);
    } catch (error) {
      const aborted = controller.signal.aborted;
      recordUse(mode, history, response, aborted ? "stopped" : "error", used);
      const message = aborted
        ? "Generation stopped."
        : error instanceof Error
          ? error.message
          : "The agent could not complete that request.";

      patch((turn) => ({ ...turn, streaming: false, error: !aborted, content: turn.content || message }));

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
        kicker={`NOSHX · ${boundary.onDevice ? "ON-DEVICE" : "REMOTE"} · ${provider.name.toUpperCase()} · ADVISORY ONLY`}
        title="NOSHX"
        sub={`NOSHASHI's agent. It reads the live ledger through the app's own tools and explains what it finds; it never issues a verdict or moves anything. Switch between a local model and a hosted one at any time. ${boundary.statement}`}
        status={ready ? (boundary.onDevice ? "go" : "hold") : probing ? "hold" : "no-go"}
        statusLabel={probing ? "PROBING" : ready ? (boundary.onDevice ? "LOCAL RUNTIME" : "REMOTE RUNTIME") : "RUNTIME DOWN"}
        right={
          <div className="flex items-center gap-2">
            {/* One control for the four views. The two chat modes and the two
                panels used to be a tab strip beside two outline buttons of a
                different height, which read as two unrelated controls. */}
            <Tabs
              value={view === "chat" ? mode : view}
              onValueChange={(value) => {
                if (value === "compliance" || value === "support") {
                  setMode(value);
                  setView("chat");
                } else {
                  setView(value as "observer" | "governance");
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="compliance">NOSHX</TabsTrigger>
                <TabsTrigger value="support">SUPPORT</TabsTrigger>
                <TabsTrigger value="observer">
                  OBSERVER{observerAlerts ? ` · ${observerAlerts}` : ""}
                </TabsTrigger>
                <TabsTrigger value="governance">GOVERNANCE</TabsTrigger>
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
        {view === "observer" ? (
          <Panel
            label="OBSERVER · WHAT CHANGED ON THE LEDGER FOR THE WALLETS YOU WATCH"
            corners
            className="col-span-3 min-h-0 min-w-0"
            bodyClassName="min-h-0 overflow-y-auto p-0"
          >
            <ObserverPanel
              onAsk={(prompt) => {
                setMode("compliance");
                setDraft(prompt);
                setView("chat");
              }}
            />
          </Panel>
        ) : view === "governance" ? (
          <Panel
            label="AI GOVERNANCE · WHAT THE AGENT MAY DO, WHERE ITS INPUT GOES, EVERY CALL MADE"
            corners
            className="col-span-3 min-h-0 min-w-0"
            bodyClassName="min-h-0 overflow-y-auto p-0"
          >
            <AgentGovernance
              config={config}
              boundary={boundary}
              keyStored={keyStored}
              mode={mode}
              data={data}
              log={useLog}
            />
          </Panel>
        ) : (
        /* Conversation */
        <Panel
          label={mode === "compliance" ? "NOSHX · LIVE LEDGER ANALYST" : "SUPPORT DESK"}
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
                title={
                  provider.requiresKey && !keyStored
                    ? `ADD YOUR ${provider.name.toUpperCase()} API KEY`
                    : provider.local
                      ? "LOCAL RUNTIME NOT DETECTED"
                      : `${provider.name.toUpperCase()} NOT REACHABLE`
                }
                body={runtimeError}
                action={
                  <div className="flex flex-col items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => void probe()}>
                      {provider.local ? "RETRY DETECTION" : "TRY AGAIN"}
                    </Button>
                    {failoverTarget() && (
                      <Button size="sm" variant="outline" onClick={() => switchTo(failoverTarget()!.providerId)}>
                        USE {findProvider(failoverTarget()!.providerId).name.toUpperCase()} INSTEAD
                      </Button>
                    )}
                    <a
                      href={provider.docsUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="stencil text-[8px] tracking-[0.2em] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
                    >
                      {provider.local ? "INSTALL" : "OPEN"} {provider.name.toUpperCase()}{provider.local ? "" : " DOCS"}
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
                  <NovaLogo size={40} tone="color" />
                </motion.div>
                <div className="max-w-[420px]">
                  <p className="display text-[13px] font-[700] tracking-[0.1em] text-foreground">
                    {mode === "compliance" ? "ASK NOSHX" : "ASK THE GRID"}
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    {mode === "compliance"
                      ? "NOSHX reads the live ledger with NOSHASHI's own tools: issuer authority, order-book depth, settlements, control surfaces, provenance and more. Name an address, issuer, pair or transaction hash. Its reasoning is the model's; its figures come from the ledger."
                      : "The agent can see the live ledger, this wallet's credentials and the full domain rule set. It explains verdicts — it never issues them."}
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
                          <NovaLogo size={12} animated={false} tone="color" />
                        )}
                      </span>
                      <div className={cn("min-w-0 flex-1", turn.simulation && "border border-hold/40 p-2")}>
                        {turn.simulation && (
                          <p className="stencil mb-1 text-[8px] tracking-[0.2em] text-hold">
                            SIMULATION · COMPUTED BY THE POLICY ENGINE · NOT MODEL OUTPUT
                          </p>
                        )}
                        {turn.via && (
                          <p className="stencil mb-1 text-[8px] tracking-[0.2em] text-hold">
                            ANSWERED BY {turn.via.toUpperCase()} · FAILOVER
                          </p>
                        )}
                        {turn.steps && turn.steps.length > 0 && (
                          <ul className="mb-1.5 space-y-0.5 border-l border-border pl-2">
                            {turn.steps.map((step, index) => (
                              <li key={index} className="mono-font text-[9px] leading-snug text-muted-foreground">
                                {step.kind === "tool" ? (
                                  <>
                                    <span className={step.ok ? "text-go" : "text-no-go"}>{step.ok ? "READ" : "FAILED"}</span>{" "}
                                    {step.name}
                                    {Object.values(step.input).length > 0 && ` · ${Object.values(step.input).map(String).join(" · ")}`}
                                    {!step.ok && ` — ${step.summary}`}
                                  </>
                                ) : (
                                  <span className="text-hold">{step.text}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {turn.streaming && turn.content.length === 0 && turn.steps && (
                          <span className="mono-font block text-[8px] tracking-[0.2em] text-muted-foreground">
                            NOSHX IS READING THE LEDGER…
                          </span>
                        )}
                        <p
                          className={cn(
                            "selectable whitespace-pre-wrap break-words leading-relaxed",
                            turn.simulation ? "mono-font text-[10px]" : "text-[11.5px]",
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
                      ? mode === "compliance"
                        ? "Ask NOSHX: \"Can the issuer of USD rvYAf… freeze my balance?\" or paste a transaction hash"
                        : "Ask about a verdict, a credential, a domain rule…"
                      : "Pick a runtime in the panel on the right to enable NOSHX"
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
                {boundary.onDevice ? "ON-DEVICE · NOTHING TRANSMITTED" : "REMOTE RUNTIME · TLS"}
              </span>
            </div>
          </div>
        </Panel>
        )}

        {/* Runtime + escalation */}
        {/* Scrolls rather than squeezing: fixed to the window height, the
            last panels were cut in half or, on a 700px window, given no
            height at all. */}
        <div className="col-span-1 flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto [&>*]:shrink-0">
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
              {endpointDraft === null ? (
                <button
                  onClick={() => setEndpointDraft(config.baseUrl)}
                  className="stencil mb-1 text-[8px] tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  EDIT ENDPOINT
                </button>
              ) : (
                <div className="mb-1.5 flex gap-1.5">
                  <Input
                    value={endpointDraft}
                    onChange={(event) => setEndpointDraft(event.target.value)}
                    aria-label="Runtime endpoint"
                    className="mono-font h-7 text-[10px]"
                  />
                  <Button
                    size="sm"
                    disabled={!isEndpointSafe(endpointDraft).ok}
                    title={isEndpointSafe(endpointDraft).reason}
                    onClick={() => switchTo(config.providerId, endpointDraft.trim())}
                  >
                    APPLY
                  </Button>
                </div>
              )}
              <DataRow label="MODELS" value={models.length} />
              <DataRow
                label="LAST CHECK"
                value={probeMs === null ? "pending" : `${probeMs} ms`}
                tone={probeMs !== null && probeMs < 1000 ? "go" : "muted"}
              />
              <DataRow
                label="ACTIVE"
                value={config.model || "none"}
                tone={config.model ? "go" : "no-go"}
              />
              <DataRow
                label="TRANSPORT"
                value={boundary.onDevice ? "ON-DEVICE" : "REMOTE (TLS)"}
                tone={boundary.onDevice ? "go" : "hold"}
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
                      setShowRuntimePicker(false);
                      switchTo(entry.id);
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
                {!boundary.onDevice && (
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
                  Sealed in the OS keyring, scoped to this provider, and only ever
                  sent to {provider.id === "custom" ? "your custom endpoint" : new URL(provider.defaultBaseUrl).host}.
                  The app adds it to each request itself; this window never reads it back.
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
                <div className="mb-1.5 mt-3 flex items-center gap-2">
                  <Eyebrow className="min-w-0 flex-1">AVAILABLE MODELS · {visibleModels.length}/{models.length}</Eyebrow>
                  {models.length > 3 && (
                    <Input
                      value={modelFilter}
                      onChange={(event) => setModelFilter(event.target.value)}
                      placeholder="FILTER"
                      aria-label="Filter available models"
                      className="mono-font h-6 w-24 text-[8px]"
                    />
                  )}
                </div>
                <div className="max-h-[132px] space-y-1 overflow-y-auto">
                  {visibleModels.map((entry) => (
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
                  {visibleModels.length === 0 && (
                    <p className="border border-border/60 px-2 py-2 text-[9px] text-muted-foreground">
                    No models match this filter.
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void probe()}
                disabled={probing}
              >
                {probing ? "PROBING…" : "RE-DETECT"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void testRuntime()}
                disabled={!ready || testingRuntime}
              >
                {testingRuntime ? "TESTING…" : "TEST MODEL"}
              </Button>
            </div>
            <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[9px] leading-snug text-muted-foreground">
              <input
                type="checkbox"
                checked={failover}
                onChange={(event) => setFailover(event.target.checked)}
                className="mt-0.5 accent-current"
              />
              <span>
                <span className="stencil block text-[8px] tracking-[0.2em] text-foreground">FAILOVER</span>
                If this runtime fails, answer with the last one that worked
                {failoverTarget() ? ` (${findProvider(failoverTarget()!.providerId).name} · ${failoverTarget()!.model})` : ""} and say so.
              </span>
            </label>
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
              { icon: <NovaVault size={11} />, text: "Will not send a message containing an XRPL secret seed, to any model." },
              { icon: <NovaBolt size={11} />, text: "Figures come from read-only ledger tools; it cannot sign or move anything." },
              {
                icon: <NovaTerminal size={11} />,
                text: boundary.onDevice
                  ? "Runs on this machine — prompts never leave the device."
                  : `Remote runtime selected — prompts go to ${boundary.host} over TLS.`,
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

          <Panel label="HUMAN ESCALATION" className="flex-auto">
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
                  className="inset-row flex items-center justify-between gap-3 px-2.5 py-2"
                >
                  <span className="stencil shrink-0 text-[8px] tracking-[0.2em] text-muted-foreground">
                    {route.label}
                  </span>
                  <span className="mono-font min-w-0 break-all text-right text-[9px] text-foreground">
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
