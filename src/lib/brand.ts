/**
 * Single source of truth for product identity, contact routes and legal
 * metadata. Everything user-facing reads from here so a rename, a new
 * support address or a new filing year is a one-line change.
 */

export const BRAND = {
  name: "NOSHASHI",
  tagline: "Autonomous Compliance Layer",
  version: "0.1.0",
  /** Update when the operating entity is registered. */
  legalEntity: "NOSHASHI Labs",
  jurisdiction: "United States",
  network: "XRPL Mainnet",
} as const;

export const CONTACT = {
  support: "support@noshashi.app",
  security: "security@noshashi.app",
  legal: "legal@noshashi.app",
  privacy: "privacy@noshashi.app",
  sales: "institutions@noshashi.app",
  /** Business hours shown next to the human-escalation path. */
  hours: "Mon–Fri · 09:00–18:00 ET",
  responseTarget: "1 business day",
} as const;

export const LINKS = {
  xls70: "https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/credential",
  xls80: "https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/permissioneddomain",
  xrplDocs: "https://xrpl.org/docs",
  ollama: "https://ollama.com/download",
  wcag: "https://www.w3.org/WAI/WCAG22/quickref/",
  ada: "https://www.ada.gov/resources/web-guidance/",
} as const;

/** Copyright line, always current — no stale year in the footer. */
export function copyrightLine(): string {
  const launchYear = 2026;
  const now = new Date().getFullYear();
  const span = now > launchYear ? `${launchYear}–${now}` : `${launchYear}`;
  return `© ${span} ${BRAND.legalEntity}`;
}
