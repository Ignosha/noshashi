import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { terminalApi } from "./client";
import {
  TERMINAL_PLANS,
  type TerminalAccess,
  terminalFeatures,
} from "../../supabase/functions/_shared/terminalPlans";
type Access = {
  access: TerminalAccess;
  features: ReturnType<typeof terminalFeatures>;
};
type Item = {
  id: string;
  created_at: string;
  mode: string;
  subject: Record<string, string>;
};
type Org = {
  organization_id: string;
  role: string;
  organizations: { name: string } | null;
};
export function Account() {
  const auth = useAuth();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [otp, setOtp] = useState(""),
    [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false),
    [scope, setScope] = useState(""),
    [access, setAccess] = useState<Access | null>(null),
    [orgs, setOrgs] = useState<Org[]>([]),
    [items, setItems] = useState<Item[]>([]),
    [detail, setDetail] = useState<unknown>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const controllers = useRef(new Set<AbortController>()),
    generation = useRef(0),
    saveKey = useRef<{ input: string; key: string } | null>(null);
  const identity = auth.user?.id ?? "";
  const lastIdentity = useRef(identity);
  const clear = useCallback(() => {
    generation.current++;
    controllers.current.forEach((c) => c.abort());
    controllers.current.clear();
    setAccess(null);
    setItems([]);
    setDetail(null);
    saveKey.current = null;
    setBusy(false);
    setMessage("");
  }, []);
  useEffect(() => {
    clear();
    setScope("");
    setOrgs([]);
    setPassword("");
    setOtp("");
    setCode("");
    if (lastIdentity.current !== identity) {
      lastIdentity.current = identity;
      document
        .querySelector(".ct-desktop")
        ?.dispatchEvent(new Event("ct:account-changed"));
    }
  }, [identity, clear]);
  const request = useCallback(
    async <T,>(path: string, method = "GET", body?: unknown, key?: string) => {
      const controller = new AbortController();
      controllers.current.add(controller);
      const timeout = setTimeout(() => controller.abort(), 35000);
      try {
        return await terminalApi<T>(path, controller.signal, method, body, key);
      } finally {
        clearTimeout(timeout);
        controllers.current.delete(controller);
      }
    },
    [],
  );
  const suffix = scope ? "?organization_id=" + encodeURIComponent(scope) : "";
  const refresh = useCallback(async () => {
    const run = ++generation.current;
    setBusy(false);
    setAccess(null);
    setItems([]);
    setDetail(null);
    if (!identity || auth.mfaRequired || auth.loading) return;
    try {
      const result = await request<Access>("access" + suffix);
      if (run !== generation.current) return;
      setAccess(result);
      setMessage("Access checked against your current account records.");
      if (result.features.personal_cases || result.features.team_cases) {
        const archive = await request<{ cases: Item[] }>("cases" + suffix);
        if (run === generation.current) setItems(archive.cases);
      }
    } catch (e) {
      if (run === generation.current) {
        setAccess(null);
        setMessage(e instanceof Error ? e.message : "Access unavailable.");
      }
    }
  }, [identity, auth.mfaRequired, auth.loading, request, suffix]);
  useEffect(() => {
    clear();
    void refresh();
    return () => {
      generation.current++;
      controllers.current.forEach((c) => c.abort());
      controllers.current.clear();
    };
  }, [refresh, clear]);
  useEffect(() => {
    if (!identity || auth.mfaRequired || auth.loading) return;
    let active = true;
    void request<{ organizations: Org[] }>("organizations")
      .then((v) => {
        if (active) setOrgs(v.organizations);
      })
      .catch(() => {
        if (active) setOrgs([]);
      });
    return () => {
      active = false;
    };
  }, [identity, auth.mfaRequired, auth.loading, request, scope]);
  useEffect(() => {
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  useEffect(() => {
    if (!access?.access.valid_until) return;
    const delay = Math.max(
      1,
      Math.min(2147483647, Date.parse(access.access.valid_until) - Date.now()),
    );
    const t = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(t);
  }, [access, refresh]);
  async function action(task: () => Promise<void>) {
    const run = generation.current;
    setBusy(true);
    setMessage("Working…");
    try {
      await task();
    } catch (e) {
      if (run === generation.current)
        setMessage(e instanceof Error ? e.message : "Operation unavailable.");
    } finally {
      if (run === generation.current) setBusy(false);
    }
  }
  const allowed =
      !!access &&
      (access.features.personal_cases || access.features.team_cases),
    write =
      !!access &&
      (access.features.personal_cases || access.features.team_write);
  async function save() {
    const root = document.querySelector(".ct-desktop");
    const mode = root?.getAttribute("data-reading-mode") ?? "issuer";
    const value = (id: string) =>
      (document.getElementById(id) as HTMLInputElement)?.value.trim();
    const input =
      mode === "payment"
        ? { mode, hash: value("ct-hash") }
        : {
            mode: "issuer",
            issuer: value("ct-account"),
            currency: value("ct-currency"),
          };
    const serialized = JSON.stringify({ scope, input });
    if (saveKey.current?.input !== serialized)
      saveKey.current = { input: serialized, key: crypto.randomUUID() };
    const run = generation.current;
    await request<{ id: string }>(
      "cases" + suffix,
      "POST",
      input,
      saveKey.current.key,
    );
    if (run !== generation.current) return;
    saveKey.current = null;
    await refresh();
  }
  const plan = access ? TERMINAL_PLANS[access.access.tier].name : "UNVERIFIED";
  useEffect(() => {
    const badge = document.getElementById("ws-account-label");
    if (badge) badge.textContent = !identity ? "Account / sign in" : plan;
  }, [identity, plan]);
  return (
    <div className="ta-account">
      <p className="ct-label">ACCOUNT / LICENSED WORKSPACE</p>
      <h2>{identity ? "Your terminal access" : "Sign in to NOSHASHI"}</h2>
      <p>
        Public issuer and payment lookups remain free. Private archives require
        active paid access. No wallet or keys are needed.
      </p>
      {auth.loading ? (
        <p role="status">Restoring your account…</p>
      ) : !identity ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await auth.signIn(email, password);
                setPassword("");
              });
            }}
          >
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button disabled={busy}>Sign in</button>
          </form>
          <div className="ta-actions">
            <button
              disabled={busy || !email}
              onClick={() =>
                void action(async () => {
                  await auth.signInWithOtp(email);
                  setOtpSent(true);
                  setMessage("Code requested. Check your email.");
                })
              }
            >
              Email me a sign-in code
            </button>
            <a href="/developers/portal/">
              Create an account / manage billing →
            </a>
          </div>
          {otpSent && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await auth.verifyOtp(email, otp);
                  setOtp("");
                });
              }}
            >
              <label>
                Email code
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
              </label>
              <button disabled={busy}>Verify email code</button>
            </form>
          )}
        </>
      ) : (
        <>
          <p className="ta-identity">{auth.user?.email}</p>
          <div className="ta-actions">
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  clear();
                  await auth.signOut();
                })
              }
            >
              Sign out
            </button>
            <button disabled={busy} onClick={() => void refresh()}>
              Refresh access
            </button>
          </div>
          {auth.mfaRequired ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  const factor = auth.factors.find(
                    (f) => f.status === "verified",
                  );
                  if (!factor)
                    throw new Error(
                      "Use your account security page to recover the second factor.",
                    );
                  await auth.challengeTotp(factor.id, code);
                  setCode("");
                });
              }}
            >
              <label>
                Authenticator code
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <button disabled={busy}>Verify second factor</button>
            </form>
          ) : (
            <>
              <label htmlFor="ta-workspace">Workspace</label>
              <select
                id="ta-workspace"
                value={scope}
                onChange={(e) => {
                  clear();
                  setScope(e.target.value);
                }}
              >
                <option value="">Personal</option>
                {orgs.map((o) => (
                  <option key={o.organization_id} value={o.organization_id}>
                    {o.organizations?.name ?? "Organization"} · {o.role}
                  </option>
                ))}
              </select>
              <dl className="ta-status">
                <div>
                  <dt>Verified tier</dt>
                  <dd>{plan}</dd>
                </div>
                <div>
                  <dt>Authorization</dt>
                  <dd>{access?.access.source ?? "Not checked"}</dd>
                </div>
                <div>
                  <dt>Valid through</dt>
                  <dd>
                    {access?.access.valid_until
                      ? new Date(access.access.valid_until).toLocaleString()
                      : "—"}
                  </dd>
                </div>
              </dl>
              <table>
                <caption>Access in this workspace</caption>
                <thead>
                  <tr>
                    <th>Capability</th>
                    <th>Requirement</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Public ledger research</td>
                    <td>Free</td>
                    <td>Available</td>
                  </tr>
                  <tr>
                    <td>Personal evidence archive</td>
                    <td>Pro or higher · personal scope</td>
                    <td>
                      {access?.features.personal_cases
                        ? "Available"
                        : "Locked in this scope"}
                    </td>
                  </tr>
                  <tr>
                    <td>Shared organization archive</td>
                    <td>Institutional+ · assigned paid contract</td>
                    <td>
                      {access?.features.team_cases ? "Available" : "Locked"}
                    </td>
                  </tr>
                </tbody>
              </table>
              {!allowed && (
                <p>
                  Pro does not unlock Institutional.{" "}
                  <a href="/developers/portal/">Manage Pro subscription</a> ·{" "}
                  <a href="/contact/?topic=institutions">
                    Discuss an Institutional contract
                  </a>
                  . No purchase happens on this screen.
                </p>
              )}
              <h3>Private evidence archive</h3>
              <p>
                Save a fresh server reading using the identifiers in the issuer
                or payment tab. Only public XRPL evidence is stored. Archived
                cases are historical, not current monitoring.
              </p>
              <button
                disabled={!write || busy}
                onClick={() => void action(save)}
              >
                Save selected lookup
              </button>
              {access?.features.team_cases && !access.features.team_write && (
                <p>Your organization role permits reading only.</p>
              )}
              {allowed && (
                <>
                  <p>
                    Latest 30 cases · beta archive limits: 100 personal / 500
                    shared; six saves per minute.
                  </p>
                  <ul className="ta-cases">
                    {items.map((item) => (
                      <li key={item.id}>
                        <span>
                          {item.mode} ·{" "}
                          {new Date(item.created_at).toLocaleString()}
                        </span>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              const run = generation.current;
                              const d = await request(
                                "cases/" + item.id + suffix,
                              );
                              if (run === generation.current) setDetail(d);
                            })
                          }
                        >
                          Open case {item.id.slice(0, 8)}
                        </button>
                        <button
                          disabled={
                            busy ||
                            (!!scope &&
                              !["owner", "admin"].includes(
                                access?.access.role ?? "",
                              ))
                          }
                          onClick={() => {
                            if (window.confirm("Delete this archived case?"))
                              void action(async () => {
                                await request(
                                  "cases/" + item.id + suffix,
                                  "DELETE",
                                );
                                await refresh();
                              });
                          }}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                  {!items.length && <p>No archived cases in this workspace.</p>}
                </>
              )}
              {detail !== null && (
                <section aria-label="Historical case">
                  <h3>HISTORICAL / SAVED EVIDENCE</h3>
                  <p>
                    This is a past public-node snapshot, not an independent
                    consensus proof or signed attestation.
                  </p>
                  <pre tabIndex={0}>{JSON.stringify(detail, null, 2)}</pre>
                  <button onClick={() => setDetail(null)}>Close record</button>
                </section>
              )}
            </>
          )}
        </>
      )}
      <p className="ta-message" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
