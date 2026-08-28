import { useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel, Eyebrow } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Signal } from "@/components/nova/Signal";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { NovaSearch, NovaShield } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useSetting } from "@/lib/store";
import { shortAddress } from "@/lib/xrpl/client";
import {
  checkCounterparty,
  VERDICT_COPY,
  type CounterpartyReport,
} from "@/lib/public/counterparty";
import { cn } from "@/lib/utils";

/** What a free operator gets each month before the meter bites. */
const FREE_CHECKS_PER_MONTH = 10;

function monthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * SafeShopScene — check an address before you pay it.
 *
 * The public half of the product. Everything here is a read of published
 * ledger state, which is what makes it safe to put in front of the general
 * public: it moves no money, holds no key and signs nothing, so it carries
 * none of the regulatory weight that a ramp or a custodian would.
 *
 * The copy is careful in one specific way. It never says "safe" and never
 * recommends. It reports what the ledger publishes and what that implies,
 * because a clean account is one with nothing recorded against it — not a
 * good one — and somebody is going to act on this screen.
 */
export function SafeShopScene({ onUpgrade }: { onUpgrade: () => void }) {
  const { has } = useBilling();
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<CounterpartyReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Metered locally: the check is a read of public data, so the limit is a
  // commercial boundary rather than a security one and does not need a
  // server to enforce it.
  const [usage, setUsage] = useSetting<{ month: string; count: number }>(
    "public.checks",
    { month: monthKey(), count: 0 }
  );
  const unlimited = has("portfolios");
  const thisMonth = usage.month === monthKey() ? usage.count : 0;
  const remaining = Math.max(0, FREE_CHECKS_PER_MONTH - thisMonth);
  const blocked = !unlimited && remaining === 0;

  const run = async () => {
    if (!query.trim() || busy || blocked) return;
    setBusy(true);
    setError(null);
    try {
      const result = await checkCounterparty(query);
      setReport(result);
      if (!unlimited) {
        void setUsage({ month: monthKey(), count: thisMonth + 1 });
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "That address could not be read."
      );
    } finally {
      setBusy(false);
    }
  };

  const verdictTone =
    report?.verdict === "avoid"
      ? "text-no-go"
      : report?.verdict === "caution"
        ? "text-hold"
        : report?.verdict === "clear"
          ? "text-go"
          : "text-muted-foreground";

  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="11"
        kicker="PUBLIC UTILITY · READ ONLY · NOTHING IS SIGNED"
        title="CHECK AN ADDRESS"
        sub="Paste any XRPL address before you pay it — a shop, a token issuer, someone on the other end of a trade."
        status="go"
        statusLabel={unlimited ? "UNLIMITED" : `${remaining} LEFT THIS MONTH`}
      />

      <div className="grid min-h-0 flex-1 grid-cols-5 gap-3">
        <div className="col-span-2 flex min-h-0 flex-col gap-3">
          <Panel label="ADDRESS" className="shrink-0">
            <Label htmlFor="cp" className="text-[10px] tracking-wide">
              XRPL ACCOUNT
            </Label>
            <Input
              id="cp"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="r…"
              spellCheck={false}
              className="mt-2 font-mono text-[12px]"
            />
            <Button
              className="mt-3 w-full gap-2"
              onClick={() => void run()}
              disabled={busy || blocked || !query.trim()}
            >
              <NovaSearch size={14} />
              {busy ? "READING THE LEDGER…" : "CHECK THIS ADDRESS"}
            </Button>

            {blocked && (
              <div className="inset-row mt-3 p-3">
                <p className="text-[11px] leading-relaxed text-hold">
                  You have used all {FREE_CHECKS_PER_MONTH} free checks this
                  month.
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  The check itself is a read of public ledger data — the limit is
                  a commercial one, not a technical one.
                </p>
                <Button size="sm" className="mt-2.5" onClick={onUpgrade}>
                  SEE PLANS
                </Button>
              </div>
            )}

            {error && <p className="mt-3 text-[11px] text-no-go">{error}</p>}

            <p className="mt-3 border-t border-border/50 pt-2.5 text-[10px] leading-relaxed text-faint">
              Everything reported is published on the XRP Ledger and readable by
              anyone. NOSHASHI does not hold a list of &ldquo;known bad
              actors&rdquo; and does not score reputation — inventing one would
              be worse than useless, because you would act on it.
            </p>
          </Panel>

          <Panel label="WHAT THIS CANNOT TELL YOU" className="min-h-0 flex-1">
            <ul className="grid gap-2.5">
              {[
                "Whether a business is honest. The ledger records what accounts do, not what people intend.",
                "Whether a domain really belongs to them. An account can claim any domain; only the domain publishing a matching xrp-ledger.toml proves it.",
                "Whether an address is sanctioned. That requires a sanctions list, which is a legal product NOSHASHI does not publish.",
                "Whether you will get your goods. This is a ledger reader, not an escrow.",
              ].map((t) => (
                <li key={t} className="flex gap-2 text-[10.5px] leading-relaxed text-muted-foreground">
                  <span aria-hidden className="mt-[6px] h-[3px] w-[3px] shrink-0 bg-hold" />
                  {t}
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <Panel
          label="FINDINGS"
          className="relative col-span-3 min-h-0"
          bodyClassName="min-h-0 overflow-y-auto p-0"
        >
          <PatternMark element="orbital" size={220} opacity={0.05} className="-right-14 -top-10" />

          {!report ? (
            <EmptyState
              icon={<NovaShield size={16} />}
              title="NOTHING CHECKED YET"
              body="Paste an address and NOSHASHI will read what the ledger publishes about it: who can freeze it, what it charges, what it has issued, and who it has dealt with."
            />
          ) : (
            <div>
              <div className="border-b border-border/50 px-4 py-3.5">
                <p className={cn("display text-[17px] font-[700]", verdictTone)}>
                  {report.headline}
                </p>
                <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
                  {VERDICT_COPY[report.verdict].blurb}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] tabular-nums text-faint">
                  <span>{shortAddress(report.address)}</span>
                  {report.funded && (
                    <span>
                      BALANCE{" "}
                      <span className="text-muted-foreground">
                        {report.balanceXrp.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        XRP
                      </span>
                    </span>
                  )}
                  {report.isIssuer && (
                    <span>
                      ISSUES{" "}
                      <span className="text-muted-foreground">
                        {report.issuedCurrencies.length} currencies
                      </span>
                    </span>
                  )}
                  <span>
                    RECENT TX{" "}
                    <span className="text-muted-foreground">{report.activityCount}</span>
                  </span>
                </div>
              </div>

              <div>
                {report.findings.map((f) => (
                  <Signal
                    key={f.id}
                    severity={f.severity}
                    kicker={f.severity === "ok" ? "IN ITS FAVOUR" : "PUBLISHED FACT"}
                    headline={f.title}
                    detail={f.detail}
                    action={f.action}
                    className="rounded-none border-b border-border/30"
                  />
                ))}
              </div>

              <div className="px-4 py-3">
                <Eyebrow>NOT ADVICE</Eyebrow>
                <p className="mt-1.5 max-w-2xl text-[10px] leading-relaxed text-faint">
                  This is a reading of public ledger state at{" "}
                  {new Date(report.checkedAt).toLocaleString()}. It is not legal,
                  regulatory or financial advice, and it is not a representation
                  that any transaction with this address is lawful or wise.
                </p>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
