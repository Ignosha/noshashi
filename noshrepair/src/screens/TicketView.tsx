import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { PRIORITIES, STATUS_LABEL, ticketRef, type Ticket, type TicketMessage, type TicketPriority, type TicketStatus } from "@/lib/support/tickets";
import { ACCESS_EVENT_LABEL, REPAIR_ACTIONS, repairAction, type AccessEvent, type AccessGrant, type RepairActionId, type RepairRequest } from "@/lib/support/repairCatalog";
import {
  accessLogFor,
  accountView,
  diagnostics,
  grantFor,
  messages,
  proposeRepair,
  repairsFor,
  reply,
  requestAccess,
  setTicket,
  ticket as loadTicket,
  type AccountView,
  type Diagnostic,
} from "../api";
import { Alert, Badge, LiveStatus, PageTitle, Section } from "../ui";

const POLL_MS = 15_000;
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "never");
const message = (e: unknown) => (e instanceof Error ? e.message : "That did not work. Try again.");

const REPAIR_TONE: Record<RepairRequest["status"], "go" | "hold" | "no-go" | "muted"> = {
  pending: "hold",
  applied: "go",
  declined: "muted",
  failed: "no-go",
  expired: "muted",
};

/**
 * One ticket: the conversation (including what the support chatbot handed
 * over), the diagnostics the customer's app attached, and the only two ways
 * NOSHREPAIR reaches into an account: a read-only view while the customer's
 * grant lasts, and a repair from the fixed list that runs only when the
 * customer presses Apply in their own app.
 */
export function TicketView({ id, onBack }: { id: string; onBack: () => void }) {
  const [ticket, setTicketState] = useState<Ticket | null | undefined>(undefined);
  const [thread, setThread] = useState<TicketMessage[]>([]);
  const [diags, setDiags] = useState<Diagnostic[]>([]);
  const [grant, setGrant] = useState<AccessGrant | null>(null);
  const [repairs, setRepairs] = useState<RepairRequest[]>([]);
  const [log, setLog] = useState<AccessEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await loadTicket(id);
      setTicketState(t);
      if (!t) return;
      const [m, d, g, r, l] = await Promise.all([messages(id), diagnostics(id), grantFor(id), repairsFor(id), accessLogFor(id)]);
      setThread(m);
      setDiags(d);
      setGrant(g);
      setRepairs(r);
      setLog(l);
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (work: () => Promise<void>, done: string) => {
    setError(null);
    setSaved(null);
    try {
      await work();
      setSaved(done);
      await load();
    } catch (e) {
      setError(message(e));
    }
  };

  if (ticket === undefined) return <LiveStatus>Loading the ticket…</LiveStatus>;
  if (ticket === null)
    return (
      <div>
        <PageTitle eyebrow="TICKET">Not found</PageTitle>
        <Button variant="outline" onClick={onBack}>
          Back to the queue
        </Button>
      </div>
    );

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-3 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
        ← Back to the queue
      </button>
      <PageTitle eyebrow={`${ticketRef(ticket)} · ${ticket.category.toUpperCase()}`}>{ticket.subject}</PageTitle>
      <p className="mb-4 text-sm text-muted-foreground">
        Opened {when(ticket.createdAt)} · app {ticket.appVersion ?? "unknown"} on {ticket.platform ?? "unknown"}
      </p>
      <Alert>{error}</Alert>
      {saved && <Alert tone="info">{saved}</Alert>}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <TicketControls ticket={ticket} onChange={(change, done) => act(() => setTicket(id, change), done)} />
          <Thread thread={thread} />
          <ReplyForm onSend={(body) => act(() => reply(id, body), "Reply sent. The customer sees it in their app.")} />
        </div>
        <div className="space-y-4">
          <AccountAccess ticketId={id} grant={grant} onRequest={(reason) => act(() => requestAccess(id, reason), "Request sent. The customer is asked in their app.")} />
          <Repairs
            grant={grant}
            repairs={repairs}
            onPropose={(action, note) => act(() => proposeRepair(id, action, note), "Repair sent. It runs only when the customer presses Apply.")}
          />
          <Diagnostics items={diags} />
          <AccessLog events={log} />
        </div>
      </div>
    </div>
  );
}

function TicketControls({ ticket, onChange }: { ticket: Ticket; onChange: (change: { status?: TicketStatus; priority?: TicketPriority }, done: string) => void }) {
  const statusId = useId();
  const priorityId = useId();
  const select = "border border-input bg-background px-3 py-2 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  return (
    <Section title="STATUS">
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1.5">
          <label htmlFor={statusId} className="block text-sm font-[600]">
            Status
          </label>
          <select id={statusId} className={select} value={ticket.status} onChange={(e) => onChange({ status: e.target.value as TicketStatus }, "Status saved.")}>
            {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={priorityId} className="block text-sm font-[600]">
            Priority
          </label>
          <select id={priorityId} className={select} value={ticket.priority} onChange={(e) => onChange({ priority: e.target.value as TicketPriority }, "Priority saved.")}>
            {PRIORITIES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Section>
  );
}

function Thread({ thread }: { thread: TicketMessage[] }) {
  return (
    <Section title="CONVERSATION">
      {thread.length === 0 ? (
        <p className="text-sm text-muted-foreground">No messages yet.</p>
      ) : (
        <ol className="space-y-3" aria-label="Messages, oldest first">
          {thread.map((m) => (
            <li key={m.id} className={m.authorRole === "staff" ? "border-l-2 border-primary pl-3" : "border-l-2 border-border pl-3"}>
              <p className="text-xs text-muted-foreground">
                <span className="font-[600] text-foreground">{m.authorRole === "staff" ? "Support" : "Customer"}</span> ·{" "}
                <time dateTime={m.createdAt}>{when(m.createdAt)}</time>
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{m.body}</p>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function ReplyForm({ onSend }: { onSend: (body: string) => Promise<void> }) {
  const id = useId();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    await onSend(body.trim());
    setBody("");
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={id} className="block text-sm font-[600]">
        Reply to the customer
      </label>
      <textarea
        id={id}
        rows={5}
        maxLength={8000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="w-full border border-input bg-transparent px-3 py-2 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      <Button type="submit" disabled={busy || !body.trim()}>
        {busy ? "Sending…" : "Send reply"}
      </Button>
    </form>
  );
}

function AccountAccess({ ticketId, grant, onRequest }: { ticketId: string; grant: AccessGrant | null; onRequest: (reason: string) => Promise<void> }) {
  const reasonId = useId();
  const [view, setView] = useState<AccountView | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // A grant that ended (revoked or expired) takes the view with it.
  useEffect(() => {
    if (!grant) setView(null);
  }, [grant]);

  const open = async () => {
    setError(null);
    try {
      setView(await accountView(ticketId));
    } catch (e) {
      setError(message(e));
    }
  };

  return (
    <Section title="ACCOUNT · READ-ONLY">
      <Alert>{error}</Alert>
      {grant ? (
        <div className="space-y-3 text-sm">
          <p>
            <Badge tone="go">ACCESS ALLOWED</Badge> until <time dateTime={grant.expiresAt}>{when(grant.expiresAt)}</time>. The customer can revoke it at any time, and
            every view is in their access log.
          </p>
          {!view ? (
            <Button variant="outline" onClick={open}>
              View the account
            </Button>
          ) : (
            <AccountDetails view={view} />
          )}
        </div>
      ) : (
        <form
          className="space-y-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void onRequest(reason.trim() || "To look into this ticket.").then(() => setReason(""));
          }}
        >
          <p className="text-muted-foreground">
            The customer has not allowed access. Ask them; they choose 4, 24 or 72 hours in their app, and can revoke it.
          </p>
          <label htmlFor={reasonId} className="block font-[600]">
            Why you need to look
          </label>
          <input
            id={reasonId}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="To check which plan the server has for you"
            className="w-full border border-input bg-transparent px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <Button type="submit" variant="outline">
            Ask for access
          </Button>
        </form>
      )}
    </Section>
  );
}

function AccountDetails({ view }: { view: AccountView }) {
  const rows: Array<[string, string]> = [
    ["Email", view.account?.email ?? "unknown"],
    ["Name", view.account?.display_name ?? "not set"],
    ["Joined", when(view.account?.created_at)],
    ["Plan", view.entitlement ? `${view.entitlement.tier}${view.entitlement.seats ? ` · ${view.entitlement.seats} seats` : ""}` : "none on record"],
    ["Plan valid until", when(view.entitlement?.valid_until)],
    ["Plan last updated", when(view.entitlement?.updated_at)],
    ["Organizations", String(view.organizations)],
    ["Portfolio wallets", String(view.portfolio_wallets)],
    ["Open tickets", String(view.open_tickets)],
  ];
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="break-words text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h3 className="font-[600]">Subscriptions</h3>
        {view.subscriptions.length === 0 ? (
          <p className="text-muted-foreground">None.</p>
        ) : (
          <ul className="list-disc pl-5">
            {view.subscriptions.map((s, i) => (
              <li key={i}>
                {s.tier} · {s.status}
                {s.current_period_end ? ` · renews ${when(s.current_period_end)}` : ""}
                {s.cancel_at_period_end ? " · cancels at period end" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="font-[600]">API keys</h3>
        <p className="text-xs text-muted-foreground">Names and prefixes only. Key values are never readable, by anyone.</p>
        {view.api_keys.length === 0 ? (
          <p className="text-muted-foreground">None.</p>
        ) : (
          <ul className="list-disc pl-5">
            {view.api_keys.map((k) => (
              <li key={k.prefix}>
                <span className="mono-font">{k.prefix}…</span> {k.name} · {k.revoked ? "revoked" : "active"} · last used {when(k.last_used_at)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Repairs({ grant, repairs, onPropose }: { grant: AccessGrant | null; repairs: RepairRequest[]; onPropose: (action: RepairActionId, note: string) => Promise<void> }) {
  const noteId = useId();
  const [action, setAction] = useState<RepairActionId>("run_self_repair");
  const [note, setNote] = useState("");
  const chosen = repairAction(action);
  return (
    <Section title="REPAIRS">
      <p className="mb-3 text-sm text-muted-foreground">
        Pick a fix from the fixed list. The customer sees it in plain words and it runs on their machine only when they press Apply. Nothing else can be sent.
      </p>
      {grant ? (
        <form
          className="space-y-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void onPropose(action, note).then(() => setNote(""));
          }}
        >
          <fieldset className="space-y-1.5">
            <legend className="mb-1 font-[600]">Repair</legend>
            {REPAIR_ACTIONS.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-start gap-2">
                <input type="radio" name="repair" className="mt-1" value={a.id} checked={action === a.id} onChange={() => setAction(a.id)} />
                <span>
                  <span className="text-foreground">{a.title}</span>
                  <span className="block text-xs text-muted-foreground">{a.staff}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {chosen && (
            <p className="border border-border bg-background p-2 text-xs">
              <span className="font-[600]">The customer will read:</span> {chosen.customer}
            </p>
          )}
          <label htmlFor={noteId} className="block font-[600]">
            Note to the customer (optional)
          </label>
          <input
            id={noteId}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border border-input bg-transparent px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <Button type="submit">Send repair to the customer</Button>
        </form>
      ) : (
        <p className="text-sm">Repairs need the customer's access first.</p>
      )}
      {repairs.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm" aria-label="Repairs on this ticket">
          {repairs.map((r) => (
            <li key={r.id} className="border-t border-border pt-2">
              <Badge tone={REPAIR_TONE[r.status]}>{r.status.toUpperCase()}</Badge> {repairAction(r.action)?.title ?? r.action}
              <span className="block text-xs text-muted-foreground">
                Sent {when(r.requestedAt)}
                {r.decidedAt ? ` · answered ${when(r.decidedAt)}` : ""}
              </span>
              {r.result && <p className="mt-1 whitespace-pre-wrap break-words text-xs">{r.result}</p>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Diagnostics({ items }: { items: Diagnostic[] }) {
  return (
    <Section title="DIAGNOSTICS FROM THE APP">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None attached. Propose "Share recent diagnostics" to ask for them.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((d) => (
            <li key={d.id}>
              <details className="border border-border p-2">
                <summary className="cursor-pointer">
                  {d.kind} · <time dateTime={d.createdAt}>{when(d.createdAt)}</time>
                </summary>
                {/* Rendered as text: a customer's payload is never HTML. */}
                <pre className="mono-font mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(d.payload, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function AccessLog({ events }: { events: AccessEvent[] }) {
  return (
    <Section title="ACCESS LOG · THE CUSTOMER SEES THIS TOO">
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {events.map((e) => (
            <li key={e.id}>
              <time dateTime={e.at} className="text-muted-foreground">
                {when(e.at)}
              </time>{" "}
              · {ACCESS_EVENT_LABEL[e.event]}
              {e.detail ? <span className="text-muted-foreground"> · {e.detail}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
