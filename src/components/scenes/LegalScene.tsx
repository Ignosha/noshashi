import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SceneHeader } from "./SceneHeader";
import { Panel, DataRow, Eyebrow } from "@/components/nova/Panel";
import { NovaLogo } from "@/components/nova/NovaLogo";
import {
  NovaShield,
  NovaEye,
  NovaVault,
  NovaCredit,
  NovaBolt,
  NovaGrid,
  NovaSat,
  NovaTerminal,
} from "@/components/nova/NovaIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { POLICIES } from "@/lib/legal";
import { BRAND, CONTACT, LINKS, copyrightLine } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

const policyIcon: Record<string, React.ReactNode> = {
  accessibility: <NovaEye size={13} />,
  privacy: <NovaVault size={13} />,
  terms: <NovaCredit size={13} />,
  billing: <NovaBolt size={13} />,
  "data-processing": <NovaGrid size={13} />,
  "acceptable-use": <NovaSat size={13} />,
  disclosures: <NovaShield size={13} />,
  attributions: <NovaTerminal size={13} />,
};

/**
 * LegalScene — accessibility, privacy, terms and disclosures.
 *
 * Written against what the software actually does rather than pasted
 * from a generator, and labelled honestly: these are working documents
 * that still need counsel review before they carry any weight.
 */
export function LegalScene() {
  const [active, setActive] = useState(POLICIES[0].id);
  const policy = POLICIES.find((entry) => entry.id === active) ?? POLICIES[0];

  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="09"
        kicker="POLICIES · ACCESSIBILITY · DISCLOSURES"
        title="LEGAL & ACCESSIBILITY"
        sub="What this software promises, what it explicitly does not, and how to reach a person about either."
        status="hold"
        statusLabel="COUNSEL REVIEW PENDING"
        right={
          <Button size="sm" variant="outline" className="gap-1.5" asChild>
            <a href={`mailto:${CONTACT.legal}`}>
              <NovaCredit size={13} />
              {CONTACT.legal}
            </a>
          </Button>
        }
      />

      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-4 gap-3">
        {/* Index */}
        <div className="col-span-1 flex min-h-0 flex-col gap-3">
          <Panel label="DOCUMENTS" bodyClassName="p-2">
            <div className="space-y-1">
              {POLICIES.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setActive(entry.id)}
                  aria-current={entry.id === active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 border px-2.5 py-2 text-left transition-colors",
                    entry.id === active
                      ? "border-foreground/60 bg-secondary/60"
                      : "border-border hover:border-foreground/30 hover:bg-card"
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0",
                      entry.id === active ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {policyIcon[entry.id]}
                  </span>
                  <span className="mono-font min-w-0 flex-1 truncate text-[9.5px] text-foreground">
                    {entry.title}
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel label="ENTITY" bodyClassName="p-3">
            <DataRow label="OPERATOR" value={BRAND.legalEntity} />
            <DataRow label="JURISDICTION" value={BRAND.jurisdiction} />
            <DataRow label="BUILD" value={`v${BRAND.version}`} />
            <DataRow label="NETWORK" value={BRAND.network} />
          </Panel>

          <Panel label="CONTACT ROUTES" className="min-h-0 flex-1" bodyClassName="overflow-y-auto p-3">
            <div className="space-y-1.5">
              {[
                { label: "SUPPORT", email: CONTACT.support },
                { label: "SECURITY", email: CONTACT.security },
                { label: "LEGAL", email: CONTACT.legal },
                { label: "PRIVACY", email: CONTACT.privacy },
                { label: "INSTITUTIONS", email: CONTACT.sales },
              ].map((route) => (
                <a
                  key={route.email}
                  href={`mailto:${route.email}`}
                  className="flex items-center justify-between gap-2 border border-border px-2 py-1.5 transition-colors hover:border-foreground/40"
                >
                  <span className="stencil shrink-0 text-[8px] tracking-[0.18em] text-muted-foreground">
                    {route.label}
                  </span>
                  <span className="mono-font min-w-0 truncate text-[9px] text-foreground">
                    {route.email}
                  </span>
                </a>
              ))}
            </div>
            <p className="mono-font mt-3 border-t border-border pt-2 text-[8px] leading-relaxed text-muted-foreground/70">
              {CONTACT.hours}
              <br />
              TARGET REPLY: {CONTACT.responseTarget.toUpperCase()}
            </p>
          </Panel>
        </div>

        {/* Document */}
        <Panel
          label={policy.title}
          corners
          className="col-span-3 min-h-0 min-w-0"
          bodyClassName="min-h-0 overflow-y-auto p-0"
          right={
            <span className="mono-font text-[9px] text-muted-foreground">
              UPDATED {policy.updated.toUpperCase()}
            </span>
          }
        >
          <AnimatePresence mode="wait">
            <motion.article
              key={policy.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={SPRING}
              className="mx-auto max-w-[760px] px-6 py-6"
            >
              <Badge variant="hold" className="text-[8px]">
                TEMPLATE · NOT REVIEWED BY COUNSEL
              </Badge>

              <h2 className="display mt-4 text-[22px] font-[700] leading-tight text-foreground">
                {policy.title}
              </h2>
              <p className="selectable mt-3 text-[12px] leading-relaxed text-foreground/80">
                {policy.summary}
              </p>

              <div className="mt-6 space-y-6">
                {policy.sections.map((section, index) => (
                  <section key={section.heading}>
                    <div className="flex items-baseline gap-2.5">
                      <span className="display shrink-0 text-[11px] font-[700] text-muted-foreground/40">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h3 className="stencil text-[10px] tracking-[0.22em] text-foreground">
                        {section.heading}
                      </h3>
                    </div>
                    <div className="mt-2.5 space-y-2.5 pl-[26px]">
                      {section.body.map((paragraph) => (
                        <p
                          key={paragraph}
                          className="selectable break-words text-[11.5px] leading-relaxed text-muted-foreground"
                        >
                          {paragraph}
                        </p>
                      ))}
                      {section.points && (
                        <ul className="space-y-1.5 pt-0.5">
                          {section.points.map((point) => (
                            <li key={point} className="flex gap-2.5">
                              <span className="mt-[7px] h-1 w-1 shrink-0 bg-muted-foreground/60" />
                              <span className="selectable text-[11.5px] leading-relaxed text-muted-foreground">
                                {point}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                ))}
              </div>

              {policy.id === "accessibility" && (
                <div className="inset-row mt-8 p-4">
                  <Eyebrow>REFERENCES</Eyebrow>
                  <div className="mt-2 space-y-1.5">
                    {[
                      { label: "WCAG 2.2 quick reference", href: LINKS.wcag },
                      { label: "ADA web accessibility guidance", href: LINKS.ada },
                    ].map((reference) => (
                      <a
                        key={reference.href}
                        href={reference.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block truncate text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                      >
                        {reference.label} ↗
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <footer className="mt-8 flex items-center gap-2.5 border-t border-border pt-4">
                <NovaLogo size={15} animated={false} className="text-muted-foreground" />
                <span className="mono-font text-[9px] text-muted-foreground">
                  {copyrightLine()} · All rights reserved.
                </span>
              </footer>
            </motion.article>
          </AnimatePresence>
        </Panel>
      </div>
    </div>
  );
}
