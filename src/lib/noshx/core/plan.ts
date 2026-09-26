/**
 * NOSHX Core, step one: work out what is being asked.
 *
 * No language model. The question is read for the things NOSHASHI can
 * act on (classic addresses, 64-character hashes, currency codes) and
 * for what the asker wants to know, and turned into a plan: which ledger
 * readers to run and whether to look in NOSHASHI's own pages. Rules are
 * written out below so every decision can be read and tested; when the
 * rules find nothing to read, the question goes to the pages.
 */

export type PlannedCall = { tool: string; input: Record<string, unknown>; why: string };

export type Plan = {
  calls: PlannedCall[];
  /** Search NOSHASHI's pages for this question. */
  knowledge: boolean;
  entities: Entities;
};

export type Entities = {
  addresses: string[];
  hashes: string[];
  currencies: string[];
};

const ADDRESS = /\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/g;
const HASH64 = /\b[0-9A-Fa-f]{64}\b/g;
const HEX_CURRENCY = /\b[0-9A-F]{40}\b/g;
const CODE = /\b[A-Z][A-Z0-9]{2}\b/g;

/** Three-letter words that are not currencies in this product's vocabulary. */
const NOT_CURRENCIES = new Set([
  "XRP", "AMM", "NFT", "KYC", "AML", "API", "HHI", "UNL", "DEX", "SSO", "CSV", "PDF", "FAQ", "LP", "TLS",
  "MAU", "CEO", "CFO", "CTO", "ETA", "SLA", "DPA", "MSA", "TAG", "THE", "AND", "FOR", "YOU", "CAN", "HOW",
  "WHO", "WHY", "ARE", "NOT", "BUT", "HUD", "GO", "OFF", "USE", "ANY", "ALL", "OUR", "HAS", "WAS", "RWA",
  "VASP", "CASP", "SHA", "XLS", "FATF", "OFAC", "MICA",
]);

export function extractEntities(question: string): Entities {
  const unique = <T,>(xs: T[]) => [...new Set(xs)];
  const hashes = unique(question.match(HASH64) ?? []).map((h) => h.toUpperCase());
  // A 40-character hex currency code is not a 64-character hash.
  const hexCodes = (question.match(HEX_CURRENCY) ?? []).filter((c) => !hashes.some((h) => h.includes(c)));
  const codes = (question.match(CODE) ?? []).filter((c) => !NOT_CURRENCIES.has(c));
  return {
    addresses: unique(question.match(ADDRESS) ?? []),
    hashes,
    currencies: unique([...codes, ...hexCodes]),
  };
}

type Rule = { tool: string; label: string; words: RegExp; needs: "address" | "hash" | "none" | "book" };

/** The input field each address-taking tool expects. */
const INPUT_KEY: Record<string, string> = { certify_authority: "issuer", read_issuance: "issuer", read_pool: "amm_account" };

// Order matters only for display; every rule that matches runs.
const RULES: Rule[] = [
  {
    tool: "certify_authority",
    label: "issuer powers",
    needs: "address",
    words: /freez|frozen|claw ?back|clawback|seiz|issuer (power|control|setting|right|flag)|authority|certif|require ?auth|transfer fee|blackhol|no ?freeze|what can (the|this) issuer|can the issuer/i,
  },
  {
    tool: "read_control_surface",
    label: "who controls the account",
    needs: "address",
    words: /signer|multi-?sig|quorum|master key|regular key|who (can|really) (move|control|sign)|who controls|control surface|treasury|reserve|locked|escrow/i,
  },
  {
    tool: "read_provenance",
    label: "where the account came from",
    needs: "address",
    words: /provenance|how old|account age|\bage\b|first fund|funded (it|by|this)|who funded|where .*(come|came) from|new account|created|history of (the|this) account/i,
  },
  {
    tool: "read_issuance",
    label: "supply and holders",
    needs: "address",
    words: /holders?\b|supply|issuance|obligation|concentrat|circulat|largest holder|who holds|outstanding/i,
  },
  {
    tool: "read_claims",
    label: "tokens sent to the account",
    needs: "address",
    words: /inbox|claims?\b|airdrop|sent (me|to me|this account)|impersonat|fake token|spam token|scam token|unknown token/i,
  },
  {
    tool: "read_pool",
    label: "AMM pool",
    needs: "address",
    words: /\bamm\b|\bpool\b|lp token|auction slot|fee vote|liquidity pool/i,
  },
  {
    tool: "read_book",
    label: "order-book depth",
    needs: "book",
    words: /depth|liquid|order ?book|\bbook\b|\bexit\b|sell|slippage|spread|unfunded|\bfunded\b|listed|could i (get out|exit)|at size|mid price/i,
  },
  {
    tool: "read_token_rights",
    label: "NFT rights",
    needs: "hash",
    words: /\bnft\b|nftoken|token ?id|token rights|burnable|royalt/i,
  },
  {
    tool: "read_settlement",
    label: "what the transaction delivered",
    needs: "hash",
    words: /deliver|arriv|payment|settle|partial|transaction|\btx\b|\bhash\b|credited|received|what happened/i,
  },
  {
    tool: "check_address",
    label: "address check",
    needs: "address",
    words: /\bpay\b|paying|send (to|money|xrp)|safe|scam|legit|trust(worthy)?\b|check (this|the|an|that)? ?(address|account|wallet)|counterparty|risky|who is|is (this|it) (ok|fine|real)|destination tag/i,
  },
  {
    tool: "ledger_sync",
    label: "server agreement",
    needs: "none",
    words: /\bservers?\b|\bnodes?\b|in sync|disagree|ledger sync|which server/i,
  },
  {
    tool: "ledger_status",
    label: "network status",
    needs: "none",
    words: /ledger (index|status|height|number)|latest ledger|current ledger|network (status|fee|busy)|\bfees? (now|right now|today)|reference fee|is the (network|ledger) (up|live|working)/i,
  },
];

/**
 * Words that say the question is about the product, a concept or a
 * how-to, so the pages are searched even when a reader also runs.
 */
const KNOWLEDGE_WORDS =
  /noshashi|noshx|\bplans?\b|pricing|price|cost|which screen|how (do|can|should) i|what (is|are|does)|explain|difference between|what does .* mean|travel rule|\bkyc\b|\baml\b|mica|webhook|\bapi\b|examiner|auditor/i;

export function plan(question: string): Plan {
  const entities = extractEntities(question);
  const calls: PlannedCall[] = [];
  const add = (call: PlannedCall) => {
    if (!calls.some((c) => c.tool === call.tool && JSON.stringify(c.input) === JSON.stringify(call.input))) calls.push(call);
  };

  for (const rule of RULES) {
    if (!rule.words.test(question)) continue;
    if (rule.needs === "address") {
      for (const address of entities.addresses) add({ tool: rule.tool, input: { [INPUT_KEY[rule.tool] ?? "address"]: address }, why: rule.label });
    } else if (rule.needs === "hash") {
      for (const hash of entities.hashes) {
        add({ tool: rule.tool, input: rule.tool === "read_token_rights" ? { token_id: hash } : { hash }, why: rule.label });
      }
    } else if (rule.needs === "book") {
      const issuer = entities.addresses[0];
      for (const currency of entities.currencies) if (issuer) add({ tool: rule.tool, input: { currency, issuer }, why: rule.label });
    } else {
      add({ tool: rule.tool, input: {}, why: rule.label });
    }
  }

  // Named things with no stated question: read what they are.
  if (calls.length === 0) {
    for (const hash of entities.hashes) add({ tool: "read_settlement", input: { hash }, why: "a hash on its own" });
    for (const address of entities.addresses) add({ tool: "check_address", input: { address }, why: "an address on its own" });
  }

  const knowledge = calls.length === 0 || KNOWLEDGE_WORDS.test(question.replace(ADDRESS, " ").replace(HASH64, " "));
  return { calls: calls.slice(0, 6), knowledge, entities };
}
