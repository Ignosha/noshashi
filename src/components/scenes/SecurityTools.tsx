import { useEffect, useState } from "react";
import { Eyebrow } from "@/components/nova/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useOrg } from "@/lib/org/useOrg";
import { useSetting } from "@/lib/store";
import { saveTextFile } from "@/lib/export";
import { isValidAddress, shortAddress } from "@/lib/xrpl/client";
import { sanctionsFor } from "@/lib/xrpl/sanctions";
import { addWatch } from "@/lib/xrpl/ledgerWatch";
import { openOrgCase } from "@/lib/org/cases";
import type { LedgerEntry } from "@/lib/desk/ledger";
import { addressesIn, explainTransaction, parseTransaction, type SignExplanation } from "@/lib/security/signInspect";
import { readHoldings } from "@/lib/security/objects";
import { recoveryFrom, resolveEscrowSequences, type RecoveryReport } from "@/lib/security/recovery";
import { exposureFrom, type ExposureReport } from "@/lib/security/exposure";
import { inventoryFrom, priceInventory, type Inventory } from "@/lib/security/inventory";
import { checkDeposit, type DepositDiagnosis } from "@/lib/security/depositHelp";
import { verifyDomain, type DomainAccount, type DomainCheck } from "@/lib/security/domain";
import { CLUSTER_LIMITS, mapCluster, type Cluster } from "@/lib/security/cluster";
import { clearGuardianAlerts, FREE_ADDRESSES, PAID_ADDRESSES, setGuardianConfig, useGuardian } from "@/lib/security/guardian";
import { cn } from "@/lib/utils";

/**
 * The recovery and analysis tools of the Security Center. Tiers:
 *
 *   FREE          pre-sign explainer, stuck funds & reserve recovery and
 *                 exposure audit (one address), wrong-deposit helper,
 *                 domain check, asset inventory (listed), Personal
 *                 Guardian on 3 addresses
 *   PRO+          asset_recovery: inventory valued in XRP, scans across 25
 *                 addresses (500 with bulk_monitoring), Guardian on 50,
 *                 the scam cluster mapper
 *   ENTERPRISE+   forensic_trace: cluster four hops / 200 accounts, into a case
 *   STRATEGIC     security_guardian: watch a whole cluster server-side
 *
 * Every transaction shown is unsigned, for the owner to sign in their own wallet.
 */

const TONE = { danger: "text-no-go", critical: "text-no-go", high: "text-no-go", warn: "text-hold", medium: "text-hold", info: "text-muted-foreground", low: "text-muted-foreground", ok: "text-go" } as const;
const VERDICT_TONE: Record<SignExplanation["verdict"], string> = { "SAFE-LOOKING": "text-go", CAREFUL: "text-hold", "DO NOT SIGN": "text-no-go" };
const xrp = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;

function Tag({ tone, children }: { tone: keyof typeof TONE; children: string }) {
  return <span className={cn("stencil mr-1.5 text-[8px] tracking-[0.18em]", TONE[tone])}>{children}</span>;
}

function TxBlock({ tx, id, copied, onCopy }: { tx: Record<string, unknown>; id: string; copied: string | null; onCopy: (id: string, json: string) => void }) {
  const json = JSON.stringify(tx, null, 2);
  return (
    <div className="mt-1 space-y-1">
      <pre className="mono-font selectable whitespace-pre-wrap break-all text-[9px] text-foreground">{json}</pre>
      <Button size="sm" variant="outline" onClick={() => onCopy(id, json)}>
        {copied === id ? "COPIED" : "COPY UNSIGNED TRANSACTION"}
      </Button>
    </div>
  );
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return { copied, copy: (id: string, text: string) => void navigator.clipboard?.writeText(text).then(() => setCopied(id)) };
}

function addressList(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((a) => a.trim()).filter(isValidAddress))];
}

/* ── Pre-sign explainer ─────────────────────────────────────────────── */

export function PreSignTab() {
  const [input, setInput] = useState("");
  const [me, setMe] = useState("");
  const [book] = useSetting<string>("security.addressBook", "");
  const [result, setResult] = useState<SignExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const known = addressList(book);

  const run = async () => {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const { tx, format } = await parseTransaction(input);
      const listed = await sanctionsFor(addressesIn(tx));
      setResult(explainTransaction(tx, format, { me: isValidAddress(me.trim()) ? me.trim() : undefined, known, sanctioned: listed?.hits }));
      if (listed === null) setError("The OFAC list could not be checked just now; everything else below was read locally.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="max-w-[860px] space-y-3">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Before you sign anything a website, a DM or a wallet prompt asks for: paste the transaction (JSON, or the hex blob) and read what it
        really does. Decoded on this device. Most XRPL thefts are a signature the owner did not understand: a new regular key, an AccountDelete,
        an NFT sold for zero.
      </p>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={6}
        placeholder='{"TransactionType":"Payment", …}  or  12000022800000002400…'
        className="mono-font w-full resize-y border border-border bg-transparent p-1.5 text-[9.5px] text-foreground"
      />
      <div className="flex gap-1.5">
        <Input value={me} onChange={(e) => setMe(e.target.value)} placeholder="Your address (optional: flags a transaction for someone else's account)" className="mono-font h-8 text-[10.5px]" />
        <Button size="sm" disabled={busy || !input.trim()} onClick={() => void run()}>
          {busy ? "READING…" : "EXPLAIN"}
        </Button>
      </div>
      <p className="text-[9.5px] text-muted-foreground">
        A transaction or blob is not a secret. A seed, secret key or "family seed" (starting with s) is: never paste it anywhere.
        {known.length ? ` Lookalikes are checked against the ${known.length} addresses in your SAFE SEND book.` : " Add your usual destinations in SAFE SEND to catch lookalikes."}
      </p>
      {error && <p className="text-[9.5px] text-hold">{error}</p>}
      {result && (
        <div className="space-y-2">
          <div className="border border-border p-2">
            <p className={cn("stencil text-[18px] leading-none", VERDICT_TONE[result.verdict])}>{result.verdict}</p>
            {result.summary.map((s) => (
              <p key={s} className="mt-1 text-[10.5px] text-foreground">
                {s}
              </p>
            ))}
          </div>
          {result.flags.map((f) => (
            <p key={f.id} className="border border-border p-2 text-[10px] leading-relaxed text-foreground">
              <Tag tone={f.severity}>{f.severity === "danger" ? "DANGER" : f.severity.toUpperCase()}</Tag>
              {f.text}
            </p>
          ))}
          <details className="border border-dashed border-border p-2">
            <summary className="cursor-pointer text-[9px] text-muted-foreground">Every field ({result.format === "blob" ? "decoded from the blob" : "as pasted"})</summary>
            <pre className="mono-font selectable mt-1 whitespace-pre-wrap break-all text-[9px] text-foreground">{JSON.stringify(result.tx, null, 2)}</pre>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Recover: stuck funds, reserve, inventory ───────────────────────── */

type RecoverRow = { address: string; report?: RecoveryReport; inventory?: Inventory; error?: string };

/** Reads a handed-over address once, when the tab opens with one. */
function useRunOnce(initial: string | undefined, run: () => unknown) {
  useEffect(() => {
    if (initial && isValidAddress(initial)) void run();
    // Once, for the handed-over value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
}

export function RecoverTab({ onUpgrade, initial }: { onUpgrade: () => void; initial?: string }) {
  const { has } = useBilling();
  const paid = has("asset_recovery");
  const limit = paid ? (has("bulk_monitoring") ? 500 : 25) : 1;
  const [text, setText] = useState(initial ?? "");
  const [rows, setRows] = useState<RecoverRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { copied, copy } = useCopy();
  const addresses = addressList(text);

  const run = async () => {
    const targets = (addresses.length ? addresses : addressList(initial ?? "")).slice(0, limit);
    const out: RecoverRow[] = [];
    for (const [i, address] of targets.entries()) {
      setBusy(`Reading ${shortAddress(address)} (${i + 1} of ${targets.length})…`);
      try {
        const h = await readHoldings(address);
        const report = recoveryFrom(h, await resolveEscrowSequences(h));
        let inventory = inventoryFrom(h);
        if (paid) inventory = await priceInventory(inventory);
        out.push({ address, report, inventory });
      } catch (e) {
        out.push({ address, error: e instanceof Error ? e.message : String(e) });
      }
      setRows([...out]);
    }
    setBusy(null);
  };
  useRunOnce(initial, run);

  const exportCsv = () => {
    const lines = [["address", "ledger", "balance_xrp", "locked_xrp", "recoverable_now_xrp", "optional_reserve_xrp", "later_xrp", "assets_valued_xrp", "items"].join(",")];
    for (const r of rows ?? []) {
      if (!r.report) {
        lines.push([r.address, "", "", "", "", "", "", "", `"${(r.error ?? "").replace(/"/g, "'")}"`].join(","));
        continue;
      }
      lines.push([r.address, r.report.ledgerIndex, r.report.balanceXrp, r.report.lockedXrp, r.report.recoverableNowXrp, r.report.optionalReserveXrp, r.report.laterXrp, r.inventory?.valuedXrp ?? "", r.report.items.length].join(","));
    }
    void saveTextFile("noshashi-recovery-scan.csv", lines.join("\n"), "text/csv");
  };

  return (
    <section className="max-w-[900px] space-y-3">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        XRP an account can get back: escrows that matured and wait for someone to finish them, expired escrows and payment channels that
        return to you when closed, checks written to you and never cashed, and the owner reserve locked by old trust lines, orders, NFT offers,
        preauthorisations and tickets. Plus everything else the account still holds. Every fix is an unsigned transaction.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={paid ? 3 : 1}
        placeholder={paid ? `Up to ${limit} addresses, one per line` : "Your address (r…)"}
        className="mono-font w-full resize-y border border-border bg-transparent p-1.5 text-[10px] text-foreground"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" disabled={Boolean(busy) || !addresses.length} onClick={() => void run()}>
          SCAN {addresses.length > 1 ? `${Math.min(addresses.length, limit)} ADDRESSES` : ""}
        </Button>
        {rows && rows.length > 1 && (
          <Button size="sm" variant="outline" onClick={exportCsv}>
            EXPORT CSV
          </Button>
        )}
        {!paid && (
          <span className="text-[9px] text-muted-foreground">
            Free: one address, assets listed. <button className="underline" onClick={onUpgrade}>Pro</button> values assets in XRP and scans 25 at once.
          </span>
        )}
        {addresses.length > limit && <span className="text-[9px] text-hold">Only the first {limit} will be read on this plan.</span>}
      </div>
      {busy && <p className="mono-font animate-pulse text-[9px] text-muted-foreground">{busy}</p>}
      {rows?.map((r) => (
        <div key={r.address} className="space-y-1.5 border border-border p-2">
          <p className="mono-font text-[10px] text-foreground">{r.address}</p>
          {r.error && <p className="text-[9.5px] text-no-go">{r.error}</p>}
          {r.report && !r.report.exists && <p className="text-[10px] text-muted-foreground">No account exists at this address.</p>}
          {r.report?.exists && (
            <>
              <div className="flex flex-wrap gap-4 text-[10px]">
                <span className="text-go">RECOVERABLE NOW {xrp(r.report.recoverableNowXrp)}</span>
                <span className="text-foreground">RESERVE YOU COULD FREE {xrp(r.report.optionalReserveXrp)}</span>
                {r.report.laterXrp > 0 && <span className="text-muted-foreground">ARRIVING LATER {xrp(r.report.laterXrp)}</span>}
                <span className="text-muted-foreground">
                  balance {xrp(r.report.balanceXrp)} · locked {xrp(r.report.lockedXrp)} · ledger {r.report.ledgerIndex.toLocaleString("en-US")}
                </span>
              </div>
              {r.report.items.length === 0 && <p className="text-[10px] text-muted-foreground">Nothing stuck: no escrows, checks, channels or reclaimable reserve.</p>}
              {r.report.items.map((i) => (
                <div key={i.id} className="border-t border-border pt-1">
                  <p className="text-[10px] text-foreground">
                    <Tag tone={i.when === "now" ? "ok" : i.when === "optional" ? "info" : "warn"}>{i.when.toUpperCase()}</Tag>
                    {i.title}
                  </p>
                  <p className="text-[9.5px] leading-relaxed text-muted-foreground">{i.detail}</p>
                  {i.caution && <p className="text-[9.5px] text-hold">Before signing: {i.caution}</p>}
                  {i.tx && <TxBlock tx={i.tx} id={`${r.address}:${i.id}`} copied={copied} onCopy={copy} />}
                </div>
              ))}
              <details className="border-t border-border pt-1">
                <summary className="cursor-pointer text-[9.5px] text-muted-foreground">
                  Close the account entirely: {r.report.deletion.possible ? `AccountDelete returns ${xrp(r.report.deletion.returnsXrp)}` : `blocked by ${r.report.deletion.blockers.join(", ")}`}
                </summary>
                <p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground">
                  Deleting sends every drop but the {xrp(r.report.balanceXrp - r.report.deletion.returnsXrp)} fee to an account you own, including the base reserve. Only for an
                  account you are finished with: its address can be funded again, but anything sent to it later needs the reserve anew.
                </p>
                {r.report.deletion.tx && <TxBlock tx={r.report.deletion.tx} id={`${r.address}:delete`} copied={copied} onCopy={copy} />}
              </details>
            </>
          )}
          {r.inventory && r.inventory.items.length > 0 && (
            <div className="border-t border-border pt-1">
              <Eyebrow>
                ALSO HELD {r.inventory.priced ? `· ${xrp(r.inventory.valuedXrp)} AT THE BEST BID` : ""}
              </Eyebrow>
              {r.inventory.items.slice(0, 40).map((it) => (
                <p key={it.id} className="mono-font text-[9px] text-foreground">
                  {it.kind.replace("_", " ").toUpperCase()} · {it.label} · {it.kind === "nft" ? "" : it.amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}
                  {it.valueXrp !== null && it.kind !== "open_order" ? ` · ≈ ${xrp(it.valueXrp)}` : ""}
                  {it.note ? <span className="text-muted-foreground"> · {it.note}</span> : null}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

/* ── Exposure audit ─────────────────────────────────────────────────── */

type ExposureRow = { address: string; report?: ExposureReport; error?: string };

export function ExposureTab({ onUpgrade, initial }: { onUpgrade: () => void; initial?: string }) {
  const { has } = useBilling();
  const paid = has("asset_recovery");
  const limit = paid ? (has("bulk_monitoring") ? 500 : 25) : 1;
  const [text, setText] = useState(initial ?? "");
  const [book] = useSetting<string>("security.addressBook", "");
  const [rows, setRows] = useState<ExposureRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { copied, copy } = useCopy();
  const addresses = addressList(text);
  const known = addressList(book);

  const run = async () => {
    const out: ExposureRow[] = [];
    const targets = (addresses.length ? addresses : addressList(initial ?? "")).slice(0, limit);
    for (const [i, address] of targets.entries()) {
      setBusy(`Reading ${shortAddress(address)} (${i + 1} of ${targets.length})…`);
      try {
        out.push({ address, report: exposureFrom(await readHoldings(address), [...known, ...targets]) });
      } catch (e) {
        out.push({ address, error: e instanceof Error ? e.message : String(e) });
      }
      setRows([...out]);
    }
    setBusy(null);
  };
  useRunOnce(initial, run);

  const exportCsv = () => {
    const lines = ["address,risk,kind,title,at_risk_xrp"];
    for (const r of rows ?? []) for (const e of r.report?.exposures ?? []) lines.push([r.address, e.risk, e.kind, `"${e.title.replace(/"/g, "'")}"`, e.atRiskXrp].join(","));
    void saveTextFile("noshashi-exposure-audit.csv", lines.join("\n"), "text/csv");
  };

  return (
    <section className="max-w-[900px] space-y-3">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        The XRP Ledger's "revoke approvals": every standing permission that lets someone else take value later. Checks you wrote, NFT sell offers
        (a zero-price one signed on a phishing site gives the NFT away), funded payment channels, open orders, preauthorisations, the keys and
        signers that can act for you. Each comes with the unsigned transaction that revokes it.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={paid ? 3 : 1}
        placeholder={paid ? `Up to ${limit} addresses, one per line` : "Your address (r…)"}
        className="mono-font w-full resize-y border border-border bg-transparent p-1.5 text-[10px] text-foreground"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" disabled={Boolean(busy) || !addresses.length} onClick={() => void run()}>
          AUDIT
        </Button>
        {rows && rows.length > 1 && (
          <Button size="sm" variant="outline" onClick={exportCsv}>
            EXPORT CSV
          </Button>
        )}
        {!paid && (
          <span className="text-[9px] text-muted-foreground">
            Free: one address. <button className="underline" onClick={onUpgrade}>Pro</button> audits 25 at once.
          </span>
        )}
      </div>
      {busy && <p className="mono-font animate-pulse text-[9px] text-muted-foreground">{busy}</p>}
      {rows?.map((r) => (
        <div key={r.address} className="space-y-1.5 border border-border p-2">
          <p className="mono-font text-[10px] text-foreground">
            {r.address}
            {r.report?.exists ? ` · ${r.report.exposures.length} open permission${r.report.exposures.length === 1 ? "" : "s"}${r.report.atRiskXrp ? ` · up to ${xrp(r.report.atRiskXrp)} others could take` : ""}` : ""}
          </p>
          {r.error && <p className="text-[9.5px] text-no-go">{r.error}</p>}
          {r.report && !r.report.exists && <p className="text-[10px] text-muted-foreground">No account exists at this address.</p>}
          {r.report?.exists && r.report.exposures.length === 0 && <p className="text-[10px] text-go">Nothing open: no one else can take value from this account.</p>}
          {r.report?.exposures.map((e) => (
            <div key={e.id} className="border-t border-border pt-1">
              <p className="text-[10px] text-foreground">
                <Tag tone={e.risk}>{e.risk.toUpperCase()}</Tag>
                {e.title}
              </p>
              <p className="text-[9.5px] leading-relaxed text-muted-foreground">{e.detail}</p>
              {e.caution && <p className="text-[9.5px] text-hold">Before signing: {e.caution}</p>}
              {e.revoke && <TxBlock tx={e.revoke} id={`${r.address}:${e.id}`} copied={copied} onCopy={copy} />}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

/* ── Wrong-deposit helper ───────────────────────────────────────────── */

export function DepositHelpTab() {
  const [hash, setHash] = useState("");
  const [tag, setTag] = useState("");
  const [result, setResult] = useState<DepositDiagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setNote(null);
    try {
      const expected = tag.trim() ? Number(tag.trim()) : null;
      setResult(await checkDeposit(hash, Number.isInteger(expected) ? expected : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="max-w-[860px] space-y-3">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        "I sent XRP and it never arrived." Paste the transaction hash from your wallet. A failed payment moved nothing but its fee; a payment
        that reached an exchange without the right destination tag can be credited by the exchange, and this writes the letter it needs.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="Transaction hash (64 characters)" className="mono-font h-8 min-w-[320px] flex-1 text-[10.5px]" />
        <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Your correct tag (optional)" className="mono-font h-8 w-48 text-[10.5px]" />
        <Button size="sm" disabled={busy || !/^[0-9A-Fa-f]{64}$/.test(hash.trim())} onClick={() => void run()}>
          {busy ? "READING…" : "EXPLAIN"}
        </Button>
      </div>
      {error && <p className="text-[9.5px] text-no-go">{error}</p>}
      {result && (
        <div className="space-y-2">
          <div className="border border-border p-2">
            <p className="text-[11px] text-foreground">{result.headline}</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{result.explanation}</p>
            {result.steps.length > 0 && (
              <ol className="mt-1 list-decimal pl-4 text-[10px] text-foreground">
                {result.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
          </div>
          <div className="mono-font space-y-0.5 border border-border p-2 text-[9px] text-muted-foreground">
            <p>result {result.facts.result ?? "—"} · ledger {result.facts.ledger ?? "—"} · {result.facts.at ?? ""}</p>
            <p>from {result.facts.from ?? "—"} → {result.facts.to ?? "—"}{result.facts.destinationTag !== null ? ` tag ${result.facts.destinationTag}` : " (no tag)"}</p>
            <p>requested {result.facts.requested ?? "—"} · delivered {result.facts.delivered ?? "—"}</p>
            {result.facts.destinationDomain && <p>destination claims {result.facts.destinationDomain} (check it on the DOMAIN tab)</p>}
          </div>
          {result.letter && (
            <div className="space-y-1 border border-dashed border-border p-2">
              <Eyebrow>LETTER TO THE SERVICE · SHA-256 {result.letter.sha256.slice(0, 16)}…</Eyebrow>
              <pre className="mono-font selectable whitespace-pre-wrap text-[9px] text-foreground">{result.letter.text}</pre>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(result.letter!.text).then(() => setNote("Letter copied."))}>
                  COPY
                </Button>
                <Button size="sm" variant="outline" onClick={() => void saveTextFile(`deposit-${result.hash.slice(0, 12)}.txt`, result.letter!.text, "text/plain").then((w) => setNote(`Saved: ${w}`))}>
                  SAVE
                </Button>
              </div>
              {note && <p className="text-[9.5px] text-go">{note}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ── Domain check ───────────────────────────────────────────────────── */

const DOMAIN_TONE: Record<DomainCheck["status"], keyof typeof TONE> = { verified: "ok", unverified: "danger", no_toml: "warn", no_domain: "info", invalid_domain: "warn", no_account: "info" };

export function DomainTab({ initial }: { initial?: string }) {
  const [query, setQuery] = useState(initial ?? "");
  const [result, setResult] = useState<{ check: DomainCheck; accounts?: DomainAccount[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = query.trim();

  const run = async (target = q) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await verifyDomain(isValidAddress(target) ? { address: target } : { domain: target }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  useRunOnce(initial, () => run(initial));

  return (
    <section className="max-w-[820px] space-y-3">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Anyone can write "bitstamp.net" into an account's Domain field. The claim is proven only when that website lists the account back in its
        <span className="mono-font"> /.well-known/xrp-ledger.toml</span>. Paste an address to test its claim, or a domain to see which accounts it vouches for.
      </p>
      <div className="flex gap-1.5">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="r… address or example.com" className="mono-font h-8 text-[10.5px]" />
        <Button size="sm" disabled={busy || !q} onClick={() => void run()}>
          {busy ? "READING…" : "VERIFY"}
        </Button>
      </div>
      {error && <p className="text-[9.5px] text-no-go">{error}</p>}
      {result && (
        <div className="space-y-2">
          <p className="border border-border p-2 text-[10.5px] leading-relaxed text-foreground">
            <Tag tone={DOMAIN_TONE[result.check.status]}>{result.check.status.replace("_", " ").toUpperCase()}</Tag>
            {result.check.detail}
          </p>
          {result.check.tomlUrl && <p className="mono-font selectable text-[9px] text-muted-foreground">{result.check.tomlUrl}</p>}
          {result.accounts?.map((a) => (
            <p key={a.address} className="mono-font text-[9.5px] text-foreground">
              {a.address} · {a.exists === false ? "does not exist" : a.points_back ? <span className="text-go">names the domain back</span> : <span className="text-hold">does not name it ({a.domain ?? "no domain"})</span>}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Scam cluster mapper (Pro+) ─────────────────────────────────────── */

function clusterEntry(c: Cluster, digest: string): LedgerEntry {
  return {
    id: `cluster-${digest.slice(0, 12)}`,
    subject: c.seed,
    label: "Scam cluster",
    domainCode: "CLUSTER",
    verdict: "no-go",
    digest,
    amountXrp: 0,
    failedRules: ["scam_cluster"],
    checksPassed: 0,
    checksTotal: c.nodes.length,
    latencyMs: 0,
    at: new Date().toISOString(),
    offline: false,
  };
}

export function clusterText(c: Cluster): string {
  const lines = [`NOSHASHI SCAM CLUSTER from ${c.seed}`, `Accounts: ${c.nodes.length}${c.capped ? " (capped)" : ""}`, "", "LINKS"];
  for (const l of c.links) lines.push(`- ${l.kind === "funded" ? "FUNDED" : "SWEPT (AccountDelete)"} ${l.from} -> ${l.to}: ${l.xrp} XRP, ledger ${l.ledger} (${l.hash})`);
  lines.push("", "ACCOUNTS");
  for (const n of c.nodes) lines.push(`- ${n.address} (hop ${n.depth})${n.exists ? "" : " deleted"}${n.balanceXrp !== null ? `, ${n.balanceXrp} XRP` : ""}${n.stop ? `, ${n.stop} (not expanded)` : ""}${n.sanction ? `, OFAC SDN: ${n.sanction.entityName}` : ""}`);
  for (const v of c.vanity) lines.push(`- ${v.accounts.length} accounts end in "${v.ending}": ${v.accounts.join(", ")}`);
  for (const m of c.sharedMemos) lines.push(`- ${m.accounts.length} accounts sent the memo "${m.text.slice(0, 80)}"`);
  return lines.join("\n");
}

export function ClusterTab() {
  const { has } = useBilling();
  const org = useOrg();
  const membership = org.state.status === "ready" && org.state.data ? org.state.data.membership : null;
  const deep = has("forensic_trace");
  const limits = deep ? CLUSTER_LIMITS.deep : CLUSTER_LIMITS.standard;
  const [seed, setSeed] = useState("");
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    setCluster(null);
    try {
      setCluster(await mapCluster(seed.trim(), limits));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const watch = async () => {
    if (!cluster || !membership) return;
    let added = 0;
    for (const n of cluster.nodes.filter((x) => x.exists && !x.stop).slice(0, 25)) {
      await addWatch(membership.organizationId, n.address, `Cluster of ${shortAddress(cluster.seed)}`, "monitor").then(() => (added += 1)).catch(() => undefined);
    }
    setNote(`${added} account${added === 1 ? "" : "s"} in the cluster now watched server-side.`);
  };

  return (
    <section className="max-w-[900px] space-y-3">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        From one scam account, the others the same operation runs: who funded it, which accounts it created, where it swept its balance when it
        deleted itself, and which of them share a vanity ending or a memo. Exchanges and other services end a branch. Every link names its
        transaction. {deep ? "Forensic depth: four hops, 200 accounts." : "Two hops, 40 accounts (Enterprise maps four hops and 200)."}
      </p>
      <div className="flex gap-1.5">
        <Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="A known scam or drainer account (r…)" className="mono-font h-8 text-[10.5px]" />
        <Button size="sm" disabled={busy || !isValidAddress(seed.trim())} onClick={() => void run()}>
          {busy ? "MAPPING…" : "MAP"}
        </Button>
      </div>
      {error && <p className="text-[9.5px] text-no-go">{error}</p>}
      {cluster && (
        <div className="space-y-2">
          <p className="text-[10.5px] text-foreground">
            {cluster.nodes.length} accounts, {cluster.links.length} links{cluster.capped ? " (the account cap stopped the search)" : ""}.
            {cluster.nodes.some((n) => n.sanction) ? " The cluster touches an OFAC-listed address." : ""}
          </p>
          <div className="space-y-0.5 border border-border p-2">
            {cluster.links.slice(0, 120).map((l) => (
              <p key={l.hash + l.to} className="mono-font text-[9px] text-foreground">
                {l.kind === "funded" ? "FUNDED" : "SWEPT"} · {shortAddress(l.from)} → {shortAddress(l.to)} · {xrp(l.xrp)} · ledger {l.ledger}
              </p>
            ))}
          </div>
          <div className="space-y-0.5 border border-border p-2">
            {cluster.nodes.map((n) => (
              <p key={n.address} className="mono-font text-[9px] text-muted-foreground">
                hop {n.depth} · <span className="text-foreground">{n.address}</span>
                {n.exists ? (n.balanceXrp !== null ? ` · ${xrp(n.balanceXrp)}` : "") : " · deleted"}
                {n.stop ? ` · ${n.stop}, not expanded` : ""}
                {n.sanction ? ` · OFAC SDN: ${n.sanction.entityName}` : ""}
              </p>
            ))}
            {cluster.vanity.map((v) => (
              <p key={v.ending} className="text-[9.5px] text-hold">
                {v.accounts.length} accounts end in "{v.ending}": a generated vanity series.
              </p>
            ))}
            {cluster.sharedMemos.map((m) => (
              <p key={m.text} className="text-[9.5px] text-hold">
                {m.accounts.length} accounts sent the same memo: "{m.text.slice(0, 100)}"
              </p>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => void saveTextFile(`noshashi-cluster-${cluster.seed}.txt`, clusterText(cluster), "text/plain").then((w) => setNote(`Saved: ${w}`))}>
              SAVE REPORT
            </Button>
            {deep && membership && org.accountId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void (async () => {
                    const { sha256Hex } = await import("@/lib/security/incident");
                    const id = await openOrgCase(membership.organizationId, { entry: clusterEntry(cluster, await sha256Hex(clusterText(cluster))), actor: org.accountId! });
                    setNote(`Case ${id} opened for the organization.`);
                  })().catch((e) => setError(e instanceof Error ? e.message : String(e)))
                }
              >
                OPEN INVESTIGATION CASE
              </Button>
            )}
            {has("security_guardian") && membership && (
              <Button size="sm" variant="outline" onClick={() => void watch()}>
                WATCH THE CLUSTER
              </Button>
            )}
          </div>
          {note && <p className="text-[9.5px] text-go">{note}</p>}
        </div>
      )}
    </section>
  );
}

/* ── Personal Guardian (free, this device) ──────────────────────────── */

export function PersonalGuardian({ onUpgrade }: { onUpgrade: () => void }) {
  const g = useGuardian();
  const { has } = useBilling();
  const limit = has("asset_recovery") ? PAID_ADDRESSES : FREE_ADDRESSES;
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? g.config.addresses.join("\n");

  return (
    <section className="max-w-[820px] space-y-2">
      <Eyebrow>PERSONAL GUARDIAN · ON THIS DEVICE</Eyebrow>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        While NOSHASHI is open, your own addresses are read every minute and a native notification fires the moment a new key or signer list
        appears, the master key is switched, the account is deleted, a large amount leaves, or a phishing lure arrives. The addresses and alerts
        stay on this device. {limit === FREE_ADDRESSES ? `Free for ${FREE_ADDRESSES} addresses; ` : ""}
        {limit === FREE_ADDRESSES ? (
          <button className="underline" onClick={onUpgrade}>
            Pro watches {PAID_ADDRESSES}
          </button>
        ) : (
          `Up to ${PAID_ADDRESSES} addresses on your plan`
        )}
        .
      </p>
      <textarea
        value={text}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null) setGuardianConfig({ addresses: addressList(draft).slice(0, limit) });
          setDraft(null);
        }}
        rows={3}
        placeholder="Your addresses, one per line"
        className="mono-font w-full resize-y border border-border bg-transparent p-1.5 text-[10px] text-foreground"
      />
      <div className="flex flex-wrap items-center gap-3 text-[9.5px] text-muted-foreground">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={g.config.enabled} onChange={(e) => setGuardianConfig({ enabled: e.target.checked })} /> On
        </label>
        <label className="flex items-center gap-1">
          Alert when at least
          <input
            type="number"
            min={1}
            value={g.config.largeXrp}
            onChange={(e) => setGuardianConfig({ largeXrp: Math.max(1, Number(e.target.value) || 1) })}
            className="mono-font w-20 border border-border bg-transparent px-1 text-foreground"
          />
          XRP leaves
        </label>
        <span>{g.lastRunAt ? `last read ${g.lastRunAt.slice(11, 19)} UTC` : g.config.addresses.length ? "first read within a minute" : "add an address to start"}</span>
        {g.alerts.length > 0 && (
          <button className="underline" onClick={clearGuardianAlerts}>
            clear alerts
          </button>
        )}
      </div>
      {g.lastError && <p className="text-[9.5px] text-hold">{g.lastError}</p>}
      {g.alerts.map((a) => (
        <div key={a.id} className="border border-border p-2">
          <p className="text-[10px] text-foreground">
            <Tag tone={a.severity}>{a.severity.toUpperCase()}</Tag>
            {shortAddress(a.address)} · {a.title}
          </p>
          <p className="text-[9.5px] text-muted-foreground">
            {a.at?.slice(0, 16).replace("T", " ") ?? `ledger ${a.ledger}`} · {a.detail}
          </p>
          <p className="mono-font selectable break-all text-[8.5px] text-muted-foreground">{a.hash}</p>
        </div>
      ))}
    </section>
  );
}
