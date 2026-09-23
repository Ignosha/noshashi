import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { isOnDeviceEndpoint, type AgentConfig } from "../providers";
import { HARD_RULES, buildStateBrief, buildSystemPrompt } from "../context";
import { aiUseToCsv, dataBoundary, disclosedFields, recordFor } from "../governance";
import type { XrplState } from "@/lib/xrpl/useXRPL";

/**
 * The governance view makes three claims an examiner would lean on:
 * the agent cannot reach a verdict, the stated data boundary is the real
 * one, and the use record identifies exactly what was sent. Each is
 * checked here against the code rather than the copy.
 */

const root = resolve(import.meta.dirname, "../../../..");

// The minimum of XrplState that buildStateBrief reads.
const state = {
  connected: true,
  ledger: { ledgerIndex: 1, baseFeeXrp: "0.00001", openLedgerFeeXrp: "0.00001" },
  server: { serverState: "full", peers: 10 },
  account: { address: "rSubject", balanceXrp: "100", ownerCount: 1, domain: undefined },
  credentials: [],
  events: [],
  successRate: null,
} as unknown as XrplState;

const cfg = (over: Partial<AgentConfig> = {}): AgentConfig => ({
  providerId: "ollama",
  baseUrl: "http://localhost:11434",
  model: "hermes3",
  hasStoredKey: false,
  ...over,
});

describe("authority", () => {
  it("nothing that decides or records a verdict imports the agent", () => {
    const deciding = [
      "src/lib/policy.ts",
      ...readdirSync(resolve(root, "src/lib/desk"))
        .filter((f) => f.endsWith(".ts"))
        .map((f) => `src/lib/desk/${f}`),
    ];
    for (const file of deciding) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source, file).not.toMatch(/from\s+["'](@\/lib\/agent|\.\.\/agent)/);
    }
  });

  it("every hard rule reaches the model in both modes", () => {
    const boundary = { onDevice: true, providerName: "Ollama" };
    for (const mode of ["compliance", "support"] as const) {
      const prompt = buildSystemPrompt(mode, state, boundary);
      for (const rule of HARD_RULES) expect(prompt).toContain(rule);
    }
  });
});

describe("data boundary", () => {
  it("is decided by the endpoint, not the provider's label", () => {
    expect(isOnDeviceEndpoint("http://localhost:1234/v1")).toBe(true);
    expect(isOnDeviceEndpoint("127.0.0.1:11434")).toBe(true);
    // vLLM is registered as local, but pointed at a remote host it is not.
    expect(dataBoundary(cfg({ providerId: "vllm", baseUrl: "https://gpu.example.com/v1" })).onDevice).toBe(false);
    expect(dataBoundary(cfg({ providerId: "anthropic", baseUrl: "https://api.anthropic.com/v1" })).onDevice).toBe(false);
  });

  it("a remote model is never told, or told to say, that nothing leaves the device", () => {
    const remote = buildSystemPrompt("compliance", state, { onDevice: false, providerName: "Groq" });
    expect(remote).not.toContain("nothing you are shown leaves this device");
    expect(remote).toContain("Groq");
    const local = buildSystemPrompt("compliance", state, { onDevice: true, providerName: "Ollama" });
    expect(local).toContain("nothing you are shown leaves this device");
  });

  it("lists every live-state field actually placed in the prompt", () => {
    const fields = disclosedFields(buildStateBrief(state));
    expect(fields).toContain("WALLET");
    expect(fields).toContain("HELD_CREDENTIALS");
    expect(fields.length).toBe(buildStateBrief(state).split("\n").length);
  });
});

describe("use record", () => {
  const messages = [
    { role: "system" as const, content: "rules" },
    { role: "user" as const, content: "why NO-GO?" },
  ];

  it("keeps digests and sizes, never the text", async () => {
    const record = await recordFor({
      at: "2026-01-01T00:00:00.000Z",
      mode: "compliance",
      config: cfg(),
      messages,
      response: "Because RESERVE_SOLVENCY failed.",
      outcome: "complete",
    });
    expect(record.promptDigest).toMatch(/^[0-9A-F]{64}$/);
    expect(record.promptChars).toBe(JSON.stringify(messages).length);
    expect(JSON.stringify(record)).not.toContain("why NO-GO");
    expect(JSON.stringify(record)).not.toContain("RESERVE_SOLVENCY");
    expect(record.onDevice).toBe(true);
  });

  it("digests change when the prompt changes", async () => {
    const base = { at: "t", mode: "compliance" as const, config: cfg(), response: "", outcome: "complete" as const };
    const a = await recordFor({ ...base, messages });
    const b = await recordFor({ ...base, messages: [...messages, { role: "user", content: "and?" }] });
    expect(a.promptDigest).not.toBe(b.promptDigest);
  });

  it("exports one CSV row per call", async () => {
    const record = await recordFor({
      at: "t", mode: "support", config: cfg({ model: 'a,"b"' }), messages, response: "", outcome: "error",
    });
    const csv = aiUseToCsv([record, record]);
    expect(csv.split("\n")).toHaveLength(3);
    expect(csv).toContain('"a,""b"""');
  });
});
