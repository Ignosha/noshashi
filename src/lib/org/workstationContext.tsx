import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { appendOrgAudit, can } from "./governance";
import { useOrg } from "./useOrg";

/**
 * The organization this workstation works for, as the rest of the app
 * needs it outside the governance screens: its white-label brand, and
 * where exports are recorded.
 *
 * Kept in sync by <OrgContextSync /> (mounted once in App) from useOrg's
 * selected organization. Module-level so plain functions such as the file
 * savers can read it without a React context.
 */

export type WorkstationOrg = {
  organizationId: string | null;
  /** The member's role lets them append to the organization's audit log. */
  canRecord: boolean;
  brand: { name: string | null; accent: string | null };
};

let current: WorkstationOrg = { organizationId: null, canRecord: false, brand: { name: null, accent: null } };
const listeners = new Set<(o: WorkstationOrg) => void>();

export const workstationOrg = () => current;

export function useWorkstationOrg(): WorkstationOrg {
  const [o, setO] = useState(current);
  useEffect(() => {
    listeners.add(setO);
    setO(current);
    return () => {
      listeners.delete(setO);
    };
  }, []);
  return o;
}

function publish(next: WorkstationOrg) {
  if (
    next.organizationId === current.organizationId &&
    next.canRecord === current.canRecord &&
    next.brand.name === current.brand.name &&
    next.brand.accent === current.brand.accent
  ) {
    return;
  }
  current = next;
  for (const l of listeners) l(next);
}

export function OrgContextSync() {
  const { user } = useAuth();
  // Only a signed-in person has an organization; useOrg is not touched otherwise.
  return user ? <Sync /> : null;
}

function Sync() {
  const org = useOrg();
  const membership = org.data?.membership ?? null;
  useEffect(() => {
    publish(
      membership
        ? { organizationId: membership.organizationId, canRecord: can.recordAudit(membership.role), brand: membership.brand }
        : { organizationId: null, canRecord: false, brand: { name: null, accent: null } }
    );
  }, [membership]);
  return null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Record a file this workstation exported in the organization's audit log:
 * its name, size and SHA-256, so the organization can later show which
 * exact file left which member's workstation and when. Silent when there is
 * no organization, the role cannot record, or the plan has no audit log.
 */
export async function recordExport(filename: string, bytes: Uint8Array): Promise<void> {
  const { organizationId, canRecord } = current;
  if (!organizationId || !canRecord) return;
  try {
    await appendOrgAudit(organizationId, "export.created", { type: "export", id: filename.slice(0, 200) }, {
      filename,
      bytes: bytes.byteLength,
      sha256: await sha256Hex(bytes),
    });
  } catch {
    // The file is saved either way; the record is best-effort from the workstation.
  }
}

/** "Prepared for Acme Custody" when the organization has a white-label name. */
export function preparedFor(): string | null {
  return current.brand.name ? `Prepared for ${current.brand.name}` : null;
}

/** A verdict this workstation recorded, appended to the organization's audit log. */
export async function recordAdjudication(entry: { digest: string; verdict: string; domainCode: string; amountXrp: number; subject: string }): Promise<void> {
  const { organizationId, canRecord } = current;
  if (!organizationId || !canRecord) return;
  try {
    await appendOrgAudit(organizationId, "adjudication.recorded", { type: "receipt", id: entry.digest }, {
      verdict: entry.verdict,
      domain_code: entry.domainCode,
      amount_xrp: entry.amountXrp,
      subject: entry.subject,
    });
  } catch {
    // The verdict is in the workstation ledger either way.
  }
}

/** A change to a setting the organization relies on (alert rules, the monitoring schedule). */
export async function recordSettingsChange(setting: string, summary: Record<string, unknown>): Promise<void> {
  const { organizationId, canRecord } = current;
  if (!organizationId || !canRecord) return;
  try {
    await appendOrgAudit(organizationId, "settings.changed", { type: "setting", id: setting }, summary);
  } catch {
    // Saved on this device either way.
  }
}
