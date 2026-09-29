import type { SceneId } from "@/App";

/**
 * Citations — what an assistant answer rests on, as data the UI can link.
 *
 * NOSHX may explain; it may not be the source of a figure. Every tool it
 * calls reads the ledger (or NOSHASHI's own pages) through the same readers
 * the screens use, so each reading can be cited as: which screen shows it,
 * which validated ledger it was read at, when, and what was asked. The
 * answer lists these under SOURCES, and each one opens its screen.
 *
 * The ledger index is taken from the reading itself (never from the model's
 * text): the first `ledgerIndex` / `ledger_index` / `leaderSeq` found in the
 * tool's result. A reading with none says "no ledger index", not a guess.
 */

export type Citation = {
  tool: string;
  /** The screen that shows this reading, named for the operator. */
  screen: string;
  /** Where "open" goes, when the screen is a scene of the app. */
  scene?: SceneId;
  /** What was asked: the tool's input values. */
  subject?: string;
  ledgerIndex?: number;
  readAt: string;
};

/** Tool → the app scene that shows the same reading. */
const SCENE_OF: Record<string, SceneId> = {
  ledger_status: "control",
  ledger_sync: "network",
  check_address: "risk",
  read_claims: "claims",
  read_token_rights: "nft",
  certify_authority: "authority",
  read_provenance: "provenance",
  read_book: "book",
  read_settlement: "settlement",
  read_control_surface: "authority",
  read_pool: "amm",
  read_issuance: "issuance",
  security_check: "security",
  investigate_hack: "security",
  explain_transaction: "security",
  find_stuck_funds: "security",
  audit_exposure: "security",
  asset_inventory: "security",
  deposit_help: "security",
  verify_domain: "security",
  map_cluster: "security",
  drainer_check: "security",
  emergency_kit: "security",
  who_is: "security",
  scam_registry: "security",
  check_link: "security",
  screen_withdrawal: "security",
  surveil_market: "security",
  search_noshashi: "learn",
};

const KEYS = ["ledgerIndex", "ledger_index", "leaderSeq", "validatedLedger"];

/** The first ledger index in a reading, depth-first, bounded. */
export function ledgerIndexIn(value: unknown, depth = 0): number | undefined {
  if (depth > 5 || value === null || typeof value !== "object") return undefined;
  const o = value as Record<string, unknown>;
  for (const k of KEYS) {
    const v = o[k];
    if (typeof v === "number" && Number.isInteger(v) && v > 32_570) return v;
    if (typeof v === "string" && /^\d{5,}$/.test(v) && Number(v) > 32_570) return Number(v);
  }
  for (const v of Array.isArray(value) ? value.slice(0, 20) : Object.values(o)) {
    const found = ledgerIndexIn(v, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function citationFor(tool: string, screen: string, input: Record<string, unknown>, value: unknown, now = new Date()): Citation {
  const subject = Object.values(input ?? {})
    .filter((v) => typeof v === "string" || typeof v === "number")
    .map(String)
    .join(" · ");
  return {
    tool,
    screen,
    ...(SCENE_OF[tool] ? { scene: SCENE_OF[tool] } : {}),
    ...(subject ? { subject } : {}),
    ...(ledgerIndexIn(value) !== undefined ? { ledgerIndex: ledgerIndexIn(value) } : {}),
    readAt: now.toISOString(),
  };
}
