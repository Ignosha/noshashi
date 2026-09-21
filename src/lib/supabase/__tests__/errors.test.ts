import { describe, it, expect } from "vitest";
import {
  supabaseErrorMessage,
  isTransportFailure,
  UNREACHABLE_MESSAGE,
  UNKNOWN_MESSAGE,
} from "../errors";

/**
 * Two failures wear the same clothes, and only one of them is the user's
 * problem to solve.
 *
 * A rejected password and an unreachable server both arrive here as an object
 * with a `message`. The first must survive verbatim — "Invalid login
 * credentials" is the whole answer — while the second must not, because
 * "Failed to fetch" describes a browser API rather than anything the reader
 * can do something about.
 *
 * The case that justifies the table is "Load failed". That is WebKit's wording,
 * and Tauri renders in WKWebView on macOS, so a fix tested only on Windows
 * would look complete and still ship the raw string to every Mac user.
 */

describe("supabaseErrorMessage", () => {
  it("rewrites each platform's wording for an unreachable backend", () => {
    const wordings = [
      "Failed to fetch", // Chromium: Windows and Linux builds
      "Load failed", // WebKit: the macOS build
      "NetworkError when attempting to fetch resource.",
      "Network request failed",
      "net::ERR_NAME_NOT_RESOLVED", // a paused Supabase project
      "net::ERR_INTERNET_DISCONNECTED",
    ];

    for (const wording of wordings) {
      expect(supabaseErrorMessage({ message: wording })).toBe(UNREACHABLE_MESSAGE);
    }
  });

  it("matches whatever case the platform used", () => {
    expect(supabaseErrorMessage({ message: "FAILED TO FETCH" })).toBe(UNREACHABLE_MESSAGE);
    expect(supabaseErrorMessage({ message: "load failed" })).toBe(UNREACHABLE_MESSAGE);
  });

  it("passes a rejection from the server through untouched", () => {
    // The point of the whole module: this must not become a friendly generic.
    const real = [
      "Invalid login credentials",
      "Email not confirmed",
      "Token has expired or is invalid",
      "permission denied for schema noshashi",
    ];

    for (const message of real) {
      expect(supabaseErrorMessage({ message })).toBe(message);
    }
  });

  it("says something useful when there is no message at all", () => {
    expect(supabaseErrorMessage(null)).toBe(UNKNOWN_MESSAGE);
    expect(supabaseErrorMessage(undefined)).toBe(UNKNOWN_MESSAGE);
    expect(supabaseErrorMessage({})).toBe(UNKNOWN_MESSAGE);
    expect(supabaseErrorMessage({ message: "   " })).toBe(UNKNOWN_MESSAGE);
  });

  it("reads a bare string as its own message", () => {
    expect(supabaseErrorMessage("Failed to fetch")).toBe(UNREACHABLE_MESSAGE);
    expect(supabaseErrorMessage("Invalid login credentials")).toBe("Invalid login credentials");
  });

  it("reports an absent error as no transport failure", () => {
    // An empty message is not evidence of a network fault, and treating it as
    // one would blame the connection for every unlabelled error.
    expect(isTransportFailure({})).toBe(false);
    expect(isTransportFailure(null)).toBe(false);
    expect(isTransportFailure({ message: "Failed to fetch" })).toBe(true);
  });
});
