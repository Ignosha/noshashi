import type { ContinuityIntent } from "./intent";

/** Ripple's published issuer and the XRPL wire currency form one asset identity. */
export const XRPL_RLUSD = {
  network: "xrpl-mainnet",
  issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
  currency: "524C555344000000000000000000000000000000",
} as const;

export function isXrplRlusd(intent: ContinuityIntent): boolean {
  return intent.network === XRPL_RLUSD.network && intent.asset.issuer === XRPL_RLUSD.issuer &&
    intent.asset.currency.toUpperCase() === XRPL_RLUSD.currency;
}

export function isHolderToHolder(intent: ContinuityIntent): boolean {
  return intent.destinationAccount !== null && intent.sourceAccount !== intent.destinationAccount &&
    intent.sourceAccount !== XRPL_RLUSD.issuer && intent.destinationAccount !== XRPL_RLUSD.issuer;
}

export type RlusdLineControls = Readonly<{
  issuerAuthorized: boolean;
  issuerFrozen: boolean;
  holderFrozen: boolean;
  issuerDeepFrozen: boolean;
  holderDeepFrozen: boolean;
}>;

export type RlusdControls = Readonly<{
  ledgerHash: string;
  asset: typeof XRPL_RLUSD;
  issuerRequireAuth: boolean | null;
  issuerGlobalFreeze: boolean | null;
  sourceLine: RlusdLineControls | null;
  destinationLine: RlusdLineControls | null;
}>;

export function ledgerFlags(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff
    ? value : null;
}

/** Control bits belong to the account on the indicated side of the RippleState entry. */
export function readRlusdLine(node: Record<string, unknown> | null, holder: string): RlusdLineControls | null {
  if (!node || node.LedgerEntryType !== "RippleState") return null;
  const flags = ledgerFlags(node.Flags);
  const low = node.LowLimit as { issuer?: unknown; currency?: unknown } | undefined;
  const high = node.HighLimit as { issuer?: unknown; currency?: unknown } | undefined;
  if (flags === null || typeof low?.currency !== "string" || typeof high?.currency !== "string" ||
      low.currency.toUpperCase() !== XRPL_RLUSD.currency || high.currency.toUpperCase() !== XRPL_RLUSD.currency)
    return null;

  const issuerIsLow = low.issuer === XRPL_RLUSD.issuer && high.issuer === holder;
  const issuerIsHigh = high.issuer === XRPL_RLUSD.issuer && low.issuer === holder;
  if (!issuerIsLow && !issuerIsHigh) return null;
  // 0x00010000 and 0x00020000 are the reserve flags, not authorization.
  const lowAuth = 0x00040000;
  const highAuth = 0x00080000;
  const lowFreeze = 0x00400000;
  const highFreeze = 0x00800000;
  const lowDeepFreeze = 0x02000000;
  const highDeepFreeze = 0x04000000;
  return {
    issuerAuthorized: (flags & (issuerIsLow ? lowAuth : highAuth)) !== 0,
    issuerFrozen: (flags & (issuerIsLow ? lowFreeze : highFreeze)) !== 0,
    holderFrozen: (flags & (issuerIsLow ? highFreeze : lowFreeze)) !== 0,
    issuerDeepFrozen: (flags & (issuerIsLow ? lowDeepFreeze : highDeepFreeze)) !== 0,
    holderDeepFrozen: (flags & (issuerIsLow ? highDeepFreeze : lowDeepFreeze)) !== 0,
  };
}
