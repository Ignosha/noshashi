import { DOMAIN_REGISTRY, VERDICT_COPY, evaluatePolicy } from "@/lib/policy";
import { WEBHOOK_EVENTS } from "@/lib/org/webhooks";
import { can, type MemberRole } from "@/lib/org/governance";
import { PROVIDERS } from "@/lib/agent/providers";
import { KNOWLEDGE } from "@/lib/support/knowledge";
import boundary from "@/lib/trust/boundary.json";

/**
 * The documentation's facts, taken from the code that implements them.
 *
 * §47 asks for documentation "generated from actual implementation". The
 * website's /docs/ pages render reference.json, and that file is exactly
 * what this function returns: the policy rules come from running the rule
 * set, the roles from the permission table the app uses, the webhook
 * events from the list the app offers, the API verbs from the edge
 * function's own VERBS map. src/lib/docs/__tests__/reference.test.ts fails
 * when the JSON and the code disagree, so the docs cannot drift from the
 * product without the build noticing.
 *
 * A few sources are read as text because importing them would pull in a
 * runtime the test does not have (the Deno edge function, App.tsx, the
 * socket in link.ts); the caller passes that text in.
 */

export type DocsScene = { name: string; plan: string; summary: string };
export type DocsRule = { id: string; label: string; severity: "block" | "warn"; domains: string[] };

export type DocsReference = {
  scenes: DocsScene[];
  servers: string[];
  readCommands: string[];
  forbiddenCommands: string[];
  stages: { label: string; summary: string; detail: string; where: string[] }[];
  boundaries: { label: string; claim: string; basis: string }[];
  dataFlows: { party: string; what: string; why: string }[];
  oversight: string[];
  limits: string[];
  verdicts: { id: string; title: string; blurb: string }[];
  rules: DocsRule[];
  domains: { code: string; name: string; requirements: string[]; ceilingXrp: number; governance: string }[];
  providers: { name: string; local: boolean; free: boolean; requiresKey: boolean; docsUrl: string }[];
  roles: { role: string; permissions: string[] }[];
  permissions: string[];
  webhookEvents: { id: string; label: string }[];
  verbs: { path: string; description: string }[];
  edgeFunctions: string[];
  troubleshooting: { question: string; answer: string }[];
};

export type DocsSources = {
  /** src/lib/agent/context.ts — its console reference lists every scene with its plan. */
  context: string;
  /** src/lib/xrpl/link.ts — the servers the app connects to. */
  link: string;
  /** supabase/functions/noshashi-verify/index.ts — the VERBS map. */
  verify: string;
  /** Directory names under supabase/functions. */
  edgeFunctions: string[];
};

const ROLES: MemberRole[] = ["owner", "admin", "compliance", "risk", "analyst", "viewer", "api"];

/** The console reference: "- Name (Cmd+N): what it does. Requires Desk." */
export function scenesOf(context: string): DocsScene[] {
  const start = context.indexOf("Console reference");
  const end = context.indexOf("Cmd+K opens the command palette", start);
  const block = context.slice(start, end);
  const scenes: DocsScene[] = [];
  for (const m of block.matchAll(/"- ((?:[^"\\]|\\.)+)",/g)) {
    const line = m[1].replace(/\\"/g, '"');
    const head = /^([^:(]+?)(?: \(Cmd\+\d\))?: ([\s\S]+)$/.exec(line);
    if (!head) continue;
    const plan = /Requires (\w+)\.\s*$/.exec(head[2])?.[1] ?? "Free";
    const summary = head[2].replace(/\s*(?:Requires \w+|Free(?:, no account needed)?)\.\s*$/, "").trim();
    scenes.push({ name: head[1].trim(), plan, summary });
  }
  return scenes;
}

/** The VERBS map in the edge function: `"path": "description",`. */
export function verbsOf(verify: string): { path: string; description: string }[] {
  const start = verify.indexOf("const VERBS: Record<string, string> = {");
  const body = verify.slice(start, verify.indexOf("\n};", start));
  return [...body.matchAll(/"([^"]*)":\s*\n?\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => ({
    path: m[1] || "(bare path)",
    description: m[2],
  }));
}

/**
 * Every rule the rule set can produce, found by running it against each
 * registry domain with no account read. Rules that depend on the domain
 * (credential requirements, the transfer ceiling, governance severity)
 * appear once per distinct wording, with the domains that produce it.
 */
export function rulesOf(): DocsRule[] {
  const byKey = new Map<string, DocsRule>();
  for (const domain of DOMAIN_REGISTRY) {
    const { checks } = evaluatePolicy({ account: null, credentials: [], domain, amountXrp: 0 });
    for (const check of checks) {
      const key = `${check.id}|${check.label}|${check.severity}`;
      const rule = byKey.get(key) ?? { id: check.id, label: check.label, severity: check.severity as "block" | "warn", domains: [] };
      rule.domains.push(domain.code);
      byKey.set(key, rule);
    }
  }
  return [...byKey.values()];
}

export function buildReference(sources: DocsSources): DocsReference {
  const permissions = Object.keys(can);
  return {
    scenes: scenesOf(sources.context),
    servers: [...sources.link.matchAll(/"(wss:\/\/[a-z0-9.]+)"/g)].map((m) => m[1]),
    readCommands: boundary.readCommands,
    forbiddenCommands: boundary.forbiddenCommands,
    stages: boundary.stages.map(({ label, summary, detail, where }) => ({ label, summary, detail, where })),
    boundaries: boundary.boundaries.map(({ label, claim, basis }) => ({ label, claim, basis })),
    dataFlows: boundary.dataFlows,
    oversight: boundary.oversight,
    limits: boundary.limits,
    verdicts: Object.entries(VERDICT_COPY).map(([id, v]) => ({ id, title: v.title, blurb: v.blurb })),
    rules: rulesOf(),
    domains: DOMAIN_REGISTRY.map((d) => ({
      code: d.code,
      name: d.name,
      requirements: d.requirements,
      ceilingXrp: d.transferCeilingXrp,
      governance: d.governance,
    })),
    providers: PROVIDERS.filter((p) => p.id !== "custom").map((p) => ({
      name: p.name,
      local: p.local,
      free: p.free,
      requiresKey: p.requiresKey,
      docsUrl: p.docsUrl,
    })),
    roles: ROLES.map((role) => ({
      role,
      permissions: permissions.filter((name) => (can as Record<string, (r: MemberRole | null) => boolean>)[name](role)),
    })),
    permissions,
    webhookEvents: WEBHOOK_EVENTS.map(({ id, label }) => ({ id, label })),
    verbs: verbsOf(sources.verify),
    edgeFunctions: [...sources.edgeFunctions].sort(),
    troubleshooting: KNOWLEDGE.map(({ question, answer }) => ({ question, answer })),
  };
}
