/**
 * Customer Asset Protection — what an institution holding its customers' XRP
 * can prove about them, from the ledger, without anyone taking its word.
 *
 * Three proofs, each checkable by a customer or an auditor:
 *
 *   1. Liabilities. The institution builds a Merkle sum tree over every
 *      customer balance on its own machine and publishes only the root: a
 *      hash and a total. Each customer receives the path from their own
 *      leaf to the root and can check that their balance is counted, and
 *      that no branch carries a negative sum (the trick that hides debts).
 *      No customer identity or balance list ever leaves the institution.
 *
 *   2. Reserves. The addresses the institution names as holding customer
 *      funds are read from a validated ledger: balances, and XRP locked in
 *      escrows they own. Reserves over liabilities is the coverage ratio.
 *
 *   3. A protection fund. XRP set aside, beyond reserves, to make customers
 *      whole up to a stated limit each if the institution fails, is read
 *      the same way, together with who can move it: locked in escrow until
 *      a date, held under a signer list no single key can satisfy, or held
 *      by one key (which protects nobody, and is said so).
 *
 * This is the transparency a deposit-insurance scheme gives its depositors,
 * built from ledger facts. It is not insurance and it is not a government
 * guarantee: NOSHASHI does not pay claims. It verifies, publishes and
 * monitors what the institution has actually set aside.
 *
 * Shared by the desktop app, the Edge Function that attests daily, and the
 * public protection page, so all three compute the same numbers.
 */

type Json = Record<string, any>;

// ── Merkle sum tree over customer liabilities ──────────────────────────

export type SumNode = { hash: string; sum: bigint };
export type ProofStep = { side: "left" | "right"; hash: string; sum: string };
export type InclusionProof = { ref: string; amount: string; path: ProofStep[]; root: { hash: string; sum: string; count: number } };

const enc = new TextEncoder();

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A customer's leaf: their reference (a secret only they and the institution hold) and balance in the smallest unit. */
export async function leafOf(ref: string, amount: bigint): Promise<SumNode> {
  if (amount < 0n) throw new Error("A liability cannot be negative.");
  return { hash: await sha256(`noshashi-pol-leaf-v1|${ref}|${amount}`), sum: amount };
}

async function parentOf(left: SumNode, right: SumNode): Promise<SumNode> {
  return { hash: await sha256(`noshashi-pol-node-v1|${left.hash}|${left.sum}|${right.hash}|${right.sum}`), sum: left.sum + right.sum };
}

const EMPTY: SumNode = { hash: "0".repeat(64), sum: 0n };

/** Build the tree. Returns every level, leaves first, so proofs can be read off it. */
export async function buildLiabilityTree(entries: Array<{ ref: string; amount: bigint }>): Promise<SumNode[][]> {
  if (!entries.length) throw new Error("No customer balances to build from.");
  const refs = new Set<string>();
  for (const e of entries) {
    if (!/^[0-9a-f]{16,128}$/i.test(e.ref)) throw new Error(`A customer reference must be 16 to 128 hex characters (got "${e.ref.slice(0, 20)}").`);
    if (refs.has(e.ref)) throw new Error("Two customers share a reference; each needs its own.");
    refs.add(e.ref);
  }
  const levels: SumNode[][] = [await Promise.all(entries.map((e) => leafOf(e.ref, e.amount)))];
  while (levels[levels.length - 1].length > 1) {
    const below = levels[levels.length - 1];
    const above: SumNode[] = [];
    for (let i = 0; i < below.length; i += 2) above.push(await parentOf(below[i], below[i + 1] ?? EMPTY));
    levels.push(above);
  }
  return levels;
}

export function rootOf(levels: SumNode[][]): { hash: string; sum: bigint; count: number } {
  const top = levels[levels.length - 1][0];
  return { hash: top.hash, sum: top.sum, count: levels[0].length };
}

/** The proof for the customer at `index`: siblings up to the root. */
export function proofFor(levels: SumNode[][], index: number, ref: string): InclusionProof {
  const path: ProofStep[] = [];
  let i = index;
  for (let level = 0; level < levels.length - 1; level++) {
    const sibling = levels[level][i ^ 1] ?? EMPTY;
    path.push({ side: i % 2 === 0 ? "right" : "left", hash: sibling.hash, sum: sibling.sum.toString() });
    i = Math.floor(i / 2);
  }
  const root = rootOf(levels);
  return { ref, amount: levels[0][index].sum.toString(), path, root: { hash: root.hash, sum: root.sum.toString(), count: root.count } };
}

/** Check a customer's proof against a published root. Any negative branch fails it. */
export async function verifyInclusion(proof: InclusionProof, published: { hash: string; sum: string }): Promise<{ ok: boolean; reason: string }> {
  try {
    let node = await leafOf(proof.ref, BigInt(proof.amount));
    for (const step of proof.path) {
      const sibling: SumNode = { hash: step.hash, sum: BigInt(step.sum) };
      if (sibling.sum < 0n) return { ok: false, reason: "A branch of the tree carries a negative total: debts could be hidden there." };
      node = step.side === "right" ? await parentOf(node, sibling) : await parentOf(sibling, node);
    }
    if (node.hash !== published.hash.toLowerCase()) return { ok: false, reason: "Your balance does not lead to the published root: it is not counted in the liabilities the institution published." };
    if (node.sum.toString() !== published.sum) return { ok: false, reason: "The path's total does not match the published total." };
    return { ok: true, reason: "Your balance is counted in the published liabilities." };
  } catch (e) {
    return { ok: false, reason: `The proof could not be read: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** A decimal amount ("12.5") in integer units with `decimals` places, refusing more precision than that. */
export function toUnits(value: string, decimals = 6): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) throw new Error(`"${value}" is not a non-negative amount.`);
  const frac = (m[2] ?? "").padEnd(decimals, "0");
  if (frac.length > decimals && /[1-9]/.test(frac.slice(decimals))) throw new Error(`"${value}" has more than ${decimals} decimal places.`);
  return BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac.slice(0, decimals) || "0");
}

export const fromUnits = (units: bigint, decimals = 6) => Number(units) / 10 ** decimals;

// ── Reserves, the protection fund, and coverage ─────────────────────────

export type HeldAccount = {
  address: string;
  exists: boolean;
  balanceXrp: number;
  /** XRP in escrows this account owns and that pay back to itself or another program account. */
  escrowedXrp: number;
  /** Earliest date any of that escrowed XRP can be released; null when none is escrowed. */
  lockedUntil: string | null;
  masterEnabled: boolean;
  regularKey: string | null;
  /** Fewest signers that reach the signer list's quorum; null without a list. */
  minSigners: number | null;
  /** False when the reply did not include signer lists, so who signs is not known. */
  signersKnown: boolean;
};

export type Control = "escrow_locked" | "multi_party" | "single_key" | "no_signer" | "missing" | "unknown";

const multiParty = (a: HeldAccount) => !a.masterEnabled && !a.regularKey && (a.minSigners ?? 0) >= 2;

/** Who can move the account's spendable balance (escrowed XRP is judged separately, by its lock). */
export function controlOf(a: HeldAccount): Control {
  if (!a.exists) return "missing";
  if (multiParty(a)) return "multi_party";
  if (!a.signersKnown && !a.masterEnabled && !a.regularKey) return "unknown";
  if (!a.masterEnabled && !a.regularKey && a.minSigners === null) return "no_signer";
  if (a.lockedUntil && a.balanceXrp < a.escrowedXrp * 0.01) return "escrow_locked";
  return "single_key";
}

/** XRP no single key can take today: escrow still locked, plus everything held under a real signer list. */
export function securedXrp(a: HeldAccount): number {
  if (!a.exists) return 0;
  const locked = a.lockedUntil ? a.escrowedXrp : 0;
  const underList = multiParty(a) ? a.balanceXrp + (a.lockedUntil ? 0 : a.escrowedXrp) : 0;
  return Math.round((locked + underList) * 1e6) / 1e6;
}

/** The facts NOSHASHI needs about one account, from account_info (with signer_lists) and its Escrow objects. Pure. */
export function heldAccountFrom(address: string, info: Json | null, escrows: Json[], programAccounts: string[], closeTime: number): HeldAccount {
  const data = (info?.account_data ?? null) as Json | null;
  if (!data) return { address, exists: false, balanceXrp: 0, escrowedXrp: 0, lockedUntil: null, masterEnabled: false, regularKey: null, minSigners: null, signersKnown: true };
  let escrowed = 0;
  let earliest: number | null = null;
  for (const e of escrows) {
    if (e.LedgerEntryType !== "Escrow" || e.Account !== address || typeof e.Amount !== "string") continue;
    if (!programAccounts.includes(String(e.Destination))) continue;
    escrowed += Number(e.Amount) / 1_000_000;
    const release = typeof e.FinishAfter === "number" ? e.FinishAfter : null;
    if (release !== null && release > closeTime) earliest = earliest === null ? release : Math.min(earliest, release);
  }
  const lists = (info?.signer_lists ?? data.signer_lists) as Json[] | undefined;
  const list = (lists ?? [])[0];
  let minSigners: number | null = null;
  if (list) {
    const weights = ((list.SignerEntries ?? []) as Json[]).map((s) => Number(s.SignerEntry?.SignerWeight ?? 0)).sort((a, b) => b - a);
    let total = 0;
    minSigners = Infinity;
    for (let i = 0; i < weights.length; i++) {
      total += weights[i];
      if (total >= Number(list.SignerQuorum ?? 0)) {
        minSigners = i + 1;
        break;
      }
    }
  }
  return {
    address,
    exists: true,
    balanceXrp: Number(data.Balance ?? 0) / 1_000_000,
    escrowedXrp: Math.round(escrowed * 1e6) / 1e6,
    lockedUntil: earliest === null ? null : new Date((earliest + 946_684_800) * 1000).toISOString(),
    masterEnabled: (Number(data.Flags ?? 0) & 0x00100000) === 0,
    regularKey: typeof data.RegularKey === "string" ? data.RegularKey : null,
    minSigners: minSigners === Infinity ? null : minSigners,
    signersKnown: Array.isArray(lists),
  };
}

export type ProtectionProgram = {
  name: string;
  reserveAddresses: string[];
  fundAddresses: string[];
  /** Per-customer protection limit, in XRP. */
  coverageLimitXrp: number;
  liabilities: { root: string; totalXrp: number; count: number; asOf: string } | null;
};

export type ProtectionFinding = { id: string; severity: "critical" | "warn" | "info" | "ok"; title: string; detail: string };

export type ProtectionReport = {
  program: string;
  ledgerIndex: number;
  at: string;
  reserves: HeldAccount[];
  fund: HeldAccount[];
  reservesXrp: number;
  fundXrp: number;
  /** Protection fund XRP that no single key can move today. */
  fundSecuredXrp: number;
  liabilitiesXrp: number | null;
  customers: number | null;
  /** Reserves ÷ liabilities. */
  coverageRatio: number | null;
  /** Secured fund ÷ what the fund promises (every customer up to the limit, capped at total liabilities). */
  fundRatio: number | null;
  status: "fully_backed" | "partially_backed" | "under_backed" | "unproven";
  findings: ProtectionFinding[];
};

const XRP = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;

export function assessProtection(p: ProtectionProgram, reserves: HeldAccount[], fund: HeldAccount[], ledgerIndex: number, at: string): ProtectionReport {
  const findings: ProtectionFinding[] = [];
  const total = (xs: HeldAccount[]) => Math.round(xs.reduce((n, a) => n + a.balanceXrp + a.escrowedXrp, 0) * 1e6) / 1e6;
  const reservesXrp = total(reserves);
  const fundXrp = total(fund);
  const fundSecuredXrp = Math.round(fund.reduce((n, a) => n + securedXrp(a), 0) * 1e6) / 1e6;
  const liabilitiesXrp = p.liabilities?.totalXrp ?? null;
  const customers = p.liabilities?.count ?? null;
  const coverageRatio = liabilitiesXrp && liabilitiesXrp > 0 ? reservesXrp / liabilitiesXrp : null;
  const promised = liabilitiesXrp !== null && customers !== null ? Math.min(liabilitiesXrp, customers * p.coverageLimitXrp) : null;
  const fundRatio = promised && promised > 0 ? fundSecuredXrp / promised : null;

  for (const a of [...reserves, ...fund]) {
    if (!a.exists) findings.push({ id: `missing-${a.address}`, severity: "critical", title: `${a.address} does not exist on the ledger`, detail: "An address the program names holds nothing: it was never funded, or it was deleted." });
  }
  if (!p.liabilities) {
    findings.push({ id: "no-liabilities", severity: "warn", title: "No liabilities published", detail: "Without a published total of what customers are owed, reserves prove nothing about coverage. Publish a liabilities root." });
  } else if (coverageRatio !== null) {
    findings.push(
      coverageRatio >= 1
        ? { id: "backed", severity: "ok", title: `Customer balances are ${(coverageRatio * 100).toFixed(2)}% backed`, detail: `${XRP(reservesXrp)} in the named reserve accounts against ${XRP(liabilitiesXrp!)} owed to ${customers!.toLocaleString("en-US")} customers.` }
        : { id: "under-backed", severity: "critical", title: `Only ${(coverageRatio * 100).toFixed(2)}% of customer balances are backed`, detail: `${XRP(reservesXrp)} in reserves against ${XRP(liabilitiesXrp!)} owed: a shortfall of ${XRP(liabilitiesXrp! - reservesXrp)}.` }
    );
    const age = Date.parse(at) - Date.parse(p.liabilities.asOf);
    if (age > 35 * 86_400_000) findings.push({ id: "stale-liabilities", severity: "warn", title: "The liabilities figure is more than a month old", detail: `Published ${p.liabilities.asOf.slice(0, 10)}. Balances move daily; republish the root at least monthly.` });
  }

  if (p.fundAddresses.length) {
    for (const a of fund) {
      const control = controlOf(a);
      if (a.lockedUntil && a.escrowedXrp > 0) findings.push({ id: `fund-locked-${a.address}`, severity: "ok", title: `${XRP(a.escrowedXrp)} of the fund is locked in escrow`, detail: `Held by ${a.address}, the first release not before ${a.lockedUntil.slice(0, 10)}. No key can move it early.` });
      if (control === "escrow_locked") continue;
      if (control === "multi_party") findings.push({ id: `fund-multi-${a.address}`, severity: "ok", title: `${a.address} needs ${a.minSigners} signers to move`, detail: "The master key is disabled and no regular key is set: one stolen or rogue key cannot take the fund." });
      else if (control === "single_key" && a.balanceXrp > 0) findings.push({ id: `fund-single-${a.address}`, severity: "warn", title: `${XRP(a.balanceXrp)} at ${a.address} can be moved by a single key`, detail: "Whoever holds that key can take it at any time, so it is not counted as secured. Lock it in escrow or put it under a signer list with the master key disabled." });
      else if (control === "unknown") findings.push({ id: `fund-unknown-${a.address}`, severity: "warn", title: `Who can sign for ${a.address} was not read`, detail: "Its signer list could not be read, so its balance is not counted as secured." });
      else if (control === "no_signer") findings.push({ id: `fund-blackholed-${a.address}`, severity: "warn", title: `Nothing can sign for ${a.address}`, detail: "The fund can never be paid out to customers." });
    }
    if (fundRatio !== null) {
      findings.push(
        fundRatio >= 1
          ? { id: "fund-covers", severity: "ok", title: `The secured fund covers every customer up to ${XRP(p.coverageLimitXrp)}`, detail: `${XRP(fundSecuredXrp)} secured against ${XRP(promised!)} promised.` }
          : { id: "fund-short", severity: "info", title: `The secured fund covers ${(fundRatio * 100).toFixed(2)}% of the promise`, detail: `${XRP(fundSecuredXrp)} secured against ${XRP(promised!)}: every customer up to ${XRP(p.coverageLimitXrp)}, capped at total liabilities. Customers would be paid pro rata.` }
      );
    }
  } else {
    findings.push({ id: "no-fund", severity: "info", title: "No protection fund", detail: "The program proves reserves only; nothing is set aside to make customers whole if the reserves are lost." });
  }

  findings.push({ id: "not-insurance", severity: "info", title: "This is verification, not insurance", detail: "NOSHASHI reads and publishes what is on the ledger. It does not guarantee deposits or pay claims, and no government scheme stands behind this program." });

  const status: ProtectionReport["status"] =
    coverageRatio === null ? "unproven" : coverageRatio >= 1 ? "fully_backed" : coverageRatio >= 0.9 ? "partially_backed" : "under_backed";
  const rank = { critical: 0, warn: 1, ok: 2, info: 3 } as const;
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { program: p.name, ledgerIndex, at, reserves, fund, reservesXrp, fundXrp, fundSecuredXrp, liabilitiesXrp, customers, coverageRatio, fundRatio, status, findings };
}

/** Canonical JSON (sorted keys) and its SHA-256: the attestation's digest, re-computable by anyone holding the report. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Json).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Json)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function digestOf(report: ProtectionReport): Promise<string> {
  return (await sha256(canonical(report))).toUpperCase();
}
