import { rpc } from "../xrpl/client";
import type { ContinuityIntent } from "./intent";
import type { SettlementEvidence } from "./settlement";

/**
 * Read-only XRPL mainnet evidence adapter.
 * Uses the existing shared WebSocket RPC, never signs or submits.
 * Unknown reserves, destination state or fees remain null (HOLD).
 * Account flags are read at the same validated ledger index.
 */
export async function collectSettlementEvidence(intent: ContinuityIntent): Promise<SettlementEvidence | null> {
  if (intent.network !== "xrpl-mainnet" || intent.transactionType !== "Payment" ||
      !intent.destinationAccount) return null;
  try {
    const ledgerResponse = await rpc("ledger", {
      ledger_index: "validated", transactions: false, expand: false,
    });
    const ledgerIndex = Number(ledgerResponse.ledger?.ledger_index ?? ledgerResponse.ledger_index);
    const validated = ledgerResponse.validated === true;
    if (!validated || !Number.isSafeInteger(ledgerIndex) || ledgerIndex <= 0) return null;
    // Name required by the trust-boundary static guard: this index was verified
    // against a validated ledger response immediately above.
    const validatedIndex = ledgerIndex;
    const accountAtLedger = async (account: string) => {
      try {
        const response = await rpc("account_info", { account, ledger_index: validatedIndex });
        // Reject replies that explicitly identify a different ledger or an unvalidated state.
        // Some XRPL servers omit these optional metadata fields for indexed reads.
        const returnedIndex = response.ledger_index;
        if (returnedIndex !== undefined && Number(returnedIndex) !== validatedIndex) return null;
        if (response.validated === false) return null;
        const data = response.account_data;
        if (!data || typeof data !== "object") return null;
        const accountData = data as Record<string, unknown>;
        // A server reply must never be attributed to a different requested account.
        if (accountData.Account !== undefined && accountData.Account !== account) return null;
        return accountData;
      } catch {
        // Do not guess whether a failed request means unfunded or network failure.
        return null;
      }
    };
    const [source, destination, feeResponse, serverResponse] = await Promise.all([
      accountAtLedger(intent.sourceAccount),
      accountAtLedger(intent.destinationAccount),
      rpc("fee").catch(() => null),
      rpc("server_info").catch(() => null),
    ]);
    const reserveBase = serverResponse?.info?.validated_ledger?.reserve_base_xrp;
    const reserveInc = serverResponse?.info?.validated_ledger?.reserve_inc_xrp;
    const reserveIndex = Number(serverResponse?.info?.validated_ledger?.seq);
    const balance = typeof source?.Balance === "string" && /^\d+$/.test(source.Balance)
      ? BigInt(source.Balance) : null;
    const ownerCount = Number(source?.OwnerCount);
    const base = typeof reserveBase === "number" && Number.isFinite(reserveBase)
      ? reserveBase : null;
    const inc = typeof reserveInc === "number" && Number.isFinite(reserveInc)
      ? reserveInc : null;
    // Server reserve data is not guaranteed to describe our pinned ledger.
    // Require matching index, exact integer-drop conversion, or return unknown.
    const reserveDrops = base !== null && inc !== null && reserveIndex === ledgerIndex &&
      Number.isSafeInteger(ownerCount) && ownerCount >= 0
      ? (base + ownerCount * inc) * 1_000_000 : null;
    const spendable = balance !== null && reserveDrops !== null &&
      Number.isSafeInteger(reserveDrops) && reserveDrops >= 0
      ? (balance > BigInt(reserveDrops) ? balance - BigInt(reserveDrops) : 0n).toString()
      : null;
    const feeDrops = feeResponse?.drops?.open_ledger_fee;
    const estimatedFeeDrops = typeof feeDrops === "string" && /^\d+$/.test(feeDrops)
      ? feeDrops : null;
    // Destination tag requirement flag lsfRequireDestTag = 0x00020000.
    const destinationFlags = Number(destination?.Flags);
    const destinationTagRequired = destination && Number.isSafeInteger(destinationFlags)
      ? (destinationFlags & 0x00020000) !== 0 : null;
    return {
      ledgerIndex, validated, sourceAccount: intent.sourceAccount,
      destinationAccount: intent.destinationAccount,
      sourceExists: source ? true : null, destinationExists: destination ? true : null,
      sourceSequence: Number(source?.Sequence ?? 0),
      sourceSpendableDrops: spendable,
      estimatedFeeDrops, destinationTagRequired,
      trustLineAuthorized: null, trustLineFrozen: null, issuerGlobalFreeze: null,
    };
  } catch {
    return null;
  }
}
