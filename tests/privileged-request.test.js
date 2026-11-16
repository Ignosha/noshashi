import { afterEach, describe, expect, it, vi } from "vitest";
import {
  privilegedFetch,
  privilegedIdentity as verifyIdentity,
  privilegedObject,
} from "../supabase/functions/_shared/privilegedRequest.ts";

const sessionRequest = () =>
  new Request("https://example.invalid/action", {
    headers: { Authorization: "Bearer session-from-header" },
  });
const privilegedIdentity = (auth) => verifyIdentity(auth, sessionRequest());
const auth = (currentLevel = "aal1", nextLevel = "aal1") => ({
  getUser: vi.fn(async () => ({
    data: { user: { id: "verified-actor" } },
    error: null,
  })),
  mfa: {
    getAuthenticatorAssuranceLevel: vi.fn(async () => ({
      data: { currentLevel, nextLevel },
      error: null,
    })),
  },
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("privileged policy session checks", () => {
  it("rejects a missing bearer session before contacting Auth", async () => {
    const a = auth();
    await expect(verifyIdentity(a, new Request("https://example.invalid")))
      .rejects.toMatchObject({ status: 401 });
    expect(a.getUser).not.toHaveBeenCalled();
  });
  it.each([["aal1", "aal1"], ["aal2", "aal2"]])(
    "allows a verified %s session when %s is required",
    async (current, next) => {
      const a = auth(current, next);
      expect(await privilegedIdentity(a)).toBe("verified-actor");
      expect(a.getUser).toHaveBeenCalledWith("session-from-header");
      expect(a.mfa.getAuthenticatorAssuranceLevel).toHaveBeenCalledWith(
        "session-from-header",
      );
    },
  );
  it("refuses an enrolled user's first-factor session before a mutation", async () => {
    const mutate = vi.fn();
    await expect(privilegedIdentity(auth("aal1", "aal2")).then(mutate)).rejects
      .toMatchObject({ status: 403, code: "MFA_REQUIRED" });
    expect(mutate).not.toHaveBeenCalled();
  });
  it("refuses a revoked or expired user without querying assurance", async () => {
    const a = auth();
    a.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("revoked"),
    });
    await expect(privilegedIdentity(a)).rejects.toMatchObject({ status: 401 });
    expect(a.mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });
  it.each([null, { currentLevel: null, nextLevel: "aal2" }, {
    currentLevel: "aal1",
    nextLevel: "unknown",
  }])("fails closed for indeterminate assurance %j", async (data) => {
    const a = auth();
    a.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data,
      error: null,
    });
    await expect(privilegedIdentity(a)).rejects.toMatchObject({ status: 503 });
  });
  it("does not expose identity-provider error details", async () => {
    const a = auth();
    a.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: null,
      error: new Error("sensitive provider detail"),
    });
    await expect(privilegedIdentity(a)).rejects.toThrow(
      "Session assurance could not be verified. Nothing was changed.",
    );
  });
});
describe("bounded privileged request processing", () => {
  const request = (body) =>
    new Request("https://example.invalid/action", { method: "POST", body });
  it("reads a JSON object without treating body actor or MFA fields as identity", async () => {
    const input = await privilegedObject(
      request('{"actor":"forged","aal":"aal2"}'),
    );
    expect(input.actor).toBe("forged");
    expect(await privilegedIdentity(auth())).toBe("verified-actor");
  });
  it.each(["null", "[]", "3", "{", '"text"'])(
    "rejects malformed or non-object input %s",
    async (body) => {
      await expect(privilegedObject(request(body))).rejects.toMatchObject({
        status: 400,
      });
    },
  );
  it("counts multibyte data despite a false Content-Length", async () => {
    const r = new Request("https://example.invalid", {
      method: "POST",
      body: '{"note":"éééé"}',
      headers: { "Content-Length": "1" },
    });
    await expect(privilegedObject(r, 16)).rejects.toMatchObject({
      status: 413,
    });
  });
  it("cancels an oversized stream before reading the remainder", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(33));
      },
      cancel,
    });
    const r = new Request("https://example.invalid", {
      method: "POST",
      body: stream,
      duplex: "half",
    });
    await expect(privilegedObject(r, 32)).rejects.toMatchObject({
      status: 413,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("bounds upstream calls without retrying an uncertain write", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (_url, init) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return new Response("ok");
    });
    vi.stubGlobal("fetch", fetcher);
    await privilegedFetch("https://example.invalid", { method: "POST" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("preserves caller cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        expect(init.signal.aborted).toBe(true);
        return new Response();
      }),
    );
    await privilegedFetch("https://example.invalid", {
      signal: controller.signal,
    });
  });
});
