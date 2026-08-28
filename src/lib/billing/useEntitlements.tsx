import { isDemo, DEMO_LOCKED, DEMO_UPGRADE_URL } from "@/lib/edition";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase, callFunction } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/useAuth";
import { PLANS, type PlanId } from "./catalog";
import { openExternal } from "@/lib/external";

export type Entitlement = {
  tier: PlanId;
  seats: number;
  features: string[];
  verificationQuota: number;
  validUntil: string | null;
};

export type SubscriptionRow = {
  tier: string;
  status: string;
  seats: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

const FREE: Entitlement = {
  tier: "operator",
  seats: 1,
  features: PLANS[0].grants,
  verificationQuota: 0,
  validUntil: null,
};

type BillingApi = {
  entitlement: Entitlement;
  subscription: SubscriptionRow | null;
  loading: boolean;
  error: string | null;
  /** The only question the UI should ask before showing a paid surface. */
  has: (feature: string) => boolean;
  refresh: () => Promise<void>;
  startCheckout: (priceId: string, seats?: number) => Promise<void>;
  openBillingPortal: () => Promise<void>;
};

const BillingContext = createContext<BillingApi | null>(null);

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [entitlement, setEntitlement] = useState<Entitlement>(FREE);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setEntitlement(FREE);
      setSubscription(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [entitlementResult, subscriptionResult] = await Promise.all([
        supabase()
          .schema("noshashi")
          .from("entitlements")
          .select("tier, seats, features, verification_quota, valid_until")
          .eq("account_id", user.id)
          .maybeSingle(),
        supabase()
          .schema("noshashi")
          .from("subscriptions")
          .select("tier, status, seats, current_period_end, cancel_at_period_end")
          .eq("account_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (entitlementResult.error) throw new Error(entitlementResult.error.message);

      const row = entitlementResult.data;
      // An expired entitlement is the free tier, whatever the row says.
      const expired =
        row?.valid_until && new Date(row.valid_until).getTime() < Date.now();

      setEntitlement(
        row && !expired
          ? {
              tier: (row.tier as PlanId) ?? "operator",
              seats: Number(row.seats ?? 1),
              features: (row.features as string[]) ?? FREE.features,
              verificationQuota: Number(row.verification_quota ?? 0),
              validUntil: row.valid_until as string | null,
            }
          : FREE
      );

      const sub = subscriptionResult.data;
      setSubscription(
        sub
          ? {
              tier: String(sub.tier),
              status: String(sub.status),
              seats: Number(sub.seats ?? 1),
              currentPeriodEnd: (sub.current_period_end as string) ?? null,
              cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
            }
          : null
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read entitlements");
      setEntitlement(FREE);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Checkout finishes in the browser, not here, so the app has to notice
   * on its own. Re-reading entitlements when the window regains focus is
   * what makes "switch back to NOSHASHI" true without polling.
   */
  useEffect(() => {
    if (!user) return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [user, refresh]);

  const has = useCallback(
    (feature: string) => {
      // The demo build closes paid surfaces at compile time. This is the
      // single chokepoint every gate already runs through, so there is no
      // second path a demo could slip past — and it is a *narrowing*, so
      // the demo can never grant something the entitlement did not.
      if (isDemo && feature in DEMO_LOCKED) return false;
      return entitlement.features.includes(feature);
    },
    [entitlement.features]
  );

  const startCheckout = useCallback(async (priceId: string, seats = 1) => {
    // A demo that takes a payment is worse than one that does not exist.
    if (isDemo) {
      await openExternal(DEMO_UPGRADE_URL);
      return;
    }
    const { url } = await callFunction<{ url: string }>("noshashi-checkout", {
      priceId,
      seats,
    });
    await openExternal(url);
  }, []);

  const openBillingPortal = useCallback(async () => {
    const { url } = await callFunction<{ url: string }>("noshashi-portal");
    await openExternal(url);
  }, []);

  const value = useMemo<BillingApi>(
    () => ({
      entitlement,
      subscription,
      loading,
      error,
      has,
      refresh,
      startCheckout,
      openBillingPortal,
    }),
    [entitlement, subscription, loading, error, has, refresh, startCheckout, openBillingPortal]
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): BillingApi {
  const context = useContext(BillingContext);
  if (!context) throw new Error("useBilling must be used inside <BillingProvider>");
  return context;
}
