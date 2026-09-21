import { rpc } from "./client";

/**
 * Live capability detection.
 *
 * The XRPL ships features as amendments, and a feature exists in three
 * distinct states that are easy to conflate and expensive to get wrong:
 *
 *   1. Specified   — an XLS document exists.
 *   2. Implemented — rippled knows the transaction type. `server_definitions`
 *                    lists it, so naive checks report the feature as present.
 *   3. Enabled     — the amendment reached majority and activated. Only now
 *                    can a transaction of that type actually succeed.
 *
 * Most tooling checks (2) and calls it support. That produces a UI offering
 * a Lending Protocol whose transactions are rejected by every validator on
 * the network. NOSHASHI checks (3), against the live amendments object in
 * the validated ledger, and refuses to surface anything that is not
 * genuinely usable today.
 *
 * Verified against mainnet 2026-08-24 (rippled 3.3.0, 93 amendments):
 * Credentials, PermissionedDomains, PermissionedDEX, MPTokensV1, DeepFreeze,
 * Clawback, AMMClawback, TokenEscrow, DID and PriceOracle are enabled;
 * SingleAssetVault, LendingProtocol, ConfidentialMPT, DynamicMPT, Batch and
 * PermissionDelegation are not.
 */

/** The ledger index of the singleton Amendments object. Fixed, forever. */
const AMENDMENTS_INDEX =
  "7DB0788C020F02780A673DC74757F23823FA3014C1866E72CC4CD8B226CD6EF4";

export type CapabilityId =
  | "credentials"
  | "permissioned_domains"
  | "permissioned_dex"
  | "deep_freeze"
  | "clawback"
  | "amm_clawback"
  | "token_escrow"
  | "mpt"
  | "did"
  | "price_oracle"
  | "multisign_reserve"
  | "single_asset_vault"
  | "lending_protocol"
  | "confidential_mpt"
  | "dynamic_mpt"
  | "batch"
  | "permission_delegation";

export type Capability = {
  id: CapabilityId;
  /** The amendment name, which is also the pre-image of its ID. */
  amendment: string;
  /** The XLS standard, where one is published. */
  xls?: string;
  label: string;
  /** What it lets NOSHASHI do, in the operator's terms. */
  blurb: string;
  /** True once the amendment has activated on the connected network. */
  enabled: boolean;
};

/** Everything NOSHASHI knows how to use, live or not. */
const CATALOG: Omit<Capability, "enabled">[] = [
  {
    id: "credentials",
    amendment: "Credentials",
    xls: "XLS-70",
    label: "On-chain credentials",
    blurb:
      "Issue, accept and revoke credential objects. The verifiable identity every compliance check is tied to.",
  },
  {
    id: "permissioned_domains",
    amendment: "PermissionedDomains",
    xls: "XLS-80",
    label: "Permissioned domains",
    blurb:
      "Walled gardens where only holders of named credentials may transact.",
  },
  {
    id: "permissioned_dex",
    amendment: "PermissionedDEX",
    xls: "XLS-81",
    label: "Permissioned DEX",
    blurb:
      "Order books restricted to an approved membership — a members-only market for regulated participants.",
  },
  {
    id: "deep_freeze",
    amendment: "DeepFreeze",
    xls: "XLS-77",
    label: "Deep freeze",
    blurb:
      "Block a sanctioned holder from sending *and* receiving, rather than only sending.",
  },
  {
    id: "clawback",
    amendment: "Clawback",
    label: "Issuer clawback",
    blurb: "Reclaim an issued balance in fraud or regulatory action.",
  },
  {
    id: "amm_clawback",
    amendment: "AMMClawback",
    label: "AMM clawback",
    blurb: "Reclaim an issued balance that has been deposited into an AMM pool.",
  },
  {
    id: "token_escrow",
    amendment: "TokenEscrow",
    xls: "XLS-85",
    label: "Token escrow",
    blurb: "Escrow any issued token or MPT, not only XRP.",
  },
  {
    id: "mpt",
    amendment: "MPTokensV1",
    xls: "XLS-33",
    label: "Multi-purpose tokens",
    blurb: "Issue tokens carrying their own metadata and transfer rules.",
  },
  { id: "did", amendment: "DID", xls: "XLS-40", label: "Decentralised identifiers",
    blurb: "Attach a DID document to an account." },
  { id: "price_oracle", amendment: "PriceOracle", xls: "XLS-47",
    label: "Native price oracles", blurb: "Read on-ledger published price feeds." },
  { id: "multisign_reserve", amendment: "MultiSignReserve", label: "Multi-signing",
    blurb: "Signer lists and quorum approval for high-value settlements." },

  /* Specified and implemented in the binary, but not activated on mainnet. */
  { id: "single_asset_vault", amendment: "SingleAssetVault", xls: "XLS-65",
    label: "Single-asset vaults", blurb: "Pooled deposits against a single asset." },
  { id: "lending_protocol", amendment: "LendingProtocol", xls: "XLS-66",
    label: "Native lending", blurb: "On-ledger loan brokers, loans and repayment." },
  { id: "confidential_mpt", amendment: "ConfidentialMPT", xls: "XLS-96",
    label: "Confidential MPT", blurb: "Hide transfer amounts while remaining auditable." },
  { id: "dynamic_mpt", amendment: "DynamicMPT", label: "Mutable MPT metadata",
    blurb: "Change an issuance's metadata after creation." },
  { id: "batch", amendment: "Batch", xls: "XLS-56", label: "Atomic batches",
    blurb: "Submit several transactions that succeed or fail together." },
  { id: "permission_delegation", amendment: "PermissionDelegation", xls: "XLS-75",
    label: "Delegated permissions", blurb: "Grant another account a named subset of your authority." },
];

/**
 * Amendment IDs are the first 256 bits of SHA-512 over the ASCII feature
 * name. Computing them locally means the check needs no name table from a
 * third party — the ledger's own list is the only input.
 */
async function amendmentId(name: string): Promise<string> {
  const bytes = new TextEncoder().encode(name);
  const digest = await crypto.subtle.digest("SHA-512", bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 32)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export type CapabilityReport = {
  capabilities: Capability[];
  /** How many amendments the connected network has activated in total. */
  totalEnabled: number;
  ledgerIndex: number;
  readAt: string;
};

let cached: CapabilityReport | null = null;
let inflight: Promise<CapabilityReport> | null = null;

/**
 * Read the network's activated amendments and resolve what NOSHASHI can
 * actually offer against it.
 *
 * Cached for the session: amendments activate on a two-week majority, so
 * re-reading per render would spend the socket on a number that changes
 * a handful of times a year.
 */
export async function readCapabilities(force = false): Promise<CapabilityReport> {
  if (cached && !force) return cached;
  if (inflight && !force) return inflight;

  inflight = (async () => {
    const result = await rpc("ledger_entry", {
      amendments: AMENDMENTS_INDEX,
      ledger_index: "validated",
    });
    const enabled = new Set<string>(
      ((result.node?.Amendments ?? []) as string[]).map((h) => h.toUpperCase())
    );

    const capabilities = await Promise.all(
      CATALOG.map(async (spec) => ({
        ...spec,
        enabled: enabled.has(await amendmentId(spec.amendment)),
      }))
    );

    cached = {
      capabilities,
      totalEnabled: enabled.size,
      ledgerIndex: Number(result.ledger_index ?? 0),
      readAt: new Date().toISOString(),
    };
    inflight = null;
    return cached;
  })();

  return inflight;
}

/** True only when the amendment is activated on the connected network. */
export async function hasCapability(id: CapabilityId): Promise<boolean> {
  const report = await readCapabilities();
  return report.capabilities.find((c) => c.id === id)?.enabled ?? false;
}
