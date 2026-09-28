import { useEffect, useState } from "react";
import { Eyebrow } from "@/components/nova/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useOrg } from "@/lib/org/useOrg";
import { useSetting } from "@/lib/store";
import { saveTextFile } from "@/lib/export";
import { isValidAddress, shortAddress } from "@/lib/xrpl/client";
import { readHoldings } from "@/lib/security/objects";
import { emergencyKit, type EmergencyKit } from "@/lib/security/emergency";
import { readDrainerPatterns, type DrainerPattern } from "@/lib/security/drainer";
import { attribute, type Attribution } from "@/lib/security/attribution";
import { surveilIssuer, type SurveillanceReport } from "@/lib/security/surveillance";
import {
  checkPhishingLink,
  listThreatReports,
  screenWithdrawalLive,
  submitThreatReport,
  threatsFor,
  THREAT_CATEGORIES,
  type PhishingCheck,
  type ThreatCategory,
  type ThreatHit,
  type ThreatReport,
  type WithdrawalResult,
} from "@/lib/security/threats";
import {
  assessLive,
  buildLiabilities,
  latestLiabilities,
  listAttestations,
  listPrograms,
  publishLiabilities,
  saveProgram,
  type AttestationRow,
  type BuiltLiabilities,
  type LiabilitiesRow,
  type ProtectionProgramRow,
} from "@/lib/security/protectionClient";
import type { ProtectionReport } from "../../../supabase/functions/_shared/protection.ts";
import { cn } from "@/lib/utils";

/**
 * The institutional security tools of the Security Center.
 *
 *   EMERGENCY KIT     (free: one account)  drainer patterns in the account's
 *                     history, and the ordered unsigned transactions that
 *                     move everything to a cold account and change the keys
 *   WHO IS THIS       (free)               exchange attribution
 *   SCAM REGISTRY     lookup and link check free; filing a report
 *                     threat_registry (Institutional and up)
 *   WITHDRAWALS       withdrawal_screening (Enterprise and up)
 *   SURVEILLANCE      market_surveillance (Enterprise and up)
 *   PROTECTION        proof_of_reserves (Institutional), a protection fund
 *                     and public page customer_protection (Enterprise),
 *                     alerts protection_monitoring (Strategic)
 *
 * NOSHASHI reads; it never signs, and never holds or insures anyone's funds.
 */

const TONE = { critical: "text-no-go", warn: "text-hold", info: "text-muted-foreground", ok: "text-go" } as const;
const VERDICT_TONE = { clear: "text-go", review: "text-hold", hold: "text-no-go" } as const;
const STATUS_TONE: Record<ProtectionReport["status"], string> = { fully_backed: "text-go", partially_backed: "text-hold", under_backed: "text-no-go", unproven: "text-muted-foreground" };
const xrp = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;
const addressList = (text: string) => [...new Set(text.split(/[\s,;]+/).map((a) => a.trim()).filter(isValidAddress))];

function Finding({ severity, title, detail }: { severity: keyof typeof TONE; title: string; detail: string }) {
  return (
    <div className="border border-border p-2">
      <p className="text-[10.5px] text-foreground">
        <span className={cn("stencil mr-1.5 text-[8px] tracking-[0.18em]", TONE[severity])}>{severity.toUpperCase()}</span>
        {title}
      </p>
      <p className="mt-0.5 text-[9.5px] leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function useAsync<T>() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<T | null>(null);
  const run = async (f: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    setValue(null);
    try {
      setValue(await f());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, value, run, setValue };
}

function useMembership() {
  const org = useOrg();
  return org.state.status === "ready" && org.state.data ? org.state.data.membership : null;
}

/* ── Emergency kit and drainer patterns ─────────────────────────────── */

export function EmergencyTab({ initial }: { initial?: string }) {
  const [address, setAddress] = useState(initial ?? "");
  const [cold, setCold] = useState("");
  const [newKey, setNewKey] = useState("");
  const [tickets, setTickets] = useState(false);
  const patterns = useAsync<{ patterns: DrainerPattern[]; transactions: number }>();
  const kit = useAsync<EmergencyKit>();
  const [copied, setCopied] = useState<string | null>(null);
  const a = address.trim();

  const check = () => patterns.run(() => readDrainerPatterns(a));
  const build = () =>
    kit.run(async () => emergencyKit(await readHoldings(a), { cold: cold.trim(), newRegularKey: isValidAddress(newKey.trim()) ? newKey.trim() : undefined, useTickets: tickets }));
  useEffect(() => {
    if (initial && isValidAddress(initial)) void check();
    // Once, for a handed-over address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  const copy = (id: string, text: string) => void navigator.clipboard?.writeText(text).then(() => setCopied(id));

  return (
    <section className="max-w-[900px] space-y-3">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        When a key leaks, whoever submits first wins. First see whether a drain is already under way: keys changed then value out, a dust spray
        then an AccountDelete, a zero-price NFT offer taken, a check cashed at once. Then prepare the kit: every transaction, in the order that
        saves the most, for your own wallet to sign. With tickets it can be signed today and kept offline.
      </p>
      <div className="flex gap-1.5">
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="The account to protect (r…)" className="mono-font h-8 text-[10.5px]" />
        <Button size="sm" variant="outline" disabled={patterns.busy || !isValidAddress(a)} onClick={() => void check()}>
          {patterns.busy ? "READING…" : "IS IT BEING DRAINED?"}
        </Button>
      </div>
      {patterns.error && <p className="text-[9.5px] text-no-go">{patterns.error}</p>}
      {patterns.value && (
        <div className="space-y-1.5">
          {patterns.value.patterns.length === 0 ? (
            <p className="text-[10px] text-go">No drainer pattern in the last {patterns.value.transactions} transactions.</p>
          ) : (
            patterns.value.patterns.map((p) => (
              <div key={p.id + p.fromLedger} className="border border-border p-2">
                <p className="text-[10.5px] text-foreground">
                  <span className={cn("stencil mr-1.5 text-[8px] tracking-[0.18em]", p.severity === "critical" ? "text-no-go" : "text-hold")}>{p.id.replace(/_/g, " ").toUpperCase()}</span>
                  {p.title}
                </p>
                <p className="mt-0.5 text-[9.5px] text-muted-foreground">{p.detail}</p>
                <p className="mono-font selectable mt-0.5 break-all text-[8.5px] text-muted-foreground">{p.evidence.join(" · ")}</p>
              </div>
            ))
          )}
        </div>
      )}
      <Eyebrow>THE KIT</Eyebrow>
      <div className="grid gap-1.5 md:grid-cols-2">
        <Input value={cold} onChange={(e) => setCold(e.target.value)} placeholder="Cold account you control, on a device that never held this key" className="mono-font h-8 text-[10.5px]" />
        <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="New regular key (optional; from a hardware wallet)" className="mono-font h-8 text-[10.5px]" />
      </div>
      <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <input type="checkbox" checked={tickets} onChange={(e) => setTickets(e.target.checked)} /> Build on tickets, to sign now and keep offline
      </label>
      <Button size="sm" disabled={kit.busy || !isValidAddress(a) || !isValidAddress(cold.trim()) || cold.trim() === a} onClick={() => void build()}>
        {kit.busy ? "READING THE ACCOUNT…" : "PREPARE THE KIT"}
      </Button>
      {kit.error && <p className="text-[9.5px] text-no-go">{kit.error}</p>}
      {kit.value && (
        <div className="space-y-2">
          {kit.value.notes.map((n) => (
            <p key={n} className="text-[9.5px] text-muted-foreground">{n}</p>
          ))}
          {kit.value.tickets && (
            <div className="border border-dashed border-border p-2">
              <p className="text-[10.5px] text-foreground">0. Create {String(kit.value.tickets.TicketCount)} tickets</p>
              <pre className="mono-font selectable mt-1 whitespace-pre-wrap break-all text-[9px] text-foreground">{JSON.stringify(kit.value.tickets, null, 2)}</pre>
            </div>
          )}
          {kit.value.steps.map((s) => {
            const json = JSON.stringify(s.tx, null, 2);
            return (
              <div key={s.id} className="border border-border p-2">
                <p className="text-[10.5px] text-foreground">
                  {s.order}. {s.title}
                </p>
                <p className="text-[9.5px] text-muted-foreground">{s.why}</p>
                {s.caution && <p className="text-[9.5px] text-hold">{s.caution}</p>}
                <pre className="mono-font selectable mt-1 whitespace-pre-wrap break-all text-[9px] text-foreground">{json}</pre>
                <Button size="sm" variant="outline" onClick={() => copy(s.id, json)}>
                  {copied === s.id ? "COPIED" : "COPY UNSIGNED TRANSACTION"}
                </Button>
              </div>
            );
          })}
          <Button size="sm" variant="outline" onClick={() => void saveTextFile(`emergency-kit-${shortAddress(kit.value!.address)}.json`, JSON.stringify(kit.value, null, 2))}>
            SAVE THE KIT
          </Button>
        </div>
      )}
    </section>
  );
}

/* ── Who is this? ───────────────────────────────────────────────────── */

export function AttributionTab({ initial }: { initial?: string }) {
  const [address, setAddress] = useState(initial ?? "");
  const q = useAsync<Attribution>();
  const run = (target = address.trim()) => q.run(() => attribute(target));
  useEffect(() => {
    if (initial && isValidAddress(initial)) void run(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  return (
    <section className="max-w-[820px] space-y-3">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Where did the money land? An exchange can freeze a deposit if it is asked quickly and precisely. This names who runs an address when the
        ledger shows it: a domain that vouches for it, a claimed domain that does not, or the behaviour of a service that pools customers' funds.
      </p>
      <div className="flex gap-1.5">
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="r… address" className="mono-font h-8 text-[10.5px]" />
        <Button size="sm" disabled={q.busy || !isValidAddress(address.trim())} onClick={() => void run()}>
          {q.busy ? "READING…" : "WHO IS THIS?"}
        </Button>
      </div>
      {q.error && <p className="text-[9.5px] text-no-go">{q.error}</p>}
      {q.value && (
        <div className="space-y-1.5 border border-border p-2">
          <p className="stencil text-[14px] text-foreground">
            {q.value.name ?? "UNNAMED"} <span className="text-[9px] text-muted-foreground">· {q.value.kind.replace(/_/g, " ")} · {q.value.confidence}</span>
          </p>
          {q.value.evidence.map((e) => (
            <p key={e} className="text-[9.5px] text-muted-foreground">· {e}</p>
          ))}
          <p className="text-[10px] text-foreground">{q.value.advice}</p>
        </div>
      )}
    </section>
  );
}

/* ── Scam registry and phishing links ───────────────────────────────── */

export function RegistryTab({ onUpgrade }: { onUpgrade: () => void }) {
  const { has } = useBilling();
  const membership = useMembership();
  const [lookup, setLookup] = useState("");
  const hits = useAsync<Record<string, ThreatHit>>();
  const [link, setLink] = useState("");
  const phishing = useAsync<PhishingCheck>();
  const [form, setForm] = useState({ address: "", category: "phishing" as ThreatCategory, evidence: "", note: "" });
  const [sent, setSent] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reports, setReports] = useState<ThreatReport[]>([]);
  const canFile = has("threat_registry") && !!membership;

  useEffect(() => {
    if (canFile && membership) void listThreatReports(membership.organizationId).then(setReports).catch(() => undefined);
  }, [canFile, membership, sent]);

  const file = async () => {
    if (!membership) return;
    setSendError(null);
    setSent(null);
    try {
      const evidence = form.evidence.split(/[\s,;]+/).map((h) => h.trim()).filter(Boolean);
      await submitThreatReport(membership.organizationId, form.address.trim(), form.category, evidence, form.note);
      setSent("Filed. It counts once NOSHASHI staff who did not file it have checked the evidence.");
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="max-w-[900px] space-y-3">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Addresses other institutions have reported with transaction evidence, each confirmed by a reviewer who did not file it; and domains
        advertised in micro-payment memos on the ledger, read every minute. Deposit and withdrawal screening consult both.
      </p>
      <Eyebrow>LOOK UP ADDRESSES</Eyebrow>
      <div className="flex gap-1.5">
        <Input value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="One or more r… addresses" className="mono-font h-8 text-[10.5px]" />
        <Button size="sm" disabled={hits.busy || !addressList(lookup).length} onClick={() =>
            void hits.run(async () => {
              const found = await threatsFor(addressList(lookup));
              if (found === null) throw new Error("The registry could not be reached; nothing is known either way.");
              return found;
            })
          }
        >
          {hits.busy ? "…" : "LOOK UP"}
        </Button>
      </div>
      {hits.error && <p className="text-[9.5px] text-no-go">{hits.error}</p>}
      {hits.value && (
        <div className="space-y-1">
          {addressList(lookup).map((a) => {
            const h = hits.value![a];
            return (
              <p key={a} className="mono-font text-[9.5px] text-foreground">
                {a} · {h ? <span className="text-no-go">{h.categories.join(", ")} · {h.reports} report{h.reports === 1 ? "" : "s"} since {h.firstConfirmed.slice(0, 10)}</span> : <span className="text-muted-foreground">no confirmed report (not a clearance)</span>}
              </p>
            );
          })}
        </div>
      )}
      <Eyebrow>CHECK A LINK</Eyebrow>
      <div className="flex gap-1.5">
        <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="A link or domain from a memo, DM or airdrop" className="mono-font h-8 text-[10.5px]" />
        <Button size="sm" disabled={phishing.busy || !link.trim()} onClick={() => void phishing.run(() => checkPhishingLink(link))}>
          {phishing.busy ? "…" : "CHECK"}
        </Button>
      </div>
      {phishing.error && <p className="text-[9.5px] text-no-go">{phishing.error}</p>}
      {phishing.value && (
        <div className="space-y-1 border border-border p-2">
          <p className={cn("stencil text-[13px]", phishing.value.listed ? "text-no-go" : phishing.value.seen ? "text-hold" : "text-muted-foreground")}>
            {phishing.value.listed ? "ADVERTISED BY SPAM ON THE LEDGER" : phishing.value.seen ? "SEEN IN MICRO-PAYMENT MEMOS" : "NOT SEEN"} · {phishing.value.domain}
          </p>
          {phishing.value.sightings.slice(0, 5).map((s) => (
            <p key={s.domain} className="text-[9.5px] text-muted-foreground">
              {s.domain}: sent to {s.recipients} account{s.recipients === 1 ? "" : "s"} by {s.senders}, last {s.last_seen.slice(0, 16).replace("T", " ")} · "{s.sample_memo.slice(0, 120)}"
            </p>
          ))}
          <p className="text-[9px] text-muted-foreground">{phishing.value.note} {phishing.value.ledgers_read_24h} ledgers read in the last 24 hours.</p>
        </div>
      )}
      <Eyebrow>REPORT AN ADDRESS</Eyebrow>
      {!canFile ? (
        <p className="text-[10px] text-muted-foreground">
          Filing reports is part of the Institutional plan, from an organization.{" "}
          <button className="underline" onClick={onUpgrade}>See plans</button>
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="grid gap-1.5 md:grid-cols-[1fr_180px]">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address to report (r…)" className="mono-font h-8 text-[10.5px]" />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ThreatCategory })} className="h-8 border border-border bg-transparent text-[10.5px]">
              {THREAT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <Input value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} placeholder="Transaction hashes that show it, separated by spaces" className="mono-font h-8 text-[10.5px]" />
          <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={3} placeholder="What happened, in your own words (who reported it stays private)" className="w-full border border-border bg-transparent p-1.5 text-[10px]" />
          <Button size="sm" disabled={!isValidAddress(form.address.trim()) || form.note.trim().length < 10 || !form.evidence.trim()} onClick={() => void file()}>
            FILE REPORT
          </Button>
          {sent && <p className="text-[9.5px] text-go">{sent}</p>}
          {sendError && <p className="text-[9.5px] text-no-go">{sendError}</p>}
          {reports.map((r) => (
            <p key={r.id} className="mono-font text-[9px] text-muted-foreground">
              {r.created_at.slice(0, 10)} · {r.address} · {r.category} · <span className={r.status === "confirmed" ? "text-go" : r.status === "rejected" ? "text-no-go" : "text-hold"}>{r.status}</span>
              {r.review_note ? ` · ${r.review_note}` : ""}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Withdrawal screening ───────────────────────────────────────────── */

export function WithdrawalTab() {
  const [book] = useSetting<string>("security.addressBook", "");
  const [destination, setDestination] = useState("");
  const [tag, setTag] = useState("");
  const [amount, setAmount] = useState("");
  const [previous, setPrevious] = useState("");
  const q = useAsync<WithdrawalResult>();
  const d = destination.trim();
  const run = () =>
    q.run(() =>
      screenWithdrawalLive({
        destination: d,
        destinationTag: tag.trim() ? Number(tag) : null,
        amountXrp: amount.trim() ? Number(amount) : null,
        previousDestinations: addressList(previous),
        ownAddresses: addressList(book),
      })
    );
  return (
    <section className="max-w-[900px] space-y-3">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Before a customer's withdrawal is signed: will it bounce, is the destination brand new or hours old, does it imitate an address the
        customer used before, is it OFAC-listed or in the scam registry up to three funding hops back. The same rules run behind
        POST /withdrawal-screen for your own systems.
      </p>
      <div className="grid gap-1.5 md:grid-cols-[1fr_140px_140px]">
        <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destination (r…)" className="mono-font h-8 text-[10.5px]" />
        <Input value={tag} onChange={(e) => setTag(e.target.value.replace(/\D/g, ""))} placeholder="Destination tag" className="mono-font h-8 text-[10.5px]" />
        <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Amount (XRP)" className="mono-font h-8 text-[10.5px]" />
      </div>
      <Input value={previous} onChange={(e) => setPrevious(e.target.value)} placeholder="Where this customer has withdrawn before (optional; catches lookalikes)" className="mono-font h-8 text-[10.5px]" />
      <Button size="sm" disabled={q.busy || !isValidAddress(d)} onClick={() => void run()}>
        {q.busy ? "SCREENING…" : "SCREEN"}
      </Button>
      {q.error && <p className="text-[9.5px] text-no-go">{q.error}</p>}
      {q.value && (
        <div className="space-y-1.5">
          <p className={cn("stencil text-[18px]", VERDICT_TONE[q.value.verdict])}>{q.value.verdict.toUpperCase()}</p>
          {q.value.unchecked.length > 0 && <p className="text-[9.5px] text-hold">Not checked: {q.value.unchecked.join(" and ")} could not be reached.</p>}
          {q.value.findings.length === 0 && <p className="text-[10px] text-go">Nothing found at validated ledger {q.value.ledger.toLocaleString("en-US")}.</p>}
          {q.value.findings.map((f) => (
            <Finding key={f.id} severity={f.severity} title={f.title} detail={f.detail} />
          ))}
          <p className="mono-font text-[9px] text-muted-foreground">Funding chain: {q.value.chain.map((h) => h.account).join(" ← ")}</p>
        </div>
      )}
    </section>
  );
}

/* ── Market surveillance ────────────────────────────────────────────── */

export function SurveillanceTab() {
  const [issuer, setIssuer] = useState("");
  const q = useAsync<SurveillanceReport>();
  return (
    <section className="max-w-[900px] space-y-3">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        A token's order-book history, read for what a quoted price hides: accounts re-quoting orders that never fill, one account supplying most
        of the activity, and trades between accounts funded by the same account. Indicators with the numbers behind them, not verdicts: a
        market maker re-quoting looks like layering.
      </p>
      <div className="flex gap-1.5">
        <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="Token issuer (r…)" className="mono-font h-8 text-[10.5px]" />
        <Button size="sm" disabled={q.busy || !isValidAddress(issuer.trim())} onClick={() => void q.run(() => surveilIssuer(issuer.trim()))}>
          {q.busy ? "READING…" : "SURVEIL"}
        </Button>
      </div>
      {q.error && <p className="text-[9.5px] text-no-go">{q.error}</p>}
      {q.value && (
        <div className="space-y-1.5">
          <p className="text-[9.5px] text-muted-foreground">
            {q.value.transactions} transactions, ledgers {q.value.ledgers.from.toLocaleString("en-US")}–{q.value.ledgers.to.toLocaleString("en-US")}, {q.value.fills.length} trade{q.value.fills.length === 1 ? "" : "s"}.
          </p>
          {q.value.findings.map((f) => (
            <Finding key={f.id} severity={f.severity} title={f.title} detail={f.detail} />
          ))}
          <table className="mono-font w-full text-[9px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left">ACCOUNT</th><th>PLACED</th><th>REPLACED</th><th>CANCELLED</th><th>FILLED</th><th>TOOK</th>
              </tr>
            </thead>
            <tbody>
              {q.value.traders.slice(0, 12).map((t) => (
                <tr key={t.account} className="text-foreground">
                  <td className="selectable">{t.account}</td><td className="text-center">{t.placed}</td><td className="text-center">{t.replaced}</td><td className="text-center">{t.cancelled}</td><td className="text-center">{t.filledAsMaker}</td><td className="text-center">{t.tookAsTaker}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ── Customer Asset Protection ──────────────────────────────────────── */

export function ProtectionTab({ onUpgrade }: { onUpgrade: () => void }) {
  const { has } = useBilling();
  const membership = useMembership();
  const [programs, setPrograms] = useState<ProtectionProgramRow[]>([]);
  const [selected, setSelected] = useState<ProtectionProgramRow | null>(null);
  const [liab, setLiab] = useState<LiabilitiesRow | null>(null);
  const [attestations, setAttestations] = useState<AttestationRow[]>([]);
  const live = useAsync<ProtectionReport>();
  const [form, setForm] = useState({ slug: "", name: "", reserves: "", fund: "", limit: "0", isPublic: false });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [built, setBuilt] = useState<BuiltLiabilities | null>(null);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 16));
  const fundAllowed = has("customer_protection");
  const org = membership?.organizationId ?? null;

  const reload = async () => {
    if (!org) return;
    const list = await listPrograms(org);
    setPrograms(list);
    const s = selected ? list.find((p) => p.id === selected.id) ?? null : list[0] ?? null;
    setSelected(s);
  };
  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org]);
  useEffect(() => {
    if (!selected) return;
    setForm({ slug: selected.slug, name: selected.name, reserves: selected.reserve_addresses.join("\n"), fund: selected.fund_addresses.join("\n"), limit: String(selected.coverage_limit_xrp), isPublic: selected.public });
    void Promise.all([latestLiabilities(selected.id), listAttestations(selected.id)]).then(([l, a]) => {
      setLiab(l);
      setAttestations(a);
    });
  }, [selected]);

  if (!org) return <p className="text-[10px] text-muted-foreground">Customer Asset Protection belongs to an organization. Sign in and choose one.</p>;

  const save = async (asNew: boolean) => {
    setError(null);
    setMessage(null);
    try {
      await saveProgram(org, { id: asNew ? null : selected?.id ?? null, slug: form.slug.trim(), name: form.name, reserves: addressList(form.reserves), fund: addressList(form.fund), limitXrp: Number(form.limit) || 0, isPublic: form.isPublic });
      setMessage("Saved. The daily attestation reads it from the next run.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const build = async () => {
    setError(null);
    try {
      setBuilt(await buildLiabilities(csv));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const publish = async () => {
    if (!selected || !built) return;
    setError(null);
    try {
      await publishLiabilities(selected.id, built.root, built.totalXrp, built.customers, new Date(asOf).toISOString());
      setMessage("Published: the root, the total and the count. No customer or balance left this machine.");
      setLiab(await latestLiabilities(selected.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="max-w-[960px] space-y-3">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        What a deposit-insurance scheme gives depositors, built from ledger facts: proof that customer balances are backed by the reserve accounts
        you name, each customer's own proof that their balance is counted, and a protection fund with a per-customer limit that no single key can
        move. Attested daily and hash-chained. It is verification, not insurance: NOSHASHI pays no claims, and no government scheme stands behind it.
      </p>
      {programs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {programs.map((p) => (
            <button key={p.id} onClick={() => setSelected(p)} className={cn("border px-2 py-1 text-[9.5px]", selected?.id === p.id ? "border-foreground" : "border-border text-muted-foreground")}>
              {p.name}
            </button>
          ))}
        </div>
      )}
      <Eyebrow>PROGRAM</Eyebrow>
      <div className="grid gap-1.5 md:grid-cols-2">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Program name" className="h-8 text-[10.5px]" />
        <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} placeholder="Page name (e.g. acme-custody)" className="mono-font h-8 text-[10.5px]" />
        <textarea value={form.reserves} onChange={(e) => setForm({ ...form, reserves: e.target.value })} rows={3} placeholder="Reserve accounts holding customers' XRP, one per line" className="mono-font border border-border bg-transparent p-1.5 text-[9.5px]" />
        <textarea value={form.fund} onChange={(e) => setForm({ ...form, fund: e.target.value })} rows={3} disabled={!fundAllowed} placeholder={fundAllowed ? "Protection fund accounts, one per line" : "A protection fund is part of the Enterprise plan"} className="mono-font border border-border bg-transparent p-1.5 text-[9.5px]" />
        <Input value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value.replace(/[^\d.]/g, "") })} disabled={!fundAllowed} placeholder="Per-customer limit (XRP)" className="mono-font h-8 text-[10.5px]" />
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <input type="checkbox" checked={form.isPublic} disabled={!fundAllowed} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} /> Public page at noshashi.app/protection/?p={form.slug || "…"}
        </label>
      </div>
      <div className="flex gap-1.5">
        {selected && <Button size="sm" onClick={() => void save(false)}>SAVE CHANGES</Button>}
        <Button size="sm" variant="outline" onClick={() => void save(true)}>CREATE NEW PROGRAM</Button>
        {!fundAllowed && <button className="text-[9.5px] underline text-muted-foreground" onClick={onUpgrade}>Protection fund and public page: Enterprise</button>}
      </div>
      {message && <p className="text-[9.5px] text-go">{message}</p>}
      {error && <p className="text-[9.5px] text-no-go">{error}</p>}

      {selected && (
        <>
          <Eyebrow>LIABILITIES</Eyebrow>
          <p className="text-[9.5px] text-muted-foreground">
            {liab ? `Published ${liab.published_at.slice(0, 10)}: ${xrp(liab.total_xrp)} owed to ${liab.customers.toLocaleString("en-US")} customers, root ${liab.root.slice(0, 16)}…` : "No liabilities published yet."}
          </p>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={4} placeholder={"Your balance export: customer id,balance in XRP — one customer per line. It stays on this machine."} className="mono-font w-full border border-border bg-transparent p-1.5 text-[9.5px]" />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={!csv.trim()} onClick={() => void build()}>BUILD THE TREE</Button>
            {built && (
              <>
                <span className="mono-font text-[9.5px] text-foreground">{xrp(built.totalXrp)} · {built.customers} customers · root {built.root.slice(0, 16)}…</span>
                <input type="datetime-local" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-8 border border-border bg-transparent text-[10px]" />
                <Button size="sm" onClick={() => void publish()}>PUBLISH ROOT</Button>
                <Button size="sm" variant="outline" onClick={() => void saveTextFile(`inclusion-proofs-${selected.slug}.jsonl`, built.proofs.map((p) => JSON.stringify(p)).join("\n") + "\n")}>
                  SAVE CUSTOMER PROOFS
                </Button>
              </>
            )}
          </div>
          {built && <p className="text-[9px] text-muted-foreground">Send each customer their own line from the proofs file. They check it on the public page with their customer id; nobody else's balance is in it.</p>}

          <Eyebrow>ATTESTATIONS</Eyebrow>
          <Button size="sm" variant="outline" disabled={live.busy} onClick={() => void live.run(() => assessLive(selected, liab))}>
            {live.busy ? "READING THE LEDGER…" : "READ IT LIVE NOW"}
          </Button>
          {live.error && <p className="text-[9.5px] text-no-go">{live.error}</p>}
          {live.value && (
            <div className="space-y-1.5">
              <p className={cn("stencil text-[16px]", STATUS_TONE[live.value.status])}>{live.value.status.replace("_", " ").toUpperCase()}</p>
              <p className="text-[9.5px] text-muted-foreground">
                Reserves {xrp(live.value.reservesXrp)} · fund {xrp(live.value.fundXrp)} ({xrp(live.value.fundSecuredXrp)} secured) · ledger {live.value.ledgerIndex.toLocaleString("en-US")}
              </p>
              {live.value.findings.map((f) => (
                <Finding key={f.id} severity={f.severity} title={f.title} detail={f.detail} />
              ))}
            </div>
          )}
          {attestations.length === 0 ? (
            <p className="text-[9.5px] text-muted-foreground">The first daily attestation runs at 06:17 UTC.</p>
          ) : (
            attestations.map((a) => (
              <p key={a.id} className="mono-font text-[9px] text-muted-foreground">
                {a.attested_at.slice(0, 16).replace("T", " ")} · ledger {a.ledger_index} · <span className={STATUS_TONE[a.status]}>{a.status}</span>
                {a.coverage_ratio !== null ? ` · ${(Number(a.coverage_ratio) * 100).toFixed(2)}%` : ""} · {a.digest.slice(0, 16)}…
              </p>
            ))
          )}
        </>
      )}
    </section>
  );
}
