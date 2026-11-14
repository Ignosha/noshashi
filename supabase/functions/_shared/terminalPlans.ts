export const TERMINAL_PLANS = {
  operator: { name: "Free", rank: 0 },
  desk: { name: "Pro", rank: 1 },
  institution: { name: "Institutional", rank: 2 },
  enterprise: { name: "Enterprise", rank: 3 },
  strategic: { name: "Strategic", rank: 4 },
} as const;
export type TerminalTier = keyof typeof TERMINAL_PLANS;
export type TerminalAccess = {
  account_id: string;
  tier: TerminalTier;
  source: "subscription" | "contract" | "free";
  valid_until: string | null;
  organization_id: string | null;
  role: string | null;
};
export function terminalFeatures(access: TerminalAccess) {
  const plan = TERMINAL_PLANS[access.tier];
  if (!plan) throw new Error("Unknown server plan");
  return {
    public_demo: true,
    personal_cases: !access.organization_id && plan.rank >= 1,
    team_cases: !!access.organization_id && plan.rank >= 2,
    team_write:
      !!access.organization_id &&
      plan.rank >= 2 &&
      ["owner", "admin", "analyst", "compliance", "risk"].includes(
        access.role ?? "",
      ),
  };
}
