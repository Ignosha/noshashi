import { useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel, Eyebrow, StatCell } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Gated } from "@/components/nova/Gated";
import { Signal } from "@/components/nova/Signal";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { NovaVault, NovaSearch } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shortAddress, isValidAddress } from "@/lib/xrpl/client";
import {
  readIssuance,
  issuanceFindings,
  type IssuanceReport,
} from "@/lib/desk/issuance";
import { cn } from "@/lib/utils";

/**
 * IssuanceScene — surveillance from the issuer's side of the trust line.
 *
 * The rest of the console serves whoever holds a token. This serves whoever
 * created it, and the question inverts: not "can they freeze me" but "who is
 * holding my paper, and how concentrated is it".
 *
 * The concentration figures are the point and also the risk. They are
 * computed over the holder lines actually walked, so the scene reports its
 * own coverage prominently — a Herfindahl index over a partial holder set
 * can only understate, and an issuer acting on an understated number is
 * worse off than one who knows the figure is provisional.
 */
export function IssuanceScene({ onUpgrade, onSignIn }: { onUpgrade: () => void; onSignIn: () => void }) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="14"
        kicker="ISSUER SURVEILLANCE · WHO HOLDS YOUR PAPER"
        title="ISSUANCE"
        sub="Holder concentration, dormant lines and enforcement history for any issuance, read from the ledger."
        status="go"
        statusLabel="INSTITUTION"
      />
      <Gated
        feature="compliance_api"
        onUpgrade={onUpgrade}
        onSignIn={onSignIn}
        className="min-h-0 flex-1"
      >
        <IssuanceBody />
      </Gated>
    </div>
  );
}

function IssuanceBody() {
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<IssuanceReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [walked, setWalked] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const address = query.trim();
    if (!address || busy) return;
    if (!isValidAddress(address)) {
      setError("That is not a valid XRPL address.");
      return;
    }
    setBusy(true);
    setError(null);
    setWalked(0);
    try {
      setReport(await readIssuance(address, (p) => setWalked(p.linesWalked)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That issuer could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const findings = report ? issuanceFindings(report) : [];

  /*
   * The headline concentration figures are gated on the same coverage test
   * the findings use. A hero stat reading "HHI 2,205" is read as a
   * measurement no matter what the caveat under it says, so when the walk
   * did not see enough supply the number is withheld rather than qualified.
   */
  const lead = report?.currencies[0];
  const measurable = (lead?.coverage ?? 0) >= 0.95;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Hero: the coverage question comes before any concentration figure,
          because every figure below is conditional on it. */}
      {report && (
        <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            {
              label: "CURRENCIES ISSUED",
              value: String(report.currencies.length),
              tone: "default" as const,
            },
            {
              label: "HOLDER LINES READ",
              value: report.linesWalked.toLocaleString(),
              tone: report.truncated ? ("hold" as const) : ("default" as const),
              caveat: report.truncated ? "walk incomplete — figures provisional" : undefined,
            },
            {
              label: "LARGEST HOLDER",
              value: !lead ? "—" : !measurable ? "N/A" : `${(lead.topHolderPct * 100).toFixed(1)}%`,
              tone:
                measurable && (lead?.topHolderPct ?? 0) > 0.5
                  ? ("no-go" as const)
                  : ("default" as const),
              caveat: !lead
                ? undefined
                : measurable
                  ? lead.currency
                  : "holder walk incomplete",
            },
            {
              label: "CONCENTRATION HHI",
              value: !lead ? "—" : !measurable ? "N/A" : Math.round(lead.hhi).toLocaleString(),
              tone:
                measurable && (lead?.hhi ?? 0) >= 2500
                  ? ("no-go" as const)
                  : ("default" as const),
              caveat: !lead
                ? undefined
                : measurable
                  ? "2,500+ is highly concentrated"
                  : `only ${((lead.coverage ?? 0) * 100).toFixed(1)}% of supply seen`,
            },
          ].map((stat) => (
            <StatCell
              key={stat.label}
              label={stat.label}
              value={stat.value}
              caveat={stat.caveat}
              tone={stat.tone}
            />
          ))}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
          <Panel label="ISSUER" className="shrink-0">
            <Label htmlFor="iss" className="text-[10px] tracking-wide">
              XRPL ACCOUNT THAT ISSUES THE TOKEN
            </Label>
            <Input
              id="iss"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="r…"
              spellCheck={false}
              className="mt-2 font-mono text-[12px]"
            />
            <Button className="mt-3 w-full gap-2" onClick={() => void run()} disabled={busy}>
              <NovaSearch size={14} />
              {busy
                ? walked > 0
                  ? `WALKING… ${walked.toLocaleString()} LINES`
                  : "WALKING HOLDER LINES…"
                : "SURVEY THIS ISSUANCE"}
            </Button>
            {error && <p className="mt-3 text-[11px] text-no-go">{error}</p>}
            <p className="mt-3 border-t border-border/50 pt-2.5 text-[10px] leading-relaxed text-faint">
              Walks up to 50,000 holder lines and can take a minute on a large
              issuer. A trust line only reports{" "}
              <span className="text-muted-foreground">freeze</span> or{" "}
              <span className="text-muted-foreground">authorized</span> when the
              flag is set, so counts here are of what was seen, never of what is
              absent.
            </p>
          </Panel>

          {report && report.currencies.length > 0 && (
            <Panel label="TOP HOLDERS" className="min-h-0 flex-1" bodyClassName="min-h-0 overflow-y-auto p-0">
              <div className="border-b border-border/50 px-3.5 py-2">
                <Eyebrow>{report.currencies[0].currency}</Eyebrow>
                {!measurable && (
                  <p className="mono-font mt-1 text-[9px] leading-snug text-hold">
                    SHARES ARE OF WHAT WAS WALKED, NOT OF SUPPLY
                  </p>
                )}
              </div>
              {report.currencies[0].top.map((h, i) => {
                const pct = report.currencies[0].observedHeld > 0
                  ? h.held / report.currencies[0].observedHeld
                  : 0;
                return (
                  <div key={h.account} className="border-b border-border/30 px-3.5 py-2">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[9px] text-faint">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <code className="text-[10.5px] text-muted-foreground">
                        {shortAddress(h.account)}
                      </code>
                      <span
                        className={cn(
                          "ml-auto font-mono text-[11px] tabular-nums",
                          pct > 0.25 ? "text-no-go" : "text-foreground"
                        )}
                      >
                        {(pct * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-[3px] w-full bg-border/60">
                      <div
                        className={cn("h-full", pct > 0.25 ? "bg-no-go" : "bg-brand")}
                        style={{ width: `${Math.min(100, pct * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </Panel>
          )}
        </div>

        <Panel
          label="FINDINGS"
          className="relative min-h-0 lg:col-span-3"
          bodyClassName="min-h-0 overflow-y-auto p-0"
        >
          <PatternMark element="orbital" size={200} opacity={0.05} className="-right-12 -top-8" />
          {!report ? (
            <EmptyState
              icon={<NovaVault size={16} />}
              title="NO ISSUANCE SURVEYED"
              body="Enter an issuer address. NOSHASHI walks every trust line opened against it and reports how concentrated the holdings are, how many lines sit dormant, and what enforcement the issuer has taken."
            />
          ) : (
            <>
              <div className="border-b border-border/50 px-4 py-3">
                <p className="font-mono text-[10px] text-muted-foreground">
                  {shortAddress(report.issuer)}
                  {report.domain && (
                    <span className="ml-2 text-faint">claims {report.domain}</span>
                  )}
                </p>
                <p className="mt-1 font-mono text-[9px] tabular-nums text-faint">
                  LEDGER {report.ledgerIndex.toLocaleString()} ·{" "}
                  {report.linesWalked.toLocaleString()} LINES ·{" "}
                  {report.currencies.length} CURRENCIES
                </p>
              </div>
              {findings.map((f) => (
                <Signal
                  key={f.id}
                  severity={f.severity}
                  kicker={f.severity === "ok" ? "IN GOOD ORDER" : "OBSERVED"}
                  headline={f.title}
                  detail={f.detail}
                  action={f.action}
                  className="rounded-none border-b border-border/30"
                />
              ))}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
