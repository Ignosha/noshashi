import type { LoggedError } from "./errorLog";

/**
 * The shape of an app snapshot and how support reads it. No imports from
 * the running app, so NOSHREPAIR can use it without bundling the app's
 * ledger or account clients. collectSnapshot (snapshot.ts) builds one.
 */

export type Snapshot = {
  at: string;
  device: { id: string; label: string; version: string; platform: string; shell: "desktop" | "browser"; language: string; timeZone: string };
  ledger: { connected: boolean; server: string; latencyMs: number; validatedLedger: number | null; readMs: number | null; clockSkewSeconds: number | null; error?: string };
  session: { signedIn: boolean; expiresInSeconds: number | null; twoFactor: boolean | null };
  plan: { tier: string | null };
  settings: { writable: boolean; stored: number; damaged: string[] };
  update: { state: string; latest?: string; reason?: string };
  errors: LoggedError[];
};

/** What support reads first: the problems, in words. */
export function snapshotFindings(s: Snapshot): string[] {
  const out: string[] = [];
  if (!s.ledger.connected || s.ledger.validatedLedger === null) out.push(`No working ledger link (${s.ledger.error ?? "disconnected"}) on ${s.ledger.server}.`);
  else if ((s.ledger.readMs ?? 0) > 2500) out.push(`Ledger reads are slow: ${s.ledger.readMs} ms from ${s.ledger.server}.`);
  if (s.ledger.clockSkewSeconds !== null && Math.abs(s.ledger.clockSkewSeconds) > 120) out.push(`The computer clock is off by ${s.ledger.clockSkewSeconds} s; sign-ins will fail until it is corrected.`);
  if (!s.session.signedIn) out.push("Not signed in.");
  else if ((s.session.expiresInSeconds ?? 0) < 120) out.push("The sign-in has expired or is about to.");
  if (!s.settings.writable) out.push("Settings cannot be saved on this computer.");
  if (s.settings.damaged.length) out.push(`${s.settings.damaged.length} saved setting(s) are damaged: ${s.settings.damaged.join(", ")}.`);
  if (s.update.state === "available") out.push(`An update is available: ${s.update.latest} (running ${s.device.version}).`);
  if (s.errors.length) out.push(`${s.errors.length} recent error(s); latest: ${s.errors[s.errors.length - 1].message}`);
  return out;
}
