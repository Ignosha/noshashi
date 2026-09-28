import { useCallback, useEffect, useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Eyebrow } from "@/components/nova/Panel";
import { Gated } from "@/components/nova/Gated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useOrg } from "@/lib/org/useOrg";
import { useSetting } from "@/lib/store";
import { saveTextFile } from "@/lib/export";
import { isValidAddress, rpc, shortAddress } from "@/lib/xrpl/client";
import { sanctionsFor } from "@/lib/xrpl/sanctions";
import { lookalikeOf } from "@/lib/xrpl/deposit";
import { addWatch, listEvents, type LedgerEvent } from "@/lib/xrpl/ledgerWatch";
import { openOrgCase } from "@/lib/org/cases";
import { assessSecurity, readSecurityPosture, type SecurityAssessment, type SecurityPosture } from "@/lib/security/hardening";
import {
  incidentDossier,
  recoveryOptions,
  takeoverSignals,
  traceFunds,
  TRACE_LIMITS,
  type RecoveryOption,
  type TakeoverSignal,
  type Trace,
} from "@/lib/security/incident";
import type { LedgerEntry } from "@/lib/desk/ledger";
import { cn } from "@/lib/utils";
import { useClaimedSubject } from "@/lib/nav/handoff";

/**
 * SECURITY CENTER — cybersecurity for XRP Ledger accounts.
 *
 *   ACCOUNT CHECK  (free)        who can sign, open doors, key changes,
 *                                poisoning attempts, and an unsigned plan
 *   SAFE SEND      (free)        a pasted destination against your own book
 *   INCIDENT       (Pro+)        takeover timeline, value followed hop by
 *                                hop, recovery paths, SHA-256 dossier;
 *                                deeper and into a case on Enterprise+
 *   GUARDIAN       (Strategic)   server-side takeover alerts
 *
 * NOSHASHI reads; it never signs. Every change is a transaction the owner
 * reviews and signs in their own wallet.
 */

const TABS = [
  { id: "check", label: "ACCOUNT CHECK" },
  { id: "send", label: "SAFE SEND" },
  { id: "incident", label: "INCIDENT RESPONSE" },
  { id: "guardian", label: "GUARDIAN" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const TONE = { critical: "text-no-go", warn: "text-hold", info: "text-muted-foreground", ok: "text-go" } as const;
const GRADE_TONE: Record<string, string> = { A: "text-go", B: "text-go", C: "text-hold", D: "text-no-go", F: "text-no-go" };
const OUTLOOK: Record<RecoveryOption["outlook"], { label: string; tone: string }> = {
  possible: { label: "POSSIBLE", tone: "text-go" },
  unlikely: { label: "UNLIKELY", tone: "text-hold" },
  not_possible: { label: "NOT POSSIBLE", tone: "text-no-go" },
  protective: { label: "DO THIS NOW", tone: "text-hold" },
};

export function SecurityScene({ onUpgrade, onSignIn }: { onUpgrade: () => void; onSignIn: () => void }) {
  const [tab, setTab] = useState<Tab>("check");
  // An address handed over from another screen or a lab is checked straight away.
  const [subject, setSubject] = useState<string | undefined>();
  useClaimedSubject("security", (claimed) => {
    setTab("check");
    setSubject(claimed.value);
  });
  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="33"
        kicker="ACCOUNT SECURITY · SAFE SEND · INCIDENT RESPONSE · GUARDIAN"
        title="SECURITY CENTER"
        sub="Harden an XRP Ledger account against takeover, catch lookalike addresses before you sign, and when an account is drained, follow the value and every recovery path that exists. NOSHASHI reads; it never signs."
        status="go"
        statusLabel="FREE CHECKS"
      />
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "stencil border px-2 py-1 text-[9px] tracking-[0.2em]",
              tab === t.id ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {tab === "check" ? (
          <CheckTab key={subject ?? ""} initial={subject} />
        ) : tab === "send" ? (
          <SafeSendTab />
        ) : tab === "incident" ? (
          <Gated feature="incident_response" onUpgrade={onUpgrade} onSignIn={onSignIn}>
            <IncidentTab />
          </Gated>
        ) : (
          <Gated feature="security_guardian" onUpgrade={onUpgrade} onSignIn={onSignIn}>
            <GuardianTab />
          </Gated>
        )}
      </div>
    </div>
  );
}

/* ── Account check ──────────────────────────────────────────────────── */

function CheckTab({ initial }: { initial?: string }) {
  const [address, setAddress] = useState(initial ?? "");
  useEffect(() => {
    if (initial && isValidAddress(initial)) void run(initial);
    // Run once for a handed-over address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ posture: SecurityPosture; assessment: SecurityAssessment } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const run = async (target = address) => {
    setBusy(true);
    setError(null);
    try {
      const posture = await readSecurityPosture(target.trim());
      setResult({ posture, assessment: assessSecurity(posture) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="max-w-[820px] space-y-3">
      <div className="flex gap-1.5">
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Your XRP Ledger address (r…)" className="mono-font h-8 text-[10.5px]" />
        <Button size="sm" disabled={busy || !isValidAddress(address.trim())} onClick={() => void run()}>
          {busy ? "READING…" : "CHECK"}
        </Button>
      </div>
      <p className="text-[9.5px] text-muted-foreground">
        Public data only: an address is not a secret. Never paste a secret key or seed anywhere, including here.
      </p>
      {error && <p className="text-[9.5px] text-no-go">{error}</p>}
      {result && (
        <div className="space-y-2">
          <div className="flex items-baseline gap-3 border border-border p-2">
            <span className={cn("stencil text-[28px] leading-none", GRADE_TONE[result.assessment.grade])}>{result.assessment.grade}</span>
            <div>
              <p className="text-[10.5px] text-foreground">
                {result.assessment.score}/100 · {result.assessment.summary}
              </p>
              <p className="mono-font text-[9px] text-muted-foreground">
                validated ledger {result.posture.ledgerIndex.toLocaleString("en-US")} · {result.posture.historyRead} recent transactions read
                {result.posture.historyComplete ? "" : " (older history not read)"}
              </p>
            </div>
          </div>
          {result.assessment.findings.map((f) => (
            <div key={f.id} className="border border-border p-2">
              <p className="text-[10px] text-foreground">
                <span className={cn("stencil mr-1.5 text-[8px] tracking-[0.18em]", TONE[f.severity])}>{f.severity.toUpperCase()}</span>
                {f.title}
              </p>
              <p className="mt-0.5 text-[9.5px] leading-relaxed text-muted-foreground">{f.detail}</p>
              {f.action && <p className="mt-0.5 text-[9.5px] text-foreground">What to do: {f.action}</p>}
            </div>
          ))}
          {result.posture.events.length > 0 && (
            <div className="border border-border p-2">
              <Eyebrow>KEY AND SETTINGS HISTORY</Eyebrow>
              {result.posture.events.slice(0, 12).map((e) => (
                <p key={e.hash + e.kind} className="mono-font text-[9px] text-muted-foreground">
                  {e.at?.slice(0, 16).replace("T", " ") ?? `ledger ${e.ledger}`} · {e.detail}
                </p>
              ))}
            </div>
          )}
          {result.assessment.plan.length > 0 && (
            <div className="space-y-1.5 border border-dashed border-border p-2">
              <Eyebrow>HARDENING PLAN · UNSIGNED, TO SIGN IN YOUR OWN WALLET</Eyebrow>
              {result.assessment.plan.map((step) => {
                const json = JSON.stringify(step.tx, null, 2);
                return (
                  <div key={step.id} className="space-y-1 border border-border p-1.5">
                    <p className="text-[10px] text-foreground">{step.title}</p>
                    <p className="text-[9.5px] text-muted-foreground">{step.why}</p>
                    {step.caution && <p className="text-[9.5px] text-hold">Before signing: {step.caution}</p>}
                    <pre className="mono-font selectable whitespace-pre-wrap break-all text-[9px] text-foreground">{json}</pre>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void navigator.clipboard?.writeText(json).then(() => setCopied(step.id))}
                    >
                      {copied === step.id ? "COPIED" : "COPY TRANSACTION"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ── Safe send ──────────────────────────────────────────────────────── */

type SendCheck = { tone: keyof typeof TONE; text: string };

function SafeSendTab() {
  const [book, setBook] = useSetting<string>("security.addressBook", "");
  const [draft, setDraft] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<SendCheck[] | null>(null);

  const entries = (draft ?? book)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [addr, ...label] = line.split(/\s+/);
      return { address: addr, label: label.join(" ") };
    })
    .filter((e) => isValidAddress(e.address));

  const run = async () => {
    const to = destination.trim();
    setBusy(true);
    const out: SendCheck[] = [];
    const known = entries.find((e) => e.address === to);
    const imitated = known ? null : lookalikeOf(to, entries.map((e) => e.address));
    if (known) out.push({ tone: "ok", text: `Exactly matches ${known.label || "an address in your book"}.` });
    else if (imitated) {
      const who = entries.find((e) => e.address === imitated);
      out.push({ tone: "critical", text: `LOOKALIKE: starts and ends like ${who?.label || imitated} (${imitated}) but is a different account. This is how address poisoning steals payments. Do not send.` });
    } else out.push({ tone: "warn", text: "Not in your address book. Confirm it with the recipient another way before sending anything large." });

    const [info, listed] = await Promise.all([
      rpc("account_info", { account: to, ledger_index: "validated" }).catch((e: unknown) => (/actNotFound|not found/i.test(String(e instanceof Error ? e.message : e)) ? null : undefined)),
      sanctionsFor([to]),
    ]);
    if (listed === null) out.push({ tone: "warn", text: "The OFAC sanctions list could not be checked just now." });
    else if (listed.hits[to]) out.push({ tone: "critical", text: `On the OFAC SDN list: ${listed.hits[to].entityName}. Do not pay it.` });
    else out.push({ tone: "ok", text: "Not on the OFAC SDN list." });
    if (info === null) out.push({ tone: "warn", text: "This account does not exist yet: a payment must be at least the base reserve to create it." });
    else if (info) {
      const flags = Number((info as Record<string, any>).account_data?.Flags ?? 0);
      if (flags & 0x00020000) out.push({ tone: "warn", text: "It requires a destination tag: an exchange or service. Include the tag it gave you, or the payment is refused." });
      if (flags & 0x01000000) out.push({ tone: "info", text: "It only accepts payments from senders it has preauthorised." });
    } else out.push({ tone: "warn", text: "The account could not be read just now." });
    setChecks(out);
    setBusy(false);
  };

  return (
    <section className="max-w-[820px] space-y-3">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Address poisoning puts a lookalike of an address you pay into your history, hoping you copy it next time. Keep your real
        destinations here (on this device only) and check every pasted address against them before you sign.
      </p>
      <label className="block text-[9px] text-muted-foreground">
        Address book, one per line: <span className="mono-font">rAddress… Exchange deposit</span>
        <textarea
          value={draft ?? book}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== null) setBook(draft);
            setDraft(null);
          }}
          rows={4}
          className="mono-font mt-0.5 w-full resize-y border border-border bg-transparent p-1 text-[9.5px] text-foreground"
        />
      </label>
      <div className="flex gap-1.5">
        <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Address you are about to pay" className="mono-font h-8 text-[10.5px]" />
        <Button size="sm" disabled={busy || !isValidAddress(destination.trim())} onClick={() => void run()}>
          {busy ? "CHECKING…" : "CHECK"}
        </Button>
      </div>
      {checks?.map((c, i) => (
        <p key={i} className="text-[10px] leading-relaxed text-foreground">
          <span className={cn("stencil mr-1.5 text-[8px] tracking-[0.18em]", TONE[c.tone])}>{c.tone === "ok" ? "OK" : c.tone.toUpperCase()}</span>
          {c.text}
        </p>
      ))}
    </section>
  );
}

/* ── Incident response ──────────────────────────────────────────────── */

type IncidentResult = {
  posture: SecurityPosture;
  trace: Trace;
  signals: TakeoverSignal[];
  options: RecoveryOption[];
  dossier: { text: string; sha256: string };
};

/** An incident as the verdict a case links to: the account is the subject, the dossier hash the digest. */
function incidentEntry(result: IncidentResult): LedgerEntry {
  const xrp = result.trace.flows.filter((f) => f.from === result.trace.root && f.amount.currency === "XRP").reduce((n, f) => n + f.amount.value, 0);
  return {
    id: `incident-${result.dossier.sha256.slice(0, 12)}`,
    subject: result.trace.root,
    label: "Account takeover investigation",
    domainCode: "INCIDENT",
    verdict: "no-go",
    digest: result.dossier.sha256,
    amountXrp: Math.round(xrp * 1e6) / 1e6,
    failedRules: result.signals.filter((s) => s.severity !== "info").map((s) => s.id),
    checksPassed: 0,
    checksTotal: result.signals.length,
    latencyMs: 0,
    at: new Date().toISOString(),
    offline: false,
  };
}

function IncidentTab() {
  const { has } = useBilling();
  const org = useOrg();
  const membership = org.state.status === "ready" && org.state.data ? org.state.data.membership : null;
  const deep = has("forensic_trace");
  const limits = deep ? TRACE_LIMITS.deep : TRACE_LIMITS.standard;
  const [address, setAddress] = useState("");
  const [since, setSince] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IncidentResult | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setNote(null);
    setResult(null);
    try {
      setBusy("Reading the account's keys and history…");
      const root = address.trim();
      const posture = await readSecurityPosture(root, 400);
      let from = Number(since.replace(/[,\s]/g, ""));
      if (!Number.isInteger(from) || from <= 0) {
        // Default: from the earliest key change in the history read, else from the oldest transaction read.
        const keyChange = [...posture.events].reverse().find((e) => e.kind === "regular_key_set" || e.kind === "signer_list_set");
        from = keyChange?.ledger ?? Math.max(1, posture.ledgerIndex - 21_600 * 30);
      }
      setBusy(`Following the value from ledger ${from.toLocaleString("en-US")}, up to ${limits.depth} hops…`);
      const trace = await traceFunds(root, { sinceLedger: from, depth: limits.depth, perAccount: limits.perAccount });
      const signals = takeoverSignals(root, posture.events, trace.flows);
      const options = recoveryOptions(trace, { stillHoldsXrp: posture.exists ? posture.balanceXrp : 0, keyEvents: posture.events });
      const dossier = await incidentDossier(trace, options, { keyEvents: posture.events });
      setResult({ posture, trace, signals, options, dossier });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const watchTrail = async () => {
    if (!result || !membership) return;
    const targets = result.trace.nodes.filter((n) => n.depth > 0 && (n.status === "holding" || n.status === "not_followed"));
    let added = 0;
    for (const n of targets.slice(0, 20)) {
      await addWatch(membership.organizationId, n.address, `Trail of ${shortAddress(result.trace.root)}`, "monitor").then(() => (added += 1)).catch(() => undefined);
    }
    setNote(`${added} account${added === 1 ? "" : "s"} in the trail now watched: you get security and movement events for them within a minute.`);
  };

  return (
    <section className="max-w-[880px] space-y-3">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        For an account that was drained. NOSHASHI follows the value out of it hop by hop (payments and AccountDelete sweeps, past the
        dust thieves spray), says what became of every account it reached, and lists every recovery path that actually exists. A
        validated XRP Ledger transaction cannot be reversed by anyone; these paths work off-ledger. {deep ? "Forensic depth: five hops, 1,000 transactions an account." : "Two hops, 400 transactions an account (Enterprise traces five)."}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="The drained account (r…)" className="mono-font h-8 min-w-[280px] flex-1 text-[10.5px]" />
        <Input value={since} onChange={(e) => setSince(e.target.value)} placeholder="From ledger (optional)" className="mono-font h-8 w-44 text-[10.5px]" />
        <Button size="sm" disabled={Boolean(busy) || !isValidAddress(address.trim())} onClick={() => void run()}>
          INVESTIGATE
        </Button>
      </div>
      {busy && <p className="mono-font animate-pulse text-[9px] text-muted-foreground">{busy}</p>}
      {error && <p className="text-[9.5px] text-no-go">{error}</p>}
      {result && (
        <div className="space-y-2">
          <Eyebrow>WHAT HAPPENED</Eyebrow>
          {result.signals.length === 0 && <p className="text-[10px] text-muted-foreground">No value left this account from that ledger in the history read.</p>}
          {result.signals.map((s) => (
            <div key={s.id} className="border border-border p-2">
              <p className="text-[10px] text-foreground">
                <span className={cn("stencil mr-1.5 text-[8px] tracking-[0.18em]", TONE[s.severity])}>{s.severity.toUpperCase()}</span>
                {s.title}
              </p>
              <p className="mt-0.5 text-[9.5px] leading-relaxed text-muted-foreground">{s.detail}</p>
            </div>
          ))}

          <Eyebrow>WHERE THE VALUE WENT</Eyebrow>
          <div className="space-y-0.5 border border-border p-2">
            {result.trace.flows.slice(0, 60).map((f) => (
              <p key={f.hash + f.to} className="mono-font text-[9px] text-foreground">
                {f.at?.slice(0, 16).replace("T", " ") ?? f.ledger} · {shortAddress(f.from)} → {shortAddress(f.to)}
                {f.destinationTag !== null ? ` tag ${f.destinationTag}` : ""} · {f.amount.value.toLocaleString("en-US", { maximumFractionDigits: 6 })} {f.amount.currency}
                {f.kind === "account_delete" ? " · ACCOUNT DELETE" : ""}
              </p>
            ))}
            {result.trace.dust.count > 0 && (
              <p className="text-[9px] text-muted-foreground">
                Plus {result.trace.dust.count.toLocaleString("en-US")} payments under {result.trace.minXrp} XRP, not followed: the spray that hides the real transfers.
              </p>
            )}
          </div>
          <div className="space-y-0.5 border border-border p-2">
            {result.trace.nodes.map((n) => (
              <p key={n.address} className="mono-font text-[9px] text-muted-foreground">
                hop {n.depth} · <span className="text-foreground">{n.address}</span> · {n.status.replace("_", " ")}
                {n.balanceXrp !== null ? ` · ${n.balanceXrp.toLocaleString("en-US")} XRP` : ""}
                {n.domain ? ` · claims ${n.domain}` : ""}
                {n.sanction ? ` · OFAC SDN: ${n.sanction.entityName}` : ""}
              </p>
            ))}
            {result.trace.vanity.map((v) => (
              <p key={v.ending} className="text-[9.5px] text-hold">
                {v.accounts.length} accounts share the ending "{v.ending}": a generated vanity series, the mark of an organised operation.
              </p>
            ))}
          </div>

          <Eyebrow>RECOVERY PATHS</Eyebrow>
          {result.options.map((o) => (
            <div key={o.id} className="border border-border p-2">
              <p className="text-[10px] text-foreground">
                <span className={cn("stencil mr-1.5 text-[8px] tracking-[0.18em]", OUTLOOK[o.outlook].tone)}>{OUTLOOK[o.outlook].label}</span>
                {o.title}
              </p>
              <p className="mt-0.5 text-[9.5px] leading-relaxed text-muted-foreground">{o.detail}</p>
              {o.evidence?.map((e) => (
                <p key={e} className="mono-font selectable break-all text-[9px] text-foreground">
                  {e}
                </p>
              ))}
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-1.5 border border-dashed border-border p-2">
            <span className="mono-font selectable break-all text-[9px] text-muted-foreground">DOSSIER SHA-256 {result.dossier.sha256}</span>
            <Button size="sm" variant="outline" onClick={() => void saveTextFile(`noshashi-incident-${result.trace.root}.txt`, result.dossier.text, "text/plain").then((where) => setNote(`Saved: ${where}`))}>
              SAVE DOSSIER
            </Button>
            <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(result.dossier.text).then(() => setNote("Dossier copied."))}>
              COPY
            </Button>
            {deep && membership && org.accountId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void openOrgCase(membership.organizationId, { entry: incidentEntry(result), actor: org.accountId! })
                    .then((id) => setNote(`Case ${id} opened for the organization, linked to this dossier's SHA-256.`))
                    .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                }
              >
                OPEN INVESTIGATION CASE
              </Button>
            )}
            {has("security_guardian") && membership && (
              <Button size="sm" variant="outline" onClick={() => void watchTrail()}>
                WATCH THE TRAIL
              </Button>
            )}
          </div>
          {note && <p className="text-[9.5px] text-go">{note}</p>}
        </div>
      )}
    </section>
  );
}

/* ── Guardian ───────────────────────────────────────────────────────── */

function GuardianTab() {
  const org = useOrg();
  const membership = org.state.status === "ready" && org.state.data ? org.state.data.membership : null;
  const [events, setEvents] = useState<LedgerEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!membership) return;
    try {
      const [keys, deleted, settings] = await Promise.all([
        listEvents(membership.organizationId, { type: "keys_changed" }, 50),
        listEvents(membership.organizationId, { type: "account_deleted" }, 50),
        listEvents(membership.organizationId, { type: "account_settings_changed" }, 50),
      ]);
      const master = settings.filter((e) => e.data.set === "disableMasterKey" || e.data.clear === "disableMasterKey");
      setEvents([...keys, ...deleted, ...master].sort((a, b) => b.id - a.id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [membership]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!membership) {
    return <p className="max-w-[640px] text-[10px] text-muted-foreground">Guardian watches an organization's accounts. Create or join one in the WORKSTATION.</p>;
  }
  return (
    <section className="max-w-[820px] space-y-2">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Every account the organization watches in LEDGER WATCH is read each minute. When one's regular key or signer list changes, its
        master key is disabled or re-enabled, or it is deleted, your webhooks receive a signed <span className="mono-font">security_alert</span>{" "}
        within a minute: the first move in almost every takeover is a key of the thief's own. Subscribe to it under POLICY › WEBHOOKS.
      </p>
      <div className="flex items-center gap-2">
        <Eyebrow>SECURITY EVENTS ON WATCHED ACCOUNTS</Eyebrow>
        <Button size="sm" variant="ghost" onClick={() => void load()}>REFRESH</Button>
      </div>
      {error && <p className="text-[9.5px] text-no-go">{error}</p>}
      {events?.length === 0 && <p className="text-[10px] text-muted-foreground">None recorded. Quiet is what you want here.</p>}
      {events?.map((e) => (
        <p key={e.id} className="mono-font text-[9.5px] text-foreground">
          <span className="stencil mr-1.5 text-[8px] tracking-[0.18em] text-hold">{e.type.toUpperCase()}</span>
          {e.ledgerTime?.slice(0, 16).replace("T", " ") ?? e.ledgerIndex} · {shortAddress(e.address)} · {JSON.stringify(e.data).slice(0, 160)}
        </p>
      ))}
    </section>
  );
}
