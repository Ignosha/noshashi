import { findProvider, isEndpointSafe, MODEL_PREFERENCE, type AgentConfig } from "./providers";
import { getProviderKey } from "./keys";

/**
 * One agent transport for every runtime.
 *
 * Two wire formats cover the entire field: Ollama's native API and the
 * OpenAI chat-completions shape that LM Studio, llama.cpp, Jan, vLLM,
 * OpenRouter, Groq and Together all speak. Everything above this module
 * is provider-agnostic as a result.
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

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = PROBE_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: init.signal ?? controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

/** Strip a trailing slash so path joins never double up. */
function base(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Auth headers for a provider. Local runtimes need none; hosted ones
 * take the key from the OS keyring at call time.
 */
async function authHeaders(config: AgentConfig): Promise<Record<string, string>> {
  const provider = findProvider(config.providerId);
  if (!provider.requiresKey) return {};

  const key = await getProviderKey(provider.id);
  if (!key) {
    throw new AgentUnavailableError(
      `${provider.name} needs an API key. Add one in the runtime panel — it is stored in the OS keyring.`
    );
  }

  if (provider.api === "anthropic") {
    return {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      // Anthropic requires this to be explicit for browser-origin calls.
      "anthropic-dangerous-direct-browser-access": "true",
    };
  }
  return { Authorization: `Bearer ${key}` };
}

export async function listModels(config: AgentConfig): Promise<AgentModel[]> {
  const provider = findProvider(config.providerId);
  const safety = isEndpointSafe(config.baseUrl);
  if (!safety.ok) throw new AgentUnavailableError(safety.reason!);

  const headers = await authHeaders(config);

  if (provider.api === "anthropic") {
    const response = await fetchWithTimeout(`${base(config.baseUrl)}/models`, { headers });
    if (!response.ok) {
      throw new AgentUnavailableError(`Anthropic replied ${response.status}.`);
    }
    const payload = (await response.json()) as { data?: Array<Record<string, any>> };
    return (payload.data ?? []).map((model) => ({
      name: String(model.id ?? ""),
      sizeBytes: 0,
      detail: String(model.display_name ?? ""),
    }));
  }

  if (provider.api === "ollama") {
    const response = await fetchWithTimeout(`${base(config.baseUrl)}/api/tags`);
    if (!response.ok) {
      throw new AgentUnavailableError(`Runtime replied ${response.status}.`);
    }
    const payload = (await response.json()) as { models?: Array<Record<string, any>> };
    return (payload.models ?? []).map((model) => ({
      name: String(model.name ?? ""),
      sizeBytes: Number(model.size ?? 0),
      detail: String(model.details?.parameter_size ?? model.details?.family ?? ""),
    }));
  }

  const response = await fetchWithTimeout(`${base(config.baseUrl)}/models`, { headers });
  if (!response.ok) {
    throw new AgentUnavailableError(`Runtime replied ${response.status}.`);
  }
  const payload = (await response.json()) as { data?: Array<Record<string, any>> };
  return (payload.data ?? []).map((model) => ({
    name: String(model.id ?? ""),
    sizeBytes: 0,
    detail: String(model.owned_by ?? ""),
  }));
}

/** Best available model, honouring the small-instruct preference order. */
export function pickModel(models: AgentModel[]): string | null {
  if (models.length === 0) return null;
  for (const preferred of MODEL_PREFERENCE) {
    const match = models.find((model) =>
      model.name.toLowerCase().includes(preferred)
    );
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
  const candidates = (await import("./providers")).PROVIDERS.filter(
    (provider) => provider.autodetect
  );

  const probes = candidates.map(async (provider) => {
    try {
      const config: AgentConfig = {
        providerId: provider.id,
        baseUrl: provider.defaultBaseUrl,
        model: "",
        hasStoredKey: false,
      };
      const models = await listModels(config);
      if (models.length === 0) return null;
      return { ...config, model: pickModel(models) ?? "" };
    } catch {
      return null;
    }
  });

  const results = await Promise.all(probes);
  // Preserve registry order so Ollama wins when several are running.
  return results.find((result): result is AgentConfig => result !== null) ?? null;
}

export type ChatOptions = {
  config: AgentConfig;
  messages: ChatMessage[];
  onToken: (token: string) => void;
  signal?: AbortSignal;
  temperature?: number;
};

/**
 * Stream a completion. Ollama emits newline-delimited JSON and the
 * OpenAI shape emits server-sent events; both are read line-by-line
 * because a network chunk can split a frame in half.
 */
export async function chatStream({
  config,
  messages,
  onToken,
  signal,
  temperature = 0.3,
}: ChatOptions): Promise<string> {
  const provider = findProvider(config.providerId);
  const safety = isEndpointSafe(config.baseUrl);
  if (!safety.ok) throw new AgentUnavailableError(safety.reason!);
  if (!config.model) throw new AgentUnavailableError("No model selected.");

  const headers = {
    "Content-Type": "application/json",
    ...(await authHeaders(config)),
  };

  // Anthropic keeps the system prompt out of the message list and needs
  // an explicit token budget, so its request is shaped separately.
  const isAnthropic = provider.api === "anthropic";
  const systemPrompt = messages.find((message) => message.role === "system")?.content;
  const conversation = messages.filter((message) => message.role !== "system");

  const url = isAnthropic
    ? `${base(config.baseUrl)}/messages`
    : provider.api === "ollama"
      ? `${base(config.baseUrl)}/api/chat`
      : `${base(config.baseUrl)}/chat/completions`;

  const body = isAnthropic
    ? {
        model: config.model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: conversation,
        stream: true,
        temperature,
      }
    : provider.api === "ollama"
      ? { model: config.model, messages, stream: true, options: { temperature } }
      : { model: config.model, messages, stream: true, temperature };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new AgentUnavailableError(
      `Runtime replied ${response.status}. Is "${config.model}" available on ${provider.name}?`
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // OpenAI-compatible streams prefix every frame with "data: ".
      const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
      if (payload === "[DONE]") continue;

      try {
        const frame = JSON.parse(payload) as Record<string, any>;
        if (frame.error) {
          throw new AgentUnavailableError(
            typeof frame.error === "string"
              ? frame.error
              : (frame.error.message ?? "Runtime error")
          );
        }
        // Ollama: message.content · OpenAI: choices[0].delta.content
        // Anthropic: delta.text on a content_block_delta event
        const token =
          frame.message?.content ??
          frame.choices?.[0]?.delta?.content ??
          (frame.type === "content_block_delta" ? frame.delta?.text : "") ??
          "";
        if (token) {
          full += token;
          onToken(token);
        }
      } catch (error) {
        if (error instanceof AgentUnavailableError) throw error;
        // A malformed frame is not worth ending a good stream over.
      }
    }
  }

  return full;
}
