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
import { searchKnowledge } from "./knowledge";
import { assessSecurity, readSecurityPosture } from "@/lib/security/hardening";
import { recoveryOptions, takeoverSignals, traceFunds, TRACE_LIMITS } from "@/lib/security/incident";
import { addressesIn, explainTransaction, parseTransaction, type SignExplanation } from "@/lib/security/signInspect";
import { readHoldings } from "@/lib/security/objects";
import { recoveryFrom, resolveEscrowSequences, type RecoveryReport } from "@/lib/security/recovery";
import { exposureFrom, type ExposureReport } from "@/lib/security/exposure";
import { inventoryFrom, priceInventory, type Inventory } from "@/lib/security/inventory";
import { checkDeposit, type DepositDiagnosis } from "@/lib/security/depositHelp";
import { verifyDomain, type DomainAccount, type DomainCheck } from "@/lib/security/domain";
import { CLUSTER_LIMITS, mapCluster, type Cluster } from "@/lib/security/cluster";
import { sanctionsFor } from "@/lib/xrpl/sanctions";
import { readDrainerPatterns, type DrainerPattern } from "@/lib/security/drainer";
import { emergencyKit, type EmergencyKit } from "@/lib/security/emergency";
import { attribute, type Attribution } from "@/lib/security/attribution";
import { surveilIssuer, type SurveillanceReport } from "@/lib/security/surveillance";
import { checkPhishingLink, screenWithdrawalLive, threatsFor, type PhishingCheck, type ThreatHit, type WithdrawalResult } from "@/lib/security/threats";

/**
 * What NOSHX can do: read the live XRP Ledger through the same readers
 * the screens use. Every ledger tool is read-only — none signs, submits
 * or moves anything — and each is gated by the same plan feature as the
 * screen it mirrors, so the agent is never a way around the paywall.
 * The support tools (./ticketTools.ts, registered by the desktop app)
 * read and write the person's own tickets and run self-repair; they
 * write only when asked in words.
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
  /** Gives back a counted check whose read never reached the ledger. */
  refundFreeCheck?: () => void;
  /** The operator's own message this turn: ticket writes run only when it asks for one. */
  request?: string;
  /** Re-reads the plan from the server (useBilling().refresh), for self-repair. */
  refreshPlan?: () => Promise<void>;
  /** The plan tier the app holds now, for self-repair. */
  tier?: () => string;
  /** The organization in use, whose watched accounts self-repair checks. */
  organizationId?: string | null;
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
  /** The result in sentences, for NOSHX Core; the ledger readers are composed in core/engine.ts. */
  compose?: (value: unknown) => string;
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
    name: "search_noshashi",
    description:
      "Search NOSHASHI's own pages and help: every app screen and button, features, plans and prices, the Learn course and word list, docs (API, webhooks, receipts, policies, security, enterprise), trust, legal and privacy. Use it for any question about the product, what a customer should use, or how NOSHASHI handles compliance. Returns passages with their page address.",
    input_schema: schema({ query: { type: "string", description: "What to look up, in plain words" } }),
    feature: null,
    screen: "NOSHASHI pages",
    run: async (input) => {
      const query = String(input.query ?? "").trim();
      if (!query) throw new ToolInputError("query is empty.");
      const hits = await searchKnowledge(query, 6);
      if (hits.length === 0) return "Nothing in NOSHASHI's pages matches that. Say so rather than guess.";
      return hits.map((hit) => ({ title: hit.title, source: hit.source, text: hit.text }));
    },
  },
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
    run: async (input, context) => {
      const target = address(input);
      const free = !context.has("portfolios");
      if (free && !context.spendFreeCheck()) {
        throw new ToolInputError("This month's 10 free address checks are used up. Pro includes unlimited checks.");
      }
      const report = await checkCounterparty(target);
      // No ledger reply at all: a failed read, not a finding about the
      // address. Saying anything about it (such as "does not exist") would
      // be a claim the ledger never made, and it should not cost a check.
      if (report.verdict === "unknown" && !report.exists && report.findings.length === 0) {
        if (free) context.refundFreeCheck?.();
        throw new Error("The ledger could not be reached, so nothing about this address is known yet. Try again in a moment.");
      }
      return report;
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
  {
    name: "security_check",
    description:
      "How hard an XRP Ledger account is to take over: who can sign (master key, regular key, signer list and its real quorum), recent key and settings changes, address-poisoning attempts against it, the doors strangers can use (NFT offers, checks, payment channels), a 0–100 score, and an unsigned hardening plan to sign in the owner's own wallet.",
    input_schema: schema({ address: addr("The account to check, r…") }),
    feature: null,
    screen: "Security Center",
    run: async (input) => {
      const posture = await readSecurityPosture(address(input));
      return { posture: { ...posture, events: posture.events.slice(0, 10) }, assessment: assessSecurity(posture) };
    },
  },
  {
    name: "investigate_hack",
    description:
      "For an account that was drained or hacked: the key changes before it, the stolen value followed hop by hop (payments and AccountDelete sweeps, past the dust), what became of every account it reached, and every recovery path that exists. Validated XRP Ledger transactions cannot be reversed; this says which off-ledger paths apply.",
    input_schema: schema(
      {
        address: addr("The drained account, r…"),
        from_ledger: { type: "number", description: "Ledger the incident began at, if known" },
      },
      ["address"]
    ),
    feature: "incident_response",
    screen: "Security Center › Incident Response",
    run: async (input, context) => {
      const root = address(input);
      const posture = await readSecurityPosture(root, 400);
      const given = Number(input.from_ledger);
      const keyChange = [...posture.events].reverse().find((e) => e.kind === "regular_key_set" || e.kind === "signer_list_set");
      const since = Number.isInteger(given) && given > 0 ? given : keyChange?.ledger ?? Math.max(1, posture.ledgerIndex - 21_600 * 30);
      const limits = context.has("forensic_trace") ? TRACE_LIMITS.deep : TRACE_LIMITS.standard;
      const trace = await traceFunds(root, { sinceLedger: since, depth: limits.depth, perAccount: limits.perAccount });
      return {
        signals: takeoverSignals(root, posture.events, trace.flows),
        trace: { ...trace, flows: trace.flows.slice(0, 40) },
        options: recoveryOptions(trace, { stillHoldsXrp: posture.exists ? posture.balanceXrp : 0, keyEvents: posture.events }),
      };
    },
  },
  {
    name: "explain_transaction",
    description:
      "Before signing: what a transaction really does, from its JSON or the hex blob a site asks you to sign. Decoded locally. Flags new regular keys and signer lists, disabled master keys, AccountDelete, NFTs sold for nothing, partial payments, sanctioned destinations, high fees and links in memos, with a verdict: SAFE-LOOKING, CAREFUL or DO NOT SIGN.",
    input_schema: schema({ transaction: { type: "string", description: "The transaction JSON, or its hex blob" } }),
    feature: null,
    screen: "Security Center › Pre-sign check",
    run: async (input) => {
      const { tx, format } = await parseTransaction(String(input.transaction ?? ""));
      const listed = await sanctionsFor(addressesIn(tx));
      return explainTransaction(tx, format, { sanctioned: listed?.hits });
    },
    compose: (value) => {
      const r = value as SignExplanation;
      return [
        `${r.verdict}. ${r.summary.join(" ")}`,
        ...r.flags.map((f) => `${f.severity === "danger" ? "✕" : f.severity === "warn" ? "!" : "·"} ${f.text}`),
        "NOSHASHI never signs: if you go ahead, sign it in your own wallet.",
      ].join("\n");
    },
  },
  {
    name: "find_stuck_funds",
    description:
      "XRP an account can get back: matured escrows waiting to be finished, expired escrows and payment channels that return when closed, checks written to it and never cashed, and owner reserve locked by old trust lines, orders, NFT offers, preauthorisations and tickets. Each with the unsigned transaction that releases it, and what AccountDelete would return.",
    input_schema: schema({ address: addr("The account to scan, r…") }),
    feature: null,
    screen: "Security Center › Recover funds",
    run: async (input) => {
      const h = await readHoldings(address(input));
      return recoveryFrom(h, await resolveEscrowSequences(h));
    },
    compose: (value) => {
      const r = value as RecoveryReport;
      if (!r.exists) return `There is no account at ${r.address}.`;
      const xrp = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;
      return [
        `Recovery scan of ${r.address} at ledger ${r.ledgerIndex.toLocaleString("en-US")}: ${xrp(r.recoverableNowXrp)} recoverable now, ${xrp(r.optionalReserveXrp)} of reserve you could free by removing objects you no longer need${r.laterXrp ? `, ${xrp(r.laterXrp)} arriving later` : ""}. Balance ${xrp(r.balanceXrp)}, of which ${xrp(r.lockedXrp)} is locked as reserve.`,
        ...r.items.slice(0, 12).map((i) => `[${i.when.toUpperCase()}] ${i.title}. ${i.detail}${i.tx ? ` Transaction: ${JSON.stringify(i.tx)}` : ""}`),
        r.items.length > 12 ? `…and ${r.items.length - 12} more in SECURITY CENTER › RECOVER FUNDS.` : "",
        r.deletion.possible ? `Closing the account with AccountDelete would return ${xrp(r.deletion.returnsXrp)} to an account you own.` : `AccountDelete is blocked by: ${r.deletion.blockers.join(", ")}.`,
        "Every transaction is unsigned: review and sign it in your own wallet.",
      ].filter(Boolean).join("\n");
    },
  },
  {
    name: "audit_exposure",
    description:
      "The XRP Ledger's 'revoke approvals': every standing permission that lets someone else take value from an account (checks it wrote, NFT sell offers including zero-price giveaways, funded payment channels, open orders, preauthorisations, regular key, signers, NFT minter, Default Ripple on a non-issuer), each with the unsigned revoking transaction.",
    input_schema: schema({ address: addr("The account to audit, r…") }),
    feature: null,
    screen: "Security Center › Exposure audit",
    run: async (input) => exposureFrom(await readHoldings(address(input))),
    compose: (value) => {
      const r = value as ExposureReport;
      if (!r.exists) return `There is no account at ${r.address}.`;
      if (!r.exposures.length) return `Exposure audit of ${r.address} at ledger ${r.ledgerIndex.toLocaleString("en-US")}: nothing open. No one else can take value from it.`;
      return [
        `Exposure audit of ${r.address} at ledger ${r.ledgerIndex.toLocaleString("en-US")}: ${r.exposures.length} open permission${r.exposures.length === 1 ? "" : "s"}${r.atRiskXrp ? `, up to ${r.atRiskXrp.toLocaleString("en-US")} XRP others could take` : ""}.`,
        ...r.exposures.slice(0, 12).map((e) => `[${e.risk.toUpperCase()}] ${e.title}. ${e.detail}${e.revoke ? ` Revoke: ${JSON.stringify(e.revoke)}` : ""}`),
        "Revoking transactions are unsigned: sign them in your own wallet.",
      ].join("\n");
    },
  },
  {
    name: "asset_inventory",
    description:
      "Everything an account holds besides XRP: tokens, AMM LP shares, NFTs and value in open orders. On Pro and above each is valued in XRP at the live best bid, AMM spot price or pool share.",
    input_schema: schema({ address: addr("The account, r…") }),
    feature: null,
    screen: "Security Center › Recover funds",
    run: async (input, context) => {
      const inventory = inventoryFrom(await readHoldings(address(input)));
      return context.has("asset_recovery") ? priceInventory(inventory) : inventory;
    },
    compose: (value) => {
      const r = value as Inventory;
      if (!r.exists) return `There is no account at ${r.address}.`;
      if (!r.items.length) return `${r.address} holds ${r.xrpBalance.toLocaleString("en-US")} XRP and nothing else.`;
      return [
        `${r.address} holds ${r.xrpBalance.toLocaleString("en-US")} XRP and ${r.items.length} other holding${r.items.length === 1 ? "" : "s"}${r.priced ? `, worth about ${r.valuedXrp.toLocaleString("en-US")} XRP at the best bid` : ""}:`,
        ...r.items.slice(0, 15).map((i) => `· ${i.label}${i.kind === "nft" ? "" : `: ${i.amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}`}${i.valueXrp !== null && r.priced ? ` ≈ ${i.valueXrp.toLocaleString("en-US")} XRP` : ""}${i.note ? ` (${i.note})` : ""}`),
        r.priced ? "A top-of-book price is an indication; selling a large balance moves it." : "Pro values each holding in XRP at the live best bid.",
      ].join("\n");
    },
  },
  {
    name: "deposit_help",
    description:
      "A deposit that 'never arrived', explained from its transaction hash: a failed payment (tecDST_TAG_NEEDED, tecNO_DST_INSUF_XRP…) moved nothing but its fee; one that reached an exchange without the right destination tag can be credited by the exchange, with a ready letter and its SHA-256; one sent to a private wallet can only be returned by its owner.",
    input_schema: schema(
      { hash: addr("The transaction hash, 64 hexadecimal characters"), expected_tag: { type: "number", description: "The destination tag the person should have used, if known" } },
      ["hash"]
    ),
    feature: null,
    screen: "Security Center › Deposit help",
    run: (input) => {
      const tag = Number(input.expected_tag);
      return checkDeposit(hash64(input, "hash"), Number.isInteger(tag) ? tag : null);
    },
    compose: (value) => {
      const r = value as DepositDiagnosis;
      return [
        `${r.headline}.`,
        r.explanation,
        r.steps.length ? r.steps.map((s, i) => `${i + 1}. ${s}`).join("\n") : "",
        r.letter ? `The letter to send the service (SHA-256 ${r.letter.sha256.slice(0, 16)}…) is in SECURITY CENTER › DEPOSIT HELP:\n${r.letter.text}` : "",
      ].filter(Boolean).join("\n");
    },
  },
  {
    name: "verify_domain",
    description:
      "Whether an account's claimed Domain is real: the domain must list the account back in https://<domain>/.well-known/xrp-ledger.toml. Given a domain instead, which accounts it vouches for and whether each names it back. Catches accounts impersonating exchanges and issuers.",
    input_schema: schema({ address: addr("An account, r… (or leave empty and give domain)"), domain: { type: "string", description: "A domain such as example.com" } }, []),
    feature: null,
    screen: "Security Center › Domain check",
    run: (input) => {
      const a = String(input.address ?? "").trim();
      if (ADDRESS.test(a)) return verifyDomain({ address: a });
      const d = String(input.domain ?? "").trim();
      if (!d) throw new ToolInputError("Give an address or a domain.");
      return verifyDomain({ domain: d });
    },
    compose: (value) => {
      const r = value as { check: DomainCheck; accounts?: DomainAccount[] };
      return [
        `${r.check.status.replace("_", " ").toUpperCase()}: ${r.check.detail}`,
        ...(r.accounts ?? []).map((a) => `· ${a.address}: ${a.exists === false ? "does not exist" : a.points_back ? "names the domain back" : `does not name it (${a.domain ?? "no domain"})`}`),
      ].join("\n");
    },
  },
  {
    name: "map_cluster",
    description:
      "From one scam or drainer account, the other accounts the same operation runs: who funded it, accounts it created, where it swept on AccountDelete, shared vanity endings and memos. Services end a branch. Two hops and 40 accounts; four hops and 200 on Enterprise.",
    input_schema: schema({ address: addr("A known scam account, r…") }),
    feature: "asset_recovery",
    screen: "Security Center › Scam clusters",
    run: (input, context) => mapCluster(address(input), context.has("forensic_trace") ? CLUSTER_LIMITS.deep : CLUSTER_LIMITS.standard),
    compose: (value) => {
      const c = value as Cluster;
      return [
        `Cluster around ${c.seed}: ${c.nodes.length} accounts, ${c.links.length} links${c.capped ? " (capped)" : ""}.`,
        ...c.links.slice(0, 12).map((l) => `· ${l.kind === "funded" ? "funded" : "swept (AccountDelete)"} ${l.from} → ${l.to}, ${l.xrp} XRP (${l.hash.slice(0, 12)}…)`),
        ...c.vanity.map((v) => `${v.accounts.length} accounts end in "${v.ending}": a generated vanity series.`),
        ...c.sharedMemos.map((m) => `${m.accounts.length} accounts sent the memo "${m.text.slice(0, 80)}".`),
        ...c.nodes.filter((n) => n.sanction).map((n) => `${n.address} is on the OFAC SDN list (${n.sanction!.entityName}).`),
        "Save the report or open a case from SECURITY CENTER › SCAM CLUSTERS.",
      ].join("\n");
    },
  },
  {
    name: "drainer_check",
    description:
      "Whether an account is being drained right now, from its latest transactions: keys changed and then value out, a spray of dust payments followed by an AccountDelete, a zero-price NFT offer taken by someone else, or a check cashed at once. Each pattern names its transactions.",
    input_schema: schema({ address: addr("The account, r…") }),
    feature: null,
    screen: "Security Center › Emergency kit",
    run: (input) => readDrainerPatterns(address(input)),
    compose: (value) => {
      const r = value as { patterns: DrainerPattern[]; transactions: number };
      if (!r.patterns.length) return `No drainer pattern in the last ${r.transactions} transactions.`;
      return [
        ...r.patterns.map((p) => `[${p.id.replace(/_/g, " ").toUpperCase()}] ${p.title}. ${p.detail} Evidence: ${p.evidence.map((h) => h.slice(0, 12) + "…").join(", ")}`),
        "If the account is yours and a pattern is live, prepare the EMERGENCY KIT in the Security Center now.",
      ].join("\n");
    },
  },
  {
    name: "emergency_kit",
    description:
      "For a compromised account: the ordered, unsigned transactions that save the most: cancel what others can pull (NFT sell offers, checks), move every token and the spendable XRP to a cold account (or AccountDelete when nothing blocks it), then hand signing to a new key.",
    input_schema: schema({ address: addr("The compromised account, r…"), cold: addr("A cold account the owner controls, r…") }),
    feature: null,
    screen: "Security Center › Emergency kit",
    run: async (input) => emergencyKit(await readHoldings(address(input)), { cold: address(input, "cold") }),
    compose: (value) => {
      const k = value as EmergencyKit;
      return [
        `Emergency kit for ${k.address} → ${k.cold}: ${k.steps.length} step${k.steps.length === 1 ? "" : "s"}${k.sweepsEverything ? ", sweeping everything in one AccountDelete" : ""}.`,
        ...k.steps.map((s) => `${s.order}. ${s.title}. ${s.why}${s.caution ? ` Caution: ${s.caution}` : ""} Transaction: ${JSON.stringify(s.tx)}`),
        ...k.notes,
        "NOSHASHI never signs: sign each step in your own wallet, in order.",
      ].join("\n");
    },
  },
  {
    name: "who_is",
    description:
      "Who runs an address: a domain that vouches for it in its xrp-ledger.toml, a domain it merely claims, or the behaviour of an exchange or other service pooling customers' funds (required destination tags). With what to do next, for a theft victim asking an exchange to freeze a deposit.",
    input_schema: schema({ address: addr("The address, r…") }),
    feature: null,
    screen: "Security Center › Who is this?",
    run: (input) => attribute(address(input)),
    compose: (value) => {
      const a = value as Attribution;
      return [`${a.address}: ${a.name ?? "unnamed"} (${a.kind.replace(/_/g, " ")}, ${a.confidence}).`, ...a.evidence.map((e) => `· ${e}`), a.advice].join("\n");
    },
  },
  {
    name: "scam_registry",
    description:
      "Whether addresses are in the shared scam registry: reports filed by institutions with transaction evidence and confirmed by a NOSHASHI reviewer who did not file them. Categories, how many organizations and since when; never who reported.",
    input_schema: schema({ address: addr("The address, r…") }),
    feature: null,
    screen: "Security Center › Scam registry",
    run: async (input) => {
      const a = address(input);
      const hits = await threatsFor([a]);
      if (hits === null) throw new Error("The scam registry could not be reached.");
      return { address: a, hit: hits[a] ?? null };
    },
    compose: (value) => {
      const r = value as { address: string; hit: ThreatHit | null };
      return r.hit
        ? `${r.address} is in the scam registry: ${r.hit.categories.join(", ")}, confirmed in ${r.hit.reports} report${r.hit.reports === 1 ? "" : "s"} since ${r.hit.firstConfirmed.slice(0, 10)}.`
        : `${r.address} has no confirmed report in the scam registry. That is not a clearance.`;
    },
  },
  {
    name: "check_link",
    description:
      "Whether a domain or link has been advertised in XRP dust on the ledger, the way wallet drainers spread their sites: how many accounts it was sent to, by how many senders, when, and a sample memo. Read from a validated ledger every minute.",
    input_schema: schema({ domain: addr("A domain or link, e.g. example.com") }),
    feature: null,
    screen: "Security Center › Scam registry",
    run: (input) => checkPhishingLink(String(input.domain ?? "")),
    compose: (value) => {
      const r = value as PhishingCheck;
      const top = r.sightings[0];
      return [
        r.listed ? `${r.domain} has been sprayed in XRP dust to many accounts: treat it as a phishing site.` : r.seen ? `${r.domain} has appeared in XRP dust memos.` : `${r.domain} has not been seen in XRP dust memos.`,
        top ? `Sent to ${top.recipients} account${top.recipients === 1 ? "" : "s"} by ${top.senders}, last ${top.last_seen.slice(0, 16).replace("T", " ")}: "${top.sample_memo.slice(0, 120)}".` : "",
        r.note,
      ].filter(Boolean).join("\n");
    },
  },
  {
    name: "screen_withdrawal",
    description:
      "Screen an outbound payment before it is signed: will it bounce (missing destination tag, unfunded destination, deposit authorisation), is the destination brand new or hours old, is it OFAC-listed or in the scam registry up to three funding hops back.",
    input_schema: schema({ destination: addr("The destination, r…"), destination_tag: { type: "number", description: "The destination tag, if any" }, amount_xrp: { type: "number", description: "The amount in XRP, if known" } }, ["destination"]),
    feature: "withdrawal_screening",
    screen: "Security Center › Withdrawals",
    run: (input) => {
      const tag = Number(input.destination_tag);
      const amount = Number(input.amount_xrp);
      return screenWithdrawalLive({ destination: address(input, "destination"), destinationTag: Number.isInteger(tag) ? tag : null, amountXrp: Number.isFinite(amount) && amount > 0 ? amount : null, previousDestinations: [], ownAddresses: [] });
    },
    compose: (value) => {
      const r = value as WithdrawalResult;
      return [
        `${r.verdict.toUpperCase()} at validated ledger ${r.ledger.toLocaleString("en-US")}.`,
        ...(r.unchecked.length ? [`Not checked: ${r.unchecked.join(" and ")} could not be reached.`] : []),
        ...r.findings.map((f) => `[${f.severity.toUpperCase()}] ${f.title}. ${f.detail}`),
      ].join("\n");
    },
  },
  {
    name: "surveil_market",
    description:
      "A token issuer's recent order-book history read for manipulation indicators: accounts placing and replacing orders that never fill, one account supplying most of the activity, and trades between accounts funded by the same account. Indicators with numbers, not verdicts.",
    input_schema: schema({ issuer: addr("The token issuer, r…") }),
    feature: "market_surveillance",
    screen: "Security Center › Surveillance",
    run: (input) => surveilIssuer(address(input, "issuer")),
    compose: (value) => {
      const r = value as SurveillanceReport;
      return [
        `${r.transactions} transactions of ${r.issuer}, ledgers ${r.ledgers.from.toLocaleString("en-US")}–${r.ledgers.to.toLocaleString("en-US")}, ${r.fills.length} trade${r.fills.length === 1 ? "" : "s"}.`,
        ...r.findings.map((f) => `[${f.severity.toUpperCase()}] ${f.title}. ${f.detail}`),
      ].join("\n");
    },
  },
];

/**
 * Adds tools that only the desktop app carries (the support tools in
 * ./ticketTools.ts), so the website's NOSHX build never bundles them.
 */
export function registerTools(tools: NoshxTool[]) {
  for (const tool of tools) if (!NOSHX_TOOLS.some((t) => t.name === tool.name)) NOSHX_TOOLS.push(tool);
}

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

export type RawToolResult = { ok: true; value: unknown } | { ok: false; error: string; gated?: boolean };

/** Run one tool and keep its full report (NOSHX Core composes from it). */
export async function runToolRaw(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<RawToolResult> {
  const tool = findTool(name);
  if (!tool) return { ok: false, error: `No tool named ${name}.` };
  if (tool.feature && !context.has(tool.feature)) {
    return { ok: false, gated: true, error: `${tool.screen} needs a Pro plan or higher.` };
  }
  try {
    return { ok: true, value: await tool.run(input ?? {}, context) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The read failed." };
  }
}

/** Run one tool call; failures come back as text for the model, never as a throw. */
export async function runTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<{ ok: boolean; content: string }> {
  const result = await runToolRaw(name, input, context);
  if (result.ok) return { ok: true, content: compactResult(result.value) };
  return {
    ok: false,
    content: result.gated
      ? `${result.error} Tell the operator it is available after upgrading in Pricing; do not guess the answer.`
      : result.error,
  };
}
