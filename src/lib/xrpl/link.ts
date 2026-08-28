/**
 * XrplLink — one persistent WebSocket to mainnet, shared by every read.
 *
 * The public rippled HTTP endpoints do not send CORS headers, so a
 * browser or webview cannot POST to them at all. The WebSocket API is
 * not subject to CORS and exposes the same command set, so the console
 * runs every request and the live subscription over a single socket:
 * one connection to keep healthy, one place to handle failover.
 */

const ENDPOINTS = [
  "wss://xrplcluster.com",
  "wss://s1.ripple.com",
  "wss://s2.ripple.com",
];

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_BACKOFF_MS = 20_000;

export class XrplError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = "XrplError";
  }
}

type Pending = {
  resolve: (value: Record<string, any>) => void;
  reject: (error: Error) => void;
  timer: number;
};

/** Raw stream frames; the client module normalises them. */
type StreamHandler = (frame: Record<string, any>) => void;
type StatusHandler = (connected: boolean) => void;

class XrplLink {
  private socket: WebSocket | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private endpointIndex = 0;
  private attempt = 0;
  private retryTimer = 0;
  private connecting: Promise<WebSocket> | null = null;
  private streamHandlers = new Set<StreamHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private latencyMs = 0;
  private connected = false;

  /** Round-trip time of the most recent successful command. */
  getLatencyMs(): number {
    return this.latencyMs;
  }

  isConnected(): boolean {
    return this.connected;
  }

  onStream(handler: StreamHandler): () => void {
    this.streamHandlers.add(handler);
    void this.ensureSocket();
    return () => this.streamHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.connected);
    return () => this.statusHandlers.delete(handler);
  }

  private setConnected(connected: boolean) {
    if (this.connected === connected) return;
    this.connected = connected;
    for (const handler of this.statusHandlers) handler(connected);
  }

  private ensureSocket(): Promise<WebSocket> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.socket);
    }
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<WebSocket>((resolve, reject) => {
      const endpoint = ENDPOINTS[this.endpointIndex % ENDPOINTS.length];
      let socket: WebSocket;
      try {
        socket = new WebSocket(endpoint);
      } catch (error) {
        this.connecting = null;
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      this.socket = socket;

      const openTimeout = window.setTimeout(() => {
        socket.close();
      }, REQUEST_TIMEOUT_MS);

      socket.onopen = () => {
        window.clearTimeout(openTimeout);
        this.attempt = 0;
        this.connecting = null;
        this.setConnected(true);
        // Re-arm the live subscription on every (re)connect.
        socket.send(
          JSON.stringify({
            id: this.nextId++,
            command: "subscribe",
            streams: ["ledger", "transactions"],
          })
        );
        resolve(socket);
      };

      socket.onmessage = (event) => this.handleMessage(event);

      socket.onerror = () => {
        window.clearTimeout(openTimeout);
      };

      socket.onclose = () => {
        window.clearTimeout(openTimeout);
        this.connecting = null;
        this.socket = null;
        this.setConnected(false);

        // Fail every in-flight request rather than leaving them hanging.
        for (const [, entry] of this.pending) {
          window.clearTimeout(entry.timer);
          entry.reject(new XrplError("Connection closed"));
        }
        this.pending.clear();

        reject(new XrplError("Connection closed"));
        this.scheduleReconnect();
      };
    });

    return this.connecting;
  }

  private scheduleReconnect() {
    // Nothing is listening and nothing is queued — stay disconnected.
    if (this.streamHandlers.size === 0 && this.pending.size === 0) return;
    window.clearTimeout(this.retryTimer);
    this.endpointIndex += 1;
    this.attempt += 1;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(this.attempt - 1, 4));
    this.retryTimer = window.setTimeout(() => {
      void this.ensureSocket().catch(() => {
        /* onclose schedules the next attempt */
      });
    }, delay);
  }

  private handleMessage(event: MessageEvent) {
    let data: Record<string, any>;
    try {
      data = JSON.parse(String(event.data));
    } catch {
      return;
    }

    // Command response
    if (data.type === "response" && typeof data.id === "number") {
      const entry = this.pending.get(data.id);
      if (!entry) return;
      window.clearTimeout(entry.timer);
      this.pending.delete(data.id);

      if (data.status === "error") {
        entry.reject(
          new XrplError(
            String(data.error_message ?? data.error ?? "Ledger error"),
            String(data.error ?? "")
          )
        );
        return;
      }
      entry.resolve(data.result ?? {});
      return;
    }

    // Stream frames
    if (data.type === "ledgerClosed" || data.type === "transaction") {
      for (const handler of this.streamHandlers) handler(data);
    }
  }

  /** Issue a rippled command and await its response. */
  async request(
    command: string,
    params: Record<string, unknown> = {}
  ): Promise<Record<string, any>> {
    const socket = await this.ensureSocket();
    const id = this.nextId++;
    const started = performance.now();

    return new Promise<Record<string, any>>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new XrplError(`Timed out: ${command}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (result) => {
          this.latencyMs = Math.max(1, Math.round(performance.now() - started));
          resolve(result);
        },
        reject,
        timer,
      });

      try {
        socket.send(JSON.stringify({ id, command, ...params }));
      } catch (error) {
        window.clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}

export const xrplLink = new XrplLink();
