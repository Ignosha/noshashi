import { FUNCTIONS_URL } from "@/lib/supabase/project";
import type { DomainCheck } from "../../../supabase/functions/_shared/xrplEvents.ts";

export type { DomainCheck };

/**
 * Domain impersonation check. An account's Domain field is a claim anyone
 * can make; it is proven only when that domain lists the account back in
 * its /.well-known/xrp-ledger.toml. The file lives on the claimed website,
 * which the app's content security policy does not let it fetch, so the
 * read runs server-side in noshashi-xrpl-watch/domain-verify (public, no
 * key). The rules are in supabase/functions/_shared/xrplEvents.ts.
 */

export type DomainAccount = { address: string; exists: boolean | null; domain: string | null; points_back: boolean | null };

export async function verifyDomain(query: { address: string } | { domain: string }): Promise<{ check: DomainCheck; accounts?: DomainAccount[] }> {
  const q = "address" in query ? `address=${encodeURIComponent(query.address)}` : `domain=${encodeURIComponent(query.domain)}`;
  const response = await fetch(`${FUNCTIONS_URL}/noshashi-xrpl-watch/domain-verify?${q}`, { signal: AbortSignal.timeout(20_000) });
  const body = (await response.json().catch(() => ({}))) as { check?: DomainCheck; accounts?: DomainAccount[]; message?: string };
  if (!response.ok || !body.check) throw new Error(body.message ?? `The domain check failed (HTTP ${response.status}).`);
  return { check: body.check, accounts: body.accounts };
}
