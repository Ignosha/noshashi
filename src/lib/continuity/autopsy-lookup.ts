import { rpc } from "../xrpl/client";
import { normalizeAutopsy, type AutopsyReport } from "./autopsy";

/**
 * Read-only XRPL mainnet lookup. No signing, custody, or transaction submission.
 * Network and missing evidence failures always produce UNKNOWN.
 * Caller must enforce request quotas and authentication before public exposure.
 */
export async function lookupTransactionAutopsy(
  hash: string,
  request: (command: string, params: Record<string, unknown>) => Promise<Record<string, unknown>> = rpc,
): Promise<AutopsyReport> {
  // Validate before any network call.
  const empty = normalizeAutopsy(hash, null);
  try {
    const response = await request("tx", { transaction: empty.hash, binary: false });
    return normalizeAutopsy(hash, response);
  } catch {
    return empty;
  }
}
