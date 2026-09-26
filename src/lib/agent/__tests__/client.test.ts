import { describe, expect, it } from "vitest";
import { chatBody, sendsTemperature, streamParser } from "../client";

/*
 * The request and stream shapes that switching between runtimes depends
 * on. Frames are in each provider's documented wire format.
 */

const anthropic = { providerId: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-opus-5", hasStoredKey: true };
const ollama = { providerId: "ollama", baseUrl: "http://localhost:11434", model: "hermes3", hasStoredKey: false };
const openai = { providerId: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-5", hasStoredKey: true };
const messages = [
  { role: "system" as const, content: "grounding" },
  { role: "user" as const, content: "question" },
];

describe("request bodies", () => {
  it("send no temperature to hosted models, which reject one", () => {
    expect(sendsTemperature(anthropic)).toBe(false);
    expect(sendsTemperature(openai)).toBe(false);
    expect(chatBody(anthropic, messages, 0.3)).not.toHaveProperty("temperature");
    expect(chatBody(openai, messages, 0.3)).not.toHaveProperty("temperature");
  });

  it("keep the low temperature for local runtimes", () => {
    expect(chatBody(ollama, messages, 0.3)).toMatchObject({ options: { temperature: 0.3 } });
  });

  it("put Anthropic's system prompt outside the message list", () => {
    const body = chatBody(anthropic, messages, 0.3) as Record<string, any>;
    expect(body.system).toBe("grounding");
    expect(body.messages).toEqual([{ role: "user", content: "question" }]);
    expect(body.max_tokens).toBeGreaterThan(0);
  });
});

describe("stream parsing", () => {
  const collect = (chunks: string[]) => {
    const tokens: string[] = [];
    const parser = streamParser((token) => tokens.push(token));
    chunks.forEach((chunk) => parser.push(chunk));
    return { tokens, full: parser.end() };
  };

  it("reads Anthropic events, skipping thinking deltas", () => {
    const stream = [
      "event: content_block_delta\n",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":""}}\n\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Hel',
      'lo"}}\n\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":" there"}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ];
    expect(collect(stream).full).toBe("Hello there");
  });

  it("reads OpenAI-style server-sent events", () => {
    const stream = ['data: {"choices":[{"delta":{"content":"A"}}]}\n', 'data: {"choices":[{"delta":{"content":"B"}}]}\n', "data: [DONE]\n"];
    expect(collect(stream).full).toBe("AB");
  });

  it("reads Ollama's newline-delimited JSON, including a final unterminated line", () => {
    expect(collect(['{"message":{"content":"x"}}\n{"message":{"con', 'tent":"y"}}']).full).toBe("xy");
  });

  it("raises a runtime error that arrives mid-stream", () => {
    const parser = streamParser(() => undefined);
    expect(() => parser.push('data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n')).toThrow("Overloaded");
  });
});
