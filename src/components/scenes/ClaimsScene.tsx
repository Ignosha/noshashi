import { useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel, StatCell } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Signal } from "@/components/nova/Signal";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { NovaShield, NovaSearch } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shortAddress, isValidAddress } from "@/lib/xrpl/client";
import {
  readClaims,
  claimFindings,
  formatClaim,
  type ClaimsReport,
} from "@/lib/desk/claims";
import { TraceButton, useClaimedSubject } from "@/lib/nav/handoff";
import { cn } from "@/lib/utils";

/**
 * ClaimsScene — what strangers have addressed to an account.
 *
 * Free and ungated, deliberately. This is the screen that stops someone
 * losing money to an impersonated token, and putting it behind $749 would
 * mean only the people who least need it can see it.
 *
 * The design point is that the headline figure must not be the amount. A
 * claim for "5,980 USDT" rendered large and green is the scam working; the
 * number is real, the token is not. So the amount is shown small and
 * secondary, and what gets the weight is whether the issuer has ever issued
 * anything at all.
 */
export function ClaimsScene() {
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<ClaimsReport | null>(null);
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
      setReport(await readClaims(address));
    } catch (caught) {
      setReport(null);
      setError(caught instanceof Error ? caught.message : "That account could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const claimed = useClaimedSubject("claims", (subject) => {
    void run(subject.value);
  });

  const findings = report ? claimFindings(report) : [];
  const dangerous = report?.inbound.filter((c) => c.borrowedTicker && c.issuerOwesNothing) ?? [];

  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="20"
        kicker="PUBLIC · UNSOLICITED CLAIMS · NO ACCOUNT NEEDED"
        title="INBOX"
        sub="What strangers have addressed to an account, and whether the tokens they offer exist at all."
        status="go"
        statusLabel="OPEN"
      />

      {claimed && (
        <p className="mono-font shrink-0 text-[9px] leading-snug text-faint">
          TRACED FROM {String(claimed.from ?? "").toUpperCase()}
          {claimed.as && ` · ${claimed.as.toUpperCase()}`}
        </p>
      )}

      {report && (
        <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCell
            label="CLAIMS AGAINST IT"
            value={String(report.inbound.length)}
            tone={dangerous.length > 0 ? "no-go" : "default"}
            caveat="checks addressed to this account"
          />
          <StatCell
            label="CANNOT BE CASHED"
            value={String(dangerous.length)}
            tone={dangerous.length > 0 ? "no-go" : "default"}
            caveat={
              dangerous.length > 0
                ? "issuer has issued nothing"
                : "no impersonated tokens found"
            }
          />
          <StatCell
            label="COST TO RECEIVE"
            value="0"
            caveat="the sender pays the reserve, not you"
          />
          <StatCell
            label="CREATED BY IT"
            value={report.outboundCount.toLocaleString()}
            caveat="checks this account sent out"
          />
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
          <Panel label="ACCOUNT" className="shrink-0">
            <Label htmlFor="claims" className="text-[10px] tracking-wide">
              XRPL ADDRESS
            </Label>
            <Input
              id="claims"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="r…"
              spellCheck={false}
              className="mt-2 font-mono text-[12px]"
            />
            <Button className="mt-3 w-full gap-2" onClick={() => void run()} disabled={busy}>
              <NovaSearch size={14} />
              {busy ? "READING CLAIMS…" : "READ CLAIMS"}
            </Button>
            {error && <p className="mt-3 text-[11px] text-no-go">{error}</p>}
            <p className="mt-3 border-t border-border/50 pt-2.5 text-[10px] leading-relaxed text-faint">
              A currency code is{" "}
              <span className="text-muted-foreground">not a name anyone owns</span>.
              Any account can issue a token called USDT, and the ledger draws
              them identically. Only the issuing address identifies a token —
              which is why the amount on a claim tells you nothing.
            </p>
          </Panel>

          {report && report.inbound.length > 0 && (
            <Panel
              label="ADDRESSED TO THIS ACCOUNT"
              className="min-h-0 flex-1"
              bodyClassName="min-h-0 overflow-y-auto p-0"
            >
              {report.inbound.map((claim) => {
                const bad = claim.borrowedTicker && claim.issuerOwesNothing;
                return (
                  <div key={claim.index} className="border-b border-border/30 px-3.5 py-2.5">
                    <div className="flex items-baseline gap-2">
                      <code className="text-[10.5px] text-muted-foreground">
                        {shortAddress(claim.from)}
                      </code>
                      <TraceButton
                        value={claim.from}
                        to="provenance"
                        from="claims"
                        as="sender of an unsolicited claim"
                      />
                      <span
                        className={cn(
                          "ml-auto font-mono text-[10.5px] tabular-nums",
                          bad ? "text-no-go" : "text-muted-foreground"
                        )}
                      >
                        {formatClaim(claim.amount)}
                      </span>
                    </div>
                    {bad && (
                      <p className="mono-font mt-1.5 text-[8.5px] leading-snug tracking-[0.1em] text-no-go">
                        ISSUER HAS ISSUED NOTHING — NOT CASHABLE
                      </p>
                    )}
                    {claim.issuerDomain && (
                      <p className="mono-font mt-1 text-[9px] text-faint">
                        issuer claims {claim.issuerDomain}
                      </p>
                    )}
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
          <PatternMark element="orbit" size={190} opacity={0.05} className="-right-10 -top-6" />
          {!report ? (
            <EmptyState
              icon={<NovaShield size={16} />}
              title="NO ACCOUNT READ"
              body="Enter an address. NOSHASHI reports every check a stranger has addressed to it, and checks whether the token each one offers has ever been issued by anyone at all."
            />
          ) : (
            <>
              <div className="border-b border-border/50 px-4 py-3">
                <p className="break-all font-mono text-[10px] text-muted-foreground">
                  {report.address}
                </p>
                <p className="mt-1 font-mono text-[9px] tabular-nums text-faint">
                  LEDGER {report.ledgerIndex.toLocaleString()}
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
