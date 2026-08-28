import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SceneHeader } from "./SceneHeader";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { Panel, DataRow, Eyebrow } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { StatusDot } from "@/components/nova/StatusDot";
import { NovaBolt, NovaShield, NovaTerminal, NovaVault } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/nova/Kbd";
import { isValidAddress } from "@/lib/xrpl/client";
import { truncateMiddle } from "@/lib/format";
import {
  DOMAIN_REGISTRY,
  VERDICT_COPY,
  runPolicy,
  type PermissionedDomain,
  type PolicyReceipt,
} from "@/lib/policy";
import { useToast } from "@/lib/toast";
import { useLedger, receiptToEntry } from "@/lib/desk/ledger";
import { useOfflineVault } from "@/lib/desk/offline";
import { sendNativeNotification } from "@/lib/notifications";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import type { Status } from "@/lib/xrpl/types";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

const verdictText: Record<Status, string> = {
  go: "text-go",
  hold: "text-hold",
  "no-go": "text-no-go",
};

const verdictBorder: Record<Status, string> = {
  go: "border-go/50",
  hold: "border-hold/50",
  "no-go": "border-no-go/50",
};

/**
 * VerificationScene — the Smart Transaction Engine.
 *
 * A settlement is described, evaluated against a Permissioned Domain's
 * rule set, and answered with GO / HOLD / NO-GO plus a tamper-evident
 * receipt. Nothing is broadcast here: this is the check that runs
 * *before* a transaction is ever signed.
 */
export function VerificationScene({ data }: { data: XrplState }) {
  const {
    account: liveAccount,
    credentials: liveCredentials,
    connected,
  } = data;
  const { push } = useToast();
  const { append } = useLedger();
  const vault = useOfflineVault();

  const [domainId, setDomainId] = useState(DOMAIN_REGISTRY[0].id);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("100");
  const [running, setRunning] = useState(false);
  const [receipt, setReceipt] = useState<PolicyReceipt | null>(null);
  const [log, setLog] = useState<PolicyReceipt[]>([]);

  // When offline mode is engaged the engine adjudicates against captured
  // state rather than the live read. Same rules, same digest algorithm —
  // only the inputs differ, and the receipt says so.
  const account = vault.engaged ? vault.active!.account : liveAccount;
  const credentials = vault.engaged ? vault.active!.credentials : liveCredentials;

  const domain = useMemo(
    () => DOMAIN_REGISTRY.find((entry) => entry.id === domainId) ?? DOMAIN_REGISTRY[0],
    [domainId]
  );

  const amountXrp = Number(amount);
  const amountValid = Number.isFinite(amountXrp) && amountXrp >= 0;
  const destinationValid = destination.trim() === "" || isValidAddress(destination);
  const canRun = amountValid && destinationValid && !running;

  const execute = async () => {
    if (!canRun) return;
    setRunning(true);
    try {
      // A visible dwell makes the verdict feel adjudicated rather than
      // guessed; the evaluation itself is sub-millisecond.
      const [result] = await Promise.all([
        runPolicy({ account, credentials, domain, amountXrp }),
        new Promise((resolve) => setTimeout(resolve, 620)),
      ]);
      setReceipt(result);
      setLog((prev) => [result, ...prev].slice(0, 12));

      // The durable record. A session log is a convenience; this is the
      // thing that still exists when an examiner asks in six months.
      void append(
        receiptToEntry(result, {
          domainCode: domain.code,
          offline: vault.engaged,
        })
      );

      push({
        title: `GATE ${VERDICT_COPY[result.verdict].title}`,
        body: `${domain.code} · ${result.checks.filter((check) => check.passed).length}/${result.checks.length} rules passed${vault.engaged ? " · OFFLINE STATE" : ""}`,
        tone: result.verdict,
      });
      void sendNativeNotification({
        title: `NOSHASHI · ${VERDICT_COPY[result.verdict].title}`,
        body: `${domain.name} — receipt ${result.digest.slice(0, 12)}`,
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <SceneHeader
        index="02"
        kicker={
          vault.engaged
            ? "SMART TRANSACTION ENGINE · SNAPSHOT STATE"
            : "SMART TRANSACTION ENGINE"
        }
        title="VERIFICATION"
        sub="Evaluate a settlement against a Permissioned Domain before it is ever signed. Nothing here touches the ledger."
        status={vault.engaged ? "hold" : connected ? "go" : "hold"}
        statusLabel={
          vault.engaged
            ? `OFFLINE · LEDGER ${vault.active!.ledgerIndex.toLocaleString()}`
            : connected
              ? "ENGINE READY"
              : "AWAITING LINK"
        }
        right={
          <span className="flex items-center gap-2">
            <Kbd keys="mod+enter" />
            <span className="stencil text-[8px] tracking-[0.2em] text-muted-foreground">
              RUN
            </span>
          </span>
        }
      />

      {vault.engaged && vault.staleness && (
        <div
          className={cn(
            "border px-3 py-2",
            vault.staleness.severity === "critical"
              ? "border-no-go/50 bg-no-go/5"
              : "border-hold/50 bg-hold/5"
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusDot status={vault.staleness.severity === "critical" ? "no-go" : "hold"} />
            <span className="stencil text-[9px] tracking-[0.2em]">
              ADJUDICATING AGAINST CAPTURED STATE · {vault.staleness.label.toUpperCase()}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            {vault.staleness.disclosure}
          </p>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-5 gap-3">
        {/* Left — the settlement being described */}
        <div className="col-span-2 flex min-h-0 flex-col gap-3">
          <Panel label="SETTLEMENT" corners className="shrink-0">
            <div className="space-y-3">
              <div>
                <Label htmlFor="destination">DESTINATION ACCOUNT</Label>
                <Input
                  id="destination"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      void execute();
                    }
                  }}
                  placeholder="r… (optional — policy is subject-scoped)"
                  className="mono-font selectable mt-1.5 text-[11px]"
                  spellCheck={false}
                />
                {!destinationValid && (
                  <p className="mt-1 text-[9px] text-no-go">
                    Not a valid XRPL classic address.
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="amount">AMOUNT (XRP)</Label>
                <Input
                  id="amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void execute();
                  }}
                  inputMode="decimal"
                  className="mono-font selectable mt-1.5 text-[11px]"
                />
                {!amountValid && (
                  <p className="mt-1 text-[9px] text-no-go">
                    Enter a non-negative number.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {[100, 1_000, 25_000, 500_000].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setAmount(String(preset))}
                    className="mono-font border border-border px-2 py-0.5 text-[9px] tabular-nums text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                  >
                    {preset.toLocaleString()}
                  </button>
                ))}
              </div>

              <Button
                className="w-full gap-2"
                onClick={() => void execute()}
                disabled={!canRun}
              >
                {running ? (
                  <>
                    <NovaBolt size={14} className="animate-spin-slow" />
                    EVALUATING…
                  </>
                ) : (
                  <>
                    <NovaShield size={14} />
                    RUN COMPLIANCE GATE
                  </>
                )}
              </Button>
            </div>
          </Panel>

          <Panel
            label="TARGET DOMAIN"
            className="min-h-0 flex-1"
            bodyClassName="overflow-y-auto p-2"
            right={
              <span className="mono-font text-[9px] text-muted-foreground">
                XLS-80
              </span>
            }
          >
            <div className="space-y-1">
              {DOMAIN_REGISTRY.map((entry) => (
                <DomainOption
                  key={entry.id}
                  domain={entry}
                  selected={entry.id === domain.id}
                  onSelect={() => setDomainId(entry.id)}
                />
              ))}
            </div>
          </Panel>
        </div>

        {/* Centre — the verdict */}
        <div className="col-span-2 flex min-h-0 flex-col gap-3">
          <Panel
            label="VERDICT"
            corners
            className="min-h-0 flex-1"
            bodyClassName="relative flex min-h-0 flex-col p-0"
            right={
              receipt && (
                <span className="mono-font text-[9px] tabular-nums text-muted-foreground">
                  {receipt.latencyMs}ms
                </span>
              )
            }
          >
            <PatternMark element="orbit" size={190} className="-bottom-14 -right-14" opacity={0.07} />

            <AnimatePresence mode="wait">
              {running ? (
                <motion.div
                  key="running"
                  className="flex flex-1 flex-col items-center justify-center gap-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.span
                    className="h-10 w-10 border border-foreground/40"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
                  />
                  <p className="mono-font text-[10px] tracking-[0.2em] text-muted-foreground caret">
                    ADJUDICATING RULE SET
                  </p>
                </motion.div>
              ) : receipt ? (
                <motion.div
                  key={receipt.digest}
                  className="flex min-h-0 flex-1 flex-col"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={SPRING}
                >
                  <div
                    className={cn(
                      "flex shrink-0 flex-col items-center gap-2 border-b px-4 py-5",
                      verdictBorder[receipt.verdict]
                    )}
                  >
                    <span
                      className={cn(
                        "display stamp-in text-[42px] font-[900] leading-none",
                        verdictText[receipt.verdict]
                      )}
                    >
                      {VERDICT_COPY[receipt.verdict].title}
                    </span>
                    <p className="max-w-[280px] text-center text-[10px] leading-relaxed text-muted-foreground">
                      {VERDICT_COPY[receipt.verdict].blurb}
                    </p>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    <Eyebrow className="mb-2">RULE EVALUATION</Eyebrow>
                    {receipt.checks.map((check, index) => (
                      <motion.div
                        key={check.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.08 + index * 0.04 }}
                        className="flex items-start gap-2 border-b border-border/30 py-1.5 last:border-0"
                      >
                        <span
                          className={cn(
                            "mt-1 h-1.5 w-1.5 shrink-0",
                            check.passed
                              ? "bg-go"
                              : check.severity === "block"
                                ? "bg-no-go"
                                : "bg-hold"
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="mono-font text-[9px] text-foreground/85">
                            {check.id}
                          </p>
                          <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
                            {check.detail}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "stencil shrink-0 text-[8px] tracking-[0.18em]",
                            check.passed
                              ? "text-go"
                              : check.severity === "block"
                                ? "text-no-go"
                                : "text-hold"
                          )}
                        >
                          {check.passed
                            ? "PASS"
                            : check.severity === "block"
                              ? "BLOCK"
                              : "WARN"}
                        </span>
                      </motion.div>
                    ))}
                  </div>

                  <div className="shrink-0 border-t border-border p-3">
                    <Eyebrow className="mb-1.5">CRYPTOGRAPHIC RECEIPT</Eyebrow>
                    <p className="mono-font selectable break-all text-[9px] leading-relaxed text-foreground/80">
                      {receipt.digest}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="mono-font text-[9px] text-muted-foreground">
                        SHA-256 · {new Date(receipt.evaluatedAt).toLocaleTimeString()}
                      </span>
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(receipt.digest);
                          push({ title: "RECEIPT COPIED", tone: "info" });
                        }}
                        className="stencil text-[8px] tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        COPY
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  className="flex flex-1 items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <EmptyState
                    icon={<NovaVault size={16} />}
                    title="NO EVALUATION YET"
                    body="Describe a settlement and run the gate. The engine answers with an explainable verdict and a receipt you can hand to an auditor."
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </Panel>
        </div>

        {/* Right — domain detail and session log */}
        <div className="col-span-1 flex min-h-0 flex-col gap-3">
          <Panel label="DOMAIN POLICY" className="shrink-0">
            <p className="display text-[11px] font-[600] leading-tight text-foreground">
              {domain.name}
            </p>
            <p className="mt-0.5 text-[9px] text-muted-foreground">
              {domain.institution}
            </p>
            <div className="mt-3">
              <DataRow
                label="CEILING"
                value={
                  domain.transferCeilingXrp > 0
                    ? `${domain.transferCeilingXrp.toLocaleString()} XRP`
                    : "CLOSED"
                }
                tone={domain.transferCeilingXrp > 0 ? "default" : "no-go"}
              />
              <DataRow
                label="GOVERNANCE"
                value={domain.governance.toUpperCase()}
                tone={
                  domain.governance === "active"
                    ? "go"
                    : domain.governance === "review"
                      ? "hold"
                      : "no-go"
                }
              />
              <DataRow label="MEMBERS" value={domain.members.toLocaleString()} />
            </div>
            <Eyebrow className="mb-1.5 mt-3">REQUIRED CREDENTIALS</Eyebrow>
            <div className="flex flex-wrap gap-1">
              {domain.requirements.map((requirement) => {
                const held = credentials.some(
                  (credential) =>
                    credential.credentialType.toUpperCase() === requirement &&
                    credential.accepted &&
                    !credential.revoked
                );
                return (
                  <span
                    key={requirement}
                    className={cn(
                      "mono-font border px-1.5 py-0.5 text-[8px] tracking-wide",
                      held
                        ? "border-go/40 bg-go-dim text-go"
                        : "border-no-go/40 bg-no-go-dim text-no-go"
                    )}
                  >
                    {requirement}
                  </span>
                );
              })}
            </div>
          </Panel>

          <Panel
            label="SESSION LOG"
            className="min-h-0 flex-1"
            bodyClassName="overflow-y-auto p-2"
            right={
              <span className="mono-font text-[9px] tabular-nums text-muted-foreground">
                {log.length}
              </span>
            }
          >
            {log.length === 0 ? (
              <p className="px-1 py-4 text-center text-[9px] leading-relaxed text-muted-foreground">
                Evaluations recorded this session appear here.
              </p>
            ) : (
              <div className="space-y-1">
                {log.map((entry) => (
                  <button
                    key={entry.digest}
                    onClick={() => setReceipt(entry)}
                    className={cn(
                      "flex w-full items-center gap-2 border border-border px-2 py-1.5 text-left transition-colors hover:border-foreground/40",
                      receipt?.digest === entry.digest && "border-foreground/50 bg-secondary/50"
                    )}
                  >
                    <StatusDot status={entry.verdict} size={5} />
                    <span className="mono-font min-w-0 flex-1 truncate text-[9px] text-foreground/80">
                      {truncateMiddle(entry.digest, 6, 4)}
                    </span>
                    <span className="mono-font shrink-0 text-[8px] tabular-nums text-muted-foreground">
                      {entry.amountXrp.toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function DomainOption({
  domain,
  selected,
  onSelect,
}: {
  domain: PermissionedDomain;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 border px-2.5 py-2 text-left transition-colors",
        selected
          ? "border-foreground/60 bg-secondary/60"
          : "border-border hover:border-foreground/30 hover:bg-card"
      )}
    >
      <span
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center border",
          selected ? "border-foreground text-foreground" : "border-border text-muted-foreground"
        )}
      >
        <NovaTerminal size={11} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="mono-font block truncate text-[10px] text-foreground">
          {domain.name}
        </span>
        <span className="block truncate text-[9px] text-muted-foreground">
          {domain.requirements.length} credential
          {domain.requirements.length === 1 ? "" : "s"} · {domain.institution}
        </span>
      </span>
      <Badge
        variant={
          domain.governance === "active"
            ? "go"
            : domain.governance === "review"
              ? "hold"
              : "no-go"
        }
        className="shrink-0 text-[8px]"
      >
        {domain.code}
      </Badge>
    </button>
  );
}
