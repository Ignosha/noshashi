import { useCallback, useEffect, useState } from "react";
import { readSetting, writeSetting } from "@/lib/store";
import { signContent } from "@/lib/desk/ledger";
import { findProvider, isOnDeviceEndpoint, normalizeEndpoint, type AgentConfig } from "./providers";
import type { AgentMode } from "./context";
import type { ChatMessage } from "./client";

/**
 * AI governance: what the agent is allowed to do, where its input goes,
 * and a record of every call made to a model.
 *
 * Everything here is read from the configuration that is actually in
 * force or measured from calls that actually happened. The use record
 * keeps digests and sizes, not text: it proves what was sent and when
 * without becoming a second copy of the operator's questions.
 */

export type DataBoundary = {
  onDevice: boolean;
  providerName: string;
  host: string;
  statement: string;
};

export function dataBoundary(config: AgentConfig): DataBoundary {
  const provider = findProvider(config.providerId);
  const onDevice = isOnDeviceEndpoint(config.baseUrl);
  let host = config.baseUrl;
  try {
    host = new URL(normalizeEndpoint(config.baseUrl)).host;
  } catch {
    // Keep the raw value; isEndpointSafe will already have refused it.
  }
  return {
    onDevice,
    providerName: provider.name,
    host,
    statement: onDevice
      ? `Prompts go to ${host} on this machine and nowhere else.`
      : `Prompts, including the live state below, are sent to ${provider.name} at ${host} over TLS and are subject to that provider's terms.`,
  };
}

/**
 * The fields of live state placed in every prompt, named as they appear
 * in it (src/lib/agent/context.ts buildStateBrief). Read from the brief
 * itself so the list cannot fall out of step with what is sent.
 */
export function disclosedFields(brief: string): string[] {
  return brief
    .split("\n")
    .map((line) => line.split(":")[0].trim())
    .filter(Boolean);
}

export type AiUseRecord = {
  at: string;
  mode: AgentMode | "runtime-test";
  providerId: string;
  model: string;
  host: string;
  onDevice: boolean;
  /** SHA-256 over the exact message array sent. */
  promptDigest: string;
  promptChars: number;
  /** SHA-256 over the text returned (empty string when nothing came back). */
  responseDigest: string;
  responseChars: number;
  outcome: "complete" | "stopped" | "error";
};

export async function recordFor(input: {
  at: string;
  mode: AiUseRecord["mode"];
  config: AgentConfig;
  messages: ChatMessage[];
  response: string;
  outcome: AiUseRecord["outcome"];
}): Promise<AiUseRecord> {
  const sent = JSON.stringify(input.messages);
  const boundary = dataBoundary(input.config);
  return {
    at: input.at,
    mode: input.mode,
    providerId: input.config.providerId,
    model: input.config.model,
    host: boundary.host,
    onDevice: boundary.onDevice,
    promptDigest: await signContent(sent),
    promptChars: sent.length,
    responseDigest: await signContent(input.response),
    responseChars: input.response.length,
    outcome: input.outcome,
  };
}

export function aiUseToCsv(records: AiUseRecord[]): string {
  const head = [
    "at",
    "mode",
    "provider",
    "model",
    "host",
    "on_device",
    "prompt_sha256",
    "prompt_chars",
    "response_sha256",
    "response_chars",
    "outcome",
  ];
  const rows = records.map((r) =>
    [
      r.at,
      r.mode,
      r.providerId,
      r.model,
      r.host,
      r.onDevice ? "yes" : "no",
      r.promptDigest,
      r.promptChars,
      r.responseDigest,
      r.responseChars,
      r.outcome,
    ]
      .map((cell) => {
        const text = String(cell);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(",")
  );
  return [head.join(","), ...rows].join("\n");
}

const KEY = "agent.uselog";
const MAX_RECORDS = 2_000;

export function useAiUseLog() {
  const [records, setRecords] = useState<AiUseRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readSetting<AiUseRecord[]>(KEY, []).then((stored) => {
      if (cancelled) return;
      setRecords(Array.isArray(stored) ? stored : []);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const append = useCallback(async (record: AiUseRecord) => {
    const stored = await readSetting<AiUseRecord[]>(KEY, []);
    const next = [record, ...(Array.isArray(stored) ? stored : [])].slice(0, MAX_RECORDS);
    await writeSetting(KEY, next);
    setRecords(next);
  }, []);

  const clear = useCallback(async () => {
    await writeSetting(KEY, []);
    setRecords([]);
  }, []);

  return { records, loaded, append, clear };
}
