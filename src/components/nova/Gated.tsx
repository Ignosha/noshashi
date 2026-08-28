import { motion } from "framer-motion";
import { NovaShield, NovaVault } from "./NovaIcon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useAuth } from "@/lib/auth/useAuth";
import { FEATURE_CATALOG, planFor } from "@/lib/billing/catalog";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

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
        <span className="mono-font animate-pulse text-[10px] tracking-[0.2em] text-muted-foreground">
          CHECKING ENTITLEMENT…
        </span>
      </div>
    );
  }

  if (has(feature)) return <>{children}</>;

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
      <div className="hud-corner relative w-full max-w-[520px] border border-border bg-card p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-md border border-border text-muted-foreground">
          <NovaVault size={20} />
        </div>

        <Badge variant="hold" className="mt-4 text-[8px]">
          {requiredPlan.name} PLAN
        </Badge>

        <h2 className="display mt-3 text-[17px] font-[700] tracking-[0.08em] text-foreground">
          {spec?.label ?? "PAID CAPABILITY"}
        </h2>
        <p className="mx-auto mt-2.5 max-w-[360px] text-[11.5px] leading-relaxed text-muted-foreground">
          {spec?.blurb ??
            "This capability is part of a paid plan and is not available on the free tier."}
        </p>

        <div className="mt-5 flex items-center justify-center gap-2">
          {user ? (
            <Button className="gap-2" onClick={onUpgrade}>
              <NovaShield size={14} />
              UPGRADE TO {requiredPlan.name}
            </Button>
          ) : (
            <>
              <Button className="gap-2" onClick={onSignIn}>
                <NovaShield size={14} />
                SIGN IN
              </Button>
              <Button variant="outline" onClick={onUpgrade}>
                SEE PLANS
              </Button>
            </>
          )}
        </div>

        <p className="mono-font mt-4 text-[9px] text-faint">
          {requiredPlan.priceLabel} · {requiredPlan.cadence}
        </p>

        {/*
          What the plan actually contains. A paywall that says only "this
          is locked" spends a whole screen telling the operator no; the
          same screen can tell them what they would get, which is the only
          reason anyone clicks through.
        */}
        {requiredPlan.features.length > 0 && (
          <div className="mt-5 border-t border-border/60 pt-4 text-left">
            <p className="stencil text-[8px] tracking-[0.28em] text-faint">
              {requiredPlan.name} ALSO INCLUDES
            </p>
            <ul className="mt-2.5 grid gap-1.5">
              {requiredPlan.features
                .filter((f) => !f.startsWith("Everything in"))
                .slice(0, 6)
                .map((feature) => (
                  <li
                    key={feature}
                    className="flex gap-2 text-[11px] leading-snug text-muted-foreground"
                  >
                    <span
                      aria-hidden
                      className="mt-[6px] h-[3px] w-[3px] shrink-0 bg-go"
                    />
                    {feature}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}
