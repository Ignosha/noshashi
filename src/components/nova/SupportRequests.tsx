import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useToast } from "@/lib/toast";
import {
  activeGrants,
  allowSupportAccess,
  answerRepair,
  openAccessRequests,
  pendingRepairs,
  type AccessRequest,
} from "@/lib/support/repair";
import { repairAction, runsByItself, type AccessGrant, type RepairRequest } from "@/lib/support/repairCatalog";

const POLL_MS = 15_000;

/**
 * NOSHASHI support, wherever the person is in the app.
 *
 * When support asks to look at the account, this asks the person, on
 * whatever screen they are on, instead of waiting for them to open the
 * ticket. When support sends a repair for this computer, it either runs by
 * itself (the read-only snapshot while access is allowed, or any fix while
 * the person allowed fixes) or waits here for Apply. Nothing runs for a
 * request addressed to another of the person's computers.
 */
export function SupportRequests({ signedIn }: { signedIn: boolean }) {
  const { push } = useToast();
  const { refresh: refreshPlan, entitlement } = useBilling();
  const tierRef = useRef(entitlement.tier);
  tierRef.current = entitlement.tier;
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [repairs, setRepairs] = useState<RepairRequest[]>([]);
  const [grants, setGrants] = useState<Record<string, AccessGrant>>({});
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [hours, setHours] = useState(24);
  const [autoRepair, setAutoRepair] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const running = useRef(new Set<string>());

  const runtime = useRef({
    refreshPlan,
    tier: () => tierRef.current,
    reconnect: () => window.dispatchEvent(new Event("noshashi:resync")),
  });
  runtime.current.refreshPlan = refreshPlan;

  const load = useCallback(async () => {
    try {
      const [r, p, g] = await Promise.all([openAccessRequests(), pendingRepairs(), activeGrants()]);
      setRequests(r);
      setRepairs(p);
      setGrants(g);
    } catch {
      // Not signed in, offline, or support tables not on this server: nothing to show.
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [signedIn, load]);

  // Requests the grant allows run by themselves, once each.
  useEffect(() => {
    for (const request of repairs) {
      if (running.current.has(request.id) || !runsByItself(request, grants[request.ticketId] ?? null)) continue;
      running.current.add(request.id);
      const title = repairAction(request.action)?.title ?? request.action;
      void answerRepair(request, "apply", runtime.current, true)
        .then((result) => push({ title: "NOSHASHI SUPPORT", body: `${title}: ${result.split("\n")[0]}`, tone: "go" }))
        .catch((error) => push({ title: "SUPPORT FIX DID NOT COMPLETE", body: `${title}: ${error instanceof Error ? error.message : "try again"}`, tone: "no-go" }))
        .finally(() => void load());
    }
  }, [repairs, grants, push, load]);

  if (!signedIn) return null;

  const ask = requests.find((r) => !dismissed.has(r.logId));
  const waiting = repairs.filter((r) => !runsByItself(r, grants[r.ticketId] ?? null));
  if (!ask && !waiting.length) return null;

  const act = async (key: string, fn: () => Promise<string>, failure: string) => {
    setBusy(key);
    try {
      push({ title: "DONE", body: (await fn()).split("\n")[0], tone: "go" });
      await load();
    } catch (e) {
      push({ title: failure, body: e instanceof Error ? e.message : "Try again in a moment.", tone: "no-go" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside
      aria-label="NOSHASHI support"
      className="fixed bottom-4 left-4 z-50 w-[min(26rem,calc(100vw-2rem))] space-y-2 border border-border bg-background/95 p-4 shadow-xl backdrop-blur"
    >
      {ask && (
        <section aria-labelledby="support-ask-title" className="space-y-2" role="alertdialog" aria-describedby="support-ask-body">
          <p className="stencil text-[10px] tracking-[0.14em] text-muted-foreground">NOSHASHI SUPPORT · {ask.ticketRef}</p>
          <h2 id="support-ask-title" className="text-[13px] font-[600] text-foreground">
            Support is asking to look at this app
          </h2>
          <div id="support-ask-body" className="space-y-1 text-[11.5px] leading-relaxed text-muted-foreground">
            <p>For your ticket “{ask.subject}”.{ask.reason ? ` Reason: ${ask.reason}` : ""}</p>
            <p>
              Allowing it lets support see your plan, API key names (never the keys), and a read-only picture of this app on this computer.
              You can revoke it at any time from the ticket.
            </p>
          </div>
          <label className="flex items-center gap-2 text-[11.5px] text-foreground">
            <span>Allow for</span>
            <select
              className="border border-input bg-background px-1.5 py-0.5 text-[11.5px]"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            >
              <option value={4}>4 hours</option>
              <option value={24}>24 hours</option>
              <option value={72}>72 hours</option>
            </select>
          </label>
          <label className="flex items-start gap-2 text-[11.5px] leading-snug text-foreground">
            <input type="checkbox" className="mt-0.5" checked={autoRepair} onChange={(e) => setAutoRepair(e.target.checked)} />
            <span>
              Also let support apply fixes to this app without asking me each time
              <span className="block text-muted-foreground">Only fixes from NOSHASHI's fixed list, each shown here and in the ticket's log. Never funds or keys.</span>
            </span>
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                void act(
                  "allow",
                  async () => {
                    await allowSupportAccess(ask.ticketId, hours, autoRepair);
                    return `Support can look at this app for ${hours} hours${autoRepair ? " and apply fixes" : ""}.`;
                  },
                  "ACCESS NOT ALLOWED"
                )
              }
            >
              {busy === "allow" ? "ALLOWING…" : "ALLOW"}
            </Button>
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setDismissed((d) => new Set(d).add(ask.logId))}>
              NOT NOW
            </Button>
          </div>
        </section>
      )}

      {waiting.length > 0 && (
        <section aria-labelledby="support-fixes-title" className="space-y-2">
          <h2 id="support-fixes-title" className="stencil text-[10px] tracking-[0.14em] text-muted-foreground">
            FIXES SUPPORT SENT FOR THIS COMPUTER
          </h2>
          <ul className="space-y-2">
            {waiting.slice(0, 3).map((r) => {
              const a = repairAction(r.action);
              return (
                <li key={r.id} className="border border-hold/40 bg-hold/5 p-2.5">
                  <p className="text-[12px] font-[600] text-foreground">{a?.title ?? r.action}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{a?.customer}</p>
                  {r.note && <p className="mt-0.5 text-[11px] text-foreground">Support's note: {r.note}</p>}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" disabled={busy !== null} onClick={() => void act(r.id, () => answerRepair(r, "apply", runtime.current), "FIX DID NOT COMPLETE")}>
                      {busy === r.id ? "APPLYING…" : "APPLY"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void act(`d-${r.id}`, () => answerRepair(r, "decline", runtime.current), "NOT DECLINED")}>
                      DECLINE
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </aside>
  );
}
