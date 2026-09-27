import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * noshashi-support-notify — emails the other side of a support ticket.
 *
 * The app calls this after a ticket is opened or replied to, with the new
 * message's id. A customer's message goes to the support inbox; a staff
 * reply goes to the customer's account email. The caller must be the
 * message's author and the message must be under ten minutes old, so the
 * function cannot be used to send mail about anything else, and each
 * message is emailed at most once (noshashi.support_notifications).
 *
 * Email is sent through Resend (free tier: 3,000 emails a month) when the
 * project owner has set these secrets; without them the function answers
 * `sent: false` and the ticket still works, in the app, for both sides:
 *   RESEND_API_KEY   the Resend API key
 *   SUPPORT_INBOX    where new tickets go (default support@noshashi.app)
 *   SUPPORT_FROM     the sender, on a domain verified in Resend
 *                    (default "NOSHASHI Support <support@noshashi.app>")
 */

const CATEGORY: Record<string, string> = {
  account: "Account and sign-in",
  billing: "Billing and plans",
  "ledger-data": "Ledger data",
  verification: "Verification and verdicts",
  noshx: "NOSHX",
  bug: "Something is broken",
  security: "Security",
  feature: "Feature request",
  other: "Other",
};

function corsHeaders(request: Request): Record<string, string> {
  const requested = request.headers.get("Access-Control-Request-Headers");
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": requested ?? "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Access-Control-Request-Headers",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { ok: false, code: "METHOD_NOT_ALLOWED" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json(request, { ok: false, code: "SERVER_MISCONFIGURED" }, 500);

  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who } = await asCaller.auth.getUser();
  const me = who?.user?.id;
  if (!me) return json(request, { ok: false, code: "NOT_AUTHENTICATED" }, 401);

  let messageId: number;
  try {
    messageId = Number((await request.json())?.message_id);
  } catch {
    return json(request, { ok: false, code: "MALFORMED" }, 400);
  }
  if (!Number.isSafeInteger(messageId) || messageId <= 0) return json(request, { ok: false, code: "MALFORMED" }, 400);

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }).schema("noshashi");

  const { data: message } = await db
    .from("support_messages")
    .select("id, ticket_id, author_id, author_role, body, created_at")
    .eq("id", messageId)
    .maybeSingle();
  // Only the author, and only about a fresh message: nobody can use this to
  // mail about someone else's ticket or replay an old one.
  if (!message || message.author_id !== me) return json(request, { ok: false, code: "NOT_FOUND" }, 404);
  if (Date.now() - Date.parse(message.created_at) > 10 * 60 * 1000) {
    return json(request, { ok: false, code: "TOO_OLD" }, 409);
  }

  const { data: ticket } = await db
    .from("support_tickets")
    .select("id, number, account_id, subject, category, priority, app_version, platform")
    .eq("id", message.ticket_id)
    .maybeSingle();
  if (!ticket) return json(request, { ok: false, code: "NOT_FOUND" }, 404);

  const { data: customer } = await db.from("accounts").select("email").eq("id", ticket.account_id).maybeSingle();
  const inbox = Deno.env.get("SUPPORT_INBOX") || "support@noshashi.app";
  const to = message.author_role === "staff" ? customer?.email : inbox;
  if (!to) return json(request, { ok: false, code: "NO_RECIPIENT" }, 422);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json(request, { ok: true, sent: false, reason: "EMAIL_NOT_CONFIGURED" });

  // Claim the message before sending, so two calls cannot both send it.
  const { error: claimError } = await db.from("support_notifications").insert({ message_id: message.id, sent_to: to });
  if (claimError) return json(request, { ok: true, sent: false, reason: "ALREADY_SENT" });

  const ref = `NSH-${ticket.number}`;
  const fromStaff = message.author_role === "staff";
  const subject = fromStaff ? `[${ref}] Reply from NOSHASHI support: ${ticket.subject}` : `[${ref}] ${ticket.subject}`;
  const lines = fromStaff
    ? [
        `NOSHASHI support replied to your ticket ${ref}, "${ticket.subject}":`,
        "",
        message.body,
        "",
        "Reply in the NOSHASHI app: NOSHX › Support › your ticket. Replies to this email are not read.",
      ]
    : [
        `${ref} · ${CATEGORY[ticket.category] ?? ticket.category} · ${ticket.priority} priority`,
        `From: ${customer?.email ?? "unknown"}${ticket.app_version ? ` · app ${ticket.app_version}` : ""}${ticket.platform ? ` · ${ticket.platform}` : ""}`,
        "",
        message.body,
        "",
        "Answer it in the NOSHASHI app: NOSHX › Support › Inbox.",
      ];

  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("SUPPORT_FROM") || "NOSHASHI Support <support@noshashi.app>",
      to: [to],
      subject,
      text: lines.join("\n"),
      ...(fromStaff ? {} : { reply_to: customer?.email }),
    }),
  }).catch(() => null);

  if (!sent || !sent.ok) {
    // Give the claim back so a later call can retry.
    await db.from("support_notifications").delete().eq("message_id", message.id);
    return json(request, { ok: false, code: "EMAIL_FAILED", status: sent?.status ?? 0 }, 502);
  }
  return json(request, { ok: true, sent: true });
});
