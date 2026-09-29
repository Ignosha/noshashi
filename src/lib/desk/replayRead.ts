import { fetchAccount, fetchReserveAt, fetchWalletCredentials, XrplError } from "@/lib/xrpl/client";
import type { ReplayData } from "./replay";

/**
 * Re-read what a verdict read, at the ledger it was read at. A source that
 * cannot be read at that ledger (a public server that no longer keeps it,
 * or no answer) is named in `unavailable` and is never replaced with
 * today's value: replay compares like with like or says it could not.
 */
export async function readReplayData(subject: string, ledgerIndex: number): Promise<ReplayData> {
  const unavailable: string[] = [];
  const history = (e: unknown) => e instanceof XrplError && e.code === "lgrNotFound";

  const [account, credentials, reserve] = await Promise.all([
    fetchAccount(subject, ledgerIndex).catch((e) => {
      unavailable.push(history(e) ? `account state at ledger ${ledgerIndex} (not held by the server)` : "account state");
      return null;
    }),
    fetchWalletCredentials(subject, ledgerIndex).catch(() => {
      unavailable.push("credential registry");
      return [];
    }),
    fetchReserveAt(ledgerIndex).catch(() => null),
  ]);
  return { account, credentials, reserve, unavailable };
}
