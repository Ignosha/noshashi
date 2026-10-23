import { BRAND } from "@/lib/brand";
import { isTauri } from "@/lib/env";
import { readSetting, writeSetting } from "@/lib/store";

/**
 * This install's identity for NOSHASHI support.
 *
 * A random id, made on first use and kept in this install's own settings,
 * so support can address a repair to this one computer rather than to
 * every computer the customer signs in on. It identifies the install, not
 * the person or the machine: it is not derived from hardware, and a fresh
 * install gets a new one.
 */

const DEVICE_KEY = "support.deviceId";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cached: Promise<string> | null = null;

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function deviceId(): Promise<string> {
  if (!cached) {
    cached = (async () => {
      const stored = await readSetting<string | null>(DEVICE_KEY, null);
      if (stored && UUID.test(stored)) return stored;
      const id = newId();
      await writeSetting(DEVICE_KEY, id);
      return id;
    })();
  }
  return cached;
}

export function platformName(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Unknown";
}

/** How this install is named to support: "macOS desktop · 1.0.21". */
export function deviceLabel(): string {
  return `${platformName()} ${isTauri ? "desktop" : "browser"} · ${BRAND.version}`;
}
