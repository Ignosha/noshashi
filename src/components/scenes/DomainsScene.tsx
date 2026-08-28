import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SceneHeader } from "./SceneHeader";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { Panel, DataRow, Eyebrow } from "@/components/nova/Panel";
import { Meter } from "@/components/nova/Charts";
import { StatusDot } from "@/components/nova/StatusDot";
import { NovaGrid, NovaSat, NovaShield, NovaTerminal } from "@/components/nova/NovaIcon";
import { Badge } from "@/components/ui/badge";
import { formatUptime } from "@/lib/xrpl/client";
import { formatCompact } from "@/lib/format";
import { DOMAIN_REGISTRY, heldCredentialTypes, type PermissionedDomain } from "@/lib/policy";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import type { Status } from "@/lib/xrpl/types";
import { cn } from "@/lib/utils";
import { SPRING, staggerChild, staggerParent } from "@/lib/motion";

const governanceStatus: Record<PermissionedDomain["governance"], Status> = {
  active: "go",
  review: "hold",
  suspended: "no-go",
};

/**
 * DomainsScene — the XLS-80 registry.
 *
 * Each domain is a rule set, not a venue: the grid shows what each one
 * demands, how close this wallet is to satisfying it, and whether the
 * domain is currently enforcing at all.
 */
export function DomainsScene({ data }: { data: XrplState }) {
  const { server, connected, credentials, ledger } = data;
  const [selectedId, setSelectedId] = useState(DOMAIN_REGISTRY[0].id);

  const held = useMemo(() => heldCredentialTypes(credentials), [credentials]);
  const selected =
    DOMAIN_REGISTRY.find((domain) => domain.id === selectedId) ?? DOMAIN_REGISTRY[0];

  const totalMembers = DOMAIN_REGISTRY.reduce(
    (sum, domain) => sum + domain.members,
    0
  );
  const enforcing = DOMAIN_REGISTRY.filter(
    (domain) => domain.governance === "active"
  ).length;

  /** Domains whose every requirement this wallet already satisfies. */
  const clearedDomains = DOMAIN_REGISTRY.filter((domain) =>
    domain.requirements.every((requirement) => held.has(requirement))
  ).length;

  const metCount = selected.requirements.filter((requirement) =>
    held.has(requirement)
  ).length;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <SceneHeader
        index="04"
        kicker="XLS-80 · PERMISSIONED DOMAINS"
        title="DOMAIN GRID"
        sub="Credential-gated environments. Every interaction inside one is evaluated against its rule set before it settles."
        status={connected ? "go" : "no-go"}
        statusLabel={connected ? "ENFORCED" : "DETACHED"}
        right={
          <span className="flex items-center gap-3">
            <span className="mono-font text-[9px] tabular-nums text-muted-foreground">
              {enforcing}/{DOMAIN_REGISTRY.length} ENFORCING
            </span>
            <span className="mono-font text-[9px] tabular-nums text-muted-foreground">
              {formatCompact(totalMembers)} MEMBERS
            </span>
          </span>
        }
      />

      {/* Hero row. The grid below is detail; these four are the answer to
          "can this wallet transact anywhere, and where does it fall short". */}
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: "DOMAINS ENFORCING",
            value: `${enforcing}/${DOMAIN_REGISTRY.length}`,
            tone: enforcing === DOMAIN_REGISTRY.length ? "go" : "hold",
          },
          {
            label: "CREDENTIALS HELD",
            value: String(held.size),
            tone: held.size > 0 ? "go" : "no-go",
          },
          {
            label: "DOMAINS YOU CLEAR",
            value: `${clearedDomains}/${DOMAIN_REGISTRY.length}`,
            tone: clearedDomains > 0 ? "go" : "no-go",
          },
          {
            label: "COMBINED MEMBERS",
            value: formatCompact(totalMembers),
            tone: "default",
          },
        ].map((stat) => (
          <Panel key={stat.label} bodyClassName="p-3.5">
            <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
              {stat.label}
            </p>
            <p
              className={cn(
                "data-font mt-1.5 text-[22px] font-[600] leading-none tabular-nums",
                stat.tone === "go" && "text-go",
                stat.tone === "hold" && "text-hold",
                stat.tone === "no-go" && "text-no-go",
                stat.tone === "default" && "text-foreground"
              )}
            >
              {stat.value}
            </p>
          </Panel>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-5 gap-3">
        <div className="col-span-3 min-h-0 overflow-y-auto pr-1">
          <motion.div
            className="grid grid-cols-1 gap-3 lg:grid-cols-2"
            variants={staggerParent(0.05)}
            initial="hidden"
            animate="show"
          >
            {DOMAIN_REGISTRY.map((domain) => {
              const met = domain.requirements.filter((requirement) =>
                held.has(requirement)
              ).length;
              const active = domain.id === selectedId;
              return (
                <motion.button
                  key={domain.id}
                  variants={staggerChild}
                  whileHover={{ y: -2 }}
                  transition={SPRING}
                  onClick={() => setSelectedId(domain.id)}
                  className={cn(
                    "hud-corner relative border bg-card/60 p-3 text-left transition-colors",
                    active
                      ? "border-foreground/60 bg-secondary/40"
                      : "border-border hover:border-foreground/35"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
                      {domain.code}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <StatusDot
                        status={governanceStatus[domain.governance]}
                        size={5}
                        pulse={domain.governance === "active"}
                      />
                      <span
                        className={cn(
                          "stencil text-[8px] tracking-[0.18em]",
                          domain.governance === "active" && "text-go",
                          domain.governance === "review" && "text-hold",
                          domain.governance === "suspended" && "text-no-go"
                        )}
                      >
                        {domain.governance.toUpperCase()}
                      </span>
                    </span>
                  </div>

                  <p className="mono-font mt-2.5 truncate text-[12px] text-foreground">
                    {domain.name}
                  </p>
                  <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
                    {domain.institution}
                  </p>

                  <div className="mt-3">
                    <Meter
                      label="CREDENTIAL FIT"
                      value={(met / domain.requirements.length) * 100}
                      tone={
                        met === domain.requirements.length
                          ? "go"
                          : met > 0
                            ? "hold"
                            : "no-go"
                      }
                    />
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {domain.requirements.map((requirement) => (
                      <span
                        key={requirement}
                        className={cn(
                          "mono-font border px-1.5 py-0.5 text-[8px]",
                          held.has(requirement)
                            ? "border-go/40 text-go"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        {requirement}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
                    <span className="mono-font text-[9px] tabular-nums text-muted-foreground">
                      {domain.members.toLocaleString()} MEMBERS
                    </span>
                    <span className="mono-font text-[9px] tabular-nums text-muted-foreground">
                      {domain.transferCeilingXrp > 0
                        ? `≤ ${formatCompact(domain.transferCeilingXrp)} XRP`
                        : "CLOSED"}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        </div>

        <div className="col-span-2 flex min-h-0 flex-col gap-3">
          <Panel
            label="DOMAIN DETAIL"
            corners
            className="shrink-0"
            right={
              <Badge variant={governanceStatus[selected.governance]}>
                {selected.code}
              </Badge>
            }
          >
            <div className="relative">
              <PatternMark element="orbital" size={180} className="-right-12 -top-12" opacity={0.08} />
              <p className="display text-[13px] font-[700] leading-tight text-foreground">
                {selected.name}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {selected.institution}
              </p>

              <div className="mt-3">
                <DataRow
                  label="ELIGIBILITY"
                  value={`${metCount}/${selected.requirements.length} MET`}
                  tone={
                    metCount === selected.requirements.length
                      ? "go"
                      : metCount > 0
                        ? "hold"
                        : "no-go"
                  }
                />
                <DataRow
                  label="CEILING"
                  value={
                    selected.transferCeilingXrp > 0
                      ? `${selected.transferCeilingXrp.toLocaleString()} XRP`
                      : "SETTLEMENT CLOSED"
                  }
                  tone={selected.transferCeilingXrp > 0 ? "default" : "no-go"}
                />
                <DataRow label="MEMBERS" value={selected.members.toLocaleString()} />
                <DataRow
                  label="GOVERNANCE"
                  value={selected.governance.toUpperCase()}
                  tone={
                    selected.governance === "active"
                      ? "go"
                      : selected.governance === "review"
                        ? "hold"
                        : "no-go"
                  }
                />
              </div>
            </div>
          </Panel>

          <Panel label="POLICY ENGINE" className="shrink-0">
            {[
              {
                label: "Domain enforcement",
                on: connected,
                icon: <NovaShield size={11} />,
              },
              {
                label: "Credential acceptance",
                on: credentials.length > 0,
                icon: <NovaSat size={11} />,
              },
              {
                label: "Amendment awareness",
                on: (server?.amendedFeatures.length ?? 0) > 0,
                icon: <NovaTerminal size={11} />,
              },
              {
                label: "Ledger attestation",
                on: Boolean(ledger?.validated),
                icon: <NovaGrid size={11} />,
              },
            ].map((policy) => (
              <div
                key={policy.label}
                className="flex items-center gap-2 border-b border-border/30 py-1.5 last:border-0"
              >
                <span className="text-muted-foreground">{policy.icon}</span>
                <span className="text-[10px] text-foreground/85">{policy.label}</span>
                <span
                  className={cn(
                    "stencil ml-auto text-[8px] tracking-[0.2em]",
                    policy.on ? "text-go" : "text-hold"
                  )}
                >
                  {policy.on ? "ENGAGED" : "STANDBY"}
                </span>
              </div>
            ))}
          </Panel>

          <Panel
            label="NETWORK FACTS"
            className="min-h-0 flex-1"
            bodyClassName="overflow-y-auto p-3"
            right={
              <Badge variant="outline">
                {server?.amendedFeatures.length ?? 0} AMENDMENTS
              </Badge>
            }
          >
            <DataRow
              label="VALIDATED LEDGER"
              value={ledger ? ledger.ledgerIndex.toLocaleString() : "···"}
            />
            <DataRow label="BASE FEE" value={ledger ? `${ledger.baseFeeXrp} XRP` : "···"} />
            <DataRow label="SERVER STATE" value={server?.serverState ?? "···"} />
            <DataRow
              label="UPTIME"
              value={server ? formatUptime(server.uptimeSeconds) : "···"}
            />

            <Eyebrow className="mb-1.5 mt-3">ENABLED AMENDMENTS</Eyebrow>
            <div className="flex flex-wrap gap-1">
              {(server?.amendedFeatures ?? []).slice(0, 12).map((feature) => (
                <span
                  key={feature}
                  className="mono-font rounded border border-border px-1.5 py-0.5 text-[8px] text-muted-foreground"
                >
                  {feature.slice(0, 12)}
                </span>
              ))}
              {(server?.amendedFeatures.length ?? 0) === 0 && (
                <span className="text-[9px] text-muted-foreground">
                  Node reports no amendment list.
                </span>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
