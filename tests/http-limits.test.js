import { describe, expect, it } from "vitest";
import { boundedText } from "../supabase/functions/_shared/httpLimits.ts";
const req = (body) =>
  new Request("https://example.invalid", {
    method: "POST",
    body,
    duplex: "half",
  });
describe("bounded sensitive request bodies", () => {
  it("reads exact signed payload bytes without JSON normalization", async () => {
    const payload = '{ "note": "é", "b": 2, "a": 1 }';
    expect(await boundedText(req(payload), 100)).toBe(payload);
  });
  it("refuses oversized and invalid UTF-8 bodies", async () => {
    await expect(boundedText(req("12345"), 4)).rejects.toMatchObject({
      status: 413,
    });
    await expect(boundedText(req(new Uint8Array([255])), 4)).rejects
      .toMatchObject({ status: 400 });
  });
  it("terminates a silent body and cancels its reader", async () => {
    let canceled = false;
    const stream = new ReadableStream({
      cancel() {
        canceled = true;
      },
    });
    await expect(boundedText(req(stream), 1024, 10)).rejects.toMatchObject({
      status: 408,
    });
    expect(canceled).toBe(true);
  });
});
