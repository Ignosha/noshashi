/**
 * Request pacing for the public XRPL servers.
 *
 * Public rippled and Clio servers meter load per client IP. Past their
 * limit they answer a command with `slowDown` or `tooBusy` ("You are
 * placing too much load on the server"), and keep doing so while the load
 * continues. Every screen in the app shares one connection, so a busy
 * screen (an audit trail paging 200 transactions at a time, a registry
 * read, a screening batch) used to burst dozens of commands at once, get
 * throttled, and show the throttle message to the user as if it were an
 * answer.
 *
 * The pacer sits between every read and the socket:
 *
 *   - at most MAX_IN_FLIGHT commands are outstanding at a time; the rest
 *     wait their turn in order;
 *   - a throttled reply pauses every new command for a cool-down that
 *     doubles with each consecutive throttle (1 s, 2 s, 4 s, capped at 8 s),
 *     then the same command is sent again;
 *   - after two throttles in a row the caller is told to move to the next
 *     public server, since the limit is per server;
 *   - a command lost to a dropped connection is sent again once the link
 *     is back.
 *
 * Retrying is safe because every command NOSHASHI sends is a read: it
 * never submits or signs a transaction. After MAX_RETRIES the error is
 * raised with a message that says what happened and what to do, instead of
 * the server's own wording.
 */

/** rippled/Clio error codes that mean "not now", not "no". */
export const THROTTLE_CODES: ReadonlySet<string> = new Set(["slowDown", "tooBusy"]);
/** Transient states a public server passes through; worth one more try. */
export const TRANSIENT_CODES: ReadonlySet<string> = new Set(["noNetwork", "noCurrent", "noClosed", "notReady", "disconnected"]);

export const MAX_IN_FLIGHT = 4;
export const MAX_RETRIES = 3;
const BASE_COOL_MS = 1_000;
const MAX_COOL_MS = 8_000;

export const THROTTLED_MESSAGE =
  "Public XRPL servers are limiting requests from this network right now. NOSHASHI slowed down and retried on more than one server. Wait a minute and try again; nothing was decided on a partial read.";

type Clock = { now: () => number; sleep: (ms: number) => Promise<void> };

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class RequestPacer {
  private inFlight = 0;
  private waiting: Array<() => void> = [];
  private coolUntil = 0;
  private streak = 0;

  constructor(
    /** Called when throttling persists on one server: move to the next. */
    private readonly rotate: () => void,
    /** Builds the error raised once retries are spent (the link's XrplError). */
    private readonly giveUp: (message: string, code: string) => Error,
    private readonly clock: Clock = realClock,
    private readonly jitter: () => number = () => Math.random() * 250
  ) {}

  /** Outstanding commands, for tests and diagnostics. */
  get pending(): number {
    return this.inFlight;
  }

  /** How long new commands are held back from now, in ms. */
  coolingFor(): number {
    return Math.max(0, this.coolUntil - this.clock.now());
  }

  private async acquire(): Promise<void> {
    for (;;) {
      const wait = this.coolingFor();
      if (wait > 0) {
        await this.clock.sleep(wait);
        continue;
      }
      if (this.inFlight < MAX_IN_FLIGHT) {
        this.inFlight += 1;
        return;
      }
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
  }

  private release() {
    this.inFlight -= 1;
    this.waiting.shift()?.();
  }

  private throttled() {
    this.streak += 1;
    const cool = Math.min(MAX_COOL_MS, BASE_COOL_MS * 2 ** (this.streak - 1)) + this.jitter();
    this.coolUntil = Math.max(this.coolUntil, this.clock.now() + cool);
    if (this.streak % 2 === 0) this.rotate();
  }

  /**
   * Run one read through the pacer. `send` issues the command once and
   * rejects with an error carrying the server's `code`.
   */
  async run<T>(send: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      await this.acquire();
      let error: unknown;
      try {
        const result = await send();
        this.streak = 0;
        return result;
      } catch (caught) {
        error = caught;
      } finally {
        this.release();
      }
      const code = (error as { code?: string } | null)?.code ?? "";
      const throttle = THROTTLE_CODES.has(code);
      if (!throttle && !TRANSIENT_CODES.has(code)) throw error;
      if (throttle) this.throttled();
      else await this.clock.sleep(BASE_COOL_MS + this.jitter());
      if (attempt >= MAX_RETRIES) {
        throw throttle ? this.giveUp(THROTTLED_MESSAGE, code) : error;
      }
    }
  }
}
