import type { SecurityPosture, Signer } from "./hardening";
import { minimumSigners } from "./hardening";

export function signingResilience(p: SecurityPosture, unavailable: string[]) {
  const blocked = new Set(unavailable);
  const remaining =
    p.signerList?.signers.filter((s) => !blocked.has(s.account)) ?? [];
  const weight = remaining.reduce((sum, s) => sum + s.weight, 0);
  const quorum = p.signerList?.quorum ?? null;
  const quorumReachable = quorum !== null && quorum > 0 && weight >= quorum;
  const directPaths = p.exists
    ? Number(p.masterEnabled) + Number(Boolean(p.regularKey))
    : 0;
  return {
    directPaths,
    weight,
    quorum,
    quorumReachable,
    remaining,
    minimum: quorumReachable ? minimumSigners(remaining, quorum!) : null,
    alternative: directPaths > 0,
    configured: Boolean(p.exists && (directPaths || p.signerList)),
  };
}

export type ControlSnapshot = {
  schema: "noshashi-controls-v1";
  address: string;
  ledgerIndex: number;
  flags: number;
  masterEnabled: boolean;
  regularKey: string | null;
  quorum: number | null;
  signers: Signer[];
};
export function controlSnapshot(p: SecurityPosture): ControlSnapshot {
  if (!p.exists || !Number.isSafeInteger(p.ledgerIndex) || p.ledgerIndex <= 0)
    throw new Error("A funded account at a validated ledger is required.");
  return {
    schema: "noshashi-controls-v1",
    address: p.address,
    ledgerIndex: p.ledgerIndex,
    flags: p.flags,
    masterEnabled: p.masterEnabled,
    regularKey: p.regularKey,
    quorum: p.signerList?.quorum ?? null,
    signers: [...(p.signerList?.signers ?? [])].sort((a, b) =>
      a.account.localeCompare(b.account),
    ),
  };
}
export function isControlSnapshot(v: unknown): v is ControlSnapshot {
  if (!v || typeof v !== "object") return false;
  const s = v as ControlSnapshot;
  return (
    s.schema === "noshashi-controls-v1" &&
    typeof s.address === "string" &&
    /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(s.address) &&
    Number.isSafeInteger(s.ledgerIndex) &&
    s.ledgerIndex > 0 &&
    Number.isSafeInteger(s.flags) &&
    s.flags >= 0 &&
    typeof s.masterEnabled === "boolean" &&
    (s.regularKey === null ||
      (typeof s.regularKey === "string" &&
        /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(s.regularKey))) &&
    (s.quorum === null || (Number.isSafeInteger(s.quorum) && s.quorum > 0)) &&
    Array.isArray(s.signers) &&
    s.signers.length <= 32 &&
    new Set(s.signers.map((x) => x?.account)).size === s.signers.length &&
    s.signers.every(
      (x) =>
        x &&
        typeof x.account === "string" &&
        /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(x.account) &&
        Number.isInteger(x.weight) &&
        x.weight > 0 &&
        x.weight <= 65535,
    )
  );
}
export function compareControls(
  before: ControlSnapshot,
  after: ControlSnapshot,
) {
  if (!isControlSnapshot(before) || !isControlSnapshot(after))
    throw new Error(
      "The saved control reference is invalid. Replace it with a fresh reading.",
    );
  if (before.address !== after.address)
    throw new Error("Control snapshots must describe the same account.");
  if (after.ledgerIndex <= before.ledgerIndex)
    throw new Error(
      "Read a ledger newer than the saved reference before comparing controls.",
    );
  const fields = [
    "masterEnabled",
    "regularKey",
    "quorum",
    "signers",
    "flags",
  ] as const;
  const value = (s: ControlSnapshot, field: (typeof fields)[number]) =>
    field === "signers"
      ? [...s.signers].sort((a, b) => a.account.localeCompare(b.account))
      : s[field];
  return fields
    .filter(
      (field) =>
        JSON.stringify(value(before, field)) !==
        JSON.stringify(value(after, field)),
    )
    .map((field) => ({
      field,
      before: value(before, field),
      after: value(after, field),
    }));
}
