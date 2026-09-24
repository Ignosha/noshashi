import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * noshashi-exception-decide — the only way a policy exception is approved,
 * rejected, or sent back for more evidence.
 *
 * The caller is identified from their JWT. noshashi.decide_policy_exception
 * then checks, in one transaction: the actor exists and belongs to the
 * exception's organization (a non-member gets NOT_FOUND, not a hint), has
 * the owner/admin/compliance role, the exception is still pending, it
 * carries evidence and a receipt, and the approver is not the requester.
 * It records the decision and writes the audit event. It is executable by
 * service_role only; a trigger on the table refuses any approval by a
 * non-authorized member even from a direct service-role write.
 *
 * `request_evidence` is the third decision: the reviewer asks the requester
 * for more before deciding (noshashi.request_exception_evidence, the same
 * role and four-eyes checks, a written note required). The requester answers
 * from the app with a supplement; the exception then returns to pending.
 *
 * The verdict and its receipt are never touched: an exception is a record
 * beside them.
 */

function createServiceClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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

const OUTCOMES: Record<string, { status: number; title: string; message: string }> = {
  NOT_AUTHENTICATED: { status: 401, title: "AUTHORIZATION REQUIRED", message: "Sign in to decide an exception." },
  NOT_FOUND: { status: 404, title: "EXCEPTION NOT FOUND", message: "No such exception in an organization you belong to." },
  INSUFFICIENT_PERMISSIONS: { status: 403, title: "AUTHORIZATION REQUIRED", message: "Your role cannot approve exceptions. Owner, admin or compliance is required." },
  FOUR_EYES_REQUIRED: {
    status: 403,
    title: "FOUR-EYES APPROVAL REQUIRED",
    message: "The person who requested this exception cannot decide it. A second authorized user must.",
  },
  ALREADY_DECIDED: { status: 409, title: "ALREADY DECIDED", message: "This exception has already been decided." },
  AWAITING_EVIDENCE: { status: 409, title: "AWAITING EVIDENCE", message: "More evidence was requested. It can be decided once the requester adds it." },
  ALREADY_REQUESTED: { status: 409, title: "EVIDENCE ALREADY REQUESTED", message: "More evidence has already been requested. The requester must add it before anyone decides." },
  EVIDENCE_REQUIRED: { status: 422, title: "EVIDENCE REQUIRED", message: "An exception cannot be decided without its evidence and receipt." },
  NOTE_REQUIRED: { status: 422, title: "NOTE REQUIRED", message: "Rejecting an exception, or asking for more evidence, needs a written note of at least 10 characters." },
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { ok: false, code: "METHOD_NOT_ALLOWED" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const fail = (code: string) => {
    const o = OUTCOMES[code] ?? { status: 500, title: "DECISION FAILED", message: "The exception was not decided. No changes were committed." };
    return json(request, { ok: false, code, title: o.title, message: o.message }, o.status);
  };
  if (!url || !anonKey || !serviceKey) return fail("SERVER_MISCONFIGURED");

  try {
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await asCaller.auth.getUser();
    if (userError || !userData.user) return fail("NOT_AUTHENTICATED");

    const body = await request.json().catch(() => ({}));
    const exceptionId = String(body.exceptionId ?? "");
    const decision = String(body.decision ?? "");
    const note = typeof body.note === "string" ? body.note.slice(0, 4000) : null;
    if (!/^[0-9a-f-]{36}$/i.test(exceptionId) || !["approve", "reject", "request_evidence"].includes(decision)) {
      return json(request, { ok: false, code: "BAD_REQUEST", title: "DECISION FAILED", message: "Malformed request. Nothing was changed." }, 400);
    }

    const service = createServiceClient(url, serviceKey).schema("noshashi");
    const { data: result, error } =
      decision === "request_evidence"
        ? await service.rpc("request_exception_evidence", { p_exception: exceptionId, p_actor: userData.user.id, p_note: note })
        : await service.rpc("decide_policy_exception", {
            p_exception: exceptionId,
            p_actor: userData.user.id,
            p_approve: decision === "approve",
            p_note: note,
          });
    if (error) throw error;
    if (!result?.ok) {
      // decide_policy_exception only decides from pending; an exception
      // sent back for evidence is not "already decided", it is waiting.
      if (result?.code === "ALREADY_DECIDED" && result?.status === "needs_evidence") return fail("AWAITING_EVIDENCE");
      return fail(String(result?.code ?? "DECISION_FAILED"));
    }
    return json(request, { ok: true, ...result });
  } catch (error) {
    console.error("noshashi-exception-decide", error instanceof Error ? error.message : error);
    return fail("DECISION_FAILED");
  }
});
