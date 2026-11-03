import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  batchPayload,
  parseBatch,
  reviewRows,
  ReviewError,
  REVIEW_PLANS,
  type ReviewTier,
} from "../_shared/paymentReview.ts";
import { digest, hexSha256 } from "../noshashi-verify/payment.ts";

export type Services = {
  admin: SupabaseClient;
  user: (token: string) => Promise<{ id: string; mfaRequired: boolean } | null>;
  billing: (
    action: "checkout" | "portal",
    accountId: string,
    cadence: string,
  ) => Promise<{ url: string }>;
  fetcher?: typeof fetch;
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,idempotency-key,x-client-info,x-noshashi-client",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
function assertDb(error: unknown) {
  if (error)
    throw new ReviewError(
      503,
      "Private storage is unavailable. Retry later with the same request key.",
    );
}

export async function handle(request: Request, services: Services) {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  try {
    const token =
      request.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? "";
    const db = services.admin.schema("noshashi");
    let accountId: string;
    let apiKey = false;
    if (token.startsWith("nsh_review_")) {
      const { data: k, error } = await db
        .from("api_keys")
        .select("id,account_id,revoked_at,expires_at,scopes")
        .eq("key_hash", await hexSha256(token))
        .maybeSingle();
      assertDb(error);
      if (
        !k ||
        k.revoked_at ||
        (k.expires_at && Date.parse(k.expires_at) <= Date.now()) ||
        !k.scopes.includes("payment_review")
      )
        throw new ReviewError(401, "API key is invalid, expired or revoked.");
      accountId = k.account_id;
      apiKey = true;
    } else {
      if (!token)
        throw new ReviewError(
          401,
          "Sign in or supply a Payment Review API key.",
        );
      const user = await services.user(token);
      if (!user)
        throw new ReviewError(401, "Your session expired. Sign in again.");
      if (user.mfaRequired)
        throw new ReviewError(
          403,
          "Complete your account’s second-factor check.",
        );
      accountId = user.id;
    }
    const route =
      new URL(request.url).pathname
        .split("/noshashi-payment-review")[1]
        ?.replace(/^\//, "")
        .replace(/\/$/, "") || "runs";
    if (
      apiKey &&
      !["runs", "usage"].includes(route) &&
      !/^runs\/[a-f0-9-]{36}$/.test(route)
    )
      throw new ReviewError(
        403,
        "Use a signed-in account to manage keys or billing.",
      );
    const readBody = async () => {
      const reader = request.body?.getReader();
      if (!reader) throw new ReviewError(400, "Body must be a JSON object.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 65536) {
          await reader.cancel();
          throw new ReviewError(413, "Use a JSON body smaller than 64 KB.");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      try {
        const parsed = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error();
        return parsed;
      } catch {
        throw new ReviewError(400, "Body must be a valid JSON object.");
      }
    };
    if (route === "usage" && request.method === "GET") {
      const { data: tier, error } = await db.rpc("payment_review_tier", {
        p_account: accountId,
      });
      assertDb(error);
      if (!(tier in REVIEW_PLANS))
        throw new ReviewError(503, "Plan state is unavailable.");
      const period = new Date().toISOString().slice(0, 7) + "-01";
      const { data: usage, error: usageError } = await db
        .from("payment_review_usage")
        .select("records")
        .eq("account_id", accountId)
        .eq("period_start", period)
        .maybeSingle();
      assertDb(usageError);
      return json({
        tier,
        plan: REVIEW_PLANS[tier as ReviewTier],
        period_start: period,
        used: usage?.records ?? 0,
        period: "UTC calendar month",
        overage_charges: false,
      });
    }
    if (route === "keys") {
      if (request.method === "GET") {
        const { data, error } = await db
          .from("api_keys")
          .select("id,name,prefix,created_at,expires_at,revoked_at")
          .eq("account_id", accountId)
          .contains("scopes", ["payment_review"])
          .order("created_at", { ascending: false })
          .limit(100);
        assertDb(error);
        return json({ keys: data });
      }
      if (request.method === "POST") {
        const body = await readBody();
        const raw =
          "nsh_review_" +
          Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join("");
        const { data, error } = await db.rpc('payment_review_create_key',{
            p_account: accountId,
            p_name:
              String(body.name ?? "Payment Review")
                .trim()
                .slice(0, 80) || "Payment Review",
            p_prefix: raw.slice(0, 18),
            p_hash: await hexSha256(raw),
          });
        assertDb(error);
        if(data?.error)throw new ReviewError(429,data.error);
        return json(
          {
            key: raw,
            metadata: data,
            notice: "Shown once. Store this key securely.",
          },
          201,
        );
      }
      if (request.method === "DELETE") {
        const { id } = await readBody();
        if (!/^[a-f0-9-]{36}$/.test(String(id)))
          throw new ReviewError(400, "Choose a valid key ID.");
        const { error } = await db
          .from("api_keys")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", id)
          .eq("account_id", accountId)
          .contains("scopes", ["payment_review"])
          .is("revoked_at", null);
        assertDb(error);
        return json({ revoked: true });
      }
    }
    if (["checkout", "portal"].includes(route) && request.method === "POST") {
      const body = await readBody();
      return json(
        await services.billing(
          route as "checkout" | "portal",
          accountId,
          String(body.cadence ?? "monthly"),
        ),
      );
    }
    if (route === "runs" && request.method === "GET") {
      const { data, error } = await db
        .from("payment_review_runs")
        .select("id,created_at,status,records,charged_records")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(30);
      assertDb(error);
      return json({ runs: data });
    }
    const match = /^runs\/([a-f0-9-]{36})$/.exec(route);
    if (match && request.method === "GET") {
      const { data, error } = await db
        .from("payment_review_runs")
        .select("id,status,result,created_at")
        .eq("account_id", accountId)
        .eq("id", match[1])
        .maybeSingle();
      assertDb(error);
      if (!data) throw new ReviewError(404, "Run not found.");
      return json(data, data.status === "processing" ? 202 : 200);
    }
    if (route === "runs" && request.method === "POST") {
      const rows = parseBatch(await readBody());
      const key = request.headers.get("Idempotency-Key") ?? "";
      if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key))
        throw new ReviewError(
          400,
          "Supply an Idempotency-Key of 8–128 letters, digits, dots, colons, dashes or underscores.",
        );
      const { data: claim, error } = await db.rpc("payment_review_begin", {
        p_account: accountId,
        p_key: key,
        p_hash: await digest(batchPayload(rows)),
        p_records: rows.length,
      });
      assertDb(error);
      if (claim.error)
        throw new ReviewError(
          claim.error === "idempotency_conflict" ? 409 : 429,
          `${claim.error}${claim.limit ? `: limit ${claim.limit}` : ""}. Public single-payment tools remain available at /delivered/.`,
        );
      if (claim.replay)
        return json(
          {
            id: claim.id,
            status: claim.status,
            result: claim.result,
            replayed: true,
          },
          claim.status === "processing" ? 202 : 200,
        );
      let result;
      try {
        result = await reviewRows(rows, services.fetcher);
      } catch {
        const { error: finishError } = await db.rpc("payment_review_finish", {
          p_account: accountId,
          p_id: claim.id,
          p_result: {
            error: "Review could not finish. No result was accepted.",
          },
          p_charge: 0,
          p_failed: true,
        });
        assertDb(finishError);
        throw new ReviewError(
          503,
          "Review failed. No result was accepted. Start a new request to retry.",
        );
      }
      const charged = result.reports.filter(
        (r) =>
          !(r.evidence.observed as { status: string }[]).every(
            (o) => o.status === "failed" || o.status === "not_found",
          ),
      ).length;
      const { error: finishError } = await db.rpc("payment_review_finish", {
        p_account: accountId,
        p_id: claim.id,
        p_result: result,
        p_charge: charged,
      });
      assertDb(finishError);
      return json(
        { id: claim.id, status: "completed", result, charged_records: charged },
        201,
      );
    }
    return json({ error: "Route or method not found." }, 404);
  } catch (error) {
    if (error instanceof ReviewError)
      return json({ error: error.message }, error.status);
    return json(
      {
        error:
          "Payment Review is temporarily unavailable. Retry later with the same request key.",
      },
      503,
    );
  }
}
