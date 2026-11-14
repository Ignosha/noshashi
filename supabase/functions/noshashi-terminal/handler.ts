import { terminalInput } from "../../../api/_lib/terminal-model.js";
import {
  terminalFeatures,
  type TerminalAccess,
} from "../_shared/terminalPlans.ts";
type DbError = { code?: string } | null;
export type Services = {
  user: (token: string) => Promise<{ id: string; mfaRequired: boolean } | null>;
  rpc: (
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: DbError }>;
  organizations: (
    account: string,
  ) => Promise<{ data: unknown; error: DbError }>;
  readEvidence: (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
};
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,idempotency-key,x-client-info",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  Vary: "Authorization",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class Failure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value))
    return "[" + value.map(canonicalJSON).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonicalJSON((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function sha256(text: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Failure(400, "Provide an input.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 2048) {
      await reader.cancel();
      throw new Failure(413, "Input exceeds 2 KB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    const b = JSON.parse(new TextDecoder().decode(bytes));
    if (!b || typeof b !== "object" || Array.isArray(b)) throw 0;
    return b;
  } catch {
    throw new Failure(400, "Provide a JSON input object.");
  }
}
export async function handle(request: Request, services: Services) {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  try {
    const token = request.headers
      .get("Authorization")
      ?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) throw new Failure(401, "Sign in to use the private archive.");
    const user = await services.user(token);
    if (!user) throw new Failure(401, "Session expired. Sign in again.");
    if (user.mfaRequired)
      throw new Failure(403, "Complete your second-factor check.");
    const url = new URL(request.url),
      route = url.pathname.split("/noshashi-terminal/")[1]?.replace(/\/$/, "");
    if (!route) throw new Failure(404, "Unknown terminal operation.");
    if (
      [...url.searchParams.keys()].some((k) => k !== "organization_id") ||
      url.searchParams.getAll("organization_id").length > 1
    )
      throw new Failure(400, "Unsupported scope parameter.");
    const org = url.searchParams.get("organization_id");
    if (org !== null && !uuid.test(org))
      throw new Failure(400, "Invalid organization.");
    const call = async (
      action: string,
      extra: Record<string, unknown> = {},
    ) => {
      const { data, error } = await services.rpc({
        p_account: user.id,
        p_action: action,
        p_org: org,
        ...extra,
      });
      if (error) {
        const code = error.code;
        throw new Failure(
          code === "42501"
            ? 403
            : code === "28000"
              ? 401
              : code === "P0002"
                ? 404
                : code === "23505"
                  ? 409
                  : code === "54000"
                    ? 429
                    : code === "22023"
                      ? 400
                      : 503,
          code === "42501"
            ? "An active paid plan or assigned contract and suitable role are required for this scope."
            : code === "P0002"
              ? "Case not found."
              : code === "23505"
                ? "Request key was already used for different input."
                : code === "54000"
                  ? "Archive or save-rate limit reached."
                  : code === "22023"
                    ? "Invalid evidence or request."
                    : "Account storage is unavailable. Retry later with the same request key.",
        );
      }
      return data;
    };
    if (route === "organizations" && request.method === "GET") {
      if (org)
        throw new Failure(400, "List organizations without a selected scope.");
      const { data, error } = await services.organizations(user.id);
      if (error) throw new Failure(503, "Organization list unavailable.");
      return json({ organizations: data });
    }
    if (route === "access" && request.method === "GET") {
      const access = (await call("access")) as TerminalAccess;
      return json({ access, features: terminalFeatures(access) });
    }
    if (route === "cases" && request.method === "GET")
      return json({ cases: await call("list") });
    const caseId = route.match(/^cases\/([0-9a-f-]+)$/i)?.[1];
    if (
      caseId &&
      uuid.test(caseId) &&
      ["GET", "DELETE"].includes(request.method)
    ) {
      const saved = (await call(request.method === "GET" ? "get" : "delete", {
        p_case: caseId,
      })) as { report?: unknown; sha256?: string };
      if (
        request.method === "GET" &&
        (!saved?.report ||
          saved.sha256 !== (await sha256(canonicalJSON(saved.report))))
      )
        throw new Failure(503, "Archived evidence failed its integrity check.");
      return json(saved);
    }
    if (route === "cases" && request.method === "POST") {
      const raw = await body(request);
      if (
        Object.keys(raw).some(
          (k) => !["mode", "hash", "issuer", "currency"].includes(k),
        )
      )
        throw new Failure(400, "Only public lookup identifiers are accepted.");
      let input;
      try {
        input = terminalInput(raw);
      } catch (e) {
        throw new Failure(
          400,
          e instanceof Error ? e.message : "Invalid input.",
        );
      }
      const key = request.headers.get("Idempotency-Key");
      if (!key || !uuid.test(key))
        throw new Failure(400, "A UUID request key is required.");
      const inputHash = await sha256(JSON.stringify(input));
      const extra = { p_request: key, p_hash: inputHash };
      const replay = await call("lookup", extra);
      if (replay) return json(replay);
      let report;
      try {
        report = await services.readEvidence(input);
      } catch {
        throw new Failure(
          503,
          "Complete verified ledger evidence is unavailable. Nothing was saved. Retry with the same request key.",
        );
      }
      // Never store a client report, or claim a failed/partial node read is verified.
      if (
        report.schema !== "noshashi.cloud-terminal.v1" ||
        report.network !== "XRPL Mainnet" ||
        report.status !== "VERIFIED" ||
        report.validated !== true ||
        JSON.stringify(report.subject) !== JSON.stringify(input) ||
        !Number.isFinite(Date.parse(String(report.retrieved_at))) ||
        Math.abs(Date.now() - Date.parse(String(report.retrieved_at))) > 120000
      )
        throw new Failure(
          503,
          "Evidence validation failed. Nothing was saved.",
        );
      return json(
        await call("save", {
          ...extra,
          p_report: report,
          p_digest: await sha256(canonicalJSON(report)),
        }),
        201,
      );
    }
    throw new Failure(404, "Unknown terminal operation.");
  } catch (error) {
    return error instanceof Failure
      ? json({ error: error.message }, error.status)
      : json({ error: "Private terminal service unavailable." }, 503);
  }
}
