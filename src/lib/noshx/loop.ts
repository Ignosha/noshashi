import {
  AgentUnavailableError,
  ANTHROPIC_MAX_TOKENS,
  apiBase,
  CHAT_TEMPERATURE,
  describeFailure,
  sendsTemperature,
  type ChatMessage,
} from "@/lib/agent/client";
import { findProvider, isEndpointSafe, type AgentConfig } from "@/lib/agent/providers";
import { modelCall, TransportError } from "@/lib/agent/transport";
import { containsLedgerSeed, SecretInMessageError } from "@/lib/agent/secrets";
import { NOSHX_TOOLS, runTool, type ToolContext } from "./tools";

/**
 * NOSHX: the agent loop.
 *
 * The model is asked a question with the tool list attached. When it
 * asks for tools, NOSHX runs them against the live ledger and returns the
 * results; when it answers, the loop ends. The same loop drives all three
 * wire formats (Anthropic Messages, OpenAI chat completions, Ollama), so
 * the operator can move NOSHX between a local model and a hosted one
 * without anything else changing.
 *
 * What NOSHX can reason about depends on the model it runs on; what it
 * can state as fact depends on these tools. The system prompt tells it
 * so, and every figure it quotes comes from a tool result.
 */

export const MAX_STEPS = 8;

export type NoshxStep =
  | { kind: "tool"; name: string; input: Record<string, unknown>; ok: boolean; summary: string }
  | { kind: "note"; text: string };

export type NoshxRun = {
  config: AgentConfig;
  system: string;
  /** Earlier turns, plain text, oldest first; the new question is last. */
  messages: ChatMessage[];
  context: ToolContext;
  onStep?: (step: NoshxStep) => void;
  signal?: AbortSignal;
};

export type NoshxResult = {
  text: string;
  steps: NoshxStep[];
  /** False when the model could not call tools and NOSHX answered without them. */
  usedTools: boolean;
};

type ToolCall = { id: string; name: string; input: Record<string, unknown> };

/** A model or runtime that cannot call tools says so in one of these ways. */
export function isToolsUnsupported(status: number, body: string): boolean {
  return (
    status >= 400 &&
    status < 500 &&
    /does not support tools|tools? (are|is) not supported|tool[_ ]?(use|calling|choice).*not supported|unsupported.*tool|no endpoints found that support tool/i.test(body)
  );
}

export const NOSHX_PREAMBLE = [
  "You are NOSHX, the agent built into NOSHASHI, a desktop app that reads the live XRP Ledger for compliance and exit-liquidity questions.",
  "You have read-only tools that query the live ledger through NOSHASHI's own readers. Use them whenever a question turns on the current state of an account, issuer, order book, pool or transaction, and call several in one turn when they are independent.",
  "Every figure you state must come from a tool result or from the facts below, and should carry the ledger index it was read at when the result gives one. If a tool fails or is not available on the operator's plan, say so; never fill the gap with a guess.",
  "You explain; you do not adjudicate. NOSHASHI's deterministic engine issues verdicts. You cannot sign, submit or move anything, and you never ask for a secret key or seed.",
  "Be direct and specific. Lead with the answer, then the evidence.",
].join("\n");

function toolDefsAnthropic() {
  return NOSHX_TOOLS.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.input_schema }));
}

function toolDefsOpenAi() {
  return NOSHX_TOOLS.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
  }));
}

/** Claude models that take the server-side refusal fallback. */
function takesFallbacks(model: string): boolean {
  return /^claude-(opus-5|fable-5)/.test(model);
}

async function post(config: AgentConfig, path: string, body: unknown, signal?: AbortSignal, headers?: Record<string, string>) {
  const safety = isEndpointSafe(config.baseUrl);
  if (!safety.ok) throw new AgentUnavailableError(safety.reason!);
  try {
    return await modelCall({ config, url: `${apiBase(config)}${path}`, method: "POST", body, signal, headers });
  } catch (error) {
    if (error instanceof TransportError) throw new AgentUnavailableError(error.message);
    throw error;
  }
}

function parse(body: string): Record<string, any> {
  try {
    return JSON.parse(body);
  } catch {
    throw new AgentUnavailableError("The runtime answered, but not with JSON.");
  }
}

async function runCalls(calls: ToolCall[], run: NoshxRun, steps: NoshxStep[]) {
  // Independent reads, so they run together.
  return Promise.all(
    calls.map(async (call) => {
      const result = await runTool(call.name, call.input, run.context);
      const step: NoshxStep = {
        kind: "tool",
        name: call.name,
        input: call.input,
        ok: result.ok,
        summary: result.ok ? `${result.content.length.toLocaleString()} characters read` : result.content,
      };
      steps.push(step);
      run.onStep?.(step);
      return { call, result };
    })
  );
}

class ToolsUnsupported extends Error {}

async function anthropicLoop(run: NoshxRun, steps: NoshxStep[]): Promise<string> {
  const { config } = run;
  const messages: Array<Record<string, any>> = run.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  let fallbacks = takesFallbacks(config.model);

  for (let step = 0; step < MAX_STEPS; step++) {
    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: run.system,
      tools: toolDefsAnthropic(),
      messages,
      ...(fallbacks ? { fallbacks: "default" } : {}),
    };
    const reply = await post(config, "/messages", body, run.signal, fallbacks ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : undefined);
    if (reply.status === 400 && fallbacks && /fallback/i.test(reply.body)) {
      // An account or model without the fallback beta: ask again without it.
      fallbacks = false;
      step--;
      continue;
    }
    if (reply.status < 200 || reply.status >= 300) {
      if (isToolsUnsupported(reply.status, reply.body)) throw new ToolsUnsupported();
      throw new AgentUnavailableError(describeFailure(reply.status, reply.body, config));
    }

    const response = parse(reply.body);
    const content = (response.content ?? []) as Array<Record<string, any>>;
    const text = content.filter((block) => block.type === "text").map((block) => block.text).join("");

    if (response.stop_reason === "refusal") {
      return text || "The model declined this request. Rephrase it, or switch to another model in the runtime panel.";
    }
    if (response.stop_reason !== "tool_use") {
      return response.stop_reason === "max_tokens" ? `${text}\n\n[The answer reached the output limit and was cut here.]` : text;
    }

    // The whole assistant turn goes back unchanged, thinking blocks included.
    messages.push({ role: "assistant", content });
    const calls: ToolCall[] = content
      .filter((block) => block.type === "tool_use")
      .map((block) => ({ id: String(block.id), name: String(block.name), input: (block.input ?? {}) as Record<string, unknown> }));
    const results = await runCalls(calls, run, steps);
    // Every result in one user message, so the model keeps calling tools in parallel.
    messages.push({
      role: "user",
      content: results.map(({ call, result }) => ({
        type: "tool_result",
        tool_use_id: call.id,
        content: result.content,
        ...(result.ok ? {} : { is_error: true }),
      })),
    });
  }
  return finalAfterLimit(steps);
}

async function openAiStyleLoop(run: NoshxRun, steps: NoshxStep[]): Promise<string> {
  const { config } = run;
  const provider = findProvider(config.providerId);
  const ollama = provider.api === "ollama";
  const messages: Array<Record<string, any>> = [
    { role: "system", content: run.system },
    ...run.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
  ];
  const temperature = sendsTemperature(config) ? CHAT_TEMPERATURE : undefined;

  for (let step = 0; step < MAX_STEPS; step++) {
    const body = ollama
      ? { model: config.model, messages, tools: toolDefsOpenAi(), stream: false, ...(temperature !== undefined ? { options: { temperature } } : {}) }
      : { model: config.model, messages, tools: toolDefsOpenAi(), ...(temperature !== undefined ? { temperature } : {}) };
    const reply = await post(config, ollama ? "/api/chat" : "/chat/completions", body, run.signal);
    if (reply.status < 200 || reply.status >= 300) {
      if (isToolsUnsupported(reply.status, reply.body)) throw new ToolsUnsupported();
      throw new AgentUnavailableError(describeFailure(reply.status, reply.body, config));
    }

    const response = parse(reply.body);
    const message = (ollama ? response.message : response.choices?.[0]?.message) ?? {};
    const rawCalls = (message.tool_calls ?? []) as Array<Record<string, any>>;
    if (rawCalls.length === 0) return String(message.content ?? "");

    const calls: ToolCall[] = rawCalls.map((raw, index) => {
      const args = raw.function?.arguments;
      let input: Record<string, unknown> = {};
      if (typeof args === "string") {
        try {
          input = JSON.parse(args || "{}");
        } catch {
          input = {};
        }
      } else if (args && typeof args === "object") {
        input = args;
      }
      return { id: String(raw.id ?? `call_${step}_${index}`), name: String(raw.function?.name ?? ""), input };
    });

    messages.push({ role: "assistant", content: message.content ?? "", tool_calls: rawCalls });
    const results = await runCalls(calls, run, steps);
    for (const { call, result } of results) {
      messages.push(
        ollama
          ? { role: "tool", tool_name: call.name, content: result.content }
          : { role: "tool", tool_call_id: call.id, content: result.content }
      );
    }
  }
  return finalAfterLimit(steps);
}

function finalAfterLimit(steps: NoshxStep[]): string {
  return `NOSHX stopped after ${MAX_STEPS} rounds of ledger reads without reaching an answer (${steps.length} reads made). Ask a narrower question, or name the address or pair you mean.`;
}

/**
 * Ask NOSHX. Throws AgentUnavailableError when the runtime cannot be
 * reached or refuses the request; tool failures are handed to the model
 * instead, so it can say what it could not read.
 */
export async function askNoshx(run: NoshxRun): Promise<NoshxResult> {
  for (const message of run.messages) {
    if (message.role !== "system" && (await containsLedgerSeed(message.content))) throw new SecretInMessageError();
  }
  if (!run.config.model) throw new AgentUnavailableError("No model selected.");

  const steps: NoshxStep[] = [];
  const anthropic = findProvider(run.config.providerId).api === "anthropic";
  try {
    const text = anthropic ? await anthropicLoop(run, steps) : await openAiStyleLoop(run, steps);
    return { text, steps, usedTools: true };
  } catch (error) {
    if (!(error instanceof ToolsUnsupported)) throw error;
    const note: NoshxStep = {
      kind: "note",
      text: `${run.config.model} cannot call tools, so NOSHX answered from the facts it was given without reading the ledger. For live reads, pick a tool-capable model (for example qwen2.5 or llama3.1 locally, or Claude).`,
    };
    steps.push(note);
    run.onStep?.(note);
    return { text: "", steps, usedTools: false };
  }
}
