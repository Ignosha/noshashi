import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { supabase } from "@/lib/supabase/client";
import { FUNCTIONS_URL } from "@/lib/supabase/project";
import {
  csv,
  download,
  portalApi,
  type Report,
  type Run,
  type Usage,
} from "./client";
import { importPayments, TEMPLATE } from "./input";

type Key = {
  id: string;
  name: string;
  prefix: string;
  expires_at: string;
  revoked_at: string | null;
};
type History = {
  id: string;
  status: string;
  created_at: string;
  records: number;
  charged_records: number | null;
};
type Tab = "review" | "keys" | "history" | "api" | "plans";
const API = `${FUNCTIONS_URL}/noshashi-payment-review`;
const EMPTY = JSON.stringify(
  {
    rows: [
      {
        hash: "PASTE_A_REAL_64_CHARACTER_TRANSACTION_HASH",
        invoice: {
          invoice_id: "invoice-001",
          destination: "PASTE_THE_EXPECTED_DESTINATION",
          expected_amount: "100.00",
          asset: { kind: "xrp" },
        },
      },
    ],
  },
  null,
  2,
);

function Results({ run }: { run: Run }) {
  const [integrity, setIntegrity] = useState("Checking receipt…");
  useEffect(() => {
    let active = true;
    if (!run.result) return;
    const utf8 = (a: string, b: string) => { const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b); for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length; };
    const canonical = (v: unknown): string =>
      Array.isArray(v)
        ? `[${v.map(canonical).join(",")}]`
        : v && typeof v === "object"
          ? `{${Object.keys(v)
              .sort(utf8)
              .map(
                (k) =>
                  `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`,
              )
              .join(",")}}`
          : JSON.stringify(v);
    void (async () => {
      try {
        const result = run.result!;
        const hash = async (v: unknown) =>
          Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(canonical(v)),
              ),
            ),
            (b) => b.toString(16).padStart(2, "0"),
          )
            .join("")
            .toUpperCase();
        const valid =
          (await hash({
            schema: result.schema,
            network: result.network,
            reports: result.reports,
          })) === result.digest &&
          (
            await Promise.all(
              result.reports.map(
                async (r) => (await hash(r.evidence)) === r.evidence_digest,
              ),
            )
          ).every(Boolean);
        if (active)
          setIntegrity(
            valid
              ? "Receipt hashes match the exact saved evidence."
              : "Receipt check failed. Treat this report as unverified.",
          );
      } catch {
        if (active)
          setIntegrity(
            "Receipt could not be checked. Treat this report as unverified.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [run]);
  if (!run.result)
    return (
      <p role="status">
        This run is {run.status}. Reload it from History to check again. It has
        not passed.
      </p>
    );
  const reports = run.result.reports;
  if (!Array.isArray(reports))
    return (
      <p role="alert">
        This run failed. No analysis was accepted. Start a new request to retry.
      </p>
    );
  return (
    <section aria-labelledby="results-title">
      <div className="section-title">
        <div>
          <p className="eyebrow">SAVED EVIDENCE / MAINNET</p>
          <h2 id="results-title">The reading, row by row.</h2>
        </div>
        <div className="actions">
          <button
            onClick={() =>
              download(`review-${run.id}.json`, JSON.stringify(run, null, 2))
            }
          >
            Export full JSON
          </button>
          <button
            onClick={() =>
              download(`review-${run.id}.csv`, csv(reports), "text/csv")
            }
          >
            Export CSV
          </button>
        </div>
      </div>
      <p role="status">{integrity}</p>
      <p className="fine">
        {reports.length} rows ·{" "}
        {reports.filter((r) => r.status === "VERIFIED").length} matched ·{" "}
        {reports.filter((r) => r.status !== "VERIFIED").length} need review.
        VERIFIED applies only to the supplied invoice rules.
      </p>
      <div
        className="table-wrap"
        tabIndex={0}
        aria-label="Payment review results"
      >
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Result</th>
              <th>Delivered</th>
              <th>Ledger</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r: Report) => (
              <tr key={r.transaction_hash}>
                <td>{r.invoice_id}</td>
                <td>
                  <span className={`badge ${r.status.toLowerCase()}`}>
                    {r.status}
                  </span>
                  <small>{r.reason_code}</small>
                </td>
                <td>{r.delivered_amount?.value ?? "Unavailable"}
                  {r.delivered_amount && <small className="wrap">{r.delivered_amount.asset.kind==='xrp'?'XRP':r.delivered_amount.asset.currency}<br/>{r.delivered_amount.asset.issuer}</small>}
                </td>
                <td>{r.ledger_index ?? "Not validated"}</td>
                <td>
                  <details>
                    <summary>Inspect</summary>
                    <p>{r.explanation}</p>
                    <p className="mono wrap">{r.transaction_hash}</p>
                    <p className="mono wrap">SHA-256 {r.evidence_digest}</p>
                    <pre>{JSON.stringify(r.evidence, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fine">
        Hashes detect changes; they are not digital signatures. Public-node
        reads do not independently verify consensus, reserves, legal rights or
        compliance.
      </p>
    </section>
  );
}

export function Portal() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("review");
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "recovery">(
    "signin",
  );
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null),
    [input, setInput] = useState(EMPTY),
    [run, setRun] = useState<Run | null>(null);
  const [keys, setKeys] = useState<Key[]>([]),
    [rawKey, setRawKey] = useState(""),
    [keyName, setKeyName] = useState("Server integration");
  const [history, setHistory] = useState<History[]>([]);
  const [retry, setRetry] = useState<{ input: string; key: string } | null>(
    null,
  );
  const signedIn = !!auth.user && !auth.mfaRequired;
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setUsage(await portalApi<Usage>("usage"));
  }
  useEffect(() => {
    const url = new URL(location.href);
    const callback = url.searchParams.get("code");
    if (callback) {
      const recovery = url.searchParams.get("mode") === "recovery";
      historyReplace();
      void act(async () => {
        const { error } =
          await supabase().auth.exchangeCodeForSession(callback);
        if (error) throw error;
        if (recovery) setMode("recovery");
        else setNotice("Email confirmed. Sign in to continue.");
      });
    }
    function historyReplace() {
      window.history.replaceState({}, "", location.pathname);
    }
  }, []);
  useEffect(() => {
    if (signedIn) {
      void act(refresh);
    } else {
      setUsage(null);
      setKeys([]);
      setHistory([]);
      setRun(null);
      setRawKey("");
      setInput(EMPTY);
      setRetry(null);
    }
  }, [signedIn]);
  async function authenticate(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      if (auth.mfaRequired) {
        const factor = auth.factors.find((f) => f.status === "verified");
        if (!factor)
          throw new Error(
            "Use your existing account recovery process. No verified factor is available.",
          );
        await auth.challengeTotp(factor.id, code.trim());
        setCode("");
        return;
      }
      if (mode === "reset") {
        const { error } = await supabase().auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${location.origin}/developers/portal/?mode=recovery` },
        );
        if (error) throw error;
        setNotice("If this account exists, check its email for a reset link.");
        return;
      }
      if (mode === "recovery") {
        await auth.updatePassword(password);
        setMode("signin");
        setPassword("");
        setNotice("Password updated.");
        return;
      }
      if (mode === "signup") {
        await auth.signUp(email.trim(), password);
        setNotice(
          "Check your email to confirm the account, then return here to sign in.",
        );
        setMode("signin");
      } else await auth.signIn(email.trim(), password);
      setPassword("");
    });
  }
  async function selectTab(value: Tab) {
    setTab(value);
    setRawKey("");
    setError("");
    if (!signedIn) return;
    if (value === "keys")
      await act(async () =>
        setKeys((await portalApi<{ keys: Key[] }>("keys")).keys),
      );
    if (value === "history")
      await act(async () =>
        setHistory((await portalApi<{ runs: History[] }>("runs")).runs),
      );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      const body = importPayments(input, "json");
      const key = retry?.input === input ? retry.key : crypto.randomUUID();
      setRetry({ input, key });
      const next = await portalApi<Run>("runs", "POST", body, key);
      setRun(next);
      if (next.status === "completed" || next.status === "failed")
        setRetry(null);
      await refresh();
    });
  }
  async function openBilling(
    action: "checkout" | "portal",
    cadence = "monthly",
  ) {
    await act(async () => {
      const { url } = await portalApi<{ url: string }>(action, "POST", {
        cadence,
      });
      const destination = new URL(url);
      if (
        destination.protocol !== "https:" ||
        !["checkout.stripe.com", "billing.stripe.com"].includes(
          destination.hostname,
        )
      )
        throw new Error("Billing returned an unexpected address.");
      location.assign(url);
    });
  }
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="top">
        <a className="brand" href="/">
          <img src="/brand/logos/seal.svg" width="28" height="28" alt="" /> NOSHASHI
        </a>
        <span className="mono">DEVELOPER PORTAL / BETA</span>
        <nav aria-label="Main">
          <a href="/institutional-demo/">Public demo</a>
          <a href="/docs/">Docs</a>
          {auth.user && (
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  setRawKey("");
                  await auth.signOut();
                })
              }
            >
              Sign out
            </button>
          )}
        </nav>
      </header>
      <main id="main">
        <div className="intro">
          <p className="eyebrow">PAYMENT REVIEW / XRPL MAINNET</p>
          <h1>
            From payment list
            <br />
            to clear evidence.
          </h1>
          <p className="lede">
            Match what you expected with what the XRP Ledger records.
            <br />{" "}
            One workflow in your browser, API and terminal.
          </p>
          <div className="principles">
            <span>Read-only</span>
            <span>No wallet keys</span>
            <span>Complete evidence at every tier</span>
          </div>
        </div>
        <div className="portal-grid">
          <aside>
            <nav aria-label="Portal sections">
              {(["review", "keys", "history", "api", "plans"] as Tab[]).map(
                (t, i) => (
                  <button
                    key={t}
                    aria-current={tab === t ? "page" : undefined}
                    onClick={() => void selectTab(t)}
                  >
                    <span className="mono">0{i + 1}</span>
                    {
                      {
                        review: "Review payments",
                        keys: "API keys",
                        history: "Run history",
                        api: "API & CLI",
                        plans: "Plans & billing",
                      }[t]
                    }
                  </button>
                ),
              )}
            </nav>
            <p className="fine">
              Public facts stay open.
              <br />
              <a href="/delivered/">Check one payment free →</a>
            </p>
          </aside>
          <div className="workspace">
            <div className="account-line">
              <span>
                {signedIn ? auth.user?.email : "Your developer workspace"}
              </span>
              <span className="mono">
                {usage
                  ? `${usage.plan.name} / ${usage.used.toLocaleString()} OF ${usage.plan.records.toLocaleString()} RECORDS`
                  : "SIGN IN TO START"}
              </span>
            </div>
            {busy && (
              <p role="status" className="status">
                Working… Ledger checks can take up to a minute.
              </p>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="status">
                {notice}
              </p>
            )}
            {(!signedIn || mode === "recovery") && (
              <section className="auth-box">
                <p className="eyebrow">YOUR ACCOUNT</p>
                <h2>
                  {auth.mfaRequired
                    ? "Enter your second factor"
                    : mode === "signup"
                      ? "Create an account"
                      : mode === "reset"
                        ? "Reset your password"
                        : mode === "recovery"
                          ? "Choose a new password"
                          : "Sign in to Payment Review"}
                </h2>
                <p>
                  Use your existing NOSHASHI account, or create one. Free needs
                  no card.
                </p>
                <form onSubmit={authenticate}>
                  {auth.mfaRequired ? (
                    <label>
                      Authenticator code
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                      />
                    </label>
                  ) : (
                    <>
                      {mode !== "recovery" && (
                        <label>
                          Email
                          <input
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                          />
                        </label>
                      )}
                      {mode !== "reset" && (
                        <label>
                          Password
                          <input
                            type="password"
                            autoComplete={
                              mode === "signup" || mode === "recovery"
                                ? "new-password"
                                : "current-password"
                            }
                            minLength={mode === "signin" ? 1 : 12}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                          />
                        </label>
                      )}
                    </>
                  )}
                  {mode === "signup" && (
                    <p className="fine">
                      Use 12+ characters with an uppercase letter, lowercase
                      letter, number and symbol.{" "}
                      <a href="/legal/">Terms and privacy</a>.
                    </p>
                  )}
                  <button className="primary" disabled={busy || auth.loading}>
                    {auth.mfaRequired
                      ? "Verify code"
                      : mode === "signup"
                        ? "Create free account"
                        : mode === "reset"
                          ? "Send reset link"
                          : mode === "recovery"
                            ? "Save password"
                            : "Sign in"}
                  </button>
                </form>
                {!auth.mfaRequired && (
                  <div className="actions">
                    <button
                      disabled={busy}
                      onClick={() => {
                        setMode(mode === "signup" ? "signin" : "signup");
                        setError("");
                      }}
                    >
                      {mode === "signup"
                        ? "Already have an account?"
                        : "Create an account"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setMode(mode === "reset" ? "signin" : "reset");
                        setError("");
                      }}
                    >
                      {mode === "reset"
                        ? "Back to sign in"
                        : "Forgot password?"}
                    </button>
                  </div>
                )}
              </section>
            )}
            {tab === "review" && (
              <section>
                <div className="section-title">
                  <div>
                    <p className="eyebrow">01 / RECONCILE</p>
                    <h2>Bring your payment list.</h2>
                  </div>
                  <button
                    onClick={() =>
                      download(
                        "payment-review-template.csv",
                        TEMPLATE,
                        "text/csv",
                      )
                    }
                  >
                    CSV template ↓
                  </button>
                </div>
                <p>
                  Use a transaction hash, expected destination, asset and amount
                  for each invoice. Only include data you are allowed to review.
                </p>
                <form onSubmit={submit}>
                  <label className="file-label">
                    Import CSV or JSON
                    <input
                      type="file"
                      accept=".csv,.json,text/csv,application/json"
                      disabled={!signedIn || busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          void act(async () => {
                            if (file.size > 65536)
                              throw new Error(
                                "Choose a file smaller than 64 KB.",
                              );
                            setInput(
                              JSON.stringify(
                                importPayments(
                                  await file.text(),
                                  file.name.toLowerCase().endsWith(".csv")
                                    ? "csv"
                                    : "json",
                                ),
                                null,
                                2,
                              ),
                            );
                            setRetry(null);
                          });
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <label>
                    Payment list (JSON)
                    <textarea
                      spellCheck={false}
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        setRetry(null);
                      }}
                      rows={13}
                      disabled={!signedIn || busy}
                    />
                  </label>
                  <div className="actions">
                    <button
                      type="submit"
                      className="primary"
                      disabled={!signedIn || busy}
                    >
                      {retry ? "Retry same request" : "Review payments →"}
                    </button>
                    <p className="fine">
                      {usage
                        ? `Up to ${usage.plan.batch} rows per request. `
                        : ""}
                      Amounts are decimal strings. No rounding or currency
                      conversion.
                    </p>
                  </div>
                </form>
                <p className="fine">
                  Each new row uses one unit of processing capacity.
                  Unavailable-source rows are credited back. Months reset in
                  UTC; no automatic overage charges. Replays return the exact
                  saved reading, not a fresh ledger read.
                </p>
              </section>
            )}
            {tab === "review" && signedIn && run && <Results run={run} />}
            {tab === "keys" && (
              <section>
                <p className="eyebrow">02 / CREDENTIALS</p>
                <h2>A key for your integration.</h2>
                <p>
                  Keys are scoped to Payment Review and expire in 90 days. The
                  raw key is shown once. Never put it in browser code or a
                  public repository.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () => {
                      const r = await portalApi<{ key: string }>(
                        "keys",
                        "POST",
                        { name: keyName },
                      );
                      setRawKey(r.key);
                      setKeys((await portalApi<{ keys: Key[] }>("keys")).keys);
                    });
                  }}
                >
                  <label>
                    Key name
                    <input
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      maxLength={80}
                    />
                  </label>
                  <button disabled={!signedIn || busy}>
                    Create scoped key
                  </button>
                </form>
                {signedIn && rawKey && (
                  <div className="secret">
                    <label>
                      Copy now; it will not be shown again
                      <input
                        readOnly
                        value={rawKey}
                        aria-label="New secret API key"
                        onFocus={(e) => e.target.select()}
                      />
                    </label>
                    <button onClick={() => setRawKey("")}>Hide key</button>
                  </div>
                )}
                {keys.map((k) => (
                  <div className="key-row" key={k.id}>
                    <div>
                      <b>{k.name}</b>
                      <p className="mono">
                        {k.prefix}… ·{" "}
                        {k.revoked_at
                          ? "Revoked"
                          : `Expires ${new Date(k.expires_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <button
                      disabled={busy || !!k.revoked_at}
                      onClick={() =>
                        void act(async () => {
                          await portalApi("keys", "DELETE", { id: k.id });
                          setKeys(
                            (await portalApi<{ keys: Key[] }>("keys")).keys,
                          );
                          setRawKey("");
                        })
                      }
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </section>
            )}
            {tab === "history" && (
              <section>
                <p className="eyebrow">03 / RECORDS</p>
                <h2>Your latest runs.</h2>
                <p>
                  Only your account can retrieve these reports. A saved report
                  is a historical reading.
                </p>
                {history.length === 0 ? (
                  <p>No saved runs loaded. Sign in to view them.</p>
                ) : (
                  history.map((h) => (
                    <div className="key-row" key={h.id}>
                      <div>
                        <b>
                          {h.records} records / {h.status}
                        </b>
                        <p>{new Date(h.created_at).toLocaleString()}</p>
                      </div>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            setRun(await portalApi<Run>(`runs/${h.id}`));
                            setTab("review");
                          })
                        }
                      >
                        Open run
                      </button>
                    </div>
                  ))
                )}
              </section>
            )}
            {tab === "api" && (
              <section>
                <p className="eyebrow">04 / DEVELOP</p>
                <h2>One API. Three ways in.</h2>
                <p>
                  Use the same request in the browser, an HTTP client or the
                  dependency-free Node CLI. Your account’s capacity is shared
                  across all three.
                </p>
                <h3>HTTP</h3>
                <pre>{`curl '${API}/runs' \\\n  -H "Authorization: Bearer $NOSHASHI_REVIEW_KEY" \\\n  -H 'Content-Type: application/json' \\\n  -H 'Idempotency-Key: invoice-batch-001' \\\n  --data-binary @payments.json`}</pre>
                <h3>Terminal</h3>
                <pre>{`node packages/cli/bin/noshashi-review.mjs review \\\n  --input payments.csv --request-id invoice-batch-001 \\\n  --output review.json\n\nnode packages/cli/bin/noshashi-review.mjs usage\nnode packages/cli/bin/noshashi-review.mjs verify-receipt --input review.json`}</pre>
                <p>
                  Get the CLI from the{" "}
                  <a href="https://github.com/Ignosha/noshashi/tree/main/packages/cli">
                    repository
                  </a>
                  . It is not yet published to npm.
                </p>
                <p>
                  <a href="/developers/payment-review-api.json">
                    OpenAPI specification ↓
                  </a>
                </p>
                <h3>Safe retries</h3>
                <p>
                  Reuse the request ID with identical input after a timeout. A
                  changed payload returns 409. An in-progress run returns 202.
                  It does not silently start another run.
                </p>
                <h3>Evidence boundary</h3>
                <p>
                  A match applies to the invoice you supplied. It does not prove
                  all invoices were supplied, allocate a payment across accounts
                  or book a settlement. The JSON includes all findings and
                  evidence at every tier.
                </p>
              </section>
            )}
            {tab === "plans" && (
              <section>
                <p className="eyebrow">05 / CAPACITY</p>
                <h2>Pay for the workflow.</h2>
                <p>
                  Same checks. Same full evidence. Higher tiers add processing
                  capacity and existing NOSHASHI software tools. Prices below
                  are existing software prices.
                </p>
                <div className="plans">
                  {[
                    {
                      name: "Free",
                      price: "$0",
                      rows: "25 records / month",
                      batch: "5 rows / request",
                    },
                    {
                      name: "Pro",
                      price: "$749 / seat / month",
                      rows: "5,000 records / month",
                      batch: "25 rows / request",
                    },
                    {
                      name: "Institutional",
                      price: "$4,000 / month",
                      rows: "100,000 records / month",
                      batch: "25 rows / request · contract required",
                    },
                  ].map((p) => (
                    <article key={p.name}>
                      <h3>{p.name}</h3>
                      <p className="price">{p.price}</p>
                      <p>
                        {p.rows}
                        <br />
                        {p.batch}
                      </p>
                      {p.name === "Pro" ? (
                        <button
                          disabled={!signedIn || busy || !usage}
                          onClick={() => void openBilling("checkout")}
                        >
                          Continue to Stripe
                        </button>
                      ) : p.name === "Institutional" ? (
                        <a
                          className="button"
                          href="/contact/?topic=institutions"
                        >
                          Discuss team scope
                        </a>
                      ) : (
                        <span>No card needed</span>
                      )}
                    </article>
                  ))}
                </div>
                <p>
                  Pro annual prepay: $7,490 per seat.{" "}
                  <button
                    disabled={!signedIn || busy || !usage}
                    onClick={() => void openBilling("checkout", "annual")}
                  >
                    Choose annual
                  </button>
                </p>
                <button
                  disabled={!signedIn || busy}
                  onClick={() => void openBilling("portal")}
                >
                  Manage existing billing
                </button>
                <p className="fine">
                  Stripe confirms payments by webhook. Returning from checkout
                  does not unlock a tier.{" "}
                  <button
                    disabled={!signedIn || busy}
                    onClick={() => void act(refresh)}
                  >
                    Refresh plan status
                  </button>
                </p>
                <h3>Need a reviewed service?</h3>
                <p>
                  A founder-led pilot is separate from software: proposed
                  $3,000–$5,000 once; recurring review proposed $5,000–$7,500
                  monthly. Scope, timing and price must be agreed first. No
                  automatic purchase or delivery promise.
                </p>
                <p className="fine">
                  No SSO, uptime guarantee, dedicated environment or independent
                  security certification is included. See{" "}
                  <a href="/pricing/">all software plans</a> and{" "}
                  <a href="/trust/">trust limits</a>.
                </p>
              </section>
            )}
          </div>
        </div>
      </main>
      <footer>
        <span>NOSHASHI / READ-ONLY XRPL INTELLIGENCE</span>
        <a href="/trust/">Trust & privacy</a>
        <a href="/contact/?topic=institutions">Discuss a pilot</a>
      </footer>
    </>
  );
}
