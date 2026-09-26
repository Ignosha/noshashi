import {
  findProvider,
  isEndpointSafe,
  MODEL_PREFERENCE,
  normalizeEndpoint,
  type AgentConfig,
} from "./providers";
import { hasProviderKey } from "./keys";
import { containsLedgerSeed, SecretInMessageError } from "./secrets";
import { modelCall, TransportError } from "./transport";

/**
 * One agent transport for every runtime.
 *
 * Three wire formats cover the field: Ollama's native API, the OpenAI
 * chat-completions shape that LM Studio, llama.cpp, Jan, vLLM,
 * OpenRouter, Groq and Together all speak, and Anthropic's Messages API.
 * Everything above this module is provider-agnostic as a result. The
 * requests themselves leave through ./transport.ts, which in the desktop
 * app means Rust, where the API key is added.
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AgentModel = {
  name: string;
  sizeBytes: number;
  detail: string;
};

export class AgentUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentUnavailableError";
  }
}

const PROBE_TIMEOUT_MS = 2500;
/** Hosted model lists are slower than a local socket. */
const HOSTED_PROBE_TIMEOUT_MS = 10_000;

/** Sampling temperature for local runtimes. Low: the agent explains a fixed rule set. */
export const CHAT_TEMPERATURE = 0.3;
/**
 * Output cap sent to Anthropic, which requires one. Generous, because a
 * capped answer stops mid-sentence; the other runtimes use their own.
 */
export const ANTHROPIC_MAX_TOKENS = 16_000;
/** Earlier turns re-sent with each question, for continuity without blowing the window. */
export const HISTORY_TURNS = 6;

/**
 * Whether to send a sampling temperature. Current Claude models reject
 * one outright (400), as do OpenAI's reasoning models, which is what made
 * switching to a hosted model fail on the first message. Hosted models
 * run at their own defaults; local runtimes keep the low setting.
 */
export function sendsTemperature(config: AgentConfig): boolean {
  return findProvider(config.providerId).local;
}

export function apiBase(config: AgentConfig): string {
  const provider = findProvider(config.providerId);
  const endpoint = normalizeEndpoint(config.baseUrl);
  if (provider.api === "ollama") return endpoint.replace(/\/v1$/, "");
  if (provider.local && provider.api === "openai" && new URL(endpoint).pathname === "/") {
    return `${endpoint}/v1`;
  }
  return endpoint;
}

/** Turn a transport failure or an HTTP error into one plain sentence. */
export function describeFailure(status: number, body: string, config: AgentConfig): string {
  const provider = findProvider(config.providerId);
  let detail = "";
  try {
    const parsed = JSON.parse(body) as Record<string, any>;
    detail = String(parsed.error?.message ?? parsed.error ?? parsed.message ?? "");
  } catch {
    detail = body.slice(0, 200);
  }
  if (status === 401 || status === 403) {
    return `${provider.name} refused the API key (${status}). Check it in the runtime panel.`;
  }
  if (status === 404) {
    return `${provider.name} does not know "${config.model || "that endpoint"}" (404).${detail ? ` ${detail}` : ""}`;
  }
  if (status === 429) {
    return `${provider.name} is rate limiting this key (429). Wait a moment, or switch runtime.`;
  }
  return `${provider.name} replied ${status}.${detail ? ` ${detail}` : ""}`;
}

async function call(
  config: AgentConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; stream?: boolean; onChunk?: (t: string) => void; signal?: AbortSignal; timeoutMs?: number; headers?: Record<string, string> }
) {
  const safety = isEndpointSafe(config.baseUrl);
  if (!safety.ok) throw new AgentUnavailableError(safety.reason!);
  try {
    return await modelCall({ config, url: `${apiBase(config)}${path}`, ...init });
  } catch (error) {
    if (error instanceof TransportError) throw new AgentUnavailableError(error.message);
    throw error;
  }
}

/**
 * Whether a provider can be used right now without a network call:
 * a hosted provider with no key stored is not usable, and saying so is
 * better than a request that fails with 401.
 */
export async function missingKey(config: AgentConfig): Promise<string | null> {
  const provider = findProvider(config.providerId);
  if (!provider.requiresKey) return null;
  if (await hasProviderKey(provider.id).catch(() => false)) return null;
  return `${provider.name} needs an API key. Paste it below and press SEAL; it is kept in the OS keyring.`;
}

export async function listModels(config: AgentConfig, signal?: AbortSignal): Promise<AgentModel[]> {
  const provider = findProvider(config.providerId);
  const missing = await missingKey(config);
  if (missing) throw new AgentUnavailableError(missing);

  const timeoutMs = provider.local ? PROBE_TIMEOUT_MS : HOSTED_PROBE_TIMEOUT_MS;
  const path = provider.api === "ollama" ? "/api/tags" : "/models";
  const reply = await call(config, path, { method: "GET", signal, timeoutMs });
  if (reply.status < 200 || reply.status >= 300) {
    throw new AgentUnavailableError(describeFailure(reply.status, reply.body, config));
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(reply.body);
  } catch {
    throw new AgentUnavailableError(`${provider.name} answered, but not with a model list.`);
  }

  if (provider.api === "ollama") {
    return ((payload.models ?? []) as Array<Record<string, any>>).map((model) => ({
      name: String(model.name ?? ""),
      sizeBytes: Number(model.size ?? 0),
      detail: String(model.details?.parameter_size ?? model.details?.family ?? ""),
    }));
  }
  return ((payload.data ?? []) as Array<Record<string, any>>).map((model) => ({
    name: String(model.id ?? ""),
    sizeBytes: 0,
    detail: String(model.display_name ?? model.owned_by ?? ""),
  }));
}

/** Best available model, honouring the preference order. */
export function pickModel(models: AgentModel[]): string | null {
  if (models.length === 0) return null;
  for (const preferred of MODEL_PREFERENCE) {
    const match = models.find((model) => model.name.toLowerCase().includes(preferred));
    if (match) return match.name;
  }
  return models[0].name;
}

/**
 * Probe the known local runtimes and return the first that answers.
 * Local-first is the default because it is free and nothing leaves the
 * machine — the operator has to opt in to anything else.
 */
export async function autodetect(): Promise<AgentConfig | null> {
  const candidates = (await import("./providers")).PROVIDERS.filter((provider) => provider.autodetect);

  const probes = candidates.flatMap((provider) => {
    const endpoints = new Set([provider.defaultBaseUrl]);
    if (provider.defaultBaseUrl.includes("localhost")) {
      endpoints.add(provider.defaultBaseUrl.replace("localhost", "127.0.0.1"));
    }

    return [...endpoints].map(async (baseUrl) => {
      try {
        const config: AgentConfig = { providerId: provider.id, baseUrl, model: "", hasStoredKey: false };
        const models = await listModels(config);
        if (models.length === 0) return null;
        return { ...config, model: pickModel(models) ?? "" };
      } catch {
        return null;
      }
    });
  });

  const results = await Promise.all(probes);
  // Preserve registry order so Ollama wins when several are running.
  return results.find((result): result is AgentConfig => result !== null) ?? null;
}

/**
 * Reads a streamed completion in any of the three formats. Ollama emits
 * newline-delimited JSON, the OpenAI shape and Anthropic emit server-sent
 * events; all are read line by line because a chunk can end mid-frame.
 */
export function streamParser(onToken: (token: string) => void) {
  let buffer = "";
  let full = "";

  const handle = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("event:") || trimmed.startsWith(":")) return;
    const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
    if (payload === "[DONE]") return;

    let frame: Record<string, any>;
    try {
      frame = JSON.parse(payload);
    } catch {
      return; // A malformed frame is not worth ending a good stream over.
    }
    if (frame.error || frame.type === "error") {
      const error = frame.error;
      throw new AgentUnavailableError(
        typeof error === "string" ? error : (error?.message ?? "The runtime reported an error.")
      );
    }
    // Ollama: message.content · OpenAI: choices[0].delta.content ·
    // Anthropic: delta.text on a text_delta (thinking deltas are skipped).
    const token =
      frame.message?.content ??
      frame.choices?.[0]?.delta?.content ??
      (frame.type === "content_block_delta" && frame.delta?.type === "text_delta" ? frame.delta.text : "") ??
      "";
    if (token) {
      full += token;
      onToken(token);
    }
  };

  return {
    push(text: string) {
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handle(line);
    },
    end(): string {
      if (buffer) handle(buffer);
      buffer = "";
      return full;
    },
  };
}

export type ChatOptions = {
  config: AgentConfig;
  messages: ChatMessage[];
  onToken: (token: string) => void;
  signal?: AbortSignal;
  temperature?: number;
};

/** The request body for a streamed chat, shaped for the provider's API. */
export function chatBody(config: AgentConfig, messages: ChatMessage[], temperature: number) {
  const provider = findProvider(config.providerId);
  const withTemperature = sendsTemperature(config);

  if (provider.api === "anthropic") {
    // The system prompt stays out of the message list, and a token budget is required.
    return {
      model: config.model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: messages.find((message) => message.role === "system")?.content,
      messages: messages.filter((message) => message.role !== "system"),
      stream: true,
    };
  }
  if (provider.api === "ollama") {
    return { model: config.model, messages, stream: true, ...(withTemperature ? { options: { temperature } } : {}) };
  }
  return { model: config.model, messages, stream: true, ...(withTemperature ? { temperature } : {}) };
}

export function chatPath(config: AgentConfig): string {
  const api = findProvider(config.providerId).api;
  return api === "anthropic" ? "/messages" : api === "ollama" ? "/api/chat" : "/chat/completions";
}

/** Stream a completion, token by token. */
export async function chatStream({
  config,
  messages,
  onToken,
  signal,
  temperature = CHAT_TEMPERATURE,
}: ChatOptions): Promise<string> {
  // Before anything else: a message carrying a ledger secret is never
  // sent, to a local model or a hosted one. See ./secrets.ts.
  for (const message of messages) {
    if (message.role !== "system" && (await containsLedgerSeed(message.content))) throw new SecretInMessageError();
  }
  if (!config.model) throw new AgentUnavailableError("No model selected.");

  const parser = streamParser(onToken);
  const reply = await call(config, chatPath(config), {
    method: "POST",
    body: chatBody(config, messages, temperature),
    stream: true,
    onChunk: (text) => parser.push(text),
    signal,
  });
  if (reply.status < 200 || reply.status >= 300) {
    throw new AgentUnavailableError(describeFailure(reply.status, reply.body, config));
  }
  return parser.end();
}
