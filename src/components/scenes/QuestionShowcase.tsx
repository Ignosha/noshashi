import { useEffect, useState } from "react";
import { Panel } from "@/components/nova/Panel";
import { Button } from "@/components/ui/button";
import { fetchOrderBook } from "@/lib/xrpl/client";
import { quotedVsFillable, type QuotedVsFillable } from "@/lib/desk/liquidity";
import { useLedger } from "@/lib/desk/ledger";
import { cn } from "@/lib/utils";

/**
 * The three questions, shown rather than described: one card each, with a
 * live reading where there is one to show. The liquidity card reads the
 * Bitstamp USD book from the ledger; the evidence card shows the newest
 * receipt this install has recorded. Nothing here is a sample figure.
 */

const SHOWCASE_BOOK = { label: "Bitstamp USD", currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B" };

function useLiveDepth(connected: boolean) {
  const [reading, setReading] = useState<QuotedVsFillable | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!connected || reading) return;
    let cancelled = false;
    setFailed(false);
    fetchOrderBook(SHOWCASE_BOOK.currency, SHOWCASE_BOOK.issuer)
      .then((book) => !cancelled && setReading(quotedVsFillable(book)))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [connected, reading]);
  return { reading, failed };
}

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K` : `$${n.toFixed(0)}`;

function Card({
  step,
  question,
  children,
  action,
  onAction,
}: {
  step: string;
  question: string;
  children: React.ReactNode;
  action: string;
  onAction: () => void;
}) {
  return (
    <Panel className="h-full" bodyClassName="flex h-full flex-col gap-4 p-4">
      <div>
        <p className="stencil text-[10px] tracking-[0.14em] text-muted-foreground">{step}</p>
        <h3 className="display mt-1 text-[18px] font-[700] leading-tight text-foreground">{question}</h3>
      </div>
      <div className="flex min-h-[112px] flex-1 flex-col justify-center">{children}</div>
      <Button size="sm" variant="outline" className="self-start" onClick={onAction}>
        {action}
      </Button>
    </Panel>
  );
}

export function QuestionShowcase({
  connected,
  onNavigate,
}: {
  connected: boolean;
  onNavigate: (scene: string) => void;
}) {
  const { reading, failed } = useLiveDepth(connected);
  const { entries } = useLedger();
  const latest = entries[0];

  const quoted = reading?.quotedAsk ?? 0;
  const fillable = reading?.fillableAsk ?? 0;
  const ratio = reading?.askRatio;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Card step="01 · COMPLIANCE" question="Can it move?" action="RUN A CHECK" onAction={() => onNavigate("verify")}>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "GO", tone: "border-go/50 bg-go/10 text-go" },
            { label: "HOLD", tone: "border-hold/50 bg-hold/10 text-hold" },
            { label: "NO-GO", tone: "border-no-go/50 bg-no-go/10 text-no-go" },
          ].map((v) => (
            <span key={v.label} className={cn("display rounded-md border px-3 py-2 text-[20px] font-[800]", v.tone)}>
              {v.label}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">Your rules, every reason shown.</p>
      </Card>

      <Card step="02 · LIQUIDITY" question="Can you actually sell?" action="OPEN ORDER BOOK" onAction={() => onNavigate("book")}>
        {reading && quoted > 0 ? (
          <div className="space-y-2.5">
            <p className="data-font text-[30px] font-[600] leading-none text-foreground">
              {ratio === undefined ? "—" : `${(ratio * 100).toFixed(ratio < 0.1 ? 1 : 0)}%`}
              <span className="ml-2 text-[12px] font-normal text-muted-foreground">is real</span>
            </p>
            {[
              { label: "QUOTED", value: quoted, width: 100, bar: "bg-muted-foreground/40" },
              { label: "CAN FILL", value: fillable, width: Math.max(1.5, (fillable / quoted) * 100), bar: "bg-go" },
            ].map((row) => (
              <div key={row.label}>
                <div className="mono-font flex justify-between text-[10px] tracking-[0.1em] text-muted-foreground">
                  <span>{row.label}</span>
                  <span>{money(row.value)}</span>
                </div>
                <div className="mt-1 h-2 rounded-sm bg-border/60">
                  <div className={cn("h-full rounded-sm", row.bar)} style={{ width: `${row.width}%` }} />
                </div>
              </div>
            ))}
            <p className="mono-font text-[10px] text-muted-foreground">
              {SHOWCASE_BOOK.label} · sell side · ledger {reading.ledgerIndex.toLocaleString()}
            </p>
          </div>
        ) : (
          <p className="mono-font text-[11px] text-muted-foreground">
            {failed
              ? "Ledger did not answer. Open the order book to retry."
              : reading
                ? `Nothing quoted on the ${SHOWCASE_BOOK.label} sell side at ledger ${reading.ledgerIndex.toLocaleString()}.`
                : "Reading the live order book…"}
          </p>
        )}
      </Card>

      <Card step="03 · EVIDENCE" question="Can you prove it?" action="OPEN AUDIT TRAIL" onAction={() => onNavigate("history")}>
        {latest ? (
          <div className="space-y-2">
            <p className="stencil text-[10px] tracking-[0.14em] text-muted-foreground">LATEST RECEIPT · SHA-256</p>
            <p className="data-font break-all text-[13px] leading-snug text-foreground">{latest.digest}</p>
            <p className="mono-font text-[10px] text-muted-foreground">
              {latest.verdict.toUpperCase()} · {new Date(latest.at).toLocaleString()}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="data-font text-[30px] font-[600] leading-none text-foreground">SHA-256</p>
            <p className="text-[12px] text-muted-foreground">A receipt for every decision. Run a check to get your first.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
