import { useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel, DataRow } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Gated } from "@/components/nova/Gated";
import { NovaVault, NovaSearch } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shortAddress, isValidAddress } from "@/lib/xrpl/client";
import {
  buildPassport,
  passportToJson,
  passportToCsv,
  type AssetPassport,
} from "@/lib/desk/passport";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "summary", label: "SUMMARY" },
  { id: "authority", label: "AUTHORITY" },
  { id: "concentration", label: "CONCENTRATION" },
  { id: "issuer_posture", label: "ISSUER POSTURE" },
  { id: "domain", label: "DOMAIN" },
  { id: "checks", label: "CHECKS" },
  { id: "history", label: "HISTORY" },
  { id: "export", label: "EXPORT" },
] as const;

export function PassportScene({ onUpgrade, onSignIn }: { onUpgrade: () => void; onSignIn: () => void }) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="31"
        kicker="ASSET PASSPORT · PORTABLE · SIGNED · VERIFIABLE"
        title="ASSET PASSPORT"
        sub="A signed, portable record of an asset’s compliance posture — issuer authority, freeze rights, concentration, domain eligibility — that travels with the asset and can be verified by any counterparty without re-running the checks."
        status="go"
        statusLabel="ENTERPRISE"
      />
      <Gated feature="asset_passports" onUpgrade={onUpgrade} onSignIn={onSignIn} className="min-h-0 flex-1">
        <PassportBody />
      </Gated>
    </div>
  );
}

function PassportBody() {
  const [query, setQuery] = useState("");
  const [passport, setPassport] = useState<AssetPassport | null>(null);
  const [tab, setTab] = useState<string>("summary");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { push } = useToast();

  const run = async () => {
    const issuer = query.trim();
    if (!issuer || busy) return;
    if (!isValidAddress(issuer)) {
      push({ title: "INVALID ADDRESS", body: "Check the issuer and try again.", tone: "no-go" });
      return;
    }
    setBusy(true);
    try {
      const p = await buildPassport({ issuer });
      setPassport(p);
      setTab("summary");
      push({ title: "PASSPORT GENERATED", body: `${shortAddress(issuer)}`, tone: "go" });
    } catch (error) {
      push({
        title: "PASSPORT FAILED",
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "no-go",
      });
    } finally {
      setBusy(false);
    }
  };

  const doExport = async () => {
    if (!passport || exporting) return;
    setExporting(true);
    try {
      const result = await exportPassport(passport);
      push({ title: "PASSPORT EXPORTED", body: `${result.saved.json}`, tone: "go" });
    } catch (error) {
      push({
        title: "EXPORT FAILED",
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "no-go",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPassport(null); }}
          placeholder="Enter issuer address…"
          className="mono-font h-7 flex-1 text-[10px]"
        />
        <Button size="sm" className="gap-2" onClick={() => void run()} disabled={busy}>
          <NovaSearch size={13} />
          {busy ? "GENERATING…" : "GENERATE PASSPORT"}
        </Button>
      </div>

      {passport && (
        <Panel
          label={SECTIONS.find((s) => s.id === tab)?.label ?? "PASSPORT"}
          className="min-h-0 flex-1"
          bodyClassName="min-h-0 overflow-y-auto p-0"
          right={
            <div className="flex items-center gap-2">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setTab(s.id)}
                  className={cn(
                    "border px-2 py-1 text-[10px] tracking-wide transition-colors",
                    tab === s.id
                      ? "border-brand text-brand"
                      : "border-border text-muted hover:text-foreground"
                  )}
                >
                  {s.label}
                </button>
              ))}
              <Button size="sm" variant="outline" onClick={() => void doExport()} disabled={exporting}>
                {exporting ? "EXPORTING…" : "EXPORT"}
              </Button>
            </div>
          }
        >
          <div className="p-3.5">
            {tab === "summary" && (
              <Summary passport={passport} />
            )}
            {tab === "authority" && (
              <AuthoritySection passport={passport} />
            )}
            {tab === "concentration" && (
              <ConcentrationSection passport={passport} />
            )}
            {tab === "issuer_posture" && (
              <IssuerPostureSection passport={passport} />
            )}
            {tab === "domain" && (
              <DomainSection passport={passport} />
            )}
            {tab === "checks" && (
              <ChecksSection passport={passport} />
            )}
            {tab === "history" && (
              <HistorySection passport={passport} />
            )}
            {tab === "export" && (
              <ExportSection passport={passport} />
            )}
          </div>
        </Panel>
      )}

      {!passport && !busy && (
        <EmptyState
          icon={<NovaVault size={16} />}
          title="NO PASSPORT GENERATED"
          body="Enter an issuer address above to generate a signed asset passport. The passport can be exported as JSON or CSV and verified by any counterparty without re-running checks."
        />
      )}
    </div>
  );
}

function Summary({ passport }: { passport: AssetPassport }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Panel bodyClassName="p-3">
          <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">VERDICT</p>
          <p className={cn("data-font mt-1.5 text-[22px] font-[600] leading-none",
            passport.authority.verdict === "no-go" ? "text-no-go"
              : passport.authority.verdict === "hold" ? "text-hold"
              : passport.authority.verdict === "insufficient-data" ? "text-spectral"
              : "text-foreground"
          )}>
            {passport.authority.verdict.toUpperCase()}
          </p>
        </Panel>
        <Panel bodyClassName="p-3">
          <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">CURRENCY</p>
          <p className="data-font mt-1.5 text-[22px] font-[600] leading-none text-foreground">
            {passport.asset.currency}
          </p>
        </Panel>
        <Panel bodyClassName="p-3">
          <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">LEDGER</p>
          <p className="data-font mt-1.5 text-[22px] font-[600] leading-none text-foreground">
            #{passport.authority.ledgerIndex.toLocaleString()}
          </p>
        </Panel>
        <Panel bodyClassName="p-3">
          <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">HOLDERS</p>
          <p className="data-font mt-1.5 text-[22px] font-[600] leading-none text-foreground">
            {passport.issuance.currencies[0]?.holders.toLocaleString() ?? "—"}
          </p>
        </Panel>
      </div>

      <Panel label="ASSET" bodyClassName="p-3.5">
        <DataRow label="ISSUER" value={shortAddress(passport.asset.issuer)} />
        <DataRow label="CURRENCY" value={passport.asset.currency} />
        <DataRow label="DOMAIN" value={passport.asset.domain ?? "—"} />
        <DataRow label="GENERATED" value={new Date(passport.generatedAt).toLocaleString()} />
        <DataRow label="RULES VERSION" value={`v${passport.authority.rulesVersion}`} />
      </Panel>

      <Panel label="RECEIPT" bodyClassName="p-3.5">
        <DataRow label="BODY DIGEST" value={passport.receipt.bodyDigest.slice(0, 32) + "…"} tone="default" />
        <DataRow label="SIGNED DIGEST" value={passport.receipt.signedDigest.slice(0, 32) + "…"} tone="default" />
        <DataRow label="ALGORITHM" value={passport.receipt.algorithm} />
      </Panel>
    </div>
  );
}

function AuthoritySection({ passport }: { passport: AssetPassport }) {
  return (
    <div className="flex flex-col gap-3">
      <Panel label="AUTHORITY VERDICT" bodyClassName="p-3.5">
        <p className="max-w-[600px] text-[11px] leading-relaxed text-muted-foreground">
          This passport certifies the authority state observed at ledger {passport.authority.ledgerIndex.toLocaleString()}.
          The digest binds the body below — any change invalidates it.
        </p>
      </Panel>
      {passport.authority.checks.map((check, i) => (
        <Panel
          key={check.id}
          label={`${check.id} — ${check.label}`}
          bodyClassName="p-3.5"
          corners={i === 0 ? false : undefined}
        >
          <p className="text-[11px] leading-relaxed text-muted-foreground">{check.detail}</p>
        </Panel>
      ))}
    </div>
  );
}

function ConcentrationSection({ passport }: { passport: AssetPassport }) {
  const c = passport.issuance.currencies[0];
  if (!c) {
    return (
      <EmptyState
        icon={<NovaSearch size={16} />}
        title="NO CURRENCY DATA"
        body="This issuer has no outstanding obligations to report."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Panel bodyClassName="p-3">
          <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">OUTSTANDING</p>
          <p className="data-font mt-1.5 text-[22px] font-[600] leading-none text-foreground">
            {c.outstanding.toLocaleString()}
          </p>
        </Panel>
        <Panel bodyClassName="p-3">
          <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">HOLDERS</p>
          <p className="data-font mt-1.5 text-[22px] font-[600] leading-none text-foreground">
            {c.holders.toLocaleString()}
          </p>
        </Panel>
        <Panel bodyClassName="p-3">
          <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">HHI</p>
          <p className={cn("data-font mt-1.5 text-[22px] font-[600] leading-none", c.hhi >= 2500 ? "text-hold" : "text-foreground")}>
            {Math.round(c.hhi).toLocaleString()}
          </p>
        </Panel>
        <Panel bodyClassName="p-3">
          <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">COVERAGE</p>
          <p className="data-font mt-1.5 text-[22px] font-[600] leading-none text-foreground">
            {(c.coverage * 100).toFixed(1)}%
          </p>
        </Panel>
      </div>

      <Panel label="CONCENTRATION DETAIL" bodyClassName="p-3.5">
        <DataRow label="OBSERVED HELD" value={c.observedHeld.toLocaleString()} />
        <DataRow label="ACTIVE HOLDERS" value={c.activeHolders.toLocaleString()} />
        <DataRow label="TOP HOLDER" value={`${(c.topHolderPct * 100).toFixed(1)}%`} tone={c.topHolderPct > 0.5 ? "hold" : "default"} />
        <DataRow label="TOP FIVE" value={`${(c.topFivePct * 100).toFixed(1)}%`} tone={c.topFivePct > 0.7 ? "hold" : "default"} />
        <DataRow label="FROZEN SEEN" value={c.frozenSeen.toLocaleString()} tone={c.frozenSeen > 0 ? "hold" : "default"} />
        <DataRow label="AUTHORIZED SEEN" value={c.authorizedSeen.toLocaleString()} />
      </Panel>
    </div>
  );
}

function IssuerPostureSection({ passport }: { passport: AssetPassport }) {
  return (
    <div className="flex flex-col gap-3">
      <Panel label="ISSUER POSTURE" bodyClassName="p-3.5">
        <DataRow label="CAN FREEZE" value={passport.issuance.canFreeze ? "YES" : "NO"} tone={passport.issuance.canFreeze ? "hold" : "go"} />
        <DataRow label="GLOBAL FREEZE" value={passport.issuance.globalFreeze ? "ACTIVE" : "NO"} tone={passport.issuance.globalFreeze ? "no-go" : "go"} />
        <DataRow label="REQUIRES AUTH" value={passport.issuance.requiresAuth ? "YES" : "NO"} tone={passport.issuance.requiresAuth ? "hold" : "go"} />
        <DataRow label="READ AT" value={new Date(passport.issuance.readAt).toLocaleString()} />
      </Panel>
      {passport.findings.length > 0 && (
        <Panel label="FINDINGS" bodyClassName="p-3.5">
          {passport.findings.map((f) => (
            <div key={f.id} className={cn("border-b border-border/40 py-2 last:border-0")}>
              <p className="text-[11px] font-medium text-foreground">{f.title}</p>
              <p className="text-[10px] leading-relaxed text-muted-foreground">{f.detail}</p>
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}

function DomainSection({ passport }: { passport: AssetPassport }) {
  return (
    <Panel label="DOMAIN" bodyClassName="p-3.5">
      <DataRow label="DOMAIN" value={passport.asset.domain ?? "—"} />
    </Panel>
  );
}

function ChecksSection({ passport }: { passport: AssetPassport }) {
  return (
    <div className="flex flex-col gap-3">
      <Panel label={`VERDICT: ${passport.authority.verdict.toUpperCase()}`} bodyClassName="p-3.5">
        <p className="max-w-[600px] text-[11px] leading-relaxed text-muted-foreground">
          {passport.authority.verdict === "go" && "No unilateral authority found over this issuance at this ledger."}
          {passport.authority.verdict === "hold" && "Authority exists but is constrained — a quorum, no clawback."}
          {passport.authority.verdict === "no-go" && "A single party can freeze, seize or reissue."}
          {passport.authority.verdict === "insufficient-data" && "A source needed to reach a conclusion could not be read at this ledger."}
        </p>
      </Panel>
      <Panel label="CAVEATS" bodyClassName="p-3.5">
        {passport.caveats.map((c, i) => (
          <DataRow key={i} label={c.readonly ? "READONLY" : "EDITABLE"} value={c.caveat} />
        ))}
      </Panel>
    </div>
  );
}

function HistorySection({ passport }: { passport: AssetPassport }) {
  return (
    <div className="flex flex-col gap-3">
      <Panel label="RECEIPT" bodyClassName="p-3.5">
        <DataRow label="BODY DIGEST" value={passport.receipt.bodyDigest} />
        <DataRow label="SIGNED DIGEST" value={passport.receipt.signedDigest} />
        <DataRow label="ALGORITHM" value={passport.receipt.algorithm} />
      </Panel>
      <Panel label="PRESENTER" bodyClassName="p-3.5">
        <DataRow label="NAME" value={passport.presenter.name} />
        <DataRow label="CONTACT" value={passport.presenter.contact} />
        <DataRow label="JURISDICTION" value={passport.presenter.jurisdiction} />
      </Panel>
    </div>
  );
}

function ExportSection({ passport }: { passport: AssetPassport }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="flex flex-col gap-3">
      <Panel label="JSON" bodyClassName="p-3.5">
        <pre className="mono-font max-h-[300px] overflow-auto rounded-md border border-border bg-background p-2.5 text-[9px] leading-relaxed text-muted-foreground">
          {JSON.stringify(passport, null, 2)}
        </pre>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void copy(JSON.stringify(passport, null, 2), "JSON")}>
            {copied === "JSON" ? "COPIED" : "COPY JSON"}
          </Button>
        </div>
      </Panel>
      <Panel label="CSV" bodyClassName="p-3.5">
        <pre className="mono-font max-h-[300px] overflow-auto rounded-md border border-border bg-background p-2.5 text-[9px] leading-relaxed text-muted-foreground">
          {passportToCsv(passport)}
        </pre>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void copy(passportToCsv(passport), "CSV")}>
            {copied === "CSV" ? "COPIED" : "COPY CSV"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

async function exportPassport(passport: AssetPassport) {
  const json = passportToJson(passport);
  const csv = passportToCsv(passport);
  const base = `passport-${passport.asset.currency ?? passport.asset.issuer.slice(0, 8)}`;
  const stamp = passport.generatedAt.slice(0, 10);

  const { saveTextFile } = await import("@/lib/export");
  const savedJson = await saveTextFile(`${base}-${stamp}.json`, json, "application/json");
  const savedCsv = await saveTextFile(`${base}-${stamp}.csv`, csv, "text/csv");

  return { json, csv, saved: { json: savedJson, csv: savedCsv } };
}
