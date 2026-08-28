/**
 * Model provider registry.
 *
 * The agent is provider-agnostic: anything speaking the Ollama native
 * API or the OpenAI chat-completions shape will work, which covers
 * essentially every local runtime and every hosted gateway.
 *
 * Local runtimes are the defaults on purpose. They are free, they are
 * fast enough for this workload, and — decisively for a compliance
 * tool — a prompt containing wallet addresses and rule traces never
 * crosses the network boundary.
 */

export type ProviderApi = "ollama" | "openai" | "anthropic";

export type Provider = {
  id: string;
  name: string;
  blurb: string;
  api: ProviderApi;
  /** Runs on the operator's machine — no data leaves the device. */
  local: boolean;
  /** No per-token cost to the operator. */
  free: boolean;
  defaultBaseUrl: string;
  requiresKey: boolean;
  /** Probed on startup to auto-select a working runtime. */
  autodetect: boolean;
  setupHint: string;
  docsUrl: string;
};

export const PROVIDERS: Provider[] = [
  {
    id: "ollama",
    name: "Ollama",
    blurb: "The default. Local, free, one command to install a model.",
    api: "ollama",
    local: true,
    free: true,
    defaultBaseUrl: "http://localhost:11434",
    requiresKey: false,
    autodetect: true,
    setupHint: "ollama serve, then: ollama pull hermes3",
    docsUrl: "https://ollama.com/download",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    blurb: "Local, free, with a GUI model browser. OpenAI-compatible server.",
    api: "openai",
    local: true,
    free: true,
    defaultBaseUrl: "http://localhost:1234/v1",
    requiresKey: false,
    autodetect: true,
    setupHint: "Enable the local server in LM Studio's Developer tab.",
    docsUrl: "https://lmstudio.ai",
  },
  {
    id: "llamacpp",
    name: "llama.cpp",
    blurb: "Local, free, minimal. Runs GGUF weights directly.",
    api: "openai",
    local: true,
    free: true,
    defaultBaseUrl: "http://localhost:8080/v1",
    requiresKey: false,
    autodetect: true,
    setupHint: "llama-server -m model.gguf --port 8080",
    docsUrl: "https://github.com/ggml-org/llama.cpp",
  },
  {
    id: "jan",
    name: "Jan",
    blurb: "Local, free, open source desktop runtime.",
    api: "openai",
    local: true,
    free: true,
    defaultBaseUrl: "http://localhost:1337/v1",
    requiresKey: false,
    autodetect: true,
    setupHint: "Enable the local API server in Jan's settings.",
    docsUrl: "https://jan.ai",
  },
  {
    id: "vllm",
    name: "vLLM",
    blurb: "Self-hosted, free, built for throughput on your own GPU.",
    api: "openai",
    local: true,
    free: true,
    defaultBaseUrl: "http://localhost:8000/v1",
    requiresKey: false,
    autodetect: true,
    setupHint: "vllm serve <model> --port 8000",
    docsUrl: "https://docs.vllm.ai",
  },
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    blurb:
      "Claude Opus, Sonnet and Haiku. The strongest reasoning for a rule trace; needs an API key.",
    api: "anthropic",
    local: false,
    free: false,
    defaultBaseUrl: "https://api.anthropic.com/v1",
    requiresKey: true,
    autodetect: false,
    setupHint: "Create a key at console.anthropic.com and paste it below.",
    docsUrl: "https://docs.anthropic.com",
  },
  {
    id: "openai",
    name: "OpenAI",
    blurb: "GPT models through the official API. Needs an API key.",
    api: "openai",
    local: false,
    free: false,
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresKey: true,
    autodetect: false,
    setupHint: "Create a key at platform.openai.com.",
    docsUrl: "https://platform.openai.com/docs",
  },
  {
    id: "groq",
    name: "Groq",
    blurb: "Open-weight models at very high token throughput. Generous free tier.",
    api: "openai",
    local: false,
    free: true,
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    requiresKey: true,
    autodetect: false,
    setupHint: "Create a key at console.groq.com.",
    docsUrl: "https://console.groq.com/docs",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    blurb: "One key, several hundred models from every major lab.",
    api: "openai",
    local: false,
    free: false,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    requiresKey: true,
    autodetect: false,
    setupHint: "Create a key at openrouter.ai/keys.",
    docsUrl: "https://openrouter.ai/docs",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    blurb: "Strong reasoning models at low cost.",
    api: "openai",
    local: false,
    free: false,
    defaultBaseUrl: "https://api.deepseek.com/v1",
    requiresKey: true,
    autodetect: false,
    setupHint: "Create a key at platform.deepseek.com.",
    docsUrl: "https://api-docs.deepseek.com",
  },
  {
    id: "mistral",
    name: "Mistral",
    blurb: "European models and a European data boundary.",
    api: "openai",
    local: false,
    free: false,
    defaultBaseUrl: "https://api.mistral.ai/v1",
    requiresKey: true,
    autodetect: false,
    setupHint: "Create a key at console.mistral.ai.",
    docsUrl: "https://docs.mistral.ai",
  },
  {
    id: "custom",
    name: "Custom endpoint",
    blurb:
      "Any OpenAI-compatible gateway — OpenRouter, Groq, Together, vLLM on a remote host, or your own.",
    api: "openai",
    local: false,
    free: false,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    requiresKey: true,
    autodetect: false,
    setupHint:
      "Remote calls are proxied through the native layer so the key never enters the web view.",
    docsUrl: "https://openrouter.ai/docs",
  },
];

export function findProvider(id: string): Provider {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0];
}

/**
 * Preference order when the operator has not chosen a model. Small,
 * instruction-following models beat large chat models for this job:
 * the agent explains a fixed rule set, it does not need world knowledge.
 */
export const MODEL_PREFERENCE = [
  "claude-opus",
  "claude-sonnet",
  "hermes3",
  "hermes",
  "qwen2.5",
  "llama3.2",
  "llama3.1",
  "llama3",
  "mistral",
  "phi3",
  "gemma2",
];

export type AgentConfig = {
  providerId: string;
  baseUrl: string;
  model: string;
  /** True when a key for this endpoint is sealed in the OS keyring. */
  hasStoredKey: boolean;
};

export function defaultConfig(): AgentConfig {
  const provider = PROVIDERS[0];
  return {
    providerId: provider.id,
    baseUrl: provider.defaultBaseUrl,
    model: "",
    hasStoredKey: false,
  };
}

/** A remote endpoint must be TLS — never ship a key over plaintext. */
export function isEndpointSafe(baseUrl: string): { ok: boolean; reason?: string } {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return { ok: false, reason: "Not a valid URL." };
  }

  const isLoopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";

  if (url.protocol === "https:") return { ok: true };
  if (url.protocol === "http:" && isLoopback) return { ok: true };

  return {
    ok: false,
    reason: "Remote endpoints must use HTTPS. Plaintext would expose the request in transit.",
  };
}
