import { describe, expect, it, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/edition", () => ({ isSecurityPreview: true }));
vi.mock("@/lib/env", () => ({ isTauri: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
import { updatesConfigured, checkForUpdate } from "@/lib/updates";
describe("isolated desktop preview", () => {
  it("cannot query or install through the production update channel", async () => {
    expect(await updatesConfigured()).toBe(false);
    expect(await checkForUpdate()).toMatchObject({ state: "unsupported" });
    expect(invoke).not.toHaveBeenCalled();
  });
});
