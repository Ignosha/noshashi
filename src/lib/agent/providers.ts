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

export type ProviderApi = "ollama" | "openai" | "anthropic" | "noshx";

/** NOSHX Core's address: it is part of the app, not a server. */
export const NOSHX_CORE_URL = "noshx://core";

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
    id: "noshx",
    name: "NOSHX Core",
    blurb:
      "The default. NOSHASHI's own engine, with no outside model: it reads the ledger and NOSHASHI's pages and writes the answer itself. Instant, offline, free.",
    api: "noshx",
    local: true,
    free: true,
    defaultBaseUrl: NOSHX_CORE_URL,
    requiresKey: false,
    autodetect: false,
    setupHint: "Built in. Nothing to install.",
    docsUrl: "https://www.noshashi.app/docs/ai/",
  },
  {
    id: "ollama",
    name: "Ollama",
    blurb: "Runs a language model on this machine, including the trained NOSHX model. Local and free.",
    api: "ollama",
    local: true,
    free: true,
    defaultBaseUrl: "http://localhost:11434",
    requiresKey: false,
    autodetect: true,
    setupHint: "Install Ollama, then add the NOSHX model (see Training NOSHX in the docs) or any model with: ollama pull <model>.",
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
      "The key is kept in the OS keyring and added to each request by the desktop app; the app window never reads it back.",
    docsUrl: "https://openrouter.ai/docs",
  },
];

export function findProvider(id: string): Provider {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0];
}

/** Normalize an operator-entered endpoint before it is used by fetch. */
export function normalizeEndpoint(baseUrl: string): string {
  const candidate = baseUrl.trim();
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
    ? candidate
    : `http://${candidate}`;
  return withScheme.replace(/\/+$/, "");
}

/**
 * Preference order when the operator has not chosen a model. The facts
 * come from NOSHX's tools and the product's pages, so the model needs to
 * reason and phrase well, not to know the world. The trained NOSHX model
 * leads the local list when it is installed.
 */
export const MODEL_PREFERENCE = [
  "noshx",
  "claude-opus",
  "claude-sonnet",
  "phi4-mini",
  "hermes3",
  "hermes",
  "llama3.2",
  "llama3.1",
  "llama3",
  "mistral",
  "phi3",
  "gemma2",
];

/**
 * The local model NOSHX recommends: its own. It is trained from
 * NOSHASHI's pages (scripts/noshx-model) and added to Ollama as "noshx",
 * so it cannot be downloaded from here until it is published; the panel
 * says how to add it instead.
 */
export const RECOMMENDED_LOCAL: ReadonlyArray<{ model: string; fits: string; blurb: string; installable: boolean }> = [
  {
    model: "noshx",
    fits: "8 GB laptops",
    blurb: "NOSHX's own trained model (about 2.5 GB). Phrases NOSHX Core's readings in natural language and reasons over them.",
    installable: false,
  },
];

export type AgentConfig = {
  providerId: string;
  baseUrl: string;
  model: string;
  /** True when a key for this endpoint is sealed in the OS keyring. */
  hasStoredKey: boolean;
};

export function defaultConfig(): AgentConfig {
  // NOSHX Core: always available, nothing to install, nothing leaves the machine.
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
  const candidate = baseUrl.trim();
  if (candidate === NOSHX_CORE_URL) return { ok: true };
  if (!candidate) {
    return { ok: false, reason: "Enter a local runtime endpoint." };
  }

  let url: URL;
  try {
    url = new URL(normalizeEndpoint(candidate));
  } catch {
    return { ok: false, reason: "Not a valid URL." };
  }

  if (url.protocol === "https:") return { ok: true };
  if (url.protocol === "http:" && isLoopbackHost(url.hostname)) return { ok: true };

  return {
    ok: false,
    reason: "Remote endpoints must use HTTPS. Plaintext would expose the request in transit.",
  };
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Whether requests to this endpoint stay on the operator's machine.
 *
 * Decided by the endpoint actually configured, not by the provider's
 * label: vLLM or LM Studio pointed at a remote host is a remote call,
 * and has to be described as one.
 */
export function isOnDeviceEndpoint(baseUrl: string): boolean {
  if (baseUrl.startsWith("noshx:")) return true;
  try {
    return isLoopbackHost(new URL(normalizeEndpoint(baseUrl)).hostname);
  } catch {
    return false;
  }
}
