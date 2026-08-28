import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SceneHeader } from "./SceneHeader";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { Panel, DataRow, Eyebrow } from "@/components/nova/Panel";
import { CountUp } from "@/components/nova/CountUp";
import { Sparkline } from "@/components/nova/Charts";
import { NovaBolt, NovaCredit, NovaShield, NovaVault } from "@/components/nova/NovaIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MILESTONES, REVENUE_STREAMS, TIERS } from "@/lib/roadmap";
import { CONTACT } from "@/lib/brand";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SPRING, staggerChild, staggerParent } from "@/lib/motion";

/** One tunable assumption in the revenue model. */
function Dial({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="stencil text-[8px] tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
        <span className="mono-font text-[11px] tabular-nums text-foreground">
          {value.toLocaleString()}
          {suffix && <span className="ml-0.5 text-muted-foreground">{suffix}</span>}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        className="mt-1.5 h-1 w-full cursor-pointer appearance-none bg-secondary accent-white [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-1.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-foreground"
      />
    </div>
  );
}

/**
 * RevenueScene — how this earns.
 *
 * Streams, tiers and a sequenced plan, plus a model the operator can
 * actually move. The numbers are a hypothesis to test with design
 * partners, and the scene says so rather than dressing them as data.
 */
export function RevenueScene() {
  const [deskSeats, setDeskSeats] = useState(40);
  const [institutions, setInstitutions] = useState(3);
  const [apiCalls, setApiCalls] = useState(400_000);
  const [feeXrp, setFeeXrp] = useState(0.02);
  const [xrpPrice, setXrpPrice] = useState(2.4);

  const model = useMemo(() => {
    const deskRevenue = deskSeats * 149;
    const institutionRevenue = institutions * 4_000;
    // API is metered per 1,000 calls at the same effective rate as the
    // per-verification fee, so the two never undercut each other.
    const perCallUsd = feeXrp * xrpPrice;
    const apiRevenue = apiCalls * perCallUsd;
    const mrr = deskRevenue + institutionRevenue + apiRevenue;

    return {
      deskRevenue,
      institutionRevenue,
      apiRevenue,
      perCallUsd,
      mrr,
      arr: mrr * 12,
    };
  }, [deskSeats, institutions, apiCalls, feeXrp, xrpPrice]);

  /** 12-month ramp at a steady 18% MoM, for shape not for forecast. */
  const ramp = useMemo(() => {
    const series: number[] = [];
    let value = model.mrr / 12;
    for (let month = 0; month < 12; month += 1) {
      series.push(value);
      value *= 1.18;
    }
    return series;
  }, [model.mrr]);

  return (
    <div className="h-full min-w-0 overflow-y-auto overflow-x-hidden">
      <div className="flex min-w-0 flex-col gap-3 p-4">
        <SceneHeader
          index="08"
          kicker="COMMERCIAL MODEL"
          title="BUSINESS PLAN"
          sub="Where the revenue comes from, what it costs, and the order the pieces have to ship in."
          status="hold"
          statusLabel="HYPOTHESIS"
          right={
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <a href={`mailto:${CONTACT.sales}`}>
                <NovaCredit size={13} />
                CONTACT SALES
              </a>
            </Button>
          }
        />

        {/* Model */}
        <div className="grid min-w-0 grid-cols-5 gap-3">
          <Panel label="ASSUMPTIONS" corners className="col-span-2" bodyClassName="p-4">
            <p className="mb-4 text-[10px] leading-relaxed text-muted-foreground">
              Move any dial. Nothing here is observed revenue — these are the
              inputs to test with the first design partners.
            </p>
            <div className="space-y-4">
              <Dial
                label="DESK SEATS"
                value={deskSeats}
                min={0}
                max={500}
                step={5}
                onChange={setDeskSeats}
              />
              <Dial
                label="INSTITUTION ACCOUNTS"
                value={institutions}
                min={0}
                max={40}
                step={1}
                onChange={setInstitutions}
              />
              <Dial
                label="API VERIFICATIONS / MONTH"
                value={apiCalls}
                min={0}
                max={5_000_000}
                step={50_000}
                onChange={setApiCalls}
              />
              <Dial
                label="FEE PER VERIFICATION"
                value={feeXrp}
                min={0.005}
                max={0.2}
                step={0.005}
                suffix=" XRP"
                onChange={setFeeXrp}
              />
              <Dial
                label="XRP REFERENCE PRICE"
                value={xrpPrice}
                min={0.2}
                max={12}
                step={0.1}
                suffix=" USD"
                onChange={setXrpPrice}
              />
            </div>
          </Panel>

          <Panel
            label="MODELLED REVENUE"
            corners
            className="col-span-3"
            bodyClassName="relative p-4"
            right={
              <Badge variant="hold" className="text-[8px]">
                UNVALIDATED
              </Badge>
            }
          >
            <PatternMark element="orbit" size={170} className="-right-12 -top-12" opacity={0.08} />

            <div className="relative grid grid-cols-2 gap-6">
              <div>
                <Eyebrow>MONTHLY RECURRING</Eyebrow>
                <p className="data-font mt-1 text-[38px] font-[700] leading-none text-foreground">
                  <CountUp value={model.mrr} prefix="$" />
                </p>
                <p className="mono-font mt-2 text-[10px] tabular-nums text-muted-foreground">
                  ${formatCompact(model.arr)} annualised
                </p>
              </div>
              <div className="space-y-0">
                <DataRow
                  label="DESK SUBSCRIPTIONS"
                  value={`$${model.deskRevenue.toLocaleString()}`}
                />
                <DataRow
                  label="INSTITUTION CONTRACTS"
                  value={`$${model.institutionRevenue.toLocaleString()}`}
                />
                <DataRow
                  label="METERED VERIFICATION"
                  value={`$${Math.round(model.apiRevenue).toLocaleString()}`}
                />
                <DataRow
                  label="EFFECTIVE PER CALL"
                  value={`$${model.perCallUsd.toFixed(4)}`}
                  tone="muted"
                />
              </div>
            </div>

            <div className="relative mt-5 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <Eyebrow>12-MONTH SHAPE AT 18% MoM</Eyebrow>
                <span className="mono-font text-[9px] text-muted-foreground">
                  ILLUSTRATIVE
                </span>
              </div>
              <Sparkline values={ramp} height={54} tone="go" className="mt-2" />
            </div>
          </Panel>
        </div>

        {/* Streams */}
        <Panel label="REVENUE STREAMS" className="min-w-0" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-border">
                  {["STREAM", "MODEL", "UNIT", "RATIONALE"].map((heading) => (
                    <th
                      key={heading}
                      className="stencil px-3 py-2 text-[8px] font-medium tracking-[0.2em] text-muted-foreground"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {REVENUE_STREAMS.map((stream) => (
                  <tr
                    key={stream.id}
                    className="border-b border-border/30 transition-colors last:border-0 hover:bg-secondary/40"
                  >
                    <td className="mono-font px-3 py-2 text-[10.5px] text-foreground">
                      {stream.name}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[8px]">
                        {stream.model.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="mono-font px-3 py-2 text-[10px] text-muted-foreground">
                      {stream.unit}
                    </td>
                    <td className="px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
                      {stream.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Tiers */}
        <div>
          <div className="flex items-end justify-between">
            <div>
              <Eyebrow>PACKAGING</Eyebrow>
              <h2 className="display mt-1 text-[17px] font-[700] text-foreground">
                SUBSCRIPTION TIERS
              </h2>
            </div>
            <span className="mono-font text-[9px] text-muted-foreground">
              PROPOSED · NOT YET PRICED WITH BUYERS
            </span>
          </div>
          <div className="mt-2 h-px bg-border" />

          <motion.div
            className="mt-3 grid grid-cols-3 gap-3"
            variants={staggerParent(0.07)}
            initial="hidden"
            animate="show"
          >
            {TIERS.map((tier) => (
              <motion.div key={tier.id} variants={staggerChild}>
                <Panel
                  corners={tier.emphasis}
                  className={cn(
                    "h-full",
                    tier.emphasis && "border-foreground/45 bg-card"
                  )}
                  bodyClassName="flex h-full flex-col p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="display text-[14px] font-[700] tracking-[0.1em] text-foreground">
                        {tier.name}
                      </p>
                      <p className="mt-1 text-[9.5px] text-muted-foreground">
                        {tier.audience}
                      </p>
                    </div>
                    {tier.emphasis && (
                      <Badge variant="go" className="text-[8px]">
                        FOCUS
                      </Badge>
                    )}
                  </div>

                  <div className="mt-4 border-y border-border py-3">
                    <p className="data-font text-[26px] font-[700] leading-none text-foreground">
                      {tier.price}
                    </p>
                    <p className="mono-font mt-1 text-[9px] text-muted-foreground">
                      {tier.cadence}
                    </p>
                  </div>

                  <ul className="mt-3 flex-1 space-y-1.5">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <span className="mt-[5px] h-1 w-1 shrink-0 bg-go" />
                        <span className="text-[10.5px] leading-snug text-muted-foreground">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Sequencing */}
        <Panel label="SEQUENCING" className="relative min-w-0" bodyClassName="p-4">
          <PatternMark element="dots" size={200} opacity={0.06} className="-right-12 -top-12" />
          <p className="mb-4 text-[10px] leading-relaxed text-muted-foreground">
            Each phase exists to unlock the revenue of the next. Nothing is
            monetised before the thing it depends on is trusted.
          </p>
          <div className="relative grid grid-cols-4 gap-3">
            {/* Spine */}
            <div className="pointer-events-none absolute left-0 right-0 top-[13px] h-px bg-border" />
            {MILESTONES.map((milestone, index) => (
              <motion.div
                key={milestone.phase}
                className="relative"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: index * 0.08 }}
              >
                <span
                  className={cn(
                    "relative z-10 block h-[7px] w-[7px]",
                    index === 0 ? "bg-go" : "bg-muted-foreground/50"
                  )}
                />
                <p className="stencil mt-3 text-[8px] tracking-[0.22em] text-muted-foreground">
                  {milestone.phase} · {milestone.window}
                </p>
                <p className="mt-1.5 text-[11px] leading-snug text-foreground">
                  {milestone.goal}
                </p>
                <p className="mt-2 border-l border-border pl-2 text-[9.5px] leading-relaxed text-muted-foreground">
                  {milestone.unlocks}
                </p>
              </motion.div>
            ))}
          </div>
        </Panel>

        {/* Honest caveat */}
        <Panel label="WHAT THIS PLAN DOES NOT KNOW YET" bodyClassName="p-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                icon: <NovaShield size={13} />,
                title: "Willingness to pay",
                body: "No buyer has been quoted these prices. The tiers are a starting position for design-partner conversations, not a validated price point.",
              },
              {
                icon: <NovaBolt size={13} />,
                title: "Verification volume",
                body: "Per-call revenue assumes institutions automate against the API. Until a venue integrates, the metered line is entirely modelled.",
              },
              {
                icon: <NovaVault size={13} />,
                title: "Regulatory posture",
                body: "Charging a fee for compliance verification may attract licensing obligations depending on jurisdiction. This needs qualified counsel before launch.",
              },
            ].map((risk) => (
              <div key={risk.title} className="flex gap-2.5">
                <span className="mt-0.5 shrink-0 text-hold">{risk.icon}</span>
                <div>
                  <p className="text-[11px] font-medium text-foreground">{risk.title}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                    {risk.body}
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
