import { describe, expect, it } from "vitest";
import { NOSHX_CORE_URL, defaultConfig, sanitizeConfig } from "../providers";

/*
 * The runtime choice is read back from disk, where an older build, a
 * partial write or a hand edit can leave it malformed. A missing baseUrl
 * once took the whole NOSHX screen down ("Cannot read properties of
 * undefined (reading 'startsWith')").
 */
describe("a saved runtime choice", () => {
  it("is kept as it is when well formed", () => {
    const saved = { providerId: "ollama", baseUrl: "http://localhost:11434", model: "noshx", hasStoredKey: false };
    expect(sanitizeConfig(saved)).toEqual(saved);
  });

  it("gets the provider's default endpoint when the endpoint is missing or blank", () => {
    expect(sanitizeConfig({ providerId: "ollama", model: "noshx" })).toMatchObject({ baseUrl: "http://localhost:11434", model: "noshx" });
    expect(sanitizeConfig({ providerId: "anthropic", baseUrl: "  " }).baseUrl).toBe("https://api.anthropic.com/v1");
  });

  it("falls back to NOSHX Core for an unknown provider or a value that is not a config", () => {
    for (const raw of [null, undefined, 3, "ollama", [], { provider: "ollama", endpoint: "http://localhost:11434" }, { providerId: "qwen-local" }]) {
      expect(sanitizeConfig(raw)).toEqual(defaultConfig());
    }
    expect(defaultConfig().baseUrl).toBe(NOSHX_CORE_URL);
  });

  it("never claims a stored key it was not told about", () => {
    expect(sanitizeConfig({ providerId: "openai", baseUrl: "https://api.openai.com/v1", hasStoredKey: "yes" }).hasStoredKey).toBe(false);
  });
});
