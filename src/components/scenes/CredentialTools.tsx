import { useEffect, useState } from "react";
import { Panel } from "@/components/nova/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shortAddress } from "@/lib/xrpl/client";
import { toCsv } from "@/lib/format";
import { saveTextFile } from "@/lib/export";
import { useToast } from "@/lib/toast";
import {
  checkAdmission,
  isDomainId,
  type AdmissionRecord,
  credentialsOf,
  isAddress,
  typeLabel,
  validatedLedger,
  type CredentialEntry,
  type LedgerAt,
} from "@/lib/compliance/registry";
import { admission, credentialStatus, expiringWithin, rippleToIso } from "../../../supabase/functions/_shared/ledgerRegistry.ts";
import { cn } from "@/lib/utils";
import { accountDomainReading, type AccountDomainReading } from "@/lib/compliance/accountDomains";

/**
 * Credential tools for compliance teams, all read live from the latest
 * validated ledger: what a counterparty holds (KYC-style attestations, who
 * vouched, when they lapse), what an issuer has issued (pending acceptance,
 * expiring, expired), and which real domains an account would be admitted to.
 */

const EXPIRY_WARNING_DAYS = 30;

type Read = { ledger: LedgerAt; credentials: CredentialEntry[] };

function daysLeft(c: CredentialEntry, closeTime: number): number | null {
  return c.expiration === null ? null : Math.floor((c.expiration - closeTime) / 86_400);
}

function StatusBadge({ c, closeTime }: { c: CredentialEntry; closeTime: number }) {
  const s = credentialStatus(c, closeTime);
  const soon = s === "valid" && expiringWithin(c, closeTime, EXPIRY_WARNING_DAYS);
  return (
    <Badge variant={s === "valid" ? (soon ? "hold" : "go") : s === "pending" ? "hold" : "no-go"} className="text-[10px]">
      {s === "valid" ? (soon ? `EXPIRES IN ${daysLeft(c, closeTime)}D` : "VALID") : s === "pending" ? "NOT ACCEPTED" : "EXPIRED"}
    </Badge>
  );
}

function csvOf(rows: CredentialEntry[], closeTime: number, ledger: number) {
  return toCsv(
    rows.map((c) => ({
      credential_id: c.credentialId,
      subject: c.subject,
      issuer: c.issuer,
      type: typeLabel(c),
      type_hex: c.typeHex,
      status: credentialStatus(c, closeTime),
      accepted: c.accepted,
      expires: c.expiration === null ? "" : rippleToIso(c.expiration),
      uri: c.uri ?? "",
      last_changed_ledger: c.previousTxnLedger ?? "",
      read_at_ledger: ledger,
    }))
  );
}

function useExport() {
  const { push } = useToast();
  return async (name: string, csv: string) => {
    try {
      const where = await saveTextFile(name, csv);
      push({ title: "EXPORTED", body: where, tone: "go" });
    } catch (e) {
      push({ title: "EXPORT FAILED", body: e instanceof Error ? e.message : "Unable to write file", tone: "no-go" });
    }
  };
}

/** What credentials does this counterparty hold, and are they usable today? */
export function CounterpartyCredentials() {
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  const save = useExport();

  const run = async () => {
    if (!isAddress(address)) return setError("Enter the counterparty's classic r-address.");
    setBusy(true);
    setError(null);
    try {
      const ledger = await validatedLedger();
      setRead({ ledger, credentials: await credentialsOf(address.trim(), "subject", ledger.index) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The ledger could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const usable = read ? read.credentials.filter((c) => credentialStatus(c, read.ledger.closeTime) === "valid").length : 0;

  return (
    <Panel label="COUNTERPARTY CREDENTIALS" className="shrink-0">
      <p className="text-[12px] leading-relaxed text-muted-foreground">Before onboarding or settling: which attestations does this account hold, who issued them, and do they still count?</p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Counterparty r-address" className="mono-font h-8 text-[12px]" spellCheck={false} aria-label="Counterparty address" />
        <Button size="sm" type="submit" disabled={busy}>
          {busy ? "READING…" : "READ"}
        </Button>
      </form>
      {error && <p className="mt-2 text-[12px] text-no-go">{error}</p>}
      {read && (
        <div className="mt-2.5">
          <p className="text-[12px] text-foreground/85">
            {read.credentials.length === 0
              ? "Holds no credentials on the ledger."
              : `${usable} of ${read.credentials.length} credential${read.credentials.length === 1 ? "" : "s"} usable today.`}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {read.credentials.map((c) => (
              <li key={c.credentialId} className="flex items-start justify-between gap-2 rounded border border-border px-2.5 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] text-foreground">{typeLabel(c)}</span>
                  <span className="mono-font block truncate text-[11px] text-muted-foreground">issued by {shortAddress(c.issuer)}</span>
                </span>
                <StatusBadge c={c} closeTime={read.ledger.closeTime} />
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="mono-font text-[10.5px] text-faint">Ledger {read.ledger.index.toLocaleString()}</span>
            {read.credentials.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => void save(`noshashi-credentials-${address.trim().slice(0, 8)}-${read.ledger.index}.csv`, csvOf(read.credentials, read.ledger.closeTime, read.ledger.index))}>
                EXPORT CSV
              </Button>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

/** For an institution that issues credentials: the state of everything it has issued. */
export function IssuerRegister({ defaultIssuer }: { defaultIssuer?: string }) {
  const [issuer, setIssuer] = useState(defaultIssuer ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  const save = useExport();

  const run = async () => {
    if (!isAddress(issuer)) return setError("Enter the issuing account's classic r-address.");
    setBusy(true);
    setError(null);
    try {
      const ledger = await validatedLedger();
      setRead({ ledger, credentials: await credentialsOf(issuer.trim(), "issuer", ledger.index) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The ledger could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const t = read?.ledger.closeTime ?? 0;
  const counts = read
    ? {
        valid: read.credentials.filter((c) => credentialStatus(c, t) === "valid").length,
        pending: read.credentials.filter((c) => credentialStatus(c, t) === "pending").length,
        expired: read.credentials.filter((c) => credentialStatus(c, t) === "expired").length,
        soon: read.credentials.filter((c) => credentialStatus(c, t) === "valid" && expiringWithin(c, t, EXPIRY_WARNING_DAYS)).length,
      }
    : null;
  // What needs attention first: expired (still costing the reserve and
  // misleading anyone who reads it), then lapsing soon, then unaccepted.
  const attention = read
    ? read.credentials
        .filter((c) => credentialStatus(c, t) !== "valid" || expiringWithin(c, t, EXPIRY_WARNING_DAYS))
        .sort((a, b) => (a.expiration ?? Infinity) - (b.expiration ?? Infinity))
        .slice(0, 12)
    : [];

  return (
    <Panel label="ISSUER REGISTER" className="shrink-0">
      <p className="text-[12px] leading-relaxed text-muted-foreground">For an institution that issues credentials: everything it has issued, what the subject has not accepted, and what has lapsed or is about to.</p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="Issuer r-address" className="mono-font h-8 text-[12px]" spellCheck={false} aria-label="Issuer address" />
        <Button size="sm" type="submit" disabled={busy}>
          {busy ? "READING…" : "READ"}
        </Button>
      </form>
      {error && <p className="mt-2 text-[12px] text-no-go">{error}</p>}
      {read && counts && (
        <div className="mt-2.5">
          <div className="grid grid-cols-4 gap-1.5 text-center">
            {[
              ["VALID", counts.valid, "text-go"],
              [`≤${EXPIRY_WARNING_DAYS}D`, counts.soon, "text-hold"],
              ["NOT ACCEPTED", counts.pending, "text-hold"],
              ["EXPIRED", counts.expired, "text-no-go"],
            ].map(([label, n, tone]) => (
              <div key={String(label)} className="rounded border border-border py-1.5">
                <p className={cn("data-font text-[17px] font-[600] tabular-nums", Number(n) > 0 ? String(tone) : "text-muted-foreground")}>{n}</p>
                <p className="stencil text-[9.5px] tracking-[0.06em] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          {attention.length > 0 && (
            <ul className="mt-2 space-y-1">
              {attention.map((c) => (
                <li key={c.credentialId} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="min-w-0 truncate">
                    <span className="text-foreground">{typeLabel(c)}</span> <span className="mono-font text-muted-foreground">→ {shortAddress(c.subject)}</span>
                  </span>
                  <StatusBadge c={c} closeTime={t} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="mono-font text-[10.5px] text-faint">
              {read.credentials.length} issued · ledger {read.ledger.index.toLocaleString()}
            </span>
            {read.credentials.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => void save(`noshashi-issued-${issuer.trim().slice(0, 8)}-${read.ledger.index}.csv`, csvOf(read.credentials, t, read.ledger.index))}>
                EXPORT CSV
              </Button>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

/** The real domains on mainnet that `account` would be admitted to today. */
export function AccountDomains({ account }: { account: string | null }) {
  const [state, setState] = useState<AccountDomainReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [domainId, setDomainId] = useState("");
  const [direct, setDirect] = useState<AdmissionRecord | null>(null);
  const [directError, setDirectError] = useState<string | null>(null);
  const [directBusy, setDirectBusy] = useState(false);

  useEffect(() => {
    setState(null); setError(null); setDirect(null); setDirectError(null);
    if (!account) { setBusy(false); return; }
    let cancelled = false;
    setBusy(true);
    void accountDomainReading(account).then(value => { if (!cancelled) setState(value); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not read the ledger."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [account, retry]);

  const admitted = state ? state.domains.filter(d => admission(d, account ?? "", state.held, state.ledger.closeTime).admitted) : [];
  const nearly = state ? state.domains.filter(d => { const r = admission(d, account ?? "", state.held, state.ledger.closeTime); return !r.admitted && r.lines.some(l => l.status === "pending" || l.status === "expired"); }) : [];

  return <Panel label="DOMAINS THIS ACCOUNT ENTERS" className="shrink-0">
    {!account ? <p className="text-[12px] text-muted-foreground">Load a wallet to check permissioned-domain admission.</p> : <>
      <div aria-live="polite" aria-busy={busy}>
        {busy ? <p role="status" className="text-[12px] text-muted-foreground">Reading credentials and owned domains; directory discovery is bounded to 8 seconds…</p> : error ? <p role="alert" className="text-[12px] text-no-go">{error}</p> : state ? <>
          {state.directoryError && <p role="alert" className="mb-2 text-[12px] text-hold">{state.directoryError}</p>}
          <p className="text-[12.5px] text-foreground">{admitted.length} admission{admitted.length === 1 ? "" : "s"} among {state.domains.length} live-checked domain{state.domains.length === 1 ? "" : "s"}.</p>
          {[...admitted.map(d => ({d, ok:true})), ...nearly.map(d => ({d,ok:false}))].slice(0,10).map(({d,ok}) => <div key={d.domainId} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <span className="mono-font min-w-0 truncate text-muted-foreground" title={d.domainId}>{d.domainId.slice(0,12)}… · {shortAddress(d.owner)}</span>
            <Badge variant={ok ? "go" : "hold"}>{ok ? d.owner === account ? "OWNER" : "ADMITTED" : "NOT USABLE"}</Badge>
          </div>)}
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{state.note}</p>
          <p className="mono-font mt-2 text-[11px] text-muted-foreground">Validated ledger {state.ledger.index.toLocaleString()} · {state.ledger.closeIso}</p>
        </> : null}
      </div>
      <Button size="sm" variant="outline" className="mt-3" disabled={busy} onClick={() => setRetry(n=>n+1)}>RETRY DOMAIN DISCOVERY</Button>
      <form className="mt-4 border-t border-border pt-3" onSubmit={async e => {
        e.preventDefault(); if (!account || !isDomainId(domainId)) return;
        setDirectBusy(true); setDirectError(null); setDirect(null);
        try { setDirect(await checkAdmission(domainId,account)); } catch(e) { setDirectError(e instanceof Error ? e.message : "Domain read unavailable."); } finally { setDirectBusy(false); }
      }}>
        <label htmlFor="credential-domain-id" className="text-[12px] text-foreground">Check a known domain ID directly</label>
        <Input id="credential-domain-id" value={domainId} onChange={e=>setDomainId(e.target.value)} placeholder="64-character ledger object ID" className="mono-font mt-2 text-[12px]" spellCheck={false}/>
        <Button className="mt-2" size="sm" disabled={directBusy || !isDomainId(domainId)}>{directBusy ? "READING DOMAIN…" : "CHECK DOMAIN ID"}</Button>
        {directError && <p role="alert" className="mt-2 text-[12px] text-no-go">{directError}</p>}
        {direct && <p role="status" className="mono-font mt-2 break-all text-[11px] text-foreground">{direct.result.admitted ? "ADMITTED" : "NOT ADMITTED"} · ledger {direct.ledger.index} · SHA-256 {direct.digest}. Hash of this evidence, not a digital signature.</p>}
      </form>
    </>}
  </Panel>;
}
