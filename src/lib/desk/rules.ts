import { useCallback, useEffect, useState } from "react";
import { readSetting, writeSetting } from "@/lib/store";

/**
 * The editable rule set.
 *
 * Until now the thresholds that decide a verdict were constants in the
 * source. An institution cannot accept that: its risk appetite is its
 * own, and a compliance officer has to be able to state — and change —
 * the number that produced a HOLD. These persist to disk and are applied
 * by every adjudication.
 */

export type RuleSet = {
  /** HHI above this concentrates the book enough to warrant a HOLD. 0–10,000. */
  hhiMaxBeforeHold: number;
  /** Single counterparty share, in percent, that alone triggers a HOLD. */
  counterpartyMaxSharePct: number;
  /** Travel Rule threshold in the operator's reporting currency. */
  travelRuleThresholdFiat: number;
  travelRuleCurrency: string;
  /** Reference rate; there is deliberately no price feed in this build. */
  xrpReferenceRate: number;
  /**
   * Strict mode treats an issuer that merely *retains* freeze rights as a
   * blocking failure, not an advisory one. Custodians tend to want this.
   */
  strictFreezeRights: boolean;
  /** Minimum spendable headroom above reserve, in XRP, before HOLD. */
  minReserveHeadroomXrp: number;
  /** Warn this many days before a credential expires. */
  credentialExpiryWarningDays: number;
};

export const DEFAULT_RULES: RuleSet = {
  hhiMaxBeforeHold: 2500,
  counterpartyMaxSharePct: 25,
  travelRuleThresholdFiat: 3000,
  travelRuleCurrency: "USD",
  xrpReferenceRate: 2.4,
  strictFreezeRights: false,
  minReserveHeadroomXrp: 10,
  credentialExpiryWarningDays: 30,
};

/** Guard against a hand-edited file putting nonsense into the engine. */
export function sanitiseRules(input: Partial<RuleSet>): RuleSet {
  const clamp = (value: unknown, min: number, max: number, fallback: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };

  return {
    hhiMaxBeforeHold: clamp(input.hhiMaxBeforeHold, 0, 10_000, DEFAULT_RULES.hhiMaxBeforeHold),
    counterpartyMaxSharePct: clamp(input.counterpartyMaxSharePct, 1, 100, DEFAULT_RULES.counterpartyMaxSharePct),
    travelRuleThresholdFiat: clamp(input.travelRuleThresholdFiat, 0, 1_000_000, DEFAULT_RULES.travelRuleThresholdFiat),
    travelRuleCurrency: String(input.travelRuleCurrency ?? DEFAULT_RULES.travelRuleCurrency).slice(0, 4).toUpperCase(),
    xrpReferenceRate: clamp(input.xrpReferenceRate, 0.0001, 10_000, DEFAULT_RULES.xrpReferenceRate),
    strictFreezeRights: Boolean(input.strictFreezeRights ?? DEFAULT_RULES.strictFreezeRights),
    minReserveHeadroomXrp: clamp(input.minReserveHeadroomXrp, 0, 1_000_000, DEFAULT_RULES.minReserveHeadroomXrp),
    credentialExpiryWarningDays: clamp(input.credentialExpiryWarningDays, 1, 365, DEFAULT_RULES.credentialExpiryWarningDays),
  };
}

const KEY = "engine.ruleset";

export function useRuleSet() {
  const [rules, setRules] = useState<RuleSet>(DEFAULT_RULES);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readSetting<Partial<RuleSet>>(KEY, DEFAULT_RULES).then((stored) => {
      if (cancelled) return;
      setRules(sanitiseRules(stored));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(<K extends keyof RuleSet>(key: K, value: RuleSet[K]) => {
    setRules((prev) => sanitiseRules({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    await writeSetting(KEY, rules);
    setDirty(false);
  }, [rules]);

  const reset = useCallback(() => {
    setRules(DEFAULT_RULES);
    setDirty(true);
  }, []);

  /** The rule set as a portable JSON document, for review or handover. */
  const asJson = useCallback(
    () => JSON.stringify({ version: 1, updated: new Date().toISOString(), rules }, null, 2),
    [rules]
  );

  const importJson = useCallback((raw: string) => {
    const parsed = JSON.parse(raw) as { rules?: Partial<RuleSet> };
    setRules(sanitiseRules(parsed.rules ?? (parsed as Partial<RuleSet>)));
    setDirty(true);
  }, []);

  return { rules, loaded, dirty, update, save, reset, asJson, importJson };
}
