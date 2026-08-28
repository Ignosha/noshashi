import { useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel, StatCell } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Gated } from "@/components/nova/Gated";
import { Signal } from "@/components/nova/Signal";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { NovaShield, NovaSearch } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shortAddress, isValidAddress } from "@/lib/xrpl/client";
import {
  readControlSurface,
  controlFindings,
  type ControlSurface,
} from "@/lib/desk/control";
import { cn } from "@/lib/utils";
import { TraceButton } from "@/lib/nav/handoff";

/**
 * ControlScene — who can actually move this treasury.
 *
 * The question an institution asks about its own account and rarely gets a
 * straight answer to. The headline figure is deliberately "minimum signers
 * required", not "number of signers": XRPL compares quorum against the sum
 * of signing weights, so a list of five signers where one carries the whole
 * quorum is a single-key account wearing a multi-sig costume. Reporting the
 * count would hide exactly the thing worth knowing.
 */
export function ControlScene({
  onUpgrade,
  onSignIn,
}: {
  onUpgrade: () => void;
  onSignIn: () => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="15"
        kicker="TREASURY CONTROL · SIGNERS · LOCKED VALUE"
        title="CONTROL SURFACE"
        sub="Who can sign for this account, how many of them it takes, and how much of the balance is not actually spendable."
        status="go"
        statusLabel="DESK PLAN"
      />
      <Gated
        feature="portfolios"
        onUpgrade={onUpgrade}
        onSignIn={onSignIn}
        className="min-h-0 flex-1"
      >
        <ControlBody />
      </Gated>
    </div>
  );
}

function ControlBody() {
  const [query, setQuery] = useState("");
  const [surface, setSurface] = useState<ControlSurface | null>(null);
  const [busy, setBusy] = useState(false);
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
    try {
      setSurface(await readControlSurface(address));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That account could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const findings = surface ? controlFindings(surface) : [];
  const spendable = surface
    ? surface.balanceXrp - surface.reserveLockedXrp - surface.escrowedXrp
    : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {surface && (
        <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            {
              label: "MINIMUM SIGNERS",
              value: surface.signers.present
                ? surface.signers.minimumSigners === Infinity
                  ? "∞"
                  : String(surface.signers.minimumSigners)
                : "1",
              tone:
                !surface.signers.present || surface.signers.minimumSigners <= 1
                  ? ("no-go" as const)
                  : ("default" as const),
              caveat: surface.signers.present
                ? `of ${surface.signers.signers.length} · quorum ${surface.signers.quorum}`
                : "no signer list",
            },
            {
              label: "MASTER KEY",
              value: surface.masterKeyEnabled ? "ENABLED" : "DISABLED",
              tone: surface.masterKeyEnabled ? ("hold" as const) : ("default" as const),
              caveat: surface.masterKeyEnabled ? "can sign alone" : "quorum binds",
            },
            {
              label: "LOCKED IN RESERVE",
              value: surface.reserveLockedXrp.toLocaleString(undefined, {
                maximumFractionDigits: 1,
              }),
              tone: "default" as const,
              caveat: `${surface.ownerCount.toLocaleString()} objects · XRP`,
            },
            {
              label: "SPENDABLE",
              value: spendable.toLocaleString(undefined, { maximumFractionDigits: 2 }),
              tone: spendable < 0 ? ("no-go" as const) : ("default" as const),
              caveat: surface.escrowedXrp > 0
                ? `${surface.escrowedXrp.toLocaleString(undefined, { maximumFractionDigits: 2 })} escrowed · XRP`
                : "XRP",
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
          <Panel label="ACCOUNT" className="shrink-0">
            <Label htmlFor="ctl" className="text-[10px] tracking-wide">
              TREASURY OR OPERATING ACCOUNT
            </Label>
            <Input
              id="ctl"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="r…"
              spellCheck={false}
              className="mt-2 font-mono text-[12px]"
            />
            <Button className="mt-3 w-full gap-2" onClick={() => void run()} disabled={busy}>
              <NovaSearch size={14} />
              {busy ? "READING CONTROL STATE…" : "READ CONTROL SURFACE"}
            </Button>
            {error && <p className="mt-3 text-[11px] text-no-go">{error}</p>}
            <p className="mt-3 border-t border-border/50 pt-2.5 text-[10px] leading-relaxed text-faint">
              Quorum is compared against the{" "}
              <span className="text-muted-foreground">sum of signing weights</span>,
              not a count of signers — so five signers where one carries the
              quorum is a single-key account. That is why the headline reads
              minimum signers required.
            </p>
          </Panel>

          {surface?.signers.present && (
            <Panel label="SIGNER LIST" className="min-h-0 flex-1" bodyClassName="min-h-0 overflow-y-auto p-0">
              {surface.signers.signers
                .slice()
                .sort((a, b) => b.weight - a.weight)
                .map((sgn) => {
                  const unilateral =
                    surface.signers.quorum > 0 && sgn.weight >= surface.signers.quorum;
                  return (
                    <div
                      key={sgn.account}
                      className="flex items-center gap-2 border-b border-border/30 px-3.5 py-2.5"
                    >
                      <code className="text-[10.5px] text-muted-foreground">
                        {shortAddress(sgn.account)}
                      </code>
                      <TraceButton
                        value={sgn.account}
                        to="provenance"
                        from="treasury"
                        as="signer"
                      />
                      {unilateral && (
                        <span className="font-mono text-[8.5px] tracking-[0.14em] text-no-go">
                          CAN SIGN ALONE
                        </span>
                      )}
                      <span
                        className={cn(
                          "ml-auto font-mono text-[11px] tabular-nums",
                          unilateral ? "text-no-go" : "text-foreground"
                        )}
                      >
                        {sgn.weight}
                      </span>
                    </div>
                  );
                })}
              <div className="px-3.5 py-2.5">
                <p className="mono-font text-[9px] tabular-nums text-faint">
                  TOTAL WEIGHT {surface.signers.totalWeight} · QUORUM{" "}
                  {surface.signers.quorum}
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
          {!surface ? (
            <EmptyState
              icon={<NovaShield size={16} />}
              title="NO ACCOUNT READ"
              body="Enter a treasury address. NOSHASHI reports who can sign for it, how few of them it takes, whether the master key can bypass the quorum, and how much of the balance is locked rather than spendable."
            />
          ) : (
            <>
              <div className="border-b border-border/50 px-4 py-3">
                <p className="font-mono text-[10px] text-muted-foreground">
                  {shortAddress(surface.address)}
                </p>
                <p className="mt-1 font-mono text-[9px] tabular-nums text-faint">
                  LEDGER {surface.ledgerIndex.toLocaleString()} ·{" "}
                  {surface.balanceXrp.toLocaleString(undefined, { maximumFractionDigits: 2 })} XRP
                  {surface.escrows.length > 0 && ` · ${surface.escrows.length} ESCROWS`}
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
