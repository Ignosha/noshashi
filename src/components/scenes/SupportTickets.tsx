import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eyebrow } from "@/components/nova/Panel";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/useAuth";
import { CONTACT } from "@/lib/brand";
import { timeAgo } from "@/lib/format";
import {
  CATEGORIES,
  PRIORITIES,
  STATUS_LABEL,
  environmentLine,
  isSupportStaff,
  listMessages,
  listTickets,
  openTicket,
  replyToTicket,
  ticketRef,
  updateTicket,
  type Ticket,
  type TicketCategory,
  type TicketMessage,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/support/tickets";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** How often an open screen re-reads tickets, so replies appear without a click. */
const POLL_MS = 20_000;

const statusTone: Record<TicketStatus, string> = {
  open: "bg-hold",
  answered: "bg-go",
  resolved: "bg-muted-foreground",
};

const priorityTone: Record<TicketPriority, string> = {
  low: "text-muted-foreground",
  normal: "text-foreground",
  high: "text-hold",
  urgent: "text-no-go",
};

const categoryLabel = (id: TicketCategory) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

/**
 * Support tickets inside NOSHX. A customer opens a ticket and follows the
 * thread; support staff see every ticket in an inbox, reply, and set status
 * and priority. Everything shown is read from the server; nothing is shown
 * as sent until the server has accepted it.
 */
export function SupportTickets({ draftFromChat, onDraftUsed }: { draftFromChat?: string; onDraftUsed?: () => void }) {
  const { user, loading: authLoading } = useAuth();
  const { push } = useToast();
  const [staff, setStaff] = useState(false);
  const [scope, setScope] = useState<"mine" | "inbox">("mine");
  const [filter, setFilter] = useState<TicketStatus | "all">("all");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | "new" | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await listTickets(scope === "mine" ? { mine: user.id } : {});
      setTickets(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tickets could not be loaded.");
    } finally {
      setLoaded(true);
    }
  }, [user, scope]);

  useEffect(() => {
    if (!user) return;
    void isSupportStaff().then((isStaff) => {
      setStaff(isStaff);
      if (isStaff) setScope("inbox");
    });
  }, [user]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // A question the operator asked in Support chat becomes a new ticket's draft.
  useEffect(() => {
    if (draftFromChat && user) setSelected("new");
  }, [draftFromChat, user]);

  const shown = useMemo(() => tickets.filter((t) => filter === "all" || t.status === filter), [tickets, filter]);
  const counts = useMemo(() => {
    const c = { open: 0, answered: 0, resolved: 0 };
    for (const t of tickets) c[t.status] += 1;
    return c;
  }, [tickets]);
  const current = tickets.find((t) => t.id === selected) ?? null;

  if (authLoading) return <p className="p-4 text-[11px] text-muted-foreground">Checking your sign-in…</p>;

  if (!user) {
    return (
      <div className="space-y-3 p-4 text-[11px] leading-relaxed text-muted-foreground">
        <Eyebrow>SUPPORT TICKETS</Eyebrow>
        <p className="max-w-prose text-foreground">
          Sign in from the ACCOUNT screen to open a ticket and follow the replies here. Tickets are private: only you and
          NOSHASHI support can read yours.
        </p>
        <p className="max-w-prose">
          Without an account you can still email <span className="mono-font text-foreground">{CONTACT.support}</span>, or ask
          in the Support chat, which answers from NOSHASHI's own help and pages.
        </p>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(240px,1fr)_2fr] divide-x divide-border">
      {/* List */}
      <div className="flex min-h-0 flex-col">
        <div className="space-y-2 border-b border-border p-3">
          <div className="flex items-center gap-2">
            {staff ? (
              <div className="flex gap-1" role="tablist" aria-label="Tickets to show">
                {(["inbox", "mine"] as const).map((s) => (
                  <button
                    key={s}
                    role="tab"
                    aria-selected={scope === s}
                    onClick={() => {
                      setScope(s);
                      setSelected(null);
                    }}
                    className={cn(
                      "stencil border px-2 py-1 text-[10px] tracking-[0.14em]",
                      scope === s ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {s === "inbox" ? "INBOX · ALL CUSTOMERS" : "MY TICKETS"}
                  </button>
                ))}
              </div>
            ) : (
              <Eyebrow>MY TICKETS</Eyebrow>
            )}
            <Button size="sm" className="ml-auto" onClick={() => setSelected("new")}>
              NEW TICKET
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", "open", "answered", "resolved"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "stencil px-1.5 py-0.5 text-[10px] tracking-[0.1em]",
                  filter === f ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f === "all" ? `ALL · ${tickets.length}` : `${STATUS_LABEL[f]} · ${counts[f]}`}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <p className="p-3 text-[11px] text-no-go">{error}</p>}
          {!loaded ? (
            <p className="p-3 text-[11px] text-muted-foreground">Loading tickets…</p>
          ) : shown.length === 0 ? (
            <p className="p-3 text-[11px] leading-relaxed text-muted-foreground">
              {scope === "inbox" ? "No tickets here." : "You have no tickets. Open one with NEW TICKET."}
            </p>
          ) : (
            <ul>
              {shown.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelected(t.id)}
                    className={cn(
                      "w-full border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-accent/40",
                      selected === t.id && "bg-accent/60"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("h-1.5 w-1.5 shrink-0", statusTone[t.status])} />
                      <span className="mono-font text-[10.5px] text-muted-foreground">{ticketRef(t)}</span>
                      <span className={cn("stencil text-[10px] tracking-[0.1em]", priorityTone[t.priority])}>
                        {t.priority.toUpperCase()}
                      </span>
                      <span className="ml-auto text-[10.5px] text-muted-foreground">
                        {timeAgo(Date.parse(t.lastMessageAt))}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-foreground">{t.subject}</p>
                    <p className="text-[10.5px] text-muted-foreground">
                      {categoryLabel(t.category)} · {STATUS_LABEL[t.status].toLowerCase()}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="min-h-0 overflow-y-auto">
        {selected === "new" ? (
          <NewTicket
            initialBody={draftFromChat}
            onCancel={() => setSelected(null)}
            onOpened={async (id, number) => {
              onDraftUsed?.();
              push({ title: `TICKET NSH-${number} OPENED`, body: "Support has it. Replies appear here and by email.", tone: "go" });
              if (staff) setScope("mine");
              await refresh();
              setSelected(id);
            }}
          />
        ) : current ? (
          <Thread
            ticket={current}
            me={user.id}
            staff={staff}
            onChanged={refresh}
          />
        ) : (
          <div className="space-y-2 p-4 text-[11px] leading-relaxed text-muted-foreground">
            <Eyebrow>{staff && scope === "inbox" ? "SUPPORT INBOX" : "SUPPORT TICKETS"}</Eyebrow>
            <p className="max-w-prose">
              {staff && scope === "inbox"
                ? "Every customer's tickets, newest activity first. Open one to reply or change its status and priority. Tickets waiting on support are marked amber."
                : "Pick a ticket to read the thread and reply, or open a new one. A reply from support marks the ticket green and is emailed to you."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function NewTicket({
  initialBody,
  onCancel,
  onOpened,
}: {
  initialBody?: string;
  onCancel: () => void;
  onOpened: (id: string, number: number) => void | Promise<void>;
}) {
  const { push } = useToast();
  const [subject, setSubject] = useState(initialBody ? initialBody.slice(0, 120) : "");
  const [category, setCategory] = useState<TicketCategory>("bug");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [body, setBody] = useState(initialBody ?? "");
  const [includeEnvironment, setIncludeEnvironment] = useState(true);
  const [sending, setSending] = useState(false);
  const env = useMemo(() => environmentLine(), []);

  const valid = subject.trim().length >= 4 && body.trim().length >= 10;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || sending) return;
    setSending(true);
    try {
      const { id, number } = await openTicket({ subject, category, priority, body, includeEnvironment });
      await onOpened(id, number);
    } catch (e) {
      push({ title: "TICKET NOT OPENED", body: e instanceof Error ? e.message : "Try again in a moment.", tone: "no-go" });
    } finally {
      setSending(false);
    }
  };

  const field = "w-full border border-input bg-transparent px-2.5 py-1.5 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <form onSubmit={submit} className="space-y-3 p-4">
      <Eyebrow>NEW TICKET</Eyebrow>
      <label className="block space-y-1">
        <span className="stencil text-[10px] tracking-[0.14em] text-muted-foreground">SUBJECT</span>
        <input id="ticket-subject" className={field} value={subject} maxLength={160} onChange={(e) => setSubject(e.target.value)} placeholder="NOSHX shows “failed to render” after updating" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="stencil text-[10px] tracking-[0.14em] text-muted-foreground">TOPIC</span>
          <select id="ticket-category" className={cn(field, "bg-background")} value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="stencil text-[10px] tracking-[0.14em] text-muted-foreground">PRIORITY</span>
          <select id="ticket-priority" className={cn(field, "bg-background")} value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
            {PRIORITIES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="stencil text-[10px] tracking-[0.14em] text-muted-foreground">WHAT HAPPENED</span>
        <textarea
          id="ticket-body"
          rows={8}
          className={cn(field, "resize-y leading-relaxed")}
          value={body}
          maxLength={8000}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What you did, what you expected, and what you saw instead. Paste any error text. Never paste a secret key or seed."
        />
      </label>
      <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
        <input id="ticket-env" type="checkbox" checked={includeEnvironment} onChange={(e) => setIncludeEnvironment(e.target.checked)} className="mt-0.5" />
        <span>
          Include the app version and platform ({env.appVersion} · {env.platform}). Nothing else about this computer is sent.
        </span>
      </label>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={!valid || sending}>
          {sending ? "SENDING…" : "OPEN TICKET"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          CANCEL
        </Button>
        {!valid && <span className="text-[10.5px] text-muted-foreground">A subject of 4+ characters and a description of 10+.</span>}
      </div>
    </form>
  );
}

function Thread({ ticket, me, staff, onChanged }: { ticket: Ticket; me: string; staff: boolean; onChanged: () => Promise<void> }) {
  const { push } = useToast();
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setMessages(await listMessages(ticket.id));
    } finally {
      setLoaded(true);
    }
  }, [ticket.id]);

  useEffect(() => {
    setLoaded(false);
    setReply("");
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages.length]);

  const isOwner = ticket.accountId === me;
  const act = async (fn: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await fn();
      await Promise.all([load(), onChanged()]);
    } catch (e) {
      push({ title: failure, body: e instanceof Error ? e.message : "Try again in a moment.", tone: "no-go" });
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    act(async () => {
      await replyToTicket(ticket.id, reply);
      setReply("");
    }, "REPLY NOT SENT");

  return (
    <div className="flex min-h-full flex-col">
      <div className="space-y-1.5 border-b border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono-font text-[11px] text-muted-foreground">{ticketRef(ticket)}</span>
          <span className={cn("h-1.5 w-1.5", statusTone[ticket.status])} />
          <span className="stencil text-[10px] tracking-[0.14em] text-muted-foreground">{STATUS_LABEL[ticket.status]}</span>
          <span className={cn("stencil text-[10px] tracking-[0.14em]", priorityTone[ticket.priority])}>
            {ticket.priority.toUpperCase()} PRIORITY
          </span>
        </div>
        <h3 className="text-[13px] font-medium text-foreground [text-wrap:balance]">{ticket.subject}</h3>
        <p className="text-[11px] text-muted-foreground">
          {categoryLabel(ticket.category)} · opened {new Date(ticket.createdAt).toLocaleString()}
          {ticket.appVersion ? ` · app ${ticket.appVersion}` : ""}
          {ticket.platform ? ` · ${ticket.platform}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {staff && (
            <>
              <label className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                STATUS
                <select
                  id="ticket-status"
                  className="border border-input bg-background px-1.5 py-0.5 text-[11px] text-foreground"
                  value={ticket.status}
                  disabled={busy}
                  onChange={(e) => void act(() => updateTicket(ticket.id, { status: e.target.value as TicketStatus }), "STATUS NOT CHANGED")}
                >
                  {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s].toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                PRIORITY
                <select
                  id="ticket-set-priority"
                  className="border border-input bg-background px-1.5 py-0.5 text-[11px] text-foreground"
                  value={ticket.priority}
                  disabled={busy}
                  onChange={(e) => void act(() => updateTicket(ticket.id, { priority: e.target.value as TicketPriority }), "PRIORITY NOT CHANGED")}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {isOwner && !staff && ticket.status !== "resolved" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => updateTicket(ticket.id, { status: "resolved" }), "NOT RESOLVED")}>
              MARK RESOLVED
            </Button>
          )}
          {isOwner && !staff && ticket.status === "resolved" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => updateTicket(ticket.id, { status: "open" }), "NOT REOPENED")}>
              REOPEN
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-2.5 p-4">
        {!loaded ? (
          <p className="text-[11px] text-muted-foreground">Loading the thread…</p>
        ) : (
          messages.map((m) => {
            const mine = m.authorId === me;
            return (
              <div key={m.id} className={cn("max-w-[85%] border p-3", m.authorRole === "staff" ? "border-primary/40 bg-primary/5" : "border-border", mine && "ml-auto")}>
                <p className="stencil mb-1 text-[10px] tracking-[0.14em] text-muted-foreground">
                  {m.authorRole === "staff" ? "NOSHASHI SUPPORT" : mine ? "YOU" : "CUSTOMER"} · {new Date(m.createdAt).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground">{m.body}</p>
              </div>
            );
          })
        )}
        <div ref={end} />
      </div>

      <div className="sticky bottom-0 space-y-2 border-t border-border bg-background p-3">
        <textarea
          id="ticket-reply"
          rows={3}
          value={reply}
          maxLength={8000}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim()) void send();
          }}
          placeholder={staff && !isOwner ? "Reply to the customer. They are emailed when you send." : ticket.status === "resolved" ? "Replying reopens this ticket." : "Add to this ticket."}
          className="w-full resize-none border border-input bg-transparent px-2.5 py-1.5 text-[11px] leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={busy || reply.trim().length === 0} onClick={() => void send()}>
            {busy ? "SENDING…" : staff && !isOwner ? "SEND REPLY" : "SEND"}
          </Button>
          <span className="text-[10.5px] text-muted-foreground">Ctrl/⌘ + Enter to send · never paste a secret key or seed</span>
        </div>
      </div>
    </div>
  );
}
