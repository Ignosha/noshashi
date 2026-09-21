import { useCallback, useEffect, useState } from "react";
import { readSetting, writeSetting } from "@/lib/store";
import type {
  AccountInfo,
  CredentialRecord,
  IssuerPosture,
  LedgerInfo,
  TrustLine,
} from "@/lib/xrpl/types";

/**
 * Offline adjudication.
 *
 * Institutions run compliance from segregated networks. A workstation
 * that only works with an open WebSocket to mainnet cannot be deployed
 * there at all, so the engine has to be able to adjudicate against a
 * captured snapshot of validated ledger state.
 *
 * The whole design rests on one rule: a verdict produced from a
 * snapshot must never be mistakable for a live one. Every offline
 * adjudication is stamped with the ledger index and capture time it was
 * derived from, marked `offline` in the durable ledger, and carries the
 * age of the state on its face. Stale state is not an error — an
 * examiner may legitimately want yesterday's position — but it must be
 * disclosed, because "this was true at ledger 84,112,907" is a
 * defensible claim and "this is true" is not.
 *
 * Snapshots hold only what the policy engine reads. They are not a
 * mirror of the ledger and cannot answer a question the operator did
 * not capture.
 */

const VAULT_KEY = "engine.offline.vault";
const MODE_KEY = "engine.offline.mode";
const ACTIVE_KEY = "engine.offline.active";
const MAX_SNAPSHOTS = 24;

/** Beyond this, state is old enough that we say so loudly. */
const STALE_WARN_MS = 60 * 60_000;
const STALE_CRITICAL_MS = 24 * 60 * 60_000;

export type Snapshot = {
  id: string;
  label: string;
  capturedAt: string;
  ledgerIndex: number;
  ledgerHash?: string;
  account: AccountInfo | null;
  credentials: CredentialRecord[];
  trustLines: TrustLine[];
  postures: IssuerPosture[];
};

export type SnapshotInput = {
  label?: string;
  ledger: LedgerInfo | null;
  account: AccountInfo | null;
  credentials: CredentialRecord[];
  trustLines?: TrustLine[];
  postures?: IssuerPosture[];
};

export type Staleness = {
  ageMs: number;
  label: string;
  severity: "fresh" | "warn" | "critical";
  disclosure: string;
};

export function describeStaleness(capturedAt: string): Staleness {
  const ageMs = Math.max(0, Date.now() - Date.parse(capturedAt));
  const mins = Math.floor(ageMs / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  const label =
    days > 0
      ? `${days}d ${hours % 24}h old`
      : hours > 0
        ? `${hours}h ${mins % 60}m old`
        : mins > 0
          ? `${mins}m old`
          : "under a minute old";

  const severity =
    ageMs >= STALE_CRITICAL_MS ? "critical" : ageMs >= STALE_WARN_MS ? "warn" : "fresh";

  const disclosure =
    severity === "critical"
      ? `This state is ${label}. Issuer flags, credentials and balances can all have changed since capture. Do not settle on this verdict without a live re-read.`
      : severity === "warn"
        ? `This state is ${label}. Balances and credential status may have moved. The verdict describes the ledger as captured, not as it stands now.`
        : `This state is ${label}. It reflects the ledger as captured, not a live read.`;

  return { ageMs, label, severity, disclosure };
}

export function captureSnapshot(input: SnapshotInput): Snapshot {
  const capturedAt = new Date().toISOString();
  const index = input.ledger?.ledgerIndex ?? 0;
  return {
    id: `snap-${index}-${Date.parse(capturedAt)}`,
    label:
      input.label?.trim() ||
      `Ledger ${index.toLocaleString()} · ${new Date(capturedAt).toLocaleString()}`,
    capturedAt,
    ledgerIndex: index,
    ledgerHash: input.ledger?.ledgerHash,
    account: input.account,
    credentials: input.credentials ?? [],
    trustLines: input.trustLines ?? [],
    postures: input.postures ?? [],
  };
}

/** One line an examiner can read, naming exactly what the verdict rests on. */
export function provenanceLine(snap: Snapshot): string {
  const s = describeStaleness(snap.capturedAt);
  return `Adjudicated offline against ledger ${snap.ledgerIndex.toLocaleString()} captured ${snap.capturedAt} (${s.label}); ${snap.credentials.length} credentials, ${snap.trustLines.length} trust lines, ${snap.postures.length} issuer postures in scope.`;
}

export function useOfflineVault() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [offlineMode, setOfflineMode] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [stored, mode, active] = await Promise.all([
        readSetting<Snapshot[]>(VAULT_KEY, []),
        readSetting<boolean>(MODE_KEY, false),
        readSetting<string | null>(ACTIVE_KEY, null),
      ]);
      if (!alive) return;
      setSnapshots(Array.isArray(stored) ? stored : []);
      setOfflineMode(Boolean(mode));
      setActiveId(typeof active === "string" ? active : null);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const capture = useCallback(async (input: SnapshotInput) => {
    const snap = captureSnapshot(input);
    // Read-modify-write against storage so a second window capturing at
    // the same moment cannot discard this snapshot.
    const stored = await readSetting<Snapshot[]>(VAULT_KEY, []);
    const next = [snap, ...(Array.isArray(stored) ? stored : [])].slice(
      0,
      MAX_SNAPSHOTS
    );
    await writeSetting(VAULT_KEY, next);
    setSnapshots(next);
    return snap;
  }, []);

  const remove = useCallback(
    async (id: string) => {
      const stored = await readSetting<Snapshot[]>(VAULT_KEY, []);
      const next = (Array.isArray(stored) ? stored : []).filter((s) => s.id !== id);
      await writeSetting(VAULT_KEY, next);
      setSnapshots(next);
      if (activeId === id) {
        setActiveId(null);
        await writeSetting(ACTIVE_KEY, null);
      }
    },
    [activeId]
  );

  const setMode = useCallback(
    async (next: boolean) => {
      setOfflineMode(next);
      await writeSetting(MODE_KEY, next);
      // Entering offline mode with nothing selected picks the newest
      // snapshot; adjudicating against no state at all is worse than
      // adjudicating against disclosed stale state.
      if (next && !activeId && snapshots.length > 0) {
        setActiveId(snapshots[0].id);
        await writeSetting(ACTIVE_KEY, snapshots[0].id);
      }
    },
    [activeId, snapshots]
  );

  const activate = useCallback(async (id: string | null) => {
    setActiveId(id);
    await writeSetting(ACTIVE_KEY, id);
  }, []);

  const active = snapshots.find((s) => s.id === activeId) ?? null;

  return {
    snapshots,
    loaded,
    offlineMode,
    active,
    activeId,
    capture,
    remove,
    setMode,
    activate,
    /** True only when offline mode is on AND a snapshot is actually selected. */
    engaged: offlineMode && active !== null,
    staleness: active ? describeStaleness(active.capturedAt) : null,
  };
}
