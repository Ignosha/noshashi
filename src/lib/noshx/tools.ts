import { checkCounterparty } from "@/lib/public/counterparty";
import { readProvenance } from "@/lib/desk/provenance";
import { certifyAuthority } from "@/lib/desk/authority";
import { readBook } from "@/lib/desk/book";
import { readSettlement } from "@/lib/desk/settlement";
import { readControlSurface } from "@/lib/desk/control";
import { readAmm } from "@/lib/desk/amm";
import { readIssuance } from "@/lib/desk/issuance";
import { readClaims } from "@/lib/desk/claims";
import { readNft } from "@/lib/desk/nft";
import { readSync } from "@/lib/net/sync";
import { fetchLedger } from "@/lib/xrpl/client";

/**
 * What NOSHX can do: read the live XRP Ledger through the same readers
 * the screens use. Every tool is read-only — none signs, submits or
 * moves anything — and each is gated by the same plan feature as the
 * screen it mirrors, so the agent is never a way around the paywall.
 *
 * The model chooses which tools to call; the numbers in its answer come
 * from these readers, not from the model.
 */

export type JsonSchema = {
  type: "object";
  properties: Record<string, { type: string; description: string; enum?: string[] }>;
  required: string[];
  additionalProperties: false;
};

export type ToolContext = {
  /** Plan entitlement check (useBilling().has). */
  has: (feature: string) => boolean;
  /** Counts a free-plan address check; false when the month's checks are used up. */
  spendFreeCheck: () => boolean;
};

export type NoshxTool = {
  name: string;
  description: string;
  input_schema: JsonSchema;
  /** Plan feature required, or null when the tool is free. */
  feature: string | null;
  /** The screen this mirrors, named for the operator. */
  screen: string;
  run: (input: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
};

const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const HASH64 = /^[0-9A-Fa-f]{64}$/;

export class ToolInputError extends Error {}

function address(input: Record<string, unknown>, key = "address"): string {
  const value = String(input[key] ?? "").trim();
  if (!ADDRESS.test(value)) throw new ToolInputError(`${key} must be a classic XRPL address starting with r.`);
  return value;
}

function hash64(input: Record<string, unknown>, key: string): string {
  const value = String(input[key] ?? "").trim();
  if (!HASH64.test(value)) throw new ToolInputError(`${key} must be 64 hexadecimal characters.`);
  return value;
}

const schema = (
  properties: JsonSchema["properties"],
  required: string[] = Object.keys(properties)
): JsonSchema => ({ type: "object", properties, required, additionalProperties: false });

const addr = (description: string) => ({ type: "string", description });

export const NOSHX_TOOLS: NoshxTool[] = [
  {
    name: "ledger_status",
    description:
      "The latest validated XRP Ledger: index, hash, close time, reference fee and open-ledger fee. Call this to stamp an answer with the ledger it describes.",
    input_schema: schema({}),
    feature: null,
    screen: "Mission Control",
    run: () => fetchLedger(),
  },
  {
    name: "ledger_sync",
    description:
      "What four public XRPL servers each report right now (ledger index, state, fees) and where they disagree.",
    input_schema: schema({}),
    feature: null,
    screen: "Ledger Sync",
    run: () => readSync(),
  },
  {
    name: "check_address",
    description:
      "What the ledger publishes about an account before someone pays it: existence, age, destination tag requirement, flags and anything recorded against it. Reports facts, never 'safe'.",
    input_schema: schema({ address: addr("Classic address, r…") }),
    feature: null,
    screen: "Check an Address",
    run: (input, context) => {
      const target = address(input);
      if (!context.has("portfolios") && !context.spendFreeCheck()) {
        throw new ToolInputError("This month's 10 free address checks are used up. Pro includes unlimited checks.");
      }
      return checkCounterparty(target);
    },
  },
  {
    name: "read_claims",
    description:
      "Tokens and claims other accounts have sent to an address, and whether each is real or an impersonation (a familiar ticker from an issuer with no obligations).",
    input_schema: schema({ address: addr("Classic address whose inbox to read") }),
    feature: null,
    screen: "Inbox",
    run: (input) => readClaims(address(input)),
  },
  {
    name: "read_token_rights",
    description: "What an NFT's issuer can still do after someone owns it: burnable, transferable, transfer fee, taxon.",
    input_schema: schema({ token_id: addr("The 64-character NFTokenID") }),
    feature: null,
    screen: "Token Rights",
    run: (input) => readNft(hash64(input, "token_id")),
  },
  {
    name: "certify_authority",
    description:
      "The six issuer checks (freeze surrendered, not globally frozen, open holding, no single key controls the issuer, transfer fee, supply concentration) with GO/HOLD/NO-GO, ledger index and SHA-256 digest.",
    input_schema: schema({ issuer: addr("Issuer's classic address") }),
    feature: "authority_certificate",
    screen: "Authority",
    run: (input) => certifyAuthority(address(input, "issuer"), { walkSupply: false }),
  },
  {
    name: "read_provenance",
    description: "Where an account came from: its real age (corrected for the Sequence misreading) and the account that first funded it.",
    input_schema: schema({ address: addr("Counterparty address") }),
    feature: "portfolios",
    screen: "Provenance",
    run: (input) => readProvenance(address(input)),
  },
  {
    name: "read_book",
    description:
      "An order book's listed versus funded depth (offers whose owners can really fill them), the unfunded share, spread and mid price. The book is the currency against XRP.",
    input_schema: schema({
      currency: { type: "string", description: "Currency code, e.g. USD, or a 40-character hex code" },
      issuer: addr("Issuer's classic address"),
    }),
    feature: "portfolios",
    screen: "Order Book",
    run: (input) => {
      const currency = String(input.currency ?? "").trim();
      if (!/^([A-Za-z0-9]{3}|[0-9A-Fa-f]{40})$/.test(currency)) {
        throw new ToolInputError("currency must be a 3-character code or 40 hexadecimal characters.");
      }
      return readBook(currency, address(input, "issuer"));
    },
  },
  {
    name: "read_settlement",
    description:
      "What a transaction actually delivered: type, sender, result, whether the partial-payment flag was set, requested versus delivered amount, and the fee burned.",
    input_schema: schema({ hash: addr("Transaction hash, 64 hexadecimal characters") }),
    feature: "portfolios",
    screen: "Settlement",
    run: (input) => readSettlement(hash64(input, "hash")),
  },
  {
    name: "read_control_surface",
    description:
      "Who can move an account's funds: master key status, regular key, signer list and quorum, the fewest signers that reach quorum, master-key bypass, and XRP locked in reserve.",
    input_schema: schema({ address: addr("Treasury or issuer address") }),
    feature: "portfolios",
    screen: "Control Surface",
    run: (input) => readControlSurface(address(input)),
  },
  {
    name: "read_pool",
    description: "An AMM pool's balances, trading fee, fee votes weighted by LP tokens, and who holds the auction slot.",
    input_schema: schema({ amm_account: addr("The AMM pool's own account address") }),
    feature: "portfolios",
    screen: "Pool Governance",
    run: (input) => readAmm({ ammAccount: address(input, "amm_account") }),
  },
  {
    name: "read_issuance",
    description:
      "A token from the issuer's side: currencies issued, outstanding obligations, holder lines read, the largest holder, concentration, and enforcement history (freezes and clawbacks).",
    input_schema: schema({ issuer: addr("Issuer's classic address") }),
    feature: "portfolios",
    screen: "Issuance",
    run: (input) => readIssuance(address(input, "issuer")),
  },
];

export function findTool(name: string): NoshxTool | undefined {
  return NOSHX_TOOLS.find((tool) => tool.name === name);
}

const MAX_RESULT_CHARS = 9000;
const MAX_ARRAY = 15;
const MAX_STRING = 400;

/**
 * A reader's report, made small enough for a model's context without
 * hiding that it was made smaller: long arrays keep their first entries
 * and say how many were left out, and the whole result says if it was cut.
 */
export function compactResult(value: unknown): string {
  const seen = new WeakSet<object>();
  const shrink = (v: unknown, depth: number): unknown => {
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "string") return v.length > MAX_STRING ? `${v.slice(0, MAX_STRING)}… [${v.length - MAX_STRING} more characters]` : v;
    if (typeof v !== "object" || v === null) return v;
    if (seen.has(v)) return "[repeated]";
    seen.add(v);
    if (depth > 6) return "[nested deeper than shown]";
    if (Array.isArray(v)) {
      const kept = v.slice(0, MAX_ARRAY).map((item) => shrink(item, depth + 1));
      return v.length > MAX_ARRAY ? [...kept, `[${v.length - MAX_ARRAY} more items not shown]`] : kept;
    }
    if (v instanceof Date) return v.toISOString();
    if (v instanceof Map) return shrink(Object.fromEntries(v), depth);
    if (v instanceof Set) return shrink([...v], depth);
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(v)) {
      if (typeof item === "function") continue;
      out[key] = shrink(item, depth + 1);
    }
    return out;
  };
  const text = JSON.stringify(shrink(value, 0));
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}… [result cut at ${MAX_RESULT_CHARS} of ${text.length} characters]`
    : text;
}

/** Run one tool call; failures come back as text for the model, never as a throw. */
export async function runTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<{ ok: boolean; content: string }> {
  const tool = findTool(name);
  if (!tool) return { ok: false, content: `No tool named ${name}.` };
  if (tool.feature && !context.has(tool.feature)) {
    return {
      ok: false,
      content: `${tool.screen} needs a Pro plan or higher. Tell the operator it is available after upgrading in Pricing; do not guess the answer.`,
    };
  }
  try {
    return { ok: true, content: compactResult(await tool.run(input ?? {}, context)) };
  } catch (error) {
    return { ok: false, content: error instanceof Error ? error.message : "The read failed." };
  }
}
