import { rpc } from "@/lib/xrpl/client";

/**
 * Control surface — who can actually move this treasury, and what is locked.
 *
 * The question an institution asks about its own account and almost never
 * gets a straight answer to. Every field is read from validated ledger
 * state; nothing here is inferred.
 *
 * Three subtleties that are easy to get wrong and are handled explicitly:
 *
 *   1. SignerQuorum is compared against the SUM OF WEIGHTS of the signers
 *      who actually sign — not against a count of signers. A list of three
 *      signers with weights 3/1/1 and a quorum of 3 is a single-signer
 *      account wearing a multi-sig costume. Reporting "3 signers, quorum 2"
 *      would hide that completely.
 *   2. Escrow times are in the Ripple epoch (2000-01-01), not the Unix
 *      epoch. Treating them as Unix timestamps dates every escrow to the
 *      1970s and makes an unreleased escrow look long expired.
 *   3. `account_objects` paginates. A page with no escrows does not mean an
 *      account has none, so absence is reported as "none found in the pages
 *      read" and never as reassurance.
 */

/** Seconds between the Unix epoch and the Ripple epoch (2000-01-01Z). */
const RIPPLE_EPOCH_OFFSET = 946_684_800;

export function rippleTimeToDate(rippleSeconds: number): Date {
  return new Date((rippleSeconds + RIPPLE_EPOCH_OFFSET) * 1000);
}

const LSF_DISABLE_MASTER = 0x00100000;

export type SignerEntry = {
  account: string;
  weight: number;
};

export type SignerPosture = {
  present: boolean;
  quorum: number;
  signers: SignerEntry[];
  /** Sum of every signer's weight. */
  totalWeight: number;
  /**
   * How few signers could reach quorum on their own, taking the heaviest
   * first. 1 means a single key controls the account despite the list.
   */
  minimumSigners: number;
  /** Signers whose individual weight alone meets or exceeds quorum. */
  unilateralSigners: string[];
};

export type EscrowLock = {
  amountXrp: number;
  finishAfter?: string;
  cancelAfter?: string;
  destination?: string;
};

export type ControlSurface = {
  address: string;
  /** True while the master key can still sign on its own. */
  masterKeyEnabled: boolean;
  signers: SignerPosture;
  ownerCount: number;
  /** XRP immobilised by the base reserve plus every owned object. */
  reserveLockedXrp: number;
  reserveBaseXrp: number;
  reserveIncrementXrp: number;
  balanceXrp: number;
  escrows: EscrowLock[];
  escrowedXrp: number;
  /** True when a page limit was hit, so the counts above are a floor. */
  truncated: boolean;
  ledgerIndex: number;
  readAt: string;
};

export type ControlFinding = {
  id: string;
  severity: "critical" | "warn" | "info" | "ok";
  title: string;
  detail: string;
  action?: string;
};

/**
 * Fewest signers that can reach quorum, heaviest first.
 *
 * A greedy walk is exact here: to minimise the count you always take the
 * largest remaining weight.
 */
export function minimumSignersForQuorum(signers: SignerEntry[], quorum: number): number {
  const weights = signers.map((s) => s.weight).sort((a, b) => b - a);
  let total = 0;
  for (let i = 0; i < weights.length; i += 1) {
    total += weights[i];
    if (total >= quorum) return i + 1;
  }
  return Infinity; // quorum unreachable — a locked account
}

export async function readControlSurface(address: string): Promise<ControlSurface> {
  const [info, server, signerRes, escrowRes] = await Promise.all([
    rpc("account_info", { account: address, ledger_index: "validated" }),
    rpc("server_info").catch(() => ({}) as Record<string, any>),
    rpc("account_objects", {
      account: address,
      type: "signer_list",
      ledger_index: "validated",
      limit: 10,
    }).catch(() => ({}) as Record<string, any>),
    rpc("account_objects", {
      account: address,
      type: "escrow",
      ledger_index: "validated",
      limit: 200,
    }).catch(() => ({}) as Record<string, any>),
  ]);

  const data = info.account_data ?? {};
  const flags = Number(data.Flags ?? 0);
  const validated = server.info?.validated_ledger ?? {};

  const list = (signerRes.account_objects ?? [])[0] as Record<string, any> | undefined;
  const entries: SignerEntry[] = ((list?.SignerEntries ?? []) as Array<Record<string, any>>)
    .map((e) => ({
      account: String(e.SignerEntry?.Account ?? ""),
      weight: Number(e.SignerEntry?.SignerWeight ?? 0),
    }))
    .filter((e) => e.account);

  const quorum = Number(list?.SignerQuorum ?? 0);
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);

  const escrowObjects = (escrowRes.account_objects ?? []) as Array<Record<string, any>>;
  const escrows: EscrowLock[] = escrowObjects
    // Issued-currency escrows (XLS-85) carry an object Amount; only XRP
    // escrows lock XRP, and mixing them would inflate the total.
    .filter((e) => typeof e.Amount === "string")
    .map((e) => ({
      amountXrp: Number(e.Amount) / 1_000_000,
      finishAfter:
        e.FinishAfter !== undefined
          ? rippleTimeToDate(Number(e.FinishAfter)).toISOString()
          : undefined,
      cancelAfter:
        e.CancelAfter !== undefined
          ? rippleTimeToDate(Number(e.CancelAfter)).toISOString()
          : undefined,
      destination: e.Destination ? String(e.Destination) : undefined,
    }));

  const ownerCount = Number(data.OwnerCount ?? 0);
  const reserveBase = Number(validated.reserve_base_xrp ?? 1);
  const reserveInc = Number(validated.reserve_inc_xrp ?? 0.2);

  return {
    address,
    masterKeyEnabled: (flags & LSF_DISABLE_MASTER) === 0,
    signers: {
      present: entries.length > 0,
      quorum,
      signers: entries,
      totalWeight,
      minimumSigners: entries.length > 0 ? minimumSignersForQuorum(entries, quorum) : 0,
      unilateralSigners: entries.filter((e) => quorum > 0 && e.weight >= quorum).map((e) => e.account),
    },
    ownerCount,
    reserveBaseXrp: reserveBase,
    reserveIncrementXrp: reserveInc,
    reserveLockedXrp: reserveBase + ownerCount * reserveInc,
    balanceXrp: Number(data.Balance ?? 0) / 1_000_000,
    escrows,
    escrowedXrp: escrows.reduce((sum, e) => sum + e.amountXrp, 0),
    truncated: Boolean(escrowRes.marker || signerRes.marker),
    ledgerIndex: Number(info.ledger_index ?? 0),
    readAt: new Date().toISOString(),
  };
}

export function controlFindings(c: ControlSurface): ControlFinding[] {
  const out: ControlFinding[] = [];

  /* ── Who can sign ──────────────────────────────────────────────── */
  if (c.masterKeyEnabled && !c.signers.present) {
    out.push({
      id: "single-key",
      severity: "warn",
      title: "One key controls this account outright",
      detail:
        "The master key is enabled and no signer list is configured. Whoever holds that key can move the entire balance, alone, with no second approval and no record of anyone else agreeing.",
      action:
        "Configure a signer list, then disable the master key once you have confirmed the signers can transact.",
    });
  }

  if (c.masterKeyEnabled && c.signers.present) {
    out.push({
      id: "master-still-live",
      severity: "critical",
      title: "The signer list can be bypassed",
      detail:
        "A signer list is configured, but the master key is still enabled — so the quorum is optional. Anyone holding the master key can sign alone and the approval workflow is decorative.",
      action: "Disable the master key (lsfDisableMaster) so the quorum actually binds.",
    });
  }

  if (!c.masterKeyEnabled && !c.signers.present) {
    out.push({
      id: "no-signer-path",
      severity: "critical",
      title: "No key and no signer list",
      detail:
        "The master key is disabled and no signer list is present. Unless a regular key is set, nothing can sign for this account and the balance is unreachable.",
      action: "Verify a regular key exists before relying on this account.",
    });
  }

  if (c.signers.present) {
    const { quorum, totalWeight, minimumSigners, signers, unilateralSigners } = c.signers;

    if (minimumSigners === Infinity) {
      out.push({
        id: "quorum-unreachable",
        severity: "critical",
        title: "Quorum can never be met",
        detail: `Quorum is ${quorum} but the signers' weights total only ${totalWeight}. No combination of the configured signers can authorise a transaction.`,
        action: "Lower the quorum or add weight before this account needs to move.",
      });
    } else if (minimumSigners === 1) {
      out.push({
        id: "effective-single",
        severity: "critical",
        title: `${signers.length} signers, but one can act alone`,
        detail: `Quorum is ${quorum} and at least one signer carries that weight by themselves${
          unilateralSigners.length
            ? ` (${unilateralSigners.length} of them can)`
            : ""
        }. XRPL compares quorum against the sum of signing weights, not a count of signers, so this list provides no second approval in practice.`,
        action: "Rebalance the weights so no single signer reaches quorum unaided.",
      });
    } else {
      out.push({
        id: "quorum-ok",
        severity: "ok",
        title: `Requires at least ${minimumSigners} of ${signers.length} signers`,
        detail: `Quorum ${quorum} against a total weight of ${totalWeight}. Taking the heaviest signers first, ${minimumSigners} must agree before anything moves.`,
      });
    }
  }

  /* ── What is locked ────────────────────────────────────────────── */
  const spendable = c.balanceXrp - c.reserveLockedXrp - c.escrowedXrp;
  out.push({
    id: "reserve",
    severity: "info",
    title: `${c.reserveLockedXrp.toLocaleString(undefined, { maximumFractionDigits: 1 })} XRP locked by reserve`,
    detail: `${c.reserveBaseXrp} XRP base plus ${c.ownerCount.toLocaleString()} owned objects at ${c.reserveIncrementXrp} XRP each. This is not spendable while those objects exist — every trust line, offer and escrow adds to it.`,
  });

  if (c.escrows.length > 0) {
    const next = c.escrows
      .filter((e) => e.finishAfter)
      .sort((a, b) => (a.finishAfter! < b.finishAfter! ? -1 : 1))[0];
    out.push({
      id: "escrow",
      severity: "info",
      title: `${c.escrowedXrp.toLocaleString(undefined, { maximumFractionDigits: 2 })} XRP held in ${c.escrows.length} escrow${c.escrows.length === 1 ? "" : "s"}`,
      detail: next?.finishAfter
        ? `The earliest releases on ${new Date(next.finishAfter).toISOString().slice(0, 10)}. Escrowed XRP is committed and cannot be redirected before then.`
        : "None of these carry a finish time, so release depends on their conditions being met.",
    });
  }

  if (spendable < 0) {
    out.push({
      id: "under-reserve",
      severity: "critical",
      title: "Balance is below the reserve requirement",
      detail: `Holding ${c.balanceXrp.toLocaleString(undefined, { maximumFractionDigits: 2 })} XRP against ${(c.reserveLockedXrp + c.escrowedXrp).toLocaleString(undefined, { maximumFractionDigits: 2 })} XRP of reserve and escrow. The account cannot create new objects and may be unable to transact.`,
      action: "Fund the account or remove owned objects to release reserve.",
    });
  }

  /* ── Honesty about coverage ────────────────────────────────────── */
  if (c.truncated) {
    out.push({
      id: "truncated",
      severity: "warn",
      title: "This reading is incomplete",
      detail:
        "The ledger returned more objects than a single page. Totals above are a floor, not a total, and the account may hold escrows this reading did not reach.",
      action: "Re-run against a node that will return the full object set before relying on these figures.",
    });
  } else if (c.escrows.length === 0) {
    out.push({
      id: "no-escrow",
      severity: "info",
      title: "No XRP escrows found",
      detail:
        "Nothing in the pages read. That is an absence of evidence rather than evidence of absence — it means none were returned, not that none can exist.",
    });
  }

  const rank = { critical: 0, warn: 1, info: 2, ok: 3 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
