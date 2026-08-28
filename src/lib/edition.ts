/**
 * Build edition.
 *
 * NOSHASHI ships as two artefacts from one source tree:
 *
 *   full — what you run. Every capability, real billing, your bundle
 *          identifier, your install.
 *   demo — the public early release. Same engine, same live mainnet data,
 *          but paid surfaces are closed and billing is inert.
 *
 * The distinction is compile-time, set by VITE_NOSHASHI_EDITION, and the
 * demo carries a different bundle identifier and product name so it
 * installs alongside the full build rather than over it. That separation
 * is the point: handing someone a demo must never put your working copy
 * at risk.
 *
 * The demo is deliberately *not* crippled where it matters. It reads the
 * same mainnet, runs the same deterministic policy engine and produces
 * the same receipts, because a demo that fakes its output teaches nothing
 * about the product and contradicts everything this one claims.
 */

export type Edition = "full" | "demo";

/*
 * Written without optional chaining on purpose.
 *
 * Vite statically replaces `import.meta.env.VITE_NOSHASHI_EDITION` with a
 * string literal at build time, which lets Rollup fold the comparison to a
 * constant and drop the dead branch. Writing `import.meta.env?.X` defeats
 * that replacement — the value is then read at runtime, both bundles carry
 * both code paths, and the separation stops being a build-time one.
 */
export const EDITION: Edition =
  import.meta.env.VITE_NOSHASHI_EDITION === "demo" ? "demo" : "full";

export const isDemo: boolean = EDITION === "demo";

/** Capabilities the demo closes off, with the reason shown to the user. */
export const DEMO_LOCKED: Record<string, string> = {
  portfolios: "Multi-wallet portfolios are part of the Desk plan.",
  alerts: "Drift and expiry alerts are part of the Desk plan.",
  compliance_api: "The compliance API is part of the Institution plan.",
  webhooks: "Webhooks are part of the Institution plan.",
  regulator_seats: "Regulator seats are part of the Institution plan.",
  white_label: "White labelling is part of the Institution plan.",
  sla: "The published SLA is part of the Institution plan.",
};

/** What the demo *does* include, stated plainly so it can be trusted. */
export const DEMO_INCLUDES = [
  "Live XRPL mainnet telemetry — the real ledger, not a recording",
  "The full GO / HOLD / NO-GO adjudication engine",
  "Real SHA-256 receipts, byte-identical to the full build",
  "XLS-70 credential registry and XLS-80 domain grid",
  "Ledger sync — four public nodes compared, no account needed",
  "Address checking — 10 per month, as on the free tier",
  "Network capability detection against live amendments",
  "The on-device compliance agent",
];

export const DEMO_EXCLUDES = [
  "Multi-wallet portfolios and the compliance radar",
  "Exit liquidity analysis",
  "Settlement forensics — requested versus delivered on any transaction",
  "Counterparty provenance — account age and funding source",
  "Treasury control surface — signer weights and locked value",
  "AMM pool governance — fee votes and the auction slot",
  "Issuance surveillance — holder concentration for an issuer",
  "Issuer drift monitoring and native alerts",
  "The persistent adjudication ledger and signed export",
  "Offline adjudication",
  "Compliance API, webhooks and regulator seats",
];

/**
 * In the demo, checkout is a dead end by design.
 *
 * Rather than opening a Stripe session the demo cannot honour, paid
 * surfaces explain what they are and point at the real thing. A demo that
 * takes a payment is worse than one that does not exist.
 */
export const DEMO_UPGRADE_URL = "https://noshashi.app/#pricing";
