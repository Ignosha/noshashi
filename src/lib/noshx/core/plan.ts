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
  /** Something to tell the person before any reading (a ticket request that is missing its text). */
  note?: string;
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

// ————— Support tickets and self-repair —————

const TICKET_REF = /\bNSH-?\s?(\d{1,9})\b/gi;
const REPAIR =
  /self[- ]?repair|\brepair\b|diagnos|troubleshoot|health ?check|not working|isn'?t working|doesn'?t work|stopped working|\bbroken\b|won'?t (load|connect|open|start|sign)|can'?t (connect|sign in|log in|load)|keeps? (disconnect|signing me out|failing)|\bfix (it|the app|this|noshashi|my app|yourself|everything)\b|something('?s| is) wrong|check (the app|everything|my setup)/i;
const LIST_TICKETS =
  /\b(my|our|open|active|all|pending|unresolved|resolved|recent|customer|support) tickets?\b|\btickets? (queue|inbox|waiting|list)\b|\blist (the |my |all )?tickets\b|\bany tickets\b|\bshow (me )?(the |my )?tickets\b/i;
const OPEN_TICKET = /\b(open|file|create|raise|start|submit|log) (a |an |new |the )?(support )?(ticket|case with support|support request)\b|\b(contact|tell|email|message) support\b|\breport (a |this |the )?bug\b/i;
const WITH_REPORT = /\b(with|attach|include|send) (this|the|a|my)? ?(self-?repair |repair |diagnostic )?(report|diagnostics|results)\b/i;

export type TicketPlan = {
  calls: PlannedCall[];
  /** The question with any message text taken out, so its words plan nothing else. */
  rest: string;
  /** Said when a ticket request is missing something. */
  note?: string;
};

/** The text after "reply to NSH-12:" or "saying …", trimmed of quotes. */
function messageAfter(question: string, index: number): string {
  const tail = question.slice(index);
  const m = /^\s*(?::|—|-|,)?\s*(?:saying|say|with|that|and say|telling (?:them|him|her))?\s*[:,]?\s*([\s\S]*)$/i.exec(tail);
  return (m?.[1] ?? "").trim().replace(/^["'“]|["'”]$/g, "").trim();
}

export function planTickets(question: string): TicketPlan {
  const calls: PlannedCall[] = [];
  let rest = question;
  const refs = [...question.matchAll(TICKET_REF)].map((m) => ({ ref: `NSH-${m[1]}`, index: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));

  // Writing into a ticket: everything after the reference is the message.
  const reply = /\b(reply|respond|write|add|post|answer back|tell (?:them|the customer))(?: to| on| in)?\s+NSH-?\s?(\d{1,9})\b/i.exec(question);
  if (reply) {
    const message = messageAfter(question, (reply.index ?? 0) + reply[0].length);
    if (message.length >= 10) {
      calls.push({ tool: "reply_ticket", input: { ticket: `NSH-${reply[2]}`, message }, why: "reply to the ticket" });
      rest = question.slice(0, reply.index);
    } else {
      calls.push({ tool: "read_ticket", input: { ticket: `NSH-${reply[2]}` }, why: "the ticket to reply to (no message given)" });
    }
    return { calls, rest };
  }

  // Opening a ticket, or sending a self-repair report.
  const open = OPEN_TICKET.exec(question);
  if (open) {
    if (WITH_REPORT.test(question) || REPAIR.test(question)) {
      calls.push({ tool: "self_repair", input: { open_ticket: true }, why: "repair, then open a ticket with the report" });
      return { calls, rest: "" };
    }
    const body = messageAfter(question, (open.index ?? 0) + open[0].length).replace(/^(about|for|regarding|because|that)\s+/i, "");
    if (body.length >= 10) {
      // No lookbehind: the macOS app's WebKit may not parse one.
      const subject = (body.split(/[.!?](?:\s|$)|\n/)[0] ?? body).trim().slice(0, 100);
      calls.push({ tool: "open_ticket", input: { subject: subject.length >= 4 ? subject : body.slice(0, 100), body }, why: "open a support ticket" });
      return { calls, rest: question.slice(0, open.index) };
    }
    return { calls, rest: "", note: "To open a ticket, say what happened after it, for example: open a ticket: the Ledger Watch tab shows no events since this morning." };
  }

  for (const { ref } of refs) {
    const near = question;    if (/\b(re-?open|not (solved|fixed|resolved))\b/i.test(near)) {
      calls.push({ tool: "set_ticket_status", input: { ticket: ref, status: "open" }, why: "reopen the ticket" });
    } else if (/\b(close|resolve|mark (it |this )?(as )?(resolved|solved|done|closed)|it'?s (solved|fixed))\b/i.test(near)) {
      calls.push({ tool: "set_ticket_status", input: { ticket: ref, status: "resolved" }, why: "resolve the ticket" });
    } else if (/\bmark (it |this )?(as )?answered\b/i.test(near)) {
      calls.push({ tool: "set_ticket_status", input: { ticket: ref, status: "answered" }, why: "mark the ticket answered" });
    } else if (/\b(answer|draft|suggest)\b/i.test(near)) {
      calls.push({ tool: "answer_ticket", input: { ticket: ref, send: /\b(send|post|and reply|submit) (it|that|this|the (draft|answer|reply))?\b|\band send\b/i.test(near) }, why: "answer the ticket from NOSHASHI's pages" });
    } else if (REPAIR.test(near) || WITH_REPORT.test(near)) {
      calls.push({ tool: "self_repair", input: { post_to_ticket: ref }, why: "repair and post the report to the ticket" });
    } else {
      calls.push({ tool: "read_ticket", input: { ticket: ref }, why: "read the ticket" });
    }
  }
  if (refs.length) return { calls, rest: refs.reduceRight((q, r) => q.slice(0, r.index) + q.slice(r.end), question) };

  if (LIST_TICKETS.test(question)) {
    const status = /\bresolved\b|\bclosed\b/i.test(question) && !/unresolved/i.test(question) ? "resolved" : /\ball\b/i.test(question) ? "any" : "active";
    calls.push({ tool: "list_tickets", input: { status }, why: "the support tickets" });
    return { calls, rest: "" };
  }

  if (REPAIR.test(question)) calls.push({ tool: "self_repair", input: {}, why: "check and repair the app" });
  return { calls, rest };
}

export type PlanOptions = {
  /** The support tools are registered (the desktop app, not the website). */
  tickets?: boolean;
};

export function plan(question: string, options: PlanOptions = {}): Plan {
  const ticketPlan: TicketPlan = options.tickets ? planTickets(question) : { calls: [], rest: question };
  // A message being written into a ticket plans nothing but that write.
  question = ticketPlan.rest;
  const entities = extractEntities(question);
  const calls: PlannedCall[] = [...ticketPlan.calls];
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
  if (calls.length === 0 && question.trim()) {
    for (const hash of entities.hashes) add({ tool: "read_settlement", input: { hash }, why: "a hash on its own" });
    for (const address of entities.addresses) add({ tool: "check_address", input: { address }, why: "an address on its own" });
  }

  const knowledge =
    (calls.length === 0 && question.trim().length > 0) ||
    (ticketPlan.calls.length === 0 && KNOWLEDGE_WORDS.test(question.replace(ADDRESS, " ").replace(HASH64, " ")));
  return { calls: calls.slice(0, 6), knowledge, entities, note: ticketPlan.note };
}
