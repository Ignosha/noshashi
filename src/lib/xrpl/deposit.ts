/**
 * Deposit screening and XRPL events, for the console.
 *
 * The rules live in one file shared with the server watcher
 * (supabase/functions/_shared/xrplEvents.ts), so a deposit screened in
 * the console and the same deposit screened by the watcher get the same
 * verdict. This module adds the ledger reads the console needs to screen
 * one transaction on demand.
 */
import { rpc } from "./client";
import { sanctionsFor } from "./sanctions";
import {
  activationOf,
  classifyTransaction,
  issuerFactsFrom,
  normalizeTx,
  screenDeposit,
  type DepositConfig,
  type FundingHop,
  type Screening,
  type XrplEvent,
} from "../../../supabase/functions/_shared/xrplEvents.ts";

export * from "../../../supabase/functions/_shared/xrplEvents.ts";

/** Funding hops read behind the sender: the sender, its funder, theirs. */
export const FUNDING_HOPS = 3;

type Reply = Record<string, any>;

async function firstTransactionOf(account: string): Promise<Reply | null> {
  const result = (await rpc("account_tx", { account, ledger_index_min: -1, ledger_index_max: -1, forward: true, limit: 1 })) as Reply;
  const list = (result.transactions ?? []) as Reply[];
  return list[0] ?? null;
}

/** Who created `account`, who created them, and so on, up to `hops` accounts. */
export async function fundingChain(account: string, hops = FUNDING_HOPS): Promise<FundingHop[]> {
  const chain: FundingHop[] = [];
  let next: string | null = account;
  const seen = new Set<string>();
  while (next && chain.length < hops && !seen.has(next)) {
    seen.add(next);
    let hop: FundingHop;
    try {
      hop = activationOf(next, await firstTransactionOf(next));
    } catch {
      hop = { account: next, fundedBy: null, activatedLedger: null };
    }
    chain.push(hop);
    next = hop.fundedBy;
  }
  return chain;
}

export type OnDemandScreening = {
  event: XrplEvent;
  screening: Screening;
  chain: FundingHop[];
  ledger: number;
};

/**
 * Screen one incoming payment, read live: the transaction, the issuer of
 * what it delivered, and the sender's funding chain. `depositAddress` is
 * the account the payment was meant for.
 */
export async function screenTransaction(
  hash: string,
  depositAddress: string,
  config: DepositConfig,
  knownAddresses: string[] = []
): Promise<OnDemandScreening> {
  const { tx, meta, ledgerIndex } = normalizeTx((await rpc("tx", { transaction: hash })) as Reply);
  if (tx.TransactionType !== "Payment") throw new Error(`That is a ${tx.TransactionType ?? "unknown"} transaction, not a payment.`);
  if (tx.Destination !== depositAddress) throw new Error(`That payment went to ${tx.Destination}, not to ${depositAddress}.`);
  const [event] = classifyTransaction(tx, meta, depositAddress, ledgerIndex);
  const delivered = (event.data as { delivered?: { issuer: string | null; currency: string } | null }).delivered;
  const [ledger, issuer, chain] = await Promise.all([
    rpc("ledger", { ledger_index: "validated" }).then((r) => Number((r as Reply).ledger_index ?? (r as Reply).ledger?.ledger_index)),
    delivered?.issuer
      ? Promise.all([
          rpc("account_info", { account: delivered.issuer, ledger_index: "validated" }).catch(() => null),
          rpc("gateway_balances", { account: delivered.issuer, ledger_index: "validated" }).catch(() => null),
        ]).then(([info, balances]) => issuerFactsFrom(info as Reply | null, balances as Reply | null, delivered.currency))
      : Promise.resolve(null),
    fundingChain(String(tx.Account)),
  ]);
  const listed = await sanctionsFor(chain.map((h) => h.account));
  const screening = screenDeposit({ event, config, issuer, chain, currentLedger: ledger, sanctions: listed?.hits ?? {}, knownAddresses: [depositAddress, ...knownAddresses] });
  if (listed === null) {
    // Never screened as if the list had been read.
    screening.findings.push({ id: "sanctions_unchecked", severity: "warn", title: "The sanctions list could not be checked", detail: "The OFAC SDN lookup did not answer, so whether the sender or its funders are listed is unknown. Screen it again before crediting." });
    if (screening.verdict === "clear") screening.verdict = "review";
  }
  return { event, screening, chain, ledger };
}
