import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useAuth } from "@/lib/auth/useAuth";
import { FEATURE_CATALOG, planFor } from "@/lib/billing/catalog";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useLayoutEffect } from "react";
import { isTraining } from "@/lib/edition";
import { trainingGuard } from "@/lib/training/guard";

/**
 * NOSHASHI Academy's training copy: while a paid surface is on screen,
 * reads are narrowed to the labs (src/lib/training/guard.ts). A layout
 * effect, so the narrowing is in place before the surface's own effects
 * make their first read.
 */
function PaidScope({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    trainingGuard().paid(1);
    return () => trainingGuard().paid(-1);
  }, []);
  return <>{children}</>;
}

/**
 * Gated — the single place a paid capability is checked.
 *
 * The gate is a real one: the surface is not rendered at all unless the
 * entitlement is present, and that entitlement is written only by the
 * Stripe webhook using the service role. A client that edits its own
 * state changes nothing, because the rows are behind row level security
 * and the API key it would need does not exist on this side.
 */
export function Gated({
  feature,
  children,
  onUpgrade,
  onSignIn,
  className,
}: {
  feature: string;
  children: React.ReactNode;
  onUpgrade: () => void;
  onSignIn: () => void;
  className?: string;
}) {
  const { has, loading } = useBilling();
  const { user } = useAuth();
  const spec = FEATURE_CATALOG[feature];
  const requiredPlan = planFor(spec?.requires ?? "desk");

  if (loading) {
    return (
      <div className={cn("flex h-full items-center justify-center", className)}>
        <span className="mono-font animate-pulse text-[11px] tracking-[0.14em] text-muted-foreground">
          CHECKING ENTITLEMENT…
        </span>
      </div>
    );
  }

  if (has(feature)) return isTraining ? <PaidScope>{children}</PaidScope> : <>{children}</>;

  return (
    <motion.div
      // Anchored near the top rather than centred: a full-height flex
      // centre leaves the card adrift in 500px of void on a tall scene,
      // which reads as a broken page rather than a locked one.
      className={cn(
        "flex h-full items-start justify-center overflow-y-auto p-6 pt-10",
        className
      )}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      role="region"
      aria-label={`${spec?.label ?? feature} requires an upgrade`}
    >
      <article className="desk-gate w-full max-w-[560px] text-left">
        <p className="desk-figure-meta">
          <span>Fig. / Plan required</span>
          <span>{requiredPlan.name.charAt(0) + requiredPlan.name.slice(1).toLowerCase()} plan</span>
        </p>

        <h2 className="desk-gate-title text-foreground">
          {spec?.label ?? "Paid capability"}
        </h2>
        <p className="desk-dek">
          {spec?.blurb ??
            "This capability is part of a paid plan and is not available on the free tier."}
        </p>

        <div className="desk-actions">
          {user ? (
            <Button onClick={onUpgrade}>
              Upgrade to {requiredPlan.name.charAt(0) + requiredPlan.name.slice(1).toLowerCase()}
              <span aria-hidden>↗</span>
            </Button>
          ) : (
            <>
              <Button onClick={onSignIn}>
                Sign in
                <span aria-hidden>↗</span>
              </Button>
              <Button variant="outline" onClick={onUpgrade}>
                See plans
              </Button>
            </>
          )}
        </div>

        <p className="desk-fine mono-font mt-4">
          {requiredPlan.priceLabel} · {requiredPlan.cadence}
        </p>

        {/*
          What the plan actually contains. A paywall that says only "this
          is locked" spends a whole screen telling the operator no; the
          same screen can tell them what they would get, which is the only
          reason anyone clicks through.
        */}
        {requiredPlan.features.length > 0 && (
          <div className="desk-gate-includes">
            <p className="desk-kicker">
              Also in {requiredPlan.name.charAt(0) + requiredPlan.name.slice(1).toLowerCase()}
            </p>
            <ol>
              {requiredPlan.features
                .filter((f) => !f.startsWith("Everything in"))
                .slice(0, 6)
                .map((feature, i) => (
                  <li key={feature}>
                    <span aria-hidden className="mono-font">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {feature}
                  </li>
                ))}
            </ol>
          </div>
        )}
      </article>
    </motion.div>
  );
}
