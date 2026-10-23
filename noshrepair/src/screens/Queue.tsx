import { useCallback, useEffect, useState } from "react";
import { STATUS_LABEL, ticketRef, type Ticket, type TicketStatus } from "@/lib/support/tickets";
import { queue } from "../api";
import { Alert, Badge, LiveStatus, PageTitle } from "../ui";

const POLL_MS = 20_000;
const STATUS_TONE: Record<TicketStatus, "hold" | "go" | "muted"> = { open: "hold", answered: "go", resolved: "muted" };

/** Every ticket, newest activity first. Each one arrives here as soon as a customer or the support chatbot opens it. */
export function Queue({ onOpen }: { onOpen: (id: string) => void }) {
  const [status, setStatus] = useState<TicketStatus | "all">("open");
  const [search, setSearch] = useState("");
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTickets(await queue({ status, search }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The queue could not be loaded.");
    }
  }, [status, search]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div>
      <PageTitle eyebrow="TICKETS">Queue</PageTitle>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-sm font-[600] text-foreground">Show</legend>
          {(["open", "answered", "resolved", "all"] as const).map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-1.5 border border-border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:text-foreground">
              <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} />
              {s === "all" ? "All" : STATUS_LABEL[s]}
            </label>
          ))}
        </fieldset>
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="queue-search" className="mb-1 block text-sm font-[600] text-foreground">
            Search
          </label>
          <input
            id="queue-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Subject, NSH number or topic"
            className="w-full border border-input bg-transparent px-3 py-2 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
      </div>
      <Alert>{error}</Alert>
      {tickets === null ? (
        <LiveStatus>Loading tickets…</LiveStatus>
      ) : tickets.length === 0 ? (
        <LiveStatus>No tickets match.</LiveStatus>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Support tickets, newest activity first. {tickets.length} shown.</caption>
            <thead className="bg-card">
              <tr>
                {["Ticket", "Subject", "Topic", "Priority", "Status", "Last activity"].map((h) => (
                  <th key={h} scope="col" className="stencil px-3 py-2 text-xs font-normal tracking-[0.12em] text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-card/80">
                  <td className="mono-font px-3 py-2">{ticketRef(t)}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => onOpen(t.id)} className="text-left text-foreground underline-offset-4 hover:underline">
                      {t.subject}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{t.category}</td>
                  <td className="px-3 py-2">{t.priority}</td>
                  <td className="px-3 py-2">
                    <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <time dateTime={t.lastMessageAt}>{new Date(t.lastMessageAt).toLocaleString()}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
