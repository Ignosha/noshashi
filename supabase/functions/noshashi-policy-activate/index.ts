import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { policyHash, validateParams } from "./policy.ts";

/**
 * noshashi-policy-activate — the only way an organization policy becomes
 * active.
 *
 * 1. The caller is identified from their JWT, never from the request body.
 * 2. Membership is checked before anything about the policy is read, so a
 *    non-member learns nothing, not even whether the policy exists.
 * 3. The stored parameters are validated and the canonical hash recomputed
 *    here, with the same rules the app uses (./policy.ts, held in step by
 *    src/lib/desk/__tests__/policy-runtimes.test.ts).
 * 4. noshashi.activate_org_policy then does everything else in ONE
 *    transaction: role (owner/admin/compliance), four-eyes (actor is not
 *    the author), status (pending), hash match, archive the previous
 *    version, activate, audit. It is executable by service_role only, and
 *    a trigger on the table re-checks four-eyes and role on any write that
 *    makes a policy active — so no client, and no bug here, can activate a
 *    policy its author alone approved.
 *
 * The response is the database's answer. The app shows ACTIVE only when
 * this returns ok: true.
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

/** Database result code → HTTP status and the message the app shows. */
const OUTCOMES: Record<string, { status: number; title: string; message: string }> = {
  NOT_AUTHENTICATED: { status: 401, title: "AUTHORIZATION REQUIRED", message: "Sign in to activate a policy." },
  NOT_A_MEMBER: { status: 404, title: "POLICY NOT FOUND", message: "No such policy in an organization you belong to." },
  NOT_FOUND: { status: 404, title: "POLICY NOT FOUND", message: "No such policy in an organization you belong to." },
  INSUFFICIENT_PERMISSIONS: { status: 403, title: "AUTHORIZATION REQUIRED", message: "Your role cannot activate policies." },
  FOUR_EYES_REQUIRED: {
    status: 403,
    title: "FOUR-EYES APPROVAL REQUIRED",
    message: "The policy author cannot activate this policy. A second authorized user must activate it.",
  },
  ALREADY_ACTIVE: { status: 409, title: "POLICY ALREADY ACTIVE", message: "This policy version has already been activated." },
  NOT_SUBMITTED: { status: 409, title: "NOT SUBMITTED", message: "Only a policy submitted for activation can be activated." },
  AUTHOR_UNKNOWN: { status: 409, title: "ACTIVATION FAILED", message: "The policy's author could not be established. The policy was not activated." },
  VALIDATION_FAILED: {
    status: 422,
    title: "POLICY VALIDATION FAILED",
    message: "The policy could not be activated because one or more parameters are invalid.",
  },
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { ok: false, code: "METHOD_NOT_ALLOWED" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    return json(request, { ok: false, code: "ACTIVATION_FAILED", title: "ACTIVATION FAILED", message: "The server is misconfigured. The policy was not activated. No changes were committed." }, 503);
  }

  const fail = (code: string, extra: Record<string, unknown> = {}) => {
    const o = OUTCOMES[code] ?? { status: 500, title: "ACTIVATION FAILED", message: "The policy was not activated. No changes were committed." };
    return json(request, { ok: false, code, title: o.title, message: o.message, ...extra }, o.status);
  };

  try {
    // 1. Who is asking — from the JWT only.
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await asCaller.auth.getUser();
    if (userError || !userData.user) return fail("NOT_AUTHENTICATED");
    const actor = userData.user.id;

    const body = await request.json().catch(() => ({}));
    const organizationId = String(body.organizationId ?? "");
    const policyId = String(body.policyId ?? "");
    const version = Number(body.version);
    if (!/^[0-9a-f-]{36}$/i.test(organizationId) || !/^[a-z0-9_]{3,64}$/.test(policyId) || !Number.isInteger(version) || version < 1) {
      return json(request, { ok: false, code: "BAD_REQUEST", title: "ACTIVATION FAILED", message: "Malformed request. The policy was not activated." }, 400);
    }

    const service = createServiceClient(url, serviceKey).schema("noshashi");

    // 2. Membership before anything about the policy.
    const { data: member, error: memberError } = await service
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("account_id", actor)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!member) return fail("NOT_A_MEMBER");

    // 3. Validate what is stored and recompute its canonical hash.
    const { data: policy, error: policyError } = await service
      .from("org_policies")
      .select("policy_id, name, version, params, hash, engine, status")
      .eq("organization_id", organizationId)
      .eq("policy_id", policyId)
      .eq("version", version)
      .maybeSingle();
    if (policyError) throw policyError;
    if (!policy) return fail("NOT_FOUND");

    const errors = validateParams(policy.params);
    if (errors.length) return fail("VALIDATION_FAILED", { errors });
    const recomputed = await policyHash({ id: policy.policy_id, name: policy.name, version: policy.version, params: policy.params });
    if (recomputed !== policy.hash) {
      return fail("VALIDATION_FAILED", { errors: [{ field: "hash", message: "The stored hash does not match the policy's parameters." }] });
    }

    // 4. Everything else, atomically, in the database.
    const { data: result, error: rpcError } = await service.rpc("activate_org_policy", {
      p_org: organizationId,
      p_policy: policyId,
      p_version: version,
      p_actor: actor,
      p_verified_hash: recomputed,
    });
    if (rpcError) throw rpcError;
    if (!result?.ok) return fail(String(result?.code ?? "ACTIVATION_FAILED"));
    return json(request, { ok: true, ...result });
  } catch (error) {
    console.error("noshashi-policy-activate", error instanceof Error ? error.message : error);
    return fail("ACTIVATION_FAILED");
  }
});
