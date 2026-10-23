import { supabase } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";
import { isTauri } from "@/lib/env";
import { rpc } from "@/lib/xrpl/client";
import { xrplLink } from "@/lib/xrpl/link";
import { checkForUpdate } from "@/lib/updates";
import { recentErrors } from "./errorLog";
import { deviceId, deviceLabel, platformName } from "./device";
import type { Snapshot } from "./snapshotReport";

export { snapshotFindings, type Snapshot } from "./snapshotReport";

/**
 * A read-only picture of this app, for NOSHASHI support.
 *
 * Collected only while the customer has allowed support to look, and only
 * when support asks for it. It reads; it changes nothing (the one write is
 * the update checker's own "last checked" time). It holds no keys, seeds,
 * tokens or addresses: settings are reported by health, not by value, and
 * the error log was already scrubbed on this device when it was written.
 */

const RIPPLE_EPOCH = 946684800;

/** Saved settings that no longer parse; each makes a screen fall back to defaults. */
export function damagedSettings(): { writable: boolean; stored: number; damaged: string[] } {
  if (typeof window === "undefined") return { writable: false, stored: 0, damaged: [] };
  let writable = true;
  try {
    window.localStorage.setItem("noshashi:probe", "1");
    writable = window.localStorage.getItem("noshashi:probe") === "1";
    window.localStorage.removeItem("noshashi:probe");
  } catch {
    return { writable: false, stored: 0, damaged: [] };
  }
  const damaged: string[] = [];
  let stored = 0;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith("noshashi:")) continue;
    stored += 1;
    const raw = window.localStorage.getItem(key);
    if (raw && /^[[{"]/.test(raw)) {
      try {
        JSON.parse(raw);
      } catch {
        damaged.push(key.slice("noshashi:".length));
      }
    }
  }
  return { writable, stored, damaged };
}

async function ledgerState(): Promise<Snapshot["ledger"]> {
  const base = { connected: xrplLink.isConnected(), server: xrplLink.currentEndpoint(), latencyMs: xrplLink.getLatencyMs() };
  const start = performance.now();
  try {
    const result = (await rpc("ledger", { ledger_index: "validated" })) as Record<string, any>;
    const ledger = result.ledger ?? {};
    const closeSeconds = Number(ledger.close_time) + RIPPLE_EPOCH;
    return {
      ...base,
      validatedLedger: Number(ledger.ledger_index ?? result.ledger_index) || null,
      readMs: Math.round(performance.now() - start),
      clockSkewSeconds: Number.isFinite(closeSeconds) ? Math.round(Date.now() / 1000 - closeSeconds) : null,
    };
  } catch (error) {
    return { ...base, validatedLedger: null, readMs: null, clockSkewSeconds: null, error: error instanceof Error ? error.message : "no reply" };
  }
}

async function sessionState(): Promise<Snapshot["session"]> {
  try {
    const client = supabase();
    const { data } = await client.auth.getSession();
    const session = data.session;
    if (!session) return { signedIn: false, expiresInSeconds: null, twoFactor: null };
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    return {
      signedIn: true,
      expiresInSeconds: (session.expires_at ?? 0) - Math.floor(Date.now() / 1000),
      twoFactor: aal ? aal.currentLevel === "aal2" : null,
    };
  } catch {
    return { signedIn: false, expiresInSeconds: null, twoFactor: null };
  }
}

export async function collectSnapshot(context: { tier?: () => string } = {}): Promise<Snapshot> {
  const [id, ledger, session, update] = await Promise.all([
    deviceId(),
    ledgerState(),
    sessionState(),
    checkForUpdate().catch((error) => ({ state: "error" as const, reason: error instanceof Error ? error.message : "no reply" })),
  ]);
  return {
    at: new Date().toISOString(),
    device: {
      id,
      label: deviceLabel(),
      version: BRAND.version,
      platform: platformName(),
      shell: isTauri ? "desktop" : "browser",
      language: typeof navigator === "undefined" ? "" : navigator.language,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    },
    ledger,
    session,
    plan: { tier: context.tier ? context.tier() : null },
    settings: damagedSettings(),
    update:
      update.state === "available"
        ? { state: "available", latest: update.version }
        : update.state === "current"
          ? { state: "current", latest: update.version }
          : { state: update.state, reason: "reason" in update ? update.reason : undefined },
    errors: recentErrors(),
  };
}
