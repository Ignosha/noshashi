import { certifyAuthority, type AuthorityCertificate } from "@/lib/desk/authority";
import { fetchIssuerObligations } from "@/lib/xrpl/client";
import { decodeCurrency } from "@/lib/format";
import { checkState, CHECK_STATE_COPY } from "@/lib/policy";
import type { IssuerObligations } from "@/lib/xrpl/types";

/**
 * One-click issuer investigation.
 *
 * One click runs the engines an analyst would otherwise run by hand, in
 * one pass against validated state: the authority certificate (freeze
 * rights, surrendered powers, who can sign, transfer fee, the issuer's
 * current freeze state) and the issuer's outstanding obligations. The
 * result is evidence with a digest and a ledger index, and it becomes one
 * question for the agent that carries every fact it may use.
 *
 * The engines decide; the agent explains. Supply concentration is not
 * walked here — a full holder walk can take a minute — so those checks
 * abstain and the prompt says so, rather than the agent guessing.
 */

export type IssuerInvestigation = {
  issuer: string;
  certificate: AuthorityCertificate;
  obligations: IssuerObligations;
};

export async function investigateIssuer(issuer: string): Promise<IssuerInvestigation> {
  const [certificate, obligations] = await Promise.all([
    certifyAuthority(issuer, { walkSupply: false }),
    fetchIssuerObligations(issuer),
  ]);
  return { issuer, certificate, obligations };
}

const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** The question handed to the agent: every fact the investigation found, and nothing else. */
export function investigationPrompt(inv: IssuerInvestigation): string {
  const c = inv.certificate;
  const assets = Object.entries(inv.obligations.obligations)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const lines = [
    `Investigate the XRPL issuer ${inv.issuer}. NOSHASHI read it from validated mainnet ledger ${c.ledgerIndex.toLocaleString("en-US")} at ${c.evaluatedAt}.`,
    `Authority certificate digest ${c.digest} (rules v${c.rulesVersion}); overall result ${c.verdict.toUpperCase()}.`,
    "Checks:",
    ...c.checks.map((k) => {
      const state = checkState(k);
      return `- ${CHECK_STATE_COPY[state].label} · ${k.label}${state === "PASS" ? "" : ` — ${k.detail}`}`;
    }),
    inv.obligations.unreadable
      ? `Outstanding obligations could not be read: ${inv.obligations.unreadable}.`
      : assets.length
        ? `Outstanding obligations: ${assets.slice(0, 10).map(([cur, v]) => `${n(v)} ${decodeCurrency(cur)}`).join("; ")}${assets.length > 10 ? `; and ${assets.length - 10} more` : ""}.`
        : "The issuer reports no outstanding obligations.",
    "Supply concentration was not walked in this one-click run, so it reads INSUFFICIENT DATA: no answer, not a finding. Do not infer holder concentration.",
    "Summarise what authority this issuer has kept over holders, what that means for someone holding its assets, and what a person should check next. Use only the facts above, and say so where they are not enough. This is not a legal or investment finding.",
  ];
  return lines.join("\n");
}
