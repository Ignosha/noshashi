import { describe, expect, it } from "vitest";
import { MAX_IN_FLIGHT, MAX_RETRIES, RequestPacer, THROTTLED_MESSAGE } from "../pacer";

/**
 * The pacer against the exact reply a throttling public server sends
 * (rippled error `slowDown`, message "You are placing too much load on the
 * server."), on a fake clock so cool-downs take no real time.
 */

const slowDown = () => Object.assign(new Error("You are placing too much load on the server."), { code: "slowDown" });

function harness() {
  let t = 0;
  const slept: number[] = [];
  let rotations = 0;
  const pacer = new RequestPacer(
    () => (rotations += 1),
    (message, code) => Object.assign(new Error(message), { code }),
    { now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } },
    () => 0
  );
  return { pacer, slept, rotations: () => rotations };
}

describe("request pacer", () => {
  it("never has more than MAX_IN_FLIGHT reads outstanding", async () => {
    const { pacer } = harness();
    let peak = 0;
    let live = 0;
    const read = () => pacer.run(async () => { live++; peak = Math.max(peak, live); await Promise.resolve(); await Promise.resolve(); live--; return 1; });
    await Promise.all(Array.from({ length: 25 }, read));
    expect(peak).toBeLessThanOrEqual(MAX_IN_FLIGHT);
  });

  it("cools down and retries a throttled read instead of showing the throttle", async () => {
    const { pacer, slept } = harness();
    let calls = 0;
    const result = await pacer.run(async () => { calls++; if (calls < 3) throw slowDown(); return "ledger"; });
    expect(result).toBe("ledger");
    expect(slept).toEqual([1000, 2000]);
  });

  it("moves to the next public server after two throttles in a row", async () => {
    const { pacer, rotations } = harness();
    let calls = 0;
    await pacer.run(async () => { calls++; if (calls < 3) throw slowDown(); return 1; });
    expect(rotations()).toBe(1);
  });

  it("gives up with a plain explanation, not the server's wording", async () => {
    const { pacer } = harness();
    let calls = 0;
    await expect(pacer.run(async () => { calls++; throw slowDown(); })).rejects.toMatchObject({ message: THROTTLED_MESSAGE, code: "slowDown" });
    expect(calls).toBe(MAX_RETRIES + 1);
  });

  it("does not retry a real answer such as actNotFound", async () => {
    const { pacer } = harness();
    let calls = 0;
    await expect(pacer.run(async () => { calls++; throw Object.assign(new Error("Account not found."), { code: "actNotFound" }); })).rejects.toMatchObject({ code: "actNotFound" });
    expect(calls).toBe(1);
  });
});
