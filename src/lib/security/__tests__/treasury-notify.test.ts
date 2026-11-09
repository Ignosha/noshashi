import { afterEach, describe, expect, it, vi } from "vitest";
const { enabled } = vi.hoisted(() => ({ enabled: { value: true } }));
vi.mock("@/lib/store", () => ({ readSetting: async () => enabled.value }));
vi.mock("@/lib/env", () => ({ isTauri: false }));
import { notifyTreasury } from "../treasuryNotify";
afterEach(() => {
  enabled.value = true;
  vi.unstubAllGlobals();
});
describe("device notification truthfulness", () => {
  it("never requests permission during an automatic read", async () => {
    const requestPermission = vi.fn();
    vi.stubGlobal(
      "Notification",
      Object.assign(class {}, { permission: "default", requestPermission }),
    );
    expect(await notifyTreasury(2)).toBe("permission_required");
    expect(requestPermission).not.toHaveBeenCalled();
  });
  it("honors disabled and unavailable notifications", async () => {
    enabled.value = false;
    expect(await notifyTreasury(1)).toBe("disabled");
    enabled.value = true;
    vi.stubGlobal("Notification", undefined);
    expect(await notifyTreasury(1)).toBe("unavailable");
  });
  it("reports submission, without identifying wallets or claiming delivery", async () => {
    const messages: any[] = [];
    vi.stubGlobal(
      "Notification",
      Object.assign(
        class {
          constructor(title: string, payload: any) {
            messages.push({ title, ...payload });
          }
        },
        { permission: "granted" },
      ),
    );
    expect(await notifyTreasury(6)).toBe("submitted");
    expect(messages[0].body).toContain("No transfer was stopped or reversed");
    expect(messages[0].body).not.toContain("delivered");
  });
});
