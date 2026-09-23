/**
 * Server-side policy validation and canonical hashing.
 *
 * The same rules as src/lib/desk/institutional.ts (validateParams,
 * canonicalJson, policyHash), written again because the Deno runtime
 * cannot import from the app. src/lib/desk/__tests__/policy-runtimes.test.ts
 * executes BOTH against the same inputs and fails the build if they ever
 * disagree — a hash that drifted here would refuse every genuine policy,
 * and a validator that drifted would activate one the app would reject.
 *
 * Pure: no Deno globals, only crypto.subtle and TextEncoder.
 */

export const POLICY_ENGINE_VERSION = "1";

export type PolicyError = { field: string; message: string };

type Outcome = "review" | "fail";
const OUTCOMES: Outcome[] = ["review", "fail"];

// deno-lint-ignore no-explicit-any
type Json = any;

export function canonicalJson(value: Json): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number in canonical form");
    return JSON.stringify(value);
  }
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, Json>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  throw new Error(`Cannot canonicalise ${typeof value}`);
}

async function sha256Upper(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export function policyHash(policy: { id: string; name: string; version: number; params: Json }): Promise<string> {
  return sha256Upper(
    canonicalJson({
      engine: POLICY_ENGINE_VERSION,
      id: policy.id,
      name: policy.name,
      params: policy.params,
      version: policy.version,
    }),
  );
}

export function validateParams(params: Json): PolicyError[] {
  const errors: PolicyError[] = [];
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    return [{ field: "params", message: "Policy parameters are missing or malformed." }];
  }
  const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);

  if (params.hhiLimit !== null && (!finite(params.hhiLimit) || params.hhiLimit < 0 || params.hhiLimit > 10_000)) {
    errors.push({ field: "hhiLimit", message: "HHI limit must be a number between 0 and 10,000." });
  }
  if (
    params.counterpartyShareLimitPct !== null &&
    (!finite(params.counterpartyShareLimitPct) ||
      params.counterpartyShareLimitPct <= 0 ||
      params.counterpartyShareLimitPct > 100)
  ) {
    errors.push({
      field: "counterpartyShareLimitPct",
      message: "Counterparty share must be above 0% and at most 100%.",
    });
  }
  if (params.travelRule !== null) {
    const t = params.travelRule ?? {};
    if (!finite(t.thresholdFiat) || t.thresholdFiat < 0) {
      errors.push({ field: "travelRule.thresholdFiat", message: "Travel Rule threshold must be a non-negative amount." });
    }
    if (typeof t.currency !== "string" || !/^[A-Z]{3}$/.test(t.currency)) {
      errors.push({ field: "travelRule.currency", message: "Currency must be a three-letter ISO code, such as USD." });
    }
    if (t.xrpReferenceRate === null || !finite(t.xrpReferenceRate) || t.xrpReferenceRate <= 0) {
      errors.push({
        field: "travelRule.xrpReferenceRate",
        message: "Set the XRP reference rate your books use. There is no price feed, so the rule cannot value a transfer without it.",
      });
    }
  }
  if (
    params.reserveHeadroomMinXrp !== null &&
    (!finite(params.reserveHeadroomMinXrp) || params.reserveHeadroomMinXrp < 0)
  ) {
    errors.push({ field: "reserveHeadroomMinXrp", message: "Reserve headroom must be a non-negative XRP amount." });
  }
  if (typeof params.strictFreeze !== "boolean") {
    errors.push({ field: "strictFreeze", message: "Strict freeze must be on or off." });
  }
  for (const key of ["hhi", "counterparty", "travelRule", "reserve", "freeze"]) {
    if (!OUTCOMES.includes(params.outcomes?.[key])) {
      errors.push({ field: `outcomes.${key}`, message: "Outcome must be REVIEW or FAIL." });
    }
  }
  return errors;
}
