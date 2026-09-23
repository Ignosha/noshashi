import { describe, it, expect, beforeAll } from "vitest";
import { supabase } from "@/lib/supabase/client";
import { DOMAIN_REGISTRY, runPolicy } from "@/lib/policy";
import { judge, measure, refOf, toChecks, validateParams, type PolicyParams } from "@/lib/desk/institutional";
import { receiptToEntry } from "@/lib/desk/ledger";
import { stateOf, verifyCase } from "@/lib/desk/investigations";
import {
  fetchAccount,
  fetchIssuerPosture,
  fetchServerInfo,
  fetchTrustLines,
  fetchWalletCredentials,
  fetchWalletTransactions,
} from "@/lib/xrpl/client";
import {
  activatePolicy,
  createDraft,
  decideException,
  listExceptions,
  listMemberships,
  listPolicies,
  requestException,
  submitPolicy,
  verifiedActive,
} from "@/lib/org/governance";
import { appendOrgCase, listOrgCases, openOrgCase } from "@/lib/org/cases";
import { screenPassword } from "@/lib/auth/screening";

// The XRPL link schedules its timeouts on `window`; in Node that is the global scope.
(globalThis as { window?: unknown }).window ??= globalThis;

/**
 * LIVE end-to-end: the app's own modules against the deployed Supabase
 * project, its Edge Functions and XRPL mainnet. Nothing is stubbed.
 *
 * Skipped unless NOSHASHI_LIVE_E2E=1. It needs four dedicated accounts
 * (e2e-author / -approver / -analyst / -viewer @noshashi-e2e.invalid, as
 * owner, compliance, analyst and viewer) in an organization with the slug
 * "noshashi-live-e2e", and their passwords in NOSHASHI_E2E_PASSWORDS
 * (JSON: {author, approver, analyst, viewer}). Those accounts are not
 * created by this repository: they are permanent records in a production
 * database, so whether they exist is the project owner's decision.
 * Governance records are append-only by design, so each run leaves its
 * policy version, exception, case and audit events in that organization.
 *
 *   NOSHASHI_LIVE_E2E=1 NOSHASHI_E2E_PASSWORDS='{"author":"…",…}' \
 *     npx vitest run src/lib/org/__live__
 */

const LIVE = process.env.NOSHASHI_LIVE_E2E === "1";
const EMAIL = (who: string) => `e2e-${who}@noshashi-e2e.invalid`;
const SUBJECT = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"; // a long-lived mainnet account the app already reads
const passwords = (): Record<string, string> => JSON.parse(process.env.NOSHASHI_E2E_PASSWORDS ?? "{}");

async function as(who: "author" | "approver" | "analyst" | "viewer") {
  await supabase().auth.signOut();
  const { data, error } = await supabase().auth.signInWithPassword({ email: EMAIL(who), password: passwords()[who] });
  if (error) throw new Error(`sign in as ${who}: ${error.message}`);
  return data.user!.id;
}

describe.skipIf(!LIVE)("LIVE: four-eyes governance through the app's own code", () => {
  let org = "";
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    for (const who of ["author", "approver", "analyst", "viewer"] as const) ids[who] = await as(who);
    const memberships = await listMemberships(ids.viewer);
    const m = memberships.find((x) => x.slug === "noshashi-live-e2e");
    if (!m) throw new Error("test organization noshashi-live-e2e not found");
    org = m.organizationId;
  }, 60_000);

  it("A–C, E: author refused (four-eyes), analyst refused, second person activates, history kept", async () => {
    await as("author");
    const before = await listPolicies(org);
    const prevActive = before.find((p) => p.status === "active") ?? null;
    const id = prevActive?.id ?? "policy_settlement";
    const version = Math.max(0, ...before.filter((p) => p.id === id).map((p) => p.version)) + 1;
    const params: PolicyParams = {
      hhiLimit: 2500 + (version % 7) * 100,
      counterpartyShareLimitPct: 40,
      travelRule: null,
      reserveHeadroomMinXrp: 20,
      strictFreeze: true,
      outcomes: { hhi: "review", counterparty: "review", travelRule: "review", reserve: "fail", freeze: "fail" },
    };
    expect(validateParams(params)).toEqual([]);
    expect(await createDraft({ organizationId: org, policyId: id, name: "E2E Settlement", params, version, author: ids.author })).toEqual({ ok: true });
    const draft = (await listPolicies(org)).find((p) => p.id === id && p.version === version)!;
    expect(draft.status).toBe("draft");
    expect(await submitPolicy(draft)).toMatchObject({ ok: true });

    // A: the author (compliance) cannot activate their own version.
    const a = await activatePolicy({ ...draft, status: "pending" });
    expect(a).toMatchObject({
      ok: false,
      code: "FOUR_EYES_REQUIRED",
      title: "FOUR-EYES APPROVAL REQUIRED",
      message: "The policy author cannot activate this policy. A second authorized user must activate it.",
    });

    // C: an analyst cannot activate.
    await as("analyst");
    const c = await activatePolicy({ ...draft, status: "pending" });
    expect(c).toMatchObject({ ok: false, code: "INSUFFICIENT_PERMISSIONS", title: "AUTHORIZATION REQUIRED", message: "Your role cannot activate policies." });
    // …and cannot set the status directly either.
    const direct = await supabase().schema("noshashi").from("org_policies").update({ status: "active" } as never)
      .eq("organization_id", org).eq("policy_id", id).eq("version", version).select();
    expect(direct.error ?? (direct.data?.length === 0 ? "no rows" : null)).toBeTruthy();
    expect((await listPolicies(org)).find((p) => p.version === version)!.status).toBe("pending");

    // B: a second authorized person activates.
    await as("approver");
    const b = await activatePolicy({ ...draft, status: "pending" });
    expect(b).toMatchObject({ ok: true, status: "active", author: ids.author, activated_by: ids.approver });
    const after = await listPolicies(org);
    const active = after.find((p) => p.status === "active")!;
    expect(active).toMatchObject({ version, createdBy: ids.author, activatedBy: ids.approver });
    expect(await activatePolicy({ ...draft, status: "pending" })).toMatchObject({ ok: false, code: "ALREADY_ACTIVE", title: "POLICY ALREADY ACTIVE" });

    // E: the previous version is archived, unchanged.
    if (prevActive) {
      const archived = after.find((p) => p.id === prevActive.id && p.version === prevActive.version)!;
      expect(archived.status).toBe("archived");
      expect(archived.hash).toBe(prevActive.hash);
      expect(archived.params).toEqual(prevActive.params);
    }
    const verified = await verifiedActive(after);
    expect(verified.ok && verified.policy?.version).toBe(version);
  }, 120_000);

  it("D: a real mainnet verdict → analyst requests an exception → compliance approves; analyst cannot", async () => {
    await as("analyst");
    const policies = await listPolicies(org);
    const verified = await verifiedActive(policies);
    if (!verified.ok || !verified.policy) throw new Error("no verified active policy");
    const active = verified.policy;

    // A real gate check against XRPL mainnet, under the organization's active policy.
    const [account, credentials, server, transactions, trustLines] = await Promise.all([
      fetchAccount(SUBJECT), fetchWalletCredentials(SUBJECT), fetchServerInfo(), fetchWalletTransactions(SUBJECT), fetchTrustLines(SUBJECT),
    ]);
    const postures = await Promise.all([...new Set(trustLines.map((l) => l.issuer))].slice(0, 10).map((i) => fetchIssuerPosture(i)));
    const amountXrp = 25_000;
    const reserve = server.reserveBaseXrp != null && server.reserveIncXrp != null
      ? { baseXrp: server.reserveBaseXrp, incXrp: server.reserveIncXrp, source: `server_info, validated ledger ${server.validatedLedger}` }
      : null;
    const measurements = measure({ amountXrp, account, reserve, transactions, trustLines, postures });
    const results = judge(measurements, active.params);
    const receipt = await runPolicy({
      account, credentials, domain: DOMAIN_REGISTRY[0], amountXrp, reserve: reserve ?? undefined,
      policy: refOf(active), policyChecks: toChecks(results, active.params),
    });
    const entry = receiptToEntry(receipt, { domainCode: DOMAIN_REGISTRY[0].code, measurements, policyResults: results });
    expect(entry.digest).toMatch(/^[0-9A-F]{64}$/);
    expect(entry.policy?.hash).toBe(active.hash);

    expect(await requestException({ organizationId: org, entry, reason: `Live E2E ${new Date().toISOString()}: desk confirmed counterparty.`, requester: ids.analyst })).toEqual({ ok: true });
    const pending = (await listExceptions(org)).find((x) => x.receiptDigest === entry.digest)!;
    expect(pending).toMatchObject({ status: "pending", requestedBy: ids.analyst, policyVersion: active.version, policyHash: active.hash });
    expect(pending.evidence.receiptDigest).toBe(entry.digest);

    // The analyst cannot approve, even by calling the API directly.
    expect(await decideException(pending, "approve", "")).toMatchObject({ ok: false, code: "INSUFFICIENT_PERMISSIONS" });
    const direct = await supabase().schema("noshashi").from("policy_exceptions").update({ status: "approved" } as never).eq("id", pending.id).select();
    expect(direct.error ?? (direct.data?.length === 0 ? "no rows" : null)).toBeTruthy();

    await as("approver");
    const approved = await decideException(pending, "approve", "Reviewed against the receipt.");
    expect(approved).toMatchObject({ ok: true, status: "approved", requested_by: ids.analyst, decided_by: ids.approver });
    const after = (await listExceptions(org)).find((x) => x.id === pending.id)!;
    expect(after).toMatchObject({ status: "approved", requestedBy: ids.analyst, decidedBy: ids.approver, policyVersion: active.version });
    expect(after.decidedAt).toBeTruthy();

    // Shared investigation: open on the verdict, close on the approved exception, verify the chain.
    await as("analyst");
    const caseId = await openOrgCase(org, { entry, actor: ids.analyst });
    let c = (await listOrgCases(org)).find((x) => x.id === caseId)!;
    await appendOrgCase(c, { kind: "note", text: "Checked with the desk." }, ids.analyst);
    c = (await listOrgCases(org)).find((x) => x.id === caseId)!;
    await appendOrgCase(c, { kind: "close", outcome: "exception-approved", rationale: "Exception approved by compliance.", exceptionId: pending.id }, ids.analyst);
    c = (await listOrgCases(org)).find((x) => x.id === caseId)!;
    expect(stateOf(c)).toMatchObject({ status: "closed", outcome: "exception-approved" });
    expect(await verifyCase(c)).toMatchObject({ ok: true });

    // A viewer can read it but not write.
    await as("viewer");
    const seen = (await listOrgCases(org)).find((x) => x.id === caseId)!;
    expect(seen.events.length).toBe(3);
    await expect(appendOrgCase(seen, { kind: "reopen", reason: "Viewer should not be able to do this." }, ids.viewer)).rejects.toThrow(/read cases but not write/);
  }, 180_000);

  it("server-side password screening: a known-breached password is refused; the account's own is accepted", async () => {
    expect(await screenPassword(EMAIL("viewer"), "password")).toMatchObject({ ok: false, code: "PASSWORD_BREACHED" });
    expect(await screenPassword(EMAIL("viewer"), passwords().viewer)).toEqual({ ok: true });
  }, 60_000);
});
