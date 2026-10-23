import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorSignatures, issueUrl, type Signature } from "../api";
import { openIssue } from "../native";
import { Alert, LiveStatus, PageTitle } from "../ui";

/**
 * The same crash across many tickets, grouped by message. This is where a
 * fix for every NOSHASHI app starts: the error that keeps coming back gets
 * a GitHub issue, and the fix ships in the next release.
 */
export function Errors({ onOpenTicket }: { onOpenTicket: (id: string) => void }) {
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<Signature[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      setRows(await errorSignatures(days));
      setError(null);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "The error report could not be loaded.");
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageTitle eyebrow="ACROSS EVERY TICKET">Recurring errors</PageTitle>
      <p className="mb-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
        Errors customers' apps attached to tickets, already scrubbed of keys, tokens and email addresses on their machine. The most reported come first.
      </p>
      <fieldset className="mb-4 flex flex-wrap gap-2">
        <legend className="mb-1 text-sm font-[600]">Period</legend>
        {[7, 14, 30, 90].map((d) => (
          <label key={d} className="flex cursor-pointer items-center gap-1.5 border border-border px-3 py-1.5 text-sm has-[:checked]:border-primary">
            <input type="radio" name="days" checked={days === d} onChange={() => setDays(d)} />
            Last {d} days
          </label>
        ))}
      </fieldset>
      <Alert>{error}</Alert>
      {rows === null ? (
        <LiveStatus>Loading…</LiveStatus>
      ) : rows.length === 0 ? (
        <LiveStatus>No errors reported in this period.</LiveStatus>
      ) : (
        <ol className="space-y-3">
          {rows.map((s) => (
            <li key={s.message} className="border border-border bg-card/60 p-4">
              <p className="mono-font break-words text-sm text-foreground">{s.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.reports} report{s.reports === 1 ? "" : "s"} on {s.tickets} ticket{s.tickets === 1 ? "" : "s"} · versions {(s.versions ?? []).join(", ") || "unknown"} · last
                seen <time dateTime={s.last_seen}>{new Date(s.last_seen).toLocaleString()}</time>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onOpenTicket(s.latest_ticket)}>
                  Open the latest ticket
                </Button>
                <Button size="sm" variant="outline" onClick={() => void openIssue(issueUrl(s)).catch((e) => setError(e instanceof Error ? e.message : String(e)))}>
                  File a GitHub issue<span className="sr-only"> (opens your browser)</span>
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
