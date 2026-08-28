import { useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel, StatCell } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Signal } from "@/components/nova/Signal";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { NovaVault, NovaSearch } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shortAddress } from "@/lib/xrpl/client";
import { readNft, nftFindings, type NftReport } from "@/lib/desk/nft";
import { TraceButton } from "@/lib/nav/handoff";
import { cn } from "@/lib/utils";

/**
 * NftScene — what the issuer can still do to a token after selling it.
 *
 * Free, because the person who most needs this is the one about to buy.
 *
 * The design decision worth naming: no image is rendered. Every NFT
 * interface leads with the picture, which is the one part of the token the
 * ledger does not guarantee — the URI may be mutable, and what it points
 * at is not on-chain at all. Showing it would put the least reliable thing
 * on screen at the largest size. What is shown instead is the rights
 * structure, which is what actually transfers.
 */
export function NftScene() {
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<NftReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const id = query.trim();
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    try {
      setReport(await readNft(id));
    } catch (caught) {
      setReport(null);
      setError(caught instanceof Error ? caught.message : "That token could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const findings = report ? nftFindings(report) : [];
  const r = report?.rights;

  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="22"
        kicker="PUBLIC · NFT RIGHTS · NO ACCOUNT NEEDED"
        title="TOKEN RIGHTS"
        sub="What the issuer of an NFT can still do to it after you own it — decoded from the token's own id."
        status="go"
        statusLabel="OPEN"
      />

      {r && (
        <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCell
            label="ISSUER CAN DESTROY IT"
            value={r.burnable ? "YES" : "NO"}
            tone={r.burnable ? "no-go" : "default"}
            caveat={r.burnable ? "lsfBurnable is set" : "only the owner can burn it"}
          />
          <StatCell
            label="ISSUER CAN REDIRECT IT"
            value={r.mutable ? "YES" : "NO"}
            tone={r.mutable ? "hold" : "default"}
            caveat={r.mutable ? "the URI can be rewritten" : "the pointer is fixed"}
          />
          <StatCell
            label="RESELLABLE"
            value={r.transferable ? "YES" : "NO"}
            tone={r.transferable ? "default" : "hold"}
            caveat={r.transferable ? "a secondary market is possible" : "it can only return to the issuer"}
          />
          <StatCell
            label="ISSUER'S CUT PER SALE"
            value={`${r.transferFeePct.toFixed(3)}%`}
            tone={r.transferFeePct >= 5 ? "hold" : "default"}
            caveat="deducted on every transfer"
          />
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
          <Panel label="TOKEN" className="shrink-0">
            <Label htmlFor="nftid" className="text-[10px] tracking-wide">
              NFTOKEN ID
            </Label>
            <Input
              id="nftid"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="64 hex characters"
              spellCheck={false}
              className="mt-2 font-mono text-[11px]"
            />
            <Button className="mt-3 w-full gap-2" onClick={() => void run()} disabled={busy}>
              <NovaSearch size={14} />
              {busy ? "READING RIGHTS…" : "READ TOKEN RIGHTS"}
            </Button>
            {error && <p className="mt-3 text-[11px] text-no-go">{error}</p>}
            <p className="mt-3 border-t border-border/50 pt-2.5 text-[10px] leading-relaxed text-faint">
              The rights are encoded in the id itself, so they are decoded{" "}
              <span className="text-muted-foreground">here, offline</span> — no
              server is asked and none can answer wrongly. That matters when
              the question is whether an issuer kept the right to burn your
              token: their own marketplace is the last place to ask.
            </p>
          </Panel>

          {r && (
            <Panel label="ISSUER" bodyClassName="p-3.5">
              <p className="mono-font text-[8px] tracking-[0.2em] text-faint">
                DECODED FROM THE TOKEN ID
              </p>
              <code className="mt-1.5 block break-all text-[10.5px] text-muted-foreground">
                {r.issuer}
              </code>
              <div className="mt-2 flex gap-1.5">
                <TraceButton value={r.issuer} to="provenance" from="nft" as="NFT issuer" />
                <TraceButton
                  value={r.issuer}
                  to="claims"
                  from="nft"
                  as="NFT issuer"
                  label="INBOX"
                />
              </div>
              <p className="mono-font mt-2.5 text-[9px] tabular-nums text-faint">
                TAXON {r.taxon.toLocaleString()} · SEQUENCE {r.sequence.toLocaleString()}
              </p>
            </Panel>
          )}

          {report && (report.sellOffers.length > 0 || report.buyOffers.length > 0) && (
            <Panel
              label="RESTING OFFERS"
              className="min-h-0 flex-1"
              bodyClassName="min-h-0 overflow-y-auto p-0"
            >
              {[...report.sellOffers.map((o) => ["SELL", o] as const),
                ...report.buyOffers.map((o) => ["BUY", o] as const)].map(([side, offer]) => (
                <div key={offer.index} className="border-b border-border/30 px-3.5 py-2">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        "mono-font text-[8px] tracking-[0.14em]",
                        side === "SELL" ? "text-no-go" : "text-go"
                      )}
                    >
                      {side}
                    </span>
                    <code className="text-[10px] text-muted-foreground">
                      {shortAddress(offer.owner)}
                    </code>
                    <span className="ml-auto font-mono text-[10.5px] tabular-nums text-foreground">
                      {offer.amountXrp !== undefined
                        ? `${offer.amountXrp.toLocaleString(undefined, { maximumFractionDigits: 6 })} XRP`
                        : "issued token"}
                    </span>
                  </div>
                  {offer.destination && (
                    <p className="mono-font mt-1 text-[8.5px] tracking-[0.1em] text-hold">
                      RESERVED FOR {shortAddress(offer.destination)}
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
              icon={<NovaVault size={16} />}
              title="NO TOKEN READ"
              body="Paste an NFTokenID. NOSHASHI decodes what the issuer kept the right to do — destroy it, redirect what it points at, or take a cut of every resale — from the id itself, without asking anyone."
            />
          ) : (
            <>
              <div className="border-b border-border/50 px-4 py-3">
                <p className="break-all font-mono text-[9.5px] text-faint">
                  {report.rights.tokenId}
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
