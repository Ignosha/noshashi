import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  accessLog,
  activeGrant,
  allowSupportAccess,
  answerRepair,
  repairRequests,
  revokeSupportAccess,
} from "@/lib/support/repair";
import { ACCESS_EVENT_LABEL, repairAction, type AccessEvent, type AccessGrant, type RepairRequest } from "@/lib/support/repairCatalog";

const POLL_MS = 20_000;

/**
 * The customer's controls for NOSHREPAIR, shown on their own ticket.
 *
 * Support can only ever see this account if the customer allows it here,
 * read-only and for a time they choose, and only ever change something on
 * this computer if the customer presses Apply on a repair. Every look and
 * every repair is listed in the access log below, which nobody can edit.
 */
export function SupportAccess({ ticketId }: { ticketId: string }) {
  const { push } = useToast();
  const { refresh: refreshPlan, entitlement } = useBilling();
  const tierRef = useRef(entitlement.tier);
  tierRef.current = entitlement.tier;
  const [grant, setGrant] = useState<AccessGrant | null>(null);
  const [requests, setRequests] = useState<RepairRequest[]>([]);
  const [log, setLog] = useState<AccessEvent[]>([]);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, r, l] = await Promise.all([activeGrant(ticketId), repairRequests(ticketId), accessLog(ticketId)]);
      setGrant(g);
      setRequests(r);
      setLog(l);
      setUnavailable(false);
    } catch {
      // The NOSHREPAIR tables are not on this server yet; the ticket still works.
      setUnavailable(true);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const run = async (key: string, fn: () => Promise<string | void>, failure: string) => {
    setBusy(key);
    try {
      const message = await fn();
      if (message) push({ title: "DONE", body: message.split("\n")[0], tone: "go" });
      await load();
    } catch (e) {
      push({ title: failure, body: e instanceof Error ? e.message : "Try again in a moment.", tone: "no-go" });
    } finally {
      setBusy(null);
    }
  };

  if (unavailable) return null;

  const pending = requests.filter((r) => r.status === "pending");
  const done = requests.filter((r) => r.status !== "pending");
  const runtime = {
    refreshPlan,
    tier: () => tierRef.current,
    reconnect: () => window.dispatchEvent(new Event("noshashi:resync")),
  };

  return (
    <section aria-labelledby={`support-access-${ticketId}`} className="space-y-3 border-b border-border p-4">
      <h4 id={`support-access-${ticketId}`} className="stencil text-[10px] tracking-[0.14em] text-muted-foreground">
        SUPPORT ACCESS AND REPAIRS
      </h4>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {grant ? (
          <>
            <span className="text-foreground">
              Support can view this account, read-only, until{" "}
              <time dateTime={grant.expiresAt}>{new Date(grant.expiresAt).toLocaleString()}</time>.
            </span>
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run("revoke", async () => { await revokeSupportAccess(ticketId); return "Support can no longer view this account."; }, "ACCESS NOT REVOKED")}>
              REVOKE NOW
            </Button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">Support cannot see this account unless you allow it.</span>
            <label className="flex items-center gap-1 text-muted-foreground">
              <span className="sr-only">How long support may view the account</span>
              <select
                className="border border-input bg-background px-1.5 py-0.5 text-[11px] text-foreground"
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              >
                <option value={4}>for 4 hours</option>
                <option value={24}>for 24 hours</option>
                <option value={72}>for 72 hours</option>
              </select>
            </label>
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run("allow", async () => { await allowSupportAccess(ticketId, hours); return `Support can view this account for ${hours} hours. You can revoke it at any time.`; }, "ACCESS NOT ALLOWED")}>
              ALLOW READ-ONLY ACCESS
            </Button>
          </>
        )}
      </div>
      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        Read-only means support sees your plan, API key names (never the keys), and the diagnostics you shared. Support can never
        see keys, move funds, or change anything without your Apply.
      </p>

      {pending.length > 0 && (
        <ul className="space-y-2" aria-label="Repairs support has proposed">
          {pending.map((r) => {
            const a = repairAction(r.action);
            return (
              <li key={r.id} className="border border-hold/40 bg-hold/5 p-3">
                <p className="text-[12px] font-[600] text-foreground">{a?.title ?? r.action}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{a?.customer}</p>
                {r.note && <p className="mt-1 text-[11px] text-foreground">Support's note: {r.note}</p>}
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={busy !== null} onClick={() => void run(r.id, () => answerRepair(r, "apply", runtime), "REPAIR DID NOT COMPLETE")}>
                    {busy === r.id ? "APPLYING…" : "APPLY"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run(`d-${r.id}`, () => answerRepair(r, "decline", runtime), "NOT DECLINED")}>
                    DECLINE
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(done.length > 0 || log.length > 0) && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Access log and past repairs</summary>
          <ul className="mt-2 space-y-1">
            {done.map((r) => (
              <li key={r.id} className="text-muted-foreground">
                <span className={cn("stencil text-[10px] tracking-[0.12em]", r.status === "applied" ? "text-go" : r.status === "failed" ? "text-no-go" : "text-muted-foreground")}>
                  {r.status.toUpperCase()}
                </span>{" "}
                {repairAction(r.action)?.title ?? r.action}
                {r.decidedAt ? ` · ${new Date(r.decidedAt).toLocaleString()}` : ""}
              </li>
            ))}
            {log.map((e) => (
              <li key={`log-${e.id}`} className="text-muted-foreground">
                <time dateTime={e.at}>{new Date(e.at).toLocaleString()}</time> · {ACCESS_EVENT_LABEL[e.event]}
                {e.detail ? ` · ${e.detail}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
