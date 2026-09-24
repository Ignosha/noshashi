import { useCallback, useEffect, useState } from "react";
import { Eyebrow } from "@/components/nova/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  WEBHOOK_EVENTS,
  createWebhook,
  listDeliveries,
  listWebhooks,
  sendTestWebhook,
  setWebhookActive,
  webhookUrlProblem,
  type Delivery,
  type Webhook,
  type WebhookEvent,
} from "@/lib/org/webhooks";
import { cn } from "@/lib/utils";

const utc = (iso?: string | null) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "—");

/**
 * Webhooks: send the organization's governance events to its own systems.
 * Owners and admins only (enforced by the server). The signing secret is
 * shown once, when the webhook is created.
 */
export function WebhooksPanel({ organizationId }: { organizationId: string }) {
  const [hooks, setHooks] = useState<Webhook[] | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(["policy_exception", "exception_decided"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [h, d] = await Promise.all([listWebhooks(organizationId), listDeliveries(organizationId)]);
      setHooks(h);
      setDeliveries(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const urlProblem = url.trim() ? webhookUrlProblem(url) : null;

  return (
    <section>
      <Eyebrow className="mb-2">WEBHOOKS · SIGNED EVENTS TO YOUR SYSTEMS</Eyebrow>
      <p className="mb-2 max-w-[720px] text-[9.5px] leading-snug text-muted-foreground">
        Sent by the server when it records the event, as an HTTPS POST signed with HMAC-SHA256
        (header <span className="mono-font">X-Noshashi-Signature: t=…,v1=…</span> over "t.body"). Failed deliveries are retried three
        times. Only owners and admins can see or change webhooks.
      </p>

      {secret && (
        <div className="mb-2 border border-hold/60 p-2">
          <p className="stencil text-[8px] tracking-[0.2em] text-hold">SIGNING SECRET · SHOWN ONCE</p>
          <p className="mono-font selectable mt-1 break-all text-[10px] text-foreground">{secret}</p>
          <p className="mt-1 text-[9px] text-muted-foreground">Store it in your receiving system now. NOSHASHI cannot show it again.</p>
          <Button size="sm" variant="ghost" className="mt-1" onClick={() => setSecret(null)}>I HAVE STORED IT</Button>
        </div>
      )}

      {hooks === null && !error && <p className="mono-font animate-pulse text-[9px] text-muted-foreground">LOADING…</p>}
      {hooks && hooks.length === 0 && <p className="text-[10px] text-muted-foreground">No webhooks.</p>}
      {hooks && hooks.length > 0 && (
        <div className="space-y-1.5">
          {hooks.map((h) => {
            const recent = deliveries.filter((d) => d.webhookId === h.id).slice(0, 5);
            return (
              <div key={h.id} className="border border-border p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="mono-font selectable break-all text-[10px] text-foreground">{h.url}</p>
                  <span className={cn("stencil text-[8px] tracking-[0.2em]", h.active ? "text-go" : "text-muted-foreground")}>
                    ● {h.active ? "ACTIVE" : "DISABLED"}
                  </span>
                </div>
                {h.description && <p className="text-[9.5px] text-muted-foreground">{h.description}</p>}
                <p className="mono-font text-[9px] text-muted-foreground">{h.events.join(" · ")}</p>
                <div className="mt-1 flex gap-1.5">
                  <Button size="sm" variant="outline" disabled={busy || !h.active} onClick={() => void run(() => sendTestWebhook(h.id))}>SEND TEST</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => setWebhookActive(h.id, !h.active))}>
                    {h.active ? "DISABLE" : "ENABLE"}
                  </Button>
                </div>
                {recent.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {recent.map((d) => (
                      <p key={d.id} className="mono-font text-[8.5px] text-muted-foreground">
                        {utc(d.createdAt)} · {d.event} ·{" "}
                        <span className={d.status === "delivered" ? "text-go" : d.status === "failed" ? "text-no-go" : "text-hold"}>
                          {d.status.toUpperCase()}
                        </span>
                        {d.responseStatus ? ` · HTTP ${d.responseStatus}` : ""} · attempt {d.attempt}
                        {d.error ? ` · ${d.error}` : ""}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-2 border border-dashed border-border p-2">
        <p className="stencil mb-1 text-[8px] tracking-[0.2em] text-muted-foreground">ADD WEBHOOK</p>
        <div className="flex flex-wrap gap-1.5">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-system.example.com/noshashi" className="mono-font h-7 w-80 text-[10px]" />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="h-7 w-56 text-[10px]" maxLength={200} />
        </div>
        {urlProblem && <p className="mt-1 text-[9px] text-no-go">{urlProblem}</p>}
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {WEBHOOK_EVENTS.map((ev) => (
            <label key={ev.id} className="flex items-center gap-1 text-[9.5px] text-foreground">
              <input
                type="checkbox"
                checked={events.includes(ev.id)}
                onChange={(e) => setEvents((cur) => (e.target.checked ? [...cur, ev.id] : cur.filter((x) => x !== ev.id)))}
              />
              {ev.label}
            </label>
          ))}
        </div>
        <Button
          size="sm"
          className="mt-1.5"
          disabled={busy || !url.trim() || Boolean(urlProblem) || events.length === 0}
          onClick={() =>
            void run(async () => {
              const r = await createWebhook(organizationId, url, events, description);
              setSecret(r.secret);
              setUrl("");
              setDescription("");
            })
          }
        >
          CREATE WEBHOOK
        </Button>
      </div>
      {error && <p role="alert" className="mt-1.5 text-[9.5px] text-no-go">{error}</p>}
    </section>
  );
}
