import { useState } from "react";
import { motion } from "framer-motion";
import { SceneHeader } from "./SceneHeader";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { Panel, Eyebrow } from "@/components/nova/Panel";
import { NovaBolt, NovaCredit, NovaShield, NovaVault } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/components/nova/CountUp";
import { CREDIT_PACKS, PLANS, type Plan } from "@/lib/billing/catalog";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useAuth } from "@/lib/auth/useAuth";
import { useToast } from "@/lib/toast";
import { CONTACT } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { SPRING, staggerChild, staggerParent } from "@/lib/motion";

/**
 * PlansScene — the purchase surface.
 *
 * Checkout is created server-side from a price id on an allow-list, and
 * the card is entered on Stripe's own domain. No payment detail ever
 * reaches this application, which is the only defensible way to take a
 * card from a desktop app.
 */
export function PlansScene({ onSignIn }: { onSignIn: () => void }) {
  const { entitlement, subscription, startCheckout, openBillingPortal } = useBilling();
  const { user } = useAuth();
  const { push } = useToast();

  const [seats, setSeats] = useState(1);
  const [busyPrice, setBusyPrice] = useState<string | null>(null);

  const buy = async (priceId: string, quantity = 1) => {
    if (!user) {
      push({
        title: "SIGN IN FIRST",
        body: "A purchase has to attach to an account.",
        tone: "hold",
      });
      onSignIn();
      return;
    }
    setBusyPrice(priceId);
    try {
      await startCheckout(priceId, quantity);
      push({
        title: "CHECKOUT OPENED",
        body: "Complete the payment in your browser, then return here.",
        tone: "info",
      });
    } catch (error) {
      push({
        title: "CHECKOUT FAILED",
        body: error instanceof Error ? error.message : "Could not start checkout.",
        tone: "no-go",
      });
    } finally {
      setBusyPrice(null);
    }
  };

  return (
    <div className="h-full min-w-0 overflow-y-auto overflow-x-hidden">
      <div className="flex min-w-0 flex-col gap-3 p-4">
        <SceneHeader
          index="10"
          kicker="PLANS & BILLING"
          title="PRICING"
          sub="The console is free. Paid plans unlock portfolios, alerting, receipt anchoring and the Compliance API."
          status={entitlement.tier === "operator" ? "hold" : "go"}
          statusLabel={`${entitlement.tier.toUpperCase()} PLAN`}
          right={
            subscription ? (
              <Button size="sm" variant="outline" onClick={() => void openBillingPortal()}>
                MANAGE BILLING
              </Button>
            ) : (
              <Button size="sm" variant="outline" asChild>
                <a href={`mailto:${CONTACT.sales}`}>TALK TO SALES</a>
              </Button>
            )
          }
        />

        {/* Seat selector for the per-seat plan */}
        <Panel label="SEATS" className="shrink-0" bodyClassName="p-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {[1, 3, 5, 10, 25].map((count) => (
                <button
                  key={count}
                  onClick={() => setSeats(count)}
                  className={cn(
                    "mono-font border px-2.5 py-1 text-[10px] tabular-nums transition-colors",
                    seats === count
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                  )}
                >
                  {count}
                </button>
              ))}
            </div>
            <span className="text-[10.5px] text-muted-foreground">
              Desk is billed per seat. Institution is a flat account price.
            </span>
            <span className="ml-auto">
              <Eyebrow>DESK TOTAL</Eyebrow>
              <p className="data-font text-[18px] font-[600] leading-none text-foreground">
                <CountUp value={seats * 749} prefix="$" />
                <span className="ml-1 text-[9px] font-normal text-muted-foreground">
                  /MO
                </span>
              </p>
            </span>
          </div>
        </Panel>

        {/* Plans */}
        <motion.div
          className="grid grid-cols-3 gap-3"
          variants={staggerParent(0.07)}
          initial="hidden"
          animate="show"
        >
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              seats={seats}
              current={entitlement.tier === plan.id}
              busy={busyPrice === plan.priceId}
              onBuy={() => plan.priceId && void buy(plan.priceId, plan.seatBased ? seats : 1)}
            />
          ))}
        </motion.div>

        {/* Verification credits */}
        <Panel
          label="API VERIFICATION CREDITS"
          corners
          className="min-w-0"
          bodyClassName="relative p-4"
          right={
            <span className="mono-font text-[9px] tabular-nums text-muted-foreground">
              {entitlement.verificationQuota.toLocaleString()} REMAINING
            </span>
          }
        >
          <PatternMark element="orbit" size={160} className="-right-10 -top-10" opacity={0.08} />
          <p className="relative max-w-[560px] text-[11px] leading-relaxed text-muted-foreground">
            Programmatic verifications through the Compliance API draw from a prepaid
            balance. Checks a human runs in this console are never metered — the fee
            attaches to automation, not to people.
          </p>

          <div className="relative mt-4 grid grid-cols-3 gap-3">
            {CREDIT_PACKS.map((pack) => (
              <div
                key={pack.id}
                className="flex flex-col border border-border bg-card/50 p-3.5"
              >
                <div className="flex items-baseline justify-between">
                  <p className="data-font text-[20px] font-[600] leading-none text-foreground">
                    {(pack.verifications / 1000).toLocaleString()}K
                  </p>
                  <Badge variant="outline" className="text-[8px]">
                    {pack.unitLabel}
                  </Badge>
                </div>
                <p className="stencil mt-1.5 text-[8px] tracking-[0.2em] text-muted-foreground">
                  VERIFICATIONS
                </p>
                <p className="data-font mt-3 text-[17px] font-[600] text-foreground">
                  {pack.priceLabel}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  disabled={busyPrice === pack.priceId}
                  onClick={() => void buy(pack.priceId)}
                >
                  {busyPrice === pack.priceId ? "OPENING…" : "BUY CREDITS"}
                </Button>
              </div>
            ))}
          </div>
        </Panel>

        {/* Pre-purchase disclosure. US federal (ROSCA) and several state
            auto-renewal laws require these terms to be conspicuous BEFORE
            the charge, not buried in a policy page. */}
        <Panel label="BEFORE YOU SUBSCRIBE" bodyClassName="p-4">
          <div className="flex gap-3">
            <NovaShield size={15} className="mt-0.5 shrink-0 text-hold" />
            <div className="min-w-0">
              <p className="text-[11.5px] font-medium text-foreground">
                Subscriptions renew automatically until you cancel.
              </p>
              <ul className="mt-2 space-y-1.5">
                {[
                  "Desk is billed $749 per seat every month. Institution is billed $4,000 every month. Both renew on the same date each period.",
                  "Verification credit packs are one-time purchases. They do not renew and they do not expire.",
                  "Cancel any time from Account → Manage Billing. It takes two clicks, needs no phone call and no email, and access continues until the end of the period you already paid for.",
                  "Full refund within 14 days of a first subscription charge if you have not used a paid capability. Unused credits are refundable pro rata within 30 days.",
                  "We give at least 30 days' notice before any price change, and you can cancel before it takes effect.",
                ].map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-[6px] h-1 w-1 shrink-0 bg-muted-foreground" />
                    <span className="text-[10.5px] leading-relaxed text-muted-foreground">
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[10px] text-muted-foreground">
                Payment is handled entirely by Stripe; card details never reach this
                application. Prices exclude tax, which Stripe calculates at checkout.
              </p>
            </div>
          </div>
        </Panel>

        {/* What the fee funds */}
        <Panel label="HOW THE FEE WORKS" bodyClassName="p-4">
          <div className="grid grid-cols-3 gap-5">
            {[
              {
                icon: <NovaShield size={14} />,
                title: "Free where a human decides",
                body: "Anything you run yourself in the console — gate checks, exports, agent questions — is unmetered on every plan, forever.",
              },
              {
                icon: <NovaBolt size={14} />,
                title: "Metered where a machine decides",
                body: "When your systems call the Compliance API, each verification draws one credit and writes one receipt to your audit trail.",
              },
              {
                icon: <NovaVault size={14} />,
                title: "Receipts are the product",
                body: "You are not paying for a boolean. You are paying for a hashed, timestamped, reproducible record that the check happened.",
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-2.5">
                <span className="mt-0.5 shrink-0 text-muted-foreground">{item.icon}</span>
                <div>
                  <p className="text-[11px] font-medium text-foreground">{item.title}</p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  seats,
  current,
  busy,
  onBuy,
}: {
  plan: Plan;
  seats: number;
  current: boolean;
  busy: boolean;
  onBuy: () => void;
}) {
  const total = plan.seatBased ? seats * 749 : null;

  return (
    <motion.div variants={staggerChild} whileHover={{ y: -3 }} transition={SPRING}>
      <Panel
        corners={plan.emphasis}
        className={cn(
          "h-full",
          plan.emphasis && "border-foreground/45",
          current && "border-go/60"
        )}
        bodyClassName="flex h-full flex-col p-4"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="display text-[15px] font-[700] tracking-[0.1em] text-foreground">
              {plan.name}
            </p>
            <p className="mt-1 text-[9.5px] text-muted-foreground">{plan.audience}</p>
          </div>
          {current ? (
            <Badge variant="go" className="text-[8px]">
              CURRENT
            </Badge>
          ) : plan.emphasis ? (
            <Badge variant="hold" className="text-[8px]">
              MOST CAPABLE
            </Badge>
          ) : null}
        </div>

        <div className="mt-4 border-y border-border py-3">
          <p className="data-font text-[28px] font-[700] leading-none text-foreground">
            {plan.priceLabel}
          </p>
          <p className="mono-font mt-1.5 text-[9px] text-muted-foreground">
            {plan.cadence}
            {total !== null && seats > 1 && ` · $${total.toLocaleString()}/mo for ${seats}`}
          </p>
        </div>

        <ul className="mt-3 flex-1 space-y-1.5">
          {plan.features.map((feature) => (
            <li key={feature} className="flex gap-2">
              <span className="mt-[5px] h-1 w-1 shrink-0 bg-go" />
              <span className="text-[10.5px] leading-snug text-muted-foreground">
                {feature}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4">
          {plan.priceId ? (
            <Button
              className="w-full gap-2"
              variant={plan.emphasis ? "default" : "outline"}
              disabled={busy || current}
              onClick={onBuy}
            >
              <NovaCredit size={13} />
              {current ? "ACTIVE PLAN" : busy ? "OPENING CHECKOUT…" : `GET ${plan.name}`}
            </Button>
          ) : (
            <Button className="w-full" variant="outline" disabled>
              {current ? "ACTIVE PLAN" : "INCLUDED"}
            </Button>
          )}
        </div>
      </Panel>
    </motion.div>
  );
}
