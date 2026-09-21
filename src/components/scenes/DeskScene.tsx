import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SceneHeader } from "./SceneHeader";
import { Panel, DataRow, Eyebrow } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { StatusDot } from "@/components/nova/StatusDot";
import { CountUp } from "@/components/nova/CountUp";
import { Gated } from "@/components/nova/Gated";
import { Announcer } from "@/components/nova/A11y";
import { NovaCredit, NovaGrid, NovaSat, NovaShield } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shortAddress } from "@/lib/xrpl/client";
import { usePortfolio, deriveAlerts, type DeskAlert } from "@/lib/desk/portfolio";
import { useToast } from "@/lib/toast";
import { DOMAIN_REGISTRY } from "@/lib/policy";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

const severityTone: Record<DeskAlert["severity"], "go" | "hold" | "no-go"> = {
  info: "go",
  warn: "hold",
  critical: "no-go",
};

/**
 * DeskScene — the paid book view.
 *
 * A trading desk does not watch one wallet; it watches a book and needs
 * to know the moment any of them stops being able to settle. The
 * portfolio runs the same gate across every account, and the radar turns
 * the results into things worth waking someone up for.
 */
export function DeskScene({
  onUpgrade,
  onSignIn,
}: {
  onUpgrade: () => void;
  onSignIn: () => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="11"
        kicker="DESK · MULTI-WALLET SURVEILLANCE"
        title="PORTFOLIO & RADAR"
        sub="Every account in the book, evaluated against the same rule set, with the failures surfaced first."
        status="go"
        statusLabel="DESK PLAN"
      />
      <Gated
        feature="portfolios"
        onUpgrade={onUpgrade}
        onSignIn={onSignIn}
        className="min-h-0 flex-1"
      >
        <DeskBody />
      </Gated>
    </div>
  );
}

function DeskBody() {
  const { snapshots, loading, error, addWallet, removeWallet, refresh, wallets } =
    usePortfolio();
  const { push } = useToast();

  const [view, setView] = useState<"book" | "radar">("book");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const alerts = useMemo(() => deriveAlerts(snapshots), [snapshots]);
  const critical = alerts.filter((alert) => alert.severity === "critical").length;
  const blocked = snapshots.filter((snapshot) => snapshot.verdict === "no-go").length;
  /**
   * A wallet that could not be read contributes nothing, and that has to be
   * visible.
   *
   * This summed `balanceXrp ?? 0` across every snapshot, so an unreadable
   * wallet silently added zero and the total rendered to two decimal places
   * as though it were complete. A book balance that quietly excludes wallets
   * is worse than no book balance — it is a precise-looking number that is
   * wrong by an unknown amount.
   */
  const readable = snapshots.filter((snapshot) => snapshot.account !== undefined);
  const unreadable = snapshots.length - readable.length;
  const totalXrp = readable.reduce(
    (sum, snapshot) => sum + Number(snapshot.account?.balanceXrp ?? 0),
    0
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (adding) return;
    setAdding(true);
    try {
      await addWallet(address, label);
      setAddress("");
      setLabel("");
      push({ title: "WALLET ADDED", body: "Reading ledger state.", tone: "go" });
    } catch (caught) {
      push({
        title: "COULD NOT ADD WALLET",
        body: caught instanceof Error ? caught.message : "Unknown error",
        tone: "no-go",
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Announcer
        message={
          critical > 0
            ? `${critical} critical compliance alert${critical === 1 ? "" : "s"} in the portfolio.`
            : ""
        }
        assertive
      />

      {/* Summary strip */}
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "WALLETS WATCHED", value: snapshots.length, tone: "default" as const },
          { label: "BLOCKED", value: blocked, tone: blocked > 0 ? ("no-go" as const) : ("default" as const) },
          { label: "CRITICAL ALERTS", value: critical, tone: critical > 0 ? ("no-go" as const) : ("default" as const) },
          {
            label: unreadable > 0 ? "BOOK BALANCE — PARTIAL" : "BOOK BALANCE",
            value: totalXrp,
            tone: unreadable > 0 ? ("hold" as const) : ("default" as const),
            decimals: 2,
            suffix: "XRP",
            caveat:
              unreadable > 0
                ? `${unreadable} of ${snapshots.length} wallets unreadable — excluded`
                : undefined,
          },
        ].map((stat) => (
          <Panel key={stat.label} bodyClassName="p-3">
            <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
              {stat.label}
            </p>
            <p
              className={cn(
                "data-font mt-1.5 text-[22px] font-[600] leading-none",
                stat.tone === "no-go"
                  ? "text-no-go"
                  : stat.tone === "hold"
                    ? "text-hold"
                    : "text-foreground"
              )}
            >
              <CountUp value={stat.value} decimals={stat.decimals ?? 0} />
              {stat.suffix && (
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                  {stat.suffix}
                </span>
              )}
            </p>
            {stat.caveat && (
              <p className="mono-font mt-1.5 text-[9px] leading-snug text-hold">
                {stat.caveat}
              </p>
            )}
          </Panel>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-5 gap-3">
        <Panel
          label={view === "book" ? "THE BOOK" : "COMPLIANCE RADAR"}
          corners
          className="col-span-3 min-h-0"
          bodyClassName="min-h-0 overflow-y-auto p-0"
          right={
            <div className="flex items-center gap-2">
              <Tabs value={view} onValueChange={(value) => setView(value as "book" | "radar")}>
                <TabsList>
                  <TabsTrigger value="book">BOOK</TabsTrigger>
                  <TabsTrigger value="radar">
                    RADAR{alerts.length > 0 ? ` ·${alerts.length}` : ""}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Button size="sm" variant="outline" onClick={() => void refresh()}>
                RESCAN
              </Button>
            </div>
          }
        >
          <AnimatePresence mode="wait">
            {view === "book" ? (
              <motion.div
                key="book"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {snapshots.length === 0 ? (
                  <EmptyState
                    icon={<NovaGrid size={16} />}
                    title={loading ? "LOADING BOOK…" : "NO WALLETS WATCHED YET"}
                    body={
                      error ??
                      "Add an XRPL account on the right and the gate will run against it continuously."
                    }
                  />
                ) : (
                  <table className="w-full text-left">
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr className="border-b border-border">
                        {["", "LABEL", "ADDRESS", "BALANCE", "CREDS", "FAILING", ""].map(
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
                      {snapshots.map((snapshot) => (
                        <tr
                          key={snapshot.address}
                          className="border-b border-border/30 transition-colors hover:bg-secondary/40"
                        >
                          <td className="px-3 py-2">
                            {snapshot.loading ? (
                              <span className="mono-font animate-pulse text-[9px] text-muted-foreground">
                                ···
                              </span>
                            ) : (
                              <StatusDot status={snapshot.verdict} size={6} />
                            )}
                          </td>
                          <td className="px-3 py-2 text-[10.5px] text-foreground">
                            {snapshot.label ?? "—"}
                          </td>
                          <td className="mono-font selectable px-3 py-2 text-[10px] text-muted-foreground">
                            {shortAddress(snapshot.address)}
                          </td>
                          <td className="mono-font px-3 py-2 text-[10px] tabular-nums text-foreground">
                            {snapshot.error
                              ? "—"
                              : Number(snapshot.account?.balanceXrp ?? 0).toLocaleString(
                                  undefined,
                                  { maximumFractionDigits: 2 }
                                )}
                          </td>
                          <td className="mono-font px-3 py-2 text-[10px] tabular-nums text-muted-foreground">
                            {snapshot.credentials.length}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={snapshot.failing === 0 ? "go" : "no-go"}
                              className="text-[8px]"
                            >
                              {snapshot.error ? "ERROR" : `${snapshot.failing}`}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() =>
                                void removeWallet(
                                  wallets.find((w) => w.address === snapshot.address)?.id ?? ""
                                )
                              }
                              aria-label={`Remove ${snapshot.address} from the book`}
                              className="stencil text-[8px] tracking-[0.18em] text-muted-foreground transition-colors hover:text-no-go"
                            >
                              REMOVE
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="radar"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-3"
              >
                {alerts.length === 0 ? (
                  <EmptyState
                    icon={<NovaShield size={16} />}
                    title="NOTHING TO REPORT"
                    body="No expiring credentials, no reserve pressure, and no domain has moved against this book."
                  />
                ) : (
                  <div className="space-y-2">
                    {alerts.map((alert, index) => (
                      <motion.div
                        key={alert.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ ...SPRING, delay: Math.min(0.3, index * 0.03) }}
                        className={cn(
                          "flex gap-3 border-l-2 border border-border bg-card/50 p-3",
                          alert.severity === "critical" && "border-l-no-go",
                          alert.severity === "warn" && "border-l-hold",
                          alert.severity === "info" && "border-l-go"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-[11px] font-medium text-foreground">
                              {alert.title}
                            </p>
                            <Badge
                              variant={severityTone[alert.severity]}
                              className="shrink-0 text-[7px]"
                            >
                              {alert.severity.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                            {alert.body}
                          </p>
                        </div>
                        <span className="mono-font shrink-0 self-start text-[8px] uppercase tracking-wider text-muted-foreground/60">
                          {alert.kind.replace(/_/g, " ")}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>

        <div className="col-span-2 flex min-h-0 flex-col gap-3">
          <Panel label="ADD TO BOOK" corners className="shrink-0">
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label htmlFor="desk-address">XRPL ADDRESS</Label>
                <Input
                  id="desk-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  spellCheck={false}
                  required
                  className="mono-font mt-1.5 text-[11px]"
                  placeholder="r…"
                />
              </div>
              <div>
                <Label htmlFor="desk-label">LABEL (OPTIONAL)</Label>
                <Input
                  id="desk-label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  className="mt-1.5 text-[11px]"
                  placeholder="Treasury · hot wallet"
                />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={adding}>
                <NovaCredit size={13} />
                {adding ? "ADDING…" : "WATCH THIS ACCOUNT"}
              </Button>
            </form>
          </Panel>

          <Panel label="BOOK EXPOSURE" className="min-h-0 flex-1" bodyClassName="overflow-y-auto p-3">
            <Eyebrow className="mb-2">ELIGIBILITY ACROSS DOMAINS</Eyebrow>
            {snapshots.length === 0 ? (
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Add a wallet to see which domains this book can settle into.
              </p>
            ) : (
              <div className="space-y-2">
                {DOMAIN_REGISTRY.map((domain) => {
                  const eligible = snapshots.filter((snapshot) =>
                    domain.requirements.every((requirement) =>
                      snapshot.credentials.some(
                        (credential) =>
                          credential.credentialType.toUpperCase() === requirement &&
                          credential.accepted &&
                          !credential.revoked
                      )
                    )
                  ).length;
                  return (
                    <DataRow
                      key={domain.id}
                      label={domain.code}
                      value={`${eligible}/${snapshots.length}`}
                      tone={
                        eligible === snapshots.length
                          ? "go"
                          : eligible > 0
                            ? "hold"
                            : "no-go"
                      }
                    />
                  );
                })}
              </div>
            )}

            <Eyebrow className="mb-1.5 mt-4">RADAR COVERAGE</Eyebrow>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <NovaSat size={12} />
              Reserve, credential expiry, policy drift and domain governance.
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
