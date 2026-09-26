import { beforeEach, describe, expect, it, vi } from "vitest";
import mainnet from "@/lib/desk/__tests__/fixtures/xrpl-mainnet-107193471.json";

/*
 * NOSHX end to end, minus the network. The model's replies are scripted
 * (a unit test cannot call a model), but every ledger fact comes from the
 * recorded mainnet fixture (ledger 107193471): the settlement tool runs
 * the real readSettlement over the recorded `tx` reply for the DIP
 * payment, so what the model is handed is what the app would read.
 */

const PAYMENT = mainnet.tx_payment;

vi.mock("@/lib/xrpl/client", async (original) => ({
  ...(await original<typeof import("@/lib/xrpl/client")>()),
  rpc: vi.fn(async (method: string, params: Record<string, unknown>) => {
    if (method === "tx" && params.transaction === PAYMENT.hash) return PAYMENT;
    throw new Error(`unexpected ${method}`);
  }),
}));

type Reply = { status: number; body: string };
const replies: Reply[] = [];
const sent: Array<{ url: string; body: any; headers?: Record<string, string> }> = [];

vi.mock("@/lib/agent/transport", () => ({
  TransportError: class TransportError extends Error {},
  modelCall: vi.fn(async (call: { url: string; body?: unknown; headers?: Record<string, string> }) => {
    sent.push({ url: call.url, body: JSON.parse(JSON.stringify(call.body ?? null)), headers: call.headers });
    const next = replies.shift();
    if (!next) throw new Error("no scripted reply left");
    return next;
  }),
}));

const { askNoshx, isToolsUnsupported } = await import("../loop");
const { compactResult, runTool } = await import("../tools");

const ok = (value: unknown): Reply => ({ status: 200, body: JSON.stringify(value) });
const everything = { has: () => true, spendFreeCheck: () => true };
const question = [{ role: "user" as const, content: `What did ${PAYMENT.hash} deliver?` }];

const anthropic = { providerId: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-opus-5", hasStoredKey: true };
const openai = { providerId: "openrouter", baseUrl: "https://openrouter.ai/api/v1", model: "anthropic/claude-opus-5", hasStoredKey: true };
const ollama = { providerId: "ollama", baseUrl: "http://localhost:11434", model: "qwen2.5:14b", hasStoredKey: false };

beforeEach(() => {
  replies.length = 0;
  sent.length = 0;
});

describe("NOSHX on the Anthropic Messages API", () => {
  it("runs the tool the model asks for and returns the real reading to it", async () => {
    const thinking = { type: "thinking", thinking: "", signature: "sig" };
    replies.push(
      ok({
        stop_reason: "tool_use",
        content: [thinking, { type: "tool_use", id: "toolu_1", name: "read_settlement", input: { hash: PAYMENT.hash } }],
      }),
      ok({ stop_reason: "end_turn", content: [{ type: "text", text: "It delivered 287.022082836 DIP." }] })
    );

    const result = await askNoshx({ config: anthropic, system: "sys", messages: question, context: everything });

    expect(result.text).toBe("It delivered 287.022082836 DIP.");
    expect(result.steps).toEqual([expect.objectContaining({ kind: "tool", name: "read_settlement", ok: true })]);

    const second = sent[1].body;
    // The assistant turn goes back whole, thinking block included.
    expect(second.messages[1]).toEqual({ role: "assistant", content: [thinking, expect.objectContaining({ type: "tool_use" })] });
    const toolResult = second.messages[2].content[0];
    expect(toolResult.type).toBe("tool_result");
    expect(toolResult.tool_use_id).toBe("toolu_1");
    expect(toolResult.content).toContain(PAYMENT.meta.delivered_amount.value);
    expect(toolResult.content).toContain("tesSUCCESS");
  });

  it("never sends a temperature, which current Claude models reject", async () => {
    replies.push(ok({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] }));
    await askNoshx({ config: anthropic, system: "sys", messages: question, context: everything });
    expect(sent[0].body).not.toHaveProperty("temperature");
    expect(sent[0].body.tools.map((tool: { name: string }) => tool.name)).toContain("certify_authority");
  });

  it("drops the refusal fallback and asks again when the account does not have it", async () => {
    replies.push(
      { status: 400, body: JSON.stringify({ error: { message: "fallbacks: unknown parameter" } }) },
      ok({ stop_reason: "end_turn", content: [{ type: "text", text: "answer" }] })
    );
    const result = await askNoshx({ config: anthropic, system: "sys", messages: question, context: everything });
    expect(result.text).toBe("answer");
    expect(sent[0].body.fallbacks).toBe("default");
    expect(sent[0].headers).toEqual({ "anthropic-beta": "server-side-fallback-2026-07-01" });
    expect(sent[1].body).not.toHaveProperty("fallbacks");
  });

  it("reports a refusal instead of an empty answer", async () => {
    replies.push(ok({ stop_reason: "refusal", content: [] }));
    const result = await askNoshx({ config: anthropic, system: "sys", messages: question, context: everything });
    expect(result.text).toMatch(/declined/);
  });
});

describe("NOSHX on OpenAI-compatible and Ollama runtimes", () => {
  it("answers tool_calls with role:tool messages keyed by call id", async () => {
    replies.push(
      ok({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [{ id: "call_9", type: "function", function: { name: "read_settlement", arguments: JSON.stringify({ hash: PAYMENT.hash }) } }],
            },
          },
        ],
      }),
      ok({ choices: [{ message: { content: "Delivered in full." } }] })
    );
    const result = await askNoshx({ config: openai, system: "sys", messages: question, context: everything });
    expect(result.text).toBe("Delivered in full.");
    const toolMessage = sent[1].body.messages.at(-1);
    expect(toolMessage).toMatchObject({ role: "tool", tool_call_id: "call_9" });
    expect(toolMessage.content).toContain(PAYMENT.meta.delivered_amount.value);
    // A hosted model runs at its own sampling defaults.
    expect(sent[0].body).not.toHaveProperty("temperature");
  });

  it("speaks Ollama's native tool format, with object arguments and tool_name", async () => {
    replies.push(
      ok({ message: { content: "", tool_calls: [{ function: { name: "read_settlement", arguments: { hash: PAYMENT.hash } } }] } }),
      ok({ message: { content: "Done." } })
    );
    const result = await askNoshx({ config: ollama, system: "sys", messages: question, context: everything });
    expect(result.text).toBe("Done.");
    expect(sent[0].url).toBe("http://localhost:11434/api/chat");
    expect(sent[0].body.stream).toBe(false);
    expect(sent[0].body.options).toEqual({ temperature: 0.3 });
    expect(sent[1].body.messages.at(-1)).toMatchObject({ role: "tool", tool_name: "read_settlement" });
  });

  it("falls back to a plain answer when the model cannot call tools", async () => {
    replies.push({ status: 400, body: JSON.stringify({ error: "registry.ollama.ai/library/gemma2 does not support tools" }) });
    const result = await askNoshx({ config: { ...ollama, model: "gemma2" }, system: "sys", messages: question, context: everything });
    expect(result.usedTools).toBe(false);
    expect(result.steps[0]).toMatchObject({ kind: "note" });
  });
});

describe("NOSHX tools", () => {
  it("are gated by the same plan feature as the screen they mirror", async () => {
    const free = { has: (feature: string) => feature === "agent", spendFreeCheck: () => true };
    const result = await runTool("read_settlement", { hash: PAYMENT.hash }, free);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/Pro plan/);
  });

  it("refuse malformed input before touching the ledger", async () => {
    const result = await runTool("read_settlement", { hash: "not-a-hash" }, everything);
    expect(result).toEqual({ ok: false, content: "hash must be 64 hexadecimal characters." });
  });

  it("stop free address checks when the month's allowance is spent", async () => {
    const spent = { has: () => false, spendFreeCheck: () => false };
    const result = await runTool("check_address", { address: PAYMENT.Account }, spent);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/10 free address checks/);
  });

  it("say when a result was shortened", () => {
    const long = compactResult({ offers: Array.from({ length: 40 }, (_, i) => i) });
    expect(long).toContain("[25 more items not shown]");
    expect(compactResult({ ok: 1 })).toBe('{"ok":1}');
  });

  it("recognise the ways a runtime says it cannot call tools", () => {
    expect(isToolsUnsupported(400, '{"error":"model does not support tools"}')).toBe(true);
    expect(isToolsUnsupported(404, "No endpoints found that support tool use")).toBe(true);
    expect(isToolsUnsupported(401, "invalid api key")).toBe(false);
  });
});
