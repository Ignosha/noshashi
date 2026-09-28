import { FUNCTIONS_URL } from "@/lib/supabase/project";
import type { SanctionEntry } from "../../../supabase/functions/_shared/xrplEvents.ts";

export type { SanctionEntry };

/**
 * Sanctioned XRP Ledger addresses: the US Treasury's OFAC SDN list,
 * read every day from treasury.gov into noshashi.sanctioned_addresses
 * (supabase/migrations/20260928100000_sanctions_and_embeds.sql).
 *
 * Looked up through noshashi-xrpl-watch/sanctions, which needs no account,
 * so the free address check, the website and the widget all ask the same
 * list. A lookup that fails says so (null); it is never read as "not
 * listed".
 */

export type SanctionsResult = {
  /** Listed addresses among those asked about. */
  hits: Record<string, SanctionEntry>;
  /** When the list was last read from the source; null if it never has been. */
  listAsOf: string | null;
  /** How many addresses the list holds now. */
  listed: number;
};

const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

export async function sanctionsFor(addresses: string[], signal?: AbortSignal): Promise<SanctionsResult | null> {
  const wanted = [...new Set(addresses.filter((a) => ADDRESS.test(a)))].slice(0, 50);
  if (wanted.length === 0) return { hits: {}, listAsOf: null, listed: 0 };
  try {
    const response = await fetch(`${FUNCTIONS_URL}/noshashi-xrpl-watch/sanctions?addresses=${wanted.join(",")}`, {
      signal: signal ?? AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { hits?: SanctionEntry[]; list_as_of?: string | null; listed?: number };
    const hits: Record<string, SanctionEntry> = {};
    for (const hit of body.hits ?? []) if (ADDRESS.test(hit.address)) hits[hit.address] = hit;
    return { hits, listAsOf: body.list_as_of ?? null, listed: Number(body.listed ?? 0) };
  } catch {
    return null;
  }
}
