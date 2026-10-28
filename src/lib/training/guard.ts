import { LABS, LAB_SUBJECTS } from "@/lib/learn/labs";

/**
 * The training copy's one limit: on a paid screen, read only the labs.
 *
 * NOSHASHI Academy runs the real console as its lab workstation, with every
 * screen open (see isTraining in src/lib/edition.ts). A paid screen there
 * may read the labs' own mainnet addresses and transactions, and anything
 * the ledger returns while reading them: an order book's offer owners, a
 * provenance trace's senders, a pool's voters. Typing any other address
 * into a paid screen is refused with a plain message, so the workstation
 * teaches every feature without becoming a free Pro plan.
 *
 * It sits on the one path every console read takes (XrplLink.request), so
 * no screen can read around it. Free screens are not narrowed: they read
 * any address, as they do in NOSHASHI's free tier.
 */

const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const HASH = /^[0-9A-F]{64}$/i;

/** Every address, transaction hash and token id the labs hand to a screen. */
export function labSubjects(): Set<string> {
  const out = new Set<string>(Object.values(LAB_SUBJECTS).map((v) => v.toUpperCase()));
  for (const lab of LABS) {
    for (const step of lab.steps) {
      for (const value of [step.subject, ...(step.copy ?? []).map((c) => c.value)]) {
        for (const part of (value ?? "").split(/[^0-9A-Za-z]+/)) {
          if (ADDRESS.test(part) || HASH.test(part)) out.add(part.toUpperCase());
        }
      }
    }
  }
  return out;
}

/** Fields that hold a ledger's own hash or a paging cursor, never a subject. */
const NOT_SUBJECTS = new Set(["ledger_hash", "ledger_index", "marker", "parent_hash", "account_hash", "transaction_hash"]);

/** Addresses and hashes anywhere in a request or a response. */
export function identifiers(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 12 || value == null) return out;
  if (typeof value === "string") {
    if (ADDRESS.test(value) || HASH.test(value)) out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) identifiers(item, out, depth + 1);
  } else if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (!NOT_SUBJECTS.has(key)) identifiers(item, out, depth + 1);
    }
  }
  return out;
}

/** Thrown in place of a read the training copy does not make. */
export class TrainingLimit extends Error {
  readonly code = "trainingLimit";
  constructor(readonly value: string) {
    super(
      `This is NOSHASHI Academy's training copy: paid screens here read the labs' own addresses and what they link to. ${value} is not one of them. Use the lab's values, or NOSHASHI itself for your own addresses.`
    );
    this.name = "TrainingLimit";
  }
}

export type GuardEvent =
  | { kind: "read"; command: string; values: string[]; paid: boolean }
  | { kind: "blocked"; command: string; value: string };

export class TrainingGuard {
  private readonly allowed: Set<string>;
  /** Identifiers reached from the labs' subjects while reading them on a paid screen. */
  private readonly reached = new Set<string>();
  private paidScreens = 0;
  private listeners = new Set<(event: GuardEvent) => void>();

  constructor(subjects: Iterable<string> = labSubjects()) {
    this.allowed = new Set([...subjects].map((s) => s.toUpperCase()));
  }

  /** A paid screen mounted (+1) or unmounted (-1). Reads are narrowed while any is open. */
  paid(delta: 1 | -1): void {
    this.paidScreens = Math.max(0, this.paidScreens + delta);
  }

  get narrowed(): boolean {
    return this.paidScreens > 0;
  }

  permits(value: string): boolean {
    const key = value.toUpperCase();
    return this.allowed.has(key) || this.reached.has(key);
  }

  /** Call before a read. Throws TrainingLimit when a paid screen asks for something outside the labs. */
  admit(command: string, params: Record<string, unknown>): void {
    if (!this.narrowed) return;
    const outside = identifiers(params).find((v) => !this.permits(v));
    if (outside) {
      this.emit({ kind: "blocked", command, value: outside });
      throw new TrainingLimit(outside);
    }
  }

  /**
   * Call when the ledger has answered a read. Reports it (the Academy counts
   * a lab's reading only once the ledger has answered it) and, on a paid
   * screen, lets what the answer names be read next.
   */
  answered(command: string, params: Record<string, unknown>, result: Record<string, unknown>): void {
    const asked = identifiers(params);
    if (!asked.length) return;
    this.emit({ kind: "read", command, values: asked, paid: this.narrowed });
    // Only a read about a lab subject extends what may be read next. A read
    // naming nothing (a whole ledger, a stream) would otherwise open every
    // account in it.
    if (!this.narrowed || !asked.every((v) => this.permits(v))) return;
    for (const v of identifiers(result)) this.reached.add(v.toUpperCase());
  }

  on(listener: (event: GuardEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: GuardEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

let shared: TrainingGuard | null = null;
/** The training copy's guard, made on first use. Only consulted when isTraining. */
export function trainingGuard(): TrainingGuard {
  return (shared ??= new TrainingGuard());
}
