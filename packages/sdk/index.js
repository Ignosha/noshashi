/*!
 * @noshashi/sdk — screen XRP Ledger counterparties before value moves.
 *
 * Zero dependencies. Runs anywhere `fetch` does: Node 18+, Deno, Bun,
 * browsers, Cloudflare Workers.
 *
 * Two kinds of call:
 *
 *   Free, no key   authority certificates, issuer state, badges, sanctions
 *                  (OFAC SDN), the scam registry, phishing domains, domain
 *                  verification and delivered-amount exports. Rate-limited
 *                  per caller; nothing to sign up for.
 *
 *   Keyed          GO / HOLD / NO-GO adjudication with a SHA-256 receipt
 *                  (one prepaid credit per call), incoming-payment screening
 *                  and withdrawal screening. Pass an `nsh_live_…` key. Keys
 *                  are server-side secrets: never ship one to a browser.
 *
 * Every answer is read from validated ledger state at the time of the call.
 * A fact that could not be read comes back as an error or as "unknown" —
 * never as a pass.
 */

export const SITE = "https://www.noshashi.app";
export const FUNCTIONS = "https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1";
export const ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const HASH_RE = /^[0-9A-Fa-f]{64}$/;

export class NoshashiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string, body?: unknown }} [info]
   */
  constructor(message, info = {}) {
    super(message);
    this.name = "NoshashiError";
    this.status = info.status ?? 0;
    this.code = info.code ?? "error";
    this.body = info.body;
  }
}

function assertAddress(value, name = "address") {
  if (typeof value !== "string" || !ADDRESS_RE.test(value)) {
    throw new NoshashiError(`${name} must be an XRPL classic address (r…).`, { code: "invalid_address" });
  }
}

export class Noshashi {
  /**
   * @param {{ apiKey?: string, fetch?: typeof fetch, site?: string, functions?: string, timeoutMs?: number }} [options]
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey;
    this.site = (options.site ?? SITE).replace(/\/$/, "");
    this.functions = (options.functions ?? FUNCTIONS).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this._fetch = options.fetch ?? globalThis.fetch;
    if (typeof this._fetch !== "function") throw new NoshashiError("No fetch available. Pass options.fetch.");
    if (this.apiKey !== undefined && !/^nsh_live_[A-Za-z0-9_-]{8,}$/.test(this.apiKey)) {
      throw new NoshashiError("apiKey must be an nsh_live_… key.", { code: "invalid_key" });
    }
  }

  async _request(url, { method = "GET", body, auth = false, raw = false } = {}) {
    if (auth && !this.apiKey) {
      throw new NoshashiError("This call needs an nsh_live_ key: new Noshashi({ apiKey }).", { code: "key_required" });
    }
    const headers = { Accept: raw ? "text/csv, application/json" : "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth) headers.Authorization = `Bearer ${this.apiKey}`;
    const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(this.timeoutMs) : undefined;
    let response;
    try {
      response = await this._fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
    } catch (error) {
      throw new NoshashiError(`Request failed: ${error instanceof Error ? error.message : String(error)}`, { code: "network" });
    }
    if (raw && response.ok) return response;
    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    if (!response.ok) {
      const message = parsed?.message ?? parsed?.error ?? `HTTP ${response.status}`;
      throw new NoshashiError(String(message), {
        status: response.status,
        code: typeof parsed?.error === "string" && /^[a-z_]+$/.test(parsed.error) ? parsed.error : `http_${response.status}`,
        body: parsed,
      });
    }
    return parsed;
  }

  // ── Free: issuers ─────────────────────────────────────────────────

  /**
   * The authority certificate: what an issuer can still do to holders,
   * with a SHA-256 digest. `walk: true` also measures supply
   * concentration (slower: tens of seconds for a large issuer).
   */
  authority(issuer, { walk = false } = {}) {
    assertAddress(issuer, "issuer");
    return this._request(`${this.site}/api/authority?issuer=${issuer}${walk ? "&walk=1" : ""}`);
  }

  /** The issuer's AccountRoot and signer list exactly as the ledger returned them. */
  issuerState(issuer) {
    assertAddress(issuer, "issuer");
    return this._request(`${this.site}/api/issuer-state?issuer=${issuer}`);
  }

  /** The issuer's current powers, summarised (the snapshot alerts compare against). */
  issuerPowers(issuer) {
    assertAddress(issuer, "issuer");
    return this._request(`${this.functions}/noshashi-issuer-alerts/powers?issuer=${issuer}`);
  }

  /** URL of the live authority badge (SVG) for an issuer. No request is made. */
  badgeUrl(issuer, { style = "flat", theme = "light" } = {}) {
    assertAddress(issuer, "issuer");
    const q = new URLSearchParams({ issuer });
    if (style === "card") q.set("style", "card");
    if (theme === "dark") q.set("theme", "dark");
    return `${this.site}/api/badge?${q}`;
  }

  /** Check an authority certificate's digest against its own body. Reads nothing. */
  checkCertificate(certificate) {
    return this._request(`${this.functions}/noshashi-verify/authority/check`, { method: "POST", body: certificate });
  }

  // ── Free: addresses ───────────────────────────────────────────────

  /** Which of up to 50 addresses are on the US Treasury OFAC SDN list. */
  sanctions(addresses) {
    const list = [].concat(addresses);
    if (!list.length || list.length > 50) throw new NoshashiError("Pass 1 to 50 addresses.", { code: "invalid_request" });
    list.forEach((a) => assertAddress(a));
    return this._request(`${this.functions}/noshashi-xrpl-watch/sanctions?addresses=${list.join(",")}`);
  }

  /** Confirmed scam-registry entries for up to 50 addresses. */
  threats(addresses) {
    const list = [].concat(addresses);
    if (!list.length || list.length > 50) throw new NoshashiError("Pass 1 to 50 addresses.", { code: "invalid_request" });
    list.forEach((a) => assertAddress(a));
    return this._request(`${this.functions}/noshashi-xrpl-watch/threats?addresses=${list.join(",")}`);
  }

  /** Has a domain been advertised in micro-payment memos on the ledger? */
  phishing(domain) {
    if (typeof domain !== "string" || !domain.includes(".")) throw new NoshashiError("Pass a domain.", { code: "invalid_request" });
    return this._request(`${this.functions}/noshashi-xrpl-watch/phishing?domain=${encodeURIComponent(domain)}`);
  }

  /** Does the account's claimed domain list it back in /.well-known/xrp-ledger.toml? */
  verifyDomain({ address, domain } = {}) {
    if (address) {
      assertAddress(address);
      return this._request(`${this.functions}/noshashi-xrpl-watch/domain-verify?address=${address}`);
    }
    if (typeof domain === "string" && domain.includes(".")) {
      return this._request(`${this.functions}/noshashi-xrpl-watch/domain-verify?domain=${encodeURIComponent(domain)}`);
    }
    throw new NoshashiError("Pass { address } or { domain }.", { code: "invalid_request" });
  }

  /**
   * Everything free about one counterparty in one call: sanctions, scam
   * registry and, for an issuer, the authority certificate. Each part
   * that failed is reported in `errors`, never silently dropped.
   */
  async screenAddress(address, { asIssuer = false } = {}) {
    assertAddress(address);
    const parts = {
      sanctions: this.sanctions([address]),
      threats: this.threats([address]),
      ...(asIssuer ? { authority: this.authority(address) } : {}),
    };
    const out = { address, errors: {} };
    await Promise.all(Object.entries(parts).map(async ([name, promise]) => {
      try {
        out[name] = await promise;
      } catch (error) {
        out[name] = null;
        out.errors[name] = error instanceof Error ? error.message : String(error);
      }
    }));
    return out;
  }

  // ── Free: payments ────────────────────────────────────────────────

  /**
   * An account's successful payments with what each actually delivered
   * (never `Amount` in place of `delivered_amount`). Dates are UTC
   * YYYY-MM-DD. `format: "csv"` returns the CSV text.
   */
  async delivered(account, { from, to, format = "json" } = {}) {
    assertAddress(account, "account");
    const q = new URLSearchParams({ account, format: format === "csv" ? "csv" : "json" });
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const url = `${this.site}/api/delivered?${q}`;
    if (format !== "csv") return this._request(url);
    const response = await this._request(url, { raw: true });
    return {
      csv: await response.text(),
      complete: response.headers.get("x-noshashi-complete") === "true",
      stoppedBecause: response.headers.get("x-noshashi-stopped-because"),
    };
  }

  // ── Keyed ─────────────────────────────────────────────────────────

  /**
   * GO / HOLD / NO-GO for a settlement, with a digested receipt.
   * Spends one prepaid credit. Needs the `verify` scope.
   */
  verify({ subject, domain, amount_xrp }) {
    assertAddress(subject, "subject");
    return this._request(`${this.functions}/noshashi-verify`, { method: "POST", auth: true, body: { subject, domain, amount_xrp } });
  }

  /** A receipt your account or organization recorded, by digest. */
  receipt(digest) {
    if (!HASH_RE.test(String(digest))) throw new NoshashiError("digest must be 64 hex characters.", { code: "invalid_request" });
    return this._request(`${this.functions}/noshashi-verify/receipts/${digest}`, { auth: true });
  }

  /** Screen one incoming payment before crediting it. Organization key. */
  screenDeposit({ hash, deposit_address, config }) {
    if (!HASH_RE.test(String(hash))) throw new NoshashiError("hash must be 64 hex characters.", { code: "invalid_request" });
    assertAddress(deposit_address, "deposit_address");
    return this._request(`${this.functions}/noshashi-xrpl-watch/screen`, {
      method: "POST", auth: true, body: { hash, deposit_address, ...(config ? { config } : {}) },
    });
  }

  /** Screen an outbound payment before it is signed. Organization key, Enterprise plan. */
  screenWithdrawal({ destination, destination_tag, amount_xrp, previous_destinations, own_addresses }) {
    assertAddress(destination, "destination");
    return this._request(`${this.functions}/noshashi-xrpl-watch/withdrawal-screen`, {
      method: "POST", auth: true, body: { destination, destination_tag, amount_xrp, previous_destinations, own_addresses },
    });
  }
}

export default Noshashi;
