import { isTauri } from "@/lib/env";
import { findProvider, type AgentConfig } from "./providers";

/**
 * How a model request leaves the app.
 *
 * In the desktop app every request goes through Rust (model_proxy.rs):
 * the web view's CSP and CORS do not apply there, so any runtime or
 * gateway the operator points at is reachable, and the API key is added
 * in Rust from the OS keyring without ever entering JavaScript.
 *
 * The browser build has no keyring and no Rust side. It calls local
 * runtimes directly and refuses hosted ones rather than hold a key in
 * page storage.
 */

export class TransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportError";
  }
}

export type ModelCall = {
  config: AgentConfig;
  url: string;
  method: "GET" | "POST";
  body?: unknown;
  stream?: boolean;
  /** Streamed text, in arbitrary chunks. Only called when `stream` is set. */
  onChunk?: (text: string) => void;
  signal?: AbortSignal;
  /** Only headers model_proxy.rs lets through (anthropic-beta) are sent. */
  headers?: Record<string, string>;
  /** Abort after this long. Streams are bounded by the runtime instead. */
  timeoutMs?: number;
};

export type ModelReply = { status: number; body: string };

function abortError(): DOMException {
  return new DOMException("The request was stopped.", "AbortError");
}

function combine(signal: AbortSignal | undefined, timeoutMs: number | undefined) {
  const controller = new AbortController();
  const timer = timeoutMs ? window.setTimeout(() => controller.abort(), timeoutMs) : undefined;
  const forward = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", forward, { once: true });
  return {
    signal: controller.signal,
    done: () => {
      if (timer !== undefined) window.clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
    },
  };
}

export async function modelCall(call: ModelCall): Promise<ModelReply> {
  const { signal, done } = combine(call.signal, call.timeoutMs);
  try {
    return isTauri ? await viaRust(call, signal) : await viaFetch(call, signal);
  } finally {
    done();
  }
}

let sequence = 0;

async function viaRust(call: ModelCall, signal: AbortSignal): Promise<ModelReply> {
  const { invoke, Channel } = await import("@tauri-apps/api/core");
  const provider = findProvider(call.config.providerId);
  const id = `m${Date.now().toString(36)}-${++sequence}`;

  const channel = new Channel<string>();
  channel.onmessage = (text) => call.onChunk?.(text);

  if (signal.aborted) throw abortError();
  const cancel = () => void invoke("model_cancel", { id }).catch(() => undefined);
  signal.addEventListener("abort", cancel, { once: true });

  try {
    return await invoke<ModelReply>("model_request", {
      request: {
        id,
        provider: provider.id,
        api: provider.api,
        url: call.url,
        method: call.method,
        body: call.body === undefined ? null : JSON.stringify(call.body),
        stream: Boolean(call.stream),
        headers: call.headers ?? {},
      },
      onChunk: channel,
    });
  } catch (error) {
    if (signal.aborted) throw abortError();
    throw new TransportError(typeof error === "string" ? error : error instanceof Error ? error.message : "Request failed.");
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

async function viaFetch(call: ModelCall, signal: AbortSignal): Promise<ModelReply> {
  const provider = findProvider(call.config.providerId);
  if (provider.requiresKey) {
    throw new TransportError(
      `${provider.name} needs the desktop app, which keeps the API key in the OS keyring. The browser build supports local runtimes only.`
    );
  }

  let response: Response;
  try {
    response = await fetch(call.url, {
      method: call.method,
      headers: call.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: call.body === undefined ? undefined : JSON.stringify(call.body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw abortError();
    throw new TransportError("Could not connect to the runtime. Is it running, and is the address right?");
  }

  if (!call.stream || !response.ok || !response.body) {
    return { status: response.status, body: await response.text() };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text) call.onChunk?.(text);
  }
  return { status: response.status, body: "" };
}
