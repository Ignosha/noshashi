import { rpc } from "@/lib/xrpl/client";
import { verifyDomain, type DomainCheck } from "./domain";
import { taggedShareOf } from "./depositHelp";

/**
 * Exchange attribution — who is behind an address.
 *
 * A victim whose stolen XRP reached an exchange needs to know which
 * exchange to ask for a freeze. An exchange's deposit address usually says
 * so, if read carefully:
 *
 *   verified    the account's Domain names a website, and that website's
 *               xrp-ledger.toml lists the account back
 *   claimed     the Domain names a website that does not list it back (or
 *               publishes no file): a lead, and possibly an impersonation
 *   behaviour   no usable domain, but the account requires destination tags
 *               or most payments into it carry one: a service that pools
 *               customers' funds, name unknown
 *
 * Every conclusion lists the facts it rests on.
 */

type Json = Record<string, any>;

export type Attribution = {
  address: string;
  kind: "custodial_service" | "issuer" | "personal_or_unknown" | "not_found";
  name: string | null;
  confidence: "verified" | "claimed" | "behaviour" | "none";
  evidence: string[];
  /** What to do with it, for a theft victim. */
  advice: string;
};

const hexText = (hex: unknown) =>
  typeof hex === "string" && /^([0-9A-Fa-f]{2})+$/.test(hex) ? new TextDecoder().decode(new Uint8Array((hex.match(/../g) ?? []).map((b) => parseInt(b, 16)))) : null;

/** Attribute from what was read. Pure. */
export function attributeFrom(address: string, info: Json | null, history: Json[], domain: DomainCheck | null, obligations = 0): Attribution {
  const data = (info?.account_data ?? null) as Json | null;
  if (!data) return { address, kind: "not_found", name: null, confidence: "none", evidence: ["No account exists at this address."], advice: "Nothing is held here now. If value passed through, follow where it went in Incident Response." };
  const evidence: string[] = [];
  const requiresTag = (Number(data.Flags ?? 0) & 0x00020000) !== 0;
  const share = taggedShareOf(address, history);
  if (requiresTag) evidence.push("It requires a destination tag on every incoming payment.");
  if (share !== null) evidence.push(`${Math.round(share * 100)}% of the incoming payments read carried a destination tag.`);
  if (obligations > 0) evidence.push("It has issued tokens other accounts hold.");
  const claimed = hexText(data.Domain);
  if (claimed) evidence.push(`Its Domain field names ${claimed}.`);
  if (domain) evidence.push(domain.detail);

  const pooled = requiresTag || (share ?? 0) >= 0.5;
  const kind: Attribution["kind"] = pooled ? "custodial_service" : obligations > 0 ? "issuer" : "personal_or_unknown";
  if (domain?.status === "verified") {
    return {
      address,
      kind,
      name: domain.domain,
      confidence: "verified",
      evidence,
      advice: kind === "custodial_service" ? `Contact ${domain.domain} through the support pages on its own website, with the transaction hashes and destination tags, and ask it to freeze the deposit. A police report number makes it act faster.` : `${domain.domain} vouches for this account.`,
    };
  }
  if (claimed) {
    return {
      address,
      kind,
      name: claimed,
      confidence: "claimed",
      evidence,
      advice: `The account claims ${claimed}, but the site does not confirm it. Contact ${claimed} through its own website, never through a link found on the ledger, and say the claim is unverified.`,
    };
  }
  if (pooled) {
    return { address, kind, name: null, confidence: "behaviour", evidence, advice: "A service pooling customers' funds, which does not name itself. Law enforcement can ask the major exchanges to identify it; include the tags and hashes." };
  }
  return { address, kind, name: null, confidence: "none", evidence: evidence.length ? evidence : ["Nothing on the ledger identifies who controls it."], advice: "Nothing identifies the owner. Only the key holder can move what it holds." };
}

/** Read an address and attribute it live. */
export async function attribute(address: string): Promise<Attribution> {
  const info = await rpc("account_info", { account: address, ledger_index: "validated" }).catch((e: unknown) => {
    if (/actNotFound|not found/i.test(e instanceof Error ? e.message : String(e))) return null;
    throw e;
  });
  if (!info) return attributeFrom(address, null, [], null);
  const [history, domain, gateway] = await Promise.all([
    rpc("account_tx", { account: address, ledger_index_min: -1, ledger_index_max: -1, forward: false, limit: 100 }).catch(() => ({ transactions: [] })),
    hexText(info.account_data?.Domain) ? verifyDomain({ address }).then((r) => r.check).catch(() => null) : Promise.resolve(null),
    rpc("gateway_balances", { account: address, ledger_index: "validated" }).catch(() => null),
  ]);
  const obligations = Object.values((gateway?.obligations ?? {}) as Record<string, string>).reduce((n, v) => n + (Number(v) || 0), 0);
  return attributeFrom(address, info, (history.transactions ?? []) as Json[], domain, obligations);
}
