import { useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel, StatCell, Eyebrow } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Gated } from "@/components/nova/Gated";
import { Signal } from "@/components/nova/Signal";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { NovaGrid, NovaSearch } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shortAddress, isValidAddress } from "@/lib/xrpl/client";
import { readBook, bookFindings, type BookReport, type BookSide } from "@/lib/desk/book";
import { TraceButton, useClaimedSubject } from "@/lib/nav/handoff";
import { cn } from "@/lib/utils";

/**
 * BookScene — quoted depth against fillable depth.
 *
 * The design rule here is the whole point of the screen: the advertised
 * number never gets the large type. Every other order book in existence
 * renders listed depth as the depth, and on some mainnet books that figure
 * is over ninety percent offers whose owners no longer hold the asset. So
 * fundable is the headline and listed sits beside it, struck through, as
 * the thing that was claimed.
 */
export function BookScene({
  onUpgrade,
  onSignIn,
}: {
  onUpgrade: () => void;
  onSignIn: () => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="21"
        kicker="ORDER BOOK INTEGRITY · QUOTED VS FILLABLE"
        title="ORDER BOOK"
        sub="How much of the depth on screen is backed by someone who still holds the asset."
        status="go"
        statusLabel="DESK PLAN"
      />
      <Gated
        feature="portfolios"
        onUpgrade={onUpgrade}
        onSignIn={onSignIn}
        className="min-h-0 flex-1"
      >
        <BookBody />
      </Gated>
    </div>
  );
}

function BookBody() {
  const [issuer, setIssuer] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [report, setReport] = useState<BookReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (addr?: string) => {
    const account = (addr ?? issuer).trim();
    const code = currency.trim().toUpperCase();
    if (!account || busy) return;
    if (!isValidAddress(account)) {
      setError("That is not a valid XRPL address.");
      return;
    }
    if (!code) {
      setError("Enter the currency code the issuer issues, such as USD.");
      return;
    }
    setIssuer(account);
    setBusy(true);
    setError(null);
    try {
      setReport(await readBook(code, account));
    } catch (caught) {
      setReport(null);
      setError(caught instanceof Error ? caught.message : "That book could not be read.");
    } finally {
      setBusy(false);
    }
  };

  useClaimedSubject("book", (subject) => {
    void run(subject.value);
  });

  const findings = report ? bookFindings(report) : [];
  const worst = report
    ? Math.min(report.bids.fundedRatio, report.asks.fundedRatio)
    : 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {report && (
        <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCell
            label="FILLABLE — BIDS"
            value={report.bids.fundableDepth.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}
            tone={report.bids.fundedRatio < 0.5 ? "no-go" : "default"}
            caveat={`of ${report.bids.listedDepth.toLocaleString(undefined, { maximumFractionDigits: 0 })} quoted · ${(report.bids.fundedRatio * 100).toFixed(1)}%`}
          />
          <StatCell
            label="FILLABLE — ASKS"
            value={report.asks.fundableDepth.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}
            tone={report.asks.fundedRatio < 0.5 ? "no-go" : "default"}
            caveat={`of ${report.asks.listedDepth.toLocaleString(undefined, { maximumFractionDigits: 0 })} quoted · ${(report.asks.fundedRatio * 100).toFixed(1)}%`}
          />
          <StatCell
            label="OFFERS THAT CANNOT FILL"
            value={String(report.bids.deadOffers + report.asks.deadOffers)}
            tone={worst < 0.5 ? "no-go" : "default"}
            caveat={`of ${report.bids.offers.length + report.asks.offers.length} resting`}
          />
          <StatCell
            label="LARGEST MAKER"
            value={`${(report.topMakerShare * 100).toFixed(0)}%`}
            tone={report.topMakerShare >= 0.5 ? "hold" : "default"}
            caveat={`of quoted depth · ${report.makers} makers`}
          />
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
          <Panel label="BOOK" className="shrink-0">
            <Label htmlFor="bookiss" className="text-[10px] tracking-wide">
              ISSUER ADDRESS
            </Label>
            <Input
              id="bookiss"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="r…"
              spellCheck={false}
              className="mt-2 font-mono text-[12px]"
            />
            <Label htmlFor="bookcur" className="mt-3 block text-[10px] tracking-wide">
              CURRENCY CODE
            </Label>
            <Input
              id="bookcur"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="USD"
              spellCheck={false}
              className="mt-2 font-mono text-[12px] uppercase"
            />
            <Button className="mt-3 w-full gap-2" onClick={() => void run()} disabled={busy}>
              <NovaSearch size={14} />
              {busy ? "READING BOOK…" : "READ THIS BOOK"}
            </Button>
            {error && <p className="mt-3 text-[11px] text-no-go">{error}</p>}
            <p className="mt-3 border-t border-border/50 pt-2.5 text-[10px] leading-relaxed text-faint">
              An offer rests whether or not its owner still holds the asset,
              and nothing removes it until someone tries to cross it. The
              ledger reports the difference in{" "}
              <span className="text-muted-foreground">taker_gets_funded</span>,
              which every book that quotes you a size ignores.
            </p>
          </Panel>

          {report && (
            <Panel
              label="RESTING OFFERS"
              className="min-h-0 flex-1"
              bodyClassName="min-h-0 overflow-y-auto p-0"
            >
              {(
                [
                  ["ASKS — SELLING " + report.currency, report.asks],
                  ["BIDS — BUYING " + report.currency, report.bids],
                ] as const
              ).map(([label, side]: readonly [string, BookSide]) => (
                <div key={label}>
                  <div className="border-b border-border/50 bg-popover/40 px-3.5 py-1.5">
                    <Eyebrow>{label}</Eyebrow>
                  </div>
                  {side.offers.slice(0, 12).map((offer, i) => {
                    const short = offer.fundable < offer.listed * 0.999;
                    return (
                      <div
                        key={`${offer.account}-${i}`}
                        className="border-b border-border/30 px-3.5 py-2"
                      >
                        <div className="flex items-baseline gap-2">
                          <code className="text-[10px] text-muted-foreground">
                            {shortAddress(offer.account)}
                          </code>
                          <TraceButton
                            value={offer.account}
                            to="provenance"
                            from="book"
                            as="market maker"
                          />
                          <span className="ml-auto font-mono text-[10px] tabular-nums text-faint">
                            @{offer.price.toFixed(6)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span
                            className={cn(
                              "font-mono text-[11px] tabular-nums",
                              offer.dead ? "text-no-go" : "text-foreground"
                            )}
                          >
                            {offer.dead
                              ? "0 fillable"
                              : offer.fundable.toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}
                          </span>
                          {short && (
                            <span className="font-mono text-[10px] tabular-nums text-faint line-through">
                              {offer.listed.toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          )}
                          {offer.expired && (
                            <span className="mono-font text-[8px] tracking-[0.14em] text-hold">
                              EXPIRED
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {side.offers.length > 12 && (
                    <p className="mono-font px-3.5 py-2 text-[9px] text-faint">
                      + {side.offers.length - 12} more, included in the totals above
                    </p>
                  )}
                </div>
              ))}
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
              icon={<NovaGrid size={16} />}
              title="NO BOOK READ"
              body="Enter an issuer and a currency. NOSHASHI separates the depth the book advertises from the depth an owner can actually deliver, and reports how much of what you would be quoted is not there."
            />
          ) : (
            <>
              <div className="border-b border-border/50 px-4 py-3">
                <p className="font-mono text-[10px] text-muted-foreground">
                  {report.pair}
                  <span className="ml-2 text-faint">{shortAddress(report.issuer)}</span>
                </p>
                <p className="mt-1 font-mono text-[9px] tabular-nums text-faint">
                  LEDGER {report.ledgerIndex.toLocaleString()} · CLOSED{" "}
                  {report.ledgerCloseTime.toISOString().replace("T", " ").slice(0, 16)} UTC
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
