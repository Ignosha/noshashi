import { useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel, StatCell } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Gated } from "@/components/nova/Gated";
import { Signal } from "@/components/nova/Signal";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { NovaEye, NovaSearch } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shortAddress, isValidAddress } from "@/lib/xrpl/client";
import {
  readProvenance,
  provenanceFindings,
  type ProvenanceReport,
} from "@/lib/desk/provenance";
import { useClaimedSubject } from "@/lib/nav/handoff";

/**
 * ProvenanceScene — how old this counterparty is, and who funded it.
 *
 * The raw sequence number is shown, but never as a count and never as a
 * headline. It is the single most misread field on the ledger: a modern
 * account's sequence is seeded to its creation ledger, so an account that
 * has sent nothing can read ninety-two million. The corrected figure gets
 * the prominence and the raw one sits beside it, labelled as what it is.
 */
export function ProvenanceScene({
  onUpgrade,
  onSignIn,
}: {
  onUpgrade: () => void;
  onSignIn: () => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="19"
        kicker="COUNTERPARTY PROVENANCE · AGE · FUNDING SOURCE"
        title="PROVENANCE"
        sub="How long an account has existed, who put the first XRP into it, and how much of that this node can actually prove."
        status="go"
        statusLabel="DESK PLAN"
      />
      <Gated
        feature="portfolios"
        onUpgrade={onUpgrade}
        onSignIn={onSignIn}
        className="min-h-0 flex-1"
      >
        <ProvenanceBody />
      </Gated>
    </div>
  );
}

function ProvenanceBody() {
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<ProvenanceReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (addr?: string) => {
    const address = (addr ?? query).trim();
    if (!address || busy) return;
    if (!isValidAddress(address)) {
      setError("That is not a valid XRPL address.");
      return;
    }
    setQuery(address);
    setBusy(true);
    setError(null);
    try {
      setReport(await readProvenance(address));
    } catch (caught) {
      setReport(null);
      setError(caught instanceof Error ? caught.message : "That account could not be read.");
    } finally {
      setBusy(false);
    }
  };

  /*
   * A subject handed over from another scene runs immediately. The operator
   * already chose this address by clicking TRACE there; making them press a
   * second button here would be asking the same question twice.
   */
  const claimed = useClaimedSubject("provenance", (subject) => {
    void run(subject.value);
  });

  const findings = report ? provenanceFindings(report) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {claimed && (
        <p className="mono-font shrink-0 text-[9px] leading-snug text-faint">
          TRACED FROM {String(claimed.from ?? "").toUpperCase()}
          {claimed.as && ` · ${claimed.as.toUpperCase()}`}
        </p>
      )}

      {report && (
        <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            {
              label: "AGE",
              value:
                report.ageDays === undefined
                  ? "—"
                  : report.ageDays >= 365
                    ? `${(report.ageDays / 365).toFixed(1)}y`
                    : `${report.ageDays}d`,
              tone:
                report.ageDays !== undefined && report.ageDays < 30
                  ? ("hold" as const)
                  : ("default" as const),
              caveat: report.historyIncomplete
                ? "at least — history incomplete"
                : report.originDate
                  ? `since ${report.originDate.toISOString().slice(0, 10)}`
                  : "origin unknown",
            },
            {
              label: "TRANSACTIONS SENT",
              value: report.approxSentCount?.toLocaleString() ?? "—",
              tone: "default" as const,
              caveat: `approx · sequence reads ${report.sequence.toLocaleString()}`,
            },
            {
              label: "FUNDED BY",
              value: report.fundedBy ? shortAddress(report.fundedBy) : "—",
              tone: "default" as const,
              caveat: report.fundedBy
                ? `${report.fundingAmountXrp?.toLocaleString(undefined, { maximumFractionDigits: 2 })} XRP`
                : "no inbound funding payment found",
            },
            {
              label: "BALANCE",
              value: report.balanceXrp.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              }),
              tone: "default" as const,
              caveat: `${report.ownerCount} ledger objects · XRP`,
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
          <Panel label="COUNTERPARTY" className="shrink-0">
            <Label htmlFor="prov" className="text-[10px] tracking-wide">
              XRPL ADDRESS
            </Label>
            <Input
              id="prov"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="r…"
              spellCheck={false}
              className="mt-2 font-mono text-[12px]"
            />
            <Button className="mt-3 w-full gap-2" onClick={() => void run()} disabled={busy}>
              <NovaSearch size={14} />
              {busy ? "TRACING ORIGIN…" : "TRACE PROVENANCE"}
            </Button>
            {error && <p className="mt-3 text-[11px] text-no-go">{error}</p>}
            <p className="mt-3 border-t border-border/50 pt-2.5 text-[10px] leading-relaxed text-faint">
              An account's{" "}
              <span className="text-muted-foreground">sequence</span> is not a
              transaction count. Accounts created after DeletableAccounts have
              it seeded to the ledger index they were created at, so one that
              has sent nothing can read in the tens of millions.
            </p>
          </Panel>

          {report?.fundedBy && (
            <Panel label="FUNDING CHAIN" bodyClassName="p-0">
              <div className="border-b border-border/30 px-3.5 py-2.5">
                <p className="mono-font text-[8px] tracking-[0.2em] text-faint">
                  FUNDED THIS ACCOUNT
                </p>
                <code className="mt-1 block break-all text-[10.5px] text-muted-foreground">
                  {report.fundedBy}
                </code>
                <Button
                  variant="outline"
                  className="mt-2 h-7 w-full text-[10px]"
                  onClick={() => void run(report.fundedBy)}
                  disabled={busy}
                >
                  TRACE THIS ONE BACK
                </Button>
              </div>
              <div className="px-3.5 py-2.5">
                <p className="mono-font text-[9px] leading-relaxed text-faint">
                  Funding is the strongest on-ledger link an address has to
                  anyone — it is written once and cannot be edited afterwards.
                  Walking it back is how a shell resolves to something known.
                </p>
              </div>
            </Panel>
          )}
        </div>

        <Panel
          label="FINDINGS"
          className="relative min-h-0 lg:col-span-3"
          bodyClassName="min-h-0 overflow-y-auto p-0"
        >
          <PatternMark element="orbit" size={190} opacity={0.05} className="-right-10 -top-6" />
          {!report ? (
            <EmptyState
              icon={<NovaEye size={16} />}
              title="NO COUNTERPARTY TRACED"
              body="Enter an address. NOSHASHI reports when it first appeared on the ledger, who sent it its first XRP, roughly how much it has actually done, and whether this node's history reaches far enough back to prove any of it."
            />
          ) : (
            <>
              <div className="border-b border-border/50 px-4 py-3">
                <p className="break-all font-mono text-[10px] text-muted-foreground">
                  {report.address}
                </p>
                <p className="mt-1 font-mono text-[9px] tabular-nums text-faint">
                  {report.originLedger
                    ? `ORIGIN LEDGER ${report.originLedger.toLocaleString()}`
                    : "ORIGIN NOT FOUND"}
                  {report.lastActivityLedger &&
                    ` · LAST ACTIVITY ${report.lastActivityLedger.toLocaleString()}`}
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
