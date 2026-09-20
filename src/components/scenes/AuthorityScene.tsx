import { useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel, StatCell } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Gated } from "@/components/nova/Gated";
import { Signal } from "@/components/nova/Signal";
import { PatternField } from "@/components/nova/brand/BrandPattern";
import { NovaShield, NovaSearch } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { shortAddress, isValidAddress } from "@/lib/xrpl/client";
import {
  certifyAuthority,
  AUTHORITY_VERDICT_COPY,
  type AuthorityCertificate,
} from "@/lib/desk/authority";
import { cn } from "@/lib/utils";
import { TraceButton } from "@/lib/nav/handoff";

/**
 * AuthorityScene — what authority the issuer has kept.
 *
 * The screen for src/lib/desk/authority.ts. Two things it deliberately
 * does not draw, both of which a reviewer will look for:
 *
 *   No score. There is no ring, no 0–100, no grade. The module refuses
 *   to compute one and the screen refuses to imply one, because a
 *   composite would be argued with instead of the facts under it.
 *
 *   No legal wording. Nothing here says "decentralised", "sufficiently
 *   decentralised", "compliant" or "security". That finding belongs to
 *   an agency applying statutory criteria. What is on screen is what
 *   the ledger says about who can still act, and the footer says so in
 *   as many words rather than burying it.
 *
 * Every reading carries the ledger index it was taken at, because an
 * issuer's authority is a property of a ledger and not of a name. The
 * digest is shown in full rather than truncated: a digest a reader
 * cannot copy is decoration.
 */
export function AuthorityScene({
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
        kicker="ISSUER AUTHORITY · FREEZE · QUORUM · CONCENTRATION"
        title="AUTHORITY CERTIFICATE"
        sub="What the issuer of this asset can still do to it, read from validated ledger state and digested so the reading can be checked again later."
        status="go"
        statusLabel="PRO PLAN"
      />
      <Gated
        feature="authority_certificate"
        onUpgrade={onUpgrade}
        onSignIn={onSignIn}
        className="min-h-0 flex-1"
      >
        <AuthorityBody />
      </Gated>
    </div>
  );
}

/** Blocking failures are critical; advisory ones warn; passes read ok. */
function severityOf(check: { severity: "block" | "warn"; passed: boolean }) {
  if (check.passed) return "ok" as const;
  return check.severity === "block" ? ("critical" as const) : ("warn" as const);
}

function AuthorityBody() {
  const [query, setQuery] = useState("");
  const [walkSupply, setWalkSupply] = useState(true);
  const [certificate, setCertificate] = useState<AuthorityCertificate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    const issuer = query.trim();
    if (!issuer || busy) return;
    if (!isValidAddress(issuer)) {
      setError("That is not a valid XRPL address.");
      return;
    }
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setCertificate(await certifyAuthority(issuer, { walkSupply }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That issuer could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const copyDigest = async () => {
    if (!certificate) return;
    try {
      await navigator.clipboard.writeText(certificate.digest);
      setCopied(true);
    } catch {
      // A clipboard the webview refuses is not worth an error banner —
      // the digest is on screen in full and can be selected by hand.
    }
  };

  const verdict = certificate ? AUTHORITY_VERDICT_COPY[certificate.verdict] : null;
  const failing = certificate?.checks.filter((check) => !check.passed).length ?? 0;
  const blocking =
    certificate?.checks.filter((check) => !check.passed && check.severity === "block").length ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {certificate && (
        <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCell
            label="VERDICT"
            // The three-state word, not the sentence. The sentence is the
            // findings header; a stat cell that wraps to three lines stops
            // being a reading you can take in at a glance.
            value={certificate.verdict.toUpperCase()}
            caveat={
              blocking > 0
                ? `${blocking} blocking`
                : failing > 0
                  ? `${failing} advisory`
                  : "nothing outstanding"
            }
            tone={
              certificate.verdict === "no-go"
                ? "no-go"
                : certificate.verdict === "hold"
                  ? "hold"
                  : "default"
            }
          />
          <StatCell
            label="CHECKS PASSED"
            value={`${certificate.checks.length - failing}/${certificate.checks.length}`}
            caveat={certificate.currency ? `scoped to ${certificate.currency}` : "flags only"}
            tone={failing > 0 ? "hold" : "default"}
          />
          <StatCell
            label="LEDGER"
            value={certificate.ledgerIndex.toLocaleString()}
            caveat="validated at read"
          />
          <StatCell
            label="SUPPLY WALK"
            value={certificate.currency ? "WALKED" : "SKIPPED"}
            caveat={
              certificate.currency
                ? "concentration measured"
                : "concentration abstained"
            }
            tone={certificate.currency ? "default" : "hold"}
          />
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
          <Panel label="ISSUER" className="shrink-0">
            <Label htmlFor="authority-issuer" className="text-[10px] tracking-wide">
              ISSUING ACCOUNT
            </Label>
            <Input
              id="authority-issuer"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="r…"
              spellCheck={false}
              className="mt-2 font-mono text-[12px]"
            />

            <label className="mt-3 flex cursor-pointer items-start gap-2.5">
              <Switch
                checked={walkSupply}
                onCheckedChange={(next: boolean) => setWalkSupply(next)}
                className="mt-0.5"
              />
              <span className="text-[10.5px] leading-relaxed text-muted-foreground">
                Walk the holder lines
                <span className="block text-[9.5px] text-faint">
                  Slower. Without it the concentration check abstains rather
                  than passing — an unmeasured supply is not a dispersed one.
                </span>
              </span>
            </label>

            <Button className="mt-3 w-full gap-2" onClick={() => void run()} disabled={busy}>
              <NovaSearch size={14} />
              {busy ? "READING LEDGER STATE…" : "CERTIFY AUTHORITY"}
            </Button>
            {error && <p className="mt-3 text-[11px] text-no-go">{error}</p>}

            <p className="mt-3 border-t border-border/50 pt-2.5 text-[10px] leading-relaxed text-faint">
              This reports <span className="text-muted-foreground">what authority the
              issuer has kept</span> over an asset. It is not a score and not a
              legal finding — no number is composited, and whether an asset is
              "decentralised" in a statutory sense is a determination for an
              agency, not for this software.
            </p>
          </Panel>

          {certificate && (
            <Panel label="CERTIFICATE" className="shrink-0">
              <p className="font-mono text-[10.5px] text-muted-foreground">
                {shortAddress(certificate.issuer)}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <TraceButton
                  value={certificate.issuer}
                  to="issuance"
                  from="authority"
                  as="issuer"
                />
              </div>
              <p className="mt-3 stencil text-[8px] tracking-[0.24em] text-muted-foreground">
                DIGEST · SHA-256
              </p>
              {/* Shown whole and wrapped. A digest truncated to eight
                  characters cannot be compared against anything, which
                  makes it an ornament rather than evidence. */}
              <code className="mt-1 block break-all font-mono text-[9.5px] leading-relaxed text-foreground">
                {certificate.digest}
              </code>
              <Button
                variant="outline"
                className="mt-2.5 h-7 w-full text-[10px]"
                onClick={() => void copyDigest()}
              >
                {copied ? "COPIED" : "COPY DIGEST"}
              </Button>
              <p className="mt-2.5 text-[9.5px] leading-relaxed text-faint">
                Covers the verdict, the issuer, the scoped currency, the ledger
                index and every check id with its result. The ledger index is
                inside it deliberately: the same issuer at a later ledger is a
                different assertion and does not share this digest.
              </p>
            </Panel>
          )}
        </div>

        <Panel
          label="FINDINGS"
          right={
            certificate ? (
              <span className="mono-font text-[9px] tabular-nums text-faint">
                {new Date(certificate.evaluatedAt).toLocaleString()}
              </span>
            ) : undefined
          }
          className="relative min-h-0 lg:col-span-3"
          bodyClassName="min-h-0 overflow-y-auto p-0"
        >
          <PatternField variant="approach" />
          {!certificate ? (
            <EmptyState
              icon={<NovaShield size={16} />}
              title="NO ISSUER CERTIFIED"
              body="Enter an issuing account. NOSHASHI reports whether the issuer can still freeze a holder, whether it has given that power up irrevocably, whether the asset is frozen right now, whether holding it needs permission, whether one signer can act alone, what it charges on a transfer, and how concentrated the supply is — each as a fact at one ledger index, none of them combined into a score."
            />
          ) : (
            <>
              <div className="border-b border-border/50 px-4 py-3">
                <p
                  className={cn(
                    "mono-font text-[10px] tracking-[0.18em]",
                    certificate.verdict === "no-go"
                      ? "text-no-go"
                      : certificate.verdict === "hold"
                        ? "text-hold"
                        : "text-go"
                  )}
                >
                  {verdict?.title ?? certificate.verdict.toUpperCase()}
                </p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                  {verdict?.blurb}
                </p>
                <p className="mt-1.5 font-mono text-[9px] tabular-nums text-faint">
                  LEDGER {certificate.ledgerIndex.toLocaleString()}
                  {certificate.currency && ` · ${certificate.currency}`}
                </p>
              </div>
              {certificate.checks.map((check) => (
                <Signal
                  key={check.id}
                  severity={severityOf(check)}
                  kicker={check.passed ? "NO AUTHORITY FOUND" : "AUTHORITY RETAINED"}
                  headline={check.label}
                  detail={check.detail}
                  source={`${check.id} · ledger ${certificate.ledgerIndex.toLocaleString()}`}
                  className="rounded-none border-b border-border/30"
                />
              ))}
              <div className="px-4 py-3">
                <p className="text-[9.5px] leading-relaxed text-faint">
                  Ledger facts about retained authority. Not a determination that
                  any asset is or is not decentralised, a security, or compliant
                  with any statute — those findings rest with the relevant
                  agency, applying criteria this software does not evaluate.
                </p>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
