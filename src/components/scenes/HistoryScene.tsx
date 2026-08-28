import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SceneHeader } from "./SceneHeader";
import { Panel, Eyebrow } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Sparkline } from "@/components/nova/Charts";
import { CountUp } from "@/components/nova/CountUp";
import { NovaBolt, NovaCredit, NovaTerminal, NovaVault } from "@/components/nova/NovaIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shortAddress } from "@/lib/xrpl/client";
import { toCsv, truncateMiddle } from "@/lib/format";
import { saveTextFile } from "@/lib/export";
import { useToast } from "@/lib/toast";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import type { WalletTransaction } from "@/lib/xrpl/types";
import { cn } from "@/lib/utils";
import { staggerChild, staggerParent } from "@/lib/motion";

type Filter = "all" | "in" | "out" | "cross";

/**
 * HistoryScene — the exportable audit trail.
 *
 * Wallet activity read straight from `account_tx`, annotated with the
 * compliance metadata a regulator or a tax filing actually needs, and
 * exportable as CSV in one action.
 */
export function HistoryScene({ data }: { data: XrplState }) {
  const { transactions, account, loadingAccount, accountError, refreshAccount } = data;
  const { push } = useToast();

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return transactions.filter((entry) => {
      if (filter !== "all" && entry.direction !== filter) return false;
      if (!needle) return true;
      return (
        entry.hash.toLowerCase().includes(needle) ||
        entry.counterparty.toLowerCase().includes(needle) ||
        entry.transactionType.toLowerCase().includes(needle)
      );
    });
  }, [transactions, filter, query]);

  /**
   * Totals describe what is on screen, not the whole window.
   *
   * These previously summed `transactions` while the table and the CSV
   * export both operated on `filtered`. Selecting a direction tab or
   * typing a search left the headline reporting the full set directly
   * above a handful of rows — and the export wrote the handful. On a
   * screen whose output is a compliance artefact, a headline that does not
   * describe the exported rows is the worst defect available.
   */
  const sum = (rows: typeof transactions) => {
    let inbound = 0;
    let outbound = 0;
    let fees = 0;
    for (const entry of rows) {
      fees += Number(entry.feeXrp);
      if (entry.amountXrp === undefined) continue;
      if (entry.direction === "in") inbound += entry.amountXrp;
      if (entry.direction === "out") outbound += entry.amountXrp;
    }
    return { inbound, outbound, fees };
  };

  const totals = useMemo(() => sum(filtered), [filtered]);
  /** The unfiltered figures, shown as a secondary line so nothing is hidden. */
  const windowTotals = useMemo(() => sum(transactions), [transactions]);
  const isFiltered = filtered.length !== transactions.length;

  /** Running balance delta across what is shown, oldest → newest. */
  const flowSeries = useMemo(() => {
    const ordered = [...filtered].reverse();
    let running = 0;
    return ordered.map((entry) => {
      const delta = entry.amountXrp ?? 0;
      running += entry.direction === "in" ? delta : -delta;
      return running;
    });
  }, [filtered]);

  const exportCsv = async () => {
    if (filtered.length === 0) return;
    setExporting(true);
    try {
      const csv = toCsv(
        filtered.map((entry) => ({
          hash: entry.hash,
          ledger_index: entry.ledgerIndex,
          date: entry.date,
          type: entry.transactionType,
          result: entry.result,
          direction: entry.direction,
          counterparty: entry.counterparty,
          amount_xrp: entry.amountXrp ?? "",
          fee_xrp: entry.feeXrp,
          subject: account?.address ?? "",
        }))
      );
      const stamp = new Date().toISOString().slice(0, 10);
      const destination = await saveTextFile(
        `noshashi-audit-${stamp}.csv`,
        csv
      );
      push({
        title: "AUDIT TRAIL EXPORTED",
        body: `${filtered.length} records written to ${destination}`,
        tone: "go",
      });
    } catch (error) {
      push({
        title: "EXPORT FAILED",
        body: error instanceof Error ? error.message : "Unable to write file",
        tone: "no-go",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <SceneHeader
        index="05"
        kicker="AUDIT TRAIL · ACCOUNT_TX"
        title="TRANSACTION HISTORY"
        sub="Validated wallet activity with the compliance metadata attached to each settlement."
        status={transactions.length > 0 ? "go" : "hold"}
        statusLabel={loadingAccount ? "READING" : `${transactions.length} RECORDS`}
        right={
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => void exportCsv()}
            disabled={exporting || filtered.length === 0}
          >
            <NovaVault size={13} />
            {exporting ? "WRITING…" : "EXPORT CSV"}
          </Button>
        }
      />

      <motion.div
        className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4"
        variants={staggerParent(0.05)}
        initial="hidden"
        animate="show"
      >
        {[
          // Direction is not a verdict. INBOUND was rendering in verdict
          // green, which spends the colour budget that has to make a real
          // NO-GO stand out.
          { label: "INBOUND", value: totals.inbound, whole: windowTotals.inbound, icon: <NovaCredit size={14} /> },
          { label: "OUTBOUND", value: totals.outbound, whole: windowTotals.outbound, icon: <NovaBolt size={14} /> },
          { label: "FEES PAID", value: totals.fees, whole: windowTotals.fees, icon: <NovaTerminal size={14} /> },
        ].map((stat) => (
          <motion.div key={stat.label} variants={staggerChild}>
            <Panel bodyClassName="p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="data-font mt-1.5 text-[20px] font-[600] leading-none text-foreground">
                    <CountUp value={stat.value} decimals={stat.value < 10 ? 4 : 2} />
                    <span className="ml-1 text-[9px] font-normal text-muted-foreground">
                      XRP
                    </span>
                  </p>
                  {/* When a filter is on, the unfiltered figure stays
                      reachable rather than being silently replaced. */}
                  {isFiltered && (
                    <p className="mono-font mt-1 text-[9px] tabular-nums text-faint">
                      of {stat.whole.toLocaleString(undefined, { maximumFractionDigits: 2 })} in window
                    </p>
                  )}
                </div>
                <span className="text-muted-foreground/70">{stat.icon}</span>
              </div>
            </Panel>
          </motion.div>
        ))}

        <motion.div variants={staggerChild}>
          <Panel bodyClassName="p-3">
            <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
              NET FLOW
            </p>
            {/* Draws in --brand like every other chart. A positive running
                balance is a direction, not a GO verdict. */}
            <Sparkline values={flowSeries} height={38} className="mt-1.5" />
            <p className="mono-font mt-1 text-[9px] tabular-nums text-faint">
              {flowSeries.length > 0
                ? `${flowSeries[flowSeries.length - 1] >= 0 ? "+" : ""}${flowSeries[
                    flowSeries.length - 1
                  ].toLocaleString(undefined, { maximumFractionDigits: 2 })} XRP NET`
                : "NO MOVEMENT IN RANGE"}
            </p>
          </Panel>
        </motion.div>
      </motion.div>

      <Panel
        label="LEDGER RECORDS"
        corners
        className="min-h-0 flex-1"
        bodyClassName="flex min-h-0 flex-col p-0"
        right={
          <div className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by hash, account or type…"
              className="mono-font h-6 w-[210px] text-[10px]"
              spellCheck={false}
            />
            <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
              <TabsList>
                <TabsTrigger value="all">ALL</TabsTrigger>
                <TabsTrigger value="in">IN</TabsTrigger>
                <TabsTrigger value="out">OUT</TabsTrigger>
                <TabsTrigger value="cross">CROSS</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        }
      >
        {accountError ? (
          <EmptyState
            icon={<NovaTerminal size={16} />}
            title="HISTORY UNAVAILABLE"
            body={accountError}
            action={
              <Button size="sm" variant="outline" onClick={() => void refreshAccount()}>
                RETRY
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<NovaCredit size={16} />}
            title={transactions.length === 0 ? "NO LEDGER ACTIVITY" : "NO MATCHING RECORDS"}
            body={
              transactions.length === 0
                ? "This account has no validated transactions in the queried window. Fund or transact from it and records appear here."
                : "No record matches the current filter. Clear the search to see the full trail."
            }
            action={
              transactions.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  CLEAR FILTERS
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border">
                  {["", "TYPE", "COUNTERPARTY", "AMOUNT", "FEE", "LEDGER", "RESULT", "DATE"].map(
                    (heading, index) => (
                      <th
                        key={`${heading}-${index}`}
                        className="stencil px-3 py-2 text-[8px] font-medium tracking-[0.2em] text-muted-foreground"
                      >
                        {heading}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <HistoryRow key={entry.hash} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-1.5">
          <Eyebrow>
            {filtered.length} OF {transactions.length} RECORDS
          </Eyebrow>
          <span className="mono-font text-[9px] text-muted-foreground">
            SUBJECT {account ? shortAddress(account.address) : "—"}
          </span>
        </div>
      </Panel>
    </div>
  );
}

function HistoryRow({ entry }: { entry: WalletTransaction }) {
  const success = entry.result === "tesSUCCESS";

  return (
    <tr className="border-b border-border/30 transition-colors hover:bg-secondary/40">
      <td className="px-3 py-1.5">
        <span
          className={cn(
            "mono-font text-[10px]",
            entry.direction === "in"
              ? "text-go"
              : entry.direction === "out"
                ? "text-foreground/70"
                : "text-muted-foreground/60"
          )}
          title={entry.direction}
        >
          {entry.direction === "in" ? "↓" : entry.direction === "out" ? "↑" : "↔"}
        </span>
      </td>
      <td className="mono-font px-3 py-1.5 text-[10px] text-foreground/85">
        {entry.transactionType}
      </td>
      <td className="mono-font selectable px-3 py-1.5 text-[10px] text-muted-foreground">
        {shortAddress(entry.counterparty)}
      </td>
      <td className="mono-font px-3 py-1.5 text-[10px] tabular-nums text-foreground">
        {entry.amountXrp !== undefined ? `${entry.amountXrp} XRP` : "—"}
      </td>
      <td className="mono-font px-3 py-1.5 text-[10px] tabular-nums text-muted-foreground">
        {entry.feeXrp}
      </td>
      <td className="mono-font px-3 py-1.5 text-[10px] tabular-nums text-muted-foreground">
        {entry.ledgerIndex.toLocaleString()}
      </td>
      <td className="px-3 py-1.5">
        <Badge variant={success ? "go" : "no-go"} className="text-[8px]">
          {entry.result}
        </Badge>
      </td>
      <td className="mono-font px-3 py-1.5 text-[9px] text-muted-foreground/80" title={entry.hash}>
        {entry.date}
        <span className="ml-2 text-muted-foreground/50">
          {truncateMiddle(entry.hash, 4, 4)}
        </span>
      </td>
    </tr>
  );
}
