import { useCallback, useEffect, useState } from "react";
import { fetchIssuerPosture, fetchTrustLines } from "@/lib/xrpl/client";
import type { IssuerPosture, TrustLine } from "@/lib/xrpl/types";
import { analyseIssuers, type IssuerExposure } from "./risk";

/**
 * Reads every issued-currency position an account holds, then reads each
 * distinct issuer's own account flags. The second read is the point: a
 * balance tells you what you have, the issuer's flags tell you whether
 * you are actually allowed to keep it.
 */
export function useIssuerRisk(address: string | undefined) {
  const [lines, setLines] = useState<TrustLine[]>([]);
  const [exposures, setExposures] = useState<IssuerExposure[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) {
      setLines([]);
      setExposures([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const trustLines = await fetchTrustLines(address);
      setLines(trustLines);

      // One read per distinct issuer that actually holds a balance.
      const issuers = [
        ...new Set(
          trustLines.filter((line) => line.balance > 0).map((line) => line.issuer)
        ),
      ];
      const postures = new Map<string, IssuerPosture>();
      for (const issuer of issuers.slice(0, 25)) {
        postures.set(issuer, await fetchIssuerPosture(issuer));
      }

      setExposures(analyseIssuers(trustLines, postures));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read trust lines");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void load();
  }, [load]);

  return { lines, exposures, loading, error, reload: load };
}
